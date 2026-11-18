// ============================================================
// One number on the form, and either kind will do
// ------------------------------------------------------------
// Registration asked for a folder number and refused without one; the PT
// number sat beside it as an optional extra. That is not how a patient
// arrives. One comes up from the clinic holding a PT card and has no folder
// number yet. One comes down from the ward with a folder number and has never
// had a PT card. The form took the second and turned the first away.
//
// A patient who cannot be registered cannot be booked, so that case goes on
// paper and is typed in afterwards — or is not, which is how a theatre list
// and a theatre end up disagreeing about who is coming.
//
// So the form now asks for ONE number and either kind satisfies it. The merge
// is in the form, not in the database: the two still go to different columns,
// are printed differently, and are both asked about by the duplicate guard.
// What changed is that neither one is individually compulsory.
//
// WHY THE KIND IS GUESSED RATHER THAN ASKED. A PT number says what it is — it
// begins with PT. A folder number does not. That is one rule, right nearly
// every time, and the guess is shown beside the box with one tap to correct
// it, so when it is wrong it is wrong only until somebody glances at it.
//
// WHY EMPTY BECOMES NULL AND NOT "". Both columns are UNIQUE. Two patients
// registered with no PT number would both hold '' and the second would be
// refused by the database with a message about a duplicate key — for two
// people who have nothing in common. Postgres allows any number of NULLs in a
// unique index, which is exactly the "not recorded" this needs.
// ============================================================

import { sameIdentifier } from './identity';

export type PatientNumberKind = 'folder' | 'pt';

/** What each kind is called, on a label and in a sentence. */
export const NUMBER_KIND_LABEL: Record<PatientNumberKind, string> = {
  folder: 'Folder number',
  pt: 'PT number',
};

/**
 * "PT", then the number — in any of the ways it gets written.
 *
 * Requires a character after the prefix so that somebody halfway through
 * typing "PT" has not yet had the field decided for them.
 */
const PT_PREFIXED = /^PT[\s\-_.]*[A-Z0-9]/i;

/**
 * Which kind of number this is, judged from the number itself.
 *
 * Folder is the default for anything unrecognised, because it is the one the
 * hospital issues to everybody and the commoner of the two at the desk.
 */
export function guessNumberKind(typed: string | null | undefined): PatientNumberKind {
  return PT_PREFIXED.test((typed ?? '').trim()) ? 'pt' : 'folder';
}

export interface TypedPatientNumbers {
  /** What was typed in the one box the form requires. */
  typed: string | null | undefined;
  /** Which kind that box holds — guessed, and correctable by the person. */
  kind: PatientNumberKind;
  /** The other number, for the clerk who happens to have both. */
  other?: string | null;
}

export interface PatientNumbers {
  folderNumber: string | null;
  ptNumber: string | null;
}

/**
 * The one box (and the optional second) as the two columns underneath.
 *
 * Trimmed, because a trailing space from a barcode scanner is the difference
 * between finding this patient again and registering them twice. What is kept
 * is otherwise exactly what was typed: the hospital's own formatting is not
 * ours to rewrite — see normaliseIdentifier, which is for comparing only.
 */
export function splitPatientNumbers(input: TypedPatientNumbers): PatientNumbers {
  const first = (input.typed ?? '').trim();
  const second = (input.other ?? '').trim();
  return input.kind === 'pt'
    ? { folderNumber: second || null, ptNumber: first || null }
    : { folderNumber: first || null, ptNumber: second || null };
}

/**
 * Why this registration cannot go ahead, or null when it can.
 *
 * The only rule left is that there must be at least one number. Which one is
 * the hospital's business, not the form's.
 */
export function missingNumberProblem(n: Partial<PatientNumbers>): string | null {
  const folder = (n.folderNumber ?? '').trim();
  const pt = (n.ptNumber ?? '').trim();
  if (folder || pt) return null;
  return 'A folder number or a PT number is needed — either one on its own is enough.';
}

/**
 * The warning for one number entered as both.
 *
 * Not a refusal. It is said while both boxes are on screen, because the likely
 * cause is a second box filled in by habit, and the likely consequence is a
 * patient who looks like a duplicate of themselves to every identifier check
 * in the system.
 */
export function sameNumberTwice(n: Partial<PatientNumbers>): string | null {
  if (!sameIdentifier(n.folderNumber, n.ptNumber)) return null;
  return 'The folder number and the PT number are the same number. '
    + 'Leave the second one blank unless they really are two different numbers.';
}

/**
 * The one number to print where there is room for one.
 *
 * A call-up slip, a trolley sheet and a pre-operative visit record each carry
 * a copy of the patient's number. Now that a patient may have been registered
 * on a PT number alone, taking the folder number unconditionally would print
 * a blank on the slip that is carried to the ward to collect them.
 */
export function patientIdentifier(
  p: { folderNumber?: string | null; ptNumber?: string | null } | null | undefined,
): string {
  return (p?.folderNumber ?? '').trim() || (p?.ptNumber ?? '').trim() || '';
}
