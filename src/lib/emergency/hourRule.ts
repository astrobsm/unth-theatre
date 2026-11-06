// ============================================================
// The hour: when a booked emergency has to be on the table
// ------------------------------------------------------------
// The theatre's own rule, and the one the team is chased against:
//
//   "any emergency booked must be started within an hour"
//
// It already existed in two half-forms. The delay ladder in
// emergencyEscalation.ts measures an hour from the required-by time and then
// starts asking people why; the booking card shows a required-by and nothing
// else. Neither of them told the team, before the hour was gone, what time
// they were working to. This file is that time, computed once.
//
// WHICH HOUR, EXACTLY. Two times are on every booking: when it was raised
// (requestedAt) and when the surgeon says it has to happen by
// (requiredByTime). The deadline is the EARLIER of
//
//   requestedAt + 60 minutes   — the hospital rule, which applies to every
//                                emergency whatever anybody wrote; and
//   requiredByTime             — the surgeon's own statement of urgency.
//
// Earlier, not later, and that is the whole decision. Taking the later one
// would let "required by 16:00" written against a case booked at 08:00
// excuse eight hours of waiting, which is precisely the practice the rule
// exists to end. Taking the earlier never relaxes anything: a surgeon who
// says thirty minutes gets thirty minutes, and a surgeon who says nothing,
// or writes a time already past, gets the hour.
//
// A REQUIRED-BY IN THE PAST IS IGNORED FOR THE DEADLINE, not treated as an
// instant deadline. Real bookings carry them: a case raised at 17:00 and
// marked required-by 10:00 the same morning is somebody recording a case
// they have been dealing with since ten, not a case that was due seven hours
// before it was booked. Reading it literally would make every such booking
// born overdue, and a board on which everything is red is a board nobody
// reads.
//
// Pure, and exported so the rule can be proved rather than read. It decides
// what a WhatsApp message tells a consultant at two in the morning.
// ============================================================

/** The hospital rule, in minutes. One hour from the moment it is booked. */
export const START_WITHIN_MINUTES = 60;

/** The rule, in the words the messages and the screens use. */
export const HOUR_RULE_TEXT =
  'Every emergency that is booked must be started within one hour of booking.';

/**
 * The window in which a blocker must be recorded instead.
 *
 * The same hour. There are two ways to comply and only two, and they share a
 * deadline: the case starts, or somebody writes down what is stopping it.
 */
export const BLOCKER_WITHIN_MINUTES = START_WITHIN_MINUTES;

/**
 * The formal notice carried by every chase, and shown on the screen that
 * sends one.
 *
 * ASKED FOR IN THESE WORDS on 6 November: "remind the bookers and the team
 * members that booking emergency without getting them done within an hour or
 * reporting a blocker to the surgery within an hour is an indictment, let it
 * have a legal tone."
 *
 * WHY THE REGISTER IS DELIBERATE, AND WHERE ITS LIMITS ARE. Theatre has sent
 * polite reminders about this rule for months and the hour goes on being
 * missed, because a courteous message carries no weight and everybody knows
 * it. A notice that states the standard, the two ways to meet it, and what
 * follows from meeting neither is a different thing to receive, and it is
 * the thing that was asked for.
 *
 * It is written to be TRUE OF WHAT THIS SYSTEM ACTUALLY DOES, and nothing
 * beyond it. Every consequence named here already exists in code and runs
 * whether or not anybody presses chase: the ladder in
 * src/lib/emergencyEscalation.ts asks everybody by name at one hour, informs
 * the Chief Medical Director at two, and drafts a Theatre Audit Committee
 * invitation for each person at three. Nothing here invents a sanction, a
 * tribunal or an employment consequence that the hospital has not already
 * put in place, because a threat the system cannot carry out is found out
 * the first time somebody tests it -- and then the real ladder is not
 * believed either.
 *
 * It accuses nobody. It states a standard and what follows from missing it,
 * in the second person, before the hour is gone and while there is still
 * time to comply. A person who records a blocker has complied.
 */
export const HOUR_RULE_NOTICE = [
  '*NOTICE — THEATRE EMERGENCY STANDARD*',
  '',
  'This is a formal reminder and is recorded as having been sent.',
  '',
  'An emergency that has been booked must be ON THE TABLE WITHIN ONE HOUR OF '
    + 'BOOKING. There are two ways, and only two, to satisfy that standard:',
  '',
  '  1. the case starts within the hour; or',
  '  2. a blocker is recorded on the app within the hour, stating what is '
    + 'preventing the case and who is dealing with it.',
  '',
  'Neither of those being done is a breach of the standard, and it is recorded '
    + 'as an indictment against those responsible — the booking surgeon first, '
    + 'and each team member whose part was outstanding. The record is held '
    + 'against the case permanently. At two hours the Chief Medical Director is '
    + 'informed. At three hours an invitation to appear before the Theatre Audit '
    + 'Committee is drafted in the name of every person on the case.',
  '',
  'A case that genuinely cannot start is defensible, and recording the blocker '
    + 'is how it is defended. Silence is not.',
].join('\n');

/** The same notice for a screen, without WhatsApp's asterisks. */
export const HOUR_RULE_NOTICE_PLAIN = HOUR_RULE_NOTICE.replace(/\*/g, '');

export interface BookingClock {
  /** When the emergency was raised. */
  requestedAt: Date | string;
  /** When the surgeon says it must start by, if they said. */
  requiredByTime?: Date | string | null;
  /** Set once the case actually begins. */
  actualStartTime?: Date | string | null;
  status?: string | null;
}

const asDate = (v: Date | string | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Statuses that mean the case is no longer waiting to start. */
export const SETTLED = ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

export function isSettled(b: Pick<BookingClock, 'status' | 'actualStartTime'>): boolean {
  if (asDate(b.actualStartTime)) return true;
  return (SETTLED as readonly string[]).includes(b.status ?? '');
}

/**
 * The time this case has to be on the table by.
 *
 * Null only when the booking carries no readable requestedAt at all, which
 * should not happen — the column has a default — but a null here is better
 * than an Invalid Date propagating into a message.
 */
export function startByDeadline(b: BookingClock): Date | null {
  const booked = asDate(b.requestedAt);
  if (!booked) return null;

  const byRule = new Date(booked.getTime() + START_WITHIN_MINUTES * 60_000);
  const stated = asDate(b.requiredByTime);

  // A stated time before the booking itself is a record of a case already in
  // hand, not a deadline that has passed. See the header.
  if (stated && stated > booked && stated < byRule) return stated;
  return byRule;
}

export interface HourRuleStanding {
  deadline: Date | null;
  /** Positive before the deadline, negative after it. Null if no deadline. */
  minutesRemaining: number | null;
  overdue: boolean;
  /** True once the case has started, been cancelled or completed. */
  settled: boolean;
  /** Whether the surgeon's own time, rather than the hour, set the deadline. */
  setByRequiredBy: boolean;
  /** "23 minutes left", "41 minutes over the hour", "already started". */
  label: string;
}

const describeMinutes = (m: number): string => {
  const abs = Math.abs(m);
  const h = Math.floor(abs / 60);
  const r = abs % 60;
  if (h === 0) return `${r} minute${r === 1 ? '' : 's'}`;
  if (r === 0) return `${h} hour${h === 1 ? '' : 's'}`;
  return `${h} h ${r} m`;
};

/**
 * Where this case stands against the hour, now.
 *
 * The label is written for a person glancing at a phone: how long they have,
 * or how long they are past it, and nothing else.
 */
export function hourRuleStanding(b: BookingClock, now: Date = new Date()): HourRuleStanding {
  const deadline = startByDeadline(b);
  const settled = isSettled(b);
  const booked = asDate(b.requestedAt);
  const stated = asDate(b.requiredByTime);
  const setByRequiredBy = Boolean(
    deadline && stated && booked && stated > booked
    && stated.getTime() === deadline.getTime(),
  );

  if (!deadline) {
    return {
      deadline: null, minutesRemaining: null, overdue: false, settled,
      setByRequiredBy: false,
      label: 'No booking time recorded, so the hour cannot be counted.',
    };
  }

  const minutesRemaining = Math.round((deadline.getTime() - now.getTime()) / 60_000);

  if (settled) {
    return {
      deadline, minutesRemaining, overdue: false, settled, setByRequiredBy,
      label: 'This case is no longer waiting to start.',
    };
  }

  return {
    deadline,
    minutesRemaining,
    overdue: minutesRemaining < 0,
    settled,
    setByRequiredBy,
    label: minutesRemaining < 0
      ? `${describeMinutes(minutesRemaining)} past the start-by time`
      : `${describeMinutes(minutesRemaining)} left to start`,
  };
}

/** The deadline as a time somebody reads off a phone, in WAT. */
export function deadlineClock(deadline: Date | null): string {
  if (!deadline) return 'unknown';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Lagos',
    }).format(deadline);
  } catch {
    return deadline.toISOString().slice(11, 16);
  }
}
