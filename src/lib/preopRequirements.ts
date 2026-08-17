// ============================================================
// What must be in place before a case can be booked
// ------------------------------------------------------------
// Consent and pre-operative labs are mandatory. The rule differs by urgency, and
// the difference is deliberate rather than a loophole:
//
//   ELECTIVE   hard block. There is time to get consent and a haemoglobin, and a
//              case booked without them is a case that reaches the table without
//              them.
//
//   EMERGENCY  the same requirements, but a named clinician may DEFER them with a
//              recorded reason. A hard block here would mean theatre never hears
//              about the case at all — and the safest place for an unconsented
//              emergency patient is a booked theatre with a team on the way. The
//              deferral is not a skip: it is stamped with a person and a reason,
//              and the case carries the outstanding item until it is resolved.
//
// Pure, so the rule is identical on the form and in the API, and so it can be
// argued about against tests rather than against a running server.
// ============================================================

export type SurgeryUrgency = 'ELECTIVE' | 'URGENT' | 'EMERGENCY';

/** Present-or-absent view of the labs. Values are validated elsewhere. */
export interface PreopLabs {
  recentHb?: number | null;
  hbSampleAt?: Date | string | null;
  potassium?: number | null;
  sodium?: number | null;
  creatinine?: number | null;
  hbsAgStatus?: string | null;
  hcvStatus?: string | null;
  hivStatus?: string | null;
  bloodPressureSystolic?: number | null;
  bloodPressureDiastolic?: number | null;
}

export interface PreopConsent {
  /** A signed paper form photographed or scanned. */
  hasUploadedFile?: boolean;
  /** The structured UNTH form completed and signed in the app. */
  signedElectronically?: boolean;
}

export interface PreopOverride {
  reason?: string | null;
  /** Who is accepting the deferral. Never taken from the client. */
  byId?: string | null;
  byName?: string | null;
}

export interface PreopCheckInput {
  urgency: SurgeryUrgency | string | null | undefined;
  labs: PreopLabs;
  consent: PreopConsent;
  override?: PreopOverride | null;
  /** Patient age, for the checks that only apply over 45. */
  patientAge?: number | null;
  /**
   * Labs are gathered by a different workflow, so do not require them here.
   *
   * Set for EMERGENCY bookings. The emergency booking form has never collected
   * labs — the emergency lab workup module does, after the case is booked, which
   * is the correct order for a patient who needs theatre now. Requiring them at
   * booking would make an override necessary for every single emergency, and an
   * override that is always needed stops being a deliberate act and becomes a
   * box to tick.
   *
   * Consent is still required, and still deferrable with a reason.
   */
  labsHandledElsewhere?: boolean;
  /**
   * What the case is being sent to Pharmacy and to the pack provider with.
   *
   * Both were optional, and the result was cases arriving with nothing
   * prepared and nothing picked — discovered at the theatre door, which is the
   * most expensive possible moment to discover it. Required now, on the same
   * terms as consent: hard for an elective case, deferrable with a named
   * reason for an emergency.
   *
   * Counted rather than passed as booleans because "sent a prescription with
   * no drugs on it" and "sent no prescription" are the same event to Pharmacy.
   */
  prescriptionItemCount?: number | null;
  consumableRequestCount?: number | null;
}

export type MissingItem =
  | 'CONSENT'
  | 'HAEMOGLOBIN'
  | 'ELECTROLYTES'
  | 'VIRAL_SCREEN'
  | 'BLOOD_PRESSURE'
  | 'PRESCRIPTION'
  | 'CONSUMABLES';

export interface PreopCheckResult {
  /** May this booking be submitted? */
  ok: boolean;
  /** What is absent, regardless of whether it blocks. */
  missing: MissingItem[];
  /** Human-readable, in the order a person would want to fix them. */
  messages: string[];
  /** True when an override would permit submission but has not been given. */
  overrideRequired: boolean;
  /** True when an override was given and accepted. */
  overrideAccepted: boolean;
  /** Stored on the case so the outstanding items stay visible until resolved. */
  outstanding: MissingItem[];
}

/** The shortest reason worth recording. Anything less is a keystroke, not a reason. */
export const MIN_OVERRIDE_REASON = 10;

const LABEL: Record<MissingItem, string> = {
  CONSENT: 'Informed consent (signed form uploaded, or signed in the app)',
  HAEMOGLOBIN: 'Recent haemoglobin, with the date the sample was drawn',
  ELECTROLYTES: 'Serum sodium, potassium and creatinine',
  VIRAL_SCREEN: 'HIV, HBsAg and HCV status',
  BLOOD_PRESSURE: 'Blood pressure',
  PRESCRIPTION: 'Pharmacy prescription — the drugs and fluids Pharmacy must prepare',
  CONSUMABLES: 'Consumables request — the pack the theatre will be opened with',
};

const present = (v: unknown): boolean =>
  v !== null && v !== undefined && v !== '' && !(typeof v === 'number' && Number.isNaN(v));

export function checkPreopRequirements(input: PreopCheckInput): PreopCheckResult {
  const urgency = String(input.urgency ?? 'ELECTIVE').toUpperCase();
  const isElective = urgency === 'ELECTIVE';

  const missing: MissingItem[] = [];

  // Consent: either route satisfies it. A signed paper form scanned on a phone is
  // as valid as an electronic signature, and insisting on the app would push
  // staff to book without consent rather than to consent properly.
  const consented = Boolean(input.consent?.hasUploadedFile || input.consent?.signedElectronically);
  if (!consented) missing.push('CONSENT');

  // Haemoglobin needs its sample time too: a figure with no date cannot be
  // checked against the 48-hour rule, so it is not usable evidence.
  if (!input.labsHandledElsewhere
      && (!present(input.labs?.recentHb) || !present(input.labs?.hbSampleAt))) {
    missing.push('HAEMOGLOBIN');
  }

  if (!input.labsHandledElsewhere
      && (!present(input.labs?.potassium) || !present(input.labs?.sodium)
          || !present(input.labs?.creatinine))) {
    missing.push('ELECTROLYTES');
  }

  if (!input.labsHandledElsewhere
      && (!present(input.labs?.hivStatus) || !present(input.labs?.hbsAgStatus)
          || !present(input.labs?.hcvStatus))) {
    missing.push('VIRAL_SCREEN');
  }

  if (!input.labsHandledElsewhere
      && (!present(input.labs?.bloodPressureSystolic)
          || !present(input.labs?.bloodPressureDiastolic))) {
    missing.push('BLOOD_PRESSURE');
  }

  // Pharmacy and the pack provider work from these. Unlike the labs there is
  // no separate workflow that collects them later, so they are required even
  // when labsHandledElsewhere is set for an emergency — an emergency case
  // needs its drugs picked more urgently than an elective one, not less.
  if (!((input.prescriptionItemCount ?? 0) > 0)) missing.push('PRESCRIPTION');
  if (!((input.consumableRequestCount ?? 0) > 0)) missing.push('CONSUMABLES');

  if (missing.length === 0) {
    return {
      ok: true, missing: [], messages: [],
      overrideRequired: false, overrideAccepted: false, outstanding: [],
    };
  }

  const messages = missing.map((m) => LABEL[m]);

  // Elective: no override exists. Offering one would make the requirement
  // advisory, and every requirement that can be waived by typing a sentence
  // eventually is.
  if (isElective) {
    return {
      ok: false, missing, messages,
      overrideRequired: false, overrideAccepted: false, outstanding: missing,
    };
  }

  // Emergency and urgent: a named clinician may defer, with a reason.
  const reason = (input.override?.reason ?? '').trim();
  const hasWho = Boolean(input.override?.byId || input.override?.byName);
  const accepted = reason.length >= MIN_OVERRIDE_REASON && hasWho;

  return {
    ok: accepted,
    missing,
    messages,
    overrideRequired: !accepted,
    overrideAccepted: accepted,
    // Recorded either way. A deferral is a debt, not a discharge — the case
    // carries these until somebody clears them.
    outstanding: missing,
  };
}

/** One line for a board or a list: what this case is still missing. */
export function outstandingLabel(items: MissingItem[] | string[] | null | undefined): string | null {
  if (!items || items.length === 0) return null;
  const set = new Set(items.map(String));
  if (set.has('CONSENT') && set.size === 1) return 'CONSENT OUTSTANDING';
  if (set.has('CONSENT')) return `CONSENT + ${set.size - 1} PRE-OP ITEM${set.size > 2 ? 'S' : ''} OUTSTANDING`;
  return `${set.size} PRE-OP ITEM${set.size > 1 ? 'S' : ''} OUTSTANDING`;
}
