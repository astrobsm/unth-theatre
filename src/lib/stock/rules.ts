// ============================================================
// Stock rules — what may be reserved, issued, returned and consumed
// ------------------------------------------------------------
// These are the refusals that keep a theatre safe: no expired stock on a
// trolley, no controlled drug leaving a safe without a witness, no elective
// case quietly eating the emergency store.
//
// They live here as pure functions rather than inside route handlers for the
// same reason the imprest rules do — the server must enforce them and the UI
// must show them before an officer wastes effort, and one definition serving
// two callers is the only way those two stay in step.
// ============================================================

import { available, BatchQuantities, onHand } from './quantities';

export interface RuleResult {
  allowed: boolean;
  /** Machine-readable so the UI can react; the message is what a person reads. */
  code?: string;
  message?: string;
}

const ok: RuleResult = { allowed: true };
const deny = (code: string, message: string): RuleResult => ({ allowed: false, code, message });

export type BatchStatus =
  | 'AVAILABLE'
  | 'RESERVED'
  | 'ISSUED'
  | 'RETURNED'
  | 'QUARANTINED'
  | 'EXPIRED'
  | 'DISPOSED'
  | 'LOST';

/** The shape the rules need. Structural, so a Prisma row satisfies it as-is. */
export interface BatchForRules extends BatchQuantities {
  id: string;
  batchNumber: string;
  status: BatchStatus | string;
  expiryDate?: Date | string | null;
}

export interface LocationForRules {
  name: string;
  isControlled?: boolean;
  isEmergency?: boolean;
  isConsignment?: boolean;
}

// ---------------------------------------------------------------------------
// Expiry
// ---------------------------------------------------------------------------

/**
 * Expired as at `asOf`. A batch expiring today is NOT yet expired — stock is
 * good through the whole of its expiry date, which is how the printed date on
 * a box is read at the bench.
 */
export function isExpired(expiryDate: Date | string | null | undefined, asOf: Date = new Date()): boolean {
  if (!expiryDate) return false;
  const expiry = new Date(expiryDate);
  const endOfExpiryDay = new Date(
    Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate(), 23, 59, 59, 999)
  );
  return asOf.getTime() > endOfExpiryDay.getTime();
}

/** Whole days until expiry. Negative once past. Null when no date is recorded. */
export function daysUntilExpiry(
  expiryDate: Date | string | null | undefined,
  asOf: Date = new Date()
): number | null {
  if (!expiryDate) return null;
  const expiry = new Date(expiryDate);
  const day = 86_400_000;
  const expiryMidnight = Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate());
  const asOfMidnight = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  return Math.round((expiryMidnight - asOfMidnight) / day);
}

/** Near enough to expiry to want using first, or pulling. */
export function expiresWithin(
  expiryDate: Date | string | null | undefined,
  days: number,
  asOf: Date = new Date()
): boolean {
  const left = daysUntilExpiry(expiryDate, asOf);
  return left !== null && left <= days;
}

// ---------------------------------------------------------------------------
// Reserving
// ---------------------------------------------------------------------------

/** Statuses from which stock can still be committed to a case. */
const RESERVABLE: string[] = ['AVAILABLE', 'RESERVED'];

export function canReserve(params: {
  batch: BatchForRules;
  quantity: number;
  location?: LocationForRules | null;
  /** True when the case is elective; the emergency store then needs authority. */
  isElective?: boolean;
  /** Set when someone has authorised drawing on the emergency store. */
  emergencyAuthorisedBy?: string | null;
  asOf?: Date;
}): RuleResult {
  const { batch, quantity, location, isElective = true, emergencyAuthorisedBy, asOf = new Date() } = params;

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return deny('INVALID_QUANTITY', 'The quantity must be a whole number greater than zero.');
  }

  if (!RESERVABLE.includes(batch.status)) {
    return deny(
      'BATCH_NOT_RESERVABLE',
      `Batch ${batch.batchNumber} is ${String(batch.status).toLowerCase()} and cannot be reserved.`
    );
  }

  if (isExpired(batch.expiryDate, asOf)) {
    return deny('BATCH_EXPIRED', `Batch ${batch.batchNumber} expired and cannot be used.`);
  }

  // The emergency store exists so that an emergency is never short. An elective
  // list drawing on it without authority is exactly how it comes up empty.
  if (location?.isEmergency && isElective && !emergencyAuthorisedBy) {
    return deny(
      'EMERGENCY_STOCK_NOT_AUTHORISED',
      `${location.name} is emergency stock. An elective case needs authorisation before drawing on it.`
    );
  }

  const free = available(batch);
  if (quantity > free) {
    return deny(
      'INSUFFICIENT_STOCK',
      `Only ${free} of batch ${batch.batchNumber} is available; ${quantity} was requested.`
    );
  }

  return ok;
}

// ---------------------------------------------------------------------------
// Issuing
// ---------------------------------------------------------------------------

export function canIssue(params: {
  batch: BatchForRules;
  quantity: number;
  /** How much this case still has reserved and not yet issued. */
  reservedForCase: number;
  location?: LocationForRules | null;
  witnessId?: string | null;
  asOf?: Date;
}): RuleResult {
  const { batch, quantity, reservedForCase, location, witnessId, asOf = new Date() } = params;

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return deny('INVALID_QUANTITY', 'The quantity must be a whole number greater than zero.');
  }

  if (isExpired(batch.expiryDate, asOf)) {
    return deny('BATCH_EXPIRED', `Batch ${batch.batchNumber} expired and must not be issued.`);
  }

  if (batch.status === 'QUARANTINED') {
    return deny('BATCH_QUARANTINED', `Batch ${batch.batchNumber} is quarantined and must not be issued.`);
  }

  // Controlled drugs leave the safe under two signatures, never one.
  if (location?.isControlled && !witnessId) {
    return deny(
      'WITNESS_REQUIRED',
      `${location.name} holds controlled drugs. A second officer must witness the issue.`
    );
  }

  if (quantity > reservedForCase) {
    return deny(
      'EXCEEDS_RESERVATION',
      `Only ${reservedForCase} is reserved for this case; ${quantity} was requested. Reserve more before issuing.`
    );
  }

  if (quantity > onHand(batch)) {
    return deny(
      'INSUFFICIENT_STOCK',
      `Batch ${batch.batchNumber} physically holds ${onHand(batch)}; ${quantity} cannot be issued.`
    );
  }

  return ok;
}

// ---------------------------------------------------------------------------
// Returning and consuming
// ---------------------------------------------------------------------------

/**
 * A return and a consumption both draw down what is outstanding with theatre.
 * Neither may exceed it: recording eight used against five issued is a data
 * error that would otherwise corrupt the reconciliation permanently.
 */
export function canAccountFor(params: {
  kind: 'RETURN' | 'CONSUME' | 'WASTE';
  quantity: number;
  /** issued − returned − used − damaged, for this case. */
  outstanding: number;
  location?: LocationForRules | null;
  witnessId?: string | null;
}): RuleResult {
  const { kind, quantity, outstanding, location, witnessId } = params;

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return deny('INVALID_QUANTITY', 'The quantity must be a whole number greater than zero.');
  }

  if (quantity > outstanding) {
    return deny(
      'EXCEEDS_OUTSTANDING',
      `Only ${outstanding} is outstanding against this case; ${quantity} cannot be recorded.`
    );
  }

  // Discarding a controlled drug is the moment most open to abuse, so it needs
  // the same second signature as taking it out of the safe.
  if (kind === 'WASTE' && location?.isControlled && !witnessId) {
    return deny(
      'WITNESS_REQUIRED',
      'Discarding a controlled drug must be witnessed by a second officer.'
    );
  }

  return ok;
}

/**
 * Consumption is what transfers ownership of consignment stock: up to that
 * moment the vendor owns it, afterwards the hospital has bought it and the
 * patient can be billed for it.
 */
export function transfersOwnershipOnConsumption(owner: string): boolean {
  return owner === 'VENDOR';
}
