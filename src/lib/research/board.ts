// ============================================================
// The Theatre Research Board, and what it decides
// ------------------------------------------------------------
// Asked for on 8 November:
//
//   "a user will only have access to cases that his name has appeared on;
//    when he wants to carry out expanded research on others where he was not
//    involved, he must obtain admin permission to proceed ... reviewed by the
//    theatre research board"
//
// THE DEFAULT IS THE POINT. Until now any signed-in clinician could read every
// case in the hospital through the research module, including the free-text
// diagnoses of patients they had never met. The default is now the cases their
// own name is on, and everything wider is a decision somebody made and can be
// asked about.
//
// TWELVE SEATS, FIVE OF WHICH DID NOT EXIST. Ethics committee chairman, head
// of maxillofacial, head of ENT, head of ophthalmology and head of operations
// had no role in the enum, so the board as named could not have been
// convened — an application would have arrived and sat with nobody able to
// open it. They are added with the migration, and each clinical head inherits
// its consultant role so the account can do its clinical job too.
//
// ANY ONE MEMBER MAY DECIDE, and the decision records who. A quorum rule
// sounds more rigorous and would in practice mean nothing is ever approved:
// twelve consultants do not sit down together inside twenty-four hours, and an
// approval that never comes is a study that does not happen. The control here
// is that the decision is named, scoped and expiring, not that it is
// collective.
// ============================================================

/** The twelve seats, as named on 8 November 2026. */
export const RESEARCH_BOARD_ROLES = [
  'THEATRE_CHAIRMAN',
  'ETHICS_COMMITTEE_CHAIRMAN',
  'THEATRE_MANAGER',
  'HEAD_OF_SURGERY',
  'HEAD_OF_ANAESTHESIA',
  'HEAD_OF_MAXILLOFACIAL',
  'HEAD_OF_ENT',
  'HEAD_OF_OBSTETRICS_GYNAECOLOGY',
  'HEAD_OF_OPHTHALMOLOGY',
  'CMAC',
  'HEAD_OF_OPERATIONS',
  'HEAD_OF_PHARMACY',
] as const;

/**
 * Who may also decide, beyond the named board.
 *
 * The system administrator and the chief medical director are not seats on
 * the board; they are here because somebody has to be able to act when the
 * board's own accounts are locked out, and because the CMD can already see
 * everything in this hospital by office.
 */
export const RESEARCH_BOARD_ALSO = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'CHIEF_MEDICAL_DIRECTOR', 'DC_MAC',
] as const;

const DECIDERS: ReadonlySet<string> = new Set<string>([
  ...RESEARCH_BOARD_ROLES, ...RESEARCH_BOARD_ALSO,
]);

/** Is this role one that may decide a research access application? */
export const isResearchBoard = (role: string | null | undefined): boolean =>
  !!role && DECIDERS.has(role);

/** How long the board undertook to take. Printed to the applicant. */
export const DECISION_HOURS = 24;

/**
 * How long a grant lasts when the board does not say otherwise.
 *
 * Ninety days. A standing grant outlives the study it was given for, and the
 * person who approved it has usually moved on by the time anybody notices it
 * is still open.
 */
export const DEFAULT_GRANT_DAYS = 90;

/** The purposes an application can declare. */
export const RESEARCH_PURPOSES = [
  'Clinical audit',
  'Dissertation or fellowship research',
  'Publication',
  'Quality improvement project',
  'Morbidity and mortality review',
  'Service planning',
] as const;
