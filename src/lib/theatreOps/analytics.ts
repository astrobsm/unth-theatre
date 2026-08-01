// ============================================================
// Operational analytics — turning the record into a picture
// ------------------------------------------------------------
// Section 13 asks for performance indicators by theatre, by specialty, by
// department and by delay category. The arithmetic is straightforward; what
// takes care is presenting it honestly, because these numbers will be used to
// judge people and departments.
//
// Three rules, and they are the reason this is a tested module rather than a
// handful of SQL aggregates.
//
// A SMALL SAMPLE IS DECLARED, NOT HIDDEN. A theatre with three cases has an
// on-time rate of 33% or 67% and nothing in between. Ranking it against a
// theatre with two hundred cases as though the figures were comparable invites
// a conversation that the data cannot support, so every rate carries the count
// it was computed from and a flag when that count is too small to mean much.
//
// UNRECORDED IS NOT ZERO, AND IT IS NOT FAILURE. Cases that cannot be assessed
// are excluded from rates and counted separately. A department with poor
// record-keeping needs a different remedy from one with poor punctuality, and
// a figure that merges them prescribes the wrong one.
//
// NOTHING IS ATTRIBUTED TO A PERSON. Every breakdown here is by theatre,
// specialty, category or department. Section 15 puts individual review in the
// hands of a committee; this module gives them the picture, not a verdict.
// ============================================================

import { CaseTimings, meanMinutes, onTimePercent } from './durations';
import { CATEGORY_BY_CODE } from './delays';

/** Below this, a rate is too volatile to rank against others. */
export const MIN_SAMPLE_FOR_RANKING = 10;

export interface CaseForAnalytics {
  id: string;
  theatreName?: string | null;
  specialty?: string | null;
  surgeryType?: string | null;
  timings: CaseTimings;
}

export interface GroupPerformance {
  key: string;
  cases: number;
  /** Cases that could actually be assessed for punctuality. */
  assessed: number;
  onTimePercent: number | null;
  averageDelayMinutes: number | null;
  averageOperativeMinutes: number | null;
  averageOccupancyMinutes: number | null;
  /** Cases with a milestone missing — a record-keeping figure, not a punctuality one. */
  incompleteRecords: number;
  /** True when there is too little here to compare with anything else. */
  smallSample: boolean;
}

function performanceFor(key: string, cases: CaseForAnalytics[]): GroupPerformance {
  const timings = cases.map((c) => c.timings);
  const punctuality = onTimePercent(timings);

  return {
    key,
    cases: cases.length,
    assessed: punctuality.assessed,
    onTimePercent: punctuality.percent,
    // Only cases that were actually late count toward the average delay.
    // Including the early ones would net a genuinely late list back toward
    // zero and hide the problem.
    averageDelayMinutes: meanMinutes(
      timings.map((t) => (t.delayMinutes !== null && t.delayMinutes > 0 ? t.delayMinutes : null))
    ),
    averageOperativeMinutes: meanMinutes(timings.map((t) => t.operativeMinutes)),
    averageOccupancyMinutes: meanMinutes(timings.map((t) => t.occupancyMinutes)),
    incompleteRecords: timings.filter((t) => t.missing.length > 0).length,
    smallSample: punctuality.assessed < MIN_SAMPLE_FOR_RANKING,
  };
}

/** Group by any label. Cases with no label fall into "Unassigned" rather than vanishing. */
function groupBy(cases: CaseForAnalytics[], pick: (c: CaseForAnalytics) => string | null | undefined) {
  const map = new Map<string, CaseForAnalytics[]>();
  for (const c of cases) {
    const key = (pick(c) ?? '').trim() || 'Unassigned';
    map.set(key, [...(map.get(key) ?? []), c]);
  }
  return map;
}

export function byTheatre(cases: CaseForAnalytics[]): GroupPerformance[] {
  return Array.from(groupBy(cases, (c) => c.theatreName).entries())
    .map(([k, v]) => performanceFor(k, v))
    .sort((a, b) => b.cases - a.cases);
}

export function bySpecialty(cases: CaseForAnalytics[]): GroupPerformance[] {
  return Array.from(groupBy(cases, (c) => c.specialty).entries())
    .map(([k, v]) => performanceFor(k, v))
    .sort((a, b) => b.cases - a.cases);
}

/** The headline figures for a period. */
export function overall(cases: CaseForAnalytics[]) {
  const p = performanceFor('All theatres', cases);
  return {
    ...p,
    emergencies: cases.filter((c) => c.surgeryType === 'EMERGENCY').length,
    // Stated separately because it is the figure that tells you whether the
    // other figures can be believed.
    recordCompleteness:
      cases.length === 0 ? null : Math.round(((cases.length - p.incompleteRecords) / cases.length) * 100),
  };
}

// ---------------------------------------------------------------------------
// Delay analysis
// ---------------------------------------------------------------------------

export interface DelayRow {
  categoryCode: string;
  minutesLate?: number | null;
  recordedAt: Date | string;
}

export interface BottleneckRow {
  code: string;
  label: string;
  group: string;
  count: number;
  totalMinutes: number;
  averageMinutes: number;
  avoidable: boolean;
  /** Share of all recorded delays, to one decimal. */
  sharePercent: number;
}

/**
 * The bottleneck list: what actually costs the theatre its mornings.
 *
 * Ranked by MINUTES LOST rather than by frequency. A cause that happens twice
 * a month and costs two hours each time matters more than one that happens
 * daily and costs five minutes, and ranking by count would bury it.
 */
export function bottlenecks(delays: DelayRow[]): BottleneckRow[] {
  const map = new Map<string, BottleneckRow>();

  for (const d of delays) {
    const cat = CATEGORY_BY_CODE[d.categoryCode];
    const row = map.get(d.categoryCode) ?? {
      code: d.categoryCode,
      label: cat?.label ?? d.categoryCode,
      group: cat?.group ?? 'Other',
      count: 0,
      totalMinutes: 0,
      averageMinutes: 0,
      avoidable: cat?.avoidable ?? false,
      sharePercent: 0,
    };
    row.count += 1;
    row.totalMinutes += d.minutesLate ?? 0;
    map.set(d.categoryCode, row);
  }

  const rows = Array.from(map.values());
  const totalMinutes = rows.reduce((s, r) => s + r.totalMinutes, 0);

  return rows
    .map((r) => ({
      ...r,
      averageMinutes: r.count > 0 ? Math.round(r.totalMinutes / r.count) : 0,
      sharePercent: totalMinutes > 0 ? Math.round((r.totalMinutes / totalMinutes) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);
}

/** Delays per day, for a trend line. Days with none are included as zero. */
export function delayTrend(delays: DelayRow[], from: Date, to: Date) {
  const byDay = new Map<string, { count: number; minutes: number }>();

  for (const d of delays) {
    const key = new Date(d.recordedAt).toISOString().slice(0, 10);
    const row = byDay.get(key) ?? { count: 0, minutes: 0 };
    row.count += 1;
    row.minutes += d.minutesLate ?? 0;
    byDay.set(key, row);
  }

  // A gap in a trend line reads as "no data"; an explicit zero reads as "a
  // good day". They mean different things and the chart should say which.
  const out: Array<{ date: string; count: number; minutes: number }> = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);

  let guard = 0;
  while (cursor <= end && guard < 400) {
    const key = cursor.toISOString().slice(0, 10);
    const row = byDay.get(key) ?? { count: 0, minutes: 0 };
    out.push({ date: key, ...row });
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Departmental responsiveness
// ---------------------------------------------------------------------------

export interface EscalationRow {
  notifiedRole: string;
  status: string;
  createdAt: Date | string;
  acknowledgedAt?: Date | string | null;
  resolvedAt?: Date | string | null;
}

export interface DepartmentPerformance {
  role: string;
  raised: number;
  acknowledged: number;
  resolved: number;
  stillOpen: number;
  /** Minutes to first acknowledgement, averaged over those that were. */
  averageAcknowledgeMinutes: number | null;
  averageResolveMinutes: number | null;
  /** Raised but never acknowledged — the figure that matters most. */
  neverAcknowledged: number;
  smallSample: boolean;
}

/**
 * How each department responds when it is told.
 *
 * Response times are averaged only over escalations that WERE answered. An
 * unanswered one has no response time — it has a failure, counted separately as
 * `neverAcknowledged`. Folding an unanswered escalation in as a very large
 * number would let one bad case swamp a department's average and obscure the
 * simpler, more damning fact that nobody replied at all.
 */
export function byDepartment(escalations: EscalationRow[]): DepartmentPerformance[] {
  const map = new Map<string, EscalationRow[]>();
  for (const e of escalations) {
    map.set(e.notifiedRole, [...(map.get(e.notifiedRole) ?? []), e]);
  }

  return Array.from(map.entries())
    .map(([role, rows]) => {
      const mins = (a: Date | string, b: Date | string) =>
        Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000));

      const acked = rows.filter((r) => r.acknowledgedAt);
      const resolved = rows.filter((r) => r.resolvedAt);

      return {
        role,
        raised: rows.length,
        acknowledged: acked.length,
        resolved: resolved.length,
        stillOpen: rows.filter((r) => r.status === 'OPEN').length,
        averageAcknowledgeMinutes: acked.length
          ? Math.round(acked.reduce((s, r) => s + mins(r.createdAt, r.acknowledgedAt!), 0) / acked.length)
          : null,
        averageResolveMinutes: resolved.length
          ? Math.round(resolved.reduce((s, r) => s + mins(r.createdAt, r.resolvedAt!), 0) / resolved.length)
          : null,
        neverAcknowledged: rows.filter((r) => !r.acknowledgedAt && r.status === 'OPEN').length,
        smallSample: rows.length < MIN_SAMPLE_FOR_RANKING,
      };
    })
    .sort((a, b) => b.raised - a.raised);
}

// ---------------------------------------------------------------------------
// Utilisation
// ---------------------------------------------------------------------------

/**
 * Theatre utilisation across a period.
 *
 * Occupied minutes over available session minutes. Sessions are counted as
 * whole days at the stated length: a theatre that ran no list on Tuesday had
 * no session to utilise, so Tuesday is not counted against it.
 */
export function utilisation(params: {
  cases: CaseForAnalytics[];
  sessionMinutesPerDay?: number;
  daysWithLists: number;
}): { occupiedMinutes: number; availableMinutes: number; percent: number | null; unrecorded: number } {
  const { cases, sessionMinutesPerDay = 8 * 60, daysWithLists } = params;

  const occupied = cases
    .map((c) => c.timings.occupancyMinutes)
    .filter((m): m is number => m !== null)
    .reduce((s, m) => s + m, 0);

  const available = daysWithLists * sessionMinutesPerDay;

  return {
    occupiedMinutes: occupied,
    availableMinutes: available,
    percent: available > 0 ? Math.min(100, Math.round((occupied / available) * 100)) : null,
    // Cases whose occupancy could not be computed. Utilisation is understated
    // by however many of these there are, and saying so is the difference
    // between a figure and a guess.
    unrecorded: cases.filter((c) => c.timings.occupancyMinutes === null).length,
  };
}
