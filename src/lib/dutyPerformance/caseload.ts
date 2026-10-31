// ============================================================
// The cases that were actually this person's
// ------------------------------------------------------------
// Staff read the first version of these messages and said, with some justice,
// that the figures were not theirs. They were not: the message quoted what the
// DEPARTMENT did, because for four of the five duties nothing in the data
// named an individual. A pharmacist who was on two nights in the month was
// being shown 39 cases and 0 packed, and the honest reading of that message
// from where they sat was "this is not my duty".
//
// So the figure in a message is now built from two things that are genuinely
// theirs:
//
//   1. the cases the record NAMES them on — assigned to them, or done by them;
//   2. the cases that fell on the days the PUBLISHED ROSTER had them on duty,
//      where nobody else is named.
//
// Nothing else is counted. A case packed by a colleague on your night is
// theirs, not yours; a night you were not on is not yours at all. What is left
// is small, specific and checkable — which is the only kind of figure worth
// putting in front of somebody who already believes the board has it wrong.
//
// WHERE THERE IS NOTHING, IT SAYS SO. A member with no roster days and no
// named cases gets basis 'none', and the message tells them the roster shows
// them nowhere rather than inventing a shortfall. That turns the complaint
// into a correctable fact about the roster, which is where it belongs.
// ============================================================

import { DUTIES, type DutyEvent, type DutyKey } from './types';

/** One of the person's own cases, as a message needs it. */
export interface CaseloadCase {
  id: string;
  /** The day they had to act, yyyy-mm-dd, where the event knows it. */
  dutyDay: string | null;
  label: string;
  done: boolean;
  late: boolean;
  /** True where the record names them; false where it is theirs by roster. */
  named: boolean;
}

export interface MemberCaseload {
  total: number;
  done: number;
  onTime: number;
  late: number;
  outstanding: number;
  /** Of the total, how many the record names them on. */
  named: number;
  /** Of the total, how many are theirs because they were rostered. */
  onRoster: number;
  /** The days their own work fell on, earliest first. */
  days: string[];
  /** The ones with nothing recorded, soonest first. */
  missing: CaseloadCase[];
  basis: 'named' | 'roster' | 'both' | 'none';
}

const asDate = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** "2026-10-07" → "7 Oct". The short form a WhatsApp message wants. */
export function shortDay(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1]}`;
}

/** The days, as a person would list them: "30 Sep, 7, 14 and 21 Oct". */
export function listDays(days: readonly string[], limit = 6): string {
  if (days.length === 0) return '';
  const shown = days.slice(0, limit).map(shortDay);
  const rest = days.length - shown.length;
  const joined = shown.length > 1
    ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
    : shown[0];
  return rest > 0 ? `${shown.join(', ')} and ${rest} more` : joined;
}

/** Long case labels are cut, because a wrapped bullet is a bullet nobody reads. */
export function trimLabel(label: string, max = 64): string {
  const clean = (label || '').replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/**
 * What this person was actually responsible for in the window.
 *
 * `rosteredDays` are the days the PUBLISHED roster had them on — already
 * shifted to the day the work falls due by the caller, because only the caller
 * knows the duty. Pass none and the result contains their named cases alone,
 * which is the right answer for a duty with no department roster.
 */
export function memberCaseload(input: {
  duty: DutyKey;
  userId: string;
  rosteredDays?: readonly string[];
  events: readonly DutyEvent[];
  /** How many of the outstanding cases to name. */
  limit?: number;
}): MemberCaseload {
  const grace = DUTIES[input.duty].graceMinutes;
  const onDuty = new Set(input.rosteredDays ?? []);
  const limit = input.limit ?? 3;

  const mine: CaseloadCase[] = [];
  input.events.forEach((e) => {
    const named = !!input.userId && e.personId === input.userId;
    // Unclaimed work on a night they were on. Work a COLLEAGUE did on that
    // night belongs to the colleague — counting it here would tell two people
    // the same case was theirs, and the first of them to check would be right
    // to stop reading.
    const byRoster = !named
      && !e.personId
      && !!e.dutyDay
      && onDuty.has(e.dutyDay);
    if (!named && !byRoster) return;

    const due = asDate(e.dueAt);
    const at = asDate(e.doneAt);
    const margin = due && at ? (due.getTime() - at.getTime()) / 60_000 : null;

    mine.push({
      id: e.id,
      dutyDay: e.dutyDay ?? null,
      label: e.label,
      done: at !== null,
      late: at !== null && margin !== null && margin < -grace,
      named,
    });
  });

  const days: string[] = [];
  mine.forEach((c) => {
    if (c.dutyDay && days.indexOf(c.dutyDay) === -1) days.push(c.dutyDay);
  });
  days.sort();

  const done = mine.filter((c) => c.done).length;
  const late = mine.filter((c) => c.late).length;
  const namedCount = mine.filter((c) => c.named).length;
  const missing = mine
    .filter((c) => !c.done)
    .sort((a, b) => (a.dutyDay ?? '').localeCompare(b.dutyDay ?? ''))
    .slice(0, limit);

  const hasRoster = mine.length - namedCount > 0;
  const basis: MemberCaseload['basis'] = mine.length === 0
    ? 'none'
    : namedCount > 0 && hasRoster
      ? 'both'
      : namedCount > 0 ? 'named' : 'roster';

  return {
    total: mine.length,
    done,
    onTime: done - late,
    late,
    outstanding: mine.length - done,
    named: namedCount,
    onRoster: mine.length - namedCount,
    days,
    missing,
    basis,
  };
}
