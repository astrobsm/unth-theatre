// ============================================================
// Writing to the consultant surgeon, and to the surgeon on the case
// ------------------------------------------------------------
// Asked for on 4 November: a chase WhatsApp to the consultant surgeon and the
// surgeon in the case, and "when there are outstandings, the message will
// summarise all the cases booked for the day to appeal professionally".
//
// WHY THE BOOKER WAS NOT ENOUGH. The late-booking chase reached whoever
// entered the booking — usually a registrar or a house officer — and the
// supervising consultant got an in-app line they may never open. So the two
// people who can actually change tomorrow's list, the consultant who runs the
// unit and the surgeon whose patient it is, were the two nothing reached.
//
// THE LATE CASE IS THE OCCASION, NOT THE SUBJECT. A letter about one late
// booking asks for nothing that can still be done: it is already late and
// cannot be un-booked. So the case is named briefly, and the message then
// moves to the part that can be acted on this afternoon — every case of
// theirs on that operating day with something still outstanding.
//
// NOBODY IS WARNED HERE. The ladder counts against the person who entered the
// booking, and this letter says so by name. A consultant who reads an offence
// number and cannot tell whose it is will read it as a disciplinary matter
// against himself and answer it accordingly, and we will have turned a
// request for help into a dispute.
//
// AND IT SAYS "NOT ON THE ORM", NEVER "NOT DONE" — see caseChase/gaps.ts for
// why that distinction is the difference between a message that is acted on
// and one that is correctly disproved by somebody who did the work.
// ============================================================

import { CASE_GAPS, type CaseGapCode } from '@/lib/caseChase/gaps';
import { caseLine, gapsPresent, MAX_CASES_LISTED } from '@/lib/caseChase/messages';
import type { ChaseCase, ChaseGroup } from '@/lib/caseChase/collect';
import { withNetworkNotice } from '@/lib/comms/networkNotice';
import { ESCALATION_LABELS, type EscalationDecision } from './escalation';

const SIGN_OFF = 'Theatre Management, UNTH Ituku-Ozalla';

/** Which position on the case the reader holds. It changes the ask, not the facts. */
export type AppealRole = 'consultant' | 'surgeon';

/** The late case, as the letter needs to name it. */
export interface TriggerCase {
  /** The case, so the letter can leave it out of the day's list. */
  id: string;
  patientLabel: string;
  procedureName: string;
  /** The operating day, as the letter prints it. */
  scheduledFor: string;
  bookedAtLabel: string;
  unit: string;
  /** Who entered the booking. The ladder counts against them, not the reader. */
  bookerName: string;
  hoursLate: number | null;
}

/** Cases grouped by whoever entered the booking. */
export function groupByBooker(cases: readonly ChaseCase[]): { name: string; cases: ChaseCase[] }[] {
  const byName: Record<string, ChaseCase[]> = {};
  const order: string[] = [];
  cases.forEach((c) => {
    // Where the booker was never recorded, say so rather than file it under
    // the consultant: the consultant reading this needs to know that one of
    // these cases cannot be traced to anybody, which is its own problem.
    const name = c.bookedByName || 'Booker not recorded';
    if (!byName[name]) { byName[name] = []; order.push(name); }
    byName[name].push(c);
  });
  return order
    .map((name) => ({ name, cases: byName[name] }))
    .sort((a, b) => b.cases.length - a.cases.length);
}

const emptyCounts = (): Record<CaseGapCode, number> => ({
  LATE_BOOKING: 0, CONSENT: 0, PRESCRIPTION: 0, CONSUMABLES: 0,
});

/**
 * The day's outstanding cases, as a block of lines inside a letter.
 *
 * ONE DEFINITION, used by all three letters — the booker's, the surgeon's and
 * the consultant's. Three builders each summarising a day in their own words
 * would eventually summarise it differently, and the one that disagreed would
 * be the one a consultant quoted back at us.
 *
 * Returns [] when there is nothing outstanding once the case in hand is taken
 * out. A heading over an empty list reads as a fault in the system, and a
 * reader who finds one invented item stops believing the rest of the message.
 */
export function daySummaryLines(input: {
  /** "5 Nov" — the operating day these cases belong to. */
  dayLabel: string;
  /** The reader's cases for that day, or null when they have none. */
  group: ChaseGroup | null;
  /** Whose list it is, as a noun phrase: "Your list", "GS Unit II's list". */
  whose: string;
  /** The case the letter is already about, so it is not listed twice. */
  excludeCaseId?: string | null;
  /** For a consultant: who entered each of these. Only they can use it. */
  byBooker?: { name: string; cases: ChaseCase[] }[];
}): string[] {
  const cases = (input.group?.cases ?? [])
    .filter((c) => !input.excludeCaseId || c.id !== input.excludeCaseId);
  if (cases.length === 0) return [];

  const counts = emptyCounts();
  cases.forEach((c) => c.gaps.forEach((code) => { counts[code] += 1; }));

  const lines: string[] = [
    '',
    `${input.whose} for ${input.dayLabel}, and what is still outstanding:`,
    `• ${cases.length} ${cases.length === 1 ? 'case' : 'cases'} with something outstanding`,
  ];

  if (counts.CONSENT > 0) lines.push(`• ${counts.CONSENT} with no consent on the ORM`);
  if (counts.PRESCRIPTION > 0) lines.push(`• ${counts.PRESCRIPTION} with no pharmacy prescription`);
  if (counts.CONSUMABLES > 0) lines.push(`• ${counts.CONSUMABLES} with no consumable pack request`);
  if (counts.LATE_BOOKING > 0) lines.push(`• ${counts.LATE_BOOKING} booked after the 15:00 cut-off`);

  // The cases themselves. This is the half that gets acted on, so it is named
  // rather than counted: "your case is not ready" fits a surgeon's three
  // patients on one list equally badly.
  lines.push('', 'The cases:');
  cases.slice(0, MAX_CASES_LISTED).forEach((c) => lines.push(caseLine(c)));
  if (cases.length > MAX_CASES_LISTED) {
    lines.push(`…and ${cases.length - MAX_CASES_LISTED} more on the case list in the app.`);
  }

  // Named, because "somebody in your unit" is not something a consultant can
  // act on, and the pattern is almost always concentrated in one or two
  // people rather than spread across the firm.
  if (input.byBooker && input.byBooker.length > 0) {
    lines.push('', 'Entered by:');
    input.byBooker.slice(0, 10).forEach((b) => {
      const n = b.cases.length;
      lines.push(`• ${b.name} — ${n} ${n === 1 ? 'case' : 'cases'}`);
    });
  }

  // What to do, per gap, and only for the gaps actually present. A paragraph
  // about consumables in a letter to somebody whose consumables are all in
  // order is the paragraph that gets the rest skimmed.
  const fixable = gapsPresent(cases).filter((c) => c !== 'LATE_BOOKING');
  if (fixable.length > 0) {
    lines.push('', 'What each of these needs:');
    fixable.forEach((code) => lines.push(`• ${CASE_GAPS[code].label}. ${CASE_GAPS[code].fix}`));
  }

  return lines;
}

/**
 * The letter to the consultant surgeon, or to the surgeon on the case.
 *
 * WRITTEN AS AN APPEAL BETWEEN COLLEAGUES, the same framing theatre
 * management asked for on the booker's chase: the outcome wanted is a
 * complete list tomorrow, and a message that reads as an attack produces a
 * defensive colleague rather than a complete list.
 *
 * The two versions differ in the ask, not in the facts. The surgeon is asked
 * to close gaps on their own patients, which they can do this afternoon from
 * the case screen. The consultant is asked for the one thing only they can
 * do: expect it of the residents who enter these bookings. A consultant sent
 * the surgeon's ask has been copied in, which is not supervision.
 */
export function buildCaseAppeal(input: {
  role: AppealRole;
  personName: string;
  /** Their role in words, e.g. "Consultant Surgeon". Optional. */
  roleLabel?: string | null;
  /** The unit, as the case records it. */
  unitLabel: string;
  /** "5 Nov" — the operating day. */
  dayLabel: string;
  trigger: TriggerCase;
  /** The reader's outstanding cases for that day. */
  group: ChaseGroup | null;
  /** For a consultant: the day's cases by whoever entered them. */
  byBooker?: { name: string; cases: ChaseCase[] }[];
  decision: EscalationDecision;
}): string {
  const t = input.trigger;
  const isConsultant = input.role === 'consultant';

  const lines: string[] = [
    isConsultant
      ? `UNTH Theatre — a late elective booking in ${input.unitLabel}`
      : 'UNTH Theatre — a late elective booking on your list',
    '',
    `Dear ${input.personName},`,
    '',
    isConsultant
      ? 'You are recorded as the supervising consultant on the case below, and we are '
        + 'writing to ask for your help with it.'
      : 'You are recorded as the operating surgeon on the case below, and we are writing '
        + 'to ask for your help with it.',
    '',
    // Said in the fourth line, because by the fifth a reader has decided what
    // kind of message this is. Nothing is recorded against the person reading
    // it, and a letter that leaves that to be inferred will be answered as a
    // query rather than acted on as a request.
    `This is an appeal, not a query. The booking was entered by ${t.bookerName}, and the `
    + `record of the breach stands against them — ${ESCALATION_LABELS[input.decision.level]
      .toLowerCase()}, `
    + `offence number ${input.decision.offenceNumber} against them since tracking began. `
    + 'Nothing is recorded against you, and nothing here has been copied to anybody on '
    + 'your account.',
    '',
    'The case:',
    `• Patient: ${t.patientLabel}`,
    `• Procedure: ${t.procedureName}`,
    `• Scheduled for: ${t.scheduledFor}`,
    `• Booked: ${t.bookedAtLabel}`,
    `• Unit: ${t.unit}`,
  ];

  // A figure somebody can check against their own memory of the afternoon is
  // far harder to wave away than "late".
  if (t.hoursLate != null) {
    lines.push(`• Past the 15:00 cut-off by: ${Math.round(t.hoursLate)} hours`);
  }

  // ── The day's list, which is the half that can still be helped ──────
  const summary = daySummaryLines({
    dayLabel: input.dayLabel,
    group: input.group,
    whose: isConsultant ? `${input.unitLabel}'s list` : 'Your list',
    excludeCaseId: t.id,
    byBooker: isConsultant ? input.byBooker : undefined,
  });

  if (summary.length > 0) {
    lines.push(...summary);
  } else {
    // Worth saying, and worth saying plainly. A letter that only ever arrives
    // with a list of faults teaches its reader that there is no version of
    // their list that earns a different message.
    lines.push(
      '',
      `Everything else on ${isConsultant ? `${input.unitLabel}'s list` : 'your list'} for `
      + `${input.dayLabel} is complete on the ORM — consent, pharmacy and the pack request `
      + 'all present. Thank you for that; it is not the usual picture and it is noticed.',
    );
  }

  // ── Why, and the ask ────────────────────────────────────────────────
  lines.push(
    '',
    'Why the hour matters. By 15:00 the list has been planned, CSSD has begun sterilising, '
    + 'pharmacy and the consumable pack providers have drawn their packs, and the nursing '
    + 'officer has assigned staff to each theatre. A case arriving after that point does '
    + 'not join a queue — it displaces preparation already finished for another patient, '
    + 'and the patient who gets moved is rarely the one booked late.',
  );

  lines.push(
    '',
    isConsultant
      ? 'What we are asking of you. Please would you raise it with your team on the round: '
        + 'the following day’s cases booked before 15:00, and three things checked on '
        + 'every case before it is left — the consent on the ORM, the pharmacy '
        + 'prescription entered, and the consumable pack request entered. Booking is '
        + 'properly their work and we are not asking you to do it; we are asking you to '
        + 'expect it of them, because that is the only thing that changes the pattern '
        + 'rather than the week.'
      : 'What we are asking of you. Please would you close what is outstanding above from '
        + 'the case screen — each one takes a couple of minutes — and have a word with the '
        + 'residents and house officers who enter your bookings. A booking is departmental '
        + 'clerical work and properly theirs to enter, but the gap it leaves lands on your '
        + 'patient, on the morning of surgery. One question on the round — "is the consent '
        + 'and the pharmacy list on the ORM?" — prevents nearly all of this.',
  );

  lines.push(
    '',
    'On consent, so that we are not misunderstood: what the theatre can see is the ORM, '
    + 'not the folder. A form signed on paper is a real consent, and it only needs '
    + 'photographing into the case — the holding-area nurse cannot act on a consent they '
    + 'cannot open, and the patient is the one who waits at the door, gowned and fasted, '
    + 'while it is found.',
    '',
    'From 1 November 2026, elective cases booked after the deadline will not have a nurse '
    + 'or a theatre assigned. This is not aimed at anyone; it is the only way the theatre '
    + 'can protect the patients already prepared for.',
    '',
    'If something is genuinely in the way — a clinic that overruns, a result that arrives '
    + 'late, a resident with no account, a screen that will not save — please tell the '
    + 'Theatre Manager or the Theatre Chairman before 12 noon on the day before. A '
    + 'difficulty raised in advance is always accommodated; one raised afterwards cannot '
    + 'be, because the work has already been done.',
    '',
    'With thanks for your support, and for the cases that do arrive complete.',
    SIGN_OFF,
  );

  return withNetworkNotice(lines.join('\n'));
}
