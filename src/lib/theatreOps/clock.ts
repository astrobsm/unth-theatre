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

// ---------------------------------------------------------------------------
// Catching the AM/PM slip
// ---------------------------------------------------------------------------

/**
 * The window an elective list runs in, as minutes from midnight.
 *
 * Not a rule about when theatre may operate — emergencies happen at any hour
 * and are never questioned here. It is the range outside which an ELECTIVE
 * booking is more likely to be a typing error than an intention.
 */
export const ELECTIVE_DAY_START_MINUTES = 7 * 60;   // 07:00
export const ELECTIVE_DAY_END_MINUTES = 18 * 60;    // 18:00

export interface TimeQuery {
  /** Said to the person booking, naming the time they actually entered. */
  message: string;
  /** The 12-hour mirror, when it lands in the working day. Null otherwise. */
  didYouMean: string | null;
}

/**
 * Is this elective start time likely to be an AM/PM slip?
 *
 * `<input type="time">` renders as a 12-hour picker with AM/PM wherever the
 * phone's locale is 12-hour, and submits 24-hour "HH:MM". Choose 2:15, leave
 * the picker on AM — which is where it starts when the field is empty — and
 * the booking is saved as 02:15. Two cases on the list for 17 August 2026 came
 * in exactly that way: an abdominal myomectomy at 02:15 and a breast biopsy at
 * 00:40, both plainly meant for the afternoon.
 *
 * It costs more than a wrong label. Urgency on the personal board is measured
 * from the scheduled time, so a case entered as 02:15 is reported as hours
 * overdue from the moment the morning list opens — a false alarm at the top of
 * everybody's board, which is the fastest way to teach people to stop reading
 * it.
 *
 * Returns a question, never a correction. The time entered may be exactly what
 * was meant: a case genuinely booked for 06:30 is unusual, not impossible, and
 * silently rewriting it would be its own bug. Only ELECTIVE cases are queried,
 * because for an emergency 02:15 is simply Tuesday.
 */
export function queryElectiveTime(
  time: string | null | undefined,
  surgeryType: string | null | undefined = 'ELECTIVE',
): TimeQuery | null {
  if ((surgeryType ?? 'ELECTIVE').toUpperCase() !== 'ELECTIVE') return null;
  if (!isClockTime(time)) return null;

  const m = /^(\d{1,2}):(\d{2})$/.exec((time as string).trim()) as RegExpExecArray;
  const hours = Number(m[1]);
  const minutes = hours * 60 + Number(m[2]);
  if (minutes >= ELECTIVE_DAY_START_MINUTES && minutes <= ELECTIVE_DAY_END_MINUTES) return null;

  // Only the small hours have a mirror worth offering: adding twelve to a time
  // before 07:00 lands in the afternoon, which is where the case was meant to
  // be. Adding it to a late evening time would suggest the small hours, and
  // that is not a correction anybody wants offered.
  const mirrored = hours < 12 ? minutes + 12 * 60 : null;
  const didYouMean =
    mirrored !== null && mirrored <= ELECTIVE_DAY_END_MINUTES + 60
      ? `${String(Math.floor(mirrored / 60)).padStart(2, '0')}:${String(mirrored % 60).padStart(2, '0')}`
      : null;

  return {
    message: minutes < ELECTIVE_DAY_START_MINUTES
      ? `${time} is ${hours === 0 ? 12 : hours}:${m[2]} in the morning.`
      : `${time} is after the elective list normally finishes.`,
    didYouMean,
  };
}
