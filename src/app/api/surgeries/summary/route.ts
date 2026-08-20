import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/surgeries/summary?date=YYYY-MM-DD
 *
 * How many cases each surgical unit has, and nothing else — no patients, no
 * procedures, no consent scans. It exists so the surgery page can draw a card
 * per unit without loading a single case.
 *
 * The page used to fetch every surgery and group them in the browser, which
 * meant downloading the entire theatre list to find out that Neurosurgery has
 * four cases. This answers that question with a GROUP BY and a few hundred
 * bytes; the cases themselves arrive only when somebody opens a unit.
 *
 * Counts come from the database rather than from a fetched list on purpose: a
 * count computed by counting things you already downloaded is not a saving.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dateStr = req.nextUrl.searchParams.get('date');
  const where: Record<string, unknown> = {};

  if (dateStr) {
    const base = new Date(dateStr);
    if (Number.isNaN(base.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    }
    const start = new Date(base); start.setHours(0, 0, 0, 0);
    const end = new Date(base); end.setHours(23, 59, 59, 999);
    where.scheduledDate = { gte: start, lte: end };
  }

  const [byUnit, byStatus, total] = await Promise.all([
    prisma.surgery.groupBy({
      by: ['unit'],
      where,
      _count: { _all: true },
      orderBy: { _count: { id: 'desc' } },
    }),
    prisma.surgery.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    }),
    prisma.surgery.count({ where }),
  ]);

  // A second pass for the counts that decide whether a card needs attention.
  // Grouped in one query rather than one query per unit, which is the shape
  // this endpoint exists to avoid.
  const urgent = await prisma.surgery.groupBy({
    by: ['unit'],
    where: { ...where, surgeryType: 'EMERGENCY' },
    _count: { _all: true },
  });
  const urgentByUnit = new Map(urgent.map((u) => [u.unit, u._count._all]));

  const scheduled = await prisma.surgery.groupBy({
    by: ['unit'],
    where: { ...where, status: 'SCHEDULED' },
    _count: { _all: true },
  });
  const scheduledByUnit = new Map(scheduled.map((u) => [u.unit, u._count._all]));

  return NextResponse.json({
    date: dateStr ?? null,
    total,
    units: byUnit.map((u) => ({
      unit: u.unit,
      cases: u._count._all,
      scheduled: scheduledByUnit.get(u.unit) ?? 0,
      emergencies: urgentByUnit.get(u.unit) ?? 0,
    })),
    statuses: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
  });
}
