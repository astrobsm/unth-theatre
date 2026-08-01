// ============================================================
// Emergency response monitoring
// ------------------------------------------------------------
// Read-only. The acknowledgements themselves are recorded through
// /api/emergency-team-availability, which has existed since before this
// module and is what the emergency booking page already posts to. Nothing
// here duplicates it — this endpoint answers the one question that had
// nowhere to be asked: who has NOT responded, and how long have we waited?
//
// The board is assembled from lib/theatreOps/emergencyResponse, so the rows a
// coordinator reads are produced by the same functions the tests exercise.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import {
  responseBoard,
  summarise,
  urgencyOrder,
  RESPONSE_OVERDUE_MINUTES,
  RESPONSE_TARGET_MINUTES,
} from '@/lib/theatreOps/emergencyResponse';

export const dynamic = 'force-dynamic';

/** Bookings that are still waiting on people. Completed ones are history. */
const LIVE_STATUSES = ['SUBMITTED', 'APPROVED', 'THEATRE_ASSIGNED', 'IN_PROGRESS'] as const;

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  // Default to the last day. An emergency older than that is not a board any
  // more, it is a record — and the history view asks for it explicitly.
  const hours = Math.min(720, Math.max(1, Number(sp.get('hours') ?? 24)));
  const includeSettled = sp.get('all') === '1';

  const now = new Date();
  const since = new Date(now.getTime() - hours * 3_600_000);

  try {
    const bookings = await prisma.emergencySurgeryBooking.findMany({
      where: {
        requestedAt: { gte: since },
        ...(includeSettled ? {} : { status: { in: LIVE_STATUSES as unknown as string[] } as never }),
      },
      select: {
        id: true,
        patientName: true,
        folderNumber: true,
        procedureName: true,
        surgicalUnit: true,
        diagnosis: true,
        theatreName: true,
        surgeonName: true,
        priority: true,
        classification: true,
        status: true,
        requestedAt: true,
        requiredByTime: true,
        alertsSentAt: true,
        teamAvailability: {
          select: {
            teamRole: true,
            userId: true,
            userName: true,
            status: true,
            respondedAt: true,
            arrivedAt: true,
            estimatedArrivalMin: true,
            distanceKm: true,
            deviceLabel: true,
            notes: true,
          },
        },
      },
      orderBy: { requestedAt: 'desc' },
      take: 100,
    });

    const cases = bookings.map((b) => {
      const board = responseBoard({
        requestedAt: b.requestedAt,
        now,
        // A finished or cancelled emergency is a record, not a board.
        closed: b.status === 'COMPLETED' || b.status === 'CANCELLED',
        responses: b.teamAvailability.map((t) => ({
          role: t.teamRole,
          userId: t.userId,
          userName: t.userName,
          status: t.status,
          respondedAt: t.respondedAt,
          etaMinutes: t.estimatedArrivalMin,
          distanceKm: t.distanceKm,
        })),
      });

      return {
        id: b.id,
        patientName: b.patientName,
        folderNumber: b.folderNumber,
        procedureName: b.procedureName,
        diagnosis: b.diagnosis,
        unit: b.surgicalUnit,
        theatre: b.theatreName,
        surgeonName: b.surgeonName,
        priority: b.priority,
        classification: b.classification,
        status: b.status,
        requestedAt: b.requestedAt,
        requiredByTime: b.requiredByTime,
        alertsSentAt: b.alertsSentAt,
        board,
        summary: summarise(board),
      };
    });

    const ordered = urgencyOrder(cases);

    return NextResponse.json({
      now,
      windowHours: hours,
      targetMinutes: RESPONSE_TARGET_MINUTES,
      overdueMinutes: RESPONSE_OVERDUE_MINUTES,
      cases: ordered,
      totals: {
        emergencies: ordered.length,
        // Closed cases are excluded from both counts. A finished emergency
        // that nobody acknowledged is not a theatre waiting on anyone.
        blocked: ordered.filter((c) => !c.board.closed && !c.board.canProceed).length,
        awaitingAnyone: ordered.filter(
          (c) => !c.board.closed && c.board.awaiting + c.board.overdue > 0
        ).length,
      },
    });
  } catch (error) {
    console.error('[theatre-ops] emergency response board failed:', error);
    return NextResponse.json({ error: 'Failed to load the emergency response board' }, { status: 500 });
  }
}
