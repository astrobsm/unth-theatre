// ============================================================
// Which day's list the pharmacy is packing
// ------------------------------------------------------------
// Pharmacy packs AHEAD. The work done on Tuesday afternoon is for Wednesday's
// list: the drugs have to be made up, checked and on the trolley before the
// first case is sent for. A screen that opens on today shows a list that has
// already been packed, or is being operated on right now — work nobody can
// do anything about — and hides the only list that is still actionable.
//
// So the default is TOMORROW, and the day is a field, because the real
// working pattern is not uniform: a Friday afternoon is spent on Monday, a
// late addition is packed the same morning, and somebody checking what went
// out yesterday needs to look backwards.
//
// THE DATE MEANS THE DAY OF THE OPERATION, not the day the prescription was
// written. The API has always filtered on scheduledSurgeryDate; the screen
// called it the "pharmacy request date", which reads as the day the request
// came in. A pharmacist who believes that is looking at a different set of
// cases from the one actually on screen, and will not notice, because both
// are plausible lists of real patients.
//
// WAT throughout, never the device clock. A laptop on the wrong timezone must
// not change which list a pharmacist is handed. See lib/watDay.
// ============================================================

import { watDay, watToday } from '@/lib/watDay';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Tomorrow in WAT — the list the pharmacy is actually working on. */
export function watTomorrow(now: Date = new Date()): string {
  return watDay(now.getTime() + DAY_MS);
}

/** What the day field opens on. */
export const defaultPharmacyDay = (now: Date = new Date()): string => watTomorrow(now);

/** Shift a YYYY-MM-DD day by whole days, staying in WAT. */
export function shiftDay(day: string, byDays: number): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return watDay(new Date(Date.UTC(y, m - 1, d, 12, 0, 0) + byDays * DAY_MS));
}

export type DayRelation = 'TODAY' | 'TOMORROW' | 'YESTERDAY' | 'PAST' | 'FUTURE';

/** Where this day sits relative to now, in WAT. */
export function dayRelation(day: string, now: Date = new Date()): DayRelation {
  const today = watToday(now);
  if (day === today) return 'TODAY';
  if (day === watTomorrow(now)) return 'TOMORROW';
  if (day === shiftDay(today, -1)) return 'YESTERDAY';
  return day < today ? 'PAST' : 'FUTURE';
}

/**
 * How the heading names the day.
 *
 * "Tomorrow" alone is not enough — a pharmacist coming back to a screen left
 * open since yesterday would read it and pack the wrong list. The actual date
 * is always there; the relative word only helps locate it.
 */
export function describeDay(day: string, now: Date = new Date()): string {
  const rel = dayRelation(day, now);
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  const pretty = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
  if (rel === 'TODAY') return `today, ${pretty}`;
  if (rel === 'TOMORROW') return `tomorrow, ${pretty}`;
  if (rel === 'YESTERDAY') return `yesterday, ${pretty}`;
  return pretty;
}

/**
 * A warning when the chosen day is not one that can still be packed for.
 *
 * Returned rather than thrown, and null when there is nothing to say: a
 * pharmacist deliberately reviewing last week should not be nagged, but one
 * who has drifted onto a past day without noticing should be told, because
 * the list will look entirely normal.
 */
export function dayCaution(day: string, now: Date = new Date()): string | null {
  const rel = dayRelation(day, now);
  if (rel === 'PAST' || rel === 'YESTERDAY') {
    return 'This day has passed. Anything here has already been operated on or cancelled '
      + '— it is a record, not work to do.';
  }
  if (rel === 'TODAY') {
    return 'This is today\'s list. Most of it should already be packed; pharmacy normally '
      + 'works a day ahead.';
  }
  return null;
}
