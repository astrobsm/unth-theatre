/**
 * Two escalations a waiting emergency can need.
 *
 * Asked for on 7 November:
 *
 *   "add a button to chase the theatre manager if the booked emergency have
 *    not been acknowledged by the nurses, add a message of how they will
 *    assign theatre and scrub and circulating nurses"
 *
 *   "ensure that the chase message will also inform the consultant
 *    anaesthetist about the booked case reviewed or not reviewed by the
 *    anaesthetist, i meant how they will assign a theatre for the case"
 *
 *   "after 2 hour without the case starting a dynamic button appears that
 *    sends a message to the c-mac about the emergency case with the phone
 *    numbers of the team members on the case so he can reach out to them"
 *
 * The ways this goes wrong, worst first:
 *
 *   A WINDOW ONLY THE SCREEN RESPECTS. The two hours are the entire
 *   justification for sending an executive a list of colleagues' personal
 *   numbers. A button hidden on the card but an endpoint that accepts any
 *   POST is not a window — it is a window-shaped decoration over an open door.
 *
 *   STEPS THAT NAME A CONTROL NOBODY CAN FIND. The people who assign a room
 *   are not daily users of this screen; the controls are three unlabelled
 *   dropdowns inside a red panel. A step naming a button that does not exist
 *   is worse than no step, because the reader stops trusting the rest.
 *
 *   A DIRECTORY THAT LOOKS COMPLETE AND IS NOT. People with no number on file
 *   must be listed and marked, never silently dropped — an officer working
 *   down a list assumes it is the whole team.
 *
 *   A SECOND ROLL CALL. If this resolved its own team, the CMAC would
 *   eventually be given a different anaesthetist from the one on the card.
 *
 * No real patient is named here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  ASSIGNMENT_DUTY, ASSIGNMENT_STEPS, assignmentNotificationLine, assignmentSummary,
  buildAssignmentChaseMessage, needsAssignment, readReviewState, reviewSentence,
  waitingFor,
} from '../../src/lib/emergency/assignmentChase';
import {
  CMAC_AFTER_MINUTES, CMAC_LABELS, CMAC_ROLES, availabilityWord, buildCmacMessage,
  cmacNotificationLine, cmacStanding, dialable, teamDirectory,
} from '../../src/lib/emergency/cmacEscalation';
import { hourRuleStanding } from '../../src/lib/emergency/hourRule';
import type { RollCallMember } from '../../src/lib/emergency/teamChase';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

const FACTS = {
  patientName: 'A Patient',
  folderNumber: 'PT000001',
  procedureName: 'Laparotomy',
  surgeonName: 'Mr B',
  ward: 'Ward 4',
  priority: 'CRITICAL',
};

const member = (over: Partial<RollCallMember> = {}): RollCallMember => ({
  userId: 'u1', name: 'Dr C', phoneNumber: '08031234567',
  roleOnCase: 'Anaesthetist (1st on call)', teamRole: 'ANAESTHETIST', source: 'roster',
  availability: null, respondedAt: null, mustReview: true, reviewDone: false,
  mustRespond: true, ...over,
});

const inTime = () => hourRuleStanding({ requestedAt: new Date(Date.now() - 20 * 60_000) });
const late = () => hourRuleStanding({ requestedAt: new Date(Date.now() - 150 * 60_000) });

const NO_REVIEW = readReviewState([]);
const DONE_REVIEW = readReviewState([
  { status: 'COMPLETED', reviewerName: 'Dr D', updatedAt: new Date(), fitnessDecision: 'FIT' },
]);
const PART_REVIEW = readReviewState([
  { status: 'IN_PROGRESS', reviewerName: 'Dr E', updatedAt: new Date() },
]);

// ────────────────────────────────────────────────────────────────────────────
describe('whether anybody in theatre has taken the case', () => {
  it('is waiting while it is only submitted or approved', () => {
    expect(needsAssignment({ status: 'SUBMITTED' })).toBe(true);
    expect(needsAssignment({ status: 'APPROVED' })).toBe(true);
  });

  it('is not waiting once a theatre has been assigned', () => {
    // Assigning IS the acknowledgement: assign-theatre does the room, the
    // acknowledgement and the radio call in one press.
    expect(needsAssignment({ status: 'THEATRE_ASSIGNED' })).toBe(false);
    expect(needsAssignment({ status: 'IN_PROGRESS' })).toBe(false);
    expect(needsAssignment({ status: 'CANCELLED' })).toBe(false);
  });

  it('judges on status, not on a leftover theatre name', () => {
    const src = read('src/lib/emergency/assignmentChase.ts');
    expect(src).toContain('UNACKNOWLEDGED as readonly string[]).includes(booking.status');
  });
});

describe('where the anaesthetic review stands', () => {
  it('knows nobody has looked at the patient', () => {
    expect(NO_REVIEW.done).toBe(false);
    expect(NO_REVIEW.started).toBe(false);
    expect(reviewSentence(NO_REVIEW)).toContain('NOT DONE');
    expect(reviewSentence(NO_REVIEW)).toContain('holding area will not take the patient');
  });

  it('tells a started review apart from no review at all', () => {
    // Different problems with different people to ring.
    expect(PART_REVIEW.started).toBe(true);
    expect(PART_REVIEW.done).toBe(false);
    expect(reviewSentence(PART_REVIEW)).toContain('STARTED BUT NOT FINISHED');
    expect(reviewSentence(PART_REVIEW)).toContain('Dr E');
  });

  it('counts a completed or approved review as done, and names the reviewer', () => {
    expect(DONE_REVIEW.done).toBe(true);
    expect(reviewSentence(DONE_REVIEW)).toContain('RECORDED');
    expect(reviewSentence(DONE_REVIEW)).toContain('Dr D');
    expect(reviewSentence(DONE_REVIEW)).toContain('fit');
    expect(readReviewState([{ status: 'APPROVED', reviewerName: 'Dr F' }]).done).toBe(true);
  });

  it('prefers a finished review over an abandoned one on the same case', () => {
    const mixed = readReviewState([
      { status: 'PENDING', reviewerName: 'Dr G' },
      { status: 'COMPLETED', reviewerName: 'Dr H' },
    ]);
    expect(mixed.done).toBe(true);
    expect(mixed.reviewerName).toBe('Dr H');
  });
});

describe('how to assign a theatre, as the message says it', () => {
  it('names the controls in the words printed on them', () => {
    // Checked against app/dashboard/emergency-booking/page.tsx. A step naming
    // a control nobody can find is worse than no step.
    const page = read('src/app/dashboard/emergency-booking/page.tsx');
    ['-- Choose theatre --', '-- scrub nurse --', '-- circulating nurse --']
      .forEach((label) => {
        expect(ASSIGNMENT_STEPS, label).toContain(label);
        expect(page, label).toContain(label);
      });
    expect(ASSIGNMENT_STEPS).toContain('Assign theatre, team & acknowledge');
    expect(page).toContain('Assign theatre, team & acknowledge');
  });

  it('says what that one press actually does', () => {
    expect(ASSIGNMENT_STEPS).toContain('acknowledges');
    expect(ASSIGNMENT_STEPS).toContain('radio');
  });

  it('says where the anaesthetic team is assigned instead', () => {
    expect(ASSIGNMENT_STEPS).toContain('Team Status');
  });

  it('is numbered from opening the app, not from the panel', () => {
    expect(ASSIGNMENT_STEPS).toContain('1. Open the app');
    expect(ASSIGNMENT_STEPS).toContain('7.');
  });
});

describe('the chase for a case nobody has taken', () => {
  const build = (kind: 'MANAGER' | 'NURSE' | 'ANAESTHETIST' | 'MANAGEMENT', review = NO_REVIEW) =>
    buildAssignmentChaseMessage({
      recipientName: 'Sr. K',
      recipientLabel: 'Theatre Manager on duty',
      kind,
      facts: FACTS,
      standing: inTime(),
      review,
      bookedAt: new Date(Date.now() - 35 * 60_000),
    });

  it('leads with the fact that no theatre has been assigned', () => {
    expect(build('MANAGER').slice(0, 160)).toContain('NOT ACKNOWLEDGED');
  });

  it('says how long it has sat', () => {
    expect(build('MANAGER')).toContain('35 minutes');
    expect(waitingFor(new Date(Date.now() - 150 * 60_000))).toBe('2 h 30 m');
  });

  it('gives each kind of recipient one duty, not four', () => {
    expect(build('NURSE')).toContain(ASSIGNMENT_DUTY.NURSE);
    expect(build('NURSE')).not.toContain(ASSIGNMENT_DUTY.ANAESTHETIST);
    expect(build('ANAESTHETIST')).toContain(ASSIGNMENT_DUTY.ANAESTHETIST);
  });

  it('tells EVERY recipient where the review stands', () => {
    // Asked for explicitly, and the manager needs it as much as the
    // anaesthetist: a room held for a case that cannot go is a room wasted.
    (['MANAGER', 'NURSE', 'ANAESTHETIST', 'MANAGEMENT'] as const).forEach((k) => {
      expect(build(k), k).toContain('ANAESTHETIC REVIEW');
    });
    expect(build('MANAGER', DONE_REVIEW)).toContain('Dr D');
  });

  it('tells the non-anaesthetists that the consultant has been told too', () => {
    expect(build('MANAGER')).toContain('consultant anaesthetist has been told');
    // And does not say that to the anaesthetist about themselves.
    expect(build('ANAESTHETIST')).not.toContain('consultant anaesthetist has been told');
  });

  it('carries the assignment steps in the message itself', () => {
    expect(build('NURSE')).toContain('HOW TO ASSIGN A THEATRE');
    expect(build('NURSE')).toContain('Assign theatre, team & acknowledge');
  });

  it('names the case well enough to find the patient', () => {
    const m = build('MANAGER');
    expect(m).toContain('A Patient');
    expect(m).toContain('PT000001');
    expect(m).toContain('Ward 4');
  });

  it('carries the standing notice, and says differently when the hour is gone', () => {
    expect(build('MANAGER')).toContain('THEATRE EMERGENCY STANDARD');
    const over = buildAssignmentChaseMessage({
      recipientName: 'Sr. K', recipientLabel: 'Theatre Manager', kind: 'MANAGER',
      facts: FACTS, standing: late(), review: NO_REVIEW,
      bookedAt: new Date(Date.now() - 150 * 60_000),
    });
    expect(over).toContain('PAST THE HOUR');
  });

  it('summarises for a bell without losing the review', () => {
    expect(assignmentNotificationLine('ANAESTHETIST', inTime(), NO_REVIEW))
      .toContain('No anaesthetic review yet');
    expect(assignmentNotificationLine('NURSE', inTime(), NO_REVIEW))
      .toContain('Assign a theatre');
    expect(assignmentSummary(DONE_REVIEW)).toContain('review recorded');
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('when the CMAC may be handed a case', () => {
  it('waits two hours', () => {
    expect(CMAC_AFTER_MINUTES).toBe(120);
    expect(cmacStanding({ requestedAt: new Date(Date.now() - 119 * 60_000) }).due).toBe(false);
    expect(cmacStanding({ requestedAt: new Date(Date.now() - 120 * 60_000) }).due).toBe(true);
  });

  it('says how long is left before the button appears', () => {
    const s = cmacStanding({ requestedAt: new Date(Date.now() - 100 * 60_000) });
    expect(s.minutesUntilDue).toBe(20);
    expect(s.due).toBe(false);
  });

  it('is never due for a case that has started, however long it took', () => {
    // There is nobody for the CMAC to ring about an operation under way.
    expect(cmacStanding({
      requestedAt: new Date(Date.now() - 300 * 60_000), settled: true,
    }).due).toBe(false);
  });

  it('spells the wait the way a person says it', () => {
    expect(cmacStanding({ requestedAt: new Date(Date.now() - 134 * 60_000) }).waited)
      .toBe('2 h 14 m');
    expect(cmacStanding({ requestedAt: new Date(Date.now() - 180 * 60_000) }).waited)
      .toBe('3 hours');
  });

  it('goes to the CMAC, with the deputy, not to a broadcast list', () => {
    expect([...CMAC_ROLES]).toEqual(['CMAC', 'DC_MAC']);
    expect(CMAC_LABELS.CMAC).toContain('Medical Advisory Committee');
  });
});

describe('the directory — the whole point of the CMAC message', () => {
  it('gives a number that can be tapped', () => {
    expect(dialable('08031234567')).toBe('+2348031234567');
    expect(dialable(null)).toBeNull();
    expect(dialable('not a number')).toBeNull();
  });

  it('lists role, name, number and what they have said', () => {
    const d = teamDirectory([
      member({ name: 'Dr C', roleOnCase: 'Surgeon who booked this case', availability: 'EN_ROUTE' }),
    ]);
    expect(d).toContain('Surgeon who booked this case');
    expect(d).toContain('Dr C');
    expect(d).toContain('+2348031234567');
    expect(d).toContain('en route');
  });

  it('says "no answer" rather than leaving a name bare', () => {
    expect(availabilityWord(null)).toBe('no answer');
    expect(teamDirectory([member({ availability: null })])).toContain('no answer');
  });

  it('marks whether the anaesthetist’s review is recorded', () => {
    expect(teamDirectory([member({ mustReview: true, reviewDone: false })]))
      .toContain('review NOT recorded');
    expect(teamDirectory([member({ mustReview: true, reviewDone: true })]))
      .toContain('review recorded');
  });

  it('lists the unreachable rather than dropping them', () => {
    // An officer working down a list assumes it is the whole team.
    const d = teamDirectory([
      member({ userId: 'a', name: 'Dr C' }),
      member({ userId: 'b', name: 'Sr. L', roleOnCase: 'Scrub Nurse', phoneNumber: null }),
    ]);
    expect(d).toContain('No phone number is on the system for');
    expect(d).toContain('Sr. L');
  });

  it('says plainly when there is no team at all', () => {
    expect(teamDirectory([])).toContain('nobody is named on this case');
  });
});

describe('the message the CMAC receives', () => {
  const build = (blockers: { label: string; detail?: string | null }[] = [], review = NO_REVIEW) =>
    buildCmacMessage({
      recipientName: 'Prof. M',
      recipientLabel: CMAC_LABELS.CMAC,
      facts: { ...FACTS, diagnosis: 'Peritonitis', theatreName: null, escalatedByName: 'Dr N', escalatedByRole: 'SURGEON' },
      standing: late(),
      cmac: cmacStanding({ requestedAt: new Date(Date.now() - 134 * 60_000) }),
      members: [member({ name: 'Dr C' }), member({ userId: 'b', name: 'Sr. L', roleOnCase: 'Scrub Nurse', mustReview: false })],
      review,
      blockers,
      responded: 1,
      expected: 5,
    });

  it('leads with the two hours', () => {
    expect(build().slice(0, 120)).toContain('TWO HOURS');
    expect(build()).toContain('2 h 14 m ago');
  });

  it('carries the directory, which is what he is being asked to use', () => {
    const m = build();
    expect(m).toContain('NUMBERS TO REACH THEM');
    expect(m).toContain('+2348031234567');
  });

  it('says there is no theatre when there is none', () => {
    expect(build()).toContain('NONE ASSIGNED');
  });

  it('reports only what was actually recorded as the reason', () => {
    // Guessing here is the one thing that makes an executive distrust the
    // whole message.
    const withBlocker = build([{ label: 'Blood not available', detail: 'O neg, none on site' }]);
    expect(withBlocker).toContain('WHAT HAS BEEN RECORDED AS STOPPING IT');
    expect(withBlocker).toContain('O neg, none on site');

    const without = build([]);
    expect(without).toContain('NO BLOCKER HAS BEEN RECORDED');
    expect(without).toContain('breach');
  });

  it('tells him whether the patient has been reviewed', () => {
    expect(build([], NO_REVIEW)).toContain('NOT DONE');
    expect(build([], DONE_REVIEW)).toContain('recorded by Dr D');
  });

  it('says who sent it, because it is not automatic', () => {
    const m = build();
    expect(m).toContain('Dr N');
    expect(m).toContain('not automatically');
  });

  it('names only the consequence the system actually performs', () => {
    const m = build();
    expect(m).toContain('Theatre Audit Committee');
    expect(m).not.toMatch(/dismiss|suspend|sack|police|salary/i);
  });

  it('fits the ask into one bell line', () => {
    const line = cmacNotificationLine(
      { patientName: 'A', procedureName: 'Laparotomy' },
      cmacStanding({ requestedAt: new Date(Date.now() - 130 * 60_000) }),
      6,
    );
    expect(line).toContain('Laparotomy');
    expect(line).toContain('6 team members');
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe('the endpoints', () => {
  const assign = read('src/app/api/emergency-booking/[id]/chase-assignment/route.ts');
  const cmac = read('src/app/api/emergency-booking/[id]/escalate-cmac/route.ts');
  const chaseTeam = read('src/app/api/emergency-booking/[id]/chase-team/route.ts');
  const rollCall = read('src/lib/emergency/caseRollCall.ts');

  it('refuses to chase an assignment for a case that already has a theatre', () => {
    expect(assign).toContain('if (!needsAssignment(booking)) {');
    expect(assign).toContain('already been acknowledged and assigned to');
  });

  it('enforces the two hours on the server, not only on the card', () => {
    // A window only the UI respects is not a window.
    expect(cmac).toContain('if (!cmac.due) {');
    expect(cmac).toContain('status: 409');
    expect(cmac).toContain('The CMAC is handed a case at two');
  });

  it('takes the nurses from the published roster, not from every scrub nurse', () => {
    // Sixty-nine are registered; chasing by role would be a broadcast.
    //
    // Since 7 November the nurses come from the nursing posts named on the
    // theatre staffing screen, with the on-duty roster kept as the fallback
    // for a day nobody staffed it. Both are roster-backed; neither is a
    // findMany on SCRUB_NURSE, which is the thing this test exists to stop.
    expect(assign).toContain('await resolveEmergencyNursing({');
    expect(assign).toContain('add(nursing?.scrub ?? null,');
    expect(assign).toContain("add(fromStaff(team?.scrubNurse), 'Scrub Nurse on duty', 'NURSE');");
    expect(assign).toContain('resolveOnDutyTeam({');
    expect(assign).not.toMatch(/role: \{ in: \[[^\]]*'SCRUB_NURSE'/);
  });

  it('chases nobody by a role that is not in the enum', () => {
    // ASSIGN_ROLES on the assign endpoint contains CIRCULATING_NURSE and
    // NURSE_MANAGER, neither of which exists; a findMany on them matches
    // nobody while the screen reports success.
    const schema = read('prisma/schema.prisma');
    const block = schema.slice(
      schema.indexOf('enum UserRole {'),
      schema.indexOf('}', schema.indexOf('enum UserRole {')),
    );
    const real = new Set(block.split('\n').slice(1).map((l) => l.trim())
      .filter((l) => /^[A-Z][A-Z_]*$/.test(l)));
    const named = [...assign.matchAll(/^const (?:MANAGER_ROLES|MANAGEMENT_FALLBACK) = \[([^\]]*)\]/gm)]
      .flatMap((m) => [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]));
    expect(named.length).toBeGreaterThan(2);
    expect(named.filter((r) => !real.has(r))).toEqual([]);
  });

  it('tells the sender when no manager and no rostered nurse could be found', () => {
    expect(assign).toContain('Publish the nursing on-call');
  });

  it('shares one roll call with the team chase, never resolving a second', () => {
    // A screen naming one anaesthetist while the WhatsApp went to another
    // discredits both.
    expect(cmac).toContain("import { assembleRollCall } from '@/lib/emergency/caseRollCall';");
    expect(chaseTeam).toContain("import { assembleRollCall } from '@/lib/emergency/caseRollCall';");
    expect(chaseTeam).not.toContain('function slotsFor(');
    expect(rollCall).toContain('export function slotsFor(');
    // And the shared one must keep asking by date alone.
    expect(rollCall).not.toContain('theatreId:');
  });

  it('shows the sender the numbers before forwarding them', () => {
    const page = read('src/app/dashboard/emergency-booking/page.tsx');
    expect(cmac).toContain('directory: teamDirectory(members),');
    expect(page).toContain('The numbers he will be given');
  });

  it('records which kind of chase each round was', () => {
    // The row written to emergency_team_chases, not the audit-log copy of
    // the same word further down each file.
    expect(assign).toMatch(/kind: 'ASSIGNMENT',[\s\S]{0,40}chasedAt: now,/);
    expect(cmac).toMatch(/kind: 'CMAC',[\s\S]{0,40}chasedAt: now,/);
    expect(read('prisma/schema.prisma')).toContain('kind String @default("TEAM")');
  });

  it('falls back to the CMD only when no CMAC or deputy is registered', () => {
    expect(cmac).toContain('if (primary.length > 0) return { officers: primary, usedFallback: false };');
    expect(cmac).toContain('usedFallback: true');
  });

  it('keeps the escalation button off a case nobody may escalate', () => {
    expect(cmac).toContain('ESCALATE_ROLES.includes(session.user.role)');
    expect(assign).toContain('CHASE_ROLES.includes(session.user.role)');
  });
});

describe('the board', () => {
  const page = read('src/app/dashboard/emergency-booking/page.tsx');
  const migration = read('prisma/migrations/20261107140000_emergency_chase_kind/migration.sql');

  it('shows the manager chase only while the case is unacknowledged', () => {
    expect(page).toContain("{['SUBMITTED', 'APPROVED'].includes(booking.status) && (");
    expect(page).toContain('No theatre yet — chase the manager');
  });

  it('makes the CMAC button appear only after two hours', () => {
    expect(page).toContain('minutesSinceBooking(booking.requestedAt) >= CMAC_AFTER_MINUTES');
    // The threshold is imported, never retyped, so the card and the endpoint
    // cannot disagree about what two hours means.
    expect(page).toContain("import { CMAC_AFTER_MINUTES } from '@/lib/emergency/cmacEscalation';");
    expect(page).not.toMatch(/>= 120\b/);
  });

  it('hides the CMAC button once the case is no longer waiting', () => {
    expect(page).toContain("{!['IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(booking.status)\n"
      + '                        && minutesSinceBooking(booking.requestedAt) >= CMAC_AFTER_MINUTES && (');
  });

  it('adds the chase kind without touching sync wiring', () => {
    // emergency_team_chases is already captured and sync_capture uses
    // to_jsonb(NEW), so a new column needs no sync_enable_table and no policy.
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "kind"');
    // The call, not the sentence explaining why there is no call.
    expect(migration).not.toContain('SELECT sync_enable_table(');
    expect(migration).not.toContain('///');
  });
});
