// ============================================================
// Who may see the plans, and who may only see them
// ------------------------------------------------------------
// Planned Cases was a clinical screen: the units who operate, plus the
// booking officer. That is the right list for WRITING a plan and the wrong
// list for reading one.
//
// The whole value of knowing a fortnight in advance is that somebody can get
// what the case needs. The people who do that — the pharmacy, the consumable
// pack provider, the theatre store — could not see the list at all, so the
// first they heard of a case was the booking, which is usually days before
// it and sometimes hours.
//
// So they read everything and write nothing. Not a courtesy: a pharmacist who
// can edit a surgical plan is a pharmacist who can be blamed for one, and the
// unit that owns the case must stay the only author of it.
//
// ENFORCED ON THE SERVER, not by hiding the button. A screen is not a
// permission — the route is reachable from anything that can sign in.
// ============================================================

/**
 * The roles that see the plans in order to prepare for them.
 *
 * Deliberately not the whole of pharmacy and stores: these four are the ones
 * who hold or order the things a case consumes. HEAD_OF_PHARMACY is already
 * in CLINICAL_CORE and so already had access; it is named here too because
 * this list is read as "who is this for", and a reader should not have to
 * know the other list to answer that.
 */
export const PREPARATION_ROLES = [
  'PHARMACIST',
  'HEAD_OF_PHARMACY',
  'CONSUMABLE_PACK_PROVIDER',
  'THEATRE_STORE_KEEPER',
] as const;

/**
 * Roles that may read every plan and change none.
 *
 * HEAD_OF_PHARMACY is excluded: a head sits in CLINICAL_CORE for every other
 * module in this system and taking their write away here alone would be a
 * rule nobody could predict from anywhere else.
 */
const READ_ONLY = new Set<string>([
  'PHARMACIST',
  'CONSUMABLE_PACK_PROVIDER',
  'THEATRE_STORE_KEEPER',
]);

export function isReadOnlyRole(role: string | null | undefined): boolean {
  return READ_ONLY.has((role ?? '').toUpperCase());
}

/**
 * Why this person cannot do that, or null when they can.
 *
 * Says what they CAN do in the same breath, because "forbidden" on a screen
 * somebody was deliberately given access to reads as a fault in the system
 * rather than as a boundary.
 */
export function refuseIfReadOnly(
  role: string | null | undefined,
  action: string,
): string | null {
  if (!isReadOnlyRole(role)) return null;
  return `You can see every planned case so you can prepare for it, but you cannot ${action}. `
    + 'The unit that owns the case is the only one that can change it.';
}
