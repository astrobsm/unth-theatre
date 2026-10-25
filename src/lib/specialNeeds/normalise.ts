// ============================================================
// Keeping one real-world thing to one catalogue row
// ------------------------------------------------------------
// The OTHER path lets anybody add an item mid-booking, which is the only
// way a catalogue stays useful — and the fastest way to ruin one. "Prolene
// 3/0", "prolene 3-0" and "PROLENE  3/0 " are one suture to a surgeon,
// three lines to the store keeper, and three things to bill for.
//
// So every incoming name is reduced to a comparison form before the
// database is asked whether it already has one. The STORED name keeps the
// capitalisation the person typed, because they know how it reads on the
// shelf better than this file does; only the matching is normalised.
// ============================================================

/**
 * The form two spellings of the same item must share.
 *
 * Case is folded, runs of whitespace collapse, and the several ways a
 * suture gauge gets written are reduced to one. Punctuation that carries no
 * meaning is dropped; the slash in 3/0 is kept, because it is the gauge.
 */
export function comparisonForm(raw: string): string {
  return (
    raw
      .normalize('NFKC')
      .toLowerCase()
      .trim()
      // 3-0 and 3.0 are both written for 3/0 on a suture packet.
      .replace(/\b(\d)\s*[-.]\s*0\b/g, '$1/0')
      // "3 / 0" typed with spaces around the slash.
      .replace(/\s*\/\s*/g, '/')
      // Trailing unit noise that does not distinguish anything.
      .replace(/[.,;:]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Sizes get the same treatment, plus the French and gauge suffixes. */
export function comparisonSize(raw: string | null | undefined): string {
  if (!raw) return '';
  return comparisonForm(raw)
    .replace(/\s*fr(ench)?\b/g, 'fr')
    .replace(/\s*g(auge)?\b/g, 'g')
    .replace(/\s*(inch|inches|in)\b/g, 'inch')
    .replace(/\s+/g, '');
}

export interface CatalogueCandidate {
  id: string;
  name: string;
  size?: string | null;
  brand?: string | null;
  category: string;
}

export interface IncomingItem {
  category: string;
  name: string;
  size?: string | null;
  brand?: string | null;
}

/**
 * Find the existing row this item already is, if any.
 *
 * Category must match exactly — a 16Fr chest tube and a 16Fr catheter are
 * not the same thing however similarly they are written.
 */
export function findDuplicate(
  incoming: IncomingItem,
  candidates: CatalogueCandidate[],
): CatalogueCandidate | null {
  const name = comparisonForm(incoming.name);
  const size = comparisonSize(incoming.size);
  const brand = comparisonForm(incoming.brand ?? '');

  return (
    candidates.find(
      (c) =>
        c.category === incoming.category &&
        comparisonForm(c.name) === name &&
        comparisonSize(c.size) === size &&
        comparisonForm(c.brand ?? '') === brand,
    ) ?? null
  );
}

/** Whether a typed name is substantial enough to become a catalogue row. */
export function isUsableName(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const cleaned = comparisonForm(raw);
  // Two characters rules out a stray keystroke; requiring a letter rules
  // out "3" and "--" becoming permanent catalogue entries.
  return cleaned.length >= 2 && /[a-z]/.test(cleaned);
}
