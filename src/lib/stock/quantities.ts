// ============================================================
// Stock quantities — the arithmetic everything else rests on
// ------------------------------------------------------------
// A batch carries eight counters. Which of them add and which subtract is the
// single most important thing in this module, and getting it wrong means a
// store that says it holds stock it does not. So it is stated once, here, and
// nowhere else.
//
// THE STORE
//
//   onHand = received + returned − issued − expired − disposed
//
//   `issued` leaves the store; `returned` comes back into it. `expired` and
//   `disposed` are store-side write-offs. `used` is NOT subtracted — an item
//   that was used had already left the store when it was issued, and
//   subtracting it again would count it twice.
//
//   available = onHand − reserved
//
//   Reserved stock is still physically on the shelf. It is simply spoken for,
//   so nobody else may reserve it.
//
// THE RECONCILIATION
//
//   issued = returned + used + damaged
//
//   This is the identity the anaesthetic drug register turns on: ten vials
//   dispensed, seven used, two returned, one broken — and nothing outstanding.
//   Anything left over is stock that left the store and cannot be accounted
//   for, which is the number a controlled-drug audit actually looks for.
//
//   `damaged` therefore means waste AFTER issue. Breakage in the store is an
//   ADJUST movement, not a damage count — otherwise the identity above would
//   quietly stop holding.
//
// Everything here is a pure function of a plain object, so it can be used on
// the server, in an offline browser, and in tests without a database.
// ============================================================

/** The counters a batch carries. Deliberately structural — any row with these fields will do. */
export interface BatchQuantities {
  quantityReceived: number;
  quantityReserved: number;
  quantityIssued: number;
  quantityReturned: number;
  quantityUsed: number;
  quantityDamaged: number;
  quantityExpired: number;
  quantityDisposed: number;
}

export const ZERO_QUANTITIES: BatchQuantities = {
  quantityReceived: 0,
  quantityReserved: 0,
  quantityIssued: 0,
  quantityReturned: 0,
  quantityUsed: 0,
  quantityDamaged: 0,
  quantityExpired: 0,
  quantityDisposed: 0,
};

/** Physically present in the store, whether or not it is spoken for. */
export function onHand(q: BatchQuantities): number {
  return (
    q.quantityReceived +
    q.quantityReturned -
    q.quantityIssued -
    q.quantityExpired -
    q.quantityDisposed
  );
}

/** Free to be reserved by a new case. Never negative — see `isOversubscribed`. */
export function available(q: BatchQuantities): number {
  return Math.max(0, onHand(q) - q.quantityReserved);
}

/**
 * More is reserved than is actually present. Should be impossible, so it is
 * worth surfacing rather than hiding behind the Math.max above: it means two
 * reservations raced, or a write-off removed stock somebody had already claimed.
 */
export function isOversubscribed(q: BatchQuantities): boolean {
  return q.quantityReserved > onHand(q);
}

/**
 * Issued but not yet accounted for — not returned, not recorded as used, not
 * recorded as wasted. The figure a controlled-drug audit chases.
 */
export function unreconciled(q: BatchQuantities): number {
  return q.quantityIssued - q.quantityReturned - q.quantityUsed - q.quantityDamaged;
}

/** True when everything that left the store has been accounted for. */
export function isReconciled(q: BatchQuantities): boolean {
  return unreconciled(q) === 0;
}

/** Total written off, however it happened. */
export function writtenOff(q: BatchQuantities): number {
  return q.quantityDamaged + q.quantityExpired + q.quantityDisposed;
}

/**
 * Proportion of what was received that ended up used, as a whole percentage.
 * Zero received reads as 0 rather than NaN — a batch nobody has stocked has
 * not been wasted either.
 */
export function utilisationPercent(q: BatchQuantities): number {
  if (q.quantityReceived <= 0) return 0;
  return Math.round((q.quantityUsed / q.quantityReceived) * 100);
}

// ---------------------------------------------------------------------------
// Applying a movement
// ---------------------------------------------------------------------------

export type MovementKind =
  | 'RECEIVE'
  | 'RESERVE'
  | 'RELEASE_RESERVATION'
  | 'ISSUE'
  | 'RETURN'
  | 'CONSUME'
  | 'TRANSFER'
  | 'ADJUST'
  | 'QUARANTINE'
  | 'EXPIRE'
  | 'DISPOSE'
  | 'OWNERSHIP_TRANSFER';

/**
 * The counter deltas one movement produces.
 *
 * Returned as a patch rather than applied in place, so the caller can hand it
 * straight to Prisma as an `increment` update inside the same transaction that
 * writes the movement row. A movement and its effect on the counters must
 * never be able to land separately.
 */
export function applyMovement(kind: MovementKind, quantity: number): Partial<BatchQuantities> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('A stock movement must be a whole number greater than zero.');
  }

  switch (kind) {
    case 'RECEIVE':
      return { quantityReceived: quantity };
    case 'RESERVE':
      return { quantityReserved: quantity };
    case 'RELEASE_RESERVATION':
      return { quantityReserved: -quantity };
    case 'ISSUE':
      // Issuing consumes the reservation that authorised it: the stock has now
      // physically left, so holding it reserved as well would count it twice.
      return { quantityIssued: quantity, quantityReserved: -quantity };
    case 'RETURN':
      return { quantityReturned: quantity };
    case 'CONSUME':
      return { quantityUsed: quantity };
    case 'EXPIRE':
      return { quantityExpired: quantity };
    case 'DISPOSE':
      return { quantityDisposed: quantity };
    // TRANSFER moves a batch between stores and QUARANTINE changes its status;
    // neither changes how much of it there is. OWNERSHIP_TRANSFER changes who
    // owns it, not how much. ADJUST is deliberately not automatic — a
    // correction states explicitly which counter it corrects.
    case 'TRANSFER':
    case 'QUARANTINE':
    case 'OWNERSHIP_TRANSFER':
    case 'ADJUST':
      return {};
    default: {
      // Exhaustiveness: adding a movement type without deciding its effect on
      // the counters should fail here rather than silently do nothing.
      const never: never = kind;
      throw new Error(`Unhandled stock movement type: ${String(never)}`);
    }
  }
}

/** Fold a patch into a set of counters. Used by the reconciler and by tests. */
export function withMovement(
  q: BatchQuantities,
  kind: MovementKind,
  quantity: number
): BatchQuantities {
  const patch = applyMovement(kind, quantity);
  const next = { ...q };
  for (const [field, delta] of Object.entries(patch) as [keyof BatchQuantities, number][]) {
    next[field] = (next[field] ?? 0) + delta;
  }
  return next;
}
