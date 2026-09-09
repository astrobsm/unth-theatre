// ============================================================
// Who has to go with this patient, and what has to go with them
// ------------------------------------------------------------
// A patient leaving recovery is moved by porters. That is right for most of
// them and wrong for some, and the difference is not a matter of how the ward
// corridor feels on the day.
//
// The case this exists for: a patient who set off a red alert during recovery,
// was stabilised, and is now fit to leave. They ARE fit to leave — the
// discharge criteria and the latest observations both say so — and they are
// also the patient most likely to deteriorate again in a lift. Two porters and
// a trolley is not an escort for them.
//
// Until now the app said nothing about any of this. Discharge returned the
// nurse to the PACU list, and the transfer was a separate button on the page
// they had just left, so in practice the patient was discharged in the system
// with nobody assigned to move them and no slip to send with them.
//
// Pure, and tested. Whether a deteriorating patient travels with a nurse
// should not depend on a database being reachable.
// ============================================================

export interface TransferInputs {
  /** A red alert was raised at any point during this recovery. */
  redAlertEverTriggered: boolean;
  /** It is still open — nothing was recorded to stabilise the patient. */
  redAlertStillOpen: boolean;
  /** Modified Aldrete, out of 10. Nine or more is the usual bar. */
  aldreteTotalScore: number | null;
  oxygenTherapy: boolean;
  airwayStatus?: string | null;
  consciousnessLevel?: string | null;
  drainsPresent: boolean;
  catheterInSitu: boolean;
  /** Where the patient is going: a ward, ICU, HDU. */
  destination?: string | null;
}

export type EscortLevel =
  /** Porters alone. The ordinary case. */
  | 'PORTERS'
  /** Porters plus a registered nurse who stays with the patient. */
  | 'NURSE_ESCORT'
  /** A nurse AND an anaesthetist. Reserved for the genuinely unstable. */
  | 'CLINICAL_ESCORT';

export interface TransferProcedure {
  escort: EscortLevel;
  /** Why this level, in the words the nurse should hear. */
  reasons: string[];
  /** Things that must physically travel with the patient. */
  takeWith: string[];
  /** Steps to complete before the trolley leaves the door. */
  before: string[];
  /** True when an accompanying nurse must be named before transfer starts. */
  requiresNamedNurse: boolean;
  /** True when the transfer should not start at all yet. */
  blocked: boolean;
  blockedReason?: string;
}

const ALDRETE_BAR = 9;

/**
 * What this transfer requires.
 *
 * Deliberately additive: every condition that applies contributes its reason,
 * and the escort level is the highest any of them demands. A patient can be
 * both on oxygen and post-red-alert, and a rule that picked one reason would
 * hand the nurse half the picture.
 */
export function transferProcedure(input: TransferInputs): TransferProcedure {
  const reasons: string[] = [];
  const takeWith: string[] = ['Case notes and the transfer slip', 'Post-operative instructions'];
  const before: string[] = [];
  let escort: EscortLevel = 'PORTERS';

  const raise = (level: EscortLevel) => {
    const rank = { PORTERS: 0, NURSE_ESCORT: 1, CLINICAL_ESCORT: 2 };
    if (rank[level] > rank[escort]) escort = level;
  };

  // An alert that was never closed means nobody recorded how the patient was
  // stabilised. That is not a transfer decision, it is a reason not to go.
  if (input.redAlertStillOpen) {
    return {
      escort: 'CLINICAL_ESCORT',
      reasons: ['A red alert on this recovery is still open.'],
      takeWith,
      before: [],
      requiresNamedNurse: true,
      blocked: true,
      blockedReason:
        'A red alert is still open on this patient. Record how they were stabilised, '
        + 'or resolve the alert, before arranging transfer.',
    };
  }

  if (input.redAlertEverTriggered) {
    raise('NURSE_ESCORT');
    reasons.push(
      'This patient set off a red alert during recovery. They are fit to leave, and they are '
      + 'also the patient most likely to deteriorate again on the way.');
    before.push('Telephone the receiving ward BEFORE the patient leaves — they should be expecting this one.');
    before.push('Hand over the red alert and how the patient was stabilised, out loud, to the escorting nurse.');
    takeWith.push('The stabilisation note (printed on the slip)');
  }

  if (input.aldreteTotalScore !== null && input.aldreteTotalScore < ALDRETE_BAR) {
    raise('NURSE_ESCORT');
    reasons.push(
      `Aldrete score is ${input.aldreteTotalScore} of 10, below the usual bar of ${ALDRETE_BAR}.`);
  }

  if (input.oxygenTherapy) {
    raise('NURSE_ESCORT');
    reasons.push('The patient is on oxygen.');
    takeWith.push('Portable oxygen, checked full before leaving');
    before.push('Confirm the cylinder has enough for the journey and a wait at the other end.');
  }

  const airway = (input.airwayStatus ?? '').toUpperCase();
  if (airway && !['PATENT', 'CLEAR', 'SELF_MAINTAINING'].includes(airway)) {
    raise('CLINICAL_ESCORT');
    reasons.push(`Airway is recorded as ${input.airwayStatus}.`);
    takeWith.push('Airway adjuncts and a self-inflating bag');
  }

  const conscious = (input.consciousnessLevel ?? '').toUpperCase();
  if (conscious && !['AWAKE', 'ALERT', 'FULLY_AWAKE', 'ORIENTATED'].includes(conscious)) {
    raise('NURSE_ESCORT');
    reasons.push(`Consciousness is recorded as ${input.consciousnessLevel}.`);
  }

  const dest = (input.destination ?? '').toUpperCase();
  if (dest.includes('ICU') || dest.includes('HDU') || dest.includes('INTENSIVE')) {
    raise('CLINICAL_ESCORT');
    reasons.push('The patient is going to a critical care area, which is itself the reason for the escort.');
  }

  if (input.drainsPresent) {
    takeWith.push('Drain secured and its output recorded before departure');
  }
  if (input.catheterInSitu) {
    takeWith.push('Catheter bag emptied and volume recorded before departure');
  }

  before.push('Check the patient by name and folder number against the slip before moving.');

  if (escort === 'PORTERS') {
    reasons.push('No condition on this recovery requires more than porter transport.');
  }

  return {
    escort,
    reasons,
    takeWith,
    before,
    // Anything above porters needs a named person, not "a nurse will go".
    requiresNamedNurse: escort !== 'PORTERS',
    blocked: false,
  };
}

/** How the escort level reads on screen and on the slip. */
export function escortLabel(level: EscortLevel): string {
  switch (level) {
    case 'CLINICAL_ESCORT': return 'Nurse AND anaesthetist escort';
    case 'NURSE_ESCORT': return 'Nurse escort required';
    default: return 'Porter transport';
  }
}
