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
import { withNetworkNotice } from '@/lib/comms/networkNotice';

const pct = (r: number | null) => formatRate(r);

/**
 * How the person's record reads in one sentence.
 *
 * The duty's LABEL is deliberately not pluralised into this line. It used to
 * be, and produced "6 of 14 recording start and end of surgerys recorded" —
 * an "s" bolted onto whatever word the label happened to end with. The label
 * is already the subject line of the message, so the count needs only the
 * verb, which reads correctly for every one of the ten duties.
 */
function standingLine(p: DutyPerformance, duty: DutyKey): string {
  const d = DUTIES[duty];
  const parts: string[] = [
    `${p.done} of ${p.total} ${d.verb}`,
  ];
  if (p.outstanding > 0) parts.push(`${p.outstanding} never done`);
  if (p.late > 0) parts.push(`${p.late} done late`);
  return parts.join(', ');
}

/**
 * The chase for somebody whose ranked record is falling short.
 *
 * Addressed by role, about their own cases, and it thanks them for what they
 * did do before it asks about what is missing — in that order, because the
 * other order is a reprimand with a courtesy attached and reads as one. It
 * also asks them to see that their own staff record their work, which is the
 * half of this a figure cannot do on its own.
 */
export function buildDutyChase(input: {
  personName: string;
  duty: DutyKey;
  performance: DutyPerformance;
  periodLabel: string;
  /** Their role, in words: "Consultant Anaesthetist". */
  roleLabel?: string | null;
  /** Their own cases, where the caller worked them out. Named, not summarised. */
  caseload?: MemberCaseload | null;
  /**
   * Where they stand among colleagues doing the same duty: "9th of 12".
   *
   * WITHHELD RATHER THAN GUESSED. The caller passes null wherever a position
   * would not be a ranking — too few colleagues ranked to compare against —
   * because "2nd of 2" is being told you are last with the arithmetic hidden,
   * and a chase is already a hard message to receive.
   */
  rankLabel?: string | null;
}): string {
  const d = DUTIES[input.duty];
  const p = input.performance;
  const c = input.caseload ?? null;
  const onTimeShare = p.total > 0 ? (p.done - p.late) / p.total : null;
  const role = (input.roleLabel || '').trim().toLowerCase() || d.owner.toLowerCase();
  const article = /^[aeiou]/.test(role) ? 'an' : 'a';

  const lines = [
    `UNTH Theatre — ${d.label.toLowerCase()}`,
    input.periodLabel,
    ``,
    `Dear ${input.personName},`,
    ``,
    `As ${article} ${role}, ${d.label.toLowerCase()} is yours to see to and to record on `
      + `the ORM — ${d.deadline}. We are writing to ask for your help with it. This is an `
      + `appeal, not an accusation: your cooperation is worth far more to the theatre than `
      + `a record of the shortfall.`,
    ``,
    `Where you stand for ${input.periodLabel}:`,
    `• ${standingLine(p, input.duty)}`,
    `• Done on time: ${pct(onTimeShare)}`,
  ];

  if (p.medianMarginMinutes !== null) {
    lines.push(`• Typically ${formatMargin(p.medianMarginMinutes)}`);
  }

  // The position, beside the figure rather than instead of it. A percentage on
  // its own does not tell anybody whether it is good: 78% is a decent record
  // in a theatre averaging 60% and a poor one in a theatre averaging 95%, and
  // without that a colleague either despairs at a respectable figure or
  // relaxes at a bad one.
  if (input.rankLabel) {
    lines.push(`• Among colleagues on this duty: ${input.rankLabel}`);
  }

  if (p.done > 0) {
    lines.push(
      ``,
      // "you have recorded", not "you did recorded". The verbs are past
      // participles, and every one of the ten read ungrammatically here.
      `Thank you for the ${p.done} you have ${d.verb} — that part of the work is reaching `
        + `the theatre as it should.`,
    );
  }

  // The cases themselves, where the caller knows them. A named patient on a
  // named day is the difference between a figure somebody argues with and one
  // they go and look up.
  if (c && c.missing.length > 0) {
    lines.push(``, `Still with nothing recorded:`);
    c.missing.forEach((m) => {
      const day = m.dutyDay ? `${shortDay(m.dutyDay)} — ` : '';
      lines.push(`• ${day}${trimLabel(m.label)}`);
    });
    const rest = c.outstanding - c.missing.length;
    if (rest > 0) lines.push(`…and ${rest} more.`);
  }

  lines.push(
    ``,
    p.outstanding > 0
      ? `The ${p.outstanding} with nothing recorded are the ones we are asking you to look `
        + `at first. Where the work was in fact done it needs only to be entered; a task `
        + `not done is invisible until the moment it is needed, which is the worst `
        + `possible moment to discover it.`
      : `You are doing the work — we are asking you to bring it inside the deadline.`,
  );

  if (d.delegation) lines.push(``, d.delegation.short);

  lines.push(
    ``,
    // The steps go in EVERY chase, not only where we suspect a navigation
    // problem. Far more of these figures are somebody who did the work and
    // could not find where to record it than are somebody refusing to do it,
    // and quoting a percentage at the first kind of person without telling
    // them where the screen is guarantees the same figure next month.
    `How it is done — ${d.where}:`,
    ...d.steps.map((s, i) => `${i + 1}. ${s}`),
    ``,
    `Please also see that ${d.subordinates} do the same, and enter it under their own `
      + `login. A duty performed and never recorded on the ORM is, to everybody else `
      + `preparing the case, a duty not done — and it is supervision, not reminders, that `
      + `closes that gap.`,
    ``,
    `Why it matters. ${d.why}`,
  );

  // The legal paragraph, on the few duties whose record is itself evidence.
  //
  // AFTER the appeal and the instructions, never before them. Opening with
  // liability produces a defensive colleague, and the outcome wanted here is
  // the time entered tomorrow — not a reply explaining that it was not their
  // fault. It is also set on almost no duties on purpose: a legal block on
  // every message is one staff learn to scroll past, and then it carries no
  // weight on the day it genuinely matters.
  if (d.legalWeight) {
    lines.push(``, `*${d.label.toUpperCase()} — WHY THIS ONE IS DIFFERENT*`, d.legalWeight);
  }

  lines.push(
    ``,
    `If the screen cannot be found, or a login will not reach it, say so and somebody will `
      + `come and show you or your team — that is a five-minute problem and we would far `
      + `rather solve it than keep reporting it.`,
    ``,
    `And if something else is genuinely preventing this — a list you are not told about, a `
      + `system that will not accept the entry, cover you do not have — please tell the `
      + `Theatre Manager or the Theatre Chairman. A difficulty raised is one we can solve; `
      + `one we never hear about simply repeats.`,
    ``,
    `Thank you for your cooperation, and for the ones you do get done on time.`,
    `Theatre Management, UNTH Ituku-Ozalla`,
  );

  return withNetworkNotice(lines.join('\n'));
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
    // Asked for alongside the commendation, and right: the colleague who does
    // this properly is the one whose team will listen about it. A thank-you
    // that asks nothing of the best people wastes the one letter they read
    // twice.
    `One thing we would ask: please help ${d.subordinates} to the same standard, and see `
      + `that they record their own work on the ORM under their own login. Work that is `
      + `done and never entered reaches nobody who is preparing the case.`,
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

  return withNetworkNotice(lines.join('\n'));
}
