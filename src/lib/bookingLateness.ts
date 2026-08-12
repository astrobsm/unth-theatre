// ============================================================
// When was this case booked, and was it booked too late?
// ------------------------------------------------------------
// Theatre policy: an ELECTIVE case booked after 15:00 on the day before surgery
// is late. By then the list is being planned, CSSD has begun setting up, and
// consumables and blood have been requested — a case arriving after that point
// disrupts work already done.
//
// Pure functions with an explicit clock, so the rule is testable and the same
// booking is judged identically wherever it is displayed. The list, the PDF and
// any future report must never disagree about whether a case was late.
// ============================================================

/**
 * Nigeria is UTC+1 all year — West Africa Time, no daylight saving.
 *
 * This matters more than it looks. The server stores UTC, and "after 15:00"
 * means 15:00 in Enugu, which is 14:00 UTC. Comparing a UTC timestamp against a
 * naive 15:00 would mark every booking between 14:00 and 15:00 local as on time
 * when it was late, and the error would be invisible — an hour's worth of late
 * bookings quietly reported as compliant.
 */
export const WAT_OFFSET_MINUTES = 60;

/** The hour, in local time, after which an elective booking is late. */
export const LATE_CUTOFF_HOUR = 15;

/**
 * The moment after which booking an elective case for `scheduledDate` is late:
 * 15:00 WAT on the day before.
 */
export function lateBookingCutoff(scheduledDate: Date): Date {
  // Read the scheduled date as a calendar day in WAT, not as a UTC instant. A
  // date stored as midnight UTC is still "that day" to the theatre.
  const local = new Date(scheduledDate.getTime() + WAT_OFFSET_MINUTES * 60_000);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();

  // Day before at LATE_CUTOFF_HOUR local, expressed as a UTC instant.
  const cutoffLocalMidnight = Date.UTC(y, m, d - 1, LATE_CUTOFF_HOUR, 0, 0);
  return new Date(cutoffLocalMidnight - WAT_OFFSET_MINUTES * 60_000);
}

export interface BookingLatenessInput {
  /** The operation date. */
  scheduledDate: Date | string;
  /** When the booking was actually made — Surgery.createdAt. */
  bookedAt: Date | string | null | undefined;
  /** ELECTIVE | URGENT | EMERGENCY. Only elective cases can be late. */
  surgeryType: string | null | undefined;
}

export interface BookingLateness {
  isLate: boolean;
  /** Shown next to the flag so the judgement can be checked, not just trusted. */
  reason: string;
  /** Hours past the cutoff. Null when not late. */
  hoursLate: number | null;
  cutoff: Date | null;
}

const asDate = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Was this booking late?
 *
 * Emergency and urgent cases are never late by definition — they are booked when
 * the patient needs them, and flagging them would train people to ignore the
 * flag entirely. A flag that fires on cases nobody could have booked earlier is
 * a flag that gets ignored on the cases that matter.
 */
export function bookingLateness(input: BookingLatenessInput): BookingLateness {
  const scheduled = asDate(input.scheduledDate);
  const booked = asDate(input.bookedAt);
  const type = (input.surgeryType ?? 'ELECTIVE').toUpperCase();

  if (type !== 'ELECTIVE') {
    return {
      isLate: false,
      reason: `${type === 'EMERGENCY' ? 'Emergency' : 'Urgent'} case — the cut-off does not apply.`,
      hoursLate: null,
      cutoff: null,
    };
  }

  if (!scheduled || !booked) {
    // Silent on missing data rather than guessing. An unflagged case can be
    // checked; a wrongly flagged one damages trust in every other flag.
    return {
      isLate: false,
      reason: 'Booking time not recorded.',
      hoursLate: null,
      cutoff: null,
    };
  }

  const cutoff = lateBookingCutoff(scheduled);
  if (booked.getTime() <= cutoff.getTime()) {
    return { isLate: false, reason: 'Booked before the cut-off.', hoursLate: null, cutoff };
  }

  const hoursLate = (booked.getTime() - cutoff.getTime()) / 3_600_000;
  return {
    isLate: true,
    reason: `Elective case booked after 15:00 on the day before surgery (${hoursLate < 24
      ? `${Math.round(hoursLate)}h past the cut-off`
      : `${Math.floor(hoursLate / 24)}d past the cut-off`}).`,
    hoursLate,
    cutoff,
  };
}

/**
 * "11 Aug 2026, 4:32 PM" in WAT.
 *
 * Formatted here rather than by the browser so a PDF produced on the server and
 * a table rendered on a phone show the same string. A booking time that differs
 * between the screen and the printout is the kind of discrepancy that gets
 * raised in a meeting.
 */
export function formatBookedAt(v: Date | string | null | undefined): string {
  const d = asDate(v);
  if (!d) return '—';

  const local = new Date(d.getTime() + WAT_OFFSET_MINUTES * 60_000);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const hour24 = local.getUTCHours();
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const ampm = hour24 < 12 ? 'AM' : 'PM';
  const mins = String(local.getUTCMinutes()).padStart(2, '0');

  return `${local.getUTCDate()} ${months[local.getUTCMonth()]} ${local.getUTCFullYear()}, ${hour12}:${mins} ${ampm}`;
}

/** Short form for a narrow table column: "11 Aug, 4:32 PM". */
export function formatBookedAtShort(v: Date | string | null | undefined): string {
  const full = formatBookedAt(v);
  return full === '—' ? full : full.replace(/ (\d{4}),/, ',');
}
