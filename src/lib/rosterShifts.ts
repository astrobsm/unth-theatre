/**
 * Reading a shift out of an uploaded roster sheet.
 *
 * WHY THIS IS ITS OWN FILE
 *
 * There were two copies of this — one in the bulk-upload API route, one in the
 * upload modal that drives the preview — with a comment on the second reading
 * "keep in step with normShift() in api/roster/departments/[dept]/bulk". A
 * comment is not a mechanism. The preview and the server would have disagreed
 * about which rows are valid, and the preview is the only thing the person
 * uploading ever sees.
 *
 * DELIBERATELY LENIENT. A department renames its shifts (the anaesthetists call
 * MORNING "ELECTIVES"; the anaesthetic technicians call CALL "DAY CALL"), people
 * type "AM", and a sheet may have been filled in from last year's wording. All
 * of it should land rather than be rejected, because the alternative is the rota
 * going back onto paper.
 *
 * The stored values remain the three DutyShift values. Only the wording varies —
 * see shiftOptions in @/lib/rosterDepartments.
 */

export type DutyShift = 'MORNING' | 'CALL' | 'NIGHT';

/** Fold separators to single spaces so "CALL/EMERGENCIES" and "call_emergencies" agree. */
const canon = (raw: string) => (raw || '').trim().toUpperCase().replace(/[_\s\-/]+/g, ' ').trim();

const MORNING = ['MORNING', 'AM', 'DAY', 'M', 'EARLY', 'MORN', 'ELECTIVE', 'ELECTIVES'];

// NIGHT IS MATCHED BEFORE CALL, and the order is load-bearing. The technicians'
// label "NIGHT CALL/EMERGENCIES" canonicalises to a string containing CALL, so
// matching CALL first would put the night technician on the day shift — and
// /api/roster/technician-coverage picks who is called for a 2 a.m. emergency by
// exactly that field. Matching is on the WHOLE token, not a substring, so the
// two lists cannot overlap by accident; the ordering is belt and braces.
const NIGHT = ['NIGHT', 'PM', 'N', 'LATE', 'NIGHT CALL', 'NIGHT CALL EMERGENCY', 'NIGHT CALL EMERGENCIES'];

const CALL = [
  'CALL', 'ON CALL', 'ONCALL', 'C', 'EMERGENCY', 'EMERGENCIES',
  'CALL EMERGENCY', 'CALL EMERGENCIES',
  'DAY CALL', 'DAY CALL EMERGENCY', 'DAY CALL EMERGENCIES',
];

export function normaliseShift(raw: string): DutyShift | null {
  const t = canon(raw);
  if (MORNING.includes(t)) return 'MORNING';
  if (NIGHT.includes(t)) return 'NIGHT';
  if (CALL.includes(t)) return 'CALL';
  return null;
}
