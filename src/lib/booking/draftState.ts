// ============================================================
// What a booking draft actually holds
// ------------------------------------------------------------
// THE OLD DRAFT SAVED ALMOST NOTHING AND RESTORED NOTHING AT ALL.
//
// It snapshotted `new FormData(form)`, which is only the native inputs that
// carry a name attribute — so the patient, the magnitude, the anaesthesia
// type, the team, the assistant, the consultants, the special consumables
// and the photographed consent were all absent, because every one of those
// lives in React state. It saved only when moving FORWARD, so going back
// lost whatever had been typed. And "Continue where I stopped" set the step
// number and nothing else: the saved data was never read back into the
// form, so resuming landed on step 3 with every field empty.
//
// That is the frustration. This file is the shape of the fix: one list of
// what belongs in a draft, so saving and restoring cannot disagree about
// it, and adding a field to the form is one line here rather than two
// places to forget.
// ============================================================

/** Every piece of booking state worth surviving a refresh. */
export interface BookingDraft {
  // Who and what
  selectedPatientId?: string;
  procedureName?: string;
  extraProcedures?: unknown;
  unit?: string;
  subspecialty?: string;
  selectedTheatreId?: string;
  selectedSurgeonId?: string;
  supervisingConsultantIds?: string[];
  assistantIds?: string[];

  // When
  scheduledDate?: string;
  scheduledTime?: string;
  estimatedDuration?: string;

  // How
  magnitude?: string;
  anesthesiaType?: string;
  localAnaestheticId?: string;
  needBloodTransfusion?: boolean;
  otherSpecialNeeds?: string;
  postOpDestination?: string;
  isDayCase?: boolean;

  // The unit's team
  teamMembers?: unknown;
  noUnitRegistrar?: boolean;
  noUnitSeniorRegistrar?: boolean;

  // Consumables and drugs
  specialNeeds?: unknown;
  removedBundleIds?: string[];
  selectedConsumables?: unknown;
  selectedDrugs?: unknown;

  // Consent. THE EXPENSIVE ONE, AND THE ONE THAT HURTS MOST TO LOSE: it
  // takes a trip back to the patient to replace, where everything else is
  // retyping.
  consentFile?: { name: string; mimeType: string; base64: string; size: number } | null;
  consentForm?: unknown;

  preopOverrideReason?: string;

  /** Native inputs that carry a name but no React state. */
  fields?: Record<string, string>;
}

/**
 * Roughly how big this draft is on the wire.
 */
export function draftBytes(draft: BookingDraft): number {
  try {
    return JSON.stringify(draft).length;
  } catch {
    return 0;
  }
}

/**
 * Where the consent photograph is kept while a booking is unfinished.
 *
 * ON THE DEVICE, NOT IN THE SERVER DRAFT, and that is not a preference. The
 * draft endpoint caps a draft at 256 KB and runs everything through
 * auditChanges, which TRUNCATES any long string. A 700 KB base64 photograph
 * would therefore not be rejected — it would be silently cut to 200
 * characters and stored, and restoring it would attach a corrupt image that
 * looks present on the form and is unreadable as a consent. Absent is
 * honest; truncated is a lie with a clinical record attached.
 *
 * localStorage holds it instead. It survives a refresh, a crash and the tab
 * closing on the same device, which is every case that was losing work, and
 * it never crosses the link.
 */
export const CONSENT_DRAFT_KEY = 'orm.booking.consentPhoto';

/**
 * The draft that is safe to send to the server.
 *
 * Strips the consent photograph unconditionally — see above. Returning a
 * copy rather than mutating, because the caller is holding the live draft.
 */
export function forServer(draft: BookingDraft): BookingDraft {
  const { consentFile: _keptOnDevice, ...rest } = draft;
  return rest;
}

/** Kept as an alias so existing call sites read sensibly. */
export const lightenForAutosave = forServer;

/**
 * Merge a saved draft over the empty state.
 *
 * UNDEFINED MEANS "NOT SAVED", NOT "EMPTY". An older draft written before a
 * field existed must leave that field at its default rather than blanking
 * it — otherwise adding a field to the form silently wipes it for everybody
 * mid-booking.
 */
export function pick<T>(saved: T | undefined, current: T): T {
  return saved === undefined ? current : saved;
}

/** Is there anything in here worth offering to restore? */
export function isWorthResuming(draft: BookingDraft | null | undefined): boolean {
  if (!draft) return false;
  const meaningful =
    draft.selectedPatientId ||
    draft.procedureName ||
    draft.unit ||
    draft.scheduledDate ||
    draft.consentFile ||
    (Array.isArray(draft.specialNeeds) && draft.specialNeeds.length > 0) ||
    (draft.fields && Object.values(draft.fields).some((v) => v && v.trim() !== ''));
  return !!meaningful;
}
