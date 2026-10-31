// ============================================================
// What a person is actually sent
// ------------------------------------------------------------
// Two messages per duty, built from the same figures the board shows.
//
// THE CHASE IS AN APPEAL, matching the late-booking chase the theatre
// management asked for. The outcome wanted is the duty done tomorrow, and a
// message that reads as an attack produces a defensive colleague rather than a
// packed trolley. It quotes the person's own numbers — a percentage somebody
// recognises as theirs is the single most persuasive line available — and asks
// for a figure, not for contrition.
//
// THE COMMENDATION CARRIES NO THREAT. The moment a letter of appreciation
// mentions what happens if you slip it stops being appreciation and becomes a
// warning with a compliment attached, and nobody is thanked by that.
//
// NEITHER IS SENT AUTOMATICALLY. Both are composed here and handed to a person
// in theatre management to send.
// ============================================================

import { DUTIES, type DutyKey, type DutyPerformance } from './types';
import { shortDay, trimLabel, type MemberCaseload } from './caseload';
import { formatRate, formatMargin } from './report';

const pct = (r: number | null) => formatRate(r);

/** How the person's record reads in one sentence. */
function standingLine(p: DutyPerformance, duty: DutyKey): string {
  const d = DUTIES[duty];
  const parts: string[] = [
    `${p.done} of ${p.total} ${d.label.toLowerCase()}${p.total === 1 ? '' : 's'} ${d.verb}`,
  ];
  if (p.outstanding > 0) parts.push(`${p.outstanding} never done`);
  if (p.late > 0) parts.push(`${p.late} done late`);
  return parts.join(', ');
}

/**
 * The WhatsApp chase for somebody falling short on a duty.
 *
 * SHORT, BECAUSE IT IS READ ON A PHONE BETWEEN CASES. The first version
 * explained the duty at length, which is what a message does when it has
 * nothing specific to say. Where the caller can supply the person's own cases
 * it names them instead, and the explaining is unnecessary.
 */
export function buildDutyChase(input: {
  personName: string;
  duty: DutyKey;
  performance: DutyPerformance;
  periodLabel: string;
  /** Their own cases, where the caller worked them out. Named, not summarised. */
  caseload?: MemberCaseload | null;
}): string {
  const d = DUTIES[input.duty];
  const p = input.performance;
  const c = input.caseload ?? null;
  const onTimeShare = p.total > 0 ? (p.done - p.late) / p.total : null;

  const lines = [
    `UNTH Theatre — ${d.label.toLowerCase()}`,
    ``,
    `Dear ${input.personName},`,
    ``,
    `We are asking for your help getting ${d.label.toLowerCase()} done ${d.deadline}.`,
    ``,
    `Your record for ${input.periodLabel}: ${standingLine(p, input.duty)}.`,
    `Done on time: ${pct(onTimeShare)}.`,
  ];

  // The cases themselves, where the caller knows them. A named patient on a
  // named day is the difference between a figure somebody argues with and one
  // they go and look up.
  if (c && c.missing.length > 0) {
    lines.push(``, `Nothing recorded for:`);
    c.missing.forEach((m) => {
      const day = m.dutyDay ? `${shortDay(m.dutyDay)} — ` : '';
      lines.push(`• ${day}${trimLabel(m.label)}`);
    });
    const rest = c.outstanding - c.missing.length;
    if (rest > 0) lines.push(`…and ${rest} more.`);
  }

  if (d.delegation) lines.push(``, d.delegation.short);

  lines.push(
    ``,
    `Please: ${d.ask}`,
    ``,
    `Why: ${d.whyShort}`,
    ``,
    `This is an appeal, not an accusation. If you did the work and could not record it, `
      + `say so and somebody will show you the screen. If something else is in the way — a `
      + `list you are not told about, a form that will not save — tell the Theatre Manager `
      + `or the Theatre Chairman.`,
    ``,
    `Theatre Management, UNTH Ituku-Ozalla`,
  );

  return lines.join('\n');
}

/** The WhatsApp thank-you for somebody whose record earns one. */
export function buildDutyCommendation(input: {
  personName: string;
  duty: DutyKey;
  performance: DutyPerformance;
  periodLabel: string;
  rankLabel?: string | null;
}): string {
  const d = DUTIES[input.duty];
  const p = input.performance;
  const onTimeShare = p.total > 0 ? (p.done - p.late) / p.total : null;

  const lines = [
    `UNTH Theatre — thank you`,
    ``,
    `Dear ${input.personName},`,
    ``,
    p.perfect
      ? `Every one of your ${p.total} ${d.label.toLowerCase()}${p.total === 1 ? '' : 's'} for `
        + `${input.periodLabel} was ${d.verb} on time.`
      : `${p.done - p.late} of your ${p.total} ${d.label.toLowerCase()}${p.total === 1 ? '' : 's'} `
        + `for ${input.periodLabel} were ${d.verb} on time — ${pct(onTimeShare)}.`,
  ];

  if (p.medianMarginMinutes !== null && p.medianMarginMinutes > 0) {
    lines.push(``, `Typically ${formatMargin(p.medianMarginMinutes)}.`);
  }

  if (input.rankLabel) lines.push(``, input.rankLabel);

  lines.push(
    ``,
    `That is not a small thing. ${d.why}`,
    ``,
    `Because you do this when you are meant to, none of that happens on your cases — and the `
      + `people who never notice are the proof it is working.`,
    ``,
    `Theatre Management is grateful, and we wanted to say so rather than only write to `
      + `colleagues who are falling behind.`,
    ``,
    `With appreciation,`,
    `Theatre Management, UNTH Ituku-Ozalla`,
  );

  return lines.join('\n');
}
