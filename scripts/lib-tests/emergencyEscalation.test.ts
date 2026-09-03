import { describe, it, expect } from 'vitest';
import {
  reachedStage,
  stagesToFire,
  minutesLate,
  minutesToNextStage,
  isSettled,
  escalationClockFrom,
  describeLateness,
  ESCALATION_STAGES,
} from '../../src/lib/emergencyEscalation';
import {
  stage1Message,
  stage2Message,
  cmdMessage,
  committeeInvitation,
  committeeInvitationWhatsApp,
} from '../../src/lib/emergencyEscalationMessages';

/**
 * The theatre's rule is that a booked emergency starts within the hour. What
 * happened instead was that cases were booked, the hour passed, and nobody
 * recorded why — a case could sit for an afternoon with no name against the
 * delay and no trail afterwards.
 *
 * This ladder chases it. Because it ends in people being called before a
 * committee, when each rung fires has to be exact.
 */
const due = new Date('2026-09-03T10:00:00Z');
const at = (mins: number) => new Date(due.getTime() + mins * 60_000);
const base = { requiredByTime: due, requestedAt: due, status: 'SUBMITTED' };

describe('when each rung is reached', () => {
  it('does nothing before the hour is up', () => {
    expect(reachedStage(base, at(0))).toBe(0);
    expect(reachedStage(base, at(59))).toBe(0);
  });

  it('reaches stage 1 exactly on the hour', () => {
    expect(reachedStage(base, at(60))).toBe(1);
    expect(reachedStage(base, at(119))).toBe(1);
  });

  it('reaches stage 2 at two hours, and stage 3 at three', () => {
    expect(reachedStage(base, at(120))).toBe(2);
    expect(reachedStage(base, at(179))).toBe(2);
    expect(reachedStage(base, at(180))).toBe(3);
  });

  it('goes no higher than three, however late', () => {
    expect(reachedStage(base, at(60 * 24))).toBe(3);
  });
});

describe('a case that has stopped waiting', () => {
  it('is not chased once it has started', () => {
    expect(reachedStage({ ...base, status: 'IN_PROGRESS' }, at(300))).toBe(0);
    expect(reachedStage({ ...base, actualStartTime: at(30) }, at(300))).toBe(0);
  });

  it('is not chased once completed or cancelled', () => {
    expect(reachedStage({ ...base, status: 'COMPLETED' }, at(300))).toBe(0);
    expect(reachedStage({ ...base, status: 'CANCELLED' }, at(300))).toBe(0);
    expect(isSettled({ status: 'CANCELLED' })).toBe(true);
  });

  it('IS chased while merely approved or assigned a theatre', () => {
    // Assigning a theatre is not starting the operation.
    expect(reachedStage({ ...base, status: 'APPROVED' }, at(60))).toBe(1);
    expect(reachedStage({ ...base, status: 'THEATRE_ASSIGNED' }, at(60))).toBe(1);
  });
});

describe('each rung fires once', () => {
  it('fires only what has not fired before', () => {
    expect(stagesToFire(base, at(60))).toEqual([1]);
    expect(stagesToFire({ ...base, stageAlreadyFired: 1 }, at(60))).toEqual([]);
    expect(stagesToFire({ ...base, stageAlreadyFired: 1 }, at(120))).toEqual([2]);
    expect(stagesToFire({ ...base, stageAlreadyFired: 3 }, at(600))).toEqual([]);
  });

  it('records every rung passed when a case is found late', () => {
    // A case first looked at four hours late must still show that it passed one
    // and two. The trail has to show the ladder, not only its top — and a
    // system that was itself asleep must not hand out a gentler outcome.
    expect(stagesToFire(base, at(240))).toEqual([1, 2, 3]);
    expect(stagesToFire({ ...base, stageAlreadyFired: 1 }, at(240))).toEqual([2, 3]);
  });
});

describe('the clock it runs on', () => {
  it('is the time the case was due to start', () => {
    expect(escalationClockFrom(base)?.toISOString()).toBe(due.toISOString());
    expect(minutesLate(base, at(90))).toBe(90);
  });

  it('falls back to when it was raised if no start time was set', () => {
    // Otherwise leaving the time blank is the way to avoid ever being asked.
    const noTime = { requiredByTime: null, requestedAt: due, status: 'SUBMITTED' };
    expect(reachedStage(noTime, at(60))).toBe(1);
  });

  it('counts down to the next rung', () => {
    expect(minutesToNextStage(base, at(10))).toBe(50);
    expect(minutesToNextStage(base, at(60))).toBe(60);
    expect(minutesToNextStage(base, at(200))).toBeNull(); // nothing above stage 3
  });

  it('reads the delay the way a person would say it', () => {
    expect(describeLateness(45)).toBe('45 minutes late');
    expect(describeLateness(60)).toBe('1 hour late');
    expect(describeLateness(120)).toBe('2 hours late');
    expect(describeLateness(135)).toBe('2 h 15 m late');
  });
});

describe('the messages people actually receive', () => {
  const person = { userId: 'u1', name: 'Sister Okeke', roleOnCase: 'Scrub Nurse' };
  const facts = {
    patientName: 'Eze Chidi',
    folderNumber: 'F/1234',
    procedureName: 'Exploratory laparotomy',
    theatreName: 'Suite 2',
    dueAt: due,
    minutesLate: 75,
  };

  it('names the person and their part in THIS case', () => {
    // A broadcast gets read as spam and answered by nobody.
    const m = stage1Message(person, facts);
    expect(m.body).toContain('Sister Okeke');
    expect(m.body).toContain('Scrub Nurse');
    expect(m.body).toContain('Eze Chidi');
    expect(m.body).toContain('Exploratory laparotomy');
  });

  it('says plainly when nobody has given a reason', () => {
    expect(stage2Message(person, facts).body).toContain('No reason has been recorded');
    expect(cmdMessage(facts, [person]).body).toContain('No reason has been recorded');
  });

  it('carries the reason forward once one exists', () => {
    const withReason = { ...facts, reasonGiven: 'No anaesthetist available' };
    expect(stage2Message(person, withReason).body).toContain('No anaesthetist available');
    expect(cmdMessage(withReason, [person]).body).toContain('No anaesthetist available');
  });

  it('lists the whole team for the CMD', () => {
    const body = cmdMessage(facts, [person, { userId: 'u2', name: 'Dr Nnaji', roleOnCase: 'Surgeon' }]).body;
    expect(body).toContain('Sister Okeke (Scrub Nurse)');
    expect(body).toContain('Dr Nnaji (Surgeon)');
  });

  it('does not invent a committee date before one is given', () => {
    expect(committeeInvitation(person, facts)).toContain('will be given to you when this is sent');
    const withDate = committeeInvitation(person, facts, new Date('2026-09-05T09:00:00Z'));
    expect(withDate).toContain('05 Sep');
    expect(withDate).not.toContain('will be given to you when this is sent');
  });

  it('has a WhatsApp form short enough to send', () => {
    const short = committeeInvitationWhatsApp(person, facts, new Date('2026-09-05T09:00:00Z'));
    expect(short).toContain('Sister Okeke');
    expect(short).toContain('Scrub Nurse');
    expect(short.length).toBeLessThan(500);
  });
});

describe('the ladder itself', () => {
  it('is one, two and three hours', () => {
    expect(ESCALATION_STAGES.map((s) => s.afterMinutes)).toEqual([60, 120, 180]);
  });
});
