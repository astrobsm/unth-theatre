// ============================================================
// The day's operating list, arranged the way an anaesthetist reads it
// ------------------------------------------------------------
// Asked for on 3 November: group the cases to be reviewed by subspecialty.
//
// An anaesthetist works a specialty, not a date. Finding your own four cases
// in one flat table of the whole hospital's day is work the screen should be
// doing, and it is how a case comes to be missed.
//
// THE FIELD CANNOT BE TRUSTED, so none of this trusts it. Bookings hold a real
// subspecialty on some rows ("Cardiothoracic Surgery") and a unit name on
// others ("Neuro Unit III", "GS Unit III", "O&G Firm 3") — the two vocabularies
// were never reconciled, and both are in the live table today. So the
// subspecialty is resolved from whichever of the two fields answers:
// canonicalSubspecialty already knows both and is tested.
//
// WHEN NEITHER RESOLVES, THE RAW TEXT BECOMES THE HEADING. Not "Other": a
// group called "CTU Unit II" still tells an anaesthetist whose cases those
// are, while "Other" tells them nothing and is where cases go to be
// overlooked. Nothing is ever dropped — a grouping that loses a case is worse
// than no grouping at all, because the list looks complete.
// ============================================================

import { canonicalSubspecialty } from '@/lib/subspecialtyMatch';

/** Only the two fields the grouping reads. */
export interface GroupableCase {
  subspecialty?: string | null;
  unit?: string | null;
}

export interface CaseGroup<T> {
  /** The heading: a canonical subspecialty, or the raw text that stood in. */
  name: string;
  cases: T[];
  /** How many still have no review. What the reader is looking for. */
  outstanding: number;
}

/**
 * Which heading a case belongs under.
 *
 * Never empty, so every case lands somewhere.
 */
export function subspecialtyGroupOf(c: GroupableCase): string {
  return canonicalSubspecialty(c.subspecialty)
    || canonicalSubspecialty(c.unit)
    || (c.subspecialty || '').trim()
    || (c.unit || '').trim()
    || 'Unassigned';
}

/**
 * Group an already-sorted list, keeping its order inside each group.
 *
 * The caller has sorted by theatre, unit, list order and time, and that is the
 * order a theatre runs in — grouping must not shuffle it.
 *
 * `isReviewed` is passed in rather than read off the case, because what counts
 * as reviewed lives in the page's map of existing reviews.
 */
export function groupCasesBySubspecialty<T extends GroupableCase>(
  cases: T[],
  isReviewed: (c: T) => boolean,
): CaseGroup<T>[] {
  const byGroup = new Map<string, T[]>();
  cases.forEach((c) => {
    const key = subspecialtyGroupOf(c);
    const list = byGroup.get(key);
    if (list) list.push(c); else byGroup.set(key, [c]);
  });

  return Array.from(byGroup.entries())
    .map(([name, group]) => ({
      name,
      cases: group,
      outstanding: group.filter((c) => !isReviewed(c)).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
