/**
 * Giving a review round more time.
 *
 * The round API has always accepted a new closing date, and refuses to reopen
 * a lapsed round without one — correctly, because every personal link expires
 * with the round, so reopening on the old deadline hands every member an
 * EXPIRED page and makes the app look broken.
 *
 * The screen never sent one. Its Reopen button posted `{ action: 'reopen' }`
 * and nothing else, which the API answers with "Set a new closing date to
 * reopen — the old one has passed." So the one button offered for the job hit
 * a guard it could not satisfy, and the only remaining way to extend a review
 * was a database edit. This module is the arithmetic that fixes that.
 *
 * It is pure, and it is tested, because the whole thing turns on composing a
 * local wall-clock time correctly. The committee is in WAT, `datetime-local`
 * inputs are wall-clock with no zone, and `toISOString()` is UTC — mix those
 * up and a deadline set for 23:59 lands at 00:59 the next day, or an hour
 * early, which on a closing deadline is somebody's response lost.
 */

/** The offers on the button, in hours. */
export const EXTENSION_PRESETS = [24, 48, 168] as const;

export type ExtensionPreset = (typeof EXTENSION_PRESETS)[number];

export function presetLabel(hours: number): string {
  if (hours === 168) return '7 days';
  if (hours % 24 === 0) return `${hours / 24} days`;
  return `${hours} hours`;
}

/**
 * The default offer.
 *
 * Forty-eight hours: long enough to cross a weekend or catch somebody on
 * leave, short enough that the round does not quietly become permanent. It is
 * also what gets asked for, every time.
 */
export const DEFAULT_EXTENSION_HOURS: ExtensionPreset = 48;

const HOUR = 60 * 60 * 1000;

/** `now` plus `hours`, to the minute. Seconds are noise on a deadline. */
export function extendedTo(now: Date, hours: number): Date {
  const d = new Date(now.getTime() + hours * HOUR);
  d.setSeconds(0, 0);
  return d;
}

/**
 * From a lapsed round, extending runs from NOW, not from the old deadline.
 *
 * "Another 48 hours" asked on a Saturday about a round that shut on Thursday
 * means two days from Saturday. Counting from the old deadline would reopen
 * the round already half spent, and on a long-lapsed round would reopen it
 * into the past — which the API then refuses, leaving the owner pressing a
 * button that does nothing.
 */
export function extendFrom(closesAt: Date, now: Date, hours: number): Date {
  const base = closesAt.getTime() > now.getTime() ? closesAt : now;
  const d = new Date(base.getTime() + hours * HOUR);
  d.setSeconds(0, 0);
  return d;
}

export function deadlinePassed(closesAt: Date, now: Date): boolean {
  return closesAt.getTime() <= now.getTime();
}

/** Hours left, negative once it has gone. */
export function hoursLeft(closesAt: Date, now: Date): number {
  return (closesAt.getTime() - now.getTime()) / HOUR;
}

/**
 * Why this new closing time will not do.
 *
 * Returns the sentence to show, or null when it is fine. The API enforces the
 * same rule; this exists so the owner is told before they press the button
 * rather than by a red box afterwards.
 */
export function extensionProblem(input: {
  closesAt: Date | null;
  now: Date;
}): string | null {
  const { closesAt, now } = input;
  if (!closesAt || Number.isNaN(closesAt.getTime())) {
    return 'Pick the date and time the review should close.';
  }
  if (closesAt.getTime() <= now.getTime()) {
    return 'That time has already passed. Pick a time in the future, or close the round instead.';
  }
  // Two years. Not a clinical limit — a guard against a mistyped year turning
  // a two-day extension into one nobody notices has never ended.
  if (closesAt.getTime() - now.getTime() > 2 * 365 * 24 * HOUR) {
    return 'That is more than two years away. Check the date.';
  }
  return null;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * "21 Nov 2026, 23:59" — composed by hand from the LOCAL parts.
 *
 * Never toLocaleString: it prints one way on a laptop and another on the
 * theatre server, and a closing time that reads differently in two places is
 * the thing an argument about a late response turns on.
 */
export function deadlineText(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
}

/**
 * The value for an `<input type="datetime-local">`.
 *
 * LOCAL parts, not toISOString(). An ISO string is UTC, and feeding it to a
 * wall-clock input shifts the shown time by the offset — an hour early here,
 * every time, silently.
 */
export function toLocalInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    + `T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * The inverse. `new Date('2026-11-23T23:59')` is parsed as local time by
 * every current browser, which is what we want — but it is parsed as UTC when
 * the string carries a `Z` or an offset, so anything with one is rejected
 * rather than silently shifted.
 */
export function fromLocalInputValue(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** One line for the confirmation, and for the message to the committee. */
export function describeExtension(from: Date, to: Date, now: Date): string {
  const lapsed = deadlinePassed(from, now);
  const added = Math.round(hoursLeft(to, now));
  const span = added % 24 === 0 ? `${added / 24} days` : `${added} hours`;
  return lapsed
    ? `Reopening a round that closed ${deadlineText(from)}, for ${span} — until ${deadlineText(to)}.`
    : `Moving the deadline from ${deadlineText(from)} to ${deadlineText(to)}.`;
}

/**
 * What to send to PATCH /api/policy/rounds/[id].
 *
 * A CLOSED round needs the action; an OPEN one whose deadline has merely
 * lapsed needs only the date, and sending `reopen` for it would be refused
 * with "That round is already open". One function decides, so the screen
 * cannot get it the wrong way round.
 */
export function extensionPayload(input: {
  status: string;
  closesAt: Date;
}): { action?: 'reopen'; closesAt: string } {
  const closesAt = input.closesAt.toISOString();
  return input.status === 'CLOSED' ? { action: 'reopen', closesAt } : { closesAt };
}
