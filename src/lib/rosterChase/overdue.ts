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

/**
 * The week a roster covers: Monday to Sunday, keyed by its Monday.
 *
 * WHY THE WEEK AND NOT THE MONTH. The duty roster is a weekly document —
 * ROSTER_CATEGORIES are uploaded against a Saturday deadline for the week that
 * follows — and the chase board was asking about calendar months. A department
 * that published nothing for the coming week looked ON_TIME all month because
 * it had published something for the 3rd, and the question theatre actually
 * asks on a Monday morning ("is there a pharmacy roster for THIS week?") could
 * not be put to it at all.
 *
 * Keyed by the Monday rather than an ISO week number on purpose: "2026-W46"
 * has two reasonable readings at a year boundary and no reading at all to the
 * person being chased, while "the week of Monday 9 November" has one.
 */
export function weekPeriod(weekStartDay: string): RosterPeriod | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStartDay)) return null;
  const start = weekStartOf(weekStartDay);
  const end = shift(start, 6);
  return { start, end, label: `week of ${prettyDay(start)}` };
}

/** The Monday on or before this day. */
export function weekStartOf(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  // getUTCDay: 0 = Sunday. Monday-based offset, so Sunday belongs to the week
  // that began six days earlier rather than starting a new one.
  const offset = (t.getUTCDay() + 6) % 7;
  return shift(day, -offset);
}

/** The Monday before this one. */
export function previousWeek(weekStart: string): string {
  return shift(weekStartOf(weekStart), -7);
}

/** The N weeks ending with the one containing `day`, oldest first. */
export function trailingWeeks(day: string, count: number): RosterPeriod[] {
  const out: RosterPeriod[] = [];
  let cursor = weekStartOf(day);
  for (let i = 0; i < Math.max(0, count); i += 1) {
    const w = weekPeriod(cursor);
    if (w) out.unshift(w);
    cursor = previousWeek(cursor);
  }
  return out;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Monday 9 November 2026" — how a week is named to the person being chased. */
export function prettyDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return `${DAYS[t.getUTCDay()]} ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
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

// ============================================================
// How often this department has been late
// ------------------------------------------------------------
// A single missing roster is an oversight. The same department missing four
// weeks out of six is a different conversation, and the chase could not tell
// them apart: every week started from nothing and the message read the same
// whether it was the first time or the ninth.
//
// DERIVED, NOT RECORDED. The tally is computed from the publications that
// already exist rather than from a counter incremented when a chase is sent.
// A counter would have to be right at the moment it was written, would count
// chases rather than failures, and would start at zero on the day it shipped.
// This reads history, so it is correct for weeks that have already passed and
// cannot drift out of step with the roster it describes.
//
// JUDGED ON PUBLICATIONS ONLY, which is why the window is short. A roster that
// predates the publish machinery exists as PUBLISHED rows with no publication
// record, and would read here as missing; over a trailing few weeks there are
// none of those. Do not widen the window without handling that.
// ============================================================

/** A publication, with the span it covers. */
export interface PublicationSpan {
  publishedDay: string;
  periodStart: string;
  periodEnd: string;
}

export interface PeriodOutcome {
  period: RosterPeriod;
  state: RosterSubmissionState;
  dueDay: string;
  /** Days past the deadline, where it arrived late. */
  daysLate: number | null;
}

/**
 * How each of these periods went, from the publications covering them.
 *
 * A period still in the future, or whose deadline has not passed, is reported
 * ON_TIME: it is not an offence not to have done something that is not yet due,
 * and counting it as one would make every tally wrong by one every week.
 */
export function assessPeriods(
  periods: readonly RosterPeriod[],
  publications: readonly PublicationSpan[],
  today: string,
): PeriodOutcome[] {
  return periods.map((period) => {
    const due = dueDay(period);
    const covering = publications
      .filter((p) => p.periodStart <= period.end && p.periodEnd >= period.start)
      .map((p) => p.publishedDay)
      .sort();
    const first = covering.length ? covering[0] : null;

    if (first) {
      const late = daysBetween(due, first);
      return {
        period,
        state: late > 0 ? 'LATE' : 'ON_TIME',
        dueDay: due,
        daysLate: late > 0 ? late : null,
      };
    }
    if (today <= due) {
      return { period, state: 'ON_TIME', dueDay: due, daysLate: null };
    }
    return { period, state: 'MISSING', dueDay: due, daysLate: null };
  });
}

export interface OffenceTally {
  /** How many periods were examined. */
  periods: number;
  late: number;
  missing: number;
  onTime: number;
  /** late + missing — the number the chase letter cites. */
  failures: number;
  /** Consecutive failures ending at the most recent period. */
  runningStreak: number;
  /** The worst run anywhere in the window. */
  worstStreak: number;
  /** Total days late across the periods that did arrive late. */
  totalDaysLate: number;
}

/** Count the failures. `outcomes` must be oldest first. */
export function offenceTally(outcomes: readonly PeriodOutcome[]): OffenceTally {
  let late = 0;
  let missing = 0;
  let onTime = 0;
  let worst = 0;
  let run = 0;
  let totalDaysLate = 0;

  outcomes.forEach((o) => {
    if (o.state === 'ON_TIME') {
      onTime += 1;
      run = 0;
      return;
    }
    if (o.state === 'LATE') {
      late += 1;
      totalDaysLate += o.daysLate ?? 0;
    } else {
      missing += 1;
    }
    run += 1;
    if (run > worst) worst = run;
  });

  // The streak that matters to a letter is the one still running.
  let running = 0;
  for (let i = outcomes.length - 1; i >= 0; i -= 1) {
    if (outcomes[i].state === 'ON_TIME') break;
    running += 1;
  }

  return {
    periods: outcomes.length,
    late,
    missing,
    onTime,
    failures: late + missing,
    runningStreak: running,
    worstStreak: worst,
    totalDaysLate,
  };
}

/**
 * How the tally reads on a board, in one line.
 *
 * Says nothing at all for a clean record — a department that has never been
 * late should not carry a badge saying so, or the badge stops meaning anything
 * on the ones that have.
 */
export function tallySummary(t: OffenceTally): string | null {
  if (t.failures === 0) return null;
  const parts: string[] = [];
  if (t.runningStreak > 1) parts.push(`${t.runningStreak} weeks running`);
  parts.push(`${t.failures} of the last ${t.periods} weeks`);
  if (t.late > 0 && t.missing > 0) parts.push(`${t.missing} missing, ${t.late} late`);
  else if (t.late > 0) parts.push(`${t.late} late`);
  else parts.push(`${t.missing} missing`);
  return parts.join(' · ');
}

/**
 * Which period the board is being asked about.
 *
 * Accepts a week ("2026-11-09", any day in it) or a month ("2026-11"), and
 * DEFAULTS TO THE CURRENT WEEK. The default is the behaviour change: the board
 * used to open on the calendar month, so a department that had published
 * something for the 3rd read as up to date for all of November while this
 * week's theatre had no roster at all. The question worth opening on is the
 * one theatre asks on a Monday morning.
 *
 * `key` is what the query string and the notification link carry, so "already
 * chased about this" means the same period on both sides.
 */
export function resolveChasePeriod(
  params: { week?: string | null; month?: string | null },
  today: string,
): { period: RosterPeriod; key: string; kind: 'week' | 'month' } | null {
  const week = (params.week || '').trim();
  const month = (params.month || '').trim();

  if (week) {
    const p = weekPeriod(week);
    return p ? { period: p, key: `week=${p.start}`, kind: 'week' } : null;
  }
  if (month) {
    const p = monthPeriod(month);
    return p ? { period: p, key: `month=${month}`, kind: 'month' } : null;
  }
  const p = weekPeriod(weekStartOf(today));
  return p ? { period: p, key: `week=${p.start}`, kind: 'week' } : null;
}
