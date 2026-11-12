// ============================================================
// Writing to the head of a department about its roster
// ------------------------------------------------------------
// FOUR DIFFERENT LETTERS, not one with a number swapped. "You submitted it
// eleven days late", "you drafted it and never published it" and "there is
// nothing at all for next month" are three different conversations, and the
// third is far more serious than the first. Sending the same words for all of
// them is how a chase comes to be read as a form letter.
//
// THE DRAFTED-NOT-PUBLISHED CASE IS THE KIND ONE. Somebody did the work. They
// typed in a month of shifts and then, reasonably, assumed that was that. The
// letter says so, says where the button is, and does not treat them as though
// they had done nothing — because they have done nearly all of it, and the
// theatre is one tap from having a roster.
//
// AND IT NAMES WHAT A ROSTER DRIVES. A head of department asked to meet a
// deadline for its own sake will meet it when convenient. Told that the duty
// board cannot attribute a single duty to their staff without it — that their
// own people are being shown as "not on the published roster" — they tend to
// publish it the same afternoon.
// ============================================================

import {
  ROSTER_DUE_DAYS_BEFORE, STATE_LABELS, type RosterAssessment, type RosterPeriod,
} from './overdue';
import { withNetworkNotice } from '@/lib/comms/networkNotice';

const SIGN_OFF = 'Theatre Management, UNTH Ituku-Ozalla';

/** "7 November 2026", from YYYY-MM-DD. */
export function longDay(day: string | null | undefined): string {
  if (!day) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}

/**
 * What a published roster actually does, in the hospital's own terms.
 *
 * The persuasive half of every one of these letters, so it is written once.
 */
const WHAT_IT_DRIVES =
  'A published roster is not an administrative return. It is what the on-duty board reads, '
  + 'what the theatre meal counts are ordered against, what the booking screen uses to '
  + 'offer a name when a case needs cover, and what the duty board uses to work out whose '
  + 'duty a case was. Until it is published, none of that can see your department: your '
  + 'own staff appear on the duty board as "not on the published roster", and a colleague '
  + 'who worked every night of the month can be shown as having been on none of them.';

/** The ask, which is the same in every version and deliberately small. */
const THE_ASK =
  'Please would you publish it on the ORM — Roster, your department, then Publish. '
  + 'Entering the rows is the work; publishing is one button, and it is the only part the '
  + 'rest of the hospital can see.';

export interface RosterChaseInput {
  personName: string;
  /** Their role, in words: "Consultant Anaesthetist". */
  roleLabel?: string | null;
  /** The department, as its own page names it: "Anaesthetic Technicians". */
  deptLabel: string;
  period: RosterPeriod;
  assessment: RosterAssessment;
  /**
   * How many periods in a row this has already happened, not counting the one
   * being written about. Period-neutral since the board went weekly: the same
   * message is now sent about a week far more often than about a month.
   */
  priorConsecutive?: number | null;
  /** Words from theatre management, added on the screen. */
  note?: string | null;
}

/**
 * The letter to a head of department about a roster.
 *
 * An appeal, consistent with every other chase in this system: the outcome
 * wanted is a published roster this afternoon, and a message that reads as a
 * reprimand produces a defensive head of department rather than a roster.
 */
export function buildRosterChase(input: RosterChaseInput): string {
  const a = input.assessment;
  const role = (input.roleLabel || '').trim().toLowerCase();
  const article = /^[aeiou]/.test(role) ? 'an' : 'a';
  const who = role ? `As ${article} ${role}` : 'As the colleague who holds this duty';

  const lines: string[] = [
    `UNTH Theatre — ${input.deptLabel} roster, ${input.period.label}`,
    '',
    `Dear ${input.personName},`,
    '',
  ];

  // ── What has happened, in its own words ──────────────────────────────
  if (a.state === 'MISSING') {
    lines.push(
      `${who}, you are the person we come to about the ${input.deptLabel.toLowerCase()} `
      + `roster. There is nothing on the ORM for ${input.period.label}.`,
      '',
      `It was due on ${longDay(a.dueDay)} — ${ROSTER_DUE_DAYS_BEFORE} days before the `
      + `period begins — and that is now `
      + `${a.daysOverdue ?? 0} ${(a.daysOverdue ?? 0) === 1 ? 'day' : 'days'} ago. We are `
      + 'writing to ask you to put it in, and to ask whether something is preventing it.',
    );
  } else if (a.state === 'DRAFTED_NOT_PUBLISHED') {
    lines.push(
      `${who}, the ${input.deptLabel.toLowerCase()} roster for ${input.period.label} has `
      + `been entered — ${a.draftRows} ${a.draftRows === 1 ? 'row' : 'rows'} are sitting `
      + 'on the ORM — but it has never been published.',
      '',
      'We want to be clear that the work has been done, and thank you for it. The '
      + 'difficulty is that a draft is invisible to everything outside your own page: '
      + 'nothing in this hospital reads draft rows, by design, so as far as the theatre is '
      + `concerned ${input.deptLabel.toLowerCase()} has submitted nothing for `
      + `${input.period.label}.`,
      '',
      `It was due on ${longDay(a.dueDay)}`
      + (a.daysOverdue
        ? `, ${a.daysOverdue} ${a.daysOverdue === 1 ? 'day' : 'days'} ago.`
        : '.'),
    );
  } else if (a.state === 'LATE') {
    lines.push(
      `${who}, thank you for the ${input.deptLabel.toLowerCase()} roster for `
      + `${input.period.label}. We are writing about when it arrived rather than whether.`,
      '',
      `It was due on ${longDay(a.dueDay)} and was published on `
      + `${longDay(a.firstPublishedDay)} — ${a.daysLate} `
      + `${a.daysLate === 1 ? 'day' : 'days'} late.`,
    );
  } else {
    // Defensive: the board does not offer a chase for an on-time roster, and
    // a letter telling somebody off for work they did properly is the worst
    // thing this module could produce.
    lines.push(
      `${who}, the ${input.deptLabel.toLowerCase()} roster for ${input.period.label} was `
      + 'published on time. There is nothing outstanding, and nothing is being asked of '
      + 'you — thank you.',
      '',
      SIGN_OFF,
    );
    return withNetworkNotice(lines.join('\n'));
  }

  // ── A pattern, where there is one ────────────────────────────────────
  if (input.priorConsecutive && input.priorConsecutive > 0) {
    lines.push(
      '',
      `This is the ${input.priorConsecutive + 1}${input.priorConsecutive + 1 === 2 ? 'nd' : input.priorConsecutive + 1 === 3 ? 'rd' : 'th'} `
      + `time in a row. We mention it not to keep a score but because a pattern usually `
      + `means something structural — a list you are waiting on, somebody on leave, an `
      + `account that cannot reach the screen — and those are things we can actually `
      + `help with.`,
    );
  }

  // ── Why, and what to do ──────────────────────────────────────────────
  lines.push(
    '',
    `Why it matters. ${WHAT_IT_DRIVES}`,
    '',
    THE_ASK,
  );

  if (a.state === 'LATE') {
    lines.push(
      '',
      `For ${input.period.label} nothing further is needed. We are asking about the next `
      + `one: the roster for a period is due ${ROSTER_DUE_DAYS_BEFORE} days before it `
      + 'begins, so that pharmacy, the pack providers and the kitchen can plan against it '
      + 'and so that your own staff know their nights in time to arrange their lives '
      + 'around them.',
    );
  }

  // ── The way out, and the supervision ask ─────────────────────────────
  lines.push(
    '',
    'If somebody else in your department prepares it, please would you see that they '
    + 'publish it as well as enter it — that is the step that is most often missed, and '
    + 'it is missed by people who believe they have finished. A word from you is worth more '
    + 'than any reminder we can send them.',
    '',
    'And if something is genuinely in the way — you are waiting on another department, '
    + 'the person who does it is on leave, the screen will not accept a row, your account '
    + 'cannot reach your department’s page — please tell the Theatre Manager or the '
    + 'Theatre Chairman. A difficulty raised is one we can solve; one we never hear about '
    + 'simply repeats next month.',
  );

  if (input.note && input.note.trim()) {
    lines.push('', input.note.trim());
  }

  lines.push(
    '',
    'Thank you for your cooperation, and for the work your department does.',
    SIGN_OFF,
  );

  return withNetworkNotice(lines.join('\n'));
}

/** The short form, for a notification title and the board. */
export function rosterHeadline(input: {
  deptLabel: string;
  period: RosterPeriod;
  assessment: RosterAssessment;
}): string {
  const a = input.assessment;
  const what = STATE_LABELS[a.state].toLowerCase();
  if (a.state === 'LATE') {
    return `${input.deptLabel} roster for ${input.period.label}: ${what} by ${a.daysLate} `
      + `${a.daysLate === 1 ? 'day' : 'days'}`;
  }
  if (a.daysOverdue) {
    return `${input.deptLabel} roster for ${input.period.label}: ${what}, `
      + `${a.daysOverdue} ${a.daysOverdue === 1 ? 'day' : 'days'} overdue`;
  }
  return `${input.deptLabel} roster for ${input.period.label}: ${what}`;
}
