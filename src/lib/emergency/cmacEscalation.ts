// ============================================================
// Two hours gone: hand the CMAC the case and the team's numbers
// ------------------------------------------------------------
// Asked for on 7 November:
//
//   "after 2 hour without the case starting a dynamic button appears that
//    sends a message to the c-mac about the emergency case with the phone
//    numbers of the team members on the case so he can reach out to them"
//
// WHAT ALREADY EXISTED AND WHY IT IS NOT THIS. The delay ladder
// (lib/emergencyEscalation.ts) informs the Chief Medical Director at two
// hours by itself. That is a notification: it says a case is late. This is
// different in the thing that actually matters at hour two — it hands a
// named officer a WORKING DIRECTORY. By then the problem is no longer that
// nobody knows; it is that the person with the authority to break the
// deadlock has to find seven phone numbers across three departments before
// he can use it. Twenty minutes of an executive's evening go into that
// search, and the patient is still on the ward.
//
// So the message is built around the list. Role, name, number, and what each
// person has already said — one tap per line on the handset he is reading it
// on. Nothing else in it is longer than it has to be.
//
// WHY A BUTTON AND NOT AN AUTOMATIC SEND. Deliberate, and it is the same
// judgement as the team chase. An automatic message to the CMAC on every case
// that passes two hours would arrive on nights when theatre already has it in
// hand, and an executive who learns that the alert is usually noise stops
// reading the one that is not. A person decides this case needs him, and
// their name goes on it.
//
// NUMBERS GO TO AN OFFICER, NOT TO A GROUP. Staff phone numbers are internal
// and this is the hospital's own management using them for the purpose they
// were given for. The message is addressed to named CMAC/DCMAC accounts
// individually — never to a broadcast list, and the directory is not repeated
// into the team's own chase messages, which go to the whole case.
// ============================================================

import { withNetworkNotice } from '@/lib/comms/networkNotice';
import { toWhatsAppNumber } from '@/lib/comms/whatsapp';
import { deadlineClock, type HourRuleStanding } from './hourRule';
import type { RollCallMember } from './teamChase';
import type { ReviewState } from './assignmentChase';

/** How long a booked emergency may sit before the CMAC can be handed it. */
export const CMAC_AFTER_MINUTES = 120;

/**
 * Who hears it, in order of who should.
 *
 * CMAC is the officer named in the request. DC_MAC deputises. The Chief
 * Medical Director is last and only if neither is registered — the ladder
 * already informs the CMD at two hours on its own, so duplicating that is
 * noise, but an escalation that reaches nobody is worse.
 */
export const CMAC_ROLES = ['CMAC', 'DC_MAC'] as const;
export const CMAC_FALLBACK_ROLES = ['CHIEF_MEDICAL_DIRECTOR'] as const;

export const CMAC_LABELS: Record<string, string> = {
  CMAC: 'Chairman, Medical Advisory Committee',
  DC_MAC: 'Deputy Chairman, Medical Advisory Committee',
  CHIEF_MEDICAL_DIRECTOR: 'Chief Medical Director',
};

const asDate = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const spell = (mins: number): string => {
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  if (h === 0) return `${r} minute${r === 1 ? '' : 's'}`;
  if (r === 0) return `${h} hour${h === 1 ? '' : 's'}`;
  return `${h} h ${r} m`;
};

export interface CmacStanding {
  /** May the button be shown at all? */
  due: boolean;
  /** Minutes since the case was booked. Null if there is no booking time. */
  waitedMinutes: number | null;
  /** "2 h 14 m", for the button and the message. */
  waited: string;
  /** How long until the button appears, where it has not yet. */
  minutesUntilDue: number | null;
}

/**
 * Whether this case has sat long enough for the CMAC to be handed it.
 *
 * A settled case — started, completed, cancelled — is never due, however long
 * it took. The question the CMAC is being asked is "will you ring these
 * people", and there is nobody to ring about an operation already under way.
 */
export function cmacStanding(
  booking: { requestedAt: Date | string; settled?: boolean },
  now: Date = new Date(),
): CmacStanding {
  const booked = asDate(booking.requestedAt);
  if (!booked || booking.settled) {
    return { due: false, waitedMinutes: null, waited: 'an unrecorded time', minutesUntilDue: null };
  }
  const waitedMinutes = Math.max(0, Math.round((now.getTime() - booked.getTime()) / 60_000));
  return {
    due: waitedMinutes >= CMAC_AFTER_MINUTES,
    waitedMinutes,
    waited: spell(waitedMinutes),
    minutesUntilDue: waitedMinutes >= CMAC_AFTER_MINUTES
      ? null
      : CMAC_AFTER_MINUTES - waitedMinutes,
  };
}

/** A number as a person taps it, not as the API stores it. */
export function dialable(phone: string | null | undefined): string | null {
  const wa = phone ? toWhatsAppNumber(phone) : null;
  return wa ? `+${wa}` : null;
}

/** What somebody has said about coming, in words. */
export function availabilityWord(status: string | null | undefined): string {
  if (!status) return 'no answer';
  return status.replace(/_/g, ' ').toLowerCase();
}

/**
 * The directory: the whole point of this message.
 *
 * One line per person — role, name, number, and what they have already said —
 * so the officer reading it can work down the list with his thumb. People
 * with no number on file are listed LAST and plainly marked, rather than
 * dropped: "there is no number on the system for the scrub nurse" is itself
 * something the CMAC should know, and silently omitting them would make the
 * list look complete when it is not.
 */
export function teamDirectory(members: readonly RollCallMember[]): string {
  if (members.length === 0) {
    return '*TEAM:* nobody is named on this case and no on-call roster is published '
      + 'for it. That is itself the problem to deal with first.';
  }

  const reachable = members.filter((m) => dialable(m.phoneNumber));
  const unreachable = members.filter((m) => !dialable(m.phoneNumber));

  const lines: string[] = ['*THE TEAM ON THIS CASE — NUMBERS TO REACH THEM:*'];

  reachable.forEach((m) => {
    lines.push(
      `• *${m.roleOnCase}* — ${m.name}`
      + `\n   ${dialable(m.phoneNumber)}  ·  ${availabilityWord(m.availability)}`
      + (m.mustReview ? `  ·  review ${m.reviewDone ? 'recorded' : 'NOT recorded'}` : ''),
    );
  });

  if (unreachable.length > 0) {
    lines.push('');
    lines.push(
      `*No phone number is on the system for:* ${unreachable
        .map((m) => `${m.name} (${m.roleOnCase})`).join(', ')}.`,
    );
  }

  return lines.join('\n');
}

export interface CmacCaseFacts {
  patientName: string;
  folderNumber?: string | null;
  procedureName: string;
  diagnosis?: string | null;
  ward?: string | null;
  theatreName?: string | null;
  surgeonName?: string | null;
  priority?: string | null;
  status?: string | null;
  /** Who pressed it. Their name goes on the escalation. */
  escalatedByName?: string | null;
  escalatedByRole?: string | null;
}

/** An open blocker, as the CMAC needs to see it. */
export interface OpenBlocker {
  label: string;
  detail?: string | null;
  reportedByName?: string | null;
}

/**
 * The escalation, as the CMAC receives it.
 *
 * Shape: what has happened, the case, why it has not gone, the numbers, and
 * what is being asked of him. The directory sits above the notice because it
 * is the thing he is meant to act on, and below the reason because he will
 * ask "why" before he rings anybody.
 */
export function buildCmacMessage(input: {
  recipientName: string;
  recipientLabel: string;
  facts: CmacCaseFacts;
  standing: HourRuleStanding;
  cmac: CmacStanding;
  members: readonly RollCallMember[];
  review: ReviewState;
  blockers: readonly OpenBlocker[];
  responded: number;
  expected: number;
  note?: string | null;
}): string {
  const { facts, standing, cmac, review, blockers } = input;
  const lines: string[] = [];

  lines.push('🚨🚨🚨 *EMERGENCY NOT OPERATED — TWO HOURS* 🚨🚨🚨');
  lines.push('');
  lines.push(`${input.recipientName}, ${input.recipientLabel}:`);
  lines.push('');
  lines.push(
    `An emergency booked *${cmac.waited} ago* has still not gone to theatre. `
    + 'It is escalated to you so that you can reach the people on it directly — '
    + 'their numbers are below.',
  );

  lines.push('');
  lines.push(
    `*Patient:* ${facts.patientName}${facts.folderNumber ? ` (${facts.folderNumber})` : ''}`,
  );
  lines.push(`*Procedure:* ${facts.procedureName}`);
  if (facts.diagnosis) lines.push(`*Diagnosis:* ${facts.diagnosis}`);
  if (facts.ward) lines.push(`*Ward:* ${facts.ward}`);
  lines.push(`*Theatre:* ${facts.theatreName ?? 'NONE ASSIGNED'}`);
  if (facts.surgeonName) lines.push(`*Booking surgeon:* ${facts.surgeonName}`);
  if (facts.priority) lines.push(`*Priority:* ${facts.priority}`);
  if (standing.deadline) {
    lines.push(`*Should have started by:* ${deadlineClock(standing.deadline)} — ${standing.label}`);
  }

  // Why it has not gone. Recorded fact only: a blocker somebody filed, or the
  // plain absence of one. Guessing here would be the one thing that makes an
  // executive distrust the whole message.
  lines.push('');
  if (blockers.length > 0) {
    lines.push('*WHAT HAS BEEN RECORDED AS STOPPING IT:*');
    blockers.forEach((b) => lines.push(
      `• ${b.label}${(b.detail ?? '').trim() ? ` — ${(b.detail ?? '').trim()}` : ''}`
      + `${b.reportedByName ? ` (reported by ${b.reportedByName})` : ''}`,
    ));
  } else {
    lines.push(
      '*NO BLOCKER HAS BEEN RECORDED ON THIS CASE.* Two hours have passed with neither a '
      + 'start nor any recorded reason — under the theatre standard that is a breach by '
      + 'everybody on the case, the booking surgeon first.',
    );
  }

  lines.push('');
  lines.push(review.done
    ? `Anaesthetic review: recorded by ${review.reviewerName ?? 'an anaesthetist'}.`
    : review.started
      ? `Anaesthetic review: started by ${review.reviewerName ?? 'an anaesthetist'} and not finished.`
      : 'Anaesthetic review: NOT DONE. The patient cannot be sent for until it is recorded.');
  lines.push(
    `Team response: ${input.responded} of ${input.expected} have said whether they are coming.`,
  );

  lines.push('');
  lines.push(teamDirectory(input.members));

  if ((input.note ?? '').trim()) {
    lines.push('');
    lines.push(`*Note from ${facts.escalatedByName ?? 'the sender'}:* ${(input.note ?? '').trim()}`);
  }

  lines.push('');
  lines.push('────────────────────');
  lines.push(
    '*This escalation was sent by a named member of staff, not automatically, and is '
    + 'recorded against the case.* At three hours an invitation to appear before the '
    + 'Theatre Audit Committee is drafted in the name of every person on it.',
  );
  lines.push('────────────────────');
  lines.push('');
  lines.push(
    facts.escalatedByName
      ? `— ${facts.escalatedByName}`
        + `${facts.escalatedByRole ? `, ${facts.escalatedByRole.replace(/_/g, ' ').toLowerCase()}` : ''}`
        + ', UNTH Theatre'
      : '— UNTH Theatre, Operative Resource Manager',
  );

  return withNetworkNotice(lines.join('\n'));
}

/** The short line for the in-app bell. */
export function cmacNotificationLine(
  facts: CmacCaseFacts,
  cmac: CmacStanding,
  reachable: number,
): string {
  return `${facts.procedureName} booked ${cmac.waited} ago and not started. `
    + `${reachable} team member${reachable === 1 ? '' : 's'} with numbers are listed for you `
    + 'to reach directly.';
}
