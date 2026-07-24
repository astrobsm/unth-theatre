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
const addDaysUTC = (d: Date, n: number) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };

const schema = z.object({
  mode: z.enum(['week', 'day']),
  weekStart: z.string().optional(),      // for mode=week (target week Monday)
  sourceDate: z.string().optional(),     // for mode=day
  targetDate: z.string().optional(),     // for mode=day
});

// POST /api/roster/departments/[dept]/copy
// Bulk-clone a prior period into DRAFT rows for this department.
//   mode=week : copies the PREVIOUS week (weekStart-7) into the target week.
//   mode=day  : copies sourceDate's rows into targetDate.
// Existing (same user + date + shift) rows are skipped so re-running is safe.
export async function POST(request: NextRequest, { params }: { params: { dept: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const dept = getRosterDept(params.dept);
  if (!dept) return NextResponse.json({ error: 'Unknown department' }, { status: 404 });
  if (!canManageRosterDept(dept, (session.user as any).role)) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const p = parsed.data;

  // Build (sourceStart..sourceEnd) and the day-offset applied to each copied row.
  let srcStart: Date, srcEnd: Date, offsetDays: number;
  if (p.mode === 'week') {
    if (!p.weekStart) return NextResponse.json({ error: 'weekStart required' }, { status: 400 });
    const target = dateOnly(p.weekStart);
    srcStart = addDaysUTC(target, -7);
    srcEnd = addDaysUTC(target, -1);
    offsetDays = 7;
  } else {
    if (!p.sourceDate || !p.targetDate) return NextResponse.json({ error: 'sourceDate and targetDate required' }, { status: 400 });
    srcStart = dateOnly(p.sourceDate);
    srcEnd = srcStart;
    offsetDays = Math.round((dateOnly(p.targetDate).getTime() - srcStart.getTime()) / 86_400_000);
  }

  const source = await prisma.roster.findMany({
    where: { staffCategory: dept.category as any, date: { gte: srcStart, lte: srcEnd } },
  });
  if (source.length === 0) return NextResponse.json({ ok: true, copied: 0, skipped: 0, message: 'No rows in the source period.' });

  // Existing rows in the destination range, keyed by user|date|shift, to skip dups.
  const destStart = addDaysUTC(srcStart, offsetDays);
  const destEnd = addDaysUTC(srcEnd, offsetDays);
  const existing = await prisma.roster.findMany({
    where: { staffCategory: dept.category as any, date: { gte: destStart, lte: destEnd } },
    select: { userId: true, date: true, shift: true },
  });
  const key = (uid: string, d: Date, sh: string) => `${uid}|${dateOnly(d).toISOString().slice(0, 10)}|${sh}`;
  const seen = new Set(existing.map((e) => key(e.userId, e.date, e.shift)));

  const toCreate = [] as any[];
  for (const r of source) {
    const newDate = addDaysUTC(dateOnly(r.date), offsetDays);
    const k = key(r.userId, newDate, r.shift);
    if (seen.has(k)) continue;
    seen.add(k);
    toCreate.push({
      userId: r.userId, staffName: r.staffName, staffCategory: r.staffCategory,
      seniorityLevel: r.seniorityLevel, subRole: r.subRole, location: r.location,
      date: newDate, theatreId: r.theatreId, shift: r.shift, notes: r.notes,
      status: 'DRAFT', uploadedBy: (session.user as any).id,
    });
  }
  if (toCreate.length) await prisma.roster.createMany({ data: toCreate });

  return NextResponse.json({ ok: true, copied: toCreate.length, skipped: source.length - toCreate.length });
}
