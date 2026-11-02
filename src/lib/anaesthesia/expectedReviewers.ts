// ============================================================
// Who is expected to do a pre-operative anaesthetic review
// ------------------------------------------------------------
// THE REGISTRAR AND THE SENIOR REGISTRAR, not the consultant.
//
// Tomorrow's Reviews used to name whoever was on the booking. The booking
// route fills that in with the consultant covering the specialty, so the
// board asked the consultant for the review, showed his name against it, and
// then recorded HIM as having missed the 9pm deadline for work that was never
// his to do. The grades do different jobs: the registrar and senior registrar
// assess the patient, and the consultant approves what they write.
//
// Pure, so the rule can be proved. The caller supplies the day's teams; this
// decides which of them are expected and says honestly how it arrived at the
// answer -- which is the whole point of that board. A name shown because the
// roster says so, and the same name shown because there was no roster and
// something fell back, look identical on every other screen in this system
// and are completely different facts.
// ============================================================

import type { AnaesthetistContact, AnaesthetistTeam } from '@/lib/anaesthetistTeam';

export type ReviewerGrade = 'SENIOR_REGISTRAR' | 'REGISTRAR' | 'CONSULTANT' | 'UNKNOWN';

export interface ExpectedReviewer extends AnaesthetistContact {
  grade: ReviewerGrade;
}

export type ReviewerSource =
  /** Registrar and/or senior registrar rostered to this specialty. The good case. */
  | 'registrars'
  /** Nobody of either grade was rostered; the consultant covering it is asked instead. */
  | 'consultant-only'
  /** No roster for this specialty at all; falling back to the name on the booking. */
  | 'named-on-case'
  /** Nobody anywhere. */
  | 'none';

/** What a board should print beside the names. */
export const REVIEWER_SOURCE_LABEL: Record<ReviewerSource, string> = {
  registrars: 'Rostered to this specialty',
  'consultant-only': 'No registrar rostered — consultant asked',
  'named-on-case': 'Not on the roster — name taken from the booking',
  none: 'Nobody rostered to review this',
};

const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();

function graded(c: AnaesthetistContact, grade: ReviewerGrade): ExpectedReviewer {
  return { ...c, grade };
}

/**
 * The people expected to review one case.
 *
 * @param subspecialty the case's specialty, as the roster spells it.
 * @param teams every specialty's team for the day, from getAnaesthetistTeamsForDate.
 * @param namedOnCase the anaesthetist on the booking. Used only as a last resort,
 *   and the source says so when it is.
 */
export function expectedReviewersFor(args: {
  subspecialty: string | null | undefined;
  teams: { bySubspecialty: Map<string, AnaesthetistTeam>; onCall: AnaesthetistTeam };
  namedOnCase?: AnaesthetistContact | null;
}): { reviewers: ExpectedReviewer[]; source: ReviewerSource } {
  const { teams, namedOnCase } = args;
  const team = teams.bySubspecialty.get(norm(args.subspecialty));

  const registrars: ExpectedReviewer[] = [];
  if (team?.seniorRegistrar) registrars.push(graded(team.seniorRegistrar, 'SENIOR_REGISTRAR'));
  if (team?.registrar) registrars.push(graded(team.registrar, 'REGISTRAR'));

  // Both grades when both are rostered. A list is shared between them and
  // either may do any given case, so naming only one would make the other
  // invisible on a board whose job is to show who is accountable.
  if (registrars.length) return { reviewers: registrars, source: 'registrars' };

  // A specialty covered by a consultant alone is a real arrangement, not an
  // error -- but it is worth saying out loud, because it means a consultant
  // is carrying assessments as well as his own work.
  if (team?.consultant) {
    return { reviewers: [graded(team.consultant, 'CONSULTANT')], source: 'consultant-only' };
  }

  // Nothing rostered for this specialty. The name on the booking is better
  // than "nobody" -- somebody has to be asked, and that person at least has
  // the case -- but the board must not present it as a rostered assignment.
  // This is the hole-that-hides-itself case the whole screen exists to show.
  if (namedOnCase) {
    return { reviewers: [graded(namedOnCase, 'UNKNOWN')], source: 'named-on-case' };
  }

  return { reviewers: [], source: 'none' };
}

/** "Senior registrar", for printing beside a name. */
export const GRADE_LABEL: Record<ReviewerGrade, string> = {
  SENIOR_REGISTRAR: 'Senior registrar',
  REGISTRAR: 'Registrar',
  CONSULTANT: 'Consultant',
  UNKNOWN: '',
};
