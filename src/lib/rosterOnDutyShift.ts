/**
 * Which duty shift covers a given moment — and the fact that an EMERGENCY is
 * covered by a different shift from an elective list at the same hour.
 *
 * WHAT WAS WRONG
 *
 * The emergency board asked "who is on duty at 10:00?" and got the MORNING
 * roster, because 10:00 falls in the morning. For an elective list that is
 * right. For an emergency it is precisely wrong: MORNING is the ELECTIVE
 * roster — the anaesthetists' own shift options label it "ELECTIVES" — and the
 * people who answer an emergency are the ones rostered on CALL, carrying
 * "ALL EMERGENCIES (on-call)".
 *
 * So on 3 September the board showed a critical neurosurgical case an
 * Emergency Response Team of anaesthetists rostered to elective lists, while
 * the two consultants actually on call for emergencies that day appeared
 * nowhere on it. The team named on the card could not have been rung.
 *
 * The split is the same one /api/roster/technician-coverage already uses to
 * decide who answers an emergency: daytime goes to day call, and everything
 * else to night call.
 */

export type DutyShift = 'MORNING' | 'CALL' | 'NIGHT';

/** Daytime for on-call purposes: the day team is up, the night team is not. */
export const EMERGENCY_DAY_START_HOUR = 8;
export const EMERGENCY_DAY_END_HOUR = 18;

/**
 * The shift running a scheduled, elective list at this hour.
 *
 *   MORNING: 08:00 – 16:00
 *   CALL:    16:00 – 22:00
 *   NIGHT:   22:00 – 08:00 (wraps)
 *
 * Unchanged: every existing caller of the on-duty endpoint means this.
 */
export function electiveShiftFromDate(d: Date): DutyShift {
  const h = d.getHours();
  if (h >= 8 && h < 16) return 'MORNING';
  if (h >= 16 && h < 22) return 'CALL';
  return 'NIGHT';
}

/**
 * The shift that ANSWERS AN EMERGENCY at this hour.
 *
 * Never MORNING. Nobody on an elective list is the emergency team, whatever the
 * clock says — that is the whole bug. Daytime emergencies go to the day-call
 * team (stored as CALL), and everything outside those hours to the night team.
 */
export function emergencyShiftFromDate(d: Date): DutyShift {
  const h = d.getHours();
  const daytime = h >= EMERGENCY_DAY_START_HOUR && h < EMERGENCY_DAY_END_HOUR;
  return daytime ? 'CALL' : 'NIGHT';
}

/** The shift to look up, given what the caller is asking about. */
export function shiftForPurpose(d: Date, purpose: 'elective' | 'emergency'): DutyShift {
  return purpose === 'emergency' ? emergencyShiftFromDate(d) : electiveShiftFromDate(d);
}
