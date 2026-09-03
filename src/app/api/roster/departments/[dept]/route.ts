import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { getRosterDept, canManageRosterDept, getShiftOptions } from '@/lib/rosterDepartments';
import { canManageRosterDeptFor } from '@/lib/rosterSupervisors';
import { getSubRoleOptions } from '@/lib/rosterAssignments';

export const dynamic = 'force-dynamic';

const dateOnly = (s: string) => {
  const d = new Date(s);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};

// GET /api/roster/departments/[dept]?weekStart=YYYY-MM-DD
// Lists this department's roster rows (draft + published) for the week, plus the
// current published version and whether unpublished drafts exist. Any signed-in
// user may read; only managers see the manage controls (enforced on POST/DELETE).
export async function GET(request: NextRequest, { params }: { params: { dept: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const dept = getRosterDept(params.dept);
  if (!dept) return NextResponse.json({ error: 'Unknown department' }, { status: 404 });

  const weekStartRaw = new URL(request.url).searchParams.get('weekStart');
  if (!weekStartRaw) return NextResponse.json({ error: 'Missing weekStart' }, { status: 400 });
  const start = dateOnly(weekStartRaw);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);

  const rows = await prisma.roster.findMany({
    where: { staffCategory: dept.category as any, date: { gte: start, lte: end } },
    include: { user: { select: { id: true, fullName: true, phoneNumber: true, extension: true, staffCode: true } } },
    orderBy: [{ date: 'asc' }, { shift: 'asc' }],
  });

  const latestPublication = await prisma.rosterPublication.findFirst({
    where: { department: dept.slug, periodStart: start, status: 'PUBLISHED' },
    orderBy: { version: 'desc' },
  });

  const draftCount = rows.filter((r) => r.status === 'DRAFT').length;
  const pendingRemovalCount = rows.filter((r) => r.status === 'PUBLISHED' && r.pendingRemoval).length;
  const role = (session.user as any).role;
  const subRoleOptions = await getSubRoleOptions(dept);

  return NextResponse.json({
    department: {
      slug: dept.slug, label: dept.label, category: dept.category,
      subRoles: dept.subRoles ?? [], seniorityLevels: dept.seniorityLevels ?? [], userRoles: dept.userRoles,
      shiftOptions: getShiftOptions(dept),
      subRoleSource: dept.subRoleSource ?? null,
      subRoleLabel: dept.subRoleLabel ?? 'Sub-role',
      // Resolved here rather than fetched separately so a phone loading this
      // page makes one request, not two.
      subRoleOptions,
    },
    weekStart: start.toISOString().slice(0, 10),
    canManage: await canManageRosterDeptFor(dept, { id: (session.user as any).id, role }),
    currentVersion: latestPublication?.version ?? 0,
    lastPublishedAt: latestPublication?.publishedAt ?? null,
    draftCount,
    pendingRemovalCount,
    pendingChanges: draftCount + pendingRemovalCount,
    rows: rows.map((r) => ({
      id: r.id, userId: r.userId, staffName: r.staffName,
      staffCode: r.user?.staffCode ?? null, phoneNumber: r.user?.phoneNumber ?? null, extension: r.user?.extension ?? null,
      date: r.date.toISOString().slice(0, 10), shift: r.shift, subRole: r.subRole, seniorityLevel: r.seniorityLevel,
      location: r.location, theatreId: r.theatreId, notes: r.notes, status: r.status, version: r.version,
      pendingRemoval: r.pendingRemoval,
    })),
  });
}

const addSchema = z.object({
  userId: z.string(),
  date: z.string(),
  shift: z.enum(['MORNING', 'CALL', 'NIGHT']),
  subRole: z.string().nullish(),
  seniorityLevel: z.string().nullish(),
  location: z.string().nullish(),
  theatreId: z.string().nullish(),
  notes: z.string().nullish(),
});

// POST — add a DRAFT roster row (manager only).
export async function POST(request: NextRequest, { params }: { params: { dept: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const dept = getRosterDept(params.dept);
  if (!dept) return NextResponse.json({ error: 'Unknown department' }, { status: 404 });
  if (!(await canManageRosterDeptFor(dept, { id: (session.user as any).id, role: (session.user as any).role }))) {
    return NextResponse.json({ error: 'Not authorised to manage this department roster' }, { status: 403 });
  }
  const body = await request.json();
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  // A department may not work every shift (anaesthetists have no NIGHT rota), so
  // reject anything its own shift list doesn't offer.
  const allowedShifts = getShiftOptions(dept);
  if (!allowedShifts.some((s) => s.value === d.shift)) {
    return NextResponse.json(
      { error: `${dept.label} rosters only use: ${allowedShifts.map((s) => s.label).join(', ')}` },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { id: d.userId }, select: { id: true, fullName: true } });
  if (!user) return NextResponse.json({ error: 'Staff not found' }, { status: 404 });

  const row = await prisma.roster.create({
    data: {
      userId: user.id, staffName: user.fullName, staffCategory: dept.category as any,
      date: dateOnly(d.date), shift: d.shift, subRole: d.subRole ?? null, seniorityLevel: d.seniorityLevel ?? null,
      location: d.location ?? 'MAIN_THEATRE', theatreId: d.theatreId ?? null, notes: d.notes ?? null,
      status: 'DRAFT', uploadedBy: (session.user as any).id,
    },
  });
  return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
}

// DELETE ?id= — remove a DRAFT row (manager only). Published rows are immutable
// here; change them by editing the draft and re-publishing.
export async function DELETE(request: NextRequest, { params }: { params: { dept: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const dept = getRosterDept(params.dept);
  if (!dept) return NextResponse.json({ error: 'Unknown department' }, { status: 404 });
  if (!(await canManageRosterDeptFor(dept, { id: (session.user as any).id, role: (session.user as any).role }))) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const row = await prisma.roster.findUnique({ where: { id }, select: { status: true, staffCategory: true } });
  if (!row || row.staffCategory !== dept.category) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (row.status !== 'DRAFT') return NextResponse.json({ error: 'Only draft rows can be deleted here. Use stage-removal for published rows.' }, { status: 409 });
  await prisma.roster.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

const patchSchema = z.object({
  id: z.string(),
  pendingRemoval: z.boolean().optional(), // stage/un-stage a PUBLISHED row
  date: z.string().optional(),            // move a DRAFT row (drag & drop)
  shift: z.enum(['MORNING', 'CALL', 'NIGHT']).optional(),
  // Full edit of one assignment. Kept under its own key so a drag-move
  // (bare date/shift, above) stays unambiguous.
  edit: z
    .object({
      userId: z.string().optional(),
      date: z.string().optional(),
      shift: z.enum(['MORNING', 'CALL', 'NIGHT']).optional(),
      subRole: z.string().nullish(),
      seniorityLevel: z.string().nullish(),
      location: z.string().nullish(),
      notes: z.string().nullish(),
    })
    .optional(),
});

// PATCH — three operations, manager only:
//   • edit an assignment (staff, day, shift, seniority, assignment, notes).
//   • stage/un-stage a PUBLISHED row for removal (pendingRemoval). The row stays
//     live until the next Publish (draft-style editing of published rosters).
//   • move a DRAFT row to another day/shift (date/shift) — drag & drop.
export async function PATCH(request: NextRequest, { params }: { params: { dept: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const dept = getRosterDept(params.dept);
  if (!dept) return NextResponse.json({ error: 'Unknown department' }, { status: 404 });
  if (!(await canManageRosterDeptFor(dept, { id: (session.user as any).id, role: (session.user as any).role }))) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 });
  }
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const d = parsed.data;
  const row = await prisma.roster.findUnique({ where: { id: d.id } });
  if (!row || row.staffCategory !== dept.category) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  /**
   * Edit an assignment.
   *
   * A DRAFT is changed in place. A PUBLISHED row is NOT: editing it directly
   * would rewrite what the department has already signed off and what the
   * on-duty resolver, meal counts and booking are reading right now, while the
   * version history went on claiming v-N said something else. Instead the
   * published row is staged for removal and the edit becomes a new draft
   * alongside it — so the live roster keeps working, the change is visible as
   * pending, and Publish swaps them together. Exactly what editing a published
   * roster already meant here; it just did it in two manual steps.
   */
  if (d.edit) {
    const e = d.edit;
    const allowedShifts = getShiftOptions(dept);
    if (e.shift && !allowedShifts.some((s) => s.value === e.shift)) {
      return NextResponse.json(
        { error: `${dept.label} rosters only use: ${allowedShifts.map((s) => s.label).join(', ')}` },
        { status: 400 },
      );
    }

    // Changing who is assigned has to carry the name across too — staffName is
    // what the roster shows and what the Excel export prints.
    let staffName = row.staffName;
    let userId = row.userId;
    if (e.userId && e.userId !== row.userId) {
      const user = await prisma.user.findUnique({ where: { id: e.userId }, select: { id: true, fullName: true } });
      if (!user) return NextResponse.json({ error: 'Staff not found' }, { status: 404 });
      userId = user.id;
      staffName = user.fullName;
    }

    const next = {
      userId,
      staffName,
      date: e.date ? dateOnly(e.date) : row.date,
      shift: (e.shift ?? row.shift) as any,
      subRole: e.subRole === undefined ? row.subRole : (e.subRole || null),
      seniorityLevel: e.seniorityLevel === undefined ? row.seniorityLevel : (e.seniorityLevel || null),
      location: e.location === undefined ? row.location : (e.location || null),
      notes: e.notes === undefined ? row.notes : (e.notes || null),
    };

    if (row.status === 'DRAFT') {
      await prisma.roster.update({ where: { id: row.id }, data: next });
      return NextResponse.json({ ok: true, mode: 'draft-updated' });
    }

    const [, created] = await prisma.$transaction([
      prisma.roster.update({ where: { id: row.id }, data: { pendingRemoval: true } }),
      prisma.roster.create({
        data: {
          ...next,
          staffCategory: dept.category as any,
          theatreId: row.theatreId,
          status: 'DRAFT',
          uploadedBy: (session.user as any).id,
        },
      }),
    ]);
    return NextResponse.json({ ok: true, mode: 'draft-replacement', id: created.id });
  }

  // Move a draft (drag & drop).
  if (d.date || d.shift) {
    if (row.status !== 'DRAFT') return NextResponse.json({ error: 'Only draft rows can be moved. Stage the published row and add a new draft instead.' }, { status: 409 });
    const allowedShifts = getShiftOptions(dept);
    if (d.shift && !allowedShifts.some((s) => s.value === d.shift)) {
      return NextResponse.json(
        { error: `${dept.label} rosters only use: ${allowedShifts.map((s) => s.label).join(', ')}` },
        { status: 400 },
      );
    }
    await prisma.roster.update({
      where: { id: d.id },
      data: { ...(d.date ? { date: dateOnly(d.date) } : {}), ...(d.shift ? { shift: d.shift } : {}) },
    });
    return NextResponse.json({ ok: true });
  }

  // Stage/un-stage a published row.
  if (typeof d.pendingRemoval === 'boolean') {
    if (row.status !== 'PUBLISHED') return NextResponse.json({ error: 'Only published rows can be staged for removal' }, { status: 409 });
    await prisma.roster.update({ where: { id: d.id }, data: { pendingRemoval: d.pendingRemoval } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
}
