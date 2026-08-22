// ============================================================
// Which calendar day a moment belongs to, in the theatre's timezone
// ------------------------------------------------------------
// The obvious way to get a YYYY-MM-DD out of a Date is
// toISOString().slice(0, 10) — and it is wrong here, because toISOString()
// converts to UTC and this hospital is on WAT (UTC+1).
//
// An emergency required at 00:30 on the 23rd is 23:30 UTC on the 22nd, so a
// UTC day-stamp files it under the 22nd. A surgeon who picks the 23rd — the
// day the case is actually happening — does not see it. Night emergencies are
// the ones this matters most for, which is precisely the wrong set of cases to
// lose.
//
// The theatre server runs Etc/UTC and browsers run whatever the device is set
// to, so neither end can be trusted to produce a local day by accident. WAT is
// pinned deliberately: a phone left on the wrong timezone must not change
// which day a case is filed under.
//
// Nigeria has no daylight saving, so a fixed offset is correct and will stay
// correct.
// ============================================================

import { WAT_OFFSET_MINUTES } from '@/lib/bookingLateness';

export { WAT_OFFSET_MINUTES };

/**
 * The WAT calendar day of an instant, as YYYY-MM-DD.
 *
 * Shift by the offset and then read the UTC fields: adding an hour and asking
 * for the UTC date gives the WAT date, without depending on the runtime's
 * timezone at either end.
 */
export function watDay(value: Date | string | number): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const shifted = new Date(d.getTime() + WAT_OFFSET_MINUTES * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** Today, in WAT. What a date picker should open on. */
export function watToday(now: Date = new Date()): string {
  return watDay(now);
}

/**
 * The UTC instants bounding a WAT calendar day: [start, end).
 *
 * For querying a database that stores UTC — a day in WAT begins at 23:00 UTC
 * the previous day.
 */
export function watDayRange(day: string): { start: Date; end: Date } {
  const [y, m, d] = day.split('-').map(Number);
  const startUtcMs = Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0) - WAT_OFFSET_MINUTES * 60_000;
  return {
    start: new Date(startUtcMs),
    end: new Date(startUtcMs + 24 * 60 * 60 * 1000),
  };
}
