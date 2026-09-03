import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { ROSTER_ADMIN_ROLES, ROSTER_DEPARTMENTS, getRosterDept } from '@/lib/rosterDepartments';
import { listSupervisors } from '@/lib/rosterSupervisors';

export const dynamic = 'force-dynamic';

/**
 * Appointing the person who runs a department's duty roster.
 *
 * WHO MAY APPOINT: the roster admins only — ADMIN, SYSTEM_ADMINISTRATOR,
 * THEATRE_MANAGER, THEATRE_CHAIRMAN. Deliberately NOT a supervisor themselves:
 * an authority that can grant itself to others is not a delegation, it is a
 * second admin role with a quieter name.
 */
const ASSIGNER_ROLES = ROSTER_ADMIN_ROLES;

const assignSchema = z.object({
  userId: z.string().min(1, 'Choose a member of staff.'),
  deptSlug: z.string().min(1, 'Choose a department.'),
  notes: z.string().trim().max(500).optional().nullable(),
});

const actorOf = (session: any) => ({
  id: session?.user?.id as string | undefined,
  role: session?.user?.role as string | undefined,
});

function forbidden() {
  return NextResponse.json(
    { error: 'Only an administrator or theatre manager may appoint a roster supervisor.' },
    { status: 403 },
  );
}

// GET /api/roster/supervisors[?dept=slug]
// Every supervisor, or one department's. Readable by any roster admin.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { role } = actorOf(session);
  if (!role || !ASSIGNER_ROLES.includes(role)) return forbidden();

  const dept = request.nextUrl.searchParams.get('dept');
  if (dept) {
    if (!getRosterDept(dept)) return NextResponse.json({ error: 'Unknown department' }, { status: 404 });
    return NextResponse.json({ supervisors: await listSupervisors(dept) });
  }

  // Grouped by department, so the screen can show the whole picture at once.
  const byDept = await Promise.all(
    ROSTER_DEPARTMENTS.map(async (d) => ({
      slug: d.slug,
      label: d.label,
      supervisors: await listSupervisors(d.slug),
    })),
  );
  return NextResponse.json({ departments: byDept });
}

// POST /api/roster/supervisors — appoint someone.
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: actorId, role } = actorOf(session);
  if (!role || !ASSIGNER_ROLES.includes(role)) return forbidden();

  try {
    const { userId, deptSlug, notes } = assignSchema.parse(await request.json());

    const dept = getRosterDept(deptSlug);
    if (!dept) return NextResponse.json({ error: 'Unknown department' }, { status: 404 });

    // The person must exist and be approved. Appointing a rejected or pending
    // account creates an authority that cannot sign in to use it, which reads
    // as the feature being broken.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, status: true },
    });
    if (!user) return NextResponse.json({ error: 'That member of staff was not found.' }, { status: 404 });
    if (user.status !== 'APPROVED') {
      return NextResponse.json(
        { error: `${user.fullName}'s account is ${String(user.status).toLowerCase()}, so they cannot supervise a roster yet.` },
        { status: 400 },
      );
    }

    const supervisor = await prisma.rosterSupervisor.upsert({
      where: { userId_deptSlug: { userId, deptSlug } },
      update: { notes: notes ?? null, assignedById: actorId ?? null, assignedAt: new Date() },
      create: { userId, deptSlug, notes: notes ?? null, assignedById: actorId ?? null },
      select: { id: true, deptSlug: true, assignedAt: true, notes: true },
    });

    // Granting authority over a roster is a permission change; it is recorded.
    if (actorId) {
      await prisma.auditLog.create({
        data: {
          userId: actorId,
          action: 'ROSTER_SUPERVISOR_ASSIGNED',
          tableName: 'roster_supervisors',
          recordId: supervisor.id,
          changes: JSON.stringify({ subject: user.fullName, subjectId: userId, department: dept.label, deptSlug, notes: notes ?? null }),
        },
      }).catch((e) => console.error('[roster/supervisors] audit failed:', e));
    }

    return NextResponse.json({ ok: true, supervisor }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message ?? 'Invalid request' }, { status: 400 });
    }
    console.error('[roster/supervisors] assign failed:', error);
    return NextResponse.json({ error: 'Could not appoint that supervisor.' }, { status: 500 });
  }
}

// DELETE /api/roster/supervisors?userId=...&dept=slug — stand someone down.
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: actorId, role } = actorOf(session);
  if (!role || !ASSIGNER_ROLES.includes(role)) return forbidden();

  const userId = request.nextUrl.searchParams.get('userId');
  const deptSlug = request.nextUrl.searchParams.get('dept');
  if (!userId || !deptSlug) {
    return NextResponse.json({ error: 'Both userId and dept are required.' }, { status: 400 });
  }

  const existing = await prisma.rosterSupervisor.findUnique({
    where: { userId_deptSlug: { userId, deptSlug } },
    select: { id: true, user: { select: { fullName: true } } },
  });
  if (!existing) return NextResponse.json({ error: 'That person does not supervise this roster.' }, { status: 404 });

  await prisma.rosterSupervisor.delete({ where: { userId_deptSlug: { userId, deptSlug } } });

  if (actorId) {
    await prisma.auditLog.create({
      data: {
        userId: actorId,
        action: 'ROSTER_SUPERVISOR_REMOVED',
        tableName: 'roster_supervisors',
        recordId: existing.id,
        changes: JSON.stringify({ subject: existing.user?.fullName, subjectId: userId, deptSlug }),
      },
    }).catch((e) => console.error('[roster/supervisors] audit failed:', e));
  }

  return NextResponse.json({ ok: true });
}
