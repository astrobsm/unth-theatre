/**
 * Whether a pre-operative visit clears the patient for theatre.
 *
 * Lives here, on its own, because two callers must reach the same answer: the
 * nurse saving the visit, and the surgeon recording a consent afterwards. When
 * only the first could decide, a consent taken after the ward round left the
 * visit sitting at NOT_CLEARED, and the patient could not be called for a
 * morning list on the strength of a consent that existed and was signed.
 */

/** The stored fields a clearance decision is made from. */
export interface PreopVisitFacts {
  patientAvailableInWard?: boolean | null;
  consentStatus?: string | null;
  surgicalFeePaymentStatus?: string | null;
  preAnaestheticReviewDone?: boolean | null;
  npoStatus?: string | null;
  investigationsComplete?: boolean | null;
  patientEmotionalReadiness?: string | null;
}

export type PreopVisitStatus = 'CLEARED' | 'VISITED' | 'NOT_CLEARED';

/**
 * Consent is satisfied when ANY route has produced one.
 *
 * `surgeryHasConsent` is the surgeon's record on the case — an uploaded scan, an
 * in-app signature, or a completed consent form. It is deliberately allowed to
 * answer a nurse's NOT_OBTAINED, because NOT_OBTAINED means "there was no
 * consent in the folder when I looked", and a consent taken later answers that
 * exactly.
 *
 * REFUSED is NOT overridden, and that distinction is the whole point of
 * separating the two. A missing document is an administrative gap. A patient who
 * has refused has made a decision, and no record filed elsewhere may quietly
 * overturn it.
 */
export function consentBlocks(consentStatus: string | null | undefined, surgeryHasConsent: boolean): boolean {
  if (consentStatus === 'REFUSED') return true;
  if (consentStatus === 'NOT_OBTAINED') return !surgeryHasConsent;
  return false;
}

/**
 * The visit's overall status, from its facts plus any consent recorded on the
 * case itself.
 *
 * Mirrors the rules the visit endpoint has always applied; the only change is
 * that consent may now be answered from the case.
 */
export function clearanceFor(facts: PreopVisitFacts, surgeryHasConsent = false): PreopVisitStatus {
  const critical = [
    facts.patientAvailableInWard === false,
    consentBlocks(facts.consentStatus, surgeryHasConsent),
    facts.surgicalFeePaymentStatus === 'NOT_PAID',
    facts.preAnaestheticReviewDone === false,
    facts.npoStatus === 'NOT_FASTING',
    facts.investigationsComplete === false,
    facts.patientEmotionalReadiness === 'REFUSED',
  ];
  if (critical.some(Boolean)) return 'NOT_CLEARED';

  const concerning =
    facts.patientEmotionalReadiness === 'ANXIOUS'
    || facts.patientEmotionalReadiness === 'VERY_ANXIOUS'
    || facts.patientEmotionalReadiness === 'NEEDS_COUNSELLING'
    || facts.npoStatus === 'PARTIALLY_COMPLIANT';

  return concerning ? 'VISITED' : 'CLEARED';
}
