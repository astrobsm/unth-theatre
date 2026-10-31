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

/**
 * The appeal sent to somebody who performs a duty.
 *
 * SHORT, AND ABOUT THEIR OWN CASES. Both of those were asked for, and they
 * turn out to be the same instruction: the long version was long because it
 * had nothing specific to say, so it explained the duty instead. Given the
 * cases that were genuinely theirs — the nights the roster had them on, the
 * patients nobody packed for — there is nothing left to pad with. It fits on
 * one phone screen: what was yours, what is missing, where to press, why.
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
  // that tells a reader the message was written by a machine about somebody
  // else.
  const shift = input.duty === 'PHARMACY_PACKING' || input.duty === 'CONSUMABLE_PACKING'
    ? 'nights'
    : 'days';

  const lines: string[] = [
    `UNTH Theatre — ${d.label.toLowerCase()}`,
    '',
    `Dear ${input.personName},`,
    '',
  ];

  // ── What was yours ────────────────────────────────────────────────────
  if (nights > 0) {
    lines.push(
      `On duty ${nights} ${nights === 1 ? shift.replace(/s$/, '') : shift} in `
      + `${input.periodLabel}${rosterDays.length ? `: ${listDays(rosterDays)}` : ''}.`,
    );
  }

  if (c && c.total > 0) {
    lines.push(
      `${c.total} ${c.total === 1 ? 'case was' : 'cases were'} yours. `
      + `${c.done} recorded as ${d.verb}`
      + (c.late > 0 ? `, ${c.late} of them late` : '')
      + '.',
    );
  } else if (c && nights > 0) {
    // Nothing fell to them. Saying so is the point: it is the difference
    // between a board that knows the roster and one that writes to everybody.
    lines.push(
      `No case on those ${shift} needed ${d.label.toLowerCase()}, so nothing is `
      + 'outstanding for you. This is for your information only.',
    );
  } else {
    lines.push(
      `The published roster has you on no ${shift.replace(/s$/, '')} in this period, and no `
      + 'case is recorded against you.'
      + (input.departmentTotal
        ? ` The department had ${input.departmentTotal} due and `
          + `${input.departmentDone ?? 0} recorded.`
        : ''),
      '',
      'If you were on duty and the roster does not show it, please tell us — these '
      + 'messages are built from the published roster, so correcting it corrects them.',
    );
  }

  // ── Which ones ────────────────────────────────────────────────────────
  if (c && c.missing.length > 0) {
    lines.push('', 'Nothing recorded for:');
    c.missing.forEach((m) => {
      const day = m.dutyDay ? `${shortDay(m.dutyDay)} — ` : '';
      lines.push(`• ${day}${trimLabel(m.label)}`);
    });
    const rest = c.outstanding - c.missing.length;
    if (rest > 0) lines.push(`…and ${rest} more.`);
  }

  // ── What to do ────────────────────────────────────────────────────────
  if (!c || c.total > 0) {
    if (d.delegation) lines.push('', d.delegation.short);
    lines.push('', `Please: ${d.ask}`, '', `Why: ${d.whyShort}`);
  }

  lines.push(
    '',
    c && c.total > 0 && c.outstanding > 0
      ? 'If you did the work and could not record it, say so and somebody will show you '
        + 'the screen — five minutes. If something else is in the way, tell the Theatre '
        + 'Manager.'
      : 'Anything in the way of this, tell the Theatre Manager — a difficulty raised is '
        + 'one we can solve.',
    '',
    'Theatre Management, UNTH Ituku-Ozalla',
  );

  return lines.join('\n');
}
