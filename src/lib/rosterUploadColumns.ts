/**
 * The columns of a roster upload sheet — written by the template route, read
 * back by the upload modal.
 *
 * WHY BOTH SIDES LIVE HERE
 *
 * They were separate, and they had drifted. The template labels the
 * anaesthetists' assignment column "Surgical Specialty" (from subRoleLabel),
 * while the parser looked for a header containing 'sub', 'role', 'assign',
 * 'subspecial' or 'theatre'. "surgical specialty" contains none of them, so
 * find() returned -1 and EVERY subspecialty was silently dropped on upload —
 * the rows imported, the shift and the name were right, and the one field that
 * decides which cases an anaesthetist covers was blank. 124 published
 * anaesthetist rows have no assignment.
 *
 * Nothing announced this. The preview showed an empty Sub-role column, which
 * looks exactly like a sheet somebody had not filled in.
 *
 * So the header row is now GENERATED from the department by rosterTemplateHeaders
 * and RESOLVED by resolveColumns, which is given the same department's label.
 * A department can be renamed and both sides move together.
 */

import type { RosterDept } from './rosterDepartments';

/** The header row the .xlsx template writes for this department. */
export function rosterTemplateHeaders(dept: Pick<RosterDept, 'subRoleLabel' | 'seniorityLevels'>): string[] {
  return [
    'Name',
    'Date',
    'Shift',
    dept.subRoleLabel ?? 'Sub-role',
    // A department with no grades gets no column, rather than a column offering
    // it grades it does not have.
    ...(dept.seniorityLevels?.length ? ['Seniority'] : []),
    'Location',
    'Notes',
  ];
}

export interface ColumnIndex {
  name: number;
  date: number;
  shift: number;
  subRole: number;
  seniority: number;
  location: number;
  notes: number;
}

/**
 * Where each field sits when the pasted/uploaded sheet HAS a header row.
 *
 * -1 means "this sheet does not carry that field", which the caller reads as an
 * empty string. That is correct for Seniority on a department without grades,
 * and it is what used to happen WRONGLY to the assignment column.
 *
 * @param headerCells the first row, lowercased.
 * @param subRoleLabel what this department calls its assignment column, so the
 *   label the template actually wrote is matched exactly rather than guessed at.
 */
export function resolveColumns(headerCells: string[], subRoleLabel?: string): ColumnIndex {
  const cells = headerCells.map((c) => (c || '').trim().toLowerCase());
  const find = (...keys: string[]) => cells.findIndex((c) => keys.some((k) => c.includes(k)));

  // The department's own label first — an exact hit beats any keyword guess.
  const labelled = subRoleLabel ? cells.indexOf(subRoleLabel.trim().toLowerCase()) : -1;

  return {
    // Name/date/shift fall back to their conventional position: a sheet missing
    // one of those is unusable anyway, and column 0 gives the clearest error.
    name: Math.max(0, find('name', 'staff')),
    date: Math.max(0, find('date', 'day')),
    shift: Math.max(0, find('shift')),
    // 'specialt' and 'icu' are here so that a sheet saved before this fix, or
    // one somebody retyped by hand, still lands.
    subRole: labelled >= 0
      ? labelled
      : find('sub', 'role', 'assign', 'subspecial', 'specialt', 'theatre', 'icu'),
    seniority: find('senior', 'level', 'grade'),
    location: find('location', 'venue'),
    notes: find('note', 'remark'),
  };
}

/**
 * Where each field sits when the paste has NO header row at all.
 *
 * A technician sheet is six columns wide, not seven. Assuming Seniority at
 * index 4 would read Location as a grade and Notes as the location, silently,
 * on every row.
 */
export function positionalColumns(hasSeniority: boolean): ColumnIndex {
  return hasSeniority
    ? { name: 0, date: 1, shift: 2, subRole: 3, seniority: 4, location: 5, notes: 6 }
    : { name: 0, date: 1, shift: 2, subRole: 3, seniority: -1, location: 4, notes: 5 };
}
