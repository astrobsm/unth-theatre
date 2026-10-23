// ============================================================
// Whose case is this?
// ------------------------------------------------------------
// The alert panel was showing every case in the hospital to every member of
// staff. A porter saw the paediatric surgery list; a laundry supervisor saw a
// laminectomy running late. Twenty-three items, none of them theirs.
//
// THAT IS WORSE THAN SHOWING NOTHING. An alert list that is mostly other
// people's cases trains everyone to ignore it, and then the one alert that
// was genuinely theirs is ignored too. The cost of the noise is paid by the
// signal.
//
// So: a case concerns you if you are named on it, or if your job is to watch
// all of them. There is no middle setting, because a half-filtered list is
// still a list nobody reads.
// ============================================================

/**
 * Roles whose work IS the whole list, so filtering would break their job
 * rather than help it.
 *
 * Deliberately short. Every role added here gets the twenty-three-item panel
 * back, so the test for inclusion is "does this person's work require seeing
 * cases they are not on" — true of the theatre manager running the board,
 * false of a head of department who only thinks they want it.
 */
export const OVERSIGHT_ROLES = [
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
  'BOOKING_OFFICER',
] as const;

export type OversightRole = (typeof OVERSIGHT_ROLES)[number];

export const hasOversight = (role: string | null | undefined): boolean =>
  !!role && (OVERSIGHT_ROLES as readonly string[]).includes(role);

export interface Viewer {
  id: string;
  role?: string | null;
  /** User.department — used to include the rest of one's own unit's list. */
  department?: string | null;
}

/**
 * A Prisma `where` fragment selecting the cases this person is named on.
 *
 * Returns `null` for oversight roles, meaning "do not narrow" — the caller
 * spreads it, so null must be handled as the absence of a filter rather than
 * as a filter matching nothing. Getting that backwards would show the theatre
 * manager an empty board, which is the kind of bug that gets noticed at 7am.
 */
export function relevantCaseFilter(viewer: Viewer): Record<string, unknown> | null {
  if (hasOversight(viewer.role)) return null;

  const named: Record<string, unknown>[] = [
    { surgeonId: viewer.id },
    { assistantSurgeonId: viewer.id },
    { anesthetistId: viewer.id },
    { scrubNurseId: viewer.id },
    { theatreTechnicianId: viewer.id },
    // The registrars, house officers, porters and technicians added at
    // booking live here rather than in a column of their own.
    { teamMembers: { some: { userId: viewer.id } } },
  ];

  // Your unit's list is your business even on a case you are not personally
  // named on: a registrar covering the unit needs to know its theatre is
  // running late. Only applied when the department is actually recorded —
  // an empty string would match every case with a blank unit.
  const dept = viewer.department?.trim();
  if (dept) named.push({ unit: dept });

  return { OR: named };
}

/**
 * Merge the relevance filter into an existing `where`.
 *
 * Uses AND rather than spreading, because the caller's own clause may already
 * contain an OR — and a second OR key would silently replace the first,
 * widening the query instead of narrowing it. That failure mode shows MORE
 * cases, not fewer, so it would look exactly like the bug this file fixes.
 */
export function withRelevance<T extends Record<string, unknown>>(
  where: T,
  viewer: Viewer,
): Record<string, unknown> {
  const filter = relevantCaseFilter(viewer);
  if (!filter) return where;
  return { AND: [where, filter] };
}
