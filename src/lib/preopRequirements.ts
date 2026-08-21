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
  /**
   * The case is being booked from the third section, with the rest to follow
   * before the morning of surgery.
   *
   * This is the ordinary route now, not an exception, and it applies to every
   * urgency including elective. The reasoning is in the record: under a hard
   * block, 69% of cases over two months carried no retrievable consent and,
   * before the safety fields were enforced, essentially none carried a
   * haemoglobin or a viral screen. A requirement that stops a case being
   * booked does not get the requirement met — it gets the booking delayed, done
   * elsewhere, or abandoned, and theatre finds out at 8am.
   *
   * So the theatre sees the case as soon as there is a patient, a procedure and
   * a team, and what is missing becomes a DEBT: recorded against the case, in
   * the booker's name, shown on every board that case appears on, and due
   * before the patient is called in the morning. The holding area still stops
   * the patient at the door until it is cleared, so nothing reaches theatre
   * undocumented — it simply stops being invisible in the meantime.
   */
  deferOutstanding?: boolean;
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
  /**
   * True when the case was booked early with the rest to follow. Distinct from
   * overrideAccepted, which is a clinician deliberately waiving a requirement
   * for this patient — this is the normal workflow with work still to do.
   */
  deferred: boolean;
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

/**
 * The only thing that stops a case being booked.
 *
 * Everything else on this list is still ASKED FOR, still recorded, and still
 * shown as outstanding on every board the case appears on — it simply no
 * longer blocks the booking, because requiring it at booking put the work on
 * the wrong person.
 *
 * The change was directed on 21 August, after surgical residents set out what
 * the form had quietly transferred to them. Prof Ezemba put it plainly: the
 * booking had previously been done by departmental staff; specifying savlon,
 * caps, spirit, masks and suction tubing is not a surgeon's encumbrance; the
 * anaesthetic assessment — respiratory system, ASA — is the anaesthetist's
 * work; and height, weight and laboratory results were being typed in by the
 * surgery resident. He was right on every count, and the figures agreed:
 * against 563 cases in two months the anaesthetists recorded 3 reviews, while
 * ASA was entered 448 times on the patient record by whoever registered them.
 *
 * A requirement enforced against the wrong person does not get the requirement
 * met. It gets the booking delayed, done elsewhere, or abandoned in a draft —
 * which is exactly what happened to a CTU list of three cases that existed in
 * neither database at midnight.
 *
 * Consent stays. It is the one item that is genuinely the surgeon's, that the
 * patient must be present for, and that cannot be reconstructed afterwards: a
 * consent that cannot be produced is, in law, indistinguishable from a consent
 * that was never taken. A photograph of the signed paper form satisfies it.
 */
const BLOCKS_BOOKING: MissingItem[] = ['CONSENT'];

export function checkPreopRequirements(input: PreopCheckInput): PreopCheckResult {
  const urgency = String(input.urgency ?? 'ELECTIVE').toUpperCase();
  const isElective = urgency === 'ELECTIVE';

  // Everything not yet supplied. Distinct from what BLOCKS: the case carries
  // all of it as an outstanding debt so theatre can see what is not ready,
  // while only the blocking subset can refuse the booking.
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

  // Everything absent stays on the case as a debt; only the blocking subset can
  // refuse it. `outstanding` is therefore the full list in every branch below —
  // relaxing what stops a booking must not also blind the theatre to what is
  // not ready.
  const outstanding = [...missing];
  const blocking = missing.filter((m) => BLOCKS_BOOKING.includes(m));

  if (blocking.length === 0) {
    return {
      ok: true, missing: outstanding, messages: outstanding.map((m) => LABEL[m]),
      overrideRequired: false, overrideAccepted: false, deferred: false, outstanding,
    };
  }

  const messages = blocking.map((m) => LABEL[m]);

  // Booked from the third section, with the rest to follow before the morning.
  //
  // Checked BEFORE the elective branch, because this is the case that branch
  // was refusing. It applies to every urgency: the theatre needs to know a
  // patient is coming as soon as there is a patient, a procedure and a team,
  // and everything after that is preparation which has its own deadline.
  //
  // Nothing is waived. Every missing item is returned as outstanding, stored on
  // the case, and shown until it is cleared — and the holding area still stops
  // the patient at the door. The change is when theatre finds out, not what is
  // required.
  if (input.deferOutstanding) {
    return {
      ok: true, missing: blocking, messages,
      overrideRequired: false, overrideAccepted: false, deferred: true, outstanding,
    };
  }

  // Elective: no override exists. Offering one would make the requirement
  // advisory, and every requirement that can be waived by typing a sentence
  // eventually is.
  if (isElective) {
    return {
      ok: false, missing: blocking, messages,
      overrideRequired: false, overrideAccepted: false, deferred: false, outstanding,
    };
  }

  // Emergency and urgent: a named clinician may defer, with a reason.
  const reason = (input.override?.reason ?? '').trim();
  const hasWho = Boolean(input.override?.byId || input.override?.byName);
  const accepted = reason.length >= MIN_OVERRIDE_REASON && hasWho;

  return {
    ok: accepted,
    missing: blocking,
    messages,
    overrideRequired: !accepted,
    overrideAccepted: accepted,
    deferred: false,
    // Recorded either way. A deferral is a debt, not a discharge — the case
    // carries these until somebody clears them.
    outstanding,
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
