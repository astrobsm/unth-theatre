// ============================================================
// Who may act on stock
// ------------------------------------------------------------
// Deliberately built on the roles ORM already has rather than a parallel
// permission system. The supply-chain spec asks for offices like "Inventory
// Officer" and "Theatre Supply Manager"; most of them already exist here under
// the names this hospital uses — THEATRE_STORE_KEEPER, PROCUREMENT_OFFICER,
// PHARMACIST, CSSD_STAFF — and inventing duplicates would leave two lists to
// keep in step.
//
// Reads are wide: a surgeon must be able to see what is on the shelf before
// booking, and the whole point of section 13 is that nobody books blind.
// Writes are narrow, because they move real stock.
// ============================================================

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { effectiveRoles } from '@/lib/roleGroups';

/** Roles that always see and do everything. Mirrors lib/modules FULL_ACCESS_ROLES. */
const FULL_ACCESS = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];

/** Anyone clinically involved in a case needs to see what stock exists. */
const CAN_VIEW = [
  ...FULL_ACCESS,
  'SURGEON', 'CONSULTANT_SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST',
  'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', 'ANAESTHETIC_TECHNICIAN', 'HOUSE_OFFICER',
  'THEATRE_STORE_KEEPER', 'PROCUREMENT_OFFICER', 'PHARMACIST',
  'CSSD_STAFF', 'CSSD_SUPERVISOR', 'CONSUMABLE_PACK_PROVIDER',
  'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC',
];

/** Booking a case reserves stock against it, so the same people who book may reserve. */
const CAN_RESERVE = [
  ...FULL_ACCESS,
  'SURGEON', 'CONSULTANT_SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST',
  'SCRUB_NURSE', 'THEATRE_STORE_KEEPER', 'PHARMACIST', 'CONSUMABLE_PACK_PROVIDER',
];

/** Physically moving stock in or out of a store. */
const CAN_MOVE = [
  ...FULL_ACCESS,
  'THEATRE_STORE_KEEPER', 'PROCUREMENT_OFFICER', 'PHARMACIST',
  'CSSD_STAFF', 'CSSD_SUPERVISOR', 'CONSUMABLE_PACK_PROVIDER', 'SCRUB_NURSE',
];

/** Receiving new stock and correcting the books. */
const CAN_RECEIVE = [...FULL_ACCESS, 'THEATRE_STORE_KEEPER', 'PROCUREMENT_OFFICER', 'PHARMACIST'];

export type StockAction = 'view' | 'reserve' | 'move' | 'receive';

const MATRIX: Record<StockAction, string[]> = {
  view: CAN_VIEW,
  reserve: CAN_RESERVE,
  move: CAN_MOVE,
  receive: CAN_RECEIVE,
};

export interface StockActor {
  userId: string;
  fullName: string;
  role: string;
}

export type StockGuard =
  | { ok: true; actor: StockActor }
  | { ok: false; status: number; error: string };

/**
 * Guard for a stock route.
 *
 * 401 (not signed in) is kept distinct from 403 (signed in, wrong role) — the
 * offline layer treats them differently, and telling a signed-in user to sign
 * in again when the real problem is their role sends them in circles.
 */
export async function requireStock(action: StockAction): Promise<StockGuard> {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; name?: string; fullName?: string; role?: string } | undefined;

  if (!user?.id) {
    return { ok: false, status: 401, error: 'Sign in to continue.' };
  }

  const allowed = MATRIX[action];
  // effectiveRoles expands the inheritance layer — a CONSULTANT_SURGEON counts
  // as a SURGEON here without every list having to name both.
  const roles = effectiveRoles(user.role ?? '');
  const permitted = roles.some((r) => allowed.includes(r));

  if (!permitted) {
    return {
      ok: false,
      status: 403,
      error: `Your role does not allow you to ${action} theatre stock.`,
    };
  }

  return {
    ok: true,
    actor: {
      userId: user.id,
      fullName: user.fullName ?? user.name ?? 'Unknown',
      role: user.role ?? '',
    },
  };
}
