// ============================================================
// Per-role desks — who each one is for
// ------------------------------------------------------------
// Four summary screens, each answering "what needs me today?" for one kind of
// person. They aggregate what already exists rather than adding new records:
// nothing here writes anything, and every number can be traced to a page that
// was already in the system.
//
// The awkward part is that ORM has no FINANCE and no VENDOR role, and
// inventing them would leave two lists of finance staff to keep in step. So:
//
//   * The finance desk also admits anyone holding a finance duty in the
//     imprest system — Chief Accountant, Cashier, Internal Auditor. Those
//     assignments already exist, are already administered, and already
//     identify exactly the people meant.
//   * The vendor desk is the HOSPITAL's view of its vendor accounts, not a
//     login for vendors. There are no vendor logins, and this does not
//     pretend otherwise.
// ============================================================

import { effectiveRoles } from '@/lib/roleGroups';

export const DESKS = ['consultant', 'inventory', 'vendor', 'finance'] as const;
export type Desk = (typeof DESKS)[number];

export const DESK_LABEL: Record<Desk, string> = {
  consultant: 'My Practice',
  inventory: 'Inventory Desk',
  vendor: 'Vendor Accounts',
  finance: 'Finance Desk',
};

/** Roles that see everything, mirroring lib/modules FULL_ACCESS_ROLES. */
const FULL_ACCESS = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];

/** Executive medical management. */
const EXECUTIVE = ['CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC'];

const BY_DESK: Record<Desk, string[]> = {
  // A surgeon's own practice. Residents included: their list is their list,
  // and a registrar who cannot see their own cases is not being protected
  // from anything.
  consultant: [...FULL_ACCESS, ...EXECUTIVE, 'CONSULTANT_SURGEON', 'SURGEON',
    'CONSULTANT_ANAESTHETIST', 'ANAESTHETIST'],

  inventory: [...FULL_ACCESS, 'THEATRE_STORE_KEEPER', 'PROCUREMENT_OFFICER', 'PHARMACIST',
    'CSSD_SUPERVISOR', 'CONSUMABLE_PACK_PROVIDER'],

  // Money owed to outside parties. Procurement and management only.
  vendor: [...FULL_ACCESS, ...EXECUTIVE, 'PROCUREMENT_OFFICER'],

  finance: [...FULL_ACCESS, ...EXECUTIVE, 'PROCUREMENT_OFFICER'],
};

/**
 * Imprest duties that mean "this person does finance".
 *
 * Reused rather than duplicated: these assignments are already administered
 * through the imprest module, and a second list of finance staff would drift
 * from this one within a month.
 */
export const FINANCE_IMPREST_ROLES = [
  'CHIEF_ACCOUNTANT',
  'CASHIER',
  'INTERNAL_AUDITOR',
  'FINANCE',
  'VIEW_ONLY_AUDITOR',
];

/** Does the user's ORM role alone open this desk? */
export function roleOpensDesk(desk: Desk, role: string | null | undefined): boolean {
  if (!role) return false;
  const allowed = BY_DESK[desk];
  return effectiveRoles(role).some((r) => allowed.includes(r));
}

/**
 * The full check, including the imprest fallback for the finance desk.
 *
 * `imprestRoles` is what the caller looked up; passing an empty array is the
 * correct behaviour for someone with no imprest duties, not an error.
 */
export function canOpenDesk(
  desk: Desk,
  role: string | null | undefined,
  imprestRoles: string[] = []
): boolean {
  if (roleOpensDesk(desk, role)) return true;
  if (desk === 'finance') {
    return imprestRoles.some((r) => FINANCE_IMPREST_ROLES.includes(r));
  }
  return false;
}

/** Which desks a person may open. Used to decide what to offer them. */
export function desksFor(role: string | null | undefined, imprestRoles: string[] = []): Desk[] {
  return DESKS.filter((d) => canOpenDesk(d, role, imprestRoles));
}

export const isDesk = (s: unknown): s is Desk =>
  typeof s === 'string' && (DESKS as readonly string[]).includes(s);

// ---------------------------------------------------------------------------
// Small shared shapes
// ---------------------------------------------------------------------------

/**
 * A headline figure on a desk.
 *
 * `tone` is advisory, not decorative: 'alert' means somebody has to do
 * something today. A desk where everything is alert-coloured tells nobody
 * anything, so the routes are sparing with it.
 */
export interface DeskStat {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'neutral' | 'good' | 'warn' | 'alert';
  href?: string;
}

/**
 * Rank stock batches by how soon they expire, soonest first, with anything
 * already expired ahead of everything else.
 *
 * Expired stock outranks stock expiring tomorrow because it is a different
 * job: one is a decision about the operating list, the other is a disposal
 * and a write-off.
 */
export function expiryOrder<T extends { expiryDate: Date | string | null }>(
  batches: T[],
  now: Date = new Date()
): T[] {
  const time = (b: T) => (b.expiryDate ? new Date(b.expiryDate).getTime() : Number.MAX_SAFE_INTEGER);
  return [...batches].sort((a, b) => {
    const ea = time(a) < now.getTime();
    const eb = time(b) < now.getTime();
    if (ea !== eb) return ea ? -1 : 1;
    return time(a) - time(b);
  });
}

/** Whole days until a date. Negative once it has passed. */
export function daysUntil(date: Date | string | null, now: Date = new Date()): number | null {
  if (!date) return null;
  const t = new Date(date).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((t - now.getTime()) / 86_400_000);
}

/**
 * Percentage, guarding the empty case.
 *
 * Returns null rather than 0 when there is nothing to measure. A theatre with
 * no cases did not achieve 0% — it has no figure, and showing a zero invites
 * somebody to act on it.
 */
export function percentOf(part: number, whole: number): number | null {
  if (!whole) return null;
  return Math.round((part / whole) * 100);
}
