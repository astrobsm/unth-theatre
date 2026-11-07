// ============================================================
// Chasing the whole emergency team, by name and by what each must do
// ------------------------------------------------------------
// Asked for on 6 November:
//
//   "add a functionality to chase all the team in emergency reminding them
//    of the rule that any emergency booked must be started within an hour,
//    chase everyone on the list, from surgeon to the anaesthetist etc,
//    anaesthetist must review and indicate the review on the app and every
//    team member must indicate availability"
//
// WHAT ALREADY EXISTED, AND WHY IT WAS NOT THIS. The delay ladder
// (emergencyEscalation.ts) waits for the hour to pass and then asks everybody
// why the case has not started. It is a post-mortem with a timer on it. By
// the time it speaks, the hour is gone and the patient is still on the ward.
//
// This is the other half: a chase anybody responsible can send NOW, while
// there is still time to make the hour, telling each person what is being
// waited on from them specifically.
//
// PERSONALISED BY ROLE, NEVER BROADCAST. The same lesson as the delay
// messages: a scrub nurse and the operating surgeon are waiting on different
// things, and a message that treats them alike is read as spam and answered
// by nobody. The anaesthetist is asked for the pre-anaesthetic review because
// that is the step that blocks the trolley; the porter is asked whether they
// can move the patient; everybody is asked to tap one button so the board
// stops guessing.
//
// IT NAMES WHO HAS NOT ANSWERED. A chase that says "please respond" to nine
// people, four of whom already have, teaches the four to ignore the next one.
// Each message says where the team stands and who is still silent, which is
// also the thing that makes the silent ones answer.
//
// NO CLINICAL DETAIL BEYOND WHAT THE JOB NEEDS. These go to personal handsets
// and get forwarded. The patient's name and folder number are already on
// every emergency message this hospital sends — the team cannot find the
// right patient without them — but nothing about the diagnosis beyond the
// procedure goes into the chase.
// ============================================================

import { withNetworkNotice } from '@/lib/comms/networkNotice';
import { askBlock, closing, isConsultantRole, opening } from './consultantTone';
import {
  HOUR_RULE_NOTICE, deadlineClock, type HourRuleStanding,
} from './hourRule';

/** The roles the availability table can record a response against. */
export const RESPONDABLE_TEAM_ROLES = [
  'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE', 'CIRCULATING_NURSE',
  'ANAESTHETIC_TECHNICIAN', 'PORTER', 'RECOVERY_ROOM_NURSE',
  'THEATRE_STORE_KEEPER', 'BIOMEDICAL_ENGINEER', 'CLEANER',
  'BLOODBANK_STAFF', 'PHARMACIST',
] as const;

export type RespondableTeamRole = (typeof RESPONDABLE_TEAM_ROLES)[number];

export const isRespondable = (role: string | null | undefined): boolean =>
  !!role && (RESPONDABLE_TEAM_ROLES as readonly string[]).includes(role);

/**
 * What each role is actually being waited on for.
 *
 * Written as an instruction with a verb in it. "Please be aware" produces
 * nothing; "bring the patient to the holding area now" produces a porter
 * walking to a ward.
 */
export const ROLE_DUTY: Record<string, string> = {
  SURGEON:
    'You booked this emergency, so the hour is yours. Confirm you are coming and start '
    + 'the case. If anything is stopping you — theatre, blood, consent, another case in '
    + 'the room — record it as a blocker on the app now. Moving it out of the way is '
    + 'somebody else’s job; naming it within the hour is yours.',
  ANAESTHETIST:
    'See the patient, do the pre-anaesthetic review and RECORD IT IN THE APP. The '
    + 'trolley does not move until the review is on the system, so a review done at the '
    + 'bedside and not entered holds the case up exactly as much as one not done.',
  ANAESTHETIC_TECHNICIAN:
    'Get the anaesthetic machine, airway trolley and drugs ready in the assigned theatre.',
  SCRUB_NURSE: 'Set up and scrub for this case.',
  CIRCULATING_NURSE: 'Receive the patient and circulate for this case.',
  RECOVERY_ROOM_NURSE: 'Have a recovery bay ready for this patient.',
  PORTER: 'Be ready to bring the patient from the ward to the holding area the moment you are called.',
  CLEANER: 'Have the theatre turned round and ready now.',
  PHARMACIST: 'Have the emergency drugs for this case ready to issue.',
  BLOODBANK_STAFF: 'Confirm what blood is available for this patient and have it ready.',
  BIOMEDICAL_ENGINEER: 'Confirm the theatre equipment for this case is working.',
  THEATRE_STORE_KEEPER: 'Issue the consumables this case needs.',
  THEATRE_MANAGER: 'A theatre and a team are needed for this case within the hour.',
  CSSD: 'Confirm the instrument sets for this case are sterile and available.',
};

/**
 * The two things every chased person must do, written as steps.
 *
 * ASKED FOR ON 7 NOVEMBER: "a whatsapp message chase button to call
 * attention of the team members of the booked emergency and steps to take to
 * indicate their availability and report any blocker."
 *
 * WHY STEPS AND NOT A SENTENCE. The chase already told people to tap their
 * availability, and the people who most need to are the ones who open this
 * app twice a month and do not know the screen is called Emergency Surgery
 * Booking, or that the buttons sit on the card rather than in a menu. "Tap
 * your availability" is an instruction to somebody who already knows where
 * it is. A numbered route, from the handset in their hand to the button, is
 * an instruction to everybody else.
 *
 * WHY THE BLOCKER STEP IS HERE AT ALL. Until 7 November the emergency board
 * had nowhere to record one, while the notice at the foot of every chase
 * promised that a blocker recorded within the hour satisfies the standard. A
 * rule that cannot be complied with on the screen that states it is not a
 * rule, it is a trap. The step says plainly that this is the part which
 * protects them, because it is true, and because it is the only framing that
 * gets a blocker recorded at minute forty instead of a silence.
 */
export const RESPONSE_STEPS = [
  '*WHAT TO DO \u2014 STEP BY STEP:*',
  '1. Open the app and sign in.',
  '2. Go to *Emergency Surgery Booking* in the menu.',
  '3. Find this patient among the active cases.',
  '4. Tap one of *I\u2019m Available*, *En Route*, *Arrived* or *Unavailable*. '
    + 'That is your availability. It is the only one the theatre can see, and a '
    + 'name with nothing beside it is read as "not coming".',
  '5. If anything is stopping you, or stopping the case, tap *Report a blocker*, '
    + 'choose what is in the way and say it in one line. Whoever can clear it is '
    + 'chased on WhatsApp the moment you press it.',
  '',
  'Step 5 is the one that protects you. An hour that passes with neither a start '
    + 'nor a recorded blocker is a breach by everybody on the case. An hour with a '
    + 'blocker recorded inside it is a case that could not go \u2014 which is a '
    + 'different thing entirely, and a defensible one.',
].join('\n');

export interface RollCallMember {
  userId: string;
  name: string;
  phoneNumber: string | null;
  /** Their part in THIS case, in words: "Anaesthetist (1st on call)". */
  roleOnCase: string;
  /** The EmergencyTeamRole value, where one exists for them. */
  teamRole: string | null;
  /**
   * The role on their ACCOUNT, which is a different thing from their part in
   * this case and the only safe way to tell a consultant from a registrar.
   * A roster slot reading "Anaesthetist (1st on call)" is either on any given
   * night, and addressing a registrar as a consultant reads as sarcasm.
   */
  userRole: string | null;
  /** case = named on the booking; roster = on the published duty roster;
   *  role = the first holder of the role, as a fallback contact. */
  source: 'case' | 'roster' | 'role';
  /** AVAILABLE | EN_ROUTE | ARRIVED | UNAVAILABLE | ON_ANOTHER_CASE, or null. */
  availability: string | null;
  respondedAt: Date | string | null;
  /** Anaesthetists: the pre-anaesthetic review is theirs to record. */
  mustReview: boolean;
  reviewDone: boolean;
  /** False for the few roles the availability table has no value for. */
  mustRespond: boolean;
}

export interface CaseFacts {
  patientName: string;
  folderNumber?: string | null;
  procedureName: string;
  theatreName?: string | null;
  surgeonName?: string | null;
  priority?: string | null;
  /** Who pressed the chase. A chase from nobody is easy to ignore. */
  chasedByName?: string | null;
}

/** The ordered slots the roll call is built from. */
export interface TeamSlotInput {
  label: string;
  teamRole: string | null;
  source: 'case' | 'roster' | 'role';
  person: {
    userId: string; name: string; phoneNumber?: string | null;
    /** The role on the account. Decides the register; see consultantTone. */
    userRole?: string | null;
  } | null;
}

/**
 * Everybody on this case, once each, in the order they should be chased.
 *
 * DEDUPLICATED BY PERSON, FIRST SLOT WINS. The surgeon who booked the case
 * can also be the consultant on call, and the anaesthetist named on the
 * booking is usually the one on the roster. Two messages to one phone about
 * one patient reads as a broken system; the first slot is kept because the
 * slots are ordered by how close that role is to the case.
 */
export function buildRollCall(
  slots: readonly TeamSlotInput[],
  responses: readonly {
    userId: string; status: string; respondedAt?: Date | string | null;
  }[],
  reviewerIds: readonly string[],
): RollCallMember[] {
  const byUser = new Map(responses.map((r) => [r.userId, r]));
  const reviewed = new Set(reviewerIds);
  const seen = new Set<string>();

  const out: RollCallMember[] = [];
  slots.forEach((slot) => {
    const p = slot.person;
    if (!p?.userId || seen.has(p.userId)) return;
    seen.add(p.userId);
    const response = byUser.get(p.userId);
    out.push({
      userId: p.userId,
      name: p.name,
      phoneNumber: p.phoneNumber ?? null,
      roleOnCase: slot.label,
      teamRole: slot.teamRole,
      userRole: p.userRole ?? null,
      source: slot.source,
      availability: response?.status ?? null,
      respondedAt: response?.respondedAt ?? null,
      mustReview: slot.teamRole === 'ANAESTHETIST',
      reviewDone: slot.teamRole === 'ANAESTHETIST' && reviewed.has(p.userId),
      mustRespond: isRespondable(slot.teamRole),
    });
  });
  return out;
}

/** A response that means the person is coming. */
const COMING = ['AVAILABLE', 'EN_ROUTE', 'ARRIVED'];

export interface RollCallSummary {
  total: number;
  /** Asked to tap a button at all. */
  expected: number;
  responded: number;
  coming: number;
  unavailable: number;
  /** Expected to respond and has not. */
  silent: RollCallMember[];
  /** Anaesthetists on the case, and whether any review is recorded. */
  anaesthetists: RollCallMember[];
  reviewDone: boolean;
  /** Nobody on the case has a phone number on file. */
  reachable: number;
}

export function summariseRollCall(members: readonly RollCallMember[]): RollCallSummary {
  const expected = members.filter((m) => m.mustRespond);
  const anaesthetists = members.filter((m) => m.mustReview);
  return {
    total: members.length,
    expected: expected.length,
    responded: expected.filter((m) => m.availability).length,
    coming: members.filter((m) => COMING.includes(m.availability ?? '')).length,
    unavailable: members.filter(
      (m) => m.availability === 'UNAVAILABLE' || m.availability === 'ON_ANOTHER_CASE',
    ).length,
    silent: expected.filter((m) => !m.availability),
    anaesthetists,
    reviewDone: anaesthetists.some((m) => m.reviewDone),
    reachable: members.filter((m) => !!m.phoneNumber).length,
  };
}

const caseLine = (c: CaseFacts) =>
  `${c.patientName}${c.folderNumber ? ` (${c.folderNumber})` : ''} — ${c.procedureName}`
  + `${c.theatreName ? `, ${c.theatreName}` : ''}`;

/**
 * The chase, as one person receives it.
 *
 * Shape is fixed and short: what the case is, how long is left, what YOU are
 * being waited on for, where the team stands, and the rule. A message read
 * on a phone in a corridor is read from the top until it stops being new.
 */
export function buildTeamChaseMessage(input: {
  member: RollCallMember;
  facts: CaseFacts;
  standing: HourRuleStanding;
  summary: RollCallSummary;
  /** Anything the person pressing the chase wants to add. */
  note?: string | null;
}): string {
  const { member, facts, standing, summary } = input;
  const lines: string[] = [];

  lines.push(
    standing.overdue
      ? '🚨🚨 *EMERGENCY PAST THE HOUR — NOT STARTED* 🚨🚨'
      : '🚨 *EMERGENCY — THE HOUR IS RUNNING* 🚨',
  );
  lines.push('');
  const consultant = isConsultantRole(member.userRole);

  if (consultant) {
    opening({ name: member.name, label: member.roleOnCase, consultant })
      .forEach((l) => lines.push(l));
    lines.push('');
  } else {
    lines.push(`${member.name}, you are the *${member.roleOnCase}* on this emergency:`);
  }
  lines.push(caseLine(facts));
  if (facts.surgeonName && member.teamRole !== 'SURGEON') {
    lines.push(`Surgeon: ${facts.surgeonName}`);
  }
  lines.push('');

  lines.push(
    standing.deadline
      ? (standing.overdue
        ? `*It should have been on the table by ${deadlineClock(standing.deadline)}. `
          + `It is now ${standing.label}, and it has not started.*`
        : `*It must be on the table by ${deadlineClock(standing.deadline)} — ${standing.label}.*`)
      : '*This case is waiting to start.*',
  );
  if (standing.setByRequiredBy) {
    lines.push('(That is the time the surgeon asked for, which is sooner than the hour.)');
  }

  lines.push('');
  askBlock(
    ROLE_DUTY[member.teamRole ?? ''] ?? ROLE_DUTY[member.roleOnCase]
      ?? 'Confirm you are coming to this case.',
    consultant,
  ).forEach((l) => lines.push(l));

  if (member.mustReview && !member.reviewDone) {
    lines.push('');
    lines.push(
      '⚠️ *The pre-anaesthetic review for this patient is not on the app yet.* '
      + 'Open the emergency case and record it. Until it is there, the theatre has no '
      + 'anaesthetic plan, the pharmacy has no prescription, and the holding area will '
      + 'not take the patient.',
    );
  }

  if (member.mustRespond) {
    lines.push('');
    lines.push(
      member.availability
        ? `You have already answered *${member.availability.replace(/_/g, ' ').toLowerCase()}*. `
          + 'If that has changed, update it on the app.'
        : '👉 *Open the app and tap one:* I’m Available, En Route, Arrived, or Unavailable. '
          + 'Nobody can plan around a name with nothing beside it, and "no answer" is '
          + 'read as "not coming".',
    );
  }

  lines.push('');
  lines.push('');
  lines.push(RESPONSE_STEPS);

  lines.push('');
  lines.push(
    `*Where the team stands:* ${summary.responded} of ${summary.expected} have answered`
    + `${summary.coming > 0 ? `, ${summary.coming} coming` : ''}`
    + `${summary.unavailable > 0 ? `, ${summary.unavailable} unavailable` : ''}.`
    + (summary.anaesthetists.length > 0
      ? ` Pre-anaesthetic review: ${summary.reviewDone ? 'recorded' : 'NOT YET RECORDED'}.`
      : ''),
  );
  if (summary.silent.length > 0) {
    const named = summary.silent.slice(0, 6).map((m) => `${m.name} (${m.roleOnCase})`);
    const rest = summary.silent.length - named.length;
    lines.push(`Still no answer from: ${named.join(', ')}${rest > 0 ? ` +${rest} more` : ''}.`);
  }

  if ((input.note ?? '').trim()) {
    lines.push('');
    lines.push(`*Note:* ${(input.note ?? '').trim()}`);
  }

  // The formal notice, last and whole. It is the same text for everybody --
  // a standard that is worded one way for the surgeon and another for the
  // scrub nurse is not a standard -- and it goes at the bottom because the
  // thing that has to be read first is what this person must do in the next
  // ten minutes, not the rule they already know.
  lines.push('');
  lines.push('────────────────────');
  lines.push(HOUR_RULE_NOTICE);
  if (member.teamRole === 'SURGEON') {
    lines.push('');
    lines.push(
      '*This booking is in your name.* The indictment for an hour passed with '
      + 'neither a start nor a recorded blocker is recorded against the booking '
      + 'surgeon first.',
    );
  }
  lines.push('────────────────────');
  closing(consultant).forEach((l) => { lines.push(''); lines.push(l); });
  lines.push('');
  lines.push(
    facts.chasedByName
      ? `— ${facts.chasedByName}, UNTH Theatre`
      : '— UNTH Theatre, Operative Resource Manager',
  );

  return withNetworkNotice(lines.join('\n'));
}

/** The short line for the in-app bell, where there is no room for the above. */
export function chaseNotificationLine(
  member: RollCallMember,
  standing: HourRuleStanding,
): string {
  const duty = member.mustReview && !member.reviewDone
    ? 'Record the pre-anaesthetic review on the app'
    : 'Tap your availability on the app';
  return `${standing.overdue ? `${standing.label}. ` : `${standing.label}. `}`
    + `You are the ${member.roleOnCase}. ${duty}.`;
}
