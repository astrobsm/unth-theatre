// ============================================================
// Theatre list scheduling — when the next case can actually start
// ------------------------------------------------------------
// A theatre list is a queue with a fixed cost between every pair of cases:
// the patient has to leave, the room has to be cleaned, and the next patient
// has to be brought in. Booking the second case for the moment the first is
// due to finish books it for a time that cannot happen.
//
// So every start time is stated, not guessed — and the next one is OFFERED,
// computed from the case before it plus the turnover.
//
// SUGGESTED, NOT IMPOSED. The previous behaviour silently overwrote whatever
// time a surgeon chose for an elective case. That is worse than it sounds: the
// surgeon believes they booked 11:00, the system booked 13:45, and nobody
// finds out until the ward sends the patient at the wrong hour. Here the
// computed time is a DEFAULT the surgeon sees and may change, and an overlap
// is refused with an explanation rather than corrected behind their back.
// ============================================================

/** Patient out, theatre cleaned, next patient in. */
export const TURNOVER_MINUTES = 20;

/** When a list starts if nothing is booked yet. */
export const FIRST_CASE_HOUR = 9;

/** Cases must finish by this time. */
export const END_OF_DAY_MINUTES = 17 * 60;

export interface ScheduledCase {
  /** "HH:MM", 24-hour. */
  scheduledTime: string;
  estimatedDuration: number;
  id?: string;
}

/** "HH:MM" to minutes from midnight, or null if it is not a time. */
export function toMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function toClock(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/** When a case ends: its start plus its duration. */
export function endOf(c: ScheduledCase): number | null {
  const start = toMinutes(c.scheduledTime);
  if (start === null) return null;
  return start + Math.max(0, c.estimatedDuration || 0);
}

/**
 * The earliest a new case could start, given what is already booked.
 *
 * Computed from the LAST case to finish rather than the last one booked: a
 * case added out of order, or a long case booked early in the list, both move
 * the free slot, and sorting by start time alone would miss it.
 */
export function nextAvailableStart(
  existing: ScheduledCase[],
  opts: { turnoverMinutes?: number; firstCaseHour?: number } = {}
): number {
  const turnover = opts.turnoverMinutes ?? TURNOVER_MINUTES;
  const firstHour = opts.firstCaseHour ?? FIRST_CASE_HOUR;

  const ends = existing
    .map(endOf)
    .filter((e): e is number => e !== null);

  if (ends.length === 0) return firstHour * 60;

  return Math.max(...ends) + turnover;
}

export interface SlotCheck {
  ok: boolean;
  code?: string;
  message?: string;
  /** What the caller should offer instead. */
  suggestedStart?: string;
}

/**
 * Does this case fit where it has been asked to go?
 *
 * Two ways it can fail, and they need different messages because they need
 * different actions: overlapping another case means move it, running past the
 * cutoff means another day.
 */
export function checkSlot(params: {
  scheduledTime: string;
  estimatedDuration: number;
  existing: ScheduledCase[];
  turnoverMinutes?: number;
  endOfDayMinutes?: number;
  /** Excluded from the overlap check when a booking is being edited. */
  ignoreId?: string;
}): SlotCheck {
  const {
    scheduledTime,
    estimatedDuration,
    existing,
    turnoverMinutes = TURNOVER_MINUTES,
    endOfDayMinutes = END_OF_DAY_MINUTES,
    ignoreId,
  } = params;

  const start = toMinutes(scheduledTime);
  if (start === null) {
    return { ok: false, code: 'INVALID_TIME', message: 'Enter a start time as HH:MM.' };
  }
  if (!Number.isInteger(estimatedDuration) || estimatedDuration <= 0) {
    return { ok: false, code: 'INVALID_DURATION', message: 'Enter how long the case is expected to take, in minutes.' };
  }

  const end = start + estimatedDuration;
  const others = existing.filter((c) => !ignoreId || c.id !== ignoreId);

  if (end > endOfDayMinutes) {
    return {
      ok: false,
      code: 'PAST_CUTOFF',
      message: `Starting at ${toClock(start)} this case would finish at ${toClock(end)}, past the ${toClock(endOfDayMinutes)} cutoff. Book it on another day.`,
    };
  }

  // Overlap, INCLUDING the turnover either side — a case starting the minute
  // the previous one ends leaves no time to clean the theatre or move the
  // patient, which is the whole reason turnover exists.
  for (const other of others) {
    const os = toMinutes(other.scheduledTime);
    const oe = endOf(other);
    if (os === null || oe === null) continue;

    const clashes = start < oe + turnoverMinutes && os < end + turnoverMinutes;
    if (clashes) {
      const suggested = nextAvailableStart(others, { turnoverMinutes });
      return {
        ok: false,
        code: 'OVERLAP',
        message: `A case runs from ${toClock(os)} to ${toClock(oe)}, and ${turnoverMinutes} minutes are needed after it to clean the theatre and move the patient. The earliest free start is ${toClock(suggested)}.`,
        suggestedStart: toClock(suggested),
      };
    }
  }

  return { ok: true };
}

export interface ListPlan {
  /** What to offer as the start time for the next case. */
  suggestedStart: string;
  /** Minutes of theatre time already committed, including turnovers. */
  committedMinutes: number;
  /** Whether another case of typical length would still fit before the cutoff. */
  roomForAnother: boolean;
  cases: Array<{ id?: string; start: string; end: string; durationMinutes: number }>;
}

/**
 * The day's list as it stands, and where the next case would go.
 *
 * Used by the booking form to default the time, and by the list view to show
 * the day at a glance.
 */
export function planList(
  existing: ScheduledCase[],
  opts: { turnoverMinutes?: number; firstCaseHour?: number; endOfDayMinutes?: number; typicalCaseMinutes?: number } = {}
): ListPlan {
  const turnover = opts.turnoverMinutes ?? TURNOVER_MINUTES;
  const endOfDay = opts.endOfDayMinutes ?? END_OF_DAY_MINUTES;
  const typical = opts.typicalCaseMinutes ?? 60;

  const cases = existing
    .map((c) => ({ c, start: toMinutes(c.scheduledTime), end: endOf(c) }))
    .filter((x): x is { c: ScheduledCase; start: number; end: number } => x.start !== null && x.end !== null)
    .sort((a, b) => a.start - b.start)
    .map((x) => ({
      id: x.c.id,
      start: toClock(x.start),
      end: toClock(x.end),
      durationMinutes: x.end - x.start,
    }));

  const suggested = nextAvailableStart(existing, { turnoverMinutes: turnover, firstCaseHour: opts.firstCaseHour });

  return {
    suggestedStart: toClock(suggested),
    committedMinutes: cases.reduce((s, c) => s + c.durationMinutes, 0) + Math.max(0, cases.length - 1) * turnover,
    roomForAnother: suggested + typical <= endOfDay,
    cases,
  };
}
