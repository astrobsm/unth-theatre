// ============================================================
// The live board — today's cases and whether they have started
// ------------------------------------------------------------
// Returns facts, not verdicts. Whether a case counts as late is decided by
// lib/theatreOps/delays, which both this board's client and the server-side
// detector use — so a case shown as red here is the same case the detector
// would flag, and neither can drift from the other.
//
// What this route DOES decide is what "started" means, because that draws on
// three sources: the movement log, the knife-to-skin field, and the older
// actualStartTime. Any one of them is enough.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  const dateParam = request.nextUrl.searchParams.get('date');
  const day = dateParam ? new Date(dateParam) : new Date();
  if (Number.isNaN(day.getTime())) {
    return NextResponse.json({ error: 'That is not a date.' }, { status: 400 });
  }

  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(23, 59, 59, 999);

  try {
    const rows = await prisma.surgery.findMany({
      where: {
        scheduledDate: { gte: dayStart, lte: dayEnd },
        status: { notIn: ['CANCELLED'] },
      },
      select: {
        id: true,
        procedureName: true,
        scheduledDate: true,
        scheduledTime: true,
        surgeryType: true,
        status: true,
        theatreId: true,
        knifeOnSkinTime: true,
        actualStartTime: true,
        patient: { select: { name: true } },
        // One is enough to know somebody has explained this case.
        delayRecords: { select: { id: true }, take: 1 },
        unexplainedDelay: { select: { id: true, reviewStatus: true } },
        movements: {
          where: { phase: 'SURGERY_STARTED' },
          select: { timestamp: true },
          orderBy: { timestamp: 'asc' },
          take: 1,
        },
      },
      orderBy: [{ scheduledTime: 'asc' }],
      take: 200,
    });

    const cases = rows.map((s) => ({
      id: s.id,
      procedureName: s.procedureName,
      scheduledDate: s.scheduledDate,
      scheduledTime: s.scheduledTime,
      surgeryType: s.surgeryType,
      status: s.status,
      theatreId: s.theatreId,
      patientName: s.patient?.name ?? null,
      // Started is started, however it was recorded.
      startedAt: s.movements[0]?.timestamp ?? s.knifeOnSkinTime ?? s.actualStartTime ?? null,
      hasDelayRecord: s.delayRecords.length > 0,
      flagged: Boolean(s.unexplainedDelay),
    }));

    return NextResponse.json({
      cases,
      totals: {
        scheduled: cases.length,
        started: cases.filter((c) => c.startedAt).length,
        awaiting: cases.filter((c) => !c.startedAt).length,
        explained: cases.filter((c) => !c.startedAt && c.hasDelayRecord).length,
        flagged: cases.filter((c) => c.flagged).length,
      },
    });
  } catch (error) {
    console.error('[theatre-ops] board failed:', error);
    return NextResponse.json({ error: 'Failed to load the board' }, { status: 500 });
  }
}
