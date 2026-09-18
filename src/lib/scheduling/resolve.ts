// ============================================================
// Turning "you cannot book that" into "here is how to book it"
// ------------------------------------------------------------
// Every scheduling refusal in this application has been a dead end. The theatre
// is busy at 10:00, so the booking is rejected with a sentence — and the
// surgeon, who has a patient in front of them, now has to leave the form, find
// the theatre list, work out what is where, decide what to move, go and change
// that case, come back, and start again. Most of the time they simply pick a
// different hour and hope.
//
// The refusal was never the problem. The problem is that the application knows
// exactly what is in the way and what could be done about it, and says none of
// it.
//
// So this module answers the second question. Given a case somebody wants to
// book and the day it has to fit into, it returns the OPTIONS: the gaps it
// would fit in, the other theatres free at that hour, what would have to move
// to put it exactly where it was asked for, and what each of those would do to
// the rest of the list. Every option is a complete instruction the caller can
// carry out without asking anything else.
//
// IT DECIDES NOTHING. It ranks, and a person chooses. Moving somebody else's
// case is a decision with a patient on the other end of it, and the option that
// disturbs nobody is not automatically the right one — a cancer resection that
// has to start at eight in the morning outranks tidiness.
//
// It is pure, so the options can be tested against real lists rather than
// discovered in a theatre at half past seven.
// ============================================================

import {
  TURNOVER_MINUTES, END_OF_DAY_MINUTES, FIRST_CASE_HOUR,
  toMinutes, toClock, type ScheduledCase,
} from '../theatreOps/scheduling';

export interface CaseOnList extends ScheduledCase {
  id: string;
  /** Shown so somebody can tell whose case they are being asked to move. */
  patientName?: string | null;
  procedureName?: string | null;
  surgeonName?: string | null;
  theatreId?: string | null;
  status?: string | null;
  /**
   * This case cannot be moved to make room for another one.
   *
   * Not only a case on the table. A patient already in the holding area or
   * called for theatre has been starved since midnight and sent for, and
   * shifting their time as a side-effect of somebody else's booking is a
   * decision with a person on the end of it. The caller decides which statuses
   * mean this; the planner only honours it.
   */
  immovable?: boolean;
}

export interface Request {
  scheduledTime: string;
  estimatedDuration: number;
  theatreId?: string | null;
  theatreName?: string | null;
  /** Excluded from every calculation when an existing case is being moved. */
  ignoreId?: string | null;
}

export interface Gap {
  startMinutes: number;
  endMinutes: number;
  start: string;
  end: string;
  minutes: number;
}

export interface Move {
  id: string;
  from: string;
  to: string;
  patientName?: string | null;
  procedureName?: string | null;
}

export type OptionKind =
  | 'TAKE_SUGGESTED'   // move the new case to the first free slot
  | 'FILL_GAP'         // put it in a gap between two cases
  | 'INSERT_AND_PUSH'  // keep the requested time; everything after it moves back
  | 'OTHER_THEATRE'    // same time, a room that is free
  | 'SHORTEN'          // it fits if the estimate comes down
  | 'ANOTHER_DAY';     // nothing today can hold it

export interface Option {
  kind: OptionKind;
  /** One line, in the imperative: what pressing this does. */
  label: string;
  /** The consequence, where there is one worth stating before it happens. */
  detail?: string;
  /** The time the NEW case would take. */
  scheduledTime?: string;
  /** A different room, for OTHER_THEATRE. */
  theatreId?: string | null;
  theatreName?: string | null;
  /** A shorter estimate, for SHORTEN. */
  estimatedDuration?: number;
  /** Existing cases this option moves. Empty for everything but INSERT_AND_PUSH. */
  moves: Move[];
  /** Lower disturbs fewer people. Used for ordering, never for deciding. */
  disruption: number;
}

export type BlockerKind = 'OVERLAP' | 'PAST_CUTOFF' | 'INVALID_TIME' | 'INVALID_DURATION';

export interface Blocker {
  kind: BlockerKind;
  message: string;
  /** The cases actually in the way, so they can be shown rather than described. */
  clashesWith: CaseOnList[];
}

export interface Resolution {
  ok: boolean;
  blockers: Blocker[];
  options: Option[];
  /** Every case in the room that day, in order — the list the user asked to see. */
  dayList: Array<CaseOnList & { start: string; end: string }>;
  gaps: Gap[];
}

export interface OtherTheatre {
  theatreId: string;
  theatreName: string;
  cases: CaseOnList[];
}

const sortByStart = (a: { s: number }, b: { s: number }) => a.s - b.s;

/** Cases with a readable start and end, in order, skipping unparseable times. */
function timeline(cases: CaseOnList[], ignoreId?: string | null) {
  return cases
    .filter((c) => !ignoreId || c.id !== ignoreId)
    .map((c) => {
      const s = toMinutes(c.scheduledTime);
      const d = Number(c.estimatedDuration) || 60;
      return s === null ? null : { c, s, e: s + d };
    })
    .filter((x): x is { c: CaseOnList; s: number; e: number } => x !== null)
    .sort(sortByStart);
}

/**
 * Every window in the day a case of this length would fit into.
 *
 * Turnover is counted on BOTH sides of a gap, because a case dropped between
 * two others needs the theatre cleaned before it and after it. A gap that looks
 * like ninety minutes on the list is fifty minutes of operating.
 */
export function findGaps(
  cases: CaseOnList[],
  durationMinutes: number,
  opts: { turnoverMinutes?: number; firstCaseHour?: number; endOfDayMinutes?: number; ignoreId?: string | null } = {},
): Gap[] {
  const turnover = opts.turnoverMinutes ?? TURNOVER_MINUTES;
  const dayStart = (opts.firstCaseHour ?? FIRST_CASE_HOUR) * 60;
  const dayEnd = opts.endOfDayMinutes ?? END_OF_DAY_MINUTES;

  const rows = timeline(cases, opts.ignoreId);
  const gaps: Gap[] = [];

  let cursor = dayStart;
  for (const row of rows) {
    const available = row.s - turnover - cursor;
    if (available >= durationMinutes) {
      gaps.push(gap(cursor, row.s - turnover));
    }
    cursor = Math.max(cursor, row.e + turnover);
  }
  if (dayEnd - cursor >= durationMinutes) gaps.push(gap(cursor, dayEnd));

  return gaps;
}

function gap(startMinutes: number, endMinutes: number): Gap {
  return {
    startMinutes,
    endMinutes,
    start: toClock(startMinutes),
    end: toClock(endMinutes),
    minutes: endMinutes - startMinutes,
  };
}

/**
 * Put the new case exactly where it was asked for and move whatever is in the
 * way, in order, to after it.
 *
 * THE OPTION PEOPLE ACTUALLY WANT. A surgeon asking for 10:00 usually has a
 * reason — a clinic at noon, a child who has been starved since midnight, a
 * team that is only free then. Every other option asks them to give that up.
 *
 * Only cases that have not started are moved: a case already on the table
 * cannot be shifted, and one that has been sent for is very nearly as fixed.
 * Returns null when the day cannot absorb the shift, which is an honest answer
 * and better than a plan that ends at seven in the evening.
 */
export function insertAndPush(
  cases: CaseOnList[],
  request: Request,
  opts: { turnoverMinutes?: number; endOfDayMinutes?: number } = {},
): { moves: Move[]; blockedBy?: CaseOnList } | null {
  const turnover = opts.turnoverMinutes ?? TURNOVER_MINUTES;
  const dayEnd = opts.endOfDayMinutes ?? END_OF_DAY_MINUTES;

  const start = toMinutes(request.scheduledTime);
  if (start === null) return null;
  const end = start + request.estimatedDuration;
  if (end > dayEnd) return null;

  const rows = timeline(cases, request.ignoreId);
  const moves: Move[] = [];

  // Anything that would still be running when the new case starts, or that
  // starts before the new case finishes, has to move.
  let cursor = end + turnover;
  for (const row of rows) {
    const clashes = start < row.e + turnover && row.s < end + turnover;
    if (!clashes) {
      // A case entirely before the new one stays; one entirely after it may
      // still need pushing if an earlier move has run into it.
      if (row.s >= cursor || row.e + turnover <= start) {
        cursor = Math.max(cursor, row.e + turnover);
        continue;
      }
    }
    if (row.c.immovable) return { moves: [], blockedBy: row.c };

    const duration = row.e - row.s;
    if (cursor + duration > dayEnd) return null;
    if (toClock(cursor) !== row.c.scheduledTime) {
      moves.push({
        id: row.c.id,
        from: row.c.scheduledTime,
        to: toClock(cursor),
        patientName: row.c.patientName,
        procedureName: row.c.procedureName,
      });
    }
    cursor = cursor + duration + turnover;
  }

  return { moves };
}

/**
 * What can be done about a case that will not fit where it was asked to go.
 *
 * `otherTheatres` is optional: when the caller supplies the other rooms' lists,
 * moving the case rather than the list becomes one of the options, and it is
 * usually the least disruptive of them.
 */
export function resolveSchedule(
  request: Request,
  cases: CaseOnList[],
  opts: {
    turnoverMinutes?: number;
    firstCaseHour?: number;
    endOfDayMinutes?: number;
    otherTheatres?: OtherTheatre[];
    /** Shortening is offered down to this, and never below it. */
    minimumDuration?: number;
  } = {},
): Resolution {
  const turnover = opts.turnoverMinutes ?? TURNOVER_MINUTES;
  const dayEnd = opts.endOfDayMinutes ?? END_OF_DAY_MINUTES;
  const minimum = opts.minimumDuration ?? 30;

  const rows = timeline(cases, request.ignoreId);
  const dayList = rows.map((r) => ({ ...r.c, start: toClock(r.s), end: toClock(r.e) }));
  const gaps = findGaps(cases, request.estimatedDuration, { ...opts, ignoreId: request.ignoreId });

  const start = toMinutes(request.scheduledTime);
  const duration = Number(request.estimatedDuration);

  // ---- The ways the request is simply not a request -----------------------
  if (start === null) {
    return {
      ok: false,
      dayList, gaps,
      blockers: [{ kind: 'INVALID_TIME', message: 'Enter a start time as HH:MM.', clashesWith: [] }],
      options: gapOptions(gaps, request, 0),
    };
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    return {
      ok: false,
      dayList, gaps,
      blockers: [{ kind: 'INVALID_DURATION', message: 'Enter how long the case is expected to take, in minutes.', clashesWith: [] }],
      options: [],
    };
  }

  const end = start + duration;
  const clashes = rows.filter((r) => start < r.e + turnover && r.s < end + turnover).map((r) => r.c);
  const pastCutoff = end > dayEnd;

  if (!clashes.length && !pastCutoff) {
    return { ok: true, blockers: [], options: [], dayList, gaps };
  }

  // ---- The blockers, described by what is in the way ----------------------
  const blockers: Blocker[] = [];
  if (clashes.length) {
    const names = clashes
      .map((c) => `${c.scheduledTime} ${c.procedureName ?? 'case'}${c.patientName ? ` (${c.patientName})` : ''}`)
      .join(', ');
    blockers.push({
      kind: 'OVERLAP',
      message: clashes.length === 1
        ? `${request.theatreName ?? 'This theatre'} is in use: ${names}. ${turnover} minutes are also needed either side to clean the theatre and move the patient.`
        : `${request.theatreName ?? 'This theatre'} has ${clashes.length} cases across this time: ${names}.`,
      clashesWith: clashes,
    });
  }
  if (pastCutoff) {
    blockers.push({
      kind: 'PAST_CUTOFF',
      message: `Starting at ${toClock(start)}, this case would finish at ${toClock(end)} — past the ${toClock(dayEnd)} cutoff.`,
      clashesWith: [],
    });
  }

  // ---- The options -------------------------------------------------------
  const options: Option[] = [];

  // Keep the requested time, move what is in the way.
  if (!pastCutoff) {
    const pushed = insertAndPush(cases, request, { turnoverMinutes: turnover, endOfDayMinutes: dayEnd });
    if (pushed && !pushed.blockedBy) {
      options.push({
        kind: 'INSERT_AND_PUSH',
        label: `Keep ${request.scheduledTime} and move the other cases back`,
        detail: pushed.moves.length
          ? `${pushed.moves.length} case${pushed.moves.length === 1 ? '' : 's'} would move: `
            + pushed.moves.map((m) => `${m.procedureName ?? 'case'} ${m.from} to ${m.to}`).join('; ')
          : 'Nothing else needs to move.',
        scheduledTime: request.scheduledTime,
        moves: pushed.moves,
        disruption: pushed.moves.length * 10,
      });
    } else if (pushed?.blockedBy) {
      // Said out loud rather than silently omitted: "why is that not offered"
      // is the question somebody will otherwise ask the screen.
      blockers.push({
        kind: 'OVERLAP',
        message: `${pushed.blockedBy.procedureName ?? 'A case'} at ${pushed.blockedBy.scheduledTime}`
          + ` cannot be moved — it is ${String(pushed.blockedBy.status ?? 'under way').toLowerCase().replace(/_/g, ' ')}.`,
        clashesWith: [pushed.blockedBy],
      });
    }
  }

  // Take a free window instead.
  options.push(...gapOptions(gaps, request, 1));

  // A different room at the same hour.
  for (const other of opts.otherTheatres ?? []) {
    const free = resolveSchedule(
      { ...request, theatreId: other.theatreId, theatreName: other.theatreName },
      other.cases,
      { turnoverMinutes: turnover, endOfDayMinutes: dayEnd, firstCaseHour: opts.firstCaseHour },
    );
    if (free.ok) {
      options.push({
        kind: 'OTHER_THEATRE',
        label: `Use ${other.theatreName} at ${request.scheduledTime}`,
        detail: other.cases.length
          ? `${other.theatreName} has ${other.cases.length} case${other.cases.length === 1 ? '' : 's'} that day, none across this time.`
          : `${other.theatreName} has nothing booked that day.`,
        scheduledTime: request.scheduledTime,
        theatreId: other.theatreId,
        theatreName: other.theatreName,
        moves: [],
        disruption: 5,
      });
    }
  }

  // Trim the estimate to fit a window that is NEARLY big enough. Offered last,
  // never below the floor, and never by more than a fifth — because an estimate
  // shortened to make a booking work is how a list ends up running two hours
  // late, and a four-hour case offered a one-hour window has not been shortened,
  // it has been replaced by a different operation. Past that point the honest
  // answer is another day, and this says so.
  const shortestAcceptable = Math.max(minimum, Math.ceil(duration * 0.8));
  const nearlyFits = findGaps(cases, shortestAcceptable, { ...opts, ignoreId: request.ignoreId })
    .filter((g) => g.minutes < duration && g.minutes >= shortestAcceptable)
    .sort((a, b) => b.minutes - a.minutes)[0];
  if (nearlyFits) {
    options.push({
      kind: 'SHORTEN',
      label: `Book ${nearlyFits.start} with a ${nearlyFits.minutes}-minute estimate`,
      detail: `There is a ${nearlyFits.minutes}-minute window at ${nearlyFits.start}. Only do this if the case really is shorter than ${duration} minutes — a trimmed estimate puts the rest of the list behind.`,
      scheduledTime: nearlyFits.start,
      estimatedDuration: nearlyFits.minutes,
      moves: [],
      disruption: 40,
    });
  }

  if (!options.length) {
    options.push({
      kind: 'ANOTHER_DAY',
      label: 'Book this case on another day',
      detail: 'Nothing in this theatre can hold a case of this length today.',
      moves: [],
      disruption: 100,
    });
  }

  options.sort((a, b) => a.disruption - b.disruption);
  return { ok: false, blockers, options, dayList, gaps };
}

/** The free windows, as options, nearest the requested time first. */
function gapOptions(gaps: Gap[], request: Request, baseDisruption: number): Option[] {
  const wanted = toMinutes(request.scheduledTime);
  return gaps
    .map((g) => ({
      gap: g,
      distance: wanted === null ? g.startMinutes : Math.abs(g.startMinutes - wanted),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map(({ gap: g, distance }) => ({
      kind: 'FILL_GAP' as OptionKind,
      label: `Book at ${g.start} instead`,
      detail: g.minutes >= request.estimatedDuration * 2
        ? `${g.start} to ${g.end} is free — nothing else has to move.`
        : `A ${g.minutes}-minute window at ${g.start}. Nothing else has to move.`,
      scheduledTime: g.start,
      moves: [],
      // Nearer the requested time is less of an imposition on the surgeon, and
      // moving nobody else is less of one on everybody.
      disruption: baseDisruption + Math.round(distance / 30),
    }));
}
