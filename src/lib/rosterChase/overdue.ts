// ============================================================
// Whether a department's roster arrived in time
// ------------------------------------------------------------
// A roster is "submitted" when it is PUBLISHED. Draft rows are not a roster:
// nothing downstream reads them, by deliberate design — the on-duty resolver,
// the meal counts, the booking auto-assign and the duty-performance
// attribution all read PUBLISHED rows only. A department with three hundred
// draft rows and no publication has, as far as every other part of this
// hospital is concerned, submitted nothing.
//
// THAT IS THE MOST IMPORTANT THING THE CHASE HAS TO SAY, because "I did it" and
// "it was published" feel like the same claim to the person who typed it in,
// and they are not. A roster drafted and never published is the single
// commonest way a department ends up reported as having submitted nothing, and
// the message distinguishes the two states for exactly that reason.
//
// ONE DEADLINE, IN ONE PLACE. Changing ROSTER_DUE_DAYS_BEFORE changes the
// board, every message and every test together.
// ============================================================

/**
 * How many days before a period starts its roster is due.
 *
 * Seven: the week before. A roster that lands on the morning the period begins
 * is too late to be useful even when it is technically present — pharmacy and
 * the pack providers plan their week from it, the meal counts are ordered
 * against it, and a nurse cannot arrange childcare for a night shift they
 * learn about that afternoon.
 */
export const ROSTER_DUE_DAYS_BEFORE = 7;

export type RosterSubmissionState =
  /** Published on or before the deadline. Nothing to ask. */
  | 'ON_TIME'
  /** Published, but after the deadline. */
  | 'LATE'
  /** Rows exist in draft and nothing has been published. */
  | 'DRAFTED_NOT_PUBLISHED'
  /** Nothing at all for the period. */
  | 'MISSING';

/** A period, as the board asks about it. */
export interface RosterPeriod {
  /** YYYY-MM-DD, inclusive. */
  start: string;
  /** YYYY-MM-DD, inclusive. */
  end: string;
  /** "November 2026" */
  label: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

/** The whole of one calendar month, from "YYYY-MM". */
export function monthPeriod(month: string): RosterPeriod | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  // Day 0 of the next month is the last day of this one, leap years included.
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return {
    start: `${y}-${pad(mo)}-01`,
    end: `${y}-${pad(mo)}-${pad(last)}`,
    label: `${MONTHS[mo - 1]} ${y}`,
  };
}

/** The month a date falls in, as "YYYY-MM". */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

/** Shift a YYYY-MM-DD by whole days. Noon, so no offset can cross a date. */
function shift(day: string, by: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  t.setUTCDate(t.getUTCDate() + by);
  return t.toISOString().slice(0, 10);
}

/** When this period's roster was due. */
export function dueDay(period: RosterPeriod): string {
  return shift(period.start, -ROSTER_DUE_DAYS_BEFORE);
}

/** Whole days between two YYYY-MM-DD days, b − a. */
export function daysBetween(a: string, b: string): number {
  const p = (s: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  };
  const x = p(a);
  const y = p(b);
  if (Number.isNaN(x) || Number.isNaN(y)) return 0;
  return Math.round((y - x) / 86_400_000);
}

/** Today in Enugu. WAT is UTC+1 with no daylight saving. */
export function watToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 60 * 60_000).toISOString().slice(0, 10);
}

export interface PublicationFact {
  /** When it was published, as a WAT calendar day. */
  publishedDay: string;
  version: number;
  publishedByName: string | null;
  rowCount: number;
}

export interface AssessInput {
  period: RosterPeriod;
  /** The publications covering this period, newest first or in any order. */
  publications: readonly PublicationFact[];
  /** How many DRAFT roster rows exist for the department in the period. */
  draftRows: number;
  /** How many PUBLISHED roster rows exist for it. */
  publishedRows: number;
  /** Today, for judging a period that has not started yet. */
  today?: string;
}

export interface RosterAssessment {
  state: RosterSubmissionState;
  /** When it was due. */
  dueDay: string;
  /** The FIRST publication for the period — submission is when it first arrived. */
  firstPublishedDay: string | null;
  /** Days past the deadline. Null when it was on time or has never arrived. */
  daysLate: number | null;
  /** For a period with nothing published: how far past the deadline we now are. */
  daysOverdue: number | null;
  /** Latest version published, where there is one. */
  version: number | null;
  publishedByName: string | null;
  draftRows: number;
  publishedRows: number;
  /** True while the deadline is still ahead — nothing to chase yet. */
  notYetDue: boolean;
}

/**
 * Was this department's roster in on time?
 *
 * Judged on the FIRST publication, not the latest. A department that published
 * a week early and then corrected it twice during the month has submitted on
 * time; measuring the most recent version would report every department that
 * maintains its roster properly as the latest of all of them, which is exactly
 * backwards.
 */
export function assessRoster(input: AssessInput): RosterAssessment {
  const due = dueDay(input.period);
  const today = input.today ?? watToday();

  const days = input.publications
    .map((p) => p.publishedDay)
    .filter(Boolean)
    .sort();
  const first = days.length ? days[0] : null;

  const latest = input.publications
    .slice()
    .sort((a, b) => b.version - a.version)[0] ?? null;

  const base = {
    dueDay: due,
    firstPublishedDay: first,
    version: latest ? latest.version : null,
    publishedByName: latest ? latest.publishedByName : null,
    draftRows: input.draftRows,
    publishedRows: input.publishedRows,
    notYetDue: today <= due,
  };

  if (first) {
    const late = daysBetween(due, first);
    return {
      ...base,
      state: late > 0 ? 'LATE' : 'ON_TIME',
      daysLate: late > 0 ? late : null,
      daysOverdue: null,
    };
  }

  // Nothing published. Rows already PUBLISHED without a publication record
  // are an older roster uploaded before the publish machinery existed — they
  // are a real roster and must not be reported as missing.
  if (input.publishedRows > 0) {
    return { ...base, state: 'ON_TIME', daysLate: null, daysOverdue: null };
  }

  const overdue = daysBetween(due, today);
  return {
    ...base,
    state: input.draftRows > 0 ? 'DRAFTED_NOT_PUBLISHED' : 'MISSING',
    daysLate: null,
    daysOverdue: overdue > 0 ? overdue : null,
  };
}

/** Is this something worth writing to a head of department about? */
export function worthChasing(a: RosterAssessment): boolean {
  if (a.state === 'ON_TIME') return false;
  // A period whose deadline has not arrived is not late, whatever is missing.
  if (a.notYetDue) return false;
  return true;
}

/** How a state reads on a board. */
export const STATE_LABELS: Record<RosterSubmissionState, string> = {
  ON_TIME: 'In on time',
  LATE: 'Submitted late',
  DRAFTED_NOT_PUBLISHED: 'Drafted, never published',
  MISSING: 'Nothing submitted',
};
