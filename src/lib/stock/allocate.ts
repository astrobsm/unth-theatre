// ============================================================
// FEFO allocation — which batches to draw from
// ------------------------------------------------------------
// First Expired, First Out. Not first-in-first-out: a box received last month
// may expire before one received last year, and stock that expires on a shelf
// is money the hospital has already spent and thrown away.
//
// The allocator is pure — it decides WHICH batches and HOW MUCH from each, and
// the caller performs the reservation. That separation is deliberate: the hard
// part is the choice, and a pure choice is one that can be tested exhaustively
// without a database.
// ============================================================

import { available } from './quantities';
import { BatchForRules, isExpired, LocationForRules } from './rules';

export interface AllocatableBatch extends BatchForRules {
  /** Where it sits, so emergency and consignment rules can be applied. */
  location?: LocationForRules | null;
  /** Kobo, captured onto the reservation so the bill cannot move under the patient. */
  sellingPrice?: number;
  owner?: string;
}

export interface Allocation {
  batchId: string;
  batchNumber: string;
  quantity: number;
  unitPrice: number;
  expiryDate?: Date | string | null;
}

export interface AllocationResult {
  allocations: Allocation[];
  /** How much of the request could not be met. Zero when fully satisfied. */
  shortfall: number;
  /** True when every unit asked for was found. */
  satisfied: boolean;
  /** Total kobo of what was allocated. */
  totalPrice: number;
}

/**
 * Choose batches to satisfy `quantity` of one item, earliest expiry first.
 *
 * Batches with no expiry date sort last: an item that never expires should be
 * held back while something perishable is used up.
 *
 * Emergency stock is excluded from an elective allocation unless explicitly
 * authorised — the same rule `canReserve` enforces, applied here so an elective
 * case is not even offered it.
 */
export function allocateFefo(params: {
  batches: AllocatableBatch[];
  quantity: number;
  isElective?: boolean;
  emergencyAuthorisedBy?: string | null;
  asOf?: Date;
}): AllocationResult {
  const { batches, quantity, isElective = true, emergencyAuthorisedBy, asOf = new Date() } = params;

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { allocations: [], shortfall: 0, satisfied: true, totalPrice: 0 };
  }

  const usable = batches
    .filter((b) => b.status === 'AVAILABLE' || b.status === 'RESERVED')
    .filter((b) => !isExpired(b.expiryDate, asOf))
    .filter((b) => available(b) > 0)
    .filter((b) => {
      if (!b.location?.isEmergency) return true;
      return !isElective || Boolean(emergencyAuthorisedBy);
    })
    .sort(compareByExpiryThenId);

  const allocations: Allocation[] = [];
  let remaining = quantity;

  for (const batch of usable) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, available(batch));
    if (take <= 0) continue;
    allocations.push({
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      quantity: take,
      unitPrice: batch.sellingPrice ?? 0,
      expiryDate: batch.expiryDate ?? null,
    });
    remaining -= take;
  }

  return {
    allocations,
    shortfall: remaining,
    satisfied: remaining === 0,
    totalPrice: allocations.reduce((sum, a) => sum + a.unitPrice * a.quantity, 0),
  };
}

/**
 * Earliest expiry first; undated batches last. Ties break on id so the order is
 * deterministic — two runs of the same allocation must produce the same answer,
 * or a reservation and the picking list it printed could disagree.
 */
function compareByExpiryThenId(a: AllocatableBatch, b: AllocatableBatch): number {
  const ax = a.expiryDate ? new Date(a.expiryDate).getTime() : Number.POSITIVE_INFINITY;
  const bx = b.expiryDate ? new Date(b.expiryDate).getTime() : Number.POSITIVE_INFINITY;
  if (ax !== bx) return ax - bx;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Availability of one catalogue item across all its batches — what a surgeon
 * needs to see before booking, so no case is booked blind (spec section 13).
 */
export interface ItemAvailability {
  available: number;
  reserved: number;
  onHand: number;
  batches: number;
  /** Soonest expiry among batches that still hold usable stock. */
  nextExpiry: Date | string | null;
  /** Usable stock that expires within 30 days — use it or lose it. */
  expiringSoon: number;
  belowReorderLevel: boolean;
}

export function summariseAvailability(
  batches: AllocatableBatch[],
  opts: { reorderLevel?: number | null; asOf?: Date; expiringWithinDays?: number } = {}
): ItemAvailability {
  const { reorderLevel, asOf = new Date(), expiringWithinDays = 30 } = opts;

  const usable = batches.filter((b) => !isExpired(b.expiryDate, asOf) && b.status !== 'DISPOSED');

  let availableTotal = 0;
  let reservedTotal = 0;
  let onHandTotal = 0;
  let expiringSoon = 0;
  let nextExpiry: Date | null = null;

  for (const b of usable) {
    const free = available(b);
    availableTotal += free;
    reservedTotal += b.quantityReserved;
    onHandTotal += free + b.quantityReserved;

    if (b.expiryDate) {
      const when = new Date(b.expiryDate);
      if (!nextExpiry || when < nextExpiry) nextExpiry = when;
      const days = Math.round((when.getTime() - asOf.getTime()) / 86_400_000);
      if (days <= expiringWithinDays) expiringSoon += free;
    }
  }

  return {
    available: availableTotal,
    reserved: reservedTotal,
    onHand: onHandTotal,
    batches: usable.length,
    nextExpiry,
    expiringSoon,
    belowReorderLevel: reorderLevel != null && availableTotal <= reorderLevel,
  };
}
