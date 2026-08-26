import { describe, it, expect } from 'vitest';

import { clearanceFor, consentBlocks } from '../../src/lib/preopVisitClearance';

// Everything else present and satisfactory, so each test isolates one flag.
const clean = {
  patientAvailableInWard: true,
  consentStatus: 'OBTAINED',
  surgicalFeePaymentStatus: 'PAID',
  preAnaestheticReviewDone: true,
  npoStatus: 'NPO_COMPLIANT',
  investigationsComplete: true,
  patientEmotionalReadiness: 'READY',
};

describe('consent as a blocker', () => {
  it('blocks when the nurse found none and none exists on the case', () => {
    expect(consentBlocks('NOT_OBTAINED', false)).toBe(true);
  });

  it('stops blocking once a consent is recorded on the case', () => {
    // The point of the change: NOT_OBTAINED means "none in the folder when I
    // looked", and a consent taken afterwards answers exactly that.
    expect(consentBlocks('NOT_OBTAINED', true)).toBe(false);
  });

  it('NEVER lets a recorded consent override a refusal', () => {
    // A missing document is an administrative gap. A patient who has refused
    // has made a decision, and no record filed elsewhere may overturn it.
    expect(consentBlocks('REFUSED', true)).toBe(true);
  });
});

describe('clearing the patient for theatre', () => {
  it('clears when nothing is outstanding', () => {
    expect(clearanceFor(clean)).toBe('CLEARED');
  });

  it('a consent taken after the visit clears the patient', () => {
    const held = { ...clean, consentStatus: 'NOT_OBTAINED' };
    expect(clearanceFor(held, false)).toBe('NOT_CLEARED');
    expect(clearanceFor(held, true)).toBe('CLEARED');
  });

  it('does not clear the OTHER reasons a patient was held back', () => {
    // Recording a consent clears consent. It must not sweep an unpaid fee, an
    // unfasted patient or a missing anaesthetic review through with it.
    const unpaid = { ...clean, consentStatus: 'NOT_OBTAINED', surgicalFeePaymentStatus: 'NOT_PAID' };
    expect(clearanceFor(unpaid, true)).toBe('NOT_CLEARED');

    const notFasted = { ...clean, consentStatus: 'NOT_OBTAINED', npoStatus: 'NOT_FASTING' };
    expect(clearanceFor(notFasted, true)).toBe('NOT_CLEARED');

    const noReview = { ...clean, consentStatus: 'NOT_OBTAINED', preAnaestheticReviewDone: false };
    expect(clearanceFor(noReview, true)).toBe('NOT_CLEARED');
  });

  it('a refusal keeps the patient back however the consent was recorded', () => {
    expect(clearanceFor({ ...clean, consentStatus: 'REFUSED' }, true)).toBe('NOT_CLEARED');
  });

  it('records a visit with concerns as VISITED rather than cleared', () => {
    expect(clearanceFor({ ...clean, patientEmotionalReadiness: 'VERY_ANXIOUS' })).toBe('VISITED');
    expect(clearanceFor({ ...clean, npoStatus: 'PARTIALLY_COMPLIANT' })).toBe('VISITED');
  });
});
