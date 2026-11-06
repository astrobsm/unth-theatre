/**
 * Chasing the whole emergency team against the one-hour rule.
 *
 * Asked for on 6 November:
 *
 *   "add a functionality to chase all the team in emergency reminding them
 *    of the rule that any emergency booked must be started within an hour,
 *    chase everyone on the list, from surgeon to the anaesthetist etc,
 *    anaesthetist must review and indicate the review on the app and every
 *    team member must indicate availability"
 *
 * and, a few minutes later:
 *
 *   "remind the bookers and the team members that booking emergency without
 *    getting them done within an hour or reporting a blocker to the surgery
 *    within an hour is an indictment, let it have a legal tone"
 *
 * The ways this can go wrong, worst first:
 *
 *   THE DEADLINE COMPUTED WRONG. Everything else is wording; this is the
 *   fact a formal notice asserts about a named consultant. A deadline an
 *   hour out either excuses a real breach or accuses somebody who complied.
 *   The rule is the EARLIER of booking + 60 and the surgeon's required-by,
 *   and a required-by written in the past is not a deadline at all.
 *
 *   A CASE BORN OVERDUE. Real bookings carry a required-by earlier than the
 *   booking itself — a case being recorded hours after it was first dealt
 *   with. Read literally, every one of those is instantly in breach, and a
 *   board where everything is red is a board nobody reads.
 *
 *   ONE PERSON CHASED TWICE. The booking surgeon is usually also the
 *   consultant on call, and the named anaesthetist is usually the rostered
 *   one. Two formal notices to one phone about one patient discredits both.
 *
 *   A NOTICE THAT THREATENS WHAT THE SYSTEM CANNOT DO. Every consequence
 *   named must be one that already runs: asked by name at one hour, CMD at
 *   two, audit committee invitation at three.
 *
 * No real patient is named here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  HOUR_RULE_NOTICE,
  HOUR_RULE_NOTICE_PLAIN,
  START_WITHIN_MINUTES,
  deadlineClock,
  hourRuleStanding,
  isSettled,
  startByDeadline,
} from '../../src/lib/emergency/hourRule';
import {
  ROLE_DUTY,
  buildRollCall,
  buildTeamChaseMessage,
  chaseNotificationLine,
  isRespondable,
  summariseRollCall,
  type RollCallMember,
  type TeamSlotInput,
} from '../../src/lib/emergency/teamChase';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

const BOOKED = '2026-11-06T08:00:00Z';

// ---------------------------------------------------------------------------

describe('the hour', () => {
  it('is one hour from the booking when nothing else is said', () => {
    expect(START_WITHIN_MINUTES).toBe(60);
    const d = startByDeadline({ requestedAt: BOOKED });
    expect(d?.toISOString()).toBe('2026-11-06T09:00:00.000Z');
  });

  it('takes the surgeon’s time when it is sooner than the hour', () => {
    const d = startByDeadline({
      requestedAt: BOOKED, requiredByTime: '2026-11-06T08:30:00Z',
    });
    expect(d?.toISOString()).toBe('2026-11-06T08:30:00.000Z');
  });

  it('does NOT take the surgeon’s time when it is later than the hour', () => {
    // "Required by 16:00" written against an emergency booked at 08:00 would
    // otherwise excuse eight hours of waiting, which is the practice the
    // rule exists to end.
    const d = startByDeadline({
      requestedAt: BOOKED, requiredByTime: '2026-11-06T16:00:00Z',
    });
    expect(d?.toISOString()).toBe('2026-11-06T09:00:00.000Z');
  });

  it('ignores a required-by that is earlier than the booking itself', () => {
    // A case raised at 17:00 and marked required-by 10:00 the same morning
    // is somebody recording a case they have been dealing with since ten.
    const d = startByDeadline({
      requestedAt: '2026-11-06T17:00:00Z', requiredByTime: '2026-11-06T10:00:00Z',
    });
    expect(d?.toISOString()).toBe('2026-11-06T18:00:00.000Z');
  });

  it('says how long is left, in words', () => {
    const s = hourRuleStanding({ requestedAt: BOOKED }, new Date('2026-11-06T08:37:00Z'));
    expect(s.overdue).toBe(false);
    expect(s.minutesRemaining).toBe(23);
    expect(s.label).toBe('23 minutes left to start');
  });

  it('says how far past it is, in words', () => {
    const s = hourRuleStanding({ requestedAt: BOOKED }, new Date('2026-11-06T10:41:00Z'));
    expect(s.overdue).toBe(true);
    expect(s.label).toBe('1 h 41 m past the start-by time');
  });

  it('stops counting once the case has started', () => {
    const s = hourRuleStanding(
      { requestedAt: BOOKED, actualStartTime: '2026-11-06T08:50:00Z' },
      new Date('2026-11-06T12:00:00Z'),
    );
    expect(s.settled).toBe(true);
    expect(s.overdue).toBe(false);
  });

  it('treats a cancelled or completed case as settled', () => {
    expect(isSettled({ status: 'CANCELLED' })).toBe(true);
    expect(isSettled({ status: 'COMPLETED' })).toBe(true);
    expect(isSettled({ status: 'SUBMITTED' })).toBe(false);
  });

  it('marks when the deadline came from the surgeon rather than the hour', () => {
    const s = hourRuleStanding(
      { requestedAt: BOOKED, requiredByTime: '2026-11-06T08:30:00Z' },
      new Date('2026-11-06T08:10:00Z'),
    );
    expect(s.setByRequiredBy).toBe(true);
    const plain = hourRuleStanding({ requestedAt: BOOKED }, new Date('2026-11-06T08:10:00Z'));
    expect(plain.setByRequiredBy).toBe(false);
  });

  it('shows the deadline as a WAT clock time', () => {
    // 09:00 UTC is 10:00 in Lagos, and the theatre reads Lagos.
    expect(deadlineClock(new Date('2026-11-06T09:00:00Z'))).toBe('10:00');
  });
});

// ---------------------------------------------------------------------------

const slot = (over: Partial<TeamSlotInput> = {}): TeamSlotInput => ({
  label: 'Surgeon who booked this case',
  teamRole: 'SURGEON',
  source: 'case',
  person: { userId: 'u1', name: 'Mr A', phoneNumber: '08030000001' },
  ...over,
});

describe('the roll call', () => {
  it('chases one person once, under the role closest to the case', () => {
    const members = buildRollCall(
      [
        slot(),
        slot({ label: 'Anaesthetist (1st on call)', teamRole: 'ANAESTHETIST', source: 'roster' }),
      ],
      [], [],
    );
    expect(members).toHaveLength(1);
    expect(members[0].roleOnCase).toBe('Surgeon who booked this case');
  });

  it('skips a slot nobody fills', () => {
    const members = buildRollCall([slot(), slot({ person: null })], [], []);
    expect(members).toHaveLength(1);
  });

  it('attaches what each person has already answered', () => {
    const members = buildRollCall(
      [slot()],
      [{ userId: 'u1', status: 'EN_ROUTE', respondedAt: '2026-11-06T08:12:00Z' }],
      [],
    );
    expect(members[0].availability).toBe('EN_ROUTE');
  });

  it('expects the pre-anaesthetic review from anaesthetists, and nobody else', () => {
    const members = buildRollCall(
      [
        slot(),
        slot({
          label: 'Anaesthetist named on the booking', teamRole: 'ANAESTHETIST',
          person: { userId: 'u2', name: 'Dr B', phoneNumber: null },
        }),
      ],
      [], ['u2'],
    );
    expect(members[0].mustReview).toBe(false);
    expect(members[1].mustReview).toBe(true);
    expect(members[1].reviewDone).toBe(true);
  });

  it('does not ask for a tap from the roles the board cannot record one for', () => {
    // CSSD and the theatre manager have no EmergencyTeamRole, so counting
    // them as owing a response would leave the roll call permanently short.
    expect(isRespondable('SCRUB_NURSE')).toBe(true);
    expect(isRespondable(null)).toBe(false);
    const members = buildRollCall(
      [slot({ label: 'CSSD', teamRole: null, source: 'role' })], [], [],
    );
    expect(members[0].mustRespond).toBe(false);
  });

  it('counts who has answered and names who has not', () => {
    const members = buildRollCall(
      [
        slot(),
        slot({ label: 'Scrub Nurse', teamRole: 'SCRUB_NURSE', source: 'roster', person: { userId: 'u3', name: 'Nurse C', phoneNumber: '08030000003' } }),
        slot({ label: 'Porter', teamRole: 'PORTER', source: 'roster', person: { userId: 'u4', name: 'Mr D', phoneNumber: null } }),
      ],
      [{ userId: 'u1', status: 'ARRIVED' }, { userId: 'u4', status: 'UNAVAILABLE' }],
      [],
    );
    const s = summariseRollCall(members);
    expect(s.expected).toBe(3);
    expect(s.responded).toBe(2);
    expect(s.coming).toBe(1);
    expect(s.unavailable).toBe(1);
    expect(s.silent.map((m) => m.name)).toEqual(['Nurse C']);
    expect(s.reachable).toBe(2);
  });

  it('has a duty written for every role it chases', () => {
    ['SURGEON', 'ANAESTHETIST', 'ANAESTHETIC_TECHNICIAN', 'SCRUB_NURSE',
      'CIRCULATING_NURSE', 'RECOVERY_ROOM_NURSE', 'PORTER', 'CLEANER',
      'PHARMACIST', 'BLOODBANK_STAFF', 'BIOMEDICAL_ENGINEER',
    ].forEach((role) => {
      expect(ROLE_DUTY[role], role).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------

describe('the message each person gets', () => {
  const facts = {
    patientName: 'Test Patient',
    folderNumber: 'F-0001',
    procedureName: 'Exploratory laparotomy',
    theatreName: 'Theatre 2',
    surgeonName: 'Mr A',
    chasedByName: 'Theatre Manager',
  };

  const members = buildRollCall(
    [
      slot(),
      slot({
        label: 'Anaesthetist (1st on call)', teamRole: 'ANAESTHETIST', source: 'roster',
        person: { userId: 'u2', name: 'Dr B', phoneNumber: '08030000002' },
      }),
      slot({
        label: 'Scrub Nurse', teamRole: 'SCRUB_NURSE', source: 'roster',
        person: { userId: 'u3', name: 'Nurse C', phoneNumber: null },
      }),
    ],
    [{ userId: 'u1', status: 'EN_ROUTE' }],
    [],
  );
  const summary = summariseRollCall(members);
  const standing = hourRuleStanding(
    { requestedAt: BOOKED }, new Date('2026-11-06T08:40:00Z'),
  );
  const message = (m: RollCallMember, over?: { standing?: typeof standing; note?: string }) =>
    buildTeamChaseMessage({
      member: m, facts, summary,
      standing: over?.standing ?? standing,
      note: over?.note,
    });

  it('addresses the person by name and by their part in this case', () => {
    const text = message(members[2]);
    expect(text).toContain('Nurse C, you are the *Scrub Nurse*');
    expect(text).toContain('Test Patient (F-0001) — Exploratory laparotomy, Theatre 2');
  });

  it('states the time it must be on the table by, and how long is left', () => {
    const text = message(members[0]);
    expect(text).toContain('must be on the table by 10:00');
    expect(text).toContain('20 minutes left to start');
  });

  it('reads differently once the hour has gone', () => {
    const late = hourRuleStanding({ requestedAt: BOOKED }, new Date('2026-11-06T10:00:00Z'));
    const text = message(members[0], { standing: late });
    expect(text).toContain('PAST THE HOUR');
    expect(text).toContain('should have been on the table by 10:00');
  });

  it('tells each person what is wanted from them, not a general plea', () => {
    expect(message(members[0])).toContain('You booked this emergency');
    expect(message(members[2])).toContain('Set up and scrub for this case');
  });

  it('demands the review from an anaesthetist who has not recorded one', () => {
    const text = message(members[1]);
    expect(text).toContain('pre-anaesthetic review for this patient is not on the app');
    expect(text).toContain('trolley does not move');
  });

  it('does not demand a review from an anaesthetist who has recorded one', () => {
    const done = buildRollCall(
      [slot({
        label: 'Anaesthetist (1st on call)', teamRole: 'ANAESTHETIST', source: 'roster',
        person: { userId: 'u2', name: 'Dr B', phoneNumber: '08030000002' },
      })],
      [], ['u2'],
    );
    const text = buildTeamChaseMessage({
      member: done[0], facts, summary: summariseRollCall(done), standing,
    });
    expect(text).not.toContain('not on the app yet');
  });

  it('asks for a tap from anybody who has not given one', () => {
    expect(message(members[2])).toContain('tap one');
    // And acknowledges the person who already answered rather than nagging.
    expect(message(members[0])).toContain('already answered');
  });

  it('says where the team stands and who is silent', () => {
    const text = message(members[0]);
    expect(text).toContain('1 of 3 have answered');
    expect(text).toContain('Nurse C (Scrub Nurse)');
  });

  it('carries the sender’s note when there is one', () => {
    expect(message(members[0], { note: 'Theatre 3 is free now' }))
      .toContain('Theatre 3 is free now');
  });

  it('carries the formal notice, with both ways to comply', () => {
    const text = message(members[0]);
    expect(text).toContain('NOTICE — THEATRE EMERGENCY STANDARD');
    expect(text).toContain('ON THE TABLE WITHIN ONE HOUR OF BOOKING');
    expect(text).toContain('a blocker is recorded on the app within the hour');
    expect(text).toContain('indictment');
  });

  it('names only consequences this system actually carries out', () => {
    // Asked by name at one hour, CMD at two, committee invitation at three —
    // the ladder in emergencyEscalation.ts. A threat the system cannot carry
    // out is found out the first time somebody tests it, and then the real
    // ladder is not believed either.
    expect(HOUR_RULE_NOTICE).toContain('Chief Medical Director');
    expect(HOUR_RULE_NOTICE).toContain('Theatre Audit Committee');
    expect(HOUR_RULE_NOTICE).not.toMatch(/dismiss|suspend|sack|terminate|police|court/i);
  });

  it('tells the booking surgeon that the indictment is theirs first', () => {
    expect(message(members[0])).toContain('This booking is in your name');
    expect(message(members[2])).not.toContain('This booking is in your name');
  });

  it('leaves a defence open to somebody who records a blocker', () => {
    expect(HOUR_RULE_NOTICE).toContain('is defensible');
    expect(HOUR_RULE_NOTICE).toContain('Silence is not');
  });

  it('reads on a screen without WhatsApp’s asterisks', () => {
    expect(HOUR_RULE_NOTICE_PLAIN).not.toContain('*');
    expect(HOUR_RULE_NOTICE_PLAIN).toContain('WITHIN ONE HOUR OF BOOKING');
  });

  it('says nothing about the diagnosis', () => {
    const body = message(members[0]).split('────────────────────')[0];
    expect(body).not.toMatch(/diagnosis/i);
    expect(body).not.toMatch(/indication/i);
  });

  it('carries the theatre network notice exactly once, and never the key', () => {
    const text = message(members[0]);
    expect(text.match(/UNTH-THEATRE-ORM/g) ?? []).toHaveLength(1);
    expect(text).not.toContain('93934015');
  });

  it('gives the bell a line that names the one thing to do', () => {
    expect(chaseNotificationLine(members[1], standing))
      .toContain('Record the pre-anaesthetic review');
    expect(chaseNotificationLine(members[2], standing))
      .toContain('Tap your availability');
  });
});

// ---------------------------------------------------------------------------

describe('the endpoint and the page', () => {
  const api = read('src/app/api/emergency-booking/[id]/chase-team/route.ts');
  const page = read('src/app/dashboard/emergency-booking/page.tsx');
  const onDuty = read('src/app/api/roster/on-duty/route.ts');
  const schema = read('prisma/schema.prisma');

  it('chases the people the booking card itself names', () => {
    // One resolver, not two. A screen listing one anaesthetist while the
    // WhatsApp went to another would discredit both.
    expect(api).toContain("resolveOnDutyTeam({");
    expect(api).toContain("purpose: 'emergency'");
    expect(onDuty).toContain('resolveOnDutyTeam');
    expect(onDuty).not.toContain('prisma.roster.findMany');
    // And asks it the same way: the card passes the date alone, so a chase
    // that narrowed by theatre would resolve a smaller team than the screen
    // shows. On-call rosters are published against the shift, not a room.
    expect(api).not.toContain('theatreId: booking.theatreId');
  });

  it('covers the whole list, from the surgeon to the porter', () => {
    [
      'Surgeon who booked this case', 'Anaesthetist named on the booking',
      'Anaesthetist (1st on call)', 'Anaesthetist (2nd on call)',
      'Anaesthetic Technician', 'Scrub Nurse', 'Circulating Nurse',
      'Recovery Nurse', 'Porter', 'Cleaner', 'Pharmacist', 'Blood Bank',
    ].forEach((label) => expect(api, label).toContain(label));
  });

  it('refuses to chase a case that is no longer waiting to start', () => {
    // The guard itself, not the word: `settled` also appears in the GET
    // response, and an assertion that matched that would pass with the
    // guard deleted.
    expect(api).toContain('if (standing.settled) {');
    expect(api).toContain('no longer waiting to start');
  });

  it('refuses when there is nobody to chase, and says why', () => {
    expect(api).toContain('members.length === 0');
    expect(api).toContain('Publish the call roster');
  });

  it('does not let any signed-in user fire a dozen formal notices', () => {
    expect(api).toContain('CHASE_ROLES');
    expect(api).toContain('Only the team on this case, or theatre management, can chase it.');
  });

  it('records who was told and when, with the roll call as it stood', () => {
    expect(api).toContain('prisma.emergencyTeamChase.create');
    expect(api).toContain('rollCall: JSON.stringify');
    expect(schema).toContain('model EmergencyTeamChase');
  });

  it('hands every message over as a wa.me link, because the queue is not a delivery', () => {
    expect(api).toContain('handoffs.push');
    expect(page).toContain('whatsappLink(h.number, h.text)');
  });

  it('shows the sender the notice before they send it in their own name', () => {
    expect(page).toContain('HOUR_RULE_NOTICE_PLAIN');
    expect(page).toContain('The notice each of them will receive');
  });

  it('shows the roll call before the chase, not only after', () => {
    expect(page).toContain('openChase');
    expect(page).toContain('Pre-anaesthetic review NOT recorded');
    expect(page).toContain('No answer');
  });

  it('hides the button on a case that has started or been called off', () => {
    expect(page).toContain("!['IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(booking.status)");
  });
});
