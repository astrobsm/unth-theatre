import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { getRosterDept, canManageRosterDept } from '@/lib/rosterDepartments';

export const dynamic = 'force-dynamic';

const dateOnly = (s: string | Date) => {
  const d = new Date(s);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};

// GET /api/roster/departments/[dept]/versions?weekStart=YYYY-MM-DD
// Version history for the week.
export async function GET(request: NextRequest, { params }: { params: { dept: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const dept = getRosterDept(params.dept);
  if (!dept) return NextResponse.json({ error: 'Unknown department' }, { status: 404 });
  const weekStart = new URL(request.url).searchParams.get('weekStart');
  if (!weekStart) return NextResponse.json({ error: 'Missing weekStart' }, { status: 400 });

  const versions = await prisma.rosterPublication.findMany({
    where: { department: dept.slug, periodStart: dateOnly(weekStart) },
    orderBy: { version: 'desc' },
    select: { id: true, version: true, status: true, publishedAt: true, publishedByName: true, rowCount: true, notes: true },
  });
  return NextResponse.json({ versions });
}

const rollbackSchema = z.object({ weekStart: z.string(), version: z.number().int() });

// POST — roll the week back to a chosen published version: recreate that
// version's rows and record a new publication marking the rollback. Manager only.
export async function POST(request: NextRequest, { params }: { params: { dept: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const dept = getRosterDept(params.dept);
  if (!dept) return NextResponse.json({ error: 'Unknown department' }, { status: 404 });
  if (!canManageRosterDept(dept, (session.user as any).role)) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 });
  }
  const parsed = rollbackSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const start = dateOnly(parsed.data.weekStart);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);

  const target = await prisma.rosterPublication.findFirst({
    where: { department: dept.slug, periodStart: start, version: parsed.data.version },
  });
  if (!target) return NextResponse.json({ error: 'Version not found' }, { status: 404 });

  let snap: any[] = [];
  try { snap = JSON.parse(target.snapshot); } catch { snap = []; }

  const lastPub = await prisma.rosterPublication.findFirst({
    where: { department: dept.slug, periodStart: start }, orderBy: { version: 'desc' },
  });
  const newVersion = (lastPub?.version ?? 0) + 1;

  await prisma.$transaction(async (tx) => {
    // Replace the week's rows for this department with the target snapshot.
    await tx.roster.deleteMany({ where: { staffCategory: dept.category as any, date: { gte: start, lte: end } } });
    await tx.rosterPublication.updateMany({
      where: { department: dept.slug, periodStart: start, status: 'PUBLISHED' }, data: { status: 'ARCHIVED' },
    });
    const pub = await tx.rosterPublication.create({
      data: {
        department: dept.slug, category: dept.category, periodStart: start, periodEnd: end,
        version: newVersion, status: 'PUBLISHED',
        publishedById: (session.user as any).id, publishedByName: (session.user as any).fullName ?? session.user.name ?? '',
        rowCount: snap.length, snapshot: target.snapshot, notes: `Rolled back to v${target.version}`,
      },
    });
    if (snap.length) {
      await tx.roster.createMany({
        data: snap.map((r) => ({
          userId: r.userId, staffName: r.staffName, staffCategory: r.staffCategory as any,
          seniorityLevel: r.seniorityLevel ?? null, subRole: r.subRole ?? null, location: r.location ?? 'MAIN_THEATRE',
          date: dateOnly(r.date), theatreId: r.theatreId ?? null, shift: r.shift, notes: r.notes ?? null,
          status: 'PUBLISHED', publicationId: pub.id, version: newVersion, uploadedBy: (session.user as any).id,
        })),
      });
    }
  });

  return NextResponse.json({ ok: true, newVersion, restoredFrom: target.version, rows: snap.length });
}
