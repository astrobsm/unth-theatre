// ============================================================
// An emergency cannot be needed in the past
// ------------------------------------------------------------
// On 27 August a panfacial reconstruction was booked as an emergency and
// required-by 20 August — a week before it was entered. Nothing rejected it.
// The radio announced it, because announcements fire on creation, and then no
// list showed it, because every list is filtered to a day that had already
// gone. The theatre heard an emergency it could not find.
//
// The rule is deliberately about the DAY, not the instant.
//
// A case required at 09:00 and entered at 09:30 is late, not wrong — that is
// exactly what an emergency looks like when somebody books it after starting
// to deal with it. Rejecting the past half-hour would block real cases at the
// moment they are most urgent. A day that has already ended is different:
// there is no reading of it under which the surgery is still ahead of us.
//
// Days are compared in WAT, so a phone on the wrong timezone cannot make
// today look like yesterday. YYYY-MM-DD strings compare correctly with <.
// ============================================================

import { watDay, watToday } from '@/lib/watDay';

export type RequiredByVerdict =
  | { ok: true }
  | { ok: false; reason: 'INVALID'; message: string }
  | { ok: false; reason: 'IN_PAST'; day: string; today: string; message: string };

/**
 * May this required-by time be accepted for an emergency booking?
 *
 * Pure and exported so the rule can be proved rather than read: it is the only
 * thing standing between a mistyped year and a case nobody can see.
 *
 * An absent value is accepted — the caller defaults it to now, which is the
 * right answer for an emergency being booked as it happens.
 */
export function checkRequiredByTime(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): RequiredByVerdict {
  if (value === null || value === undefined || value === '') return { ok: true };

  const day = watDay(value);
  // watDay returns '' for anything it cannot read as a date. Letting that
  // through produces an Invalid Date, and every downstream day-bound is then
  // silently nonsense.
  if (!day) {
    return {
      ok: false,
      reason: 'INVALID',
      message: 'The required-by time is not a valid date and time.',
    };
  }

  const today = watToday(now);
  if (day < today) {
    return {
      ok: false,
      reason: 'IN_PAST',
      day,
      today,
      message:
        `An emergency cannot be required on ${day} — that day has already passed. ` +
        `Check the date: emergencies are for today (${today}) or later. ` +
        `If this case has already been operated on, record it as a completed case rather than an emergency booking.`,
    };
  }

  return { ok: true };
}
