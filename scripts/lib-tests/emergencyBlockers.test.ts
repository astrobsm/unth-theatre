/**
 * Recording what is stopping an emergency, and chasing whoever can clear it.
 *
 * Asked for on 7 November:
 *
 *   "kindly add here a place to report reason for the case not starting yet
 *    or any blocker to the emergency so that the appropriate person can be
 *    chased with whatsapp message, add also a whatapp message chase button to
 *    call attension of the team members of the booked emergency and steps to
 *    take to indicate their availability and report any blocker"
 *
 * The ways this goes wrong, worst first:
 *
 *   A ROLE THAT DOES NOT EXIST. Every recipient is found by
 *   `user.findMany({ role: { in: spec.roles } })`. A role spelled in a way the
 *   UserRole enum does not have returns nobody, silently, for ever — the
 *   screen says the blood bank was chased and no message was ever addressed.
 *   This file reads the enum out of schema.prisma and checks every role
 *   against it. The existing CHASE_ROLES list in the emergency page contains
 *   two such ghosts, which is how the failure mode is known.
 *
 *   TELLING SOMEBODY THEY HAVE COMPLIED WHEN THEY HAVE NOT. The hour rule
 *   promises that a blocker recorded WITHIN the hour satisfies the standard.
 *   Saying that to somebody who recorded one afterwards would be the kinder
 *   message and the one that destroys the rule the first time a case is
 *   reviewed.
 *
 *   A BLOCKER THAT CLOSES ITSELF. Not on a timer, not because the case later
 *   started. A thing that closes itself was never recorded.
 *
 *   CHASING THE WRONG PEOPLE. A blocker that goes to the same five managers
 *   whatever it is gets ignored within a fortnight, which is what every
 *   broadcast in this hospital has taught.
 *
 * No patient is named here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  EMERGENCY_BLOCKER_REASONS,
  blockerNotificationLine,
  blockerProblem,
  blockerSpec,
  buildBlockerChaseMessage,
  complianceLine,
  describeBlocker,
  isEmergencyBlockerReason,
  reassessNotice,
  type BlockerCaseFacts,
} from '../../src/lib/emergency/blockers';
import { hourRuleStanding } from '../../src/lib/emergency/hourRule';
import { RESPONSE_STEPS, buildTeamChaseMessage } from '../../src/lib/emergency/teamChase';
import { BLOCKER_REASONS } from '../../src/lib/caseBlockers';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

const FACTS: BlockerCaseFacts = {
  patientName: 'A Patient',
  folderNumber: 'PT000001',
  procedureName: 'Laparotomy',
  theatreName: 'Theatre 2',
  surgeonName: 'Mr B',
  ward: 'Ward 4',
};

/** Booked 20 minutes ago: 40 minutes of the hour still to run. */
const inTime = () => hourRuleStanding({
  requestedAt: new Date(Date.now() - 20 * 60_000),
});

/** Booked 90 minutes ago and still not started. */
const late = () => hourRuleStanding({
  requestedAt: new Date(Date.now() - 90 * 60_000),
});

describe('the catalogue of reasons', () => {
  it('gives every reason a label, an owner and something to do', () => {
    EMERGENCY_BLOCKER_REASONS.forEach((r) => {
      expect(r.label.length, r.code).toBeGreaterThan(4);
      expect(r.owner.length, r.code).toBeGreaterThan(4);
      // An imperative with a verb in it. "Please be aware" produces nothing.
      expect(r.ask.length, r.code).toBeGreaterThan(20);
    });
  });

  it('uses each code once', () => {
    const codes = EMERGENCY_BLOCKER_REASONS.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('keeps the elective codes identical, so a month’s figures add up', () => {
    // The whole value of a fixed list is being able to count it. A code
    // renamed on one board splits the count in two and nobody notices until
    // the figures are presented.
    const mine = new Set(EMERGENCY_BLOCKER_REASONS.map((r) => r.code));
    const shared = BLOCKER_REASONS
      .map((r) => r.code as string)
      // Only the ones that can stop an emergency at all; an emergency has no
      // scheduled slot, so there is nothing for it to be five minutes late to.
      .filter((c) => c !== 'TEAM_ABSENT' || true);
    const missing = shared.filter((c) => !mine.has(c));
    expect(missing).toEqual([]);
  });

  it('chases nobody by a role the system does not have', () => {
    // The failure this guards: user.findMany on a role that is not in the
    // enum returns nobody, silently, and the screen still says they were
    // chased. Read the enum rather than trusting a list typed twice.
    const schema = read('prisma/schema.prisma');
    const block = schema.slice(
      schema.indexOf('enum UserRole {'),
      schema.indexOf('}', schema.indexOf('enum UserRole {')),
    );
    const real = new Set(
      block.split('\n').slice(1)
        .map((l) => l.trim())
        .filter((l) => /^[A-Z][A-Z_]*$/.test(l)),
    );
    expect(real.size).toBeGreaterThan(30);

    const ghosts: string[] = [];
    EMERGENCY_BLOCKER_REASONS.forEach((r) => {
      r.roles.forEach((role) => { if (!real.has(role)) ghosts.push(`${r.code}: ${role}`); });
    });
    expect(ghosts).toEqual([]);
  });

  it('never leaves a reason with nobody at all to chase', () => {
    // Where the role list is empty it must be because the people who can move
    // it are already on the case — and those are told about every blocker.
    const ONCASE = ['PATIENT_NOT_READY', 'NO_CONSENT', 'PATIENT_NOT_FIT'];
    EMERGENCY_BLOCKER_REASONS.forEach((r) => {
      if (r.roles.length === 0) expect(ONCASE, r.code).toContain(r.code);
    });
  });

  it('recognises its own codes and nothing else', () => {
    expect(isEmergencyBlockerReason('NO_BLOOD')).toBe(true);
    expect(isEmergencyBlockerReason('NO_IDEA')).toBe(false);
    expect(blockerSpec('NO_IDEA')).toBeNull();
  });
});

describe('what the form will and will not accept', () => {
  it('refuses a report with no reason', () => {
    expect(blockerProblem(null, 'anything')).toContain('Choose');
    expect(blockerProblem('NOT_A_CODE', 'anything')).toContain('Choose');
  });

  it('demands a sentence where the reason alone says nothing', () => {
    // "Equipment missing" does not tell a biomedical engineer what to bring.
    const p = blockerProblem('EQUIPMENT_MISSING', '');
    expect(p).toBeTruthy();
    expect(p).toContain('biomedical engineer');
  });

  it('accepts the sentence once it is there', () => {
    expect(blockerProblem('EQUIPMENT_MISSING', 'Diathermy in Theatre 2 is dead')).toBeNull();
  });

  it('demands one for OTHER, which is the whole point of OTHER', () => {
    expect(blockerProblem('OTHER', '')).toBeTruthy();
    expect(blockerProblem('OTHER', 'Lift to theatre is broken')).toBeNull();
  });

  it('does not stand in the way of the reasons that speak for themselves', () => {
    // Somebody standing in a theatre that cannot start must never be told the
    // form is not satisfied with them.
    expect(blockerProblem('NO_BLOOD', '')).toBeNull();
    expect(blockerProblem('NO_ANAESTHETIST', '')).toBeNull();
    expect(blockerProblem('PATIENT_NOT_SENT', '')).toBeNull();
  });
});

describe('whether the standard was met', () => {
  it('says the standard is satisfied when it was recorded inside the hour', () => {
    const line = complianceLine(inTime());
    expect(line).toContain('inside the hour');
    expect(line).toMatch(/satisfied/i);
  });

  it('does NOT tell a late reporter they have complied', () => {
    // The kinder message, and the one that destroys the rule.
    const line = complianceLine(late());
    expect(line).toMatch(/does not cure/i);
    expect(line).not.toMatch(/standard is satisfied/i);
  });

  it('says plainly when there is no hour to count against', () => {
    const line = complianceLine(hourRuleStanding({ requestedAt: 'not a date' }));
    expect(line).toContain('cannot be counted');
  });
});

describe('the message the person who can clear it receives', () => {
  const build = (reason: string, detail: string | null, standing = inTime()) =>
    buildBlockerChaseMessage({
      spec: blockerSpec(reason)!,
      detail,
      recipientName: 'Dr C',
      recipientLabel: 'Theatre Manager',
      facts: FACTS,
      standing,
      reportedByName: 'Nurse D',
      reportedByRole: 'SCRUB_NURSE',
    });

  it('names what is in the way at the top, not the rule', () => {
    const m = build('NO_BLOOD', null);
    const head = m.slice(0, 220);
    expect(head).toContain('Blood not available');
  });

  it('carries the sentence somebody typed', () => {
    expect(build('EQUIPMENT_MISSING', 'Diathermy in Theatre 2 is dead'))
      .toContain('Diathermy in Theatre 2 is dead');
  });

  it('says which case, with enough to find the patient', () => {
    const m = build('NO_BLOOD', null);
    expect(m).toContain('A Patient');
    expect(m).toContain('PT000001');
    expect(m).toContain('Laparotomy');
    expect(m).toContain('Theatre 2');
  });

  it('tells this person what THEY must do', () => {
    expect(build('NO_BLOOD', null)).toContain(blockerSpec('NO_BLOOD')!.ask);
  });

  it('says how long is left, and says it differently once it is gone', () => {
    expect(build('NO_BLOOD', null)).toContain('must be on the table by');
    expect(build('NO_BLOOD', null, late())).toContain('should have been on the table by');
  });

  it('names who reported it, because a chase from nobody is ignored', () => {
    const m = build('NO_BLOOD', null);
    expect(m).toContain('Nurse D');
    expect(m).toContain('scrub nurse');
  });

  it('sends them to the app, not to a reply on the handset', () => {
    const m = build('NO_BLOOD', null);
    expect(m).toContain('Emergency Surgery Booking');
    expect(m).toContain('A reply on this handset is not on the record');
  });

  it('says the blocker stays open until somebody clears it', () => {
    expect(build('NO_BLOOD', null)).toContain('until somebody records that it is cleared');
  });

  it('names only the consequences the system actually performs', () => {
    // The ladder in emergencyEscalation.ts informs the CMD at two hours and
    // drafts a committee invitation at three. A threat beyond what the code
    // does is found out the first time somebody tests it, and then the real
    // ladder is not believed either.
    const m = build('NO_BLOOD', null);
    expect(m).toContain('Chief Medical Director');
    expect(m).toContain('Theatre Audit Committee');
    expect(m).not.toMatch(/dismiss|suspend|sack|court|police|salary/i);
  });

  it('never claims the recipient has broken a rule', () => {
    // They are being asked to clear something, not accused of causing it.
    const m = build('NO_BLOOD', null);
    expect(m).not.toMatch(/you (have )?failed|your fault|you are responsible for the delay/i);
  });
});

describe('the short forms', () => {
  it('fits the reason and the duty into one bell line', () => {
    const line = blockerNotificationLine(blockerSpec('NO_BLOOD')!, 'O negative, none on site', inTime());
    expect(line).toContain('Blood not available');
    expect(line).toContain('O negative, none on site');
    expect(line).toContain(blockerSpec('NO_BLOOD')!.ask);
  });

  it('leads with the fact that the hour has gone, when it has', () => {
    expect(blockerNotificationLine(blockerSpec('NO_BLOOD')!, null, late()))
      .toMatch(/^PAST THE HOUR/);
  });

  it('names the person who reported it on a board line', () => {
    expect(describeBlocker({ reason: 'NO_BLOOD', detail: 'none on site', reportedByName: 'Nurse D' }))
      .toBe('Blood not available: none on site — reported by Nurse D');
  });

  it('counts the open ones without pretending any closes itself', () => {
    expect(reassessNotice(1)).toContain('until somebody records');
    expect(reassessNotice(3)).toContain('3 blockers');
  });
});

describe('the steps every chased team member is given', () => {
  it('routes them from the handset to the button', () => {
    expect(RESPONSE_STEPS).toContain('Emergency Surgery Booking');
    expect(RESPONSE_STEPS).toContain('1.');
    expect(RESPONSE_STEPS).toContain('5.');
  });

  it('names all four availability buttons exactly as the screen does', () => {
    ['Available', 'En Route', 'Arrived', 'Unavailable'].forEach((b) => {
      expect(RESPONSE_STEPS, b).toContain(b);
    });
  });

  it('tells them how to report a blocker, which is the other way to comply', () => {
    expect(RESPONSE_STEPS).toContain('Report a blocker');
    expect(RESPONSE_STEPS).toMatch(/protects you/);
  });

  it('is actually carried by the chase, not merely exported', () => {
    const msg = buildTeamChaseMessage({
      member: {
        userId: 'u1', name: 'Dr E', phoneNumber: '08030000000',
        roleOnCase: 'Scrub Nurse', teamRole: 'SCRUB_NURSE', source: 'roster',
        availability: null, respondedAt: null, mustReview: false,
        reviewDone: false, mustRespond: true,
      },
      facts: { patientName: 'A Patient', procedureName: 'Laparotomy' },
      standing: inTime(),
      summary: {
        total: 3, expected: 3, responded: 1, coming: 1, unavailable: 0,
        silent: [], anaesthetists: [], reviewDone: false, reachable: 3,
      },
    });
    expect(msg).toContain('STEP BY STEP');
    expect(msg).toContain('Report a blocker');
  });
});

describe('the endpoint', () => {
  const api = read('src/app/api/emergency-booking/[id]/blocker/route.ts');
  const page = read('src/app/dashboard/emergency-booking/page.tsx');
  const list = read('src/app/api/emergency-booking/route.ts');
  const schema = read('prisma/schema.prisma');
  const policy = read('src/lib/sync/syncPolicy.ts');
  const migration = read('prisma/migrations/20261107090000_emergency_case_blockers/migration.sql');

  it('lets any signed-in member of staff report', () => {
    // The person who knows the case cannot start is whoever is standing in
    // the room. A POST guarded by a role list would leave the fact unrecorded
    // until somebody senior noticed, which is the delay being measured.
    const post = api.slice(api.indexOf('export async function POST'), api.indexOf('export async function PATCH'));
    expect(post).not.toContain('RESOLVE_ROLES.includes');
    expect(post).toContain("return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });");
  });

  it('records the blocker BEFORE any message goes out', () => {
    // A chase sent against a report that failed to save is the one outcome
    // with no way back.
    const create = api.indexOf('await prisma.emergencyCaseBlocker.create(');
    const chase = api.indexOf('const text = buildBlockerChaseMessage({');
    expect(create).toBeGreaterThan(0);
    expect(chase).toBeGreaterThan(create);
  });

  it('never chases the person who filed the report', () => {
    expect(api).toContain('const seen = new Set<string>([session.user.id]);');
  });

  it('tells the reporter when nobody holds the role that owns it', () => {
    expect(api).toContain('nobody was chased in that role.');
  });

  it('caps how many of one role are messaged about one generator', () => {
    expect(api).toContain('const PER_ROLE_CAP = 3;');
    expect(api).toContain('inRole.slice(0, PER_ROLE_CAP)');
    // And says who was left out rather than dropping them in silence.
    expect(api).toContain('were not messaged');
  });

  it('hands the sender a wa.me link for everybody reachable', () => {
    // queueMessage writes a row for a provider that is not configured on the
    // theatre server. The hand-off is the part that reaches a phone tonight.
    expect(api).toContain('if (wa) handoffs.push({');
    expect(api).toContain('has no phone number on file — app only.');
  });

  it('closes a blocker only when a person says so', () => {
    const patch = api.slice(api.indexOf('export async function PATCH'));
    expect(patch).toContain('resolvedAt: new Date(),');
    expect(patch).toContain("resolvedByName: session.user.name || 'A member of staff',");
    // Nothing anywhere resolves on a timer or on the case starting.
    expect(api).not.toMatch(/resolvedAt:\s*(standing|booking|surgery)/);
  });

  it('does not let just anybody declare the way open', () => {
    const patch = api.slice(api.indexOf('export async function PATCH'));
    expect(patch).toContain('RESOLVE_ROLES.includes(session.user.role)');
    expect(patch).toContain('existing.reportedById === session.user.id');
  });

  it('refuses to clear the same blocker twice', () => {
    expect(api).toContain('if (existing.resolvedAt) {');
  });

  it('refuses a blocker belonging to another case', () => {
    expect(api).toContain('existing.emergencyBookingId !== booking.id');
  });

  it('announces on the radio only once the hour has gone', () => {
    const radio = api.indexOf('await triggerRadio({');
    const guard = api.lastIndexOf('if (standing.overdue) {', radio);
    expect(guard).toBeGreaterThan(0);
    expect(radio - guard).toBeLessThan(400);
  });

  it('sends the reason catalogue to the page rather than letting it drift', () => {
    expect(api).toContain('reasons: EMERGENCY_BLOCKER_REASONS.map((r) => ({');
    expect(page).toContain("import { EMERGENCY_BLOCKER_REASONS } from '@/lib/emergency/blockers';");
  });
});

describe('the board', () => {
  const page = read('src/app/dashboard/emergency-booking/page.tsx');
  const list = read('src/app/api/emergency-booking/route.ts');
  const schema = read('prisma/schema.prisma');
  const policy = read('src/lib/sync/syncPolicy.ts');
  const migration = read('prisma/migrations/20261107090000_emergency_case_blockers/migration.sql');

  it('offers the button to everybody, while the case is still waiting', () => {
    expect(page).toContain('onClick={() => openBlocker(booking.id)}');
    expect(page).toContain("{!['IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(booking.status) && (");
  });

  it('shows what is already holding the case up, on the card', () => {
    // A blocker only its author can see is the delay staying invisible with
    // an extra step in it.
    expect(page).toContain('This case is held up');
    expect(page).toContain('BLOCKER_LABELS[b.reason]');
  });

  it('derives the card’s labels from the catalogue, never retyped', () => {
    expect(page).toContain('EMERGENCY_BLOCKER_REASONS.map((r) => [r.code, r.label])');
  });

  it('says who will be chased before the button is pressed', () => {
    expect(page).toContain('This chases {blockerData.reasons');
  });

  it('sends only the open blockers with the board, and only scalars', () => {
    // The list route once returned 25 MB because of a fat include.
    expect(list).toContain('caseBlockers: {');
    expect(list).toContain('where: { resolvedAt: null },');
    expect(list).not.toMatch(/caseBlockers: \{\s*include/);
  });

  it('is replicated, and classified in the sync policy', () => {
    expect(migration).toContain("SELECT sync_enable_table('emergency_case_blockers');");
    expect(policy).toContain("{ table: 'emergency_case_blockers', cls: 'LWW'");
    expect(schema).toContain('@@map("emergency_case_blockers")');
  });

  it('keeps the reason when a booking is tidied away', () => {
    // A review months later asks for exactly this row.
    expect(migration).toContain('ON DELETE RESTRICT ON UPDATE CASCADE');
  });

  it('uses no Prisma doc syntax in the migration', () => {
    // A `///` in a migration once broke migrate deploy and blocked every
    // release for a day.
    expect(migration).not.toContain('///');
  });
});
