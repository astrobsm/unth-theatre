// ============================================================
// Who pays for a case
// ------------------------------------------------------------
// Asked once, at booking, and never guessed. It is not a billing field: it
// decides which counter the drug and consumable lists are SENT to, so a wrong
// value is a trolley that never arrives rather than an invoice to correct.
//
// WHY NHIS IS STILL HERE. The scheme was absorbed into the Authority, but
// records written before that say NHIS, people still say NHIS, and a booking
// clerk who chooses it means something by it. Collapsing the two would quietly
// rewrite what they chose. Coverage follows the NHIA flag unless an individual
// item says otherwise, which is the only part of the distinction this
// application acts on.
//
// WHY UNSPECIFIED IS NOT OFFERED. Every case booked before this field existed
// carries it, and routes exactly as it did before. It is a fact about history,
// not a choice: a required field with an escape hatch is not required.
// ============================================================

export type PayerCategory = 'NHIA' | 'NHIS' | 'CEmONC' | 'PRIVATE' | 'UNSPECIFIED';

/** The four a booking may choose from, in the order the form offers them. */
export const BOOKABLE_PAYER_CATEGORIES: PayerCategory[] = [
  'NHIA', 'NHIS', 'CEmONC', 'PRIVATE',
];

/** Every value the column may hold, history included. */
export const ALL_PAYER_CATEGORIES: PayerCategory[] = [
  ...BOOKABLE_PAYER_CATEGORIES, 'UNSPECIFIED',
];

export const PAYER_LABEL: Record<PayerCategory, string> = {
  NHIA: 'NHIA',
  NHIS: 'NHIS (legacy)',
  CEmONC: 'CEmONC',
  PRIVATE: 'Private (self-paying)',
  UNSPECIFIED: 'Payer category not set',
};

/** Short enough for a badge on a crowded case card. */
export const PAYER_BADGE: Record<PayerCategory, string> = {
  NHIA: 'NHIA',
  NHIS: 'NHIS',
  CEmONC: 'CEmONC',
  PRIVATE: 'Private',
  UNSPECIFIED: 'Payer not set',
};

/** What each one means, for the form and the role guide. */
export const PAYER_DESCRIPTION: Record<PayerCategory, string> = {
  NHIA: 'National Health Insurance Authority enrolee. Corps members are covered here.',
  NHIS: 'Enrolled under the old NHIS. Kept separate so the record says what was chosen.',
  CEmONC: 'Comprehensive Emergency Obstetric and Newborn Care programme.',
  PRIVATE: 'The patient or their family pays. This is how every case worked before.',
  UNSPECIFIED: 'Booked before this question was asked. Please set it.',
};

/** The exact words the booking form refuses with. */
export const PAYER_REQUIRED_MESSAGE =
  "Select the patient's payer category (NHIA, NHIS, CEmONC or Private).";

/** Shown wherever a legacy case appears, so it gets fixed rather than ignored. */
export const PAYER_UNSET_PROMPT =
  'Payer category not set — choose one so the pack list reaches the right pharmacy.';

/**
 * Is a scheme paying for this case?
 *
 * The single question the routing turns on. PRIVATE and UNSPECIFIED both
 * answer no, for different reasons: one because the family pays, the other
 * because nobody has said — and a case nobody has said about must keep
 * behaving exactly as it did before anybody asked.
 */
export function isInsuredPayer(p: PayerCategory | null | undefined): boolean {
  return p === 'NHIA' || p === 'NHIS' || p === 'CEmONC';
}

/** True where the booking has actually been answered. */
export function payerIsSet(p: PayerCategory | null | undefined): boolean {
  return !!p && p !== 'UNSPECIFIED';
}

/**
 * The scheme a patient's cover is read against.
 *
 * NHIS follows NHIA, which is the one simplification this module makes, and
 * it is made here rather than at each call site so there is a single line to
 * change if the two ever diverge again.
 */
export function coverageSchemeFor(
  p: PayerCategory | null | undefined,
): 'NHIA' | 'CEmONC' | null {
  if (p === 'CEmONC') return 'CEmONC';
  if (p === 'NHIA' || p === 'NHIS') return 'NHIA';
  return null;
}

/** A value from a form or a URL, or null if it is not one of ours. */
export function parsePayerCategory(v: unknown): PayerCategory | null {
  const s = String(v ?? '').trim();
  return (ALL_PAYER_CATEGORIES as string[]).includes(s) ? (s as PayerCategory) : null;
}
