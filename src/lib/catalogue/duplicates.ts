// ============================================================
// The same item, entered more than once
// ------------------------------------------------------------
// WHY THIS EXISTS. Matching the catalogue to the NHIA Medicines Price List
// did not only say what the scheme covers; it showed how often one thing is
// in the catalogue under several names. Three rows reading "10% Dextrose/
// water (1l)", "10% Dextrous water (1000mls)" and "Dextrose 10% (1 L)" are
// one fluid, and a surgeon choosing between them at booking is choosing
// between spellings. Now that each carries the same NHIA code, they can be
// seen together for the first time.
//
// NOTHING IS DELETED AND NOTHING IS AUTOMATIC. A template id is written onto
// every pack line raised from it, so deleting one would orphan rows on cases
// already booked. Retiring sets isActive = false and records which row
// superseded it, which keeps the history readable and is reversible. And the
// choice of WHICH to keep is an administrator's, because the three names
// above are not equally good and this file has no way to know which one the
// store calls it.
//
// THE RULE THAT STOPS THIS DOING HARM. Two rows are only ever candidates when
// they share an NHIA code AND a size AND a unit. The Authority's codes are
// coarse -- NHIA-28-02-16 is "Surgical Gloves, all sizes" and covers every
// glove in the building -- so grouping on the code alone would propose
// merging size 7 with size 8. Those are not duplicates; they are what a
// theatre asks for by size, and merging them would put the wrong glove on a
// trolley.
// ============================================================

export type DuplicateConfidence = 'IDENTICAL' | 'SAME_THING' | 'DOUBTFUL';

export interface CatalogueRow {
  id: string;
  name: string;
  /** size for a consumable, dose for a pharmacy line. */
  size: string | null;
  unit: string;
  defaultQuantity: number;
  isActive: boolean;
  nhiaCode: string | null;
  /** How many pack lines have ever been raised from this row. */
  usage: number;
  createdAt?: string | Date | null;
}

export interface DuplicateGroup {
  /** Stable across runs: the code and the size the group shares. */
  key: string;
  nhiaCode: string;
  size: string;
  unit: string;
  rows: CatalogueRow[];
  confidence: DuplicateConfidence;
  /** The row this suggests keeping, and why in words an admin can weigh. */
  suggestedKeepId: string;
  why: string;
}

/** Lowercase, strip punctuation, collapse spaces. Comparison only. */
export function compareKey(s: string | null | undefined): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9%.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Which row to keep, suggested.
 *
 * USE DECIDES IT, FIRST AND ALMOST ALWAYS. The row the theatre has actually
 * been ordering is the row the theatre knows, whatever anybody thinks of its
 * spelling, and keeping it means the fewest pack lines point at something
 * retired.
 *
 * Only where nothing has ever been ordered does the name matter, and then
 * the LONGEST one wins: "Dextrose 10% (1 L)" tells a storekeeper more than
 * "D/W", and a catalogue is read by people in a hurry.
 */
export function suggestKeeper(rows: CatalogueRow[]): { id: string; why: string } {
  const used = [...rows].sort((a, b) => b.usage - a.usage);
  if (used[0] && used[0].usage > 0) {
    const second = used[1]?.usage ?? 0;
    if (used[0].usage > second) {
      return {
        id: used[0].id,
        why: `Used on ${used[0].usage} pack line${used[0].usage === 1 ? '' : 's'}`
          + `${second > 0 ? `, against ${second} for the next` : ' and the others on none'}.`,
      };
    }
  }
  const byName = [...rows].sort(
    (a, b) => b.name.trim().length - a.name.trim().length || a.name.localeCompare(b.name),
  );
  return {
    id: byName[0].id,
    why: rows.every((r) => r.usage === 0)
      ? 'None of these has ever been ordered, so the fullest name is suggested.'
      : 'They have been ordered equally often, so the fullest name is suggested.',
  };
}

/**
 * How sure are we that these are one item?
 *
 * IDENTICAL   the names agree once punctuation is set aside. Nothing is lost
 *             by keeping one.
 * SAME_THING  the names differ but the Authority gives them one code, one
 *             size and one unit — "Dextrous water" and "Dextrose water".
 * DOUBTFUL    the default quantities disagree, which usually means somebody
 *             meant two different pack sizes by them. Worth a person.
 */
export function confidenceOf(rows: CatalogueRow[]): DuplicateConfidence {
  const names = new Set(rows.map((r) => compareKey(r.name)));
  const quantities = new Set(rows.map((r) => r.defaultQuantity));
  if (quantities.size > 1) return 'DOUBTFUL';
  if (names.size === 1) return 'IDENTICAL';
  return 'SAME_THING';
}

/**
 * Group the catalogue into the sets that look like one item.
 *
 * Only ACTIVE rows, only rows carrying an NHIA code, and only where the code,
 * the size and the unit all agree. Rows an administrator has already looked
 * at and kept apart are excluded by the caller, not here, so this stays pure.
 */
export function groupDuplicates(rows: CatalogueRow[]): DuplicateGroup[] {
  const buckets = new Map<string, CatalogueRow[]>();

  for (const row of rows) {
    if (!row.isActive || !row.nhiaCode) continue;
    // Size and unit are part of the key, not of the comparison. Size 7 and
    // size 8 gloves share a code and are not the same glove.
    const key = [row.nhiaCode, compareKey(row.size), compareKey(row.unit)].join('|');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(row);
  }

  const groups: DuplicateGroup[] = [];
  for (const [key, members] of Array.from(buckets.entries())) {
    if (members.length < 2) continue;
    const confidence = confidenceOf(members);
    const { id, why } = suggestKeeper(members);
    groups.push({
      key,
      nhiaCode: members[0].nhiaCode!,
      size: members[0].size ?? '',
      unit: members[0].unit,
      rows: [...members].sort((a, b) => b.usage - a.usage || a.name.localeCompare(b.name)),
      confidence,
      suggestedKeepId: id,
      why,
    });
  }

  // The ones a person should look at first: most rows, then most used.
  const order: Record<DuplicateConfidence, number> = { DOUBTFUL: 0, SAME_THING: 1, IDENTICAL: 2 };
  return groups.sort(
    (a, b) => order[a.confidence] - order[b.confidence]
      || b.rows.length - a.rows.length
      || b.rows.reduce((n, r) => n + r.usage, 0) - a.rows.reduce((n, r) => n + r.usage, 0),
  );
}

/** How many rows would stop being offered if every suggestion were taken. */
export function retireCount(groups: DuplicateGroup[]): number {
  return groups.reduce((n, g) => n + g.rows.length - 1, 0);
}
