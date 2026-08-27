// ============================================================
// Was this anaesthetist ROSTERED to the case, or merely the last resort?
// ------------------------------------------------------------
// On 27 August every one of the next day's fifteen elective cases showed the
// same anaesthetist. Nothing had gone wrong in the code: the anaesthetists'
// ELECTIVES roster for the 28th had not been published, so the booking route
// fell back to the day's on-call consultant — correct behaviour, and the only
// sensible answer to "who covers this if nobody is rostered".
//
// What went wrong is that the fallback was displayed exactly like an
// assignment. Fifteen cases across eight theatres read as "he is doing all of
// these", which is false, and worse: the list LOOKED covered, so nobody chased
// the missing roster. A gap that hides itself is the expensive kind.
//
// So the display needs to know how the name was arrived at. This classifies
// that from the published roster for the day, rather than from anyone's
// intention — the roster is the fact, and it is the thing that is missing.
// ============================================================

export type AnaesthetistAssignmentSource =
  /** Rostered to this case's own surgical specialty for the day. The good case. */
  | 'subspecialty'
  /** Nobody covered this specialty; this is the day's on-call cover standing in. */
  | 'on-call'
  /** Rostered that day, but to a different specialty's list. */
  | 'other-specialty'
  /** Named on the case but not on the day's roster at all — assigned by hand. */
  | 'unrostered'
  /** No anaesthetist on the case. */
  | 'none';

export interface RosterRow {
  userId: string;
  /** MORNING | CALL | NIGHT */
  shift: string;
  /** For anaesthetists this holds the surgical specialty covered. */
  subRole: string | null;
}

const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();

/**
 * Mirrors isOnCallRow in anaesthetistTeam and the coverage API: a CALL shift,
 * or an assignment that names itself as emergency / on-call cover. Both are
 * used in practice — the shift is the reliable half, the wording is how the
 * rosters actually read.
 */
export function isOnCallRow(row: RosterRow): boolean {
  return row.shift === 'CALL' || /all\s*emerg|on[\s-]*call/i.test(row.subRole || '');
}

/**
 * How did this case come to name this anaesthetist?
 *
 * Pure, so the rule can be proved rather than read. `rosterRows` is the day's
 * PUBLISHED anaesthetist roster — passing draft rows would answer a different
 * question, because a draft roster is somebody's work in progress.
 */
export function classifyAnaesthetistAssignment(args: {
  anaesthetistId: string | null | undefined;
  /** The case's surgical specialty, as spelled on the surgery. */
  subspecialty: string | null | undefined;
  rosterRows: readonly RosterRow[];
}): AnaesthetistAssignmentSource {
  const { anaesthetistId, subspecialty, rosterRows } = args;
  if (!anaesthetistId) return 'none';

  const mine = rosterRows.filter((r) => r.userId === anaesthetistId);
  if (mine.length === 0) return 'unrostered';

  const wanted = norm(subspecialty);

  // Covering this specialty beats everything else, and a person rostered to a
  // specialty on a CALL day is still covering it — so this is checked before
  // the on-call test, not after.
  if (wanted && mine.some((r) => !isOnCallRow(r) && norm(r.subRole) === wanted)) {
    return 'subspecialty';
  }

  if (mine.some(isOnCallRow)) return 'on-call';

  return 'other-specialty';
}

/**
 * What the list should say, or null when a plain name is the honest answer.
 *
 * Deliberately names the specialty that is uncovered. "On-call cover" alone
 * tells a coordinator something is odd; "nobody rostered for Cardiothoracic
 * Surgery" tells them what to go and fix.
 */
export function assignmentWarning(
  source: AnaesthetistAssignmentSource,
  subspecialty: string | null | undefined,
): string | null {
  const where = subspecialty ? ` for ${subspecialty}` : '';
  switch (source) {
    case 'on-call':
      return `On-call cover — no anaesthetist rostered${where}`;
    case 'other-specialty':
      return `Rostered elsewhere — not covering${where}`;
    case 'unrostered':
      return 'Not on the published roster for this day';
    default:
      return null;
  }
}
