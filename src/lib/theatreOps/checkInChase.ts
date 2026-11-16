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
 * Plain arithmetic: how long before the scheduled start they answered.
 *
 * No judgement about WHAT they said — a nurse who tells the theatre at 06:00
 * that she cannot come has given it six hours to find cover, and that is
 * exactly the behaviour worth reinforcing. Negative means they answered after
 * the list was due to start.
 */
export function minutesBeforeStart(
  checkedInAt: Date | null,
  scheduledAt: Date | null,
): number | null {
  if (!scheduledAt || !checkedInAt) return null;
  return Math.round((scheduledAt.getTime() - checkedInAt.getTime()) / 60000);
}

/**
 * How early this person CONFIRMED THEY WERE COMING, in minutes.
 *
 * The policy layer on top of the arithmetic above. Null when they did not
 * confirm at all: UNAVAILABLE and REPLACED are honest answers and worth
 * having, but they are not something the theatre can plan an early start
 * around, so they never earn the early-confirmation praise.
 */
export function minutesAhead(member: ChaseMember, scheduledAt: Date | null): number | null {
  if (!member.status) return null;
  if (!CHECK_IN_META[member.status].counted) return null;
  return minutesBeforeStart(member.checkedInAt, scheduledAt);
}

/**
 * Everybody who answered at all — the people a thank-you goes to.
 *
 * Wider than the people who earn praise, on purpose. Somebody who confirmed
 * at 08:55 for a 09:00 list did the right thing too late to be useful, and
 * they are precisely the person who needs telling that it has to come before
 * the start time. Thanking only the exemplary leaves the ones who most need
 * the nudge hearing nothing at all.
 */
export function respondedMembers(members: ChaseMember[]): ChaseMember[] {
  return members.filter((m) => m.status !== null && m.status !== undefined);
}

/** Did this person say they were coming, as opposed to saying they were not? */
export const isConfirmation = (member: ChaseMember): boolean =>
  Boolean(member.status && CHECK_IN_META[member.status].counted);

export type ThanksTone =
  /** Confirmed, far enough ahead for the theatre to act on it. */
  | 'EARLY_CONFIRMED'
  /** Confirmed, but too late to plan around. Thanks, and a nudge. */
  | 'LATE_CONFIRMED'
  /** Told the theatre they could not come. Still worth thanking. */
  | 'DECLINED';

/**
 * Which thank-you this person has earned.
 *
 * Exported and tested separately because it decides whether somebody is
 * praised or gently corrected, and getting that backwards is worse than
 * sending nothing.
 */
export function thanksToneFor(
  member: ChaseMember,
  scheduledAt: Date | null,
  thresholdMinutes: number = EARLY_CONFIRM_MINUTES,
): ThanksTone {
  if (!isConfirmation(member)) return 'DECLINED';
  const ahead = minutesAhead(member, scheduledAt);
  if (ahead !== null && ahead >= thresholdMinutes) return 'EARLY_CONFIRMED';
  return 'LATE_CONFIRMED';
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
  | 'NOBODY_RESPONDED'
  | 'NO_SCHEDULED_TIME';

export const REFUSAL_MESSAGE: Record<RefusalReason, string> = {
  NOBODY_SILENT:
    'Everybody on this case has already answered. There is nobody to chase, and '
    + 'sending one anyway teaches the team that a chase does not read their reply.',
  NOBODY_RESPONDED:
    'Nobody on this case has checked in yet, so there is nobody to thank. Chase '
    + 'them first.',
  NO_SCHEDULED_TIME:
    'This case has no scheduled time on file, so there is no way to tell who '
    + 'answered in good time and who did not.',
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

/** "2 hours 15 minutes", "45 minutes". */
export function describeLead(minutes: number): string {
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  if (hours === 0) return `${mins} minute${mins === 1 ? '' : 's'}`;
  const h = `${hours} hour${hours === 1 ? '' : 's'}`;
  return mins > 0 ? `${h} ${mins} minutes` : h;
}

/**
 * The thank-you that goes to everybody who answered.
 *
 * THREE TONES, ONE MESSAGE SHAPE. The praise stays earned — only somebody who
 * confirmed far enough ahead to be acted on is told they did something
 * exemplary. But everybody who answered is thanked, because the alternative
 * is that the people who most need the nudge about timing are the only ones
 * who hear nothing.
 *
 * The reminder is appended only when it applies, and it names the actual
 * deadline rather than scolding: somebody who checked in at 08:55 knows they
 * were late, and does not need telling twice.
 *
 * Somebody who said they could NOT come is thanked too. Telling the theatre
 * at 06:00 that you are unavailable is more useful than silence, and it is
 * the behaviour least likely to be reinforced anywhere else.
 */
export function buildCheckInThanksMessage(opts: {
  member: ChaseMember;
  facts: CaseFacts;
  tone: ThanksTone;
  /** Minutes before the scheduled start that they answered. May be negative. */
  minutesBefore: number | null;
  thresholdMinutes?: number;
  note?: string | null;
  senderName?: string | null;
}): string {
  const { member, facts, tone, minutesBefore } = opts;
  const threshold = opts.thresholdMinutes ?? EARLY_CONFIRM_MINUTES;
  const at = `*${facts.procedureName}* (${facts.scheduledTime}${where(facts)})`;

  const lines: string[] = [];

  if (tone === 'EARLY_CONFIRMED') {
    lines.push(
      '*THANK YOU — EARLY CHECK-IN*',
      '',
      `Dear ${displayName(member)},`,
      '',
      `You confirmed your availability as *${member.roleOnCase}* for ${at} `
      + `*${describeLead(minutesBefore ?? 0)}* before the scheduled start.`,
      '',
      'That is what lets the theatre plan — and, when the whole team answers '
      + 'early, start early. It is noticed and it is appreciated.',
    );
  } else if (tone === 'LATE_CONFIRMED') {
    lines.push(
      '*THANK YOU FOR CHECKING IN*',
      '',
      `Dear ${displayName(member)},`,
      '',
      `Thank you for confirming your availability as *${member.roleOnCase}* for ${at}.`,
    );
    lines.push(
      '',
      '*One request.* Your answer came '
      + (minutesBefore !== null && minutesBefore < 0
        ? `*${describeLead(minutesBefore)} after* the scheduled start time.`
        : minutesBefore !== null
          ? `*${describeLead(minutesBefore)}* before the start time.`
          : 'close to the start time.'),
      '',
      `Please check in *at least ${describeLead(threshold)} before* your start time in `
      + 'future. The theatre cannot pull a list forward, move a case between rooms or '
      + 'call in cover on an answer that arrives as the patient is being sent for.',
    );
  } else {
    lines.push(
      '*THANK YOU FOR TELLING US*',
      '',
      `Dear ${displayName(member)},`,
      '',
      `Thank you for letting the theatre know you would not be available as `
      + `*${member.roleOnCase}* for ${at}. Saying so is far more useful than silence — `
      + 'it is what lets cover be arranged instead of a case being discovered short '
      + 'on the morning.',
    );
    if (minutesBefore !== null && minutesBefore < threshold) {
      lines.push(
        '',
        `*One request.* Where you can, tell us at least ${describeLead(threshold)} before `
        + 'the start time. The earlier it comes, the more likely the case still runs.',
      );
    }
  }

  const note = (opts.note ?? '').trim();
  if (note !== '') lines.push('', `_${note}_`);

  const sender = (opts.senderName ?? '').trim();
  lines.push('', sender !== '' ? `— ${sender}, Theatre Co-ordination` : '— Theatre Co-ordination');

  return lines.join('\n');
}

/** The one-line summary written into the in-app notification. */
export const chaseNotificationLine = (facts: CaseFacts): string =>
  `Please confirm whether you are coming to ${facts.procedureName} at ${facts.scheduledTime}.`;

export const thanksNotificationLine = (facts: CaseFacts, tone: ThanksTone): string =>
  tone === 'EARLY_CONFIRMED'
    ? `Thank you for confirming early for ${facts.procedureName}.`
    : tone === 'DECLINED'
      ? `Thank you for telling us about ${facts.procedureName}.`
      : `Thank you for checking in for ${facts.procedureName} — please do so earlier next time.`;
