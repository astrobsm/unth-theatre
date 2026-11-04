// ============================================================
// Which day's prescriptions the approvals screen is looking at
// ------------------------------------------------------------
// Asked for on 4 November: the approvals page should show the cases booked
// for the NEXT DAY awaiting approval, grouped by subspecialty, with a date
// picker for looking at what has happened before.
//
// WHY TOMORROW IS THE RIGHT DEFAULT. Pharmacy packs the following day's list.
// A prescription approved on the morning of surgery is approved after the
// packs have been drawn, so the only day on which approving changes anything
// is the day before. The screen opening on a flat list of everything pending
// made the one day that matters the hardest to find.
//
// AND NOTHING IS EVER HIDDEN BY IT. A prescription still unapproved for a
// case that has already gone is the most serious row on this screen, and
// filtering to tomorrow would take it off the page entirely. So the split
// keeps what it set aside and counts it, and the screen says so above the
// list. A filter that silently drops work is worse than no filter: the page
// looks finished.
//
// THE THEATRE'S DAY, NOT THE BROWSER'S. The hospital is WAT (UTC+1, no DST)
// and the same arithmetic as the server's watToday() is used here, so a
// screen open on a laptop set to another timezone still agrees with the API
// about which day is tomorrow.
// ============================================================

/** WAT is UTC+1 all year. */
const WAT_OFFSET_MS = 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** A YYYY-MM-DD day, counted in WAT. 0 is today, 1 tomorrow, -1 yesterday. */
export function watDay(offsetDays = 0, now: number = Date.now()): string {
  return new Date(now + WAT_OFFSET_MS + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

/** The day a stored timestamp falls on, as the rest of the app reads it. */
export function dayOf(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/** The day before or after one, staying on YYYY-MM-DD. */
export function shiftDay(day: string, byDays: number): string {
  const t = Date.parse(`${day}T12:00:00.000Z`);
  if (Number.isNaN(t)) return day;
  return new Date(t + byDays * DAY_MS).toISOString().slice(0, 10);
}

/**
 * How the chosen day is named above the list.
 *
 * "Tomorrow" and "Today" are said in words, because that is what somebody is
 * actually looking for, and the date is kept beside them so a screen left
 * open overnight cannot quietly lie about which day it is showing.
 */
export function dayHeading(day: string | null, today: string = watDay()): string {
  if (!day) return 'Every date';
  const t = Date.parse(`${day}T12:00:00.000Z`);
  if (Number.isNaN(t)) return day;
  const d = new Date(t);
  const written = `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  if (day === today) return `Today — ${written}`;
  if (day === shiftDay(today, 1)) return `Tomorrow — ${written}`;
  if (day === shiftDay(today, -1)) return `Yesterday — ${written}`;
  return written;
}

export interface ApprovalDaySplit<T> {
  /** What the list shows: everything scheduled for the chosen day. */
  onDay: T[];
  /** Still awaiting approval, but on some other day. Counted, never dropped. */
  pendingElsewhere: T[];
  /**
   * Still awaiting approval for a case whose day has already passed.
   *
   * A subset of pendingElsewhere while a future day is chosen, and the row
   * that most needs somebody's attention: the packs were drawn without it.
   */
  overdue: T[];
}

/**
 * Split a list of prescriptions into the chosen day and what that leaves out.
 *
 * `day` of null means every date, and then nothing is set aside.
 */
export function splitByApprovalDay<T>(
  rows: readonly T[],
  day: string | null,
  opts: {
    dayOfRow: (row: T) => string;
    isPending: (row: T) => boolean;
    /** Today in WAT. Passed in so the split is testable on a fixed clock. */
    today?: string;
  },
): ApprovalDaySplit<T> {
  const today = opts.today ?? watDay();
  const onDay: T[] = [];
  const pendingElsewhere: T[] = [];
  const overdue: T[] = [];

  rows.forEach((row) => {
    const rowDay = opts.dayOfRow(row);
    const pending = opts.isPending(row);

    if (day === null || rowDay === day) onDay.push(row);
    else if (pending) pendingElsewhere.push(row);

    // Counted whether or not it is on the chosen day: a case that has already
    // gone with its prescription unapproved is worth saying out loud even
    // when the reader is looking straight at it.
    if (pending && rowDay && rowDay < today) overdue.push(row);
  });

  return { onDay, pendingElsewhere, overdue };
}
