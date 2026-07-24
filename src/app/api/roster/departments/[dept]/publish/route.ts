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

const schema = z.object({ weekStart: z.string(), notes: z.string().nullish() });

// Snapshot shape used for history/rollback — enough to recreate each roster row.
type SnapRow = {
  userId: string; staffName: string; staffCategory: string; seniorityLevel: string | null;
  subRole: string | null; location: string | null; date: string; theatreId: string | null;
  shift: string; notes: string | null;
};

// POST /api/roster/departments/[dept]/publish
// Publishes the week's DRAFT rows: archives the prior publication, records an
// immutable snapshot of the resulting published set, and flips the drafts to
// PUBLISHED (making them visible to on-duty / booking). Manager only.
export async function POST(request: NextRequest, { params }: { params: { dept: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const dept = getRosterDept(params.dept);
  if (!dept) return NextResponse.json({ error: 'Unknown department' }, { status: 404 });
  if (!canManageRosterDept(dept, (session.user as any).role)) {
    return NextResponse.json({ error: 'Not authorised to publish this department roster' }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const start = dateOnly(parsed.data.weekStart);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);

  const weekRows = await prisma.roster.findMany({
    where: { staffCategory: dept.category as any, date: { gte: start, lte: end } },
  });
  const drafts = weekRows.filter((r) => r.status === 'DRAFT');
  const staged = weekRows.filter((r) => r.status === 'PUBLISHED' && r.pendingRemoval);
  if (drafts.length === 0 && staged.length === 0) {
    return NextResponse.json({ error: 'Nothing to publish — no draft additions or staged removals this week.' }, { status: 400 });
  }

  const lastPub = await prisma.rosterPublication.findFirst({
    where: { department: dept.slug, periodStart: start },
    orderBy: { version: 'desc' },
  });
  const version = (lastPub?.version ?? 0) + 1;

  // The published set AFTER this publish = every week row EXCEPT the ones staged
  // for removal (drafts are about to be flipped to published; staged rows deleted).
  const finalRows = weekRows.filter((r) => !r.pendingRemoval);
  const snapshot: SnapRow[] = finalRows.map((r) => ({
    userId: r.userId, staffName: r.staffName, staffCategory: r.staffCategory,
    seniorityLevel: r.seniorityLevel, subRole: r.subRole, location: r.location,
    date: dateOnly(r.date).toISOString().slice(0, 10), theatreId: r.theatreId, shift: r.shift, notes: r.notes,
  }));

  const result = await prisma.$transaction(async (tx) => {
    // Archive prior published publications for this dept/week.
    await tx.rosterPublication.updateMany({
      where: { department: dept.slug, periodStart: start, status: 'PUBLISHED' },
      data: { status: 'ARCHIVED' },
    });
    const pub = await tx.rosterPublication.create({
      data: {
        department: dept.slug, category: dept.category, location: null,
        periodStart: start, periodEnd: end, version, status: 'PUBLISHED',
        publishedById: (session.user as any).id, publishedByName: (session.user as any).fullName ?? session.user.name ?? '',
        rowCount: finalRows.length, snapshot: JSON.stringify(snapshot), notes: parsed.data.notes ?? null,
      },
    });
    // Delete the staged-for-removal rows.
    if (staged.length) await tx.roster.deleteMany({ where: { id: { in: staged.map((s) => s.id) } } });
    // Flip drafts to published.
    if (drafts.length) {
      await tx.roster.updateMany({
        where: { id: { in: drafts.map((d) => d.id) } },
        data: { status: 'PUBLISHED', publicationId: pub.id, version },
      });
    }
    return pub;
  });

  return NextResponse.json({ ok: true, version: result.version, published: drafts.length, removed: staged.length, totalRows: finalRows.length });
}
