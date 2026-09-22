// ============================================================
// Who was on duty when the request went in
// ------------------------------------------------------------
// A request raised at 02:00 against radiology or the laboratory used to name
// nobody. When it was not answered, establishing who should have answered it
// meant reconstructing a roster afterwards from memory — which is exactly the
// reconstruction a Panel of Inquiry has to do, weeks later, badly.
//
// So the roster is read AT THE MOMENT the request is made, and the answer is
// stored with it. A roster edited afterwards does not rewrite who was on when
// the theatre called.
//
// THE ANSWER MAY BE NOBODY, and that is the most important thing this can
// report. A request going to a department with an empty roster is not a failure
// of the person who did not answer it; it is a gap in the establishment, and
// it can only be argued about if somebody wrote it down at the time.
// ============================================================

/** The roster categories these departments are rostered under. */
export type DutyDepartment =
  | 'RADIOLOGISTS'
  | 'RADIOGRAPHERS'
  | 'LABORATORY_SCIENTISTS'
  | 'LABORATORY_TECHNICIANS'
  | 'BIOMEDICAL_ENGINEERS'
  | 'ELECTRICAL_TECHNICIANS';

export const DEPARTMENT_LABEL: Record<DutyDepartment, string> = {
  RADIOLOGISTS: 'Radiologists',
  RADIOGRAPHERS: 'Radiographers',
  LABORATORY_SCIENTISTS: 'Laboratory scientists',
  LABORATORY_TECHNICIANS: 'Laboratory technicians',
  BIOMEDICAL_ENGINEERS: 'Biomedical engineers',
  ELECTRICAL_TECHNICIANS: 'Electrical technicians',
};

/**
 * The roles each roster category is drawn from.
 *
 * Used to fall back to the staff register when the roster for a day is empty,
 * so a 02:00 request still reaches somebody. The fallback is recorded as a
 * fallback — see `rosteredOrFallback` — because "nobody was rostered, so we
 * told everyone who holds the role" is a different fact from "these three
 * people were on".
 */
export const DEPARTMENT_ROLES: Record<DutyDepartment, string[]> = {
  RADIOLOGISTS: ['RADIOLOGIST'],
  RADIOGRAPHERS: ['RADIOGRAPHER'],
  LABORATORY_SCIENTISTS: [
    'HAEMATOLOGY_SCIENTIST', 'CHEMICAL_PATHOLOGY_SCIENTIST', 'MICROBIOLOGY_SCIENTIST',
    'EMERGENCY_LAB_SCIENTIST', 'LABORATORY_STAFF',
  ],
  LABORATORY_TECHNICIANS: ['LABORATORY_TECHNICIAN'],
  BIOMEDICAL_ENGINEERS: ['BIOMEDICAL_ENGINEER', 'BIOMEDICAL_TECHNICIAN'],
  ELECTRICAL_TECHNICIANS: ['ELECTRICAL_TECHNICIAN', 'WORKS_SUPERVISOR', 'POWER_PLANT_OPERATOR'],
};

export type Shift = 'MORNING' | 'CALL' | 'NIGHT';

/**
 * Which shift a moment falls in.
 *
 * Morning runs 08:00 to 16:00, call 16:00 to 22:00, night 22:00 to 08:00 —
 * the three the roster already uses. A request at 02:00 belongs to the night
 * shift that began the previous evening, which is why the roster DATE is
 * returned with it and is not simply today's.
 */
export function shiftAt(when: Date, offsetMinutes = 60): { shift: Shift; rosterDate: Date } {
  const local = new Date(when.getTime() + offsetMinutes * 60_000);
  const hour = local.getUTCHours();

  const dayStart = (d: Date) =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

  if (hour >= 8 && hour < 16) return { shift: 'MORNING', rosterDate: dayStart(local) };
  if (hour >= 16 && hour < 22) return { shift: 'CALL', rosterDate: dayStart(local) };

  // Night. Before 08:00 it belongs to the night that started yesterday evening.
  if (hour < 8) {
    const yesterday = new Date(local.getTime() - 24 * 60 * 60_000);
    return { shift: 'NIGHT', rosterDate: dayStart(yesterday) };
  }
  return { shift: 'NIGHT', rosterDate: dayStart(local) };
}

export interface OnDutyPerson {
  userId: string;
  name: string;
  role?: string | null;
  phone?: string | null;
}

export interface DutyCaptureResult {
  department: DutyDepartment;
  shift: Shift;
  rosterDate: Date;
  staff: OnDutyPerson[];
  /**
   * True when nobody was rostered and the list is everybody holding the role.
   * Shown to the requester, because "we have told the six radiographers on the
   * register" is not the same as "the radiographer on call is Mr X".
   */
  fallback: boolean;
  /** Nobody rostered and nobody on the register either. */
  empty: boolean;
}

/**
 * Work out who to tell, from rows the caller has already loaded.
 *
 * Pure: the caller does the two queries and hands the results in. That keeps
 * the rule — rostered first, register only as a fallback, and say which —
 * testable without a database.
 */
export function resolveOnDuty(input: {
  department: DutyDepartment;
  at: Date;
  /** Roster rows for that department, date and shift. */
  rostered: OnDutyPerson[];
  /** Everybody holding one of the department's roles, for the fallback. */
  register: OnDutyPerson[];
  offsetMinutes?: number;
}): DutyCaptureResult {
  const { shift, rosterDate } = shiftAt(input.at, input.offsetMinutes ?? 60);

  const dedupe = (people: OnDutyPerson[]) => {
    const seen = new Set<string>();
    return people.filter((p) => {
      if (!p?.userId || seen.has(p.userId)) return false;
      seen.add(p.userId);
      return true;
    });
  };

  const rostered = dedupe(input.rostered);
  if (rostered.length) {
    return {
      department: input.department, shift, rosterDate,
      staff: rostered, fallback: false, empty: false,
    };
  }

  const register = dedupe(input.register);
  return {
    department: input.department, shift, rosterDate,
    staff: register,
    // Both flags are true when the register is empty as well: it fell back,
    // and the fallback found nobody.
    fallback: true,
    empty: register.length === 0,
  };
}

/**
 * The line the requester sees, and the line that goes into the record.
 *
 * Says plainly when nobody is rostered. The temptation is to write something
 * reassuring; a surgeon who is told "the request has been sent" and then waits
 * two hours for a department that had nobody on is worse served than one told
 * at the outset that nobody was rostered.
 */
export function describeOnDuty(result: DutyCaptureResult): string {
  const dept = DEPARTMENT_LABEL[result.department].toLowerCase();
  const shift = result.shift.toLowerCase();

  if (result.empty) {
    return `No ${dept} are rostered for the ${shift} shift, and none are on the staff register. `
      + 'This request has been recorded but there is nobody for it to reach — tell the head of '
      + 'department directly.';
  }

  const names = result.staff.map((p) => p.name).join(', ');

  if (result.fallback) {
    return `No ${dept} are rostered for the ${shift} shift, so all ${result.staff.length} on the `
      + `register have been notified: ${names}. Somebody should be rostered for this shift.`;
  }

  return result.staff.length === 1
    ? `On duty: ${names}.`
    : `On duty (${result.staff.length}): ${names}.`;
}
