// ============================================================
// Imprest duties — who holds which imprest office
// ------------------------------------------------------------
// The imprest system originally kept its own accounts with a role column. Here
// identity is the theatre `User`, and the DUTY that governs the approval chain
// is assigned separately: an imprest duty is not a clinical role, so it is
// granted deliberately rather than inherited.
//
// This is the screen that makes imprest usable on a fresh install — until
// somebody holds a duty, every other imprest route correctly refuses.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireImprest, humanRole } from '@/lib/imprest/access';
import { Permission } from '@/lib/imprest/permissions';
import { ALL_ROLES, UserRole as ImprestUserRole } from '@/lib/imprest/enums';
import { permissionsForRole } from '@/lib/imprest/permissions';

export const dynamic = 'force-dynamic';

/** Module ids granted alongside an imprest duty, so the menu is reachable. */
const IMPREST_MODULE_IDS = ['imprest', 'imprest-expenditure', 'imprest-retirement'];

const USER_FIELDS = {
  id: true,
  fullName: true,
  staffCode: true,
  role: true,
  department: true,
} as const;

// ---------------------------------------------------------------------------
// GET — current duty holders, plus the catalogue needed to assign one
// ---------------------------------------------------------------------------
export async function GET() {
  const guard = await requireImprest(Permission.USER_VIEW);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    const [assignments, departments] = await Promise.all([
      prisma.imprestRoleAssignment.findMany({
        where: { revokedAt: null },
        include: {
          user: { select: USER_FIELDS },
          department: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ isActive: 'desc' }, { assignedAt: 'desc' }],
      }),
      prisma.department.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true, code: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return NextResponse.json({
      duties: assignments.map((a) => ({
        id: a.id,
        userId: a.userId,
        user: a.user,
        role: a.role,
        roleLabel: humanRole(a.role),
        designation: a.designation,
        department: a.department,
        isActive: a.isActive,
        assignedAt: a.assignedAt,
      })),
      departments,
      roles: ALL_ROLES.map((r) => ({
        value: r,
        label: humanRole(r),
        permissions: permissionsForRole(r).length,
      })),
      // So the UI can show the viewer their own standing.
      you: { role: guard.actor.role, viaSuperuser: guard.actor.viaSuperuser },
    });
  } catch (error) {
    console.error('[imprest] duties list failed:', error);
    return NextResponse.json({ error: 'Failed to load imprest duties' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — assign a duty
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const guard = await requireImprest(Permission.USER_MANAGE);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { actor } = guard;

  let body: { userId?: string; role?: string; designation?: string; departmentId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { userId, role, designation, departmentId } = body;
  if (!userId || !role) {
    return NextResponse.json({ error: 'A staff member and a duty are both required' }, { status: 400 });
  }
  if (!(ALL_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: `"${role}" is not an imprest duty` }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_FIELDS });
    if (!user) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });

    // Re-assigning an existing duty reactivates it rather than creating a
    // duplicate, so the history stays readable.
    const existing = await prisma.imprestRoleAssignment.findFirst({
      where: { userId, role: role as ImprestUserRole, departmentId: departmentId ?? null },
    });

    const saved = existing
      ? await prisma.imprestRoleAssignment.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            revokedAt: null,
            revokedById: null,
            designation: designation?.trim() || existing.designation,
            assignedById: actor.userId,
            assignedAt: new Date(),
          },
          include: { user: { select: USER_FIELDS }, department: true },
        })
      : await prisma.imprestRoleAssignment.create({
          data: {
            userId,
            role: role as ImprestUserRole,
            designation: designation?.trim() || humanRole(role),
            departmentId: departmentId || null,
            assignedById: actor.userId,
          },
          include: { user: { select: USER_FIELDS }, department: true },
        });

    // Make the module visible in the sidebar for this person.
    //
    // Imprest modules carry `defaultRoles: []` on purpose — access follows the
    // DUTY, not a clinical role — but the sidebar is driven by role defaults
    // plus per-user grants. Without a grant the cashier who happens to be a
    // nurse holds the duty, is served by every API, and yet has no way to
    // reach the module except by typing the URL. This is the app's own
    // mechanism for exactly that, so it is reused rather than special-cased.
    await Promise.all(
      IMPREST_MODULE_IDS.map((moduleId) =>
        prisma.userModuleGrant.upsert({
          where: { userId_moduleId: { userId, moduleId } },
          create: { userId, moduleId, grantedById: actor.userId },
          update: {},
        })
      )
    );

    await prisma.imprestAuditLog.create({
      data: {
        action: 'CREATE',
        entity: 'USER',
        entityId: saved.id,
        entityLabel: `${user.fullName} — ${humanRole(role)}`,
        actorId: actor.userId,
        actorName: actor.fullName,
        actorRole: actor.role,
      },
    });

    return NextResponse.json(
      {
        duty: saved,
        success: true,
        // The sidebar reads module access from the session, which is minted at
        // sign-in — so it appears once they sign in again.
        note: 'The Imprest menu appears for them the next time they sign in.',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[imprest] duty assign failed:', error);
    return NextResponse.json({ error: 'Failed to assign the duty' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE — revoke a duty (kept as history, never hard deleted)
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  const guard = await requireImprest(Permission.USER_MANAGE);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { actor } = guard;

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Which duty?' }, { status: 400 });

  try {
    const duty = await prisma.imprestRoleAssignment.findUnique({
      where: { id },
      include: { user: { select: { fullName: true } } },
    });
    if (!duty) return NextResponse.json({ error: 'Duty not found' }, { status: 404 });

    // Refuse to leave the system with nobody who can assign duties — that would
    // lock everyone out of imprest administration.
    if (duty.role === ImprestUserRole.ADMINISTRATOR) {
      const remaining = await prisma.imprestRoleAssignment.count({
        where: {
          role: ImprestUserRole.ADMINISTRATOR,
          isActive: true,
          revokedAt: null,
          id: { not: id },
        },
      });
      if (remaining === 0) {
        return NextResponse.json(
          { error: 'This is the last imprest administrator. Assign another before revoking this one.' },
          { status: 409 }
        );
      }
    }

    await prisma.imprestRoleAssignment.update({
      where: { id },
      data: { isActive: false, revokedAt: new Date(), revokedById: actor.userId },
    });

    // Withdraw the menu too — but only if this was their LAST active duty.
    // Somebody who holds two offices and gives up one still needs the module.
    const stillHoldsADuty = await prisma.imprestRoleAssignment.count({
      where: { userId: duty.userId, isActive: true, revokedAt: null, id: { not: id } },
    });
    if (stillHoldsADuty === 0) {
      await prisma.userModuleGrant.deleteMany({
        where: { userId: duty.userId, moduleId: { in: IMPREST_MODULE_IDS } },
      });
    }

    await prisma.imprestAuditLog.create({
      data: {
        action: 'SOFT_DELETE',
        entity: 'USER',
        entityId: id,
        entityLabel: `${duty.user.fullName} — ${humanRole(duty.role)}`,
        actorId: actor.userId,
        actorName: actor.fullName,
        actorRole: actor.role,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[imprest] duty revoke failed:', error);
    return NextResponse.json({ error: 'Failed to revoke the duty' }, { status: 500 });
  }
}
