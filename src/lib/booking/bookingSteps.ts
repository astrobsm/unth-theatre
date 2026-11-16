// ============================================================
// The booking wizard's steps, in one place
// ------------------------------------------------------------
// WHAT WAS ACTUALLY WRONG, because it is not what it looked like.
//
// The step list existed in FOUR copies: three literal arrays inside
// src/app/dashboard/surgeries/new/page.tsx (saving at two points, and the
// "Continue where I stopped" lookup) and a fourth in
// src/app/api/surgeries/draft/route.ts, in a DIFFERENT ORDER and with an extra
// entry. It was reported to the user as "a resume can land on the wrong step".
//
// It could not. The page used the same array for index -> name on save and
// name -> index on resume, so the round trip was self-consistent, and the
// route's copy is only ever used for an `includes` check, where order does not
// matter. Every name the page could save was in the route's list, so nothing
// was ever rejected either. The bug, as described, was not real, and saying so
// is cheaper than leaving the wrong account of it in the repository.
//
// WHAT WAS REAL, and is what this file fixes:
//
//   1. FOUR copies of one ordering. None of them cross-checked. The next
//      person to insert a step between "surgery" and "team" has four places to
//      remember and three chances to be wrong -- and a wrong one here does not
//      throw, it quietly resumes somebody on a different page of their own
//      half-finished booking.
//
//   2. The route accepted a step the page cannot render. `'review'` was in the
//      route's list and in no page array, so a draft saved with it -- which
//      nothing does today, but the route permitted -- would resume at
//      indexOf('review') === -1, falling to step 0. The user's data would be
//      restored and they would be put back at the beginning of a six-step form
//      with no indication why. That IS "resume at the wrong step"; it was
//      simply unreachable rather than absent.
//
// So: one ordering, exported, used by the page and the route. There is no
// second list to disagree with the first, and `'review'` resolves to the last
// step rather than the first.
//
// THE ORDER BELOW IS LOAD-BEARING. It matches what the page already persisted,
// so every draft saved before this change resumes exactly where it did.
// Reordering it re-labels those drafts.
// ============================================================

export interface BookingStep {
  /** Stored in SurgeryDraft.step. Stable; not derived from position. */
  id: string;
  /** What the step rail shows. */
  label: string;
}

export const BOOKING_STEPS: readonly BookingStep[] = [
  { id: 'patient', label: 'Patient' },
  { id: 'surgery', label: 'Surgery' },
  { id: 'team', label: 'Team' },
  { id: 'consent', label: 'Consent & history' },
  { id: 'preop', label: 'Safety results' },
  { id: 'packs', label: 'Packs & sign-off' },
] as const;

export const BOOKING_STEP_IDS: readonly string[] = BOOKING_STEPS.map((s) => s.id);
export const BOOKING_STEP_LABELS: readonly string[] = BOOKING_STEPS.map((s) => s.label);
export const LAST_BOOKING_STEP = BOOKING_STEPS.length - 1;

/**
 * A step id the draft route used to accept and the form has never rendered.
 *
 * Kept acceptable rather than rejected, so a draft from any deploy still
 * loads — but resolved to the LAST step instead of falling through to the
 * first, which is what "review" plainly means.
 */
const LEGACY_REVIEW_ID = 'review';

/** The id to store for a given step index. */
export function bookingStepIdAt(index: number): string {
  return BOOKING_STEP_IDS[index] ?? BOOKING_STEP_IDS[0];
}

/**
 * The step index to resume at.
 *
 * Never throws and never returns -1: an unrecognised id resolves to the first
 * step, because a reviewer of a half-finished booking who is shown nothing is
 * worse off than one shown the beginning. `'review'` is the one historical id
 * worth resolving forward rather than back.
 */
export function bookingStepIndexOf(id: string | null | undefined): number {
  if (!id) return 0;
  if (id === LEGACY_REVIEW_ID) return LAST_BOOKING_STEP;
  const at = BOOKING_STEP_IDS.indexOf(id);
  return at >= 0 ? at : 0;
}

/** Is this an id the draft route may store? */
export function isBookingStepId(value: unknown): value is string {
  return typeof value === 'string'
    && (BOOKING_STEP_IDS.includes(value) || value === LEGACY_REVIEW_ID);
}
