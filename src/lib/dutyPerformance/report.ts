// ============================================================
// Turning duty events into a ranking somebody can act on
// ------------------------------------------------------------
// One pure function over the uniform DutyEvent shape, so all five duties are
// counted by the same code. Written to the same rules as the late-booking
// board, because the hospital now has two performance boards and they must not
// count differently:
//
//   A VOLUME FLOOR, or a person with one task done on time tops the board over
//   somebody who did forty. Everyone below the floor is still listed.
//
//   MEDIAN, NOT MEAN, for margin. One pack finished three days early drags a
//   mean far enough to make a habitually late packer look excellent.
//
//   A MISSING NAME IS NOT A PERFORMER. Work with nobody recorded against it is
//   a data problem; it stays visible and counted in the totals, but it is
//   never ranked, never commended and never chased, because there is nobody to
//   chase.
//
// OUTSTANDING WORK STAYS IN THE DENOMINATOR. The single most important line in
// this file. If work never done were dropped, the person who did nothing would
// score 100% and the person who did everything slightly late would score worse
// than them.
// ============================================================

import {
  DUTIES,
  type DutyEvent,
  type DutyKey,
  type DutyPerformance,
  type DutyReport,
  type DutyUnitPerformance,
  type DutyCaseRow,
} from './types';

/** The least work somebody must be responsible for before they are ranked. */
export const MIN_EVENTS_TO_RANK = 3;

/** At or above this share done on time, the record is commendable. */
export const COMMENDATION_RATE = 0.9;

/** Below this, the record is worth a chase. */
export const CHASE_RATE = 0.7;

const UNRECORDED = 'Not recorded';

const clean = (v: string | null | undefined): string => {
  const t = (v ?? '').trim();
  return t.length > 0 ? t : UNRECORDED;
};

const asDate = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** "2h 15m early" / "40m late" / "—" */
export function formatMargin(minutes: number | null): string {
  if (minutes === null) return '—';
  const late = minutes < 0;
  const m = Math.round(Math.abs(minutes));
  if (m === 0) return 'on the deadline';
  const word = late ? 'late' : 'early';
  if (m < 60) return `${m}m ${word}`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem ? `${h}h ${rem}m ${word}` : `${h}h ${word}`;
  const d = Math.floor(h / 24);
  const hr = h % 24;
  return hr ? `${d}d ${hr}h ${word}` : `${d}d ${word}`;
}

/** "28 Oct 2026, 4:32 PM" in WAT. Nigeria is UTC+1 all year. */
export function formatWat(v: Date | string | null | undefined): string {
  const d = asDate(v);
  if (!d) return '—';
  const local = new Date(d.getTime() + 60 * 60_000);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const h24 = local.getUTCHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ampm = h24 < 12 ? 'AM' : 'PM';
  const mins = String(local.getUTCMinutes()).padStart(2, '0');
  return `${local.getUTCDate()} ${months[local.getUTCMonth()]} ${local.getUTCFullYear()}, ${h12}:${mins} ${ampm}`;
}

/** "84%" — one decimal is false precision on counts this small. */
export function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

interface Acc {
  personId: string | null;
  name: string;
  units: string[];
  total: number;
  done: number;
  late: number;
  margins: number[];
}

/** Best first: completion, then punctuality, then margin, then volume, then name. */
function byPerformance(a: DutyPerformance, b: DutyPerformance): number {
  const ca = a.completionRate ?? 0;
  const cb = b.completionRate ?? 0;
  if (cb !== ca) return cb - ca;
  const pa = a.punctualityRate ?? 0;
  const pb = b.punctualityRate ?? 0;
  if (pb !== pa) return pb - pa;
  const ma = a.medianMarginMinutes ?? 0;
  const mb = b.medianMarginMinutes ?? 0;
  if (mb !== ma) return mb - ma;
  // Volume last among the equal: doing it forty times beats doing it three.
  if (b.total !== a.total) return b.total - a.total;
  return a.name.localeCompare(b.name);
}

export function buildDutyReport(
  duty: DutyKey,
  events: DutyEvent[],
  window: { from: string; to: string },
): DutyReport {
  const grace = DUTIES[duty].graceMinutes;

  const people = new Map<string, Acc>();
  const peopleOrder: string[] = [];
  const unitAcc = new Map<string, { total: number; done: number; late: number }>();
  const unitOrder: string[] = [];
  const cases: DutyCaseRow[] = [];

  let total = 0;
  let done = 0;
  let late = 0;

  events.forEach((e) => {
    const unit = clean(e.unit);
    const name = clean(e.personName);
    // Keyed on id where there is one, so two people with the same name stay
    // two records and one person renamed stays one.
    const key = e.personId ?? `name:${name}`;

    const due = asDate(e.dueAt);
    const at = asDate(e.doneAt);

    // Minutes early (positive) or late (negative). Null when either end is
    // unknown — a duty with no deadline is counted as done, never as late.
    const margin = due && at ? (due.getTime() - at.getTime()) / 60_000 : null;
    const isDone = at !== null;
    // Grace is applied here and nowhere else, so every caller agrees about
    // what "late" means for this duty.
    const isLate = isDone && margin !== null && margin < -grace;

    total += 1;
    if (isDone) done += 1;
    if (isLate) late += 1;

    cases.push({
      id: e.id,
      label: clean(e.label),
      unit,
      personName: name,
      personId: e.personId ?? null,
      dueAtLabel: formatWat(due),
      doneAtLabel: formatWat(at),
      marginMinutes: margin === null ? null : Math.round(margin),
      state: !isDone ? 'OUTSTANDING' : isLate ? 'LATE' : 'ON_TIME',
    });

    let p = people.get(key);
    if (!p) {
      p = { personId: e.personId ?? null, name, units: [], total: 0, done: 0, late: 0, margins: [] };
      people.set(key, p);
      peopleOrder.push(key);
    }
    p.total += 1;
    if (isDone) p.done += 1;
    if (isLate) p.late += 1;
    if (margin !== null && isDone) p.margins.push(margin);
    if (p.units.indexOf(unit) === -1) p.units.push(unit);

    let u = unitAcc.get(unit);
    if (!u) {
      u = { total: 0, done: 0, late: 0 };
      unitAcc.set(unit, u);
      unitOrder.push(unit);
    }
    u.total += 1;
    if (isDone) u.done += 1;
    if (isLate) u.late += 1;
  });

  const everyone: DutyPerformance[] = peopleOrder.map((key) => {
    const p = people.get(key)!;
    const onTime = p.done - p.late;
    const completionRate = p.total > 0 ? p.done / p.total : null;
    const punctualityRate = p.done > 0 ? onTime / p.done : null;
    const attributable = p.name !== UNRECORDED;
    const ranked = p.total >= MIN_EVENTS_TO_RANK && attributable;
    // Commendation is judged on the share of ALL their work done on time, not
    // on punctuality alone: somebody who did three of twenty, perfectly, has
    // not performed the duty well.
    const overall = p.total > 0 ? onTime / p.total : 0;
    return {
      personId: p.personId,
      name: p.name,
      units: p.units.slice().sort(),
      total: p.total,
      done: p.done,
      outstanding: p.total - p.done,
      late: p.late,
      onTime,
      completionRate,
      punctualityRate,
      medianMarginMinutes: median(p.margins),
      perfect: p.total > 0 && p.done === p.total && p.late === 0,
      ranked,
      commendable: ranked && overall >= COMMENDATION_RATE,
    };
  });

  const peopleRanked: DutyPerformance[] = [];
  const unranked: DutyPerformance[] = [];
  everyone.forEach((p) => {
    if (p.ranked) peopleRanked.push(p);
    else unranked.push(p);
  });
  peopleRanked.sort(byPerformance);
  unranked.sort(byPerformance);

  const units: DutyUnitPerformance[] = unitOrder.map((unit) => {
    const u = unitAcc.get(unit)!;
    const onTime = u.done - u.late;
    return {
      unit,
      total: u.total,
      done: u.done,
      outstanding: u.total - u.done,
      late: u.late,
      onTime,
      completionRate: u.total > 0 ? u.done / u.total : null,
      punctualityRate: u.done > 0 ? onTime / u.done : null,
      ranked: u.total >= MIN_EVENTS_TO_RANK,
    };
  });
  units.sort((a, b) => {
    if (a.ranked !== b.ranked) return a.ranked ? -1 : 1;
    const ca = a.completionRate ?? 0;
    const cb = b.completionRate ?? 0;
    if (cb !== ca) return cb - ca;
    const pa = a.punctualityRate ?? 0;
    const pb = b.punctualityRate ?? 0;
    if (pb !== pa) return pb - pa;
    if (b.total !== a.total) return b.total - a.total;
    return a.unit.localeCompare(b.unit);
  });

  // Worst first for the detail table: outstanding above late, latest first.
  const ORDER = { OUTSTANDING: 0, LATE: 1, ON_TIME: 2 };
  cases.sort((a, b) => {
    if (ORDER[a.state] !== ORDER[b.state]) return ORDER[a.state] - ORDER[b.state];
    return (a.marginMinutes ?? 0) - (b.marginMinutes ?? 0);
  });

  const onTime = done - late;

  return {
    duty,
    from: window.from,
    to: window.to,
    total,
    done,
    outstanding: total - done,
    late,
    onTime,
    completionRate: total > 0 ? done / total : null,
    punctualityRate: done > 0 ? onTime / done : null,
    people: peopleRanked,
    unranked,
    units,
    commendable: peopleRanked.filter((p) => p.commendable),
    // Worst first, so the person most worth a conversation is at the top.
    chaseable: peopleRanked
      .filter((p) => (p.total > 0 ? (p.done - p.late) / p.total : 1) < CHASE_RATE)
      .slice()
      .reverse(),
    cases,
  };
}
