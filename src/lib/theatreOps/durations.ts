// ============================================================
// Theatre timings — the durations every other figure rests on
// ------------------------------------------------------------
// Section 11 of the operations proposal asks for waiting time, anaesthesia
// preparation, delay, operative duration, turnover, occupancy and utilisation.
// Every one is a subtraction between two milestones, and every analytic in the
// module is built on them — so they are defined once, here, as pure functions
// over the movement log.
//
// Three rules govern all of it.
//
// A MISSING MILESTONE YIELDS NULL, NEVER ZERO. If nobody recorded when
// anaesthesia started, the anaesthesia time is unknown — not nought minutes.
// Zero would average into the statistics and quietly flatter the department.
// Null is excluded from averages and shown as "not recorded", which is a
// finding in itself.
//
// THE FIRST OCCURRENCE WINS. A patient may re-enter a theatre; a nurse may
// correct a mis-tap. The earliest timestamp for a phase is the one the clock
// ran to, and later duplicates are ignored rather than overwriting it.
//
// A NEGATIVE DURATION IS DISCARDED. Milestones recorded out of order — knife
// before the patient arrived — are a data-entry slip, not a case that finished
// before it began. Reporting a negative would corrupt any average it entered.
// ============================================================

export type Phase =
  | 'WARD'
  | 'PORTER_DISPATCHED'
  | 'HOLDING_AREA'
  | 'INSIDE_THEATRE'
  | 'ANAESTHESIA_STARTED'
  | 'WHO_TIMEOUT_COMPLETED'
  | 'SURGERY_STARTED'
  | 'SURGERY_ENDED'
  | 'DRESSING_COMPLETED'
  | 'RECOVERY_ROOM'
  | 'RETURNED_TO_WARD';

/** The order the phases are expected to occur in, for out-of-sequence checks. */
export const PHASE_ORDER: Phase[] = [
  'WARD',
  'PORTER_DISPATCHED',
  'HOLDING_AREA',
  'INSIDE_THEATRE',
  'ANAESTHESIA_STARTED',
  'WHO_TIMEOUT_COMPLETED',
  'SURGERY_STARTED',
  'SURGERY_ENDED',
  'DRESSING_COMPLETED',
  'RECOVERY_ROOM',
  'RETURNED_TO_WARD',
];

export const PHASE_LABEL: Record<Phase, string> = {
  WARD: 'On the ward',
  PORTER_DISPATCHED: 'Porter dispatched',
  HOLDING_AREA: 'In the holding area',
  INSIDE_THEATRE: 'Entered theatre',
  ANAESTHESIA_STARTED: 'Anaesthesia started',
  WHO_TIMEOUT_COMPLETED: 'WHO time-out completed',
  SURGERY_STARTED: 'Knife to skin',
  SURGERY_ENDED: 'Surgery completed',
  DRESSING_COMPLETED: 'Dressing completed',
  RECOVERY_ROOM: 'Left for recovery',
  RETURNED_TO_WARD: 'Returned to ward',
};

export interface Movement {
  phase: Phase | string;
  timestamp: Date | string;
}

/** Earliest timestamp recorded for a phase, or null. */
export function at(movements: Movement[], phase: Phase): Date | null {
  let earliest: Date | null = null;
  for (const m of movements) {
    if (m.phase !== phase) continue;
    const t = new Date(m.timestamp);
    if (Number.isNaN(t.getTime())) continue;
    if (!earliest || t < earliest) earliest = t;
  }
  return earliest;
}

/**
 * Whole minutes between two milestones.
 *
 * Null when either is missing, and null when the result would be negative —
 * see the header. Rounded rather than truncated so a 90-second gap reads as
 * 2 minutes rather than 1.
 */
export function minutesBetween(from: Date | null, to: Date | null): number | null {
  if (!from || !to) return null;
  const ms = to.getTime() - from.getTime();
  if (ms < 0) return null;
  return Math.round(ms / 60_000);
}

export interface CaseTimings {
  /** From the scheduled start to knife-to-skin. Negative would mean early — see below. */
  delayMinutes: number | null;
  /** Started at or before the scheduled time. */
  onTime: boolean | null;
  /** Ward call to arriving in theatre. */
  transferMinutes: number | null;
  /** Arriving in theatre to anaesthesia starting — the patient waiting, awake. */
  waitingMinutes: number | null;
  /** Anaesthesia start to knife-to-skin. */
  anaesthesiaPrepMinutes: number | null;
  /** Knife-to-skin to surgery end. The operating time itself. */
  operativeMinutes: number | null;
  /** Surgery end to the patient leaving the theatre. */
  closingMinutes: number | null;
  /** Entering to leaving the theatre — what the room was occupied for. */
  occupancyMinutes: number | null;
  /** Milestones that were never recorded. A finding, not a gap to paper over. */
  missing: Phase[];
  /** Milestones recorded out of sequence — a data-entry problem worth surfacing. */
  outOfSequence: Phase[];
}

/**
 * Every duration for one case.
 *
 * `scheduledStart` is the committed commencement time. Cases booked without one
 * cannot be assessed for delay, and this returns null rather than guessing —
 * which is exactly why a start time is required at booking.
 */
export function timingsFor(params: {
  movements: Movement[];
  scheduledStart?: Date | string | null;
}): CaseTimings {
  const { movements, scheduledStart } = params;

  const arrived = at(movements, 'INSIDE_THEATRE');
  const anaesthesia = at(movements, 'ANAESTHESIA_STARTED');
  const knife = at(movements, 'SURGERY_STARTED');
  const ended = at(movements, 'SURGERY_ENDED');
  const left = at(movements, 'RECOVERY_ROOM');
  const called = at(movements, 'PORTER_DISPATCHED');

  const scheduled = scheduledStart ? new Date(scheduledStart) : null;
  const scheduledValid = scheduled && !Number.isNaN(scheduled.getTime()) ? scheduled : null;

  // Delay is the one figure that may legitimately be negative — a case can
  // start early — so it is computed directly rather than through
  // minutesBetween, which discards negatives.
  const delayMinutes =
    scheduledValid && knife ? Math.round((knife.getTime() - scheduledValid.getTime()) / 60_000) : null;

  const missing = ([
    'INSIDE_THEATRE',
    'ANAESTHESIA_STARTED',
    'WHO_TIMEOUT_COMPLETED',
    'SURGERY_STARTED',
    'SURGERY_ENDED',
  ] as Phase[]).filter((p) => at(movements, p) === null);

  return {
    delayMinutes,
    onTime: delayMinutes === null ? null : delayMinutes <= 0,
    transferMinutes: minutesBetween(called, arrived),
    waitingMinutes: minutesBetween(arrived, anaesthesia),
    anaesthesiaPrepMinutes: minutesBetween(anaesthesia, knife),
    operativeMinutes: minutesBetween(knife, ended),
    closingMinutes: minutesBetween(ended, left),
    occupancyMinutes: minutesBetween(arrived, left),
    missing,
    outOfSequence: outOfSequencePhases(movements),
  };
}

/**
 * Phases whose timestamp falls before one that should have preceded them.
 *
 * Surfaced rather than silently corrected: it usually means a milestone was
 * tapped late or on the wrong case, and the person who recorded it is the only
 * one who can say which.
 */
export function outOfSequencePhases(movements: Movement[]): Phase[] {
  const recorded = PHASE_ORDER.map((p) => ({ phase: p, when: at(movements, p) })).filter((x) => x.when);
  const bad: Phase[] = [];
  for (let i = 1; i < recorded.length; i += 1) {
    if (recorded[i].when!.getTime() < recorded[i - 1].when!.getTime()) bad.push(recorded[i].phase);
  }
  return bad;
}

// ---------------------------------------------------------------------------
// Across a list
// ---------------------------------------------------------------------------

/**
 * Mean of the values that exist, ignoring nulls.
 *
 * Returns null when nothing was recorded at all, so a screen can say "not
 * recorded" instead of showing a confident zero.
 */
export function meanMinutes(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return Math.round(present.reduce((s, v) => s + v, 0) / present.length);
}

/**
 * Proportion of cases that started on time, as a whole percentage.
 *
 * Cases with no scheduled time or no knife-to-skin are EXCLUDED from both
 * halves of the fraction rather than counted as late. Counting an unrecorded
 * case as a failure would punish poor record-keeping as though it were poor
 * punctuality, and the two need different remedies.
 */
export function onTimePercent(timings: CaseTimings[]): { percent: number | null; assessed: number; total: number } {
  const assessable = timings.filter((t) => t.onTime !== null);
  if (assessable.length === 0) return { percent: null, assessed: 0, total: timings.length };
  const onTime = assessable.filter((t) => t.onTime).length;
  return {
    percent: Math.round((onTime / assessable.length) * 100),
    assessed: assessable.length,
    total: timings.length,
  };
}

/**
 * Turnover: the gap between one case leaving a theatre and the next entering it.
 *
 * Computed across a theatre's day rather than per case, because turnover is a
 * property of the gap, not of either operation. Cases are sorted by when the
 * patient entered, so a list recorded out of order still produces sane gaps.
 */
export function turnoverMinutes(
  cases: Array<{ enteredAt: Date | null; leftAt: Date | null }>
): number[] {
  const ordered = cases
    .filter((c) => c.enteredAt && c.leftAt)
    .sort((a, b) => a.enteredAt!.getTime() - b.enteredAt!.getTime());

  const gaps: number[] = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const gap = minutesBetween(ordered[i - 1].leftAt, ordered[i].enteredAt);
    // A negative gap means the cases overlapped, which is a different problem
    // from a slow turnover and should not be averaged in as though it were one.
    if (gap !== null) gaps.push(gap);
  }
  return gaps;
}

/**
 * Theatre utilisation: occupied minutes as a percentage of the session.
 *
 * Capped at 100. Running over the session is real and worth knowing, but it is
 * over-running rather than utilisation above capacity, and a figure of 140%
 * invites the wrong conversation.
 */
export function utilisationPercent(occupiedMinutes: number, sessionMinutes: number): number | null {
  if (sessionMinutes <= 0) return null;
  return Math.min(100, Math.round((occupiedMinutes / sessionMinutes) * 100));
}

/** Minutes as a person reads them: "45 min", "2 h 15 min". */
export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return 'not recorded';
  const abs = Math.abs(minutes);
  const sign = minutes < 0 ? '-' : '';
  if (abs < 60) return `${sign}${abs} min`;
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `${sign}${h} h` : `${sign}${h} h ${m} min`;
}
