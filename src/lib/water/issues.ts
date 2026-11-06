// ============================================================
// A water fault stays open until somebody goes back and looks again
// ------------------------------------------------------------
// Asked for on 6 November, and it is the half of the request that the rest
// of the feature exists to serve:
//
//   "when the error is fixed, the user need to re assess and correct the
//    status."
//
// Until now a water report was a snapshot and nothing more. A plumber logged
// NO_WATER in the Eye Theatre at 06:30, the bell rang, somebody fixed the
// valve at nine — and the system went on holding one row that said NO_WATER,
// for ever, because nothing ever asked again. The next morning's report
// started from a clean form, so the fault did not close; it simply stopped
// being mentioned. Nobody could answer "is it fixed?" except by finding the
// plumber.
//
// So each room that is not OK opens an ISSUE, and the issue is the thing
// that persists. It closes on one event only: a later report that asked
// about the same room and found it OK. That is a re-assessment — somebody
// looked again and said so — and it is the only thing that should be able to
// close a fault.
//
// WHAT DOES NOT CLOSE AN ISSUE, deliberately:
//
//   Time. A leak is not fixed by a week passing.
//
//   Silence. A report that does not mention the room leaves the issue open.
//   This matters more than it sounds: the form is built from the theatre
//   table, so a room deleted or taken out of service would otherwise close
//   its own fault by disappearing.
//
//   A kinder status. LEAK becoming LOW_PRESSURE is progress worth recording
//   on the issue, but it is not a fix, and the chase goes on.
//
// EVERYTHING HERE IS PURE. The reconciliation decides whether a fault is
// treated as fixed, which is a decision somebody may have to defend in a
// meeting, so it is testable without a database and identical wherever it
// runs.
// ============================================================

import { areasNotOk, type WaterArea } from './waterAreas';

/** An open issue, as little of it as this file needs to decide anything. */
export interface WaterIssueLike {
  id: string;
  areaKey: string;
  areaName: string;
  location?: string | null;
  status: string;
  problem?: string | null;
  actionTaken?: string | null;
  contingencyPlan?: string | null;
  openedAt: Date | string;
  openedByName?: string | null;
}

export interface Reconciliation {
  /** Not OK now, and nothing open for it: a new fault. */
  toOpen: WaterArea[];
  /** Not OK now, already open: refresh what it says and leave it open. */
  toUpdate: { issue: WaterIssueLike; area: WaterArea }[];
  /** Open, and this report looked at it and found it OK: the fix is confirmed. */
  toClose: { issue: WaterIssueLike; area: WaterArea }[];
  /** Open, and this report did not ask about it at all. Left alone. */
  untouched: WaterIssueLike[];
}

/**
 * What this report does to the faults that were already open.
 *
 * `areas` must be EVERY room the report asked about, the OK ones included.
 * The OK ones are what closes a fault; passing only the bad ones would mean
 * nothing ever closed.
 */
export function reconcileIssues(
  open: readonly WaterIssueLike[],
  areas: readonly WaterArea[],
): Reconciliation {
  const byKey = new Map(areas.map((a) => [a.key, a]));
  const openByKey = new Map(open.map((i) => [i.areaKey, i]));

  const toOpen: WaterArea[] = [];
  const toUpdate: { issue: WaterIssueLike; area: WaterArea }[] = [];
  areasNotOk(areas).forEach((area) => {
    const existing = openByKey.get(area.key);
    if (existing) toUpdate.push({ issue: existing, area });
    else toOpen.push(area);
  });

  const toClose: { issue: WaterIssueLike; area: WaterArea }[] = [];
  const untouched: WaterIssueLike[] = [];
  open.forEach((issue) => {
    const area = byKey.get(issue.areaKey);
    if (area && area.status === 'OK') toClose.push({ issue, area });
    else if (!area) untouched.push(issue);
  });

  return { toOpen, toUpdate, toClose, untouched };
}

const HOUR_MS = 60 * 60 * 1000;

/** Milliseconds an issue has been open, or 0 if the date makes no sense. */
export function openForMs(openedAt: Date | string, now: Date = new Date()): number {
  const t = openedAt instanceof Date ? openedAt.getTime() : Date.parse(String(openedAt));
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, now.getTime() - t);
}

/**
 * How long it has been open, in words.
 *
 * Rounded coarsely and on purpose. "Open 2 days" is what makes somebody act;
 * "open 2 days 4 hours 11 minutes" is a number people stop reading.
 */
export function openForLabel(openedAt: Date | string, now: Date = new Date()): string {
  const ms = openForMs(openedAt, now);
  const hours = Math.floor(ms / HOUR_MS);
  if (hours < 1) {
    const mins = Math.max(1, Math.round(ms / 60000));
    return `${mins} minute${mins === 1 ? '' : 's'}`;
  }
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

/**
 * Open longer than this and the chase is repeated rather than left to the
 * first message.
 *
 * Four hours is a theatre list. A fault reported at the morning count that
 * is still open when the afternoon cases start has outlived the assurance
 * that was given about it, and the people who were told at 06:30 have by
 * now had three hundred other messages.
 */
export const RECHASE_AFTER_HOURS = 4;

export function needsRechase(
  issue: Pick<WaterIssueLike, 'openedAt'> & { lastChasedAt?: Date | string | null },
  now: Date = new Date(),
): boolean {
  const last = issue.lastChasedAt ?? issue.openedAt;
  return openForMs(last, now) >= RECHASE_AFTER_HOURS * HOUR_MS;
}

/**
 * The banner across the top of the water page.
 *
 * Null when there is nothing open, because a standing green banner saying
 * "all clear" is read once and then never again, and the day it says
 * something else nobody will notice.
 */
export function reassessmentNotice(
  open: readonly WaterIssueLike[],
  now: Date = new Date(),
): string | null {
  if (open.length === 0) return null;

  const oldest = [...open].sort(
    (a, b) => openForMs(b.openedAt, now) - openForMs(a.openedAt, now),
  )[0];
  const named = open.slice(0, 3).map((i) => i.areaName).join(', ');
  const rest = open.length - Math.min(3, open.length);

  return `${open.length} water fault${open.length === 1 ? '' : 's'} `
    + `${open.length === 1 ? 'is' : 'are'} still open — ${named}${rest > 0 ? ` +${rest} more` : ''}. `
    + `The oldest has been open ${openForLabel(oldest.openedAt, now)}. `
    + 'Go and look again, then log the status to close it. Nothing else closes it.';
}
