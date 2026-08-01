// ============================================================
// Turning a booked date + "HH:MM" into an actual instant
// ------------------------------------------------------------
// A theatre list is written in Nigerian time. The servers run in UTC. Every
// calculation in this module — how late a case is, whether it is due for its
// alert, what the on-time percentage was — starts by turning `scheduledDate`
// and `scheduledTime` into an instant, and if that conversion uses the
// SERVER's timezone it is right on a developer's laptop in Enugu and an hour
// wrong in production.
//
// That is not a hypothetical. `new Date(d).setHours(9, 0)` gives 08:00Z at
// UTC+1 and 09:00Z at UTC — the same code, two different answers, and the
// wrong one only ever appears where nobody is looking at it. A case listed for
// 09:00 would have been judged late from 10:45 instead of 09:45, and its
// preoperative alert would have gone out an hour after it should have started.
//
// So the offset is stated here, once, explicitly, and nothing in the module is
// allowed to ask the host what time it thinks it is.
// ============================================================

/**
 * West Africa Time is UTC+1 all year. Nigeria has never observed daylight
 * saving, so a fixed offset is correct rather than merely convenient — no
 * timezone database is needed and none can drift.
 */
export const CLINIC_UTC_OFFSET_MINUTES = 60;

/** True for a well-formed 24-hour "HH:MM". */
export function isClockTime(time: string | null | undefined): boolean {
  if (!time) return false;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return false;
  return Number(m[1]) <= 23 && Number(m[2]) <= 59;
}

/**
 * The instant at which `time` occurs on the day `date` falls on, read as
 * clinic-local time.
 *
 * The calendar day is taken from the UTC fields of `date`. Bookings store
 * either midnight UTC or a time on the intended UTC day, so the UTC date is
 * the booked day in both cases — and unlike the local fields, it is the same
 * wherever this runs.
 *
 * Returns null when the time is missing or unreadable, so a malformed booking
 * is left out of a calculation rather than silently counted as midnight.
 */
export function scheduledInstant(date: Date | null, time: string | null): Date | null {
  if (!date || !isClockTime(time)) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec((time as string).trim()) as RegExpExecArray;
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      Number(m[1]),
      Number(m[2])
    ) - CLINIC_UTC_OFFSET_MINUTES * 60_000
  );
}

/** The clinic-local calendar day of an instant, as "YYYY-MM-DD". */
export function clinicDateKey(instant: Date): string {
  return new Date(instant.getTime() + CLINIC_UTC_OFFSET_MINUTES * 60_000)
    .toISOString()
    .slice(0, 10);
}

/** The clinic-local wall clock of an instant, as "HH:MM". */
export function clinicClock(instant: Date): string {
  return new Date(instant.getTime() + CLINIC_UTC_OFFSET_MINUTES * 60_000)
    .toISOString()
    .slice(11, 16);
}
