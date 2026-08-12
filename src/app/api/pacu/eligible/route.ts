import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pacu/eligible?date=YYYY-MM-DD
 *
 * Today's theatre list, for admitting a patient to recovery.
 *
 * Deliberately returns cases that are NOT yet marked complete, with a flag, so
 * the recovery nurse can tick the case off from her own screen. The old page
 * listed only COMPLETED surgeries, which meant a patient could be physically in
 * recovery and impossible to admit because nobody in theatre had pressed a
 * button — so the nurse either waited or recorded nothing. The patient is in the
 * room either way; the record should be able to catch up.
 *
 * Cases already admitted to PACU are excluded outright. PACUAssessment.surgeryId
 * is unique, so a second admission is impossible anyway — but offering the name
 * and then failing is worse than not offering it.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dateParam = req.nextUrl.searchParams.get('date');
  const target = dateParam ? new Date(dateParam) : new Date();
  if (Number.isNaN(target.getTime())) {
    return NextResponse.json({ error: 'Invalid date.' }, { status: 400 });
  }
  const startOfDay = new Date(target);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(target);
  endOfDay.setHours(23, 59, 59, 999);

  const surgeries = await prisma.surgery.findMany({
    where: {
      scheduledDate: { gte: startOfDay, lte: endOfDay },
      // Cancelled cases never reach recovery. Everything else on the day's list
      // is fair game, complete or not.
      status: { notIn: ['CANCELLED'] },
    },
    select: {
      id: true,
      procedureName: true,
      scheduledDate: true,
      scheduledTime: true,
      status: true,
      subspecialty: true,
      surgeonName: true,
      anesthesiaType: true,
      actualEndTime: true,
      patient: { select: { id: true, name: true, folderNumber: true, ward: true, age: true, gender: true } },
    },
    orderBy: [{ scheduledTime: 'asc' }],
  });

  // Already in recovery. One record per surgery by the unique constraint.
  const admitted = await prisma.pACUAssessment.findMany({
    where: { surgeryId: { in: surgeries.map((s) => s.id) } },
    select: { surgeryId: true },
  });
  const alreadyAdmitted = new Set(admitted.map((a) => a.surgeryId));

  const eligible = surgeries
    .filter((s) => !alreadyAdmitted.has(s.id))
    .map((s) => ({
      ...s,
      // Surfaced rather than filtered on, so the page can offer to tick it.
      isCompleted: s.status === 'COMPLETED',
    }));

  return NextResponse.json({
    date: startOfDay.toISOString().slice(0, 10),
    eligible,
    // Lets the page explain an empty list rather than just showing one. "No
    // cases today" and "all of today's cases are already in recovery" are
    // different situations and a nurse should not have to work out which.
    summary: {
      bookedToday: surgeries.length,
      alreadyAdmitted: alreadyAdmitted.size,
      eligible: eligible.length,
      notYetCompleted: eligible.filter((s) => !s.isCompleted).length,
    },
  });
}
