// ============================================================
// Amending a prescription without destroying the one before it
// ------------------------------------------------------------
// There was no way to amend a prescription at all. It could be created,
// approved, packed and tracked through to reconciliation, but never changed —
// so a dose that needed correcting was corrected by writing a second
// prescription that looked unrelated to the first, or on paper.
//
// The rule this module exists to hold: AN AMENDMENT IS A NEW ROW. The previous
// prescription is never edited in place. It is marked superseded, it keeps its
// medications exactly as they were prescribed, and it keeps pointing at what
// replaced it. Pharmacy can always answer "what was I asked for, and by whom,
// at the moment I packed this" — which is the question an incident review asks
// and the one an overwritten row cannot answer.
//
// The second rule, which matters more clinically: AN AMENDMENT NEVER INHERITS
// APPROVAL. A consultant approved a specific set of drugs and doses. Carrying
// that approval onto a changed set would attribute to them a decision they did
// not make, and it is exactly the change nobody would notice.
// ============================================================

/** Statuses from the existing workflow that this module reasons about. */
export type PrescriptionStatusValue =
  | 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'
  | 'DISPENSED' | 'PACKED' | 'PARTIALLY_PACKED' | 'LATE_ARRIVAL'
  | 'COLLECTED' | 'IN_USE' | 'RECONCILED' | 'RETURNED' | 'QUERY_ISSUED'
  | 'CANCELLED' | 'SUPERSEDED';

/**
 * Settled. Nothing further happens to these, so an amendment would be a new
 * prescription rather than a new version of this one.
 *
 * SUPERSEDED is here because amending a row that has already been replaced
 * would fork the chain, leaving two live versions and no way to say which is
 * current — amend the current one instead.
 */
export const TERMINAL_STATUSES: PrescriptionStatusValue[] = [
  'REJECTED', 'CANCELLED', 'SUPERSEDED', 'RECONCILED', 'RETURNED',
];

/**
 * The drugs have physically left the pharmacy.
 *
 * An amendment here is still legitimate — a plan changes mid-list — but it is
 * no longer only a paperwork change, and somebody has to be told rather than
 * discovering it from a status badge.
 */
export const ISSUED_STATUSES: PrescriptionStatusValue[] = [
  'DISPENSED', 'COLLECTED', 'IN_USE',
];

/** The shortest amendment reason worth recording. */
export const MIN_AMENDMENT_REASON = 12;

export interface AmendmentRequest {
  currentStatus: PrescriptionStatusValue | string;
  reason: string;
  /** Who is amending. Taken from the session, never the body. */
  byId?: string | null;
  byRole?: string | null;
}

export interface AmendmentCheck {
  ok: boolean;
  problem: string | null;
  /**
   * True when the medications are already out of the pharmacy, so the
   * amendment has to be actively communicated rather than merely recorded.
   */
  requiresPharmacyNotice: boolean;
}

/** Only the prescriber's own service may amend a prescription. */
export function canAmend(role: string | null | undefined): boolean {
  const r = (role ?? '').toUpperCase();
  return r === 'ANAESTHETIST' || r === 'CONSULTANT_ANAESTHETIST';
}

export function checkAmendment(req: AmendmentRequest): AmendmentCheck {
  const status = String(req.currentStatus ?? '').toUpperCase() as PrescriptionStatusValue;
  const issued = ISSUED_STATUSES.includes(status);

  if (TERMINAL_STATUSES.includes(status)) {
    return {
      ok: false,
      problem: status === 'SUPERSEDED'
        ? 'This prescription has already been replaced. Amend the current version instead.'
        : `A ${status.toLowerCase()} prescription cannot be amended. Write a new one.`,
      requiresPharmacyNotice: false,
    };
  }

  if (!canAmend(req.byRole)) {
    return {
      ok: false,
      problem: 'Only an anaesthetist may amend an anaesthetic prescription.',
      requiresPharmacyNotice: issued,
    };
  }

  if (!req.byId) {
    return { ok: false, problem: 'The amending clinician must be identified.', requiresPharmacyNotice: issued };
  }

  if ((req.reason ?? '').trim().length < MIN_AMENDMENT_REASON) {
    return {
      ok: false,
      problem: `Say why the prescription is being changed — at least ${MIN_AMENDMENT_REASON} characters. Pharmacy reads this before re-packing.`,
      requiresPharmacyNotice: issued,
    };
  }

  return { ok: true, problem: null, requiresPharmacyNotice: issued };
}

/**
 * The status an amended prescription starts life in.
 *
 * Never APPROVED. A consultant approved a particular set of drugs and doses,
 * and carrying that approval across to a changed set would record a decision
 * they never made. A prescription that had been approved therefore returns to
 * PENDING_APPROVAL; one that was still a draft stays a draft, because there is
 * nothing yet to re-approve.
 */
export function statusForAmendedVersion(previous: PrescriptionStatusValue | string): PrescriptionStatusValue {
  const status = String(previous ?? '').toUpperCase();
  return status === 'DRAFT' ? 'DRAFT' : 'PENDING_APPROVAL';
}

export interface VersionChainEntry {
  id: string;
  version: number;
  status: string;
  supersedesId?: string | null;
}

/**
 * The version that is actually in force.
 *
 * Highest version that has not been superseded. Defined by status rather than
 * by taking the largest number, so a chain that has been interrupted — a
 * cancelled amendment, say — still resolves to something true.
 */
export function currentVersion(chain: VersionChainEntry[]): VersionChainEntry | null {
  const live = chain.filter((p) => String(p.status).toUpperCase() !== 'SUPERSEDED');
  if (live.length === 0) return null;
  return live.reduce((a, b) => (b.version > a.version ? b : a));
}

/** One line for pharmacy: is this the current prescription, and if not, why. */
export function versionLabel(entry: VersionChainEntry, chainLength: number): string {
  if (String(entry.status).toUpperCase() === 'SUPERSEDED') {
    return `Version ${entry.version} — SUPERSEDED, no longer to be packed`;
  }
  return chainLength > 1
    ? `Version ${entry.version} of ${chainLength} — current`
    : 'Version 1 — current';
}
