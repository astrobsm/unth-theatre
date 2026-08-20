// ============================================================
// Deciding whether two identifiers name the same patient
// ------------------------------------------------------------
// A folder number is the hospital's identifier for a human being, and it is
// typed by hand, on a phone, in a hurry. The same person's folder arrives as
// "914954", " 914954", "914 954" and occasionally "PT 914954". A unique index
// treats all four as different people.
//
// That is not a cosmetic problem. On 20 August a patient was registered on the
// theatre server and again on the cloud six minutes later — inside the sync
// interval, so neither node could see the other. Each minted its own UUID, both
// rows held identifiers the other needed, and NEITHER COULD EVER CROSS: the
// cloud's copy failed to insert locally 855 times and the local copy failed on
// the cloud 785 times. A neurosurgical case booked against one of them sat
// outside theatre for thirteen hours with 64 pack rows behind it.
//
// Measured afterwards: 3 folder numbers carry stray leading or trailing
// whitespace and 34 contain an inner space. Every one of those is that same
// trap, already set.
//
// NORMALISE FOR COMPARISON, PRESERVE FOR DISPLAY. What the clerk typed is what
// the record shows and what gets printed on a list — the hospital's own
// formatting is not ours to rewrite. Only the question "is this the same
// person's folder number" is asked of the normalised form.
// ============================================================

/**
 * The comparison form of a hospital identifier.
 *
 * Whitespace removed rather than collapsed: "914 954" and "914954" are the same
 * folder written two ways, and a clerk who adds a space has not created a new
 * patient. Upper-cased because "pt531015" and "PT531015" were, in production,
 * the same person on two nodes.
 *
 * Deliberately NOT stripping punctuation. A hyphen or slash may separate a real
 * subdivision in a folder number, and treating "12/345" as "12345" would merge
 * two people — which is far worse than failing to merge one.
 */
export function normaliseIdentifier(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\s+/g, '').toUpperCase();
}

/** Whether two identifiers name the same thing, once written the same way. */
export function sameIdentifier(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normaliseIdentifier(a);
  const nb = normaliseIdentifier(b);
  // Two blanks are not a match. A patient with no PT number does not share one
  // with every other patient who has no PT number — which is exactly what a
  // naive equality check would conclude.
  return na !== '' && na === nb;
}

export interface IdentifierWarning {
  field: 'folderNumber' | 'ptNumber';
  kind: 'untrimmed' | 'inner-space';
  message: string;
}

/**
 * Problems worth telling the person about at the moment they type them, while
 * it costs one keystroke to fix rather than a merge across two databases.
 */
export function checkIdentifier(
  field: 'folderNumber' | 'ptNumber',
  value: string | null | undefined,
): IdentifierWarning | null {
  if (!value) return null;
  const label = field === 'folderNumber' ? 'Folder number' : 'PT number';
  if (value !== value.trim()) {
    return { field, kind: 'untrimmed', message: `${label} has a space at the start or end.` };
  }
  if (/\s/.test(value.trim())) {
    return {
      field,
      kind: 'inner-space',
      message: `${label} contains a space. "${value.trim()}" and "${value.replace(/\s+/g, '')}" `
        + 'will be treated as two different patients unless it is always typed the same way.',
    };
  }
  return null;
}
