// ============================================================
// Fitness for the proposed anaesthesia, and what it takes to change it
// ------------------------------------------------------------
// The review used to end in free text: review notes, a plan, and a box for
// special considerations. Three prose fields, none of them answering the one
// question the rest of the theatre needs answered — may this patient have this
// anaesthetic today, yes or no.
//
// Prose cannot be acted on by anybody but its author. A scrub nurse reading
// "would benefit from optimisation of haemoglobin prior to listing" has to
// decide for herself whether that means the case is off, and two people read it
// two ways. So the decision is now a field with two values, and everything that
// has to happen before an unfit patient becomes fit is a list of items with an
// owner and a status.
//
// THE RULE THAT MATTERS: a patient declared unfit stays unfit until an
// anaesthetist says otherwise. Not until the requirements are ticked off —
// completing the tasks is evidence for a reassessment, not a substitute for
// one. Nothing in this module lets a case become fit by arithmetic.
// ============================================================

export type FitnessDecision = 'FIT' | 'NOT_FIT';

/**
 * Where an optimisation requirement has got to.
 *
 * COMPLETED and VERIFIED are deliberately different. The person who does the
 * work says COMPLETED; somebody checking says VERIFIED. Collapsing the two
 * would mean the only evidence a correction actually happened is the word of
 * whoever was asked to do it.
 */
export type RequirementStatus = 'OUTSTANDING' | 'IN_PROGRESS' | 'COMPLETED' | 'VERIFIED';

export type RequirementPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * The reasons a patient is not fit, as a list rather than a sentence.
 *
 * Configurable by administrators in the sense that the stored value is a
 * string: an institution adding a category does not need a migration. These
 * are the ones offered, and OTHER carries the rest with its own free text.
 */
export const OPTIMISATION_CATEGORIES = [
  'FURTHER_INVESTIGATION',
  'LABORATORY_ABNORMALITY',
  'IMAGING',
  'MEDICAL_OPTIMISATION',
  'CARDIOLOGY_REVIEW',
  'PHYSICIAN_REVIEW',
  'SPECIALIST_REVIEW',
  'BLOOD_PRODUCTS',
  'ELECTROLYTE_CORRECTION',
  'HAEMOGLOBIN_OPTIMISATION',
  'INFECTION_MANAGEMENT',
  'BLOOD_PRESSURE_OPTIMISATION',
  'BLOOD_GLUCOSE_OPTIMISATION',
  'MEDICATION_ADJUSTMENT',
  'ANTICOAGULANT_MANAGEMENT',
  'AIRWAY_ASSESSMENT',
  'FASTING_NOT_SATISFIED',
  'FLUID_MANAGEMENT',
  'RESPIRATORY_OPTIMISATION',
  'ADDITIONAL_MONITORING',
  'CONSENT_DOCUMENTATION',
  'OTHER',
] as const;

export type OptimisationCategory = typeof OPTIMISATION_CATEGORIES[number];

export const CATEGORY_LABELS: Record<string, string> = {
  FURTHER_INVESTIGATION: 'Further investigation required',
  LABORATORY_ABNORMALITY: 'Laboratory abnormality requiring correction',
  IMAGING: 'Imaging required',
  MEDICAL_OPTIMISATION: 'Medical optimisation required',
  CARDIOLOGY_REVIEW: 'Cardiology review required',
  PHYSICIAN_REVIEW: 'Physician review required',
  SPECIALIST_REVIEW: 'Additional specialist review required',
  BLOOD_PRODUCTS: 'Blood or blood products required',
  ELECTROLYTE_CORRECTION: 'Electrolyte correction required',
  HAEMOGLOBIN_OPTIMISATION: 'Haemoglobin optimisation required',
  INFECTION_MANAGEMENT: 'Infection management required',
  BLOOD_PRESSURE_OPTIMISATION: 'Blood pressure optimisation required',
  BLOOD_GLUCOSE_OPTIMISATION: 'Blood glucose optimisation required',
  MEDICATION_ADJUSTMENT: 'Medication adjustment required',
  ANTICOAGULANT_MANAGEMENT: 'Anticoagulant or antiplatelet management required',
  AIRWAY_ASSESSMENT: 'Airway assessment or review required',
  FASTING_NOT_SATISFIED: 'Fasting requirement not yet satisfied',
  FLUID_MANAGEMENT: 'Fluid management required',
  RESPIRATORY_OPTIMISATION: 'Respiratory optimisation required',
  ADDITIONAL_MONITORING: 'Additional monitoring required',
  CONSENT_DOCUMENTATION: 'Consent or documentation issue',
  OTHER: 'Other',
};

export interface OptimisationRequirement {
  id?: string;
  category: string;
  /** Precisely what must be done. A category alone is not an instruction. */
  action: string;
  /** Who is being asked. A requirement nobody owns is a wish. */
  responsible?: string | null;
  targetCompletion?: Date | string | null;
  priority?: RequirementPriority;
  status?: RequirementStatus;
}

/** The shortest action worth recording. */
export const MIN_ACTION_LENGTH = 10;

export interface ReviewCompletionInput {
  decision: FitnessDecision | null | undefined;
  requirements?: OptimisationRequirement[] | null;
  /** The reviewing anaesthetist. Taken from the session, never the body. */
  reviewerId?: string | null;
}

export interface CompletionCheck {
  ok: boolean;
  /** What must be fixed before the review can be completed. */
  problems: string[];
}

/**
 * May this review be completed?
 *
 * The decision is mandatory. A review that reaches the end without one is the
 * free-text era again: everybody downstream left to infer the answer.
 */
export function canCompleteReview(input: ReviewCompletionInput): CompletionCheck {
  const problems: string[] = [];

  if (input.decision !== 'FIT' && input.decision !== 'NOT_FIT') {
    problems.push('Record whether the patient is fit for the proposed anaesthesia.');
  }

  if (!input.reviewerId) {
    problems.push('The reviewing anaesthetist must be identified.');
  }

  if (input.decision === 'NOT_FIT') {
    const reqs = input.requirements ?? [];
    if (reqs.length === 0) {
      // "Not fit" with nothing to do is a dead end. Somebody has to know what
      // would change the answer, or the case simply stalls with no owner.
      problems.push('Say what must be addressed before this patient can proceed — at least one requirement.');
    }
    reqs.forEach((r, i) => {
      if (!r.category) {
        problems.push(`Requirement ${i + 1}: choose what kind of requirement this is.`);
      }
      if ((r.action ?? '').trim().length < MIN_ACTION_LENGTH) {
        problems.push(`Requirement ${i + 1}: state precisely what must be done. A category on its own is not an instruction.`);
      }
    });
  }

  return { ok: problems.length === 0, problems };
}

/** An item still to be done. VERIFIED is the only settled state. */
export function isOutstanding(r: OptimisationRequirement): boolean {
  return (r.status ?? 'OUTSTANDING') !== 'VERIFIED';
}

export function outstandingRequirements(rs: OptimisationRequirement[]): OptimisationRequirement[] {
  return rs.filter(isOutstanding);
}

export interface FitnessState {
  decision: FitnessDecision | null | undefined;
  requirements?: OptimisationRequirement[] | null;
  /**
   * Set when an anaesthetist has reassessed after the requirements were
   * addressed. Without it, completing every task changes nothing.
   */
  reassessedAt?: Date | string | null;
}

/**
 * May this case be marked ready for theatre?
 *
 * §19's rule, and the reason this module is not just a form validator. A case
 * whose patient is declared unfit must not reach READY however complete the
 * rest of the record looks.
 */
export function blocksReadyForTheatre(state: FitnessState): string | null {
  if (state.decision === 'NOT_FIT') {
    const outstanding = outstandingRequirements(state.requirements ?? []);
    return outstanding.length > 0
      ? `Patient is not fit for the proposed anaesthesia. ${outstanding.length} requirement${outstanding.length === 1 ? '' : 's'} outstanding.`
      : 'Patient is not fit for the proposed anaesthesia. The requirements are addressed; an anaesthetist must reassess before the case can proceed.';
  }
  if (!state.decision) {
    return 'Fitness for the proposed anaesthesia has not been recorded.';
  }
  return null;
}

/**
 * May the NOT FIT flag be lifted?
 *
 * Only by an anaesthetist, and only as a reassessment. Deliberately does NOT
 * check that every requirement is verified: an anaesthetist may reasonably
 * decide a patient is fit despite an outstanding item, or that a requirement
 * has become irrelevant. What is refused is the flag lifting ITSELF — by a
 * task being ticked, by a clerk, or by the passage of time.
 */
export function canDeclareFit(by: { role?: string | null } | null | undefined): boolean {
  const role = (by?.role ?? '').toUpperCase();
  return role === 'ANAESTHETIST' || role === 'CONSULTANT_ANAESTHETIST';
}

/** One line for a board: where this patient's fitness stands. */
export function fitnessLabel(state: FitnessState): string {
  if (state.decision === 'FIT') return 'FIT FOR PROPOSED ANAESTHESIA';
  if (state.decision !== 'NOT_FIT') return 'NOT YET REVIEWED';
  const outstanding = outstandingRequirements(state.requirements ?? []).length;
  return outstanding > 0
    ? `NOT FIT — ${outstanding} REQUIREMENT${outstanding === 1 ? '' : 'S'} OUTSTANDING`
    : 'NOT FIT — AWAITING REASSESSMENT';
}
