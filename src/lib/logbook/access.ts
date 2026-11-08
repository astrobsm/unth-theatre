// ============================================================
// Who may generate whose log book
// ------------------------------------------------------------
// YOUR OWN, ALWAYS. A log book is the trainee's own record of their own work,
// and needing to ask an administrator for it every time is how a tool like
// this stops being used.
//
// SOMEBODY ELSE'S, only for the people who supervise training. A log book
// carries hospital numbers, so "look up a colleague's cases" is a patient-data
// question and not an HR one. Every generation for another person is audited
// with who asked and about whom.
// ============================================================

/** Roles that may generate a log book for somebody other than themselves. */
export const LOGBOOK_FOR_OTHERS_ROLES = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC',
  'HEAD_OF_SURGERY', 'HEAD_OF_ANAESTHESIA', 'HEAD_OF_OBSTETRICS_GYNAECOLOGY',
  'CONSULTANT_SURGEON', 'CONSULTANT_ANAESTHETIST',
] as const;

/** The disciplines a log book can be built for. */
export const LOGBOOK_SURGEON_ROLES = [
  'SURGEON', 'CONSULTANT_SURGEON', 'HOUSE_OFFICER',
  'HEAD_OF_SURGERY', 'HEAD_OF_OBSTETRICS_GYNAECOLOGY',
] as const;

export const LOGBOOK_ANAESTHETIST_ROLES = [
  'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'HEAD_OF_ANAESTHESIA',
] as const;

/**
 * YOUR OWN BOOK, AND ONLY YOUR OWN.
 *
 * Changed on 8 November 2026 on instruction: "for the log books a user can
 * only see his own cases." It previously allowed trainers and theatre
 * management to pull a trainee's book, which was convenient and was also a
 * route to a spreadsheet of hospital numbers from cases the puller had
 * nothing to do with. A supervisor who needs to see a trainee's book now asks
 * the trainee for it, which is how it works on paper and leaves the trainee
 * knowing it happened.
 *
 * LOGBOOK_FOR_OTHERS_ROLES is kept below, unused by this function, so the
 * decision is visible rather than looking like a list somebody forgot to
 * wire up. A test asserts it stays unused.
 */
export function mayGenerateFor(
  actorId: string | null | undefined,
  _actorRole: string | null | undefined,
  subjectId: string,
): boolean {
  return Boolean(actorId) && actorId === subjectId;
}
