/**
 * Deciding whether an uploaded roster line is a duplicate.
 *
 * The bulk upload de-duplicated on PERSON + DATE + SHIFT alone. That is not
 * what a duplicate is: one anaesthetist genuinely covers two specialties on a
 * single morning, and the roster records that as two rows differing only in the
 * assignment. Uploading such a sheet silently dropped the second one, so the
 * second specialty had nobody against it and nothing said why.
 *
 * That is the same distinction that mattered when clearing duplicates from the
 * live roster: of the groups holding two assigned rows, HALF were one person
 * covering two things — "Neurosurgery + Urology" — and half were the same
 * assignment written twice. Only the second kind is a duplicate.
 *
 * A blank assignment is treated as the weakest claim there is. It adds nothing
 * beside a row that names an assignment, and a person holding both fills two
 * team slots with one name — which is exactly how the emergency board came to
 * show a team of two that was a team of one.
 */

export type UploadVerdict =
  /** Nothing like it on file: insert. */
  | { action: 'INSERT' }
  /** Already recorded, identically: skip and report. */
  | { action: 'SKIP'; reason: string }
  /**
   * A row exists for this person, date and shift with NO assignment, and this
   * line names one. The blank row is filled in rather than joined by a second
   * row — otherwise the upload recreates the shadowed-blank pair that has to be
   * cleaned up later.
   */
  | { action: 'UPDATE'; rosterId: string };

export interface ExistingRow {
  id: string;
  /** Trimmed; '' when the row carries no assignment. */
  subRole: string;
}

/** Assignments compare case- and space-insensitively; they are stored as typed. */
export const assignmentKey = (s: string | null | undefined): string =>
  (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * What to do with one uploaded line, given every row already on file for the
 * same person, date and shift.
 */
export function verdictForUploadedRow(
  incomingSubRole: string | null | undefined,
  existing: readonly ExistingRow[],
): UploadVerdict {
  const want = assignmentKey(incomingSubRole);

  if (want === '') {
    // A line with no assignment. Anything already on file covers it.
    return existing.length > 0
      ? { action: 'SKIP', reason: 'already rostered for this day and shift' }
      : { action: 'INSERT' };
  }

  if (existing.some((e) => assignmentKey(e.subRole) === want)) {
    return { action: 'SKIP', reason: 'already rostered for this assignment' };
  }

  const blank = existing.find((e) => assignmentKey(e.subRole) === '');
  if (blank) return { action: 'UPDATE', rosterId: blank.id };

  // A different assignment from the ones on file: real additional cover.
  return { action: 'INSERT' };
}

/**
 * The key identifying one line WITHIN a single uploaded sheet.
 *
 * Includes the assignment, so a sheet listing one person against two
 * specialties keeps both lines instead of losing the second to the first.
 */
export const batchKey = (userId: string, dateIso: string, shift: string, subRole: string | null | undefined): string =>
  `${userId}|${dateIso}|${shift}|${assignmentKey(subRole)}`;
