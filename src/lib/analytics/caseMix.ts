// ============================================================
// Case mix: how many of what size, and by whom
// ------------------------------------------------------------
// ORM already holds TWO answers to "how big was this operation", and they do
// not agree in coverage, in banding, or in when they are captured. A report
// that silently picked one would misstate the hospital's workload, so this
// file is mostly about being clear which answer each case is counted under.
//
//   complexityClass — the four bands the request asks for, Minor through
//   Supermajor, derived from an eight-criterion score. Captured at the END of
//   the post-operative note, so it exists only for cases somebody finished
//   writing up. Accurate, and sparse.
//
//   magnitude — MINOR, INTERMEDIATE, MAJOR. Captured at BOOKING to scale the
//   consumable pack, so nearly every case has one. Three bands, not four:
//   there is no Supermajor at booking, because nobody knows yet.
//
// SO EVERY CASE IS COUNTED, AND SAID TO BE COUNTED FROM ONE OR THE OTHER.
// The assessed class wins where it exists; the booking magnitude fills in
// behind it; a case with neither is reported as Unclassified rather than
// dropped.
//
// That last point is the one that matters. A theatre that assesses complexity
// on a third of its cases would otherwise appear, in its own audit report, to
// perform a third as many operations as it does — and the number would look
// perfectly plausible. Unclassified is shown on every breakdown, next to the
// rest, not in a footnote.
//
// AND THE TWO SOURCES ARE NEVER SILENTLY MIXED INTO ONE FIGURE WITHOUT
// SAYING SO. Every result carries the split, so a reader can see whether
// "142 Major" means 142 assessed or 20 assessed and 122 assumed from booking.
// ============================================================

/** The four bands, in the order a report should read them. */
export const BANDS = ['Minor', 'Intermediate', 'Major', 'Supermajor'] as const;
export type Band = (typeof BANDS)[number];

/** Shown alongside the bands, never hidden. */
export const UNCLASSIFIED = 'Unclassified' as const;
export type BandOrNone = Band | typeof UNCLASSIFIED;

/** Where a case's band came from. */
export type BandSource = 'assessed' | 'booking' | 'none';

export interface Classified {
  band: BandOrNone;
  source: BandSource;
}

/**
 * Normalise the booking magnitude onto the four-band scale.
 *
 * MAJOR at booking maps to Major, never to Supermajor. Supermajor is a
 * judgement about what the operation turned out to be — over four hours, over
 * a litre of blood, ICU expected — and none of that is known when the case is
 * booked. Promoting a booking MAJOR to Supermajor would invent the hospital's
 * most serious workload out of nothing.
 */
export function fromMagnitude(magnitude: string | null | undefined): Band | null {
  switch ((magnitude ?? '').trim().toUpperCase()) {
    case 'MINOR':        return 'Minor';
    case 'INTERMEDIATE': return 'Intermediate';
    case 'MAJOR':        return 'Major';
    default:             return null;
  }
}

/** Accepts the stored casing, which has varied. */
export function fromComplexityClass(cls: string | null | undefined): Band | null {
  const v = (cls ?? '').trim().toLowerCase();
  const found = BANDS.find((b) => b.toLowerCase() === v);
  return found ?? null;
}

/**
 * Which band does this case count under, and on what authority?
 *
 * The assessed class wins wherever it exists. It is measured rather than
 * predicted, and it is the only one that can say Supermajor.
 */
export function classifyCase(input: {
  complexityClass?: string | null;
  magnitude?: string | null;
}): Classified {
  const assessed = fromComplexityClass(input.complexityClass);
  if (assessed) return { band: assessed, source: 'assessed' };

  const booked = fromMagnitude(input.magnitude);
  if (booked) return { band: booked, source: 'booking' };

  return { band: UNCLASSIFIED, source: 'none' };
}

/** A row of counts, one per band plus the unclassified. */
export type BandCounts = Record<BandOrNone, number>;

export const emptyCounts = (): BandCounts => ({
  Minor: 0, Intermediate: 0, Major: 0, Supermajor: 0, Unclassified: 0,
});

export interface Grouped {
  key: string;
  counts: BandCounts;
  total: number;
}

export interface CaseMixInput {
  scheduledDate: Date | string;
  subspecialty?: string | null;
  unit?: string | null;
  complexityClass?: string | null;
  magnitude?: string | null;
}

export interface CaseMixResult {
  total: number;
  counts: BandCounts;
  /** How the totals were arrived at. Shown, never buried. */
  provenance: { assessed: number; booking: number; none: number };
  byMonth: Grouped[];
  bySubspecialty: Grouped[];
  byUnit: Grouped[];
}

/** YYYY-MM, which sorts correctly as a string and needs no locale. */
export function monthKey(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 7);
}

/** "Not recorded" rather than an empty row nobody can interpret. */
const label = (v: string | null | undefined): string => {
  const t = (v ?? '').trim();
  return t.length ? t : 'Not recorded';
};

function tally(
  rows: CaseMixInput[],
  keyOf: (r: CaseMixInput) => string,
  sortKeys: (a: string, b: string) => number,
): Grouped[] {
  const map = new Map<string, BandCounts>();
  for (const r of rows) {
    const k = keyOf(r);
    if (!map.has(k)) map.set(k, emptyCounts());
    map.get(k)![classifyCase(r).band] += 1;
  }
  return Array.from(map.entries())
    .map(([key, counts]) => ({
      key,
      counts,
      total: BANDS.reduce((s, b) => s + counts[b], 0) + counts[UNCLASSIFIED],
    }))
    .sort((a, b) => sortKeys(a.key, b.key));
}

/**
 * The whole report, from the rows in the chosen window.
 *
 * Pure: the caller does the query, this does the arithmetic. It is the
 * arithmetic that has to be right and that is worth proving without a
 * database.
 */
export function buildCaseMix(rows: CaseMixInput[]): CaseMixResult {
  const counts = emptyCounts();
  const provenance = { assessed: 0, booking: 0, none: 0 };

  for (const r of rows) {
    const c = classifyCase(r);
    counts[c.band] += 1;
    provenance[c.source === 'assessed' ? 'assessed' : c.source === 'booking' ? 'booking' : 'none'] += 1;
  }

  return {
    total: rows.length,
    counts,
    provenance,
    // Chronological, so a trend reads left to right.
    byMonth: tally(rows, (r) => monthKey(r.scheduledDate), (a, b) => a.localeCompare(b)),
    // Busiest first: a case-mix table is read to find the big contributors.
    bySubspecialty: sortByVolume(tally(rows, (r) => label(r.subspecialty), () => 0)),
    byUnit: sortByVolume(tally(rows, (r) => label(r.unit), () => 0)),
  };
}

function sortByVolume(rows: Grouped[]): Grouped[] {
  return rows.sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

/** "September 2026" from "2026-09". For a heading, not for sorting. */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return new Date(Date.UTC(y, m - 1, 1))
    .toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
