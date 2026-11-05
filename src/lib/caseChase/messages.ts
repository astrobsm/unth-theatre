// ============================================================
// Writing to a surgeon, and to their unit consultant
// ------------------------------------------------------------
// TWO MESSAGES, NOT ONE SENT TWICE.
//
//   THE SURGEON gets their own cases, named, with what each is missing. They
//   are being asked to close a gap they can close this afternoon.
//
//   THE CONSULTANT gets the unit's cases grouped by whoever entered them, and
//   is asked for the one thing only they can do: speak to their residents. A
//   consultant sent the same list with the same ask as the surgeon has been
//   copied in, which is not supervision — it is an audience.
//
// IT NAMES THE CASES. A surgeon may have three patients on one list, and "your
// case is not ready" fits all of them equally badly. The patient and the
// folder number are what turn a figure into something somebody can go and look
// up, and these go to the clinician responsible for that patient's care.
//
// IT SAYS "NOT ON THE ORM", NEVER "NOT DONE". We know what the theatre can
// see. A consent signed on paper and sitting in the folder is a real consent,
// and a message that calls it missing will be answered, correctly, by somebody
// telling us we are wrong.
//
// AND IT ASKS ABOUT THE RESIDENTS. Most of these bookings are entered by the
// registrars and house officers working with the consultant, which is as it
// should be — it is departmental clerical work. What that means is that the
// person who can change the pattern is not always the person who left the
// gap, and a chase that never says so gets the same list next week.
// ============================================================

import {
  CASE_GAPS, fixableGaps, gapWords, type CaseGapCode,
} from './gaps';
import type { ChaseCase, ChaseGroup } from './collect';
import { withNetworkNotice } from '@/lib/comms/networkNotice';
import { LATE_CUTOFF_LABEL } from '@/lib/bookingLateness';

const SIGN_OFF = 'Theatre Management, UNTH Ituku-Ozalla';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "7 Oct" — the way a theatre list is read aloud. */
export function shortDay(day: string | null | undefined): string {
  if (!day) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ''}`.trim();
}

/** The patient, named for the clinician responsible for them. */
export function patientLabel(c: ChaseCase): string {
  if (!c.patientName) return 'a patient';
  return c.folderNumber ? `${c.patientName} (${c.folderNumber})` : c.patientName;
}

/** One line about one case: when, who, what, and what is missing. */
export function caseLine(c: ChaseCase): string {
  const when = [shortDay(c.scheduledDay), c.scheduledTime].filter(Boolean).join(' ');
  const gaps = c.gaps.map((g) => gapWords(g)).join('; ');
  return `• ${when} — ${patientLabel(c)} — ${c.procedureName} — ${gaps}`;
}

/** Role in words: "Consultant Surgeon". */
export function roleWords(role: string | null | undefined): string {
  return (role || '').split('_').filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Which gaps appear anywhere in a set of cases, in the canonical order. */
export function gapsPresent(cases: readonly ChaseCase[]): CaseGapCode[] {
  const seen: CaseGapCode[] = [];
  (['LATE_BOOKING', 'CONSENT', 'PRESCRIPTION', 'CONSUMABLES'] as CaseGapCode[]).forEach((code) => {
    if (cases.some((c) => c.gaps.indexOf(code) !== -1)) seen.push(code);
  });
  return seen;
}

/** How many cases are listed before the message starts quoting a count instead. */
export const MAX_CASES_LISTED = 8;

/**
 * The message to the surgeon whose cases these are.
 *
 * An appeal with a list attached. The list is the message: a surgeon who can
 * see which three of their patients have no pharmacy prescription can fix all
 * three before they leave the hospital, and that is the only outcome worth
 * sending anything for.
 */
export function buildSurgeonCaseChase(input: {
  personName: string;
  /** Their role, in words. */
  roleLabel?: string | null;
  periodLabel: string;
  group: ChaseGroup;
  /** Whether this person is the unit's consultant as well. Changes the ask. */
  isConsultant?: boolean;
}): string {
  const g = input.group;
  const role = (input.roleLabel || '').trim().toLowerCase();
  const article = /^[aeiou]/.test(role) ? 'an' : 'a';
  const present = gapsPresent(g.cases);
  const fixableHere = present.filter((c) => c !== 'LATE_BOOKING');

  const lines: string[] = [
    'UNTH Theatre — your booked cases',
    input.periodLabel,
    '',
    `Dear ${input.personName},`,
    '',
    role
      ? `As ${article} ${role}, these are the cases on the theatre list with your name on `
        + 'them. We are writing to ask for your help with what is still outstanding on '
        + 'them.'
      : 'These are the cases on the theatre list with your name on them, and we are '
        + 'writing to ask for your help with what is still outstanding on them.',
    '',
    'This is a request between colleagues, not a reprimand. Every one of these can be '
    + 'closed from the case screen in a couple of minutes, and closing them is worth far '
    + 'more to the theatre than any record of the shortfall.',
    '',
    'Where things stand:',
    `• ${g.cases.length} ${g.cases.length === 1 ? 'case' : 'cases'} with something outstanding`,
  ];

  if (g.counts.CONSENT > 0) lines.push(`• ${g.counts.CONSENT} with no consent on the ORM`);
  if (g.counts.PRESCRIPTION > 0) lines.push(`• ${g.counts.PRESCRIPTION} with no pharmacy prescription`);
  if (g.counts.CONSUMABLES > 0) lines.push(`• ${g.counts.CONSUMABLES} with no consumable pack request`);
  if (g.counts.LATE_BOOKING > 0) lines.push(`• ${g.counts.LATE_BOOKING} booked after the ${LATE_CUTOFF_LABEL} cut-off`);

  // The cases themselves. This is the half that gets acted on.
  lines.push('', 'The cases:');
  g.cases.slice(0, MAX_CASES_LISTED).forEach((c) => lines.push(caseLine(c)));
  if (g.cases.length > MAX_CASES_LISTED) {
    lines.push(`…and ${g.cases.length - MAX_CASES_LISTED} more on the case list in the app.`);
  }

  // What to do, per gap, and only for the gaps this person actually has. A
  // paragraph about consumables in a message to somebody whose consumables are
  // all in order is the paragraph that gets the rest skimmed.
  if (fixableHere.length > 0) {
    lines.push('', 'What each of these needs:');
    fixableHere.forEach((code) => {
      lines.push(`• ${CASE_GAPS[code].label}. ${CASE_GAPS[code].fix}`);
    });
  }

  // Why it matters — the consequence of the single commonest gap, not a
  // lecture on all four.
  const worst = fixableHere.length > 0 ? fixableHere[0] : present[0];
  if (worst) {
    lines.push('', `Why we are asking. ${CASE_GAPS[worst].consequence}`);
  }

  // What we can and cannot see. Said plainly, because the alternative is being
  // told so by a surgeon who did the work.
  if (g.counts.CONSENT > 0) {
    lines.push(
      '',
      'On consent: what we can see is the ORM, not the folder. Where the form has been '
      + 'signed on paper, it only needs photographing into the case — the holding-area '
      + 'nurse cannot act on a consent they cannot open, and the patient is the one who '
      + 'waits at the door while it is found.',
    );
  }

  // The residents. The whole reason this message exists in two versions.
  lines.push(
    '',
    input.isConsultant
      ? 'May we also ask you to speak to the residents and house officers working with '
        + 'you. Most of these bookings are entered by them, which is as it should be — but '
        + 'it means the gap is usually left by somebody who is not reading this message, '
        + 'and a word from you on the round closes more of these than any reminder we can '
        + 'send. One question — "is the consent and the pharmacy list on the ORM?" — is '
        + 'what prevents the whole of the above.'
      : 'And if these bookings are entered by the residents or house officers working with '
        + 'you, please have a word with them. A booking is departmental clerical work and '
        + 'properly theirs to enter — but the gap it leaves lands on your patient, on the '
        + 'morning of surgery. One question on the round — "is the consent and the '
        + 'pharmacy list on the ORM?" — prevents nearly all of this.',
    '',
    'If the screen cannot be found, or a list will not save, say so and somebody will come '
    + 'and show you or your team — that is a five-minute problem and we would far rather '
    + 'solve it than keep writing about it. And if something else is genuinely in the way, '
    + 'please tell the Theatre Manager or the Theatre Chairman.',
    '',
    'Thank you for your help with this, and for the cases that do arrive complete.',
    SIGN_OFF,
  );

  return withNetworkNotice(lines.join('\n'));
}

/**
 * The message to the unit's supervising consultant.
 *
 * Grouped by whoever entered the booking, because that is the information only
 * a consultant can use. A consultant cannot upload thirty consents; they can
 * ask one registrar, once, why four of theirs have none.
 */
export function buildConsultantCaseChase(input: {
  personName: string;
  /** The unit, as the cases record it. */
  unitLabel: string;
  periodLabel: string;
  group: ChaseGroup;
  /** The cases grouped by the person who entered them. */
  byBooker: { name: string; cases: ChaseCase[] }[];
}): string {
  const g = input.group;
  const present = gapsPresent(g.cases);
  const fixableHere = present.filter((c) => c !== 'LATE_BOOKING');

  const lines: string[] = [
    `UNTH Theatre — ${input.unitLabel}: cases awaiting paperwork`,
    input.periodLabel,
    '',
    `Dear ${input.personName},`,
    '',
    'You are recorded as the supervising consultant on the cases below. We are writing to '
    + 'you for something we cannot do ourselves, and which no reminder sent to the theatre '
    + 'can achieve: a word with the residents and house officers who enter these bookings.',
    '',
    `In ${input.unitLabel} for ${input.periodLabel}:`,
    `• ${g.cases.length} ${g.cases.length === 1 ? 'case' : 'cases'} with something outstanding`,
  ];

  if (g.counts.CONSENT > 0) lines.push(`• ${g.counts.CONSENT} with no consent on the ORM`);
  if (g.counts.PRESCRIPTION > 0) lines.push(`• ${g.counts.PRESCRIPTION} with no pharmacy prescription`);
  if (g.counts.CONSUMABLES > 0) lines.push(`• ${g.counts.CONSUMABLES} with no consumable pack request`);
  if (g.counts.LATE_BOOKING > 0) lines.push(`• ${g.counts.LATE_BOOKING} booked after the ${LATE_CUTOFF_LABEL} cut-off`);

  // By whoever entered them. Named, because "somebody in your unit" is not
  // something a consultant can act on, and because the pattern is almost
  // always concentrated in one or two people rather than spread.
  if (input.byBooker.length > 0) {
    lines.push('', 'Entered by:');
    input.byBooker.slice(0, 10).forEach((b) => {
      const n = b.cases.length;
      lines.push(`• ${b.name} — ${n} ${n === 1 ? 'case' : 'cases'}`);
    });
  }

  lines.push('', 'The cases:');
  g.cases.slice(0, MAX_CASES_LISTED).forEach((c) => lines.push(caseLine(c)));
  if (g.cases.length > MAX_CASES_LISTED) {
    lines.push(`…and ${g.cases.length - MAX_CASES_LISTED} more, on the unit's case list in the app.`);
  }

  const worst = fixableHere.length > 0 ? fixableHere[0] : present[0];
  if (worst) {
    lines.push('', `Why it matters. ${CASE_GAPS[worst].consequence}`);
  }

  lines.push(
    '',
    'What we are asking of you. Please would you raise it with your team on the round, and '
    + 'ask them to check three things on every case before they leave it: the consent is on '
    + 'the ORM, the pharmacy prescription is entered, and the consumable pack request is '
    + 'entered. Booking is properly their work and we are not asking you to do it — we are '
    + 'asking you to expect it of them, because that is the only thing that changes the '
    + 'pattern rather than the week.',
    '',
    'Where a consent exists on paper it only needs photographing into the case. Where it '
    + 'does not exist at all, that is the more serious half of this list, and it is the '
    + 'half the holding area will stop at the door on the morning of surgery.',
    '',
    'Nothing here is a disciplinary matter and nothing has been copied to anybody. If your '
    + 'unit is being prevented from doing this — a screen that will not save, a resident '
    + `with no account, a clinic that makes ${LATE_CUTOFF_LABEL} impossible — please tell the Theatre `
    + 'Manager or the Theatre Chairman, because a difficulty raised is one we can solve.',
    '',
    'With thanks for your support,',
    SIGN_OFF,
  );

  return withNetworkNotice(lines.join('\n'));
}

/**
 * The short line for a WhatsApp group or a notification title.
 *
 * Used where a full letter would not be read: the in-app notification that
 * tells somebody a message is waiting.
 */
export function chaseHeadline(group: ChaseGroup): string {
  const parts: string[] = [];
  if (group.counts.CONSENT > 0) parts.push(`${group.counts.CONSENT} without consent`);
  if (group.counts.PRESCRIPTION > 0) parts.push(`${group.counts.PRESCRIPTION} without a pharmacy list`);
  if (group.counts.CONSUMABLES > 0) parts.push(`${group.counts.CONSUMABLES} without a pack request`);
  if (group.counts.LATE_BOOKING > 0) parts.push(`${group.counts.LATE_BOOKING} booked late`);
  const n = group.cases.length;
  return `${n} ${n === 1 ? 'case' : 'cases'}: ${parts.join(', ')}`;
}

/** Only the gaps still worth asking about, for a caller deciding whether to send. */
export function worthSending(group: ChaseGroup): boolean {
  return fixableGaps(gapsPresent(group.cases)).length > 0 || group.counts.LATE_BOOKING > 0;
}
