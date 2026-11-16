// ============================================================
// Chasing a team for a check-in, and thanking the ones who answered early
// ------------------------------------------------------------
// The check-in board shows "5 of 5 yet to respond" and, until now, gave
// nobody a way to do anything about it. A coordinator could see that an
// entire team had said nothing about a 09:00 list and had to leave the screen
// to start ringing people.
//
// TWO ACTIONS, AND THEY ARE OPPOSITES ON PURPOSE.
//
//   CHASE goes only to the people who have said NOTHING. Not to the team —
//   to the silent. Someone who answered at 06:40 and then gets a "please
//   confirm you are coming" message learns that the chase does not read their
//   answer, and the next one goes unread. A chase that reaches people who
//   already complied is how a chase stops working.
//
//   COMMEND goes only to people who confirmed EARLY ENOUGH TO BE USEFUL, and
//   is refused outright when nobody qualifies. This follows the booking
//   commendation, whose own note says it plainly: a board that will thank
//   anybody on request produces commendations nobody values. The server
//   decides from the record; the button only asks.
//
// WHY EARLY MATTERS RATHER THAN MERELY PRESENT. The theatre can only move a
// start forward if it knows in time to move it. A confirmation that lands at
// 08:55 for a 09:00 list is honest and useless for planning; one that lands
// the evening before is what lets a list start early. So the threshold is
// measured against the scheduled time, not against whether they turned up.
// ============================================================

import { CHECK_IN_META, type CheckInStatus } from './checkIn';

/**
 * How far ahead a confirmation has to land to count as early.
 *
 * Sixty minutes: long enough that the theatre can still act on it — pull the
 * list forward, move a case between rooms, call in cover — and short enough
 * that somebody confirming on their way in on a normal morning still earns
 * it. A number the committee may want to change, which is why it is named
 * here rather than buried in a comparison.
 */
export const EARLY_CONFIRM_MINUTES = 60;

export interface ChaseMember {
  userId: string;
  name: string | null;
  roleOnCase: string;
  status: CheckInStatus | null;
  checkedInAt: Date | null;
  phoneNumber?: string | null;
}

export interface CaseFacts {
  procedureName: string;
  /** "09:00" as shown on the board. */
  scheduledTime: string;
  scheduledAt: Date | null;
  theatre: string | null;
  unit: string | null;
}

const displayName = (m: ChaseMember): string =>
  (m.name ?? '').trim() || 'Colleague';

/** Everybody who has said nothing at all. The only people a chase goes to. */
export function silentMembers(members: ChaseMember[]): ChaseMember[] {
  return members.filter((m) => m.status === null || m.status === undefined);
}

/**
 * How early this person confirmed, in minutes before the scheduled start.
 *
 * Null when either time is missing, or when they did not confirm they were
 * coming at all. Negative means they answered after the list was due to
 * start, which is not early by any reading.
 */
export function minutesAhead(member: ChaseMember, scheduledAt: Date | null): number | null {
  if (!scheduledAt || !member.checkedInAt) return null;
  if (!member.status) return null;
  // UNAVAILABLE and REPLACED are honest answers and worth having, but they
  // are not a confirmation that the theatre can plan an early start around.
  if (!CHECK_IN_META[member.status].counted) return null;
  return Math.round((scheduledAt.getTime() - member.checkedInAt.getTime()) / 60000);
}

/** Those who confirmed early enough for the theatre to act on it. */
export function commendableMembers(
  members: ChaseMember[],
  scheduledAt: Date | null,
  thresholdMinutes: number = EARLY_CONFIRM_MINUTES,
): ChaseMember[] {
  return members.filter((m) => {
    const ahead = minutesAhead(m, scheduledAt);
    return ahead !== null && ahead >= thresholdMinutes;
  });
}

export type RefusalReason =
  | 'NOBODY_SILENT'
  | 'NOBODY_EARLY'
  | 'NO_SCHEDULED_TIME';

export const REFUSAL_MESSAGE: Record<RefusalReason, string> = {
  NOBODY_SILENT:
    'Everybody on this case has already answered. There is nobody to chase, and '
    + 'sending one anyway teaches the team that a chase does not read their reply.',
  NOBODY_EARLY:
    `Nobody on this case confirmed at least ${EARLY_CONFIRM_MINUTES} minutes before the `
    + 'scheduled start, so there is nothing to commend yet. A commendation that is '
    + 'given on request rather than earned is one nobody values.',
  NO_SCHEDULED_TIME:
    'This case has no scheduled time on file, so there is no way to tell who '
    + 'confirmed early.',
};

const where = (facts: CaseFacts): string => {
  const parts = [facts.theatre, facts.unit].filter((p) => (p ?? '').trim() !== '');
  return parts.length > 0 ? ` (${parts.join(' · ')})` : '';
};

/**
 * The chase, written for somebody who may be mid-ward-round.
 *
 * It asks the one question the board cannot answer for them, says why it
 * matters in a single clause, and gives them the link. It does NOT threaten:
 * the standing consequences of silence live in the policy and on the
 * disciplinary route, and a chase that invents a sanction is one a consultant
 * replies to by ringing the Chairman rather than by checking in.
 */
export function buildCheckInChaseMessage(opts: {
  member: ChaseMember;
  facts: CaseFacts;
  link: string;
  note?: string | null;
  senderName?: string | null;
}): string {
  const { member, facts, link } = opts;
  const lines = [
    '*THEATRE CHECK-IN — PLEASE CONFIRM*',
    '',
    `Dear ${displayName(member)},`,
    '',
    `You are listed as *${member.roleOnCase}* for *${facts.procedureName}* at `
    + `*${facts.scheduledTime}*${where(facts)}.`,
    '',
    'The theatre does not yet know whether to expect you. Please say which of these '
    + 'is true — it takes one tap:',
    '',
    '  • Present',
    '  • On my way',
    '  • Delayed (and roughly how long)',
    '  • Not available (so cover can be arranged)',
    '',
    link,
    '',
    '*If you can be there earlier than the scheduled time, say so.* A list that knows '
    + 'its team is ready can start early; one that is still waiting on an answer cannot.',
  ];

  const note = (opts.note ?? '').trim();
  if (note !== '') lines.push('', `_${note}_`);

  const sender = (opts.senderName ?? '').trim();
  lines.push('', sender !== '' ? `— ${sender}, Theatre Co-ordination` : '— Theatre Co-ordination');

  return lines.join('\n');
}

/** The thank-you. Short, specific, and it names the actual benefit. */
export function buildCheckInCommendMessage(opts: {
  member: ChaseMember;
  facts: CaseFacts;
  minutesAhead: number;
  note?: string | null;
  senderName?: string | null;
}): string {
  const { member, facts } = opts;
  const hours = Math.floor(opts.minutesAhead / 60);
  const mins = opts.minutesAhead % 60;
  const ahead = hours > 0
    ? `${hours} hour${hours === 1 ? '' : 's'}${mins > 0 ? ` ${mins} minutes` : ''}`
    : `${mins} minutes`;

  const lines = [
    '*THANK YOU — EARLY CHECK-IN*',
    '',
    `Dear ${displayName(member)},`,
    '',
    `You confirmed your availability as *${member.roleOnCase}* for `
    + `*${facts.procedureName}* (${facts.scheduledTime}${where(facts)}) `
    + `*${ahead}* before the scheduled start.`,
    '',
    'That is what lets the theatre plan — and, when the whole team answers early, '
    + 'start early. It is noticed and it is appreciated.',
  ];

  const note = (opts.note ?? '').trim();
  if (note !== '') lines.push('', `_${note}_`);

  const sender = (opts.senderName ?? '').trim();
  lines.push('', sender !== '' ? `— ${sender}, Theatre Co-ordination` : '— Theatre Co-ordination');

  return lines.join('\n');
}

/** The one-line summary written into the in-app notification. */
export const chaseNotificationLine = (facts: CaseFacts): string =>
  `Please confirm whether you are coming to ${facts.procedureName} at ${facts.scheduledTime}.`;

export const commendNotificationLine = (facts: CaseFacts, ahead: number): string =>
  `Thank you for confirming ${ahead} minutes ahead of ${facts.procedureName}.`;
