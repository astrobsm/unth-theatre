// ============================================================
// Imprest access control — server side
// ------------------------------------------------------------
// The imprest system arrived with its own accounts, its own JWT middleware and
// its own role column. Identity here is the theatre `User` and the NextAuth
// session, so this module is the bridge: it answers "which imprest duty does
// the signed-in person hold, and what may they do with it?".
//
// An imprest duty is NOT a clinical role. The cashier may be a nurse; the
// account officer may be an administrator. Duties live in
// `ImprestRoleAssignment` and are granted deliberately — a clinical role never
// confers imprest access by itself.
//
// The one exception is the system administrator: ADMIN / SYSTEM_ADMINISTRATOR
// can always administer imprest, because someone has to be able to assign the
// first duty on a fresh install.
// ============================================================

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { ROLE_LABELS, UserRole as ImprestUserRole } from './enums';
import { hasPermission, permissionsForRole, type Permission } from './permissions';

/** Theatre roles that always hold imprest ADMINISTRATOR rights. */
const IMPREST_SUPERUSERS = ['ADMIN', 'SYSTEM_ADMINISTRATOR'];

export interface ImprestActor {
  userId: string;
  fullName: string;
  /** The imprest duty governing the approval chain. */
  role: ImprestUserRole;
  /** Printed on vouchers and approval sheets — a witness field. */
  designation: string;
  /** Department this duty is scoped to; null means all departments. */
  departmentId: string | null;
  permissions: Permission[];
  /** True when the duty is implied by a system-administrator role. */
  viaSuperuser: boolean;
}

/**
 * The signed-in person's imprest identity, or null when they hold no duty.
 * Never throws — callers decide whether absence is an error.
 */
export async function getImprestActor(): Promise<ImprestActor | null> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return null;

  const theatreRole = (session?.user as { role?: string } | undefined)?.role;
  const fullName = session?.user?.name ?? 'Unknown';

  // An explicit duty always wins: an administrator who has also been made
  // ACCOUNT_OFFICER acts as that officer, so the approval chain records the
  // office actually held rather than a blanket admin right.
  const assignment = await prisma.imprestRoleAssignment.findFirst({
    where: { userId, isActive: true, revokedAt: null },
    orderBy: { assignedAt: 'desc' },
  });

  if (assignment) {
    const role = assignment.role as ImprestUserRole;
    return {
      userId,
      fullName,
      role,
      designation: assignment.designation ?? humanRole(role),
      departmentId: assignment.departmentId,
      permissions: permissionsForRole(role),
      viaSuperuser: false,
    };
  }

  if (theatreRole && IMPREST_SUPERUSERS.includes(theatreRole)) {
    const role = ImprestUserRole.ADMINISTRATOR;
    return {
      userId,
      fullName,
      role,
      designation: 'System Administrator',
      departmentId: null,
      permissions: permissionsForRole(role),
      viaSuperuser: true,
    };
  }

  return null;
}

/** Does this actor hold the given permission? */
export function actorCan(actor: ImprestActor | null, permission: Permission): boolean {
  if (!actor) return false;
  return hasPermission(actor.role, permission);
}

export type ImprestGuardFailure =
  | { ok: false; status: 401; error: string }
  | { ok: false; status: 403; error: string };

export type ImprestGuardResult = { ok: true; actor: ImprestActor } | ImprestGuardFailure;

/**
 * Guard for an imprest route handler.
 *
 *   const guard = await requireImprest(Permission.IMPREST_VIEW);
 *   if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
 *   const { actor } = guard;
 *
 * 401 means "not signed in", 403 means "signed in but holds no imprest duty, or
 * the duty does not carry this permission" — kept distinct so the UI can tell a
 * login problem from a permissions problem.
 */
export async function requireImprest(permission?: Permission): Promise<ImprestGuardResult> {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { id?: string } | undefined)?.id) {
    return { ok: false, status: 401, error: 'You are not signed in.' };
  }

  const actor = await getImprestActor();
  if (!actor) {
    return {
      ok: false,
      status: 403,
      error:
        'You do not have an imprest duty assigned. An administrator can grant one from Imprest → Duties.',
    };
  }

  if (permission && !actorCan(actor, permission)) {
    return {
      ok: false,
      status: 403,
      error: `Your imprest duty (${humanRole(actor.role)}) does not permit this action.`,
    };
  }

  return { ok: true, actor };
}

/** Human label for an imprest duty — the labels shipped with the domain. */
export function humanRole(role: ImprestUserRole | string): string {
  return (
    ROLE_LABELS[role as ImprestUserRole] ??
    String(role)
      .toLowerCase()
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  );
}
