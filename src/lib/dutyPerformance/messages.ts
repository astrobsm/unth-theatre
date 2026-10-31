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
 * Written to be read by a tired colleague on a phone: the ask is in the first
 * two lines, because the first two lines are all some people will read.
 */
export function buildDutyChase(input: {
  personName: string;
  duty: DutyKey;
  performance: DutyPerformance;
  periodLabel: string;
}): string {
  const d = DUTIES[input.duty];
  const p = input.performance;
  const onTimeShare = p.total > 0 ? (p.done - p.late) / p.total : null;

  const lines = [
    `UNTH Theatre — a request about ${d.label.toLowerCase()}`,
    ``,
    `Dear ${input.personName},`,
    ``,
    `We are writing to ask for your help in getting ${d.label.toLowerCase()} done on time — `
      + `${d.deadline}. This is an appeal, not an accusation: we need your cooperation far `
      + `more than we need a record of the shortfall.`,
    ``,
    `Where you presently stand for ${input.periodLabel}:`,
    `• ${standingLine(p, input.duty)}`,
    `• Done on time: ${pct(onTimeShare)}`,
  ];

  if (p.medianMarginMinutes !== null) {
    lines.push(`• Typically ${formatMargin(p.medianMarginMinutes)}`);
  }

  lines.push(
    ``,
    p.outstanding > 0
      ? `The ${p.outstanding} not done at all are the ones we are asking you to look at first. `
        + `A task not done is invisible until the moment it is needed, which is the worst `
        + `possible moment to discover it.`
      : `You are doing the work — we are asking you to bring it inside the deadline.`,
    ``,
    `Why it matters. ${d.why}`,
    ``,
    // The steps go in EVERY chase, not only where we suspect a navigation
    // problem. Far more of these figures are somebody who did the work and
    // could not find where to record it than are somebody refusing to do it,
    // and quoting a percentage at the first kind of person without telling
    // them where the screen is guarantees the same figure next month.
    `How it is done — ${d.where}:`,
    ...d.steps.map((s, i) => `${i + 1}. ${s}`),
    ``,
    `If you cannot find the screen, or your login will not reach it, say so and somebody will `
      + `walk you through it — that is a five-minute problem and we would far rather solve it `
      + `than keep reporting it.`,
    ``,
    `And if something else is genuinely preventing this — a list you are not told about, a `
      + `system that will not accept the entry, cover you do not have — please tell the Theatre `
      + `Manager or the Theatre Chairman. A difficulty raised is one we can solve; one we never `
      + `hear about simply repeats.`,
    ``,
    `Thank you for your cooperation, and for the ones you do get done on time.`,
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
