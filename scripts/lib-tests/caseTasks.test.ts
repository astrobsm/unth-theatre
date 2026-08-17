import { describe, it, expect } from 'vitest';
import { caseTasksFor, roleOnCase, personalCaseTasks, CaseForTasks } from '../../src/lib/dashboard/caseTasks';

const NOW = new Date('2026-08-18T08:00:00.000Z');

const surgery = (over: Partial<CaseForTasks> = {}): CaseForTasks => ({
  id: 's1',
  procedureName: 'Subtotal thyroidectomy',
  scheduledDate: '2026-08-18T00:00:00.000Z',
  scheduledTime: '09:00',
  status: 'SCHEDULED',
  surgeonId: 'surgeon-1',
  anesthetistId: 'anaes-1',
  scrubNurseId: 'scrub-1',
  theatreTechnicianId: 'tech-1',
  supervisingConsultantId: null,
  theatreId: 'theatre-2',
  consentFileData: 'base64…',
  consentFormData: null,
  preopOutstanding: null,
  patientName: 'Nwoke Ngozi',
  folderNumber: '0294817',
  ...over,
});

describe('nobody gets tasks for a case they are not on', () => {
  it('returns nothing for an unrelated user', () => {
    expect(caseTasksFor(surgery(), 'somebody-else', NOW)).toHaveLength(0);
  });

  it('identifies each role correctly', () => {
    expect(roleOnCase(surgery(), 'surgeon-1')).toBe('SURGEON');
    expect(roleOnCase(surgery(), 'anaes-1')).toBe('ANAESTHETIST');
    expect(roleOnCase(surgery(), 'scrub-1')).toBe('SCRUB_NURSE');
    expect(roleOnCase(surgery(), 'tech-1')).toBe('TECHNICIAN');
    expect(roleOnCase(surgery(), 'nobody')).toBeNull();
  });
});

describe('a case in order produces NOTHING', () => {
  // The bug this module exists for. The first board listed every case a
  // surgeon's name touched, so a screen of "surgery in 24 min" buried the one
  // item that mattered.
  it('gives the surgeon nothing when consent and pre-op are complete', () => {
    expect(caseTasksFor(surgery(), 'surgeon-1', NOW)).toHaveLength(0);
  });

  it('gives the scrub nurse nothing when a theatre is assigned and it is not yet due', () => {
    const early = new Date('2026-08-18T04:00:00.000Z');  // five hours before
    expect(caseTasksFor(surgery(), 'scrub-1', early)).toHaveLength(0);
  });

  it('gives nobody anything once the case is completed', () => {
    const done = surgery({ status: 'COMPLETED', consentFileData: null, theatreId: null });
    for (const who of ['surgeon-1', 'anaes-1', 'scrub-1', 'tech-1']) {
      expect(caseTasksFor(done, who, NOW)).toHaveLength(0);
    }
  });

  it('gives nobody anything once the case is cancelled', () => {
    const off = surgery({ status: 'CANCELLED', consentFileData: null });
    expect(caseTasksFor(off, 'surgeon-1', NOW)).toHaveLength(0);
  });
});

describe('the surgeon owns the booking', () => {
  it('flags missing consent', () => {
    const [task] = caseTasksFor(surgery({ consentFileData: null }), 'surgeon-1', NOW);
    expect(task.title).toMatch(/consent not recorded/i);
    expect(task.detail).toContain('Nwoke Ngozi');
    expect(task.detail).toContain('0294817');
  });

  it('accepts the structured consent form as consent', () => {
    const s = surgery({ consentFileData: null, consentFormData: '{"signed":true}' });
    expect(caseTasksFor(s, 'surgeon-1', NOW)).toHaveLength(0);
  });

  it('names what is outstanding pre-operatively rather than saying "incomplete"', () => {
    const s = surgery({ preopOutstanding: 'Haemoglobin older than 48 hours' });
    const [task] = caseTasksFor(s, 'surgeon-1', NOW);
    expect(task.detail).toContain('Haemoglobin older than 48 hours');
  });

  it('flags a case that is past its time and has not started', () => {
    const late = new Date('2026-08-18T11:00:00.000Z');   // two hours after 09:00
    const tasks = caseTasksFor(surgery(), 'surgeon-1', late);
    expect(tasks.some((t) => /overdue/i.test(t.title))).toBe(true);
    expect(tasks.every((t) => t.severity === 'CRITICAL')).toBe(true);
  });

  it('does not call a case overdue once it is under way', () => {
    const late = new Date('2026-08-18T11:00:00.000Z');
    const running = surgery({ status: 'IN_PROGRESS' });
    expect(caseTasksFor(running, 'surgeon-1', late)).toHaveLength(0);
  });

  it('does NOT give the surgeon the scrub nurse’s work', () => {
    const s = surgery({ theatreId: null });
    const tasks = caseTasksFor(s, 'surgeon-1', NOW);
    expect(tasks.some((t) => /theatre/i.test(t.title))).toBe(false);
  });
});

describe('the scrub nurse and the technician', () => {
  it('tells the scrub nurse when no theatre is allocated', () => {
    const [task] = caseTasksFor(surgery({ theatreId: null }), 'scrub-1', NOW);
    expect(task.title).toMatch(/no theatre assigned/i);
    expect(task.detail).toMatch(/porter/i);
  });

  it('asks the scrub nurse to receive the patient when the case is imminent', () => {
    const tasks = caseTasksFor(surgery(), 'scrub-1', NOW);   // 09:00, one hour away
    expect(tasks.some((t) => /receive/i.test(t.title))).toBe(true);
  });

  it('asks the technician to confirm setup, not to receive the patient', () => {
    const tasks = caseTasksFor(surgery(), 'tech-1', NOW);
    expect(tasks.some((t) => /setup/i.test(t.title))).toBe(true);
    expect(tasks.some((t) => /receive/i.test(t.title))).toBe(false);
  });

  it('tells the technician to escalate rather than to set up a theatre that does not exist', () => {
    const [task] = caseTasksFor(surgery({ theatreId: null }), 'tech-1', NOW);
    expect(task.detail).toMatch(/theatre manager/i);
  });
});

describe('the anaesthetist', () => {
  it('is asked to review, prescribe and record consumables when the case is near', () => {
    const [task] = caseTasksFor(surgery(), 'anaes-1', NOW);
    expect(task.title).toMatch(/review/i);
    expect(task.detail).toMatch(/consumables/i);
  });

  it('is not asked to review a case that is still hours away', () => {
    const early = new Date('2026-08-18T03:00:00.000Z');
    expect(caseTasksFor(surgery(), 'anaes-1', early)).toHaveLength(0);
  });
});

describe('urgency uses the scheduled TIME, not midnight', () => {
  it('does not report the whole morning list as overdue', () => {
    // scheduledDate is midnight; measuring from it would make a 09:00 case look
    // eight hours late at 08:00.
    const tasks = caseTasksFor(surgery(), 'surgeon-1', NOW);
    expect(tasks.some((t) => /overdue/i.test(t.title))).toBe(false);
  });
});

describe('personalCaseTasks', () => {
  it('collects across cases and skips the ones in order', () => {
    const tasks = personalCaseTasks(
      [surgery({ id: 'a' }), surgery({ id: 'b', consentFileData: null })],
      'surgeon-1', NOW,
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toContain('b');
  });

  it('is empty when nothing needs anybody', () => {
    expect(personalCaseTasks([surgery()], 'surgeon-1', NOW)).toHaveLength(0);
  });
});

describe('an unallocated theatre is not a fault until the case is close', () => {
  // Theatre is no longer chosen when the case is booked. The theatre manager
  // and the nurses allocate it through the team assignment nearer the day, so
  // "no theatre" is the normal state of a freshly booked case rather than
  // something anybody has failed to do.
  const unallocated = () => surgery({ theatreId: null });

  // 08:00 against a 09:00 case is one hour away — inside the two-hour window.
  const EARLY = new Date('2026-08-18T05:30:00.000Z'); // 3.5 hours before

  it('says nothing to the scrub nurse hours ahead', () => {
    const tasks = caseTasksFor(unallocated(), 'scrub-1', EARLY);
    expect(tasks.map((t) => t.id)).not.toContain('s1:no-theatre');
  });

  it('says nothing to the technician hours ahead', () => {
    const tasks = caseTasksFor(unallocated(), 'tech-1', EARLY);
    expect(tasks.map((t) => t.id)).not.toContain('s1:tech-no-theatre');
  });

  it('raises it for the scrub nurse once the case is imminent', () => {
    const tasks = caseTasksFor(unallocated(), 'scrub-1', NOW);
    expect(tasks.map((t) => t.id)).toContain('s1:no-theatre');
  });

  it('raises it for the technician once the case is imminent', () => {
    const tasks = caseTasksFor(unallocated(), 'tech-1', NOW);
    expect(tasks.map((t) => t.id)).toContain('s1:tech-no-theatre');
  });

  it('is critical once the case is already past its time', () => {
    const late = new Date('2026-08-18T10:00:00.000Z'); // an hour after 09:00
    const tasks = caseTasksFor(unallocated(), 'scrub-1', late);
    const t = tasks.find((x) => x.id === 's1:no-theatre');
    expect(t?.severity).toBe('CRITICAL');
  });

  it('does not ask the technician to confirm setup for a room that does not exist', () => {
    // The two are mutually exclusive: with no theatre there is nothing to
    // prepare, and the escalation replaces the setup task rather than joining
    // it.
    const tasks = caseTasksFor(unallocated(), 'tech-1', NOW).map((t) => t.id);
    expect(tasks).toContain('s1:tech-no-theatre');
    expect(tasks).not.toContain('s1:setup');
  });
});
