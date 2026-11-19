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
 *
 * WHY CHILDREN GET THEIR OWN LIMITS
 *
 * The heart rate limits below are an ADULT's. A healthy six-month-old runs at
 * 150 bpm; every single one of them tripped the 120 ceiling and raised a red
 * alert, so the recovery room learned to read a paediatric alert as noise.
 * The false alarm is the cheap half of that fault. The expensive half is the
 * real alert nobody looks at any more.
 *
 * It also failed in the dangerous direction. A floor of 50 bpm meant an infant
 * at 70 — profoundly bradycardic, the single observation paediatric
 * resuscitation is built around — raised NOTHING at all, because 70 is a
 * perfectly good adult pulse.
 *
 * So the heart rate band is chosen by age. Saturation, pain and consciousness
 * are unchanged, because those limits do not move with age.
 */

import { ageInDays, formatAge } from '@/lib/age';

/**
 * The values that raise a red alert in an ADULT. Deliberately the
 * recovery-room limits, and deliberately wider than a textbook normal range:
 * this is the line at which somebody is called, not the line of perfect health.
 *
 * Kept exported and unchanged, so every adult patient is judged by exactly the
 * same numbers as before this file learned about children.
 */
export const PACU_LIMITS = {
  heartRateLow: 50,
  heartRateHigh: 120,
  oxygenSaturationLow: 92,
  /** Above this is severe pain, not merely uncomfortable. */
  painScoreHigh: 8,
} as const;

export interface AgeBand {
  /** Stable key, so a band can be asserted in a test or stored in a note. */
  key: 'NEONATE' | 'INFANT' | 'TODDLER' | 'PRESCHOOL' | 'SCHOOL_AGE' | 'ADULT';
  /** How the band is named on screen. */
  label: string;
  /** How the band is named inside a sentence: "above 180 for an infant". */
  article: string;
  /** Upper bound of the band in days, exclusive. Infinity for the adult band. */
  underDays: number;
  heartRateLow: number;
  heartRateHigh: number;
}

/**
 * Heart rate bands for the recovery room, youngest first.
 *
 * Each band runs from the SLEEPING lower limit to the AWAKE upper limit of the
 * standard paediatric ranges (PALS/APLS). That pairing is deliberate: a child
 * in recovery is either still sedated or awake and crying, often both within
 * the hour, and a band drawn from only one of those states alarms on the other.
 *
 * Twelve years and over is the adult band unchanged. Adolescents are rated as
 * adults everywhere else in paediatric practice, and a separate adolescent band
 * would put a cliff edge in the middle of secondary school for no clinical gain.
 */
export const PACU_AGE_BANDS: readonly AgeBand[] = [
  {
    key: 'NEONATE',
    label: 'Newborn (under 1 month)',
    article: 'a newborn',
    underDays: 28,
    heartRateLow: 90,
    heartRateHigh: 205,
  },
  {
    key: 'INFANT',
    label: 'Infant (1–12 months)',
    article: 'an infant',
    underDays: 365.25,
    heartRateLow: 90,
    heartRateHigh: 180,
  },
  {
    key: 'TODDLER',
    label: 'Toddler (1–2 years)',
    article: 'a toddler',
    underDays: 3 * 365.25,
    heartRateLow: 80,
    heartRateHigh: 140,
  },
  {
    key: 'PRESCHOOL',
    label: 'Pre-school (3–5 years)',
    article: 'a child of 3–5',
    underDays: 6 * 365.25,
    heartRateLow: 65,
    heartRateHigh: 120,
  },
  {
    key: 'SCHOOL_AGE',
    label: 'School age (6–11 years)',
    article: 'a child of 6–11',
    underDays: 12 * 365.25,
    heartRateLow: 58,
    heartRateHigh: 118,
  },
  {
    key: 'ADULT',
    label: '12 years and over',
    article: 'an adult',
    underDays: Infinity,
    heartRateLow: PACU_LIMITS.heartRateLow,
    heartRateHigh: PACU_LIMITS.heartRateHigh,
  },
];

export const ADULT_BAND: AgeBand = PACU_AGE_BANDS[PACU_AGE_BANDS.length - 1];

/** A patient's age as the patients table holds it. */
export interface PatientAge {
  age?: number | null;
  ageUnit?: string | null;
}

export interface AgeBanding {
  band: AgeBand;
  /** False when no usable age was given and the adult band is a fallback. */
  known: boolean;
  /** The age in words, for the banner: "6 months". Empty when unknown. */
  ageText: string;
}

/**
 * Which band this patient falls in.
 *
 * With no usable age the ADULT band is used and `known` is false, so a screen
 * can SAY so rather than quietly applying adult limits to a baby. It is the
 * honest fallback, but it is still a fallback, and the form says as much.
 *
 * `0 YEARS` is treated as an infant, not a newborn. It is what gets typed for
 * any baby under one and carries no information about which; the infant band is
 * the narrower of the two under-one bands, so an age that could be either is
 * judged by the stricter of the two.
 */
export function bandForAge(p?: PatientAge | null): AgeBanding {
  const age = p?.age;
  const unit = (p?.ageUnit || 'YEARS').toUpperCase();

  if (age === null || age === undefined || Number.isNaN(age) || age < 0) {
    return { band: ADULT_BAND, known: false, ageText: '' };
  }

  const ageText = formatAge(age, unit);

  if (age === 0 && unit === 'YEARS') {
    return { band: PACU_AGE_BANDS[1], known: true, ageText };
  }

  const days = ageInDays(age, unit);
  if (days === null) return { band: ADULT_BAND, known: false, ageText: '' };

  const band = PACU_AGE_BANDS.find((b) => days < b.underDays) ?? ADULT_BAND;
  return { band, known: true, ageText };
}

export interface PacuLimits {
  heartRateLow: number;
  heartRateHigh: number;
  oxygenSaturationLow: number;
  painScoreHigh: number;
}

/** The numbers that will be applied to this patient's observations. */
export function limitsForAge(p?: PatientAge | null): PacuLimits & { band: AgeBand; known: boolean } {
  const { band, known } = bandForAge(p);
  return {
    heartRateLow: band.heartRateLow,
    heartRateHigh: band.heartRateHigh,
    // Neither of these moves with age. A desaturation is a desaturation at any
    // age, and a pain score is already scaled 0-10 whichever tool recorded it.
    oxygenSaturationLow: PACU_LIMITS.oxygenSaturationLow,
    painScoreHigh: PACU_LIMITS.painScoreHigh,
    band,
    known,
  };
}

/** "90–180 bpm" — for the hint printed beside the heart rate box. */
export function heartRateRangeText(band: AgeBand): string {
  return `${band.heartRateLow}–${band.heartRateHigh} bpm`;
}

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
 *
 * `patient` carries the age. Omitting it applies adult limits, which is what
 * every caller did before children had their own, so an adult's alert wording
 * is unchanged to the character. For a child the band is named in the reason —
 * "HR 210 bpm (above 180 for an infant)" — because an alert that will not say
 * which rule it applied cannot be argued with at the bedside.
 */
export function abnormalVitalReasons(v: PacuVitals, patient?: PatientAge | null): string[] {
  const out: string[] = [];
  const { heartRate, oxygenSaturation, consciousnessLevel, painScore } = v;
  const limits = limitsForAge(patient);
  const paediatric = limits.band.key !== 'ADULT';

  if (heartRate != null && (heartRate < limits.heartRateLow || heartRate > limits.heartRateHigh)) {
    const side =
      heartRate < limits.heartRateLow ? `below ${limits.heartRateLow}` : `above ${limits.heartRateHigh}`;
    out.push(paediatric ? `HR ${heartRate} bpm (${side} for ${limits.band.article})` : `HR ${heartRate} bpm`);
  }
  if (oxygenSaturation != null && oxygenSaturation < limits.oxygenSaturationLow) {
    out.push(`SpO2 ${oxygenSaturation}%`);
  }
  if (consciousnessLevel === 'UNRESPONSIVE') {
    out.push('Unresponsive');
  }
  if (painScore != null && painScore > limits.painScoreHigh) {
    out.push(`Severe pain (${painScore}/10)`);
  }
  return out;
}

/** Do these observations raise a red alert? */
export function isAbnormal(v: PacuVitals, patient?: PatientAge | null): boolean {
  return abnormalVitalReasons(v, patient).length > 0;
}

/** The alert wording, kept identical to what the vitals route has always sent. */
export function describeAbnormal(v: PacuVitals, patient?: PatientAge | null): string {
  return `Abnormal vital signs detected: ${abnormalVitalReasons(v, patient).join(', ')}`;
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
 *
 * Takes the same age as the alert that blocked the discharge, because the two
 * must agree. A child cleared by an adult ceiling that the alert never used
 * would be the latch bug again, wearing a different hat.
 */
export function stableForDischarge(
  v: PacuVitals | null | undefined,
  patient?: PatientAge | null,
): StabilityVerdict {
  if (!v) {
    return {
      stable: false,
      reasons: ['No observations have been recorded since the alert. Record a fresh set before discharging.'],
    };
  }

  const reasons = abnormalVitalReasons(v, patient).map((r) => `${r} is still outside the safe range`);

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
