// ============================================================
// Who a duty actually belongs to, and what they are asked to do
// ------------------------------------------------------------
// The board chases and commends by NAME, which works for a duty handed to one
// person before it falls due. Most of these duties are not that.
//
// A pack that nobody made has no packer on it; an emergency nobody answered
// has no responder; a case with no times recorded has nobody's name on the
// timing. So for four of the five duties the board could attribute the
// failures to nobody at all — and a chase with no legitimate recipient is
// worse than silence, because the first person it reaches by accident learns
// that the board does not know who does what and stops believing any of it.
//
// WHO OWES THE WORK IS A ROLE QUESTION FIRST AND A ROSTER QUESTION SECOND.
// Every duty names the roles that perform it (DutyDefinition.roles) and, where
// the department publishes one a week ahead, the roster category that says who
// was on (DutyDefinition.rosterCategory). This file turns those two into the
// list of people the board may write to, and composes what they are sent.
//
// IT DOES NOT PUT A SINGLE NAME AGAINST SHARED WORK. Where three people were
// on, the brief goes to all three; it does not pick one and report them for
// the work nobody did. The message is addressed to a person but describes the
// team's duty, reports the DEPARTMENT's figure, and adds that person's own
// record only where there is one.
// ============================================================

import { DUTIES, type DutyKey, type DutyPerformance } from './types';
import { listDays, shortDay, trimLabel, type MemberCaseload } from './caseload';

/** One published roster row, as the brief needs it. */
export interface DutyShiftRow {
  userId: string;
  name: string;
  /** The WAT calendar day the row is for, as yyyy-mm-dd. */
  date: string;
  /** MORNING | CALL | NIGHT */
  shift: string;
}

/** Somebody who may be written to about a duty. */
export interface DutyTeamMember {
  userId: string;
  name: string;
  role: string | null;
  phone: string | null;
  /** Distinct WAT days rostered in the window, earliest first. */
  days: string[];
  /** Distinct shifts worked, in roster order. */
  shifts: string[];
  /** Days that were the eve of a day with work due. */
  eves: number;
  /** Where the name came from. A roster row is a stronger claim than a role. */
  source: 'roster' | 'role';
  /** Their own record for the window, where anything is recorded against them. */
  performance: DutyPerformance | null;
  /**
   * The cases that were actually theirs — the nights the roster had them on,
   * plus anything the record names them on. This, not the department's figure,
   * is what the message quotes.
   */
  caseload: MemberCaseload | null;
}

const SHIFT_ORDER = ['MORNING', 'CALL', 'NIGHT'];

/**
 * A role as a person would say it: CONSULTANT_ANAESTHETIST -> "Consultant
 * Anaesthetist". Letters are addressed by role, so the enum must never reach
 * one: "Dear Dr X, as a CONSULTANT_ANAESTHETIST" is a letter from a database.
 */
export function roleWords(role: string | null | undefined): string {
  return (role || '')
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** The WAT calendar day before `iso`, as yyyy-mm-dd. */
export function dayBefore(iso: string): string {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  const t = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
}

/**
 * Is this duty discharged the day BEFORE the work it serves?
 *
 * Packing and the pre-op review are: they are done the evening before a list,
 * which is the whole reason they are measurable. Acknowledging an alert and
 * recording an operation's times happen on the day, so their roster window is
 * the window itself.
 */
export function isEveDuty(duty: DutyKey): boolean {
  return duty === 'PHARMACY_PACKING'
    || duty === 'CONSUMABLE_PACKING'
    || duty === 'PREOP_REVIEW';
}

/**
 * The roster window to query for a report window.
 *
 * One day wider at the start for an eve duty, because the first day in the
 * window was prepared for the evening BEFORE the window opened. Forgetting
 * this is how the first day of every month ends up with nobody responsible
 * for it.
 */
export function rosterWindowFor(
  duty: DutyKey,
  from: string,
  to: string,
): { from: string; to: string } {
  return isEveDuty(duty) ? { from: dayBefore(from), to: dayBefore(to) } : { from, to };
}

/**
 * Fold roster rows into one entry per person.
 *
 * @param eves the WAT days that were an eve of a day with work due, so a
 *             message can say how many shifts the person was actually
 *             responsible for rather than how many rows exist.
 */
export function foldRoster(
  rows: readonly DutyShiftRow[],
  eves: readonly string[] = [],
): Map<string, { name: string; days: string[]; shifts: string[]; eves: number }> {
  const eveSet = new Set(eves);
  const byUser = new Map<string, { name: string; days: string[]; shifts: string[]; eves: number }>();

  rows.forEach((r) => {
    const name = (r.name || '').trim();
    // A roster row with no user attached cannot be written to. It is a gap in
    // the roster, not a person, and inventing a recipient for it would put
    // this file back where it started.
    if (!r.userId || !name) return;

    let p = byUser.get(r.userId);
    if (!p) {
      p = { name, days: [], shifts: [], eves: 0 };
      byUser.set(r.userId, p);
    }
    if (p.days.indexOf(r.date) === -1) {
      p.days.push(r.date);
      if (eveSet.has(r.date)) p.eves += 1;
    }
    const shift = (r.shift || '').trim().toUpperCase();
    if (shift && p.shifts.indexOf(shift) === -1) p.shifts.push(shift);
  });

  byUser.forEach((p) => {
    p.days.sort();
    p.shifts.sort((a, b) => {
      const ia = SHIFT_ORDER.indexOf(a);
      const ib = SHIFT_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  });
  return byUser;
}

/**
 * The order the team is shown and written to in.
 *
 * People with work recorded against them first, worst record at the top,
 * because those are the conversations worth having. Then the rostered without
 * a record — they were on duty and nothing reached the ORM, which is its own
 * finding. Then everybody else holding the role.
 */
export function sortTeam(members: DutyTeamMember[]): DutyTeamMember[] {
  const share = (m: DutyTeamMember) => {
    const p = m.performance;
    if (!p || p.total === 0) return null;
    return (p.done - p.late) / p.total;
  };
  return members.slice().sort((a, b) => {
    const sa = share(a);
    const sb = share(b);
    if (sa !== null && sb !== null) {
      if (sa !== sb) return sa - sb;
      return (b.performance?.total ?? 0) - (a.performance?.total ?? 0);
    }
    if (sa !== null) return -1;
    if (sb !== null) return 1;
    if (a.source !== b.source) return a.source === 'roster' ? -1 : 1;
    if (b.eves !== a.eves) return b.eves - a.eves;
    if (b.days.length !== a.days.length) return b.days.length - a.days.length;
    return a.name.localeCompare(b.name);
  });
}

export interface DutyBriefInput {
  duty: DutyKey;
  /** Who it is addressed to. */
  personName: string;
  /** Their role, written as a person would say it: "Consultant Anaesthetist". */
  roleLabel?: string | null;
  periodLabel: string;
  /** What was actually theirs: their own cases, from the roster and the record. */
  caseload?: MemberCaseload | null;
  /** The published roster days that were theirs, for the opening line. */
  rosterDays?: readonly string[];
  daysOnDuty?: number;
  eves?: number;
  /**
   * The department's figures. Quoted ONLY where nothing is this person's, to
   * explain why they are being written to at all — a colleague who is shown
   * the department's shortfall in place of their own has been told, correctly,
   * that the board does not know what they were asked to do.
   */
  departmentTotal?: number;
  departmentDone?: number;
  departmentOnTime?: number;
  /** Their ranked record, where the report has one. A fallback, not the source. */
  own?: DutyPerformance | null;
}

/** Which letter this is, decided by their own record and nothing else. */
export type DutyBriefTone = 'commend' | 'appeal' | 'roster-gap' | 'nothing-due';

export function dutyBriefTone(
  c: MemberCaseload | null | undefined,
  daysOnDuty: number,
): DutyBriefTone {
  if (!c || c.total === 0) return daysOnDuty > 0 ? 'nothing-due' : 'roster-gap';
  // Everything done, nothing late: this is a thank-you, and a thank-you that
  // mentions what happens if you slip is not one.
  if (c.outstanding === 0 && c.late === 0) return 'commend';
  return 'appeal';
}

/**
 * The letter sent to somebody who performs a duty.
 *
 * A PROFESSIONAL APPEAL, ADDRESSED BY ROLE, ABOUT THEIR OWN CASES. Three
 * things have to be true at once, and each was learned by getting it wrong:
 *
 *   it quotes the cases that are genuinely theirs, because staff read the
 *   department's figure in a letter addressed to them and said, correctly,
 *   that it was not their duty;
 *
 *   it thanks the people who are doing the work, because a board that writes
 *   only to the people who are behind is a board nobody wants to hear from,
 *   and the ones doing it properly are the ones worth keeping;
 *
 *   and it asks the senior to see that their own staff record it too, because
 *   a duty performed and never communicated is, to everybody else preparing
 *   the case, a duty not done — and supervision, not reminders, is what
 *   closes that.
 *
 * ONE MESSAGE, FIVE DUTIES still. A hospital that writes to pharmacy in one
 * tone and to the nurses in another gets an argument about tone instead of a
 * packed trolley.
 */
export function buildDutyBrief(input: DutyBriefInput): string {
  const d = DUTIES[input.duty];
  const c = input.caseload ?? null;
  const rosterDays = input.rosterDays ?? [];
  const nights = input.daysOnDuty ?? rosterDays.length;
  // Packing is night work; a review the day before surgery is not. Calling a
  // consultant's clinic day a "night on duty" is the kind of small wrongness
  // that tells a reader the letter was written about somebody else.
  const isNight = input.duty === 'PHARMACY_PACKING' || input.duty === 'CONSUMABLE_PACKING';
  const shift = isNight ? 'nights' : 'days';
  const one = isNight ? 'night' : 'day';
  // Addressed by role where we know it. Where we do not, "one of the
  // colleagues who carry this" — never d.owner, which is a department ("As a
  // pharmacy on duty..."), and a letter that cannot name your job correctly
  // has already told you it is not really about you.
  const roleWord = (input.roleLabel || '').trim().toLowerCase();
  // "the head of pharmacy", "the theatre manager" — there is one of each, and
  // "a head of pharmacy" tells the reader a machine wrote it.
  const definite = /^(head|chief|director|theatre manager|theatre chairman)/.test(roleWord);
  const asWho = roleWord
    ? `${definite ? 'the' : (/^[aeiou]/.test(roleWord) ? 'an' : 'a')} ${roleWord}`
    : `one of the colleagues who carry ${d.label.toLowerCase()}`;
  const tone = dutyBriefTone(c, nights);

  const lines: string[] = [
    `UNTH Theatre — ${d.label.toLowerCase()}`,
    input.periodLabel,
    '',
    `Dear ${input.personName},`,
    '',
  ];

  // ── Who they are, and what was therefore theirs ───────────────────────
  const asRole = nights > 0
    ? `As ${asWho}, on duty ${nights} ${nights === 1 ? one : shift} in this period`
      + (rosterDays.length ? ` (${listDays(rosterDays)})` : '')
    : `As ${asWho}`;

  if (tone === 'roster-gap') {
    lines.push(
      `${asRole}, ${d.label.toLowerCase()} is one of the duties recorded in your name.`,
      '',
      `The published roster has you on no ${one} in ${input.periodLabel}, and no case is `
      + 'recorded against your name.'
      + (input.departmentTotal
        ? ` Across the department, ${input.departmentTotal} were due and `
          + `${input.departmentDone ?? 0} recorded.`
        : ''),
      '',
      'We are not reporting a shortfall against you — we cannot see one. We are asking '
      + 'you to check two things: that your department’s roster is published on the ORM, '
      + 'and that your name is on it for the days you worked. These letters, and every '
      + 'figure on the duty board, are built from that roster.',
    );
  } else if (tone === 'nothing-due') {
    lines.push(
      `${asRole}, nothing fell to you for ${d.label.toLowerCase()}: no case on `
      + `${rosterDays.length ? `those ${shift}` : `your duty ${shift}`} required it.`,
      '',
      'Nothing is outstanding, and nothing is being asked of you. We are writing so that '
      + 'you know the ORM shows your duty correctly — if you did work that is not '
      + 'reflected here, please tell us, because that is a gap we would want to close.',
    );
  } else {
    lines.push(
      `${asRole}, ${c!.total === 1 ? 'one case was' : `${c!.total} cases were`} yours to see `
      + `to and to record on the ORM.`,
      '',
      tone === 'commend'
        ? 'We are writing to thank you for how that has gone.'
        : 'This is a professional appeal, not a reprimand: your cooperation is worth far '
          + 'more to the theatre than a record of what was missed.',
    );
  }

  // ── Where they stand ──────────────────────────────────────────────────
  if (c && c.total > 0) {
    lines.push(
      '',
      'Where you stand:',
      `• ${c.total} ${c.total === 1 ? 'case was' : 'cases were'} yours`,
      `• ${c.done} ${d.verb} and recorded on the ORM`
      + (c.late > 0 ? ` (${c.late} after the deadline)` : ''),
      `• ${c.outstanding} with nothing recorded`,
    );
  }

  // ── What was done well. This half is not optional: a board that only ever
  //    reports shortfalls teaches people to ignore it.
  if (c && c.done > 0) {
    lines.push(
      '',
      tone === 'commend'
        ? `Every one of them was ${d.verb} on time. That is not a small thing — the `
          + 'colleagues who never have to chase you are the proof it is working, and they '
          + 'are usually the last to say so.'
        : `Thank you for the ${c.done} you did record. That part of the work is reaching `
          + 'the theatre exactly as it should.',
    );
  }

  // ── Which ones are missing ────────────────────────────────────────────
  if (c && c.missing.length > 0) {
    lines.push('', 'Still with nothing recorded:');
    c.missing.forEach((m) => {
      const day = m.dutyDay ? `${shortDay(m.dutyDay)} — ` : '';
      lines.push(`• ${day}${trimLabel(m.label)}`);
    });
    const rest = c.outstanding - c.missing.length;
    if (rest > 0) lines.push(`…and ${rest} more.`);
    lines.push(
      '',
      'Please would you check each of these. Where the work was in fact done, it needs '
      + 'only to be entered; where it was not, that is the first thing we are asking for.',
    );
  }

  // ── How, and who else has to do it ────────────────────────────────────
  if (tone === 'appeal' || tone === 'commend') {
    if (d.delegation) lines.push('', d.delegation.short);

    // The steps go to the person being asked for something, not to the person
    // being thanked: somebody with a complete record has demonstrated they can
    // find the screen, and instructing them anyway turns a thank-you into a
    // circular.
    if (tone === 'appeal') {
      lines.push('', `How it is done — ${d.where}:`);
      d.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    }

    // The supervision ask, in BOTH tones. The person doing the job properly is
    // exactly the person whose team should be doing it properly, and leaving
    // this out of the thank-you would waste the one letter they will read
    // twice.
    lines.push(
      '',
      `Please also see that ${d.subordinates} do the same, and enter it under their own `
      + 'login. A duty performed and never recorded on the ORM is, to everybody else '
      + 'preparing the case, a duty not done — and it is supervision, not reminders, that '
      + 'closes that gap.',
      '',
      `Why it matters. ${d.why}`,
    );
  }

  // ── The way out ───────────────────────────────────────────────────────
  lines.push(
    '',
    tone === 'commend'
      ? 'Theatre Management is grateful, and we wanted to say so rather than write only to '
        + 'colleagues who are falling behind.'
      : 'If the screen cannot be found, or a login will not reach it, say so and somebody '
        + 'will come and show you or your team — that is a five-minute problem and we would '
        + 'far rather solve it than keep reporting it. And if something else is in the way '
        + '— a list you are never told about, a form that will not save, cover you do not '
        + 'have — please tell the Theatre Manager or the Theatre Chairman. A difficulty '
        + 'raised is one we can solve; one we never hear about simply repeats.',
    '',
    tone === 'commend'
      ? 'With appreciation,'
      : 'Thank you for the work, and for taking the time to record it.',
    'Theatre Management, UNTH Ituku-Ozalla',
  );

  return lines.join('\n');
}
