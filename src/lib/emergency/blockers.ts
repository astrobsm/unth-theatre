// ============================================================
// "It has not started, and this is what is stopping it."
// ------------------------------------------------------------
// Asked for on 7 November:
//
//   "kindly add here a place to report reason for the case not starting yet
//    or any blocker to the emergency so that the appropriate person can be
//    chased with whatsapp message"
//
// THE GAP THIS FILLS. The hour rule (hourRule.ts) says a booked emergency is
// defensible in exactly two ways: it starts within the hour, or a blocker is
// recorded within the hour. The chase (teamChase.ts) and the notice both say
// so in as many words — and until now there was nowhere on the emergency
// board to record one. Staff were being told to do something the screen did
// not offer. CaseBlockerReport exists for elective lists but hangs off a
// Surgery row, and an emergency has no Surgery until it is approved, which
// is precisely the stretch of time where the hour runs out.
//
// WHY A FIXED LIST OF REASONS. Free text cannot be counted, and the whole
// value of this is being able to say "nine emergencies last month, same
// reason, same department". The codes are deliberately the ones
// lib/caseBlockers.ts already uses for elective cases, so a month's figures
// add up across both boards, with five added for the things that only stop
// an emergency. OTHER exists and demands a sentence — but if OTHER leads the
// table after a month, the list is wrong and should be changed, not the
// report.
//
// WHY EACH REASON CARRIES ITS OWN RECIPIENT. "Chase the team" chases the
// team. This chases whoever can actually clear the thing in the way, which
// is usually not the team: a scrub nurse who has not arrived is not made to
// arrive by a fourth message to her handset, she is replaced by whoever the
// theatre manager can find. Blood is the blood bank. A dead generator is
// works and the power plant. Sending every blocker to the same list of
// managers would be a quicker thing to write and would be ignored within a
// fortnight, which is what every broadcast in this hospital has taught.
//
// THE REPORT IS A DEFENCE, NOT A CONFESSION. A person who records a blocker
// inside the hour has complied with the standard, and the message says so in
// those words. A person who records one after the hour has not cured the
// breach, and the message says that too — because a system that tells
// somebody they are in the clear when the record says otherwise is found out
// the first time a case is reviewed, and then nothing it says is believed.
// ============================================================

import { withNetworkNotice } from '@/lib/comms/networkNotice';
import { deadlineClock, type HourRuleStanding } from './hourRule';

export interface BlockerReasonSpec {
  code: string;
  /** As it reads in the dropdown. */
  label: string;
  /**
   * The roles chased for this reason. Empty where the only people who can
   * move it are already on the case — the surgeon and the anaesthetist are
   * told about every blocker regardless.
   */
  roles: readonly string[];
  /** Who that is, as a person would say it: "the blood bank". */
  owner: string;
  /** What the person chased is asked to do, imperative, with a verb in it. */
  ask: string;
  /** True where the detail box is compulsory. */
  needsDetail?: boolean;
  /** True where the anaesthetist on the case must also hear it. */
  tellAnaesthetist?: boolean;
}

/**
 * Why an emergency has not started.
 *
 * Ordered by how often each one actually stops a case in this theatre suite,
 * because a dropdown is read from the top and the fifteenth item is chosen by
 * nobody. The first five are the ones the delay ladder has been recording in
 * free text for months.
 */
export const EMERGENCY_BLOCKER_REASONS: readonly BlockerReasonSpec[] = [
  {
    code: 'NO_ANAESTHETIST',
    label: 'No anaesthetist available',
    roles: ['HEAD_OF_ANAESTHESIA', 'CONSULTANT_ANAESTHETIST'],
    owner: 'the Head of Anaesthesia and the consultant anaesthetist on call',
    ask: 'An anaesthetist is needed for this emergency now. Name one for this case, '
      + 'or come yourself.',
    tellAnaesthetist: true,
  },
  {
    code: 'AWAITING_REVIEW',
    label: 'Pre-anaesthetic review not done yet',
    roles: ['HEAD_OF_ANAESTHESIA', 'CONSULTANT_ANAESTHETIST'],
    owner: 'the Head of Anaesthesia and the anaesthetist on this case',
    ask: 'The pre-anaesthetic review for this patient is not on the app, so the '
      + 'trolley cannot move and the pharmacy has no prescription. See the patient '
      + 'and record the review, or send somebody who can.',
    tellAnaesthetist: true,
  },
  {
    code: 'NO_THEATRE',
    label: 'No theatre free for this case',
    roles: ['THEATRE_MANAGER'],
    owner: 'the Theatre Manager',
    ask: 'This emergency has no room. Free a theatre for it or say which one it is '
      + 'taking and when.',
  },
  {
    code: 'PREVIOUS_CASE_OVERRAN',
    label: 'Previous case overran — theatre still occupied',
    roles: ['THEATRE_MANAGER'],
    owner: 'the Theatre Manager',
    ask: 'The room this emergency was given is still running. Give it another room '
      + 'or say when the one it has will be free.',
  },
  {
    code: 'PATIENT_NOT_SENT',
    label: 'Patient not sent for / not arrived',
    roles: ['PORTER', 'THEATRE_MANAGER'],
    owner: 'the porter on duty and the Theatre Manager',
    ask: 'Go to the ward and bring this patient to the holding area now.',
  },
  {
    code: 'PATIENT_NOT_READY',
    label: 'Patient not ready (fasting, consent, prep, line)',
    roles: [],
    owner: 'the booking surgeon, whose team must ready the patient',
    ask: 'Your patient is not ready for theatre. Send somebody to the ward and get '
      + 'it done, or say what the case is waiting for.',
  },
  {
    code: 'NO_CONSENT',
    label: 'Consent not available',
    roles: [],
    owner: 'the booking surgeon',
    ask: 'There is no consent for this patient. Take it, or say who is doing so and '
      + 'when.',
  },
  {
    code: 'TEAM_ABSENT',
    label: 'Team members not on ground',
    roles: ['THEATRE_MANAGER', 'HEAD_OF_ANAESTHESIA', 'HEAD_OF_SURGERY'],
    owner: 'the Theatre Manager and the head of the service',
    ask: 'Somebody this case needs is not here. Find a replacement — chasing the '
      + 'same handset again does not put a body in the room.',
    needsDetail: true,
  },
  {
    code: 'TEAM_UNREACHABLE',
    label: 'Team members unreachable',
    roles: ['THEATRE_MANAGER', 'HEAD_OF_ANAESTHESIA', 'HEAD_OF_SURGERY'],
    owner: 'the Theatre Manager and the head of the service',
    ask: 'Somebody this case needs cannot be reached on any number. Find them or '
      + 'find a replacement.',
    needsDetail: true,
  },
  {
    code: 'NO_SURGEON',
    label: 'Surgeon not available',
    roles: ['HEAD_OF_SURGERY', 'HEAD_OF_OBSTETRICS_GYNAECOLOGY', 'CONSULTANT_SURGEON'],
    owner: 'the head of the surgical unit',
    ask: 'The surgeon for this emergency is not available. Name who is operating, or '
      + 'come yourself.',
  },
  {
    code: 'NO_NURSE',
    label: 'Scrub or circulating nurse not available',
    roles: ['THEATRE_MANAGER'],
    owner: 'the Theatre Manager',
    ask: 'This case has no scrub or circulating nurse. Assign one now.',
  },
  {
    code: 'THEATRE_NOT_READY',
    label: 'Theatre not ready or not cleaned',
    roles: ['THEATRE_MANAGER', 'CLEANER'],
    owner: 'the Theatre Manager and the cleaner on duty',
    ask: 'Turn the room round for this emergency now and say when it is ready.',
  },
  {
    code: 'EQUIPMENT_MISSING',
    label: 'Equipment missing or faulty',
    roles: ['BIOMEDICAL_ENGINEER', 'BIOMEDICAL_TECHNICIAN', 'THEATRE_MANAGER'],
    owner: 'the biomedical engineer',
    ask: 'A piece of equipment this emergency needs is missing or not working. Come '
      + 'to the theatre, or say where a working one is.',
    needsDetail: true,
  },
  {
    code: 'PACK_MISSING',
    label: 'Consumable, instrument set or drug pack not available',
    roles: ['THEATRE_STORE_KEEPER', 'CSSD_SUPERVISOR', 'CONSUMABLE_PACK_PROVIDER', 'PHARMACIST'],
    owner: 'the theatre store, CSSD and pharmacy',
    ask: 'Issue what this emergency needs now, or say where it can be got.',
    needsDetail: true,
  },
  {
    code: 'NO_BLOOD',
    label: 'Blood not available',
    roles: ['BLOODBANK_STAFF'],
    owner: 'the blood bank',
    ask: 'Say what blood is available for this patient and have it ready, or say how '
      + 'long it will take.',
  },
  {
    code: 'RESULTS_PENDING',
    label: 'Results or investigations not back',
    roles: ['EMERGENCY_LAB_SCIENTIST', 'LABORATORY_STAFF'],
    owner: 'the emergency laboratory',
    ask: 'Results for this emergency patient are holding the case up. Run them now, '
      + 'or say when they will be ready.',
    needsDetail: true,
  },
  {
    code: 'POWER_OR_UTILITY',
    label: 'Power, oxygen or water failure',
    roles: [
      'WORKS_SUPERVISOR', 'POWER_PLANT_OPERATOR', 'OXYGEN_UNIT_SUPERVISOR',
      'ELECTRICAL_TECHNICIAN', 'WATER_SUPPLY_SUPERVISOR',
    ],
    owner: 'works, the power plant, the oxygen unit and water supply',
    ask: 'A utility failure is stopping an emergency operation. Restore it, or say '
      + 'which theatre can take this case instead.',
    needsDetail: true,
  },
  {
    code: 'PATIENT_NOT_FIT',
    label: 'Patient not fit — needs optimisation first',
    roles: [],
    owner: 'the booking surgeon and the anaesthetist on this case',
    ask: 'This patient is not fit to go as they are. Optimise and re-list as soon as '
      + 'it is done — the case is held, not cancelled.',
    tellAnaesthetist: true,
    needsDetail: true,
  },
  {
    code: 'NO_ICU_BED',
    label: 'No ICU or recovery bed for afterwards',
    roles: ['THEATRE_MANAGER', 'RECOVERY_ROOM_NURSE'],
    owner: 'the Theatre Manager and recovery',
    ask: 'This case has nowhere to go afterwards. Find a bed, or say what the plan '
      + 'for recovery is.',
  },
  {
    code: 'OTHER',
    label: 'Other (say what)',
    roles: ['THEATRE_MANAGER'],
    owner: 'the Theatre Manager',
    ask: 'An emergency is being held up. Read what has been recorded and deal with '
      + 'it.',
    needsDetail: true,
  },
];

export const isEmergencyBlockerReason = (v: unknown): boolean =>
  EMERGENCY_BLOCKER_REASONS.some((r) => r.code === v);

export function blockerSpec(code: string): BlockerReasonSpec | null {
  return EMERGENCY_BLOCKER_REASONS.find((r) => r.code === code) ?? null;
}

/** The shortest detail worth recording. */
export const MIN_DETAIL = 3;

/**
 * Why this report cannot be filed yet, or null.
 *
 * Only two things are refused: no reason at all, and a reason whose whole
 * meaning is in the sentence nobody typed. Everything else goes through —
 * somebody standing in a theatre that cannot start must never be told the
 * form is not satisfied with them.
 */
export function blockerProblem(
  reason: string | null | undefined,
  detail: string | null | undefined,
): string | null {
  if (!reason) return 'Choose what is stopping this case.';
  const spec = blockerSpec(reason);
  if (!spec) return 'Choose what is stopping this case.';
  if (spec.needsDetail && (detail ?? '').trim().length < MIN_DETAIL) {
    return `Say in a line what is wrong — "${spec.label}" on its own does not tell `
      + `${spec.owner} what to bring or who to send.`;
  }
  return null;
}

export interface BlockerCaseFacts {
  patientName: string;
  folderNumber?: string | null;
  procedureName: string;
  theatreName?: string | null;
  surgeonName?: string | null;
  ward?: string | null;
}

/**
 * Whether recording this blocker met the standard, in plain words.
 *
 * HOUR_RULE_NOTICE promises that a blocker recorded within the hour satisfies
 * the standard. This is the sentence that keeps that promise, or that says
 * honestly it is too late to. Saying "you have complied" to somebody who has
 * not would be the kinder message and the one that destroys the rule.
 */
export function complianceLine(standing: HourRuleStanding): string {
  if (standing.minutesRemaining === null) {
    return 'The booking carries no time, so the hour cannot be counted against this case.';
  }
  if (standing.overdue) {
    return 'This was recorded AFTER the hour had already passed. It does not cure the '
      + 'breach — the record stands — but it does name what is in the way, and that '
      + 'is what the review will be asked about.';
  }
  return 'This was recorded inside the hour. The standard is satisfied for as long as '
    + 'the blocker is genuine and somebody is dealing with it.';
}

/** The blocker as one line, for a board, a bell or an audit. */
export function describeBlocker(b: {
  reason: string;
  detail?: string | null;
  reportedByName?: string | null;
}): string {
  const spec = blockerSpec(b.reason);
  const label = spec?.label ?? b.reason;
  const note = (b.detail ?? '').trim() ? `: ${(b.detail ?? '').trim()}` : '';
  const who = b.reportedByName ? ` — reported by ${b.reportedByName}` : '';
  return `${label}${note}${who}`;
}

const caseLine = (c: BlockerCaseFacts) =>
  `${c.patientName}${c.folderNumber ? ` (${c.folderNumber})` : ''} — ${c.procedureName}`
  + `${c.theatreName ? `, ${c.theatreName}` : ''}${c.ward ? `, from ${c.ward}` : ''}`;

/**
 * The chase, as the person who can clear it receives it.
 *
 * Top down: what is in the way, which case, how long is left, what THEY must
 * do, and how to answer. The thing they must do is above the fold because a
 * message read in a corridor is read until it stops being new.
 */
export function buildBlockerChaseMessage(input: {
  spec: BlockerReasonSpec;
  detail: string | null;
  recipientName: string;
  /** Why this person is getting it: "Theatre Manager", "blood bank". */
  recipientLabel: string;
  facts: BlockerCaseFacts;
  standing: HourRuleStanding;
  reportedByName: string;
  reportedByRole?: string | null;
}): string {
  const { spec, standing, facts } = input;
  const lines: string[] = [];

  lines.push(
    standing.overdue
      ? '🚨🚨 *EMERGENCY HELD UP — PAST THE HOUR* 🚨🚨'
      : '🚨 *EMERGENCY HELD UP — THE HOUR IS RUNNING* 🚨',
  );
  lines.push('');
  lines.push(`*What is stopping it:* ${spec.label}`);
  if ((input.detail ?? '').trim()) lines.push(`*Reported as:* ${(input.detail ?? '').trim()}`);
  lines.push('');
  lines.push(`*The case:* ${caseLine(facts)}`);
  if (facts.surgeonName) lines.push(`Surgeon: ${facts.surgeonName}`);

  lines.push('');
  lines.push(
    standing.deadline
      ? (standing.overdue
        ? `*It should have been on the table by ${deadlineClock(standing.deadline)}. `
          + `It is now ${standing.label}, and it has not started.*`
        : `*It must be on the table by ${deadlineClock(standing.deadline)} — ${standing.label}.*`)
      : '*This case is waiting to start.*',
  );

  lines.push('');
  lines.push(
    `${input.recipientName}, you are being chased as *${input.recipientLabel}* because `
    + 'this is yours to clear.',
  );
  lines.push(`👉 *${spec.ask}*`);

  lines.push('');
  lines.push(
    '*How to answer:* open the app → Emergency Surgery Booking, find this patient, and '
    + 'either record what you have done or report your own blocker on the case. A reply '
    + 'on this handset is not on the record; the app is.',
  );

  lines.push('');
  lines.push(
    `Reported by ${input.reportedByName}`
    + `${input.reportedByRole ? ` (${input.reportedByRole.replace(/_/g, ' ').toLowerCase()})` : ''}.`,
  );

  lines.push('');
  lines.push('────────────────────');
  lines.push(
    '*NOTICE.* A booked emergency must be on the table within one hour of booking. '
    + 'This blocker has been recorded against that hour and is held with the case '
    + 'permanently. It stays open until somebody records that it is cleared. '
    + 'At two hours the Chief Medical Director is informed; at three an invitation to '
    + 'the Theatre Audit Committee is drafted in the name of every person on the case '
    + '— and of whoever was named as holding it up.',
  );
  lines.push('────────────────────');
  lines.push('');
  lines.push('— UNTH Theatre, Operative Resource Manager');

  return withNetworkNotice(lines.join('\n'));
}

/** The short line for the in-app bell, where there is no room for the above. */
export function blockerNotificationLine(
  spec: BlockerReasonSpec,
  detail: string | null,
  standing: HourRuleStanding,
): string {
  const d = (detail ?? '').trim();
  return `${standing.overdue ? 'PAST THE HOUR. ' : `${standing.label}. `}`
    + `${spec.label}${d ? ` — ${d}` : ''}. ${spec.ask}`;
}

/**
 * What the board says while a blocker is open.
 *
 * A blocker closes when a person says it is cleared, and on no other
 * condition. Not on a timer, not because the case later started, not because
 * nobody mentioned it again — the same rule the water faults follow, and for
 * the same reason: a thing that closes itself was never recorded.
 */
export function reassessNotice(count: number): string {
  return count === 1
    ? 'One blocker is open on this case. It stays open until somebody records that it '
      + 'is cleared.'
    : `${count} blockers are open on this case. Each stays open until somebody records `
      + 'that it is cleared.';
}
