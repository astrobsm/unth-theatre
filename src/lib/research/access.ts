// ============================================================
// Reaching into a case's records without assuming any of them exist
// ------------------------------------------------------------
// MOST CASES ARE MISSING MOST OF THIS. A cancelled case has nothing after the
// booking. A case done last year predates the operation-note module entirely.
// A case still on the list has no recovery record because it has not happened
// yet. Every accessor here therefore returns null rather than throwing, and
// every variable built on them is null-by-default.
//
// WHERE A CASE HAS SEVERAL OF SOMETHING, THE CHOICE IS STATED AND IS NOT
// "the first row Prisma happened to return". A case can carry three WHO
// checklists because the form was opened twice and abandoned once; it can
// carry an unsigned draft operation note beside a signed one. Picking wrongly
// does not fail loudly — it silently reports the draft, and the audit then
// disagrees with the folder.
// ============================================================

import type { RawCase } from './types';

/** A nested relation, or null. Never throws on a missing include. */
export function rec(c: RawCase, key: string): RawCase | null {
  const v = c?.[key];
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as RawCase) : null;
}

/** A nested list, or an empty array. */
export function list(c: RawCase, key: string): RawCase[] {
  const v = c?.[key];
  return Array.isArray(v) ? (v as RawCase[]) : [];
}

/** A field on a nested relation, or null. */
export function at(c: RawCase, relation: string, field: string): unknown {
  const r = rec(c, relation);
  return r ? r[field] : null;
}

const time = (v: unknown): number => {
  if (!v) return 0;
  const t = new Date(v as never).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/**
 * The WHO checklist that counts: the one that was COMPLETED, most recent
 * first; failing that, the most recently updated row.
 *
 * A case can carry several because the form was opened and abandoned. An
 * abandoned draft has every box unticked, so taking the first row would
 * report a team that completed the checklist as having skipped it — and the
 * compliance figure would be worst for the theatres that use the form most.
 */
export function whoChecklist(c: RawCase): RawCase | null {
  const rows = list(c, 'whoChecklists');
  if (rows.length === 0) return null;
  const completed = rows.filter((r) => r.checklistCompletedAt);
  const pool = completed.length > 0 ? completed : rows;
  return pool.slice().sort((a, b) =>
    time(b.checklistCompletedAt ?? b.updatedAt) - time(a.checklistCompletedAt ?? a.updatedAt))[0] ?? null;
}

/**
 * The operation note that counts: SIGNED, most recent first.
 *
 * An unsigned note is a draft. The banner on the research page says these
 * figures are "counted from signed operation notes", and that promise is kept
 * here or nowhere.
 */
export function operationNote(c: RawCase): RawCase | null {
  const rows = list(c, 'postOpNotes');
  if (rows.length === 0) return null;
  const signed = rows.filter((r) => r.signedAt);
  if (signed.length === 0) return null;
  return signed.slice().sort((a, b) => time(b.signedAt) - time(a.signedAt))[0] ?? null;
}

/** Whether a draft note exists but was never signed. A finding of its own. */
export function unsignedNoteOnly(c: RawCase): boolean | null {
  const rows = list(c, 'postOpNotes');
  if (rows.length === 0) return null;
  return !rows.some((r) => r.signedAt);
}

/**
 * The pre-operative anaesthetic review that counts: the APPROVED one, else
 * the most recent.
 *
 * A review that was rejected and repeated is two rows describing the same
 * patient at two levels of fitness, and the one that governed the operation
 * is the one that was approved.
 */
export function preOpReview(c: RawCase): RawCase | null {
  const rows = list(c, 'preOpReviews');
  if (rows.length === 0) return null;
  const approved = rows.filter((r) => String(r.status ?? '') === 'APPROVED');
  const pool = approved.length > 0 ? approved : rows;
  return pool.slice().sort((a, b) => time(b.reviewDate ?? b.createdAt) - time(a.reviewDate ?? a.createdAt))[0] ?? null;
}

/** Every blood request raised for the case, newest first. */
export function bloodRequests(c: RawCase): RawCase[] {
  return list(c, 'bloodRequests').slice()
    .sort((a, b) => time(b.requestedAt) - time(a.requestedAt));
}

/** A movement timestamp for one phase of the journey, or null. */
export function movementAt(c: RawCase, phase: string): Date | null {
  const rows = list(c, 'movements').filter((m) => String(m.phase ?? '') === phase);
  if (rows.length === 0) return null;
  // The EARLIEST of a repeated phase: a patient logged into theatre twice was
  // in theatre from the first entry, and the later row is a correction.
  const first = rows.slice().sort((a, b) => time(a.timestamp) - time(b.timestamp))[0];
  const t = first?.timestamp;
  return t ? new Date(t as never) : null;
}

/**
 * The preoperative fitness assessment, which hangs off the PATIENT and not
 * the case.
 *
 * The most recent one is used. A patient who has had three operations has
 * three assessments, and the comorbidities recorded at the first of them are
 * not necessarily the ones they had at the third.
 */
export function fitnessAssessment(c: RawCase): RawCase | null {
  const p = rec(c, 'patient');
  if (!p) return null;
  const rows = list(p, 'fitnessAssessments');
  if (rows.length === 0) return null;
  return rows.slice().sort((a, b) =>
    time(b.assessmentDate ?? b.createdAt) - time(a.assessmentDate ?? a.createdAt))[0] ?? null;
}

/** Team members recorded against the case in one surgical role. */
export function teamIn(c: RawCase, role: string): RawCase[] {
  return list(c, 'teamMembers').filter((m) => String(m.role ?? '') === role);
}
