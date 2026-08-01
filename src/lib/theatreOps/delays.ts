// ============================================================
// Delay detection and classification
// ------------------------------------------------------------
// The proposal's philosophy is stated plainly: "not to punish staff, but to
// identify system failures early". That sentence has to be built in, not
// written on top, so two things follow throughout this module.
//
// FIRST, a delay that has been EXPLAINED is not an escalation. The 45-minute
// query exists to catch silence, not lateness. A theatre that says "the CSSD
// pack has not arrived, we chased it at 09:20" has done everything asked of
// it, and generating a query against it would teach people that documenting a
// problem is what gets you in trouble.
//
// SECOND, nothing here names an individual. A stage-two record says the CASE
// was unexplained. Who, if anyone, was at fault is a judgement for the Quality
// Assurance committee with the facts in front of them — and the software
// deliberately cannot make it.
//
// Pure functions over plain values: the detector runs server-side on a
// schedule, the same rules colour the live board, and both must agree.
// ============================================================

export type DelayStage = 'NONE' | 'APPROACHING' | 'WARNING' | 'UNEXPLAINED';

/** Minutes past the scheduled start at which each stage begins. */
export const STAGE_ONE_MINUTES = 30;
export const STAGE_TWO_MINUTES = 45;
/** An emergency has its own, much harder, threshold — measured from BOOKING. */
export const EMERGENCY_THRESHOLD_MINUTES = 60;

// ---------------------------------------------------------------------------
// The taxonomy
// ---------------------------------------------------------------------------

/**
 * Who is asked to act when a delay of this kind is recorded.
 *
 * Routing is part of the classification rather than a separate lookup, because
 * a category nobody is notified about is a category that changes nothing.
 */
export interface DelayCategory {
  code: string;
  label: string;
  group: string;
  /** Roles notified the moment this reason is recorded. */
  notifies: string[];
  /**
   * Whether this kind of delay was, in principle, preventable by the theatre.
   * Drives reporting ONLY — never an automatic sanction. Section 15 asks for
   * the distinction to be drawn; it does not ask for it to be acted on
   * automatically, and the difference matters.
   */
  avoidable: boolean;
}

export const DELAY_CATEGORIES: DelayCategory[] = [
  // Patient
  { code: 'PATIENT_NOT_TRANSFERRED', label: 'Patient not yet transferred', group: 'Patient', notifies: ['PORTER', 'SCRUB_NURSE'], avoidable: true },
  { code: 'CONSENT_INCOMPLETE', label: 'Consent incomplete', group: 'Patient', notifies: ['SURGEON', 'HOUSE_OFFICER'], avoidable: true },
  { code: 'AWAITING_INVESTIGATIONS', label: 'Awaiting investigations', group: 'Patient', notifies: ['LABORATORY_STAFF'], avoidable: true },
  { code: 'BLOOD_UNAVAILABLE', label: 'Blood unavailable', group: 'Patient', notifies: ['BLOODBANK_STAFF'], avoidable: true },
  { code: 'PATIENT_UNSTABLE', label: 'Patient unstable', group: 'Patient', notifies: ['CONSULTANT_ANAESTHETIST'], avoidable: false },
  { code: 'AWAITING_OPTIMISATION', label: 'Awaiting optimisation', group: 'Patient', notifies: ['CONSULTANT_ANAESTHETIST'], avoidable: false },
  { code: 'FINANCIAL_CLEARANCE', label: 'Financial clearance pending', group: 'Patient', notifies: ['THEATRE_MANAGER'], avoidable: true },

  // Surgical team
  { code: 'SURGEON_UNAVAILABLE', label: 'Surgeon unavailable', group: 'Surgical team', notifies: ['THEATRE_MANAGER'], avoidable: true },
  { code: 'ASSISTANT_UNAVAILABLE', label: 'Assistant unavailable', group: 'Surgical team', notifies: ['THEATRE_MANAGER'], avoidable: true },
  { code: 'ANAESTHETIST_UNAVAILABLE', label: 'Anaesthetist unavailable', group: 'Surgical team', notifies: ['CONSULTANT_ANAESTHETIST', 'THEATRE_MANAGER'], avoidable: true },
  { code: 'SCRUB_NURSE_UNAVAILABLE', label: 'Scrub nurse unavailable', group: 'Surgical team', notifies: ['THEATRE_MANAGER'], avoidable: true },
  { code: 'CIRCULATING_NURSE_UNAVAILABLE', label: 'Circulating nurse unavailable', group: 'Surgical team', notifies: ['THEATRE_MANAGER'], avoidable: true },

  // Anaesthesia
  { code: 'DIFFICULT_AIRWAY', label: 'Difficult airway', group: 'Anaesthesia', notifies: ['CONSULTANT_ANAESTHETIST'], avoidable: false },
  { code: 'ADDITIONAL_OPTIMISATION', label: 'Additional optimisation required', group: 'Anaesthesia', notifies: ['CONSULTANT_ANAESTHETIST'], avoidable: false },
  { code: 'ANAESTHESIA_EQUIPMENT', label: 'Equipment preparation delay', group: 'Anaesthesia', notifies: ['ANAESTHETIC_TECHNICIAN'], avoidable: true },
  { code: 'MONITORING_UNAVAILABLE', label: 'Monitoring equipment unavailable', group: 'Anaesthesia', notifies: ['BIOMEDICAL_ENGINEER', 'ANAESTHETIC_TECHNICIAN'], avoidable: true },

  // Instruments & CSSD
  { code: 'PACK_UNAVAILABLE', label: 'Instrument pack unavailable', group: 'Instruments & CSSD', notifies: ['CSSD_STAFF', 'CSSD_SUPERVISOR', 'THEATRE_MANAGER'], avoidable: true },
  { code: 'PACK_INCOMPLETE', label: 'Instrument pack incomplete', group: 'Instruments & CSSD', notifies: ['CSSD_STAFF', 'CSSD_SUPERVISOR'], avoidable: true },
  { code: 'STERILISATION_DELAY', label: 'Sterilisation delay', group: 'Instruments & CSSD', notifies: ['CSSD_STAFF', 'CSSD_SUPERVISOR'], avoidable: true },
  { code: 'IMPLANT_MISSING', label: 'Missing implant', group: 'Instruments & CSSD', notifies: ['THEATRE_STORE_KEEPER', 'PROCUREMENT_OFFICER'], avoidable: true },

  // Equipment
  { code: 'DIATHERMY_UNAVAILABLE', label: 'Diathermy unavailable', group: 'Equipment', notifies: ['BIOMEDICAL_ENGINEER'], avoidable: true },
  { code: 'MICROSCOPE_UNAVAILABLE', label: 'Microscope unavailable', group: 'Equipment', notifies: ['BIOMEDICAL_ENGINEER'], avoidable: true },
  { code: 'ENDOSCOPE_UNAVAILABLE', label: 'Endoscope unavailable', group: 'Equipment', notifies: ['BIOMEDICAL_ENGINEER'], avoidable: true },
  { code: 'CARM_UNAVAILABLE', label: 'C-arm unavailable', group: 'Equipment', notifies: ['BIOMEDICAL_ENGINEER'], avoidable: true },
  { code: 'SUCTION_FAILURE', label: 'Suction failure', group: 'Equipment', notifies: ['BIOMEDICAL_ENGINEER'], avoidable: false },
  { code: 'TABLE_MALFUNCTION', label: 'Operating table malfunction', group: 'Equipment', notifies: ['BIOMEDICAL_ENGINEER'], avoidable: false },
  { code: 'LIGHTS_MALFUNCTION', label: 'Theatre lights malfunction', group: 'Equipment', notifies: ['BIOMEDICAL_ENGINEER'], avoidable: false },

  // Pharmacy
  { code: 'DRUGS_UNAVAILABLE', label: 'Drugs unavailable', group: 'Pharmacy', notifies: ['PHARMACIST'], avoidable: true },
  { code: 'PHARMACY_IMPLANT', label: 'Implant unavailable', group: 'Pharmacy', notifies: ['PHARMACIST', 'THEATRE_STORE_KEEPER'], avoidable: true },
  { code: 'SUTURES_UNAVAILABLE', label: 'Sutures unavailable', group: 'Pharmacy', notifies: ['PHARMACIST', 'THEATRE_STORE_KEEPER'], avoidable: true },

  // Facility
  { code: 'THEATRE_OCCUPIED', label: 'Theatre still occupied', group: 'Facility', notifies: ['THEATRE_MANAGER'], avoidable: false },
  { code: 'CLEANING_DELAY', label: 'Cleaning delay', group: 'Facility', notifies: ['CLEANER', 'THEATRE_MANAGER'], avoidable: true },
  { code: 'OXYGEN_FAILURE', label: 'Oxygen failure', group: 'Facility', notifies: ['OXYGEN_UNIT_SUPERVISOR'], avoidable: false },
  { code: 'WATER_INTERRUPTION', label: 'Water interruption', group: 'Facility', notifies: ['PLUMBING_SUPERVISOR', 'WATER_SUPPLY_SUPERVISOR'], avoidable: false },
  { code: 'POWER_OUTAGE', label: 'Power outage', group: 'Facility', notifies: ['POWER_PLANT_OPERATOR', 'WORKS_SUPERVISOR'], avoidable: false },
  { code: 'AIR_CONDITIONING', label: 'Air-conditioning failure', group: 'Facility', notifies: ['WORKS_SUPERVISOR'], avoidable: false },

  // Administrative
  { code: 'BOOKING_CONFLICT', label: 'Booking conflict', group: 'Administrative', notifies: ['THEATRE_MANAGER'], avoidable: true },
  { code: 'WRONG_PATIENT_BOOKED', label: 'Wrong patient booked', group: 'Administrative', notifies: ['THEATRE_MANAGER'], avoidable: true },
  { code: 'DUPLICATE_BOOKING', label: 'Duplicate booking', group: 'Administrative', notifies: ['THEATRE_MANAGER'], avoidable: true },
  { code: 'DOCUMENTATION_INCOMPLETE', label: 'Documentation incomplete', group: 'Administrative', notifies: ['HOUSE_OFFICER', 'SCRUB_NURSE'], avoidable: true },

  // Other — free text, and deliberately NOT marked avoidable. Something the
  // taxonomy has no word for should not be counted against a theatre until a
  // person has read what actually happened.
  { code: 'OTHER', label: 'Other (explain)', group: 'Other', notifies: ['THEATRE_MANAGER'], avoidable: false },
];

export const CATEGORY_BY_CODE: Record<string, DelayCategory> = Object.fromEntries(
  DELAY_CATEGORIES.map((c) => [c.code, c])
);

export const CATEGORY_GROUPS: string[] = Array.from(new Set(DELAY_CATEGORIES.map((c) => c.group)));

export function categoriesInGroup(group: string): DelayCategory[] {
  return DELAY_CATEGORIES.filter((c) => c.group === group);
}

/** Who to notify for a reason. Unknown codes fall to the theatre manager. */
export function notifiedBy(code: string): string[] {
  return CATEGORY_BY_CODE[code]?.notifies ?? ['THEATRE_MANAGER'];
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export interface DelayAssessment {
  stage: DelayStage;
  minutesLate: number | null;
  /** True once a stage-two record should exist for this case. */
  needsUnexplainedRecord: boolean;
  message: string | null;
}

/**
 * Where a case stands right now.
 *
 * `documented` is the whole point: a delay with a reason recorded never
 * reaches UNEXPLAINED, however late it becomes. It stays visible on the board
 * and in the reports — the delay is still a delay — but it generates no query,
 * because the theatre has done what was asked of it.
 */
export function assessDelay(params: {
  scheduledStart: Date | string | null;
  /** Knife-to-skin. Once this exists the case has started and is no longer late. */
  startedAt?: Date | string | null;
  /** Whether a reason has been recorded for this case. */
  documented?: boolean;
  now?: Date;
}): DelayAssessment {
  const { scheduledStart, startedAt, documented = false, now = new Date() } = params;

  // A case with no committed start time cannot be late, because there is
  // nothing to be late against. Reported as unknown rather than on time.
  if (!scheduledStart) {
    return { stage: 'NONE', minutesLate: null, needsUnexplainedRecord: false, message: null };
  }

  // Already started: whatever happened, it is history now.
  if (startedAt) {
    return { stage: 'NONE', minutesLate: null, needsUnexplainedRecord: false, message: null };
  }

  const scheduled = new Date(scheduledStart);
  const minutesLate = Math.floor((now.getTime() - scheduled.getTime()) / 60_000);

  if (minutesLate < 0) {
    return { stage: 'NONE', minutesLate, needsUnexplainedRecord: false, message: null };
  }

  // The last ten minutes before stage one, so a theatre can act before it is
  // formally late rather than being told once it already is.
  if (minutesLate < STAGE_ONE_MINUTES) {
    return minutesLate >= STAGE_ONE_MINUTES - 10
      ? {
          stage: 'APPROACHING',
          minutesLate,
          needsUnexplainedRecord: false,
          message: `Due to start ${minutesLate} minutes ago. A reminder goes out at ${STAGE_ONE_MINUTES} minutes.`,
        }
      : { stage: 'NONE', minutesLate, needsUnexplainedRecord: false, message: null };
  }

  if (minutesLate < STAGE_TWO_MINUTES || documented) {
    return {
      stage: 'WARNING',
      minutesLate,
      needsUnexplainedRecord: false,
      message: documented
        ? `${minutesLate} minutes late. A reason has been recorded.`
        : `${minutesLate} minutes late and no reason recorded. Record one before ${STAGE_TWO_MINUTES} minutes.`,
    };
  }

  return {
    stage: 'UNEXPLAINED',
    minutesLate,
    needsUnexplainedRecord: true,
    message: `${minutesLate} minutes late with no reason recorded. Flagged for Quality Assurance review.`,
  };
}

/**
 * The emergency threshold: sixty minutes from BOOKING, not from a scheduled
 * time, because an emergency has none.
 */
export function assessEmergency(params: {
  bookedAt: Date | string;
  startedAt?: Date | string | null;
  documented?: boolean;
  now?: Date;
}): DelayAssessment {
  const { bookedAt, startedAt, documented = false, now = new Date() } = params;

  if (startedAt) return { stage: 'NONE', minutesLate: null, needsUnexplainedRecord: false, message: null };

  const minutesLate = Math.floor((now.getTime() - new Date(bookedAt).getTime()) / 60_000);

  if (minutesLate < EMERGENCY_THRESHOLD_MINUTES) {
    const remaining = EMERGENCY_THRESHOLD_MINUTES - minutesLate;
    return {
      stage: remaining <= 15 ? 'APPROACHING' : 'NONE',
      minutesLate,
      needsUnexplainedRecord: false,
      message: remaining <= 15 ? `${remaining} minutes until the emergency threshold.` : null,
    };
  }

  return {
    stage: documented ? 'WARNING' : 'UNEXPLAINED',
    minutesLate,
    needsUnexplainedRecord: !documented,
    message: documented
      ? `Emergency booked ${minutesLate} minutes ago. A blocking issue has been recorded.`
      : `CRITICAL: emergency booked ${minutesLate} minutes ago and not started, with no blocking issue recorded.`,
  };
}

/** Whether a stage-two record should be raised — the suppression rule, stated once. */
export function shouldRaiseUnexplained(assessment: DelayAssessment): boolean {
  return assessment.needsUnexplainedRecord;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export interface DelayRecord {
  categoryCode: string;
  minutesLate?: number | null;
}

/**
 * Group recorded delays by category, commonest first — the bottleneck list.
 *
 * Avoidability is reported as a count, never as a verdict on anyone. It is
 * what makes "we lost four hours this month to CSSD packs" answerable, which
 * is the point of collecting any of this.
 */
export function summariseDelays(records: DelayRecord[]) {
  const byCategory = new Map<string, { code: string; label: string; group: string; count: number; totalMinutes: number; avoidable: boolean }>();

  for (const r of records) {
    const cat = CATEGORY_BY_CODE[r.categoryCode];
    const row = byCategory.get(r.categoryCode) ?? {
      code: r.categoryCode,
      label: cat?.label ?? r.categoryCode,
      group: cat?.group ?? 'Other',
      count: 0,
      totalMinutes: 0,
      avoidable: cat?.avoidable ?? false,
    };
    row.count += 1;
    row.totalMinutes += r.minutesLate ?? 0;
    byCategory.set(r.categoryCode, row);
  }

  const rows = Array.from(byCategory.values())
    .map((r) => ({ ...r, averageMinutes: r.count > 0 ? Math.round(r.totalMinutes / r.count) : 0 }))
    .sort((a, b) => b.count - a.count);

  return {
    categories: rows,
    totals: {
      delays: records.length,
      minutesLost: rows.reduce((s, r) => s + r.totalMinutes, 0),
      avoidableDelays: rows.filter((r) => r.avoidable).reduce((s, r) => s + r.count, 0),
      avoidableMinutes: rows.filter((r) => r.avoidable).reduce((s, r) => s + r.totalMinutes, 0),
    },
  };
}
