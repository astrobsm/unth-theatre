// ============================================================
// The NHIA Pharmacy sending a line on
// ------------------------------------------------------------
// The scheme's counter is the only one that may decide an item is not the
// scheme's. It reviews what the routing sent it and passes on what it cannot
// supply — a drug to the Theatre Pharmacy, a consumable to the pack
// providers — with a reason that travels with the line.
//
// ONE-DIRECTIONAL, ON PURPOSE. The receiving unit cannot push a line back.
// Two counters each insisting the other owns an item is how a patient waits
// for both, and it is the failure this whole routing exists to prevent. An
// administrator can override, because somebody has to be able to undo a
// mistake, and that override is audited like everything else.
//
// PARTIAL COVER SPLITS THE LINE. A scheme that will supply two of five does
// not make the line "not covered"; it makes it two lines. The remainder
// points back at the line it came from so the two halves read as one
// decision rather than as a duplicate somebody ought to delete.
// ============================================================

import { roleAllowed } from '@/lib/roleGroups';

import type { FulfilmentUnit, PackListKind } from './routing';
import { uninsuredUnitFor } from './routing';

/** Why a line is being sent on. Chosen, not typed, except for OTHER. */
export const REASSIGN_REASONS = [
  { code: 'NOT_COVERED', label: 'Not covered by scheme' },
  { code: 'OUT_OF_STOCK', label: 'Out of stock' },
  { code: 'EXCEEDS_LIMIT', label: 'Quantity exceeds scheme limit' },
  { code: 'OTHER', label: 'Other (specify)' },
] as const;

export type ReassignReasonCode = (typeof REASSIGN_REASONS)[number]['code'];

export const REASSIGN_REASON_CODES: ReassignReasonCode[] =
  REASSIGN_REASONS.map((r) => r.code);

/** The shortest an "Other" explanation may be. Matches the pack rules. */
export const MIN_REASSIGN_NOTE = 10;

/** Only the scheme's own counter decides what the scheme will not carry. */
export const MAY_REASSIGN_ROLES = ['NHIA_PHARMACY'];

/** Who may undo one, which is the only way a line goes back. */
export const MAY_OVERRIDE_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER'];

export function canReassign(role: string | null | undefined): boolean {
  return roleAllowed((role ?? '').toUpperCase(), MAY_REASSIGN_ROLES);
}

export function canOverrideRouting(role: string | null | undefined): boolean {
  return roleAllowed((role ?? '').toUpperCase(), MAY_OVERRIDE_ROLES);
}

/** Where a line the scheme will not carry goes instead. */
export function reassignTargetFor(list: PackListKind): FulfilmentUnit {
  return uninsuredUnitFor(list);
}

/** The sentence that travels with the line, for the receiving unit to read. */
export function reassignNote(code: ReassignReasonCode, detail?: string | null): string {
  const chosen = REASSIGN_REASONS.find((r) => r.code === code);
  const head = chosen?.label ?? 'Reassigned';
  const tail = (detail ?? '').trim();
  return tail ? `${head} — ${tail}` : head;
}

export interface ReassignInput {
  /** What the line is routed to NOW. */
  currentUnit: FulfilmentUnit;
  currentStatus: string;
  currentQuantity: number;
  /** How many of them are moving. Equal to the whole line, or fewer. */
  moveQuantity?: number | null;
  reasonCode: string;
  detail?: string | null;
  byId?: string | null;
  byRole?: string | null;
}

export interface ReassignCheck {
  ok: boolean;
  problem: string | null;
  /** True when only part of the line moves, so the row must be split. */
  splits: boolean;
}

const refuse = (problem: string): ReassignCheck => ({ ok: false, problem, splits: false });

/**
 * May this line be sent on, and does it split?
 *
 * Pure, so the rules can be exercised without a case, a pharmacy or a
 * database — and so that the one-directional rule cannot quietly become
 * two-directional in a route nobody re-read.
 */
export function checkReassign(input: ReassignInput): ReassignCheck {
  if (!canReassign(input.byRole)) {
    return refuse('Only the NHIA Pharmacy may send an item on.');
  }
  if (!input.byId) {
    return refuse('The person making the change must be identified.');
  }
  // THE ONE-DIRECTIONAL RULE, enforced here rather than trusted to the UI.
  if (input.currentUnit !== 'NHIA_PHARMACY') {
    return refuse(
      'This item is not with the NHIA Pharmacy. Items move away from the scheme, '
      + 'never back to it — an administrator can correct the routing if it is wrong.',
    );
  }
  const status = String(input.currentStatus ?? '').toUpperCase();
  if (status === 'CANCELLED') {
    return refuse('That item has been withdrawn from the list.');
  }
  if (status === 'DELIVERED') {
    return refuse('That item has already been delivered. It cannot be sent elsewhere now.');
  }

  if (!REASSIGN_REASON_CODES.includes(input.reasonCode as ReassignReasonCode)) {
    return refuse('Choose a reason for sending this item on.');
  }
  if (input.reasonCode === 'OTHER' && (input.detail ?? '').trim().length < MIN_REASSIGN_NOTE) {
    return refuse(
      `Say what the reason is — at least ${MIN_REASSIGN_NOTE} characters. `
      + 'The receiving unit reads it to decide what to do.',
    );
  }

  const whole = input.currentQuantity;
  const moving = input.moveQuantity ?? whole;
  if (!Number.isInteger(moving) || moving < 1) {
    return refuse('Give a whole number of at least one to send on.');
  }
  if (moving > whole) {
    return refuse(`There are only ${whole} on this line.`);
  }

  return { ok: true, problem: null, splits: moving < whole };
}

/**
 * How the quantities fall either side of a partial reassignment.
 *
 * `stays` is what the NHIA Pharmacy keeps — the part the scheme does cover —
 * and `moves` is the remainder. Named from the line's point of view rather
 * than the pharmacy's, because that is how the surgeon reads it back.
 */
export function splitQuantities(
  currentQuantity: number,
  moveQuantity?: number | null,
): { stays: number; moves: number } {
  const moves = Math.max(1, Math.min(currentQuantity, moveQuantity ?? currentQuantity));
  return { stays: currentQuantity - moves, moves };
}
