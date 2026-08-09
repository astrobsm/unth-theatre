// ============================================================
// The compulsory pre-operative clinical data, in one place
// ------------------------------------------------------------
// These are the values the pre-op safety check reads. They are captured at
// booking, but they are routinely NOT available then — the FBC is still in the
// lab, the U&E comes back that evening — so they have to be recordable
// afterwards, by whoever finally has the result in their hand.
//
// Until now there was nowhere to do that. The safety check said "no recent Hb
// recorded" and the only screen that could record one was the booking form,
// which cannot be reopened. The edit page covers ward and scheduling and has
// no clinical fields at all. So the finding was true, unarguable, and
// impossible to act on.
//
// One definition shared by the form, the API and the tests, so a field cannot
// be added to the form and silently dropped by the route.
// ============================================================

export type FieldKind = 'number' | 'integer' | 'choice' | 'datetime';

export interface PreopField {
  name: string;
  label: string;
  kind: FieldKind;
  unit?: string;
  /** Allowed values for a choice. First is not a default; there is no default. */
  choices?: string[];
  /** Rejected outside this range — a typo, not a patient. */
  min?: number;
  max?: number;
  hint?: string;
  /** Groups the form into sections, and matches the scribe's category. */
  group: string;
}

/**
 * Ranges are deliberately wide. They exist to catch a slipped decimal point or
 * a value typed into the wrong box, not to second-guess a clinician: a
 * potassium of 7.9 is real and dangerous, and must be recordable.
 */
export const PREOP_FIELDS: PreopField[] = [
  { name: 'recentHb', label: 'Haemoglobin', kind: 'number', unit: 'g/dL', min: 1, max: 25,
    hint: 'Most recent full blood count.', group: 'Haematology' },
  { name: 'hbSampleAt', label: 'Hb sample taken at', kind: 'datetime',
    hint: 'Must be within 48 hours of surgery, which is what the check measures.', group: 'Haematology' },

  { name: 'potassium', label: 'Potassium', kind: 'number', unit: 'mmol/L', min: 1, max: 10, group: 'Biochemistry' },
  { name: 'sodium', label: 'Sodium', kind: 'number', unit: 'mmol/L', min: 90, max: 190, group: 'Biochemistry' },
  { name: 'creatinine', label: 'Creatinine', kind: 'number', unit: 'µmol/L', min: 10, max: 2000, group: 'Biochemistry' },

  { name: 'bloodPressureSystolic', label: 'Systolic BP', kind: 'integer', unit: 'mmHg', min: 40, max: 300, group: 'Cardiovascular' },
  { name: 'bloodPressureDiastolic', label: 'Diastolic BP', kind: 'integer', unit: 'mmHg', min: 20, max: 200, group: 'Cardiovascular' },

  { name: 'hbsAgStatus', label: 'HBsAg', kind: 'choice', choices: ['NEGATIVE', 'POSITIVE', 'PENDING', 'NOT_DONE'], group: 'Infection control' },
  { name: 'hcvStatus', label: 'HCV', kind: 'choice', choices: ['NEGATIVE', 'POSITIVE', 'PENDING', 'NOT_DONE'], group: 'Infection control' },
  { name: 'hivStatus', label: 'HIV', kind: 'choice', choices: ['NEGATIVE', 'POSITIVE', 'PENDING', 'NOT_DONE'], group: 'Infection control' },

  { name: 'bleedingRiskLevel', label: 'Bleeding risk', kind: 'choice', choices: ['LOW', 'MODERATE', 'HIGH'], group: 'Risk assessment' },
  { name: 'nutritionalStatusAtBooking', label: 'Nutritional status', kind: 'choice', choices: ['GOOD', 'FAIR', 'POOR'], group: 'Risk assessment' },
  { name: 'pressureSoreRiskAtBooking', label: 'Pressure-sore risk', kind: 'choice', choices: ['LOW', 'MEDIUM', 'HIGH'],
    hint: 'Required over 45 years (Braden/Waterlow).', group: 'Risk assessment' },
];

export const FIELD_NAMES = PREOP_FIELDS.map((f) => f.name);

/** Which field each safety-check finding is asking for. Drives the deep link. */
export const CODE_TO_FIELD: Record<string, string> = {
  HB_MISSING: 'recentHb',
  HB_STALE: 'hbSampleAt',
  POTASSIUM_MISSING: 'potassium',
  SODIUM_MISSING: 'sodium',
  CREATININE_MISSING: 'creatinine',
  BP_MISSING: 'bloodPressureSystolic',
  VIROLOGY_MISSING: 'hbsAgStatus',
  BLEEDING_RISK_MISSING: 'bleedingRiskLevel',
  NUTRITION_MISSING: 'nutritionalStatusAtBooking',
  PRESSURE_SORE_MISSING: 'pressureSoreRiskAtBooking',
};

export type ParsedValue = number | string | Date | null;
export interface ParseResult {
  data: Record<string, ParsedValue>;
  errors: string[];
}

/**
 * Validate a submitted payload down to exactly the fields above.
 *
 * An empty string CLEARS a value rather than being ignored, because a result
 * entered against the wrong patient has to be removable. Unknown keys are
 * dropped silently — the route must never be a way to write arbitrary columns
 * on a surgery.
 */
export function parsePreopData(input: Record<string, unknown>): ParseResult {
  const data: Record<string, ParsedValue> = {};
  const errors: string[] = [];

  for (const field of PREOP_FIELDS) {
    if (!(field.name in input)) continue;
    const raw = input[field.name];

    if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
      data[field.name] = null;
      continue;
    }

    if (field.kind === 'choice') {
      const v = String(raw).trim().toUpperCase();
      if (!field.choices!.includes(v)) {
        errors.push(`${field.label}: "${raw}" is not one of ${field.choices!.join(', ')}.`);
        continue;
      }
      data[field.name] = v;
      continue;
    }

    if (field.kind === 'datetime') {
      const d = new Date(String(raw));
      if (Number.isNaN(d.getTime())) {
        errors.push(`${field.label}: not a valid date and time.`);
        continue;
      }
      data[field.name] = d;
      continue;
    }

    const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!Number.isFinite(n)) {
      errors.push(`${field.label}: "${raw}" is not a number.`);
      continue;
    }
    if (field.kind === 'integer' && !Number.isInteger(n)) {
      errors.push(`${field.label}: must be a whole number.`);
      continue;
    }
    if (field.min !== undefined && n < field.min) {
      errors.push(`${field.label}: ${n} is below ${field.min}${field.unit ? ' ' + field.unit : ''}. Check for a typo.`);
      continue;
    }
    if (field.max !== undefined && n > field.max) {
      errors.push(`${field.label}: ${n} is above ${field.max}${field.unit ? ' ' + field.unit : ''}. Check for a typo.`);
      continue;
    }
    data[field.name] = n;
  }

  return { data, errors };
}

/**
 * Blood pressure is one reading. Recording half of it produces a value the
 * safety check cannot interpret and quietly keeps flagging.
 */
export function bloodPressureIncomplete(data: Record<string, ParsedValue>): boolean {
  const sys = 'bloodPressureSystolic' in data ? data.bloodPressureSystolic : undefined;
  const dia = 'bloodPressureDiastolic' in data ? data.bloodPressureDiastolic : undefined;
  if (sys === undefined && dia === undefined) return false;
  return (sys === null) !== (dia === null);
}
