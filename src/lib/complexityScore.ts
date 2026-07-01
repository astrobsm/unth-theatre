// Surgical Complexity Score (0-100) — weighted scoring across eight operative
// criteria. Used at the end of the post-operative note to classify a procedure
// as Minor / Intermediate / Major / Supermajor for audit and research analytics.
//
// Each criterion contributes an ordinal sub-score (0..n). The eight raw
// sub-scores are normalised to a 0-100 scale using per-criterion weights, so
// the maximum attainable weighted total is exactly 100.

export type OperativeTime =
  | 'MINOR' // < 60 min
  | 'INTERMEDIATE' // 60-120 min
  | 'MAJOR' // 120-240 min
  | 'SUPERMAJOR'; // > 240 min

export type BloodLoss =
  | 'MINOR' // < 100 mL
  | 'INTERMEDIATE' // 100-500 mL
  | 'MAJOR' // 500-1000 mL
  | 'SUPERMAJOR'; // > 1000 mL

export type Anaesthesia = 'LOCAL' | 'REGIONAL' | 'GENERAL' | 'GENERAL_INVASIVE';

export type BodyCavity =
  | 'NONE'
  | 'SUPERFICIAL'
  | 'THORACIC'
  | 'ABDOMINAL'
  | 'CRANIAL'
  | 'PELVIC';

export type PhysiologicalStress = 'MINIMAL' | 'MODERATE' | 'HIGH' | 'EXTREME';

export type HospitalStay = 'DAY_CASE' | 'OVERNIGHT' | 'TWO_TO_FIVE' | 'OVER_FIVE';

export type IcuRequirement = 'NO' | 'POSSIBLE' | 'EXPECTED' | 'MANDATORY';

export type MdtRequirement =
  | 'SINGLE_SURGEON'
  | 'SINGLE_SPECIALTY'
  | 'TWO_SPECIALTIES'
  | 'MULTIPLE_SPECIALTIES';

export interface ComplexityCriteria {
  operativeTime: OperativeTime;
  bloodLoss: BloodLoss;
  anaesthesia: Anaesthesia;
  bodyCavity: BodyCavity;
  physiologicalStress: PhysiologicalStress;
  hospitalStay: HospitalStay;
  icuRequirement: IcuRequirement;
  mdtRequirement: MdtRequirement;
}

export type ComplexityClass = 'Minor' | 'Intermediate' | 'Major' | 'Supermajor';

export interface ComplexityResult {
  score: number; // 0-100
  classification: ComplexityClass;
}

// Ordinal sub-scores (0-based) for each option of each criterion.
const OPERATIVE_TIME: Record<OperativeTime, number> = {
  MINOR: 0,
  INTERMEDIATE: 1,
  MAJOR: 2,
  SUPERMAJOR: 3,
};
const BLOOD_LOSS: Record<BloodLoss, number> = {
  MINOR: 0,
  INTERMEDIATE: 1,
  MAJOR: 2,
  SUPERMAJOR: 3,
};
const ANAESTHESIA: Record<Anaesthesia, number> = {
  LOCAL: 0,
  REGIONAL: 1,
  GENERAL: 2,
  GENERAL_INVASIVE: 3,
};
const BODY_CAVITY: Record<BodyCavity, number> = {
  NONE: 0,
  SUPERFICIAL: 1,
  THORACIC: 4,
  ABDOMINAL: 3,
  CRANIAL: 5,
  PELVIC: 3,
};
const PHYSIOLOGICAL_STRESS: Record<PhysiologicalStress, number> = {
  MINIMAL: 0,
  MODERATE: 1,
  HIGH: 2,
  EXTREME: 3,
};
const HOSPITAL_STAY: Record<HospitalStay, number> = {
  DAY_CASE: 0,
  OVERNIGHT: 1,
  TWO_TO_FIVE: 2,
  OVER_FIVE: 3,
};
const ICU_REQUIREMENT: Record<IcuRequirement, number> = {
  NO: 0,
  POSSIBLE: 1,
  EXPECTED: 2,
  MANDATORY: 3,
};
const MDT_REQUIREMENT: Record<MdtRequirement, number> = {
  SINGLE_SURGEON: 0,
  SINGLE_SPECIALTY: 1,
  TWO_SPECIALTIES: 2,
  MULTIPLE_SPECIALTIES: 3,
};

// Relative weight of each criterion. Weights sum to 1. Operative time, blood
// loss, body cavity, physiological stress and ICU carry the most signal.
const WEIGHTS = {
  operativeTime: 0.18,
  bloodLoss: 0.16,
  anaesthesia: 0.12,
  bodyCavity: 0.14,
  physiologicalStress: 0.14,
  hospitalStay: 0.08,
  icuRequirement: 0.12,
  mdtRequirement: 0.06,
} as const;

// Maximum ordinal value for each criterion, used to normalise to 0..1.
const MAX = {
  operativeTime: 3,
  bloodLoss: 3,
  anaesthesia: 3,
  bodyCavity: 5,
  physiologicalStress: 3,
  hospitalStay: 3,
  icuRequirement: 3,
  mdtRequirement: 3,
} as const;

export function classifyScore(score: number): ComplexityClass {
  if (score <= 20) return 'Minor';
  if (score <= 40) return 'Intermediate';
  if (score <= 70) return 'Major';
  return 'Supermajor';
}

export function computeComplexity(c: ComplexityCriteria): ComplexityResult {
  const norm =
    (OPERATIVE_TIME[c.operativeTime] / MAX.operativeTime) * WEIGHTS.operativeTime +
    (BLOOD_LOSS[c.bloodLoss] / MAX.bloodLoss) * WEIGHTS.bloodLoss +
    (ANAESTHESIA[c.anaesthesia] / MAX.anaesthesia) * WEIGHTS.anaesthesia +
    (BODY_CAVITY[c.bodyCavity] / MAX.bodyCavity) * WEIGHTS.bodyCavity +
    (PHYSIOLOGICAL_STRESS[c.physiologicalStress] / MAX.physiologicalStress) * WEIGHTS.physiologicalStress +
    (HOSPITAL_STAY[c.hospitalStay] / MAX.hospitalStay) * WEIGHTS.hospitalStay +
    (ICU_REQUIREMENT[c.icuRequirement] / MAX.icuRequirement) * WEIGHTS.icuRequirement +
    (MDT_REQUIREMENT[c.mdtRequirement] / MAX.mdtRequirement) * WEIGHTS.mdtRequirement;

  const score = Math.round(norm * 100);
  return { score, classification: classifyScore(score) };
}

// Human-readable labels for each option, for rendering select inputs.
export const COMPLEXITY_OPTIONS = {
  operativeTime: [
    { value: 'MINOR', label: 'Minor (< 60 min)' },
    { value: 'INTERMEDIATE', label: 'Intermediate (60-120 min)' },
    { value: 'MAJOR', label: 'Major (120-240 min)' },
    { value: 'SUPERMAJOR', label: 'Supermajor (> 240 min)' },
  ],
  bloodLoss: [
    { value: 'MINOR', label: 'Minor (< 100 mL)' },
    { value: 'INTERMEDIATE', label: 'Intermediate (100-500 mL)' },
    { value: 'MAJOR', label: 'Major (500-1000 mL)' },
    { value: 'SUPERMAJOR', label: 'Supermajor (> 1000 mL)' },
  ],
  anaesthesia: [
    { value: 'LOCAL', label: 'Local' },
    { value: 'REGIONAL', label: 'Regional' },
    { value: 'GENERAL', label: 'General' },
    { value: 'GENERAL_INVASIVE', label: 'General with invasive monitoring' },
  ],
  bodyCavity: [
    { value: 'NONE', label: 'No' },
    { value: 'SUPERFICIAL', label: 'Superficial' },
    { value: 'THORACIC', label: 'Thoracic' },
    { value: 'ABDOMINAL', label: 'Abdominal' },
    { value: 'CRANIAL', label: 'Cranial' },
    { value: 'PELVIC', label: 'Pelvic' },
  ],
  physiologicalStress: [
    { value: 'MINIMAL', label: 'Minimal' },
    { value: 'MODERATE', label: 'Moderate' },
    { value: 'HIGH', label: 'High' },
    { value: 'EXTREME', label: 'Extreme' },
  ],
  hospitalStay: [
    { value: 'DAY_CASE', label: 'Day case' },
    { value: 'OVERNIGHT', label: 'Overnight' },
    { value: 'TWO_TO_FIVE', label: '2-5 days' },
    { value: 'OVER_FIVE', label: '> 5 days' },
  ],
  icuRequirement: [
    { value: 'NO', label: 'No' },
    { value: 'POSSIBLE', label: 'Possible' },
    { value: 'EXPECTED', label: 'Expected' },
    { value: 'MANDATORY', label: 'Mandatory' },
  ],
  mdtRequirement: [
    { value: 'SINGLE_SURGEON', label: 'Single surgeon' },
    { value: 'SINGLE_SPECIALTY', label: 'Single specialty' },
    { value: 'TWO_SPECIALTIES', label: 'Two specialties' },
    { value: 'MULTIPLE_SPECIALTIES', label: 'Multiple specialties' },
  ],
} as const;

export const DEFAULT_CRITERIA: ComplexityCriteria = {
  operativeTime: 'INTERMEDIATE',
  bloodLoss: 'MINOR',
  anaesthesia: 'GENERAL',
  bodyCavity: 'NONE',
  physiologicalStress: 'MODERATE',
  hospitalStay: 'OVERNIGHT',
  icuRequirement: 'NO',
  mdtRequirement: 'SINGLE_SURGEON',
};

// Map a number of minutes to the operative-time band.
export function operativeTimeFromMinutes(min: number | null | undefined): OperativeTime | null {
  if (min == null || Number.isNaN(min) || min <= 0) return null;
  if (min < 60) return 'MINOR';
  if (min <= 120) return 'INTERMEDIATE';
  if (min <= 240) return 'MAJOR';
  return 'SUPERMAJOR';
}

// Map millilitres of blood loss to the blood-loss band.
export function bloodLossFromMl(ml: number | null | undefined): BloodLoss | null {
  if (ml == null || Number.isNaN(ml) || ml < 0) return null;
  if (ml < 100) return 'MINOR';
  if (ml <= 500) return 'INTERMEDIATE';
  if (ml <= 1000) return 'MAJOR';
  return 'SUPERMAJOR';
}

// Map a Prisma AnesthesiaType enum value to the complexity anaesthesia band.
export function anaesthesiaFromType(type: string | null | undefined): Anaesthesia | null {
  switch (type) {
    case 'LOCAL':
      return 'LOCAL';
    case 'REGIONAL':
    case 'SPINAL':
    case 'EPIDURAL':
    case 'COMBINED_SPINAL_EPIDURAL':
    case 'SEDATION':
      return 'REGIONAL';
    case 'GENERAL':
      return 'GENERAL';
    default:
      return null;
  }
}

// Derived surgery shape used to pre-fill the complexity form from data already
// documented for the case (operative time, blood loss, anaesthesia, ICU).
export interface SurgeryLike {
  estimatedDuration?: number | null;
  knifeOnSkinTime?: string | Date | null;
  surgeryEndTime?: string | Date | null;
  actualStartTime?: string | Date | null;
  actualEndTime?: string | Date | null;
  anesthesiaType?: string | null;
  needICU?: boolean | null;
  intraOperativeRecord?: {
    estimatedBloodLoss?: number | null;
    knifeToSkinTime?: string | Date | null;
    procedureStartTime?: string | Date | null;
    procedureEndTime?: string | Date | null;
  } | null;
}

function minutesBetween(a?: string | Date | null, b?: string | Date | null): number | null {
  if (!a || !b) return null;
  const start = new Date(a).getTime();
  const end = new Date(b).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return Math.round((end - start) / 60000);
}

// Build a best-effort set of criteria from documented case data. Any field that
// cannot be derived falls back to the sensible default so the form is complete.
export function autofillCriteria(s: SurgeryLike | null | undefined): {
  criteria: ComplexityCriteria;
  autofilled: Partial<Record<keyof ComplexityCriteria, boolean>>;
} {
  const criteria: ComplexityCriteria = { ...DEFAULT_CRITERIA };
  const autofilled: Partial<Record<keyof ComplexityCriteria, boolean>> = {};
  if (!s) return { criteria, autofilled };

  // Operative time: prefer actual knife-to-skin -> end, else estimatedDuration.
  const durationMin =
    minutesBetween(s.intraOperativeRecord?.knifeToSkinTime, s.intraOperativeRecord?.procedureEndTime) ??
    minutesBetween(s.knifeOnSkinTime, s.surgeryEndTime) ??
    minutesBetween(s.actualStartTime, s.actualEndTime) ??
    (s.estimatedDuration ?? null);
  const ot = operativeTimeFromMinutes(durationMin);
  if (ot) {
    criteria.operativeTime = ot;
    autofilled.operativeTime = true;
  }

  // Blood loss from the intra-operative record.
  const bl = bloodLossFromMl(s.intraOperativeRecord?.estimatedBloodLoss);
  if (bl) {
    criteria.bloodLoss = bl;
    autofilled.bloodLoss = true;
  }

  // Anaesthesia type from the booking / intra-op record.
  const an = anaesthesiaFromType(s.anesthesiaType);
  if (an) {
    criteria.anaesthesia = an;
    autofilled.anaesthesia = true;
  }

  // ICU requirement from the booking flag.
  if (s.needICU != null) {
    criteria.icuRequirement = s.needICU ? 'EXPECTED' : 'NO';
    autofilled.icuRequirement = true;
  }

  return { criteria, autofilled };
}
