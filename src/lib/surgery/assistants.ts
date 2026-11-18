// ============================================================
// More than one surgeon on a case
// ------------------------------------------------------------
// The booking form has an "Assistant(s)" picker that looks like it takes
// several — it has a search, an Add control and removable chips — and takes
// one. Choosing a second REPLACED the first, because Surgery.assistantSurgeonId
// is a single column, and the hint underneath told the booker to go and put
// the second one in the unit team instead.
//
// Most lists here are done by two or three surgeons. So the second and third
// were either not recorded at all, or recorded in a different section under a
// grade, with nothing saying they were operating. The unit card, the review
// watch and the audit summons all read the team, and all three were reading a
// case with one surgeon on it that had three.
//
// WHERE THEY GO. surgical_team_members — the table the unit team already uses,
// already written at booking, already read by buildCaseTeam(), and already in
// the OR clause that decides whose dashboard a case appears on
// (my-board, my-patients, dashboards/[desk], case-availability). A person
// recorded here is therefore on the case in every sense the rest of the system
// understands: they see it, they can answer "am I coming", and they are named
// on the board. A new table of our own would have had to be taught to all four
// of those places, and the one it was not taught would be the one that matters
// on the morning.
//
// WHY assistantSurgeonId IS STILL WRITTEN. Thirty-odd places read it, from the
// theatre status board to the post-operative note. The first assistant stays
// there so none of them change, and the full list lives alongside it. The two
// never disagree: the first assistant is written to BOTH, and buildCaseTeam()
// keys on the person, so they appear once with both roles joined.
//
// WHAT IS NOT CLAIMED. These people are assisting, not supervising and not
// operating in their own right; the operating surgeon of record is still one
// person, because the consent form, the deposit and the theatre list each name
// one and making that a list would be a far larger change than the one asked
// for.
// ============================================================

/** The grades surgical_team_members recognises. */
export const TEAM_GRADES = ['CONSULTANT', 'SENIOR_REGISTRAR', 'REGISTRAR', 'HOUSE_OFFICER'] as const;
export type TeamGrade = (typeof TEAM_GRADES)[number];

export function isTeamGrade(value: unknown): value is TeamGrade {
  return typeof value === 'string' && (TEAM_GRADES as readonly string[]).includes(value);
}

/**
 * What is written against an assisting surgeon so they can be told apart from
 * the rest of the unit team.
 *
 * In words rather than a code, because it is displayed as it stands and
 * because surgical_team_members.specialNotes is free text that people also
 * write in by hand. A code would have needed a migration to a column nobody
 * else reads.
 */
export const ASSISTING_NOTE = 'Assisting';

export function isAssisting(note: string | null | undefined): boolean {
  return (note ?? '').trim().toLowerCase().startsWith(ASSISTING_NOTE.toLowerCase());
}

/**
 * The grade to offer for somebody picked out of the assistant pool.
 *
 * A GUESS, AND OFFERED AS ONE. There is no REGISTRAR or SENIOR_REGISTRAR
 * account role in this system: 194 accounts are plain SURGEON, which covers
 * registrars and senior registrars alike. So SURGEON defaults to REGISTRAR —
 * the commoner of the two — and the booker can change it on the chip. A grade
 * invented silently and never shown would be worse than no grade: it would be
 * printed on the operation note as fact.
 */
export function gradeForAccountRole(accountRole: string | null | undefined): TeamGrade {
  const r = (accountRole ?? '').toUpperCase();
  if (r.includes('CONSULTANT')) return 'CONSULTANT';
  if (r === 'HOUSE_OFFICER') return 'HOUSE_OFFICER';
  if (r.includes('SENIOR_REGISTRAR')) return 'SENIOR_REGISTRAR';
  return 'REGISTRAR';
}

export interface ChosenAssistant {
  /** The account, when they have one. Null for a visiting surgeon. */
  userId?: string | null;
  name: string;
  grade: TeamGrade;
}

export interface TeamMemberPayload {
  name: string;
  role: TeamGrade;
  userId?: string | null;
  /** Carried through from the unit-team picker, which records it. */
  staffCode?: string | null;
  specialNotes?: string | null;
}

/**
 * The assistants, as rows for surgical_team_members.
 *
 * Anyone without a name is dropped rather than stored as a blank: an unnamed
 * person on a team list is a line somebody has to chase on the morning.
 */
export function assistantsAsTeamMembers(assistants: ChosenAssistant[]): TeamMemberPayload[] {
  return assistants
    .filter((a) => (a.name ?? '').trim() !== '')
    .map((a) => ({
      name: a.name.trim(),
      role: isTeamGrade(a.grade) ? a.grade : 'REGISTRAR',
      userId: a.userId || null,
      specialNotes: ASSISTING_NOTE,
    }));
}

/**
 * The unit team and the assistants as one list, with nobody on it twice.
 *
 * A registrar who is in the unit team AND assisting is one person who will
 * either scrub or not. The ASSISTING entry wins, because it says what they are
 * doing on this case rather than merely which unit they belong to — and
 * because the unique thing the booker just did was name them as an assistant.
 *
 * Deduplicated on the account id, and on the trimmed lower-cased name for the
 * people who have no account. Two different visiting surgeons who genuinely
 * share a name is a problem this cannot solve and should not pretend to; one
 * line is still better than the same name twice with nothing to tell them
 * apart.
 */
export function mergeTeamMembers(
  unitTeam: TeamMemberPayload[],
  assistants: TeamMemberPayload[],
): TeamMemberPayload[] {
  const out: TeamMemberPayload[] = [];
  const seen = new Set<string>();
  const key = (m: TeamMemberPayload) =>
    m.userId ? `id:${m.userId}` : `name:${m.name.trim().toLowerCase()}`;

  // Assistants first, so that when the same person is in both lists it is the
  // assisting entry that survives.
  for (const m of [...assistants, ...unitTeam]) {
    if (!(m.name ?? '').trim()) continue;
    const k = key(m);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
}

/**
 * Which assistant goes in Surgery.assistantSurgeonId.
 *
 * The first one with an account. A visiting surgeon has no id to put there,
 * and skipping past them to somebody who does is better than leaving the
 * column null while an assistant with an account is on the case — the column
 * is what puts a case on that person's own dashboard.
 */
export function primaryAssistantId(assistants: ChosenAssistant[]): string | null {
  for (const a of assistants) {
    if (a.userId) return a.userId;
  }
  return null;
}

/**
 * "Registrar (assisting)", for a team list that has to say which is which.
 *
 * Takes the label ALREADY IN WORDS rather than the raw grade, because the two
 * team lists in this codebase word their roles differently on purpose — one
 * says "Circulating nurse" and the other "Circulating Nurse" — and a helper
 * that imposed its own casing would have quietly restyled every row in both
 * to add a suffix to one.
 */
export function withAssistingNote(
  label: string | null | undefined,
  specialNotes: string | null | undefined,
): string {
  const base = (label ?? '').trim() || 'Team member';
  return isAssisting(specialNotes) ? `${base} (assisting)` : base;
}
