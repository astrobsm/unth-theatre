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

/** Shift an instant so its UTC fields read as WAT wall-clock. */
const watShifted = (value: Date) => new Date(value.getTime() + WAT_OFFSET_MINUTES * 60_000);

/**
 * Minutes since midnight, in WAT. 08:30 → 510.
 *
 * For deciding whether a scheduled time of day has arrived. Anything reaching
 * for getHours() instead is reading the HOST's clock — UTC on both servers,
 * and whatever a phone happens to be set to in a browser.
 */
export function watMinutesOfDay(value: Date | string | number): number {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return 0;
  const s = watShifted(d);
  return s.getUTCHours() * 60 + s.getUTCMinutes();
}

/** "HH:MM" in WAT — the wall clock a member of staff actually reads. */
export function watClock(value: Date | string | number): string {
  const mins = watMinutesOfDay(value);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/**
 * The instant at which a WAT wall-clock time occurs: ("2026-05-11", "15:00")
 * → the UTC Date for 15:00 in Enugu.
 *
 * `new Date("2026-05-11T15:00")` parses in the BROWSER's timezone, so the same
 * form filled in on a handset left on UTC and one set to Lagos stores two
 * different instants for the same typed time — and the announcement then goes
 * out an hour adrift on a device nobody thinks to check.
 */
export function watInstantFrom(day: string, time: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!dm || !tm) return null;
  const [hh, mm] = [Number(tm[1]), Number(tm[2])];
  if (hh > 23 || mm > 59) return null;
  return new Date(
    Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), hh, mm)
    - WAT_OFFSET_MINUTES * 60_000,
  );
}

/** Day of week in WAT, 0 = Sunday — matching Date.getDay()'s numbering. */
export function watDayOfWeek(value: Date | string | number): number {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return 0;
  return watShifted(d).getUTCDay();
}
