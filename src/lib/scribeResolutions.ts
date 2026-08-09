// ============================================================
// From "what is wrong" to "where you fix it"
// ------------------------------------------------------------
// The pre-op safety check was read-only: it told staff a case had no consent
// and then left them to work out which screen records one. Every gap it can
// name is a gap somebody has to close under time pressure, usually on a phone,
// usually while the list is already running — so each finding now carries a
// destination.
//
// Kept separate from medicalScribe.ts on purpose. That module is clinical
// rules and must stay free of anything about this application's page layout;
// this one is routing and knows nothing about medicine. The `code` on a
// finding is the only contract between them.
//
// A code with no entry here simply renders without a button. That is the right
// failure: an unroutable finding still tells the reader what is wrong, and a
// button leading somewhere useless is worse than no button.
// ============================================================

export interface Resolution {
  /** Button text. An imperative naming the artefact, not the screen. */
  label: string;
  /** Path under /dashboard/surgeries/{id}, or '' for the surgery page itself. */
  path: string;
  /** One line under the button: what the person will actually do there. */
  hint: string;
  /**
   * Who can normally do this. Shown so a scrub nurse does not walk to the ward
   * for something the house officer must do, and vice versa.
   */
  who: string;
}

/**
 * Every actionable finding the analyser can emit.
 *
 * Consent is the one that stops cases at the theatre door most often, and it
 * is also the only one with a purpose-built screen: that page takes either a
 * signature captured on the device or a photograph/scan of the signed paper
 * form, because both are real in this hospital and refusing one of them just
 * moves the problem off the system.
 *
 * The rest go to the pre-op clinical data form. They were originally pointed at
 * the booking edit page on the assumption it was the booking form reused. It is
 * not: it edits ward, schedule and theatre, and has no clinical fields at all,
 * so every lab finding led to a page where the value could not be entered.
 */
export const RESOLUTIONS: Record<string, Resolution> = {
  CONSENT_MISSING: {
    label: 'Record consent',
    path: '/consent',
    hint: 'Capture the signature on this device, or upload a photo of the signed paper form.',
    who: 'Surgeon or house officer',
  },
  HB_MISSING: {
    label: 'Enter haemoglobin',
    path: '/preop-data',
    hint: 'Record the Hb result and the time the sample was taken.',
    who: 'House officer',
  },
  HB_STALE: {
    label: 'Update haemoglobin',
    path: '/preop-data',
    hint: 'The sample must be within 48 hours of surgery. Record the repeat result.',
    who: 'House officer',
  },
  POTASSIUM_MISSING: {
    label: 'Enter potassium',
    path: '/preop-data',
    hint: 'Record the serum K+ from the U&E.',
    who: 'House officer',
  },
  SODIUM_MISSING: {
    label: 'Enter sodium',
    path: '/preop-data',
    hint: 'Record the serum Na+ from the U&E.',
    who: 'House officer',
  },
  CREATININE_MISSING: {
    label: 'Enter creatinine',
    path: '/preop-data',
    hint: 'Record the serum creatinine.',
    who: 'House officer',
  },
  BP_MISSING: {
    label: 'Enter blood pressure',
    path: '/preop-data',
    hint: 'Record the most recent systolic and diastolic reading.',
    who: 'Ward nurse or house officer',
  },
  VIROLOGY_MISSING: {
    label: 'Enter virology',
    path: '/preop-data',
    hint: 'Record the HBsAg, HCV and HIV status, or mark them as pending.',
    who: 'House officer',
  },
  BLEEDING_RISK_MISSING: {
    label: 'Assess bleeding risk',
    path: '/preop-data',
    hint: 'Complete the bleeding-risk assessment on the booking.',
    who: 'Surgeon or house officer',
  },
  NUTRITION_MISSING: {
    label: 'Assess nutrition',
    path: '/preop-data',
    hint: 'Complete the nutritional assessment on the booking.',
    who: 'Ward nurse or house officer',
  },
  PRESSURE_SORE_MISSING: {
    label: 'Assess pressure-sore risk',
    path: '/preop-data',
    hint: 'Complete the Braden/Waterlow assessment. Required over 45 years.',
    who: 'Ward nurse',
  },
};

export const resolutionFor = (code: string | undefined | null): Resolution | null =>
  (code && RESOLUTIONS[code]) || null;

/**
 * Build the link for a finding.
 *
 * `returnTo` is what makes this usable rather than merely correct: somebody
 * closing four gaps should come straight back to the list each time and watch
 * it shrink, not have to navigate back and re-run the check by hand.
 */
export function resolutionHref(
  code: string | undefined | null,
  surgeryId: string,
  returnTo?: string
): string | null {
  const r = resolutionFor(code);
  if (!r || !surgeryId) return null;
  const base = `/dashboard/surgeries/${encodeURIComponent(surgeryId)}${r.path}`;

  const params: string[] = [];
  // The destination form focuses the field this finding is about, so somebody
  // holding one result types one number instead of hunting a long form.
  if (code) params.push(`code=${encodeURIComponent(code)}`);
  // Only ever an in-app path. An absolute or protocol-relative value here
  // would turn every finding into an open redirect.
  if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
    params.push(`returnTo=${encodeURIComponent(returnTo)}`);
  }
  return params.length ? `${base}?${params.join('&')}` : base;
}

/**
 * Read a returnTo back out of a query string, refusing anything that is not a
 * plain in-app path. Called by the pages staff are sent to.
 */
export function safeReturnTo(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}

/** Findings that must be closed before a case may proceed. */
export const isBlocking = (severity: string): boolean => severity === 'CRITICAL';
