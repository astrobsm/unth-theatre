import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const dateOnly = (s: string) => {
  const d = new Date(s);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};

// GET /api/roster/conflicts?weekStart=YYYY-MM-DD
// Flags double-bookings: a staff member rostered to more than one assignment on
// the SAME day + shift (across all departments/theatres). Returns a set of the
// conflicting roster row ids so any department page can highlight its own rows.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const weekStart = new URL(request.url).searchParams.get('weekStart');
  if (!weekStart) return NextResponse.json({ error: 'Missing weekStart' }, { status: 400 });
  const start = dateOnly(weekStart);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);

  const rows = await prisma.roster.findMany({
    where: { date: { gte: start, lte: end } },
    select: { id: true, userId: true, staffName: true, date: true, shift: true, staffCategory: true, theatreId: true },
  });

  // Group by user | date | shift.
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${r.userId}|${r.date.toISOString().slice(0, 10)}|${r.shift}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }

  const conflicts: Array<{ userId: string; staffName: string; date: string; shift: string; count: number; categories: string[]; rowIds: string[] }> = [];
  const conflictRowIds: string[] = [];
  for (const list of Array.from(groups.values())) {
    if (list.length > 1) {
      conflicts.push({
        userId: list[0].userId, staffName: list[0].staffName,
        date: list[0].date.toISOString().slice(0, 10), shift: list[0].shift, count: list.length,
        categories: Array.from(new Set(list.map((r: (typeof rows)[number]) => r.staffCategory))),
        rowIds: list.map((r: (typeof rows)[number]) => r.id),
      });
      conflictRowIds.push(...list.map((r: (typeof rows)[number]) => r.id));
    }
  }

  return NextResponse.json({ weekStart: start.toISOString().slice(0, 10), conflicts, conflictRowIds });
}
