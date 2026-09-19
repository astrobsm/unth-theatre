/**
 * The theatre's day, which is not the server's day.
 *
 * The theatre works to WAT. A readiness ticked at half past midnight and a
 * DATE column compared in UTC disagree for an hour every night, which would
 * file that confirmation under yesterday and hide it from the morning board.
 *
 * Shared rather than repeated: the readiness record, the availability board
 * and the CMD's screen must all agree on which day it is, or they show
 * different theatres as ready.
 */

const WAT_OFFSET_MINUTES = 60;

/** Midnight at the start of the current theatre day, as a UTC instant. */
export function theatreDay(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + WAT_OFFSET_MINUTES * 60_000);
  return new Date(Date.UTC(
    shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), 0, 0, 0, 0,
  ));
}

/**
 * A YYYY-MM-DD from a query string, or today.
 *
 * Anything unparseable falls back to today rather than erroring. A board that
 * refuses to draw because a date was mistyped is less useful than one showing
 * the day everybody is standing in.
 */
export function parseTheatreDay(value: string | null | undefined): Date {
  if (!value) return theatreDay();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return theatreDay();
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? theatreDay() : d;
}

/** The instants bounding a theatre day, for filtering timestamp columns. */
export function theatreDayBounds(day: Date): { start: Date; end: Date } {
  const start = new Date(day.getTime() - WAT_OFFSET_MINUTES * 60_000);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60_000) };
}

/** YYYY-MM-DD, for a query string or a heading. */
export function dayKey(day: Date): string {
  return day.toISOString().slice(0, 10);
}
