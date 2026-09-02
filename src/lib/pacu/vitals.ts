/**
 * When a patient in recovery is unstable, and when they are stable again.
 *
 * WHY THE SECOND HALF MATTERS
 *
 * Abnormal vitals raise a red alert and set `redAlertTriggered` on the
 * assessment. Nothing ever set it back. The field is a LATCH: one low
 * saturation at 09:05 blocked discharge at 14:00, with the patient sitting
 * awake and stable, because the flag from five hours earlier was still true.
 *
 * The schema anticipated this — PACUAssessment carries redAlertResolvedBy and
 * redAlertResolvedAt — but nothing wrote them, so there was no way out of the
 * latch and the recovery nurse simply could not discharge the patient.
 *
 * The thresholds live here rather than inline in the vitals route because the
 * discharge check has to ask the EXACT SAME question in reverse. "Stable now"
 * must be the precise complement of "abnormal", or a patient could be blocked
 * by a rule the discharge screen disagrees with.
 */

/** The values that raise a red alert. Deliberately the recovery-room limits. */
export const PACU_LIMITS = {
  heartRateLow: 50,
  heartRateHigh: 120,
  oxygenSaturationLow: 92,
  /** Above this is severe pain, not merely uncomfortable. */
  painScoreHigh: 8,
} as const;

export interface PacuVitals {
  heartRate?: number | null;
  oxygenSaturation?: number | null;
  consciousnessLevel?: string | null;
  painScore?: number | null;
  recordedAt?: Date | string | null;
}

/**
 * What is wrong with this set of observations, in words a nurse would use.
 * Empty means nothing is out of range.
 *
 * A MISSING value is not an abnormal one. Recording a heart rate and no
 * saturation must not read as a desaturation — but see stableForDischarge,
 * which is stricter, because absent evidence is not evidence of stability.
 */
export function abnormalVitalReasons(v: PacuVitals): string[] {
  const out: string[] = [];
  const { heartRate, oxygenSaturation, consciousnessLevel, painScore } = v;

  if (heartRate != null && (heartRate < PACU_LIMITS.heartRateLow || heartRate > PACU_LIMITS.heartRateHigh)) {
    out.push(`HR ${heartRate} bpm`);
  }
  if (oxygenSaturation != null && oxygenSaturation < PACU_LIMITS.oxygenSaturationLow) {
    out.push(`SpO2 ${oxygenSaturation}%`);
  }
  if (consciousnessLevel === 'UNRESPONSIVE') {
    out.push('Unresponsive');
  }
  if (painScore != null && painScore > PACU_LIMITS.painScoreHigh) {
    out.push(`Severe pain (${painScore}/10)`);
  }
  return out;
}

/** Do these observations raise a red alert? */
export function isAbnormal(v: PacuVitals): boolean {
  return abnormalVitalReasons(v).length > 0;
}

/** The alert wording, kept identical to what the vitals route has always sent. */
export function describeAbnormal(v: PacuVitals): string {
  return `Abnormal vital signs detected: ${abnormalVitalReasons(v).join(', ')}`;
}

export interface StabilityVerdict {
  /** May this patient be discharged on these observations? */
  stable: boolean;
  /** Why not, phrased for the nurse reading it. */
  reasons: string[];
}

/**
 * Is the patient stable ENOUGH TO LEAVE on this set of observations?
 *
 * Stricter than "not abnormal", and deliberately so. Discharging over a red
 * alert is a decision that needs positive evidence, so the two observations
 * that raised most alerts — pulse and saturation — must actually be PRESENT.
 * An empty form is not a well patient.
 *
 * Consciousness and pain are judged only if recorded: they are not always
 * re-taken at the moment of discharge, and demanding them would recreate the
 * original problem in a new place.
 */
export function stableForDischarge(v: PacuVitals | null | undefined): StabilityVerdict {
  if (!v) {
    return {
      stable: false,
      reasons: ['No observations have been recorded since the alert. Record a fresh set before discharging.'],
    };
  }

  const reasons = abnormalVitalReasons(v).map((r) => `${r} is still outside the safe range`);

  if (v.heartRate == null) reasons.push('No heart rate in the most recent observations');
  if (v.oxygenSaturation == null) reasons.push('No oxygen saturation in the most recent observations');

  return { stable: reasons.length === 0, reasons };
}

/** The shortest explanation that is worth recording. */
export const STABILISATION_NOTE_MIN = 10;

/**
 * The nurse must say what happened, not merely tick a box. This is the record
 * of why a patient who triggered a red alert was judged fit to leave, and it
 * is read by whoever receives them on the ward.
 */
export function stabilisationNoteProblem(note: string | null | undefined): string | null {
  const text = (note ?? '').trim();
  if (!text) {
    return 'This patient triggered a red alert. Explain how they were stabilised before discharging.';
  }
  if (text.length < STABILISATION_NOTE_MIN) {
    return `Give a fuller explanation of how the patient was stabilised (at least ${STABILISATION_NOTE_MIN} characters).`;
  }
  return null;
}
