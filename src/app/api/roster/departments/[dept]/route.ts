import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { getRosterDept, canManageRosterDept } from '@/lib/rosterDepartments';

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
  const role = (session.user as any).role;

  return NextResponse.json({
    department: { slug: dept.slug, label: dept.label, category: dept.category, subRoles: dept.subRoles ?? [], seniorityLevels: dept.seniorityLevels ?? [], userRoles: dept.userRoles },
    weekStart: start.toISOString().slice(0, 10),
    canManage: canManageRosterDept(dept, role),
    currentVersion: latestPublication?.version ?? 0,
    lastPublishedAt: latestPublication?.publishedAt ?? null,
    draftCount,
    rows: rows.map((r) => ({
      id: r.id, userId: r.userId, staffName: r.staffName,
      staffCode: r.user?.staffCode ?? null, phoneNumber: r.user?.phoneNumber ?? null, extension: r.user?.extension ?? null,
      date: r.date.toISOString().slice(0, 10), shift: r.shift, subRole: r.subRole, seniorityLevel: r.seniorityLevel,
      location: r.location, theatreId: r.theatreId, notes: r.notes, status: r.status, version: r.version,
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
  if (!canManageRosterDept(dept, (session.user as any).role)) {
    return NextResponse.json({ error: 'Not authorised to manage this department roster' }, { status: 403 });
  }
  const body = await request.json();
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

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
  if (!canManageRosterDept(dept, (session.user as any).role)) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const row = await prisma.roster.findUnique({ where: { id }, select: { status: true, staffCategory: true } });
  if (!row || row.staffCategory !== dept.category) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (row.status !== 'DRAFT') return NextResponse.json({ error: 'Only draft rows can be deleted here' }, { status: 409 });
  await prisma.roster.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
