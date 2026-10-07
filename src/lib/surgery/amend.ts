// ============================================================
// Correcting a booking after it has been marked done
// ============================================================
// A case scheduled for 8 October was marked COMPLETED on 7 October, the day
// before it was due. Once that happened nothing about it could be changed:
//
//     if (existingSurgery.status === 'COMPLETED' || ... 'CANCELLED') {
//       return { error: 'Cannot update a completed or cancelled surgery' }
//     }
//
// That rule is right and stays. A finished operation is a clinical record and
// casual editing of it is how a theatre log stops being evidence of anything.
// What it lacked was any way out of a mistake — and marking the wrong case
// complete is an ordinary slip on a list of near-identical rows.
//
// So this is a SEPARATE, DELIBERATE path rather than a loosening of that one.
// It differs in four ways, and each is the point:
//
//   It demands a reason, in words, and refuses without one.
//   It is restricted to the people who own the theatre list.
//   It writes an audit entry naming every field, before and after.
//   It never deletes anything; a correction is an addition to the record.
//
// The ordinary PUT stays exactly as strict as it was. Somebody correcting a
// mistake has to say they are doing it.
// ============================================================

/** The shortest reason worth recording. Anything less is a keystroke. */
export const MIN_REASON_LENGTH = 10;

/**
 * Roles that may amend a closed case.
 *
 * The people who answer for the theatre list, plus the administrators. A
 * surgeon correcting their own case is a reasonable future addition, but it
 * is a decision about accountability rather than a technical one, so the list
 * starts narrow.
 */
export const MAY_AMEND = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'CHIEF_MEDICAL_DIRECTOR',
];

export const SURGERY_STATUSES = [
  'SCHEDULED', 'IN_HOLDING_AREA', 'READY_FOR_THEATRE', 'IN_PROGRESS',
  'COMPLETED', 'CANCELLED',
] as const;
export type SurgeryStatusValue = (typeof SURGERY_STATUSES)[number];

/** Statuses that close a case and therefore lock the ordinary edit path. */
export const CLOSED_STATUSES: string[] = ['COMPLETED', 'CANCELLED'];

export interface AmendableFields {
  status?: string | null;
  theatreId?: string | null;
  /**
   * The operating surgeon.
   *
   * Amendable because it is got wrong in the same way everything else here
   * is: a list booked quickly, against the wrong name. Changing it is
   * consequential — it moves who is accountable for the case — which is an
   * argument for recording the change with a reason, not for forbidding it.
   */
  surgeonId?: string | null;
  anesthetistId?: string | null;
  scrubNurseId?: string | null;
  theatreTechnicianId?: string | null;
  assistantSurgeonId?: string | null;
}

/** The fields this path may touch. Anything else belongs to the ordinary PUT. */
export const AMENDABLE_KEYS: Array<keyof AmendableFields> = [
  'status', 'theatreId', 'surgeonId', 'anesthetistId', 'scrubNurseId',
  'theatreTechnicianId', 'assistantSurgeonId',
];

export interface AmendCheck {
  ok: boolean;
  error?: string;
  code?: string;
}

/**
 * May this amendment proceed, and does it actually say anything?
 *
 * Returns rather than throws so the caller can answer with a status code and
 * a sentence the person can act on.
 */
export function validateAmendment(input: {
  role: string | null | undefined;
  reason: string | null | undefined;
  changes: AmendableFields;
}): AmendCheck {
  if (!MAY_AMEND.includes((input.role ?? '').toUpperCase())) {
    return {
      ok: false, code: 'NO_ACCESS',
      error: 'Correcting a booking after it is closed is done by theatre management or an '
        + 'administrator.',
    };
  }

  const reason = (input.reason ?? '').trim();
  if (reason.length < MIN_REASON_LENGTH) {
    return {
      ok: false, code: 'REASON_REQUIRED',
      error: `Say why this is being changed, in at least ${MIN_REASON_LENGTH} characters. `
        + 'A correction with no reason is indistinguishable from an error, and whoever '
        + 'reads this record next cannot tell which it was.',
    };
  }

  if (input.changes.status != null
      && !SURGERY_STATUSES.includes(input.changes.status as SurgeryStatusValue)) {
    return { ok: false, code: 'BAD_STATUS', error: `"${input.changes.status}" is not a status.` };
  }

  const touched = AMENDABLE_KEYS.filter((k) => input.changes[k] !== undefined);
  if (!touched.length) {
    return { ok: false, code: 'NOTHING_TO_DO', error: 'Nothing was changed.' };
  }

  return { ok: true };
}

export interface FieldChange {
  field: string;
  from: string | null;
  to: string | null;
}

/**
 * What actually differs, for the audit entry.
 *
 * Only genuine differences. An amendment that re-submits the same anaesthetist
 * alongside a real status change should not record the anaesthetist as having
 * been altered — an audit trail padded with non-changes is one nobody reads,
 * and the real change hides among them.
 */
export function diffAmendment(
  before: Record<string, unknown>,
  changes: AmendableFields,
): FieldChange[] {
  const out: FieldChange[] = [];
  for (const key of AMENDABLE_KEYS) {
    const next = changes[key];
    if (next === undefined) continue;
    const prev = before[key] ?? null;
    const normalisedNext = next === '' ? null : next;
    if ((prev ?? null) === (normalisedNext ?? null)) continue;
    out.push({
      field: key,
      from: prev == null ? null : String(prev),
      to: normalisedNext == null ? null : String(normalisedNext),
    });
  }
  return out;
}

/**
 * Does this booking look like a repeat of that one?
 *
 * The same slip as the post-op prescriptions: a booking form submitted again
 * because the first attempt appeared to fail. One patient appeared twice on
 * the list for 8 October — same folder number, same procedure, same 08:30,
 * both booked at 12:55.
 *
 * Deliberately ADVISORY. It decides what the screen highlights, never what
 * the system does on its own. Two genuine operations on one patient on one day
 * happen — a staged procedure, a return to theatre — and a system that
 * cancelled one of them unasked would be far worse than one that shows a
 * duplicate nobody noticed. A person reads the flag and decides.
 */
export function looksDuplicated(
  a: { patientId: string; procedureName: string; scheduledDate: Date | string },
  b: { patientId: string; procedureName: string; scheduledDate: Date | string },
): boolean {
  if (a.patientId !== b.patientId) return false;

  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  if (norm(a.procedureName) !== norm(b.procedureName)) return false;

  // Same calendar day rather than same instant: a repeat submission can land
  // against a slightly different time if the form recalculated one.
  const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
  return day(a.scheduledDate) === day(b.scheduledDate);
}

/**
 * Is this amendment re-opening a case that had been closed?
 *
 * Worth knowing separately: it is the consequential kind, and the one the
 * audit entry should be findable by.
 */
export function isReopening(previousStatus: string, nextStatus: string | null | undefined): boolean {
  if (!nextStatus) return false;
  return CLOSED_STATUSES.includes(previousStatus) && !CLOSED_STATUSES.includes(nextStatus);
}

/**
 * Side effects of moving off COMPLETED.
 *
 * completedAt must not survive a case that is no longer complete. Left behind,
 * it would sit in the record saying the operation finished at a time it did
 * not, and every report counting completions by date would keep counting it.
 */
export function clearedTimestamps(
  previousStatus: string,
  nextStatus: string | null | undefined,
): Record<string, null> {
  if (nextStatus && previousStatus === 'COMPLETED' && nextStatus !== 'COMPLETED') {
    return { completedAt: null };
  }
  return {};
}
