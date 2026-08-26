import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/apiError';
import { isPhase, type RecordedPhase } from '@/lib/theatreOps/milestones';
import { sortTracker, trackCase, trackerSummary } from '@/lib/dashboard/perioperativeTracker';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard/my-patients
 *
 * Where each of this surgeon's patients actually is, right now.
 *
 * Scoped to the session user and never to a surgeon id from the request. The
 * same rule as the personal board: a caller who could ask for somebody else's
 * list would be reading another consultant's patients.
 *
 * "Mine" means the cases this person booked or is named on — surgeon,
 * assistant, or supervising consultant. A consultant supervising a registrar's
 * list needs to see it, and a registrar operating on a consultant's patient is
 * not the person the consultant is asking about.
 */

/** Local day boundaries. A theatre list is a local day, not a UTC one. */
const WAT_OFFSET_MINUTES = 60;

function localDayBounds(now: Date, daysAhead: number): { start: Date; end: Date } {
  const shifted = new Date(now.getTime() + WAT_OFFSET_MINUTES * 60_000);
  const start = new Date(Date.UTC(
    shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), 0, 0, 0, 0,
  ));
  return {
    start: new Date(start.getTime() - WAT_OFFSET_MINUTES * 60_000),
    end: new Date(start.getTime() + (daysAhead + 1) * 24 * 60 * 60_000 - WAT_OFFSET_MINUTES * 60_000),
  };
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const now = new Date();
  // Today by default. A surgeon checking tomorrow's list is a different
  // question from "where is my patient", so it is opt-in rather than the
  // default that dilutes the tracker.
  const daysAhead = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days') ?? 0) || 0, 0), 7);
  const { start, end } = localDayBounds(now, daysAhead);

  try {
    const surgeries = await prisma.surgery.findMany({
      where: {
        scheduledDate: { gte: start, lte: end },
        status: { notIn: ['CANCELLED'] },
        OR: [
          { surgeonId: userId },
          { assistantSurgeonId: userId },
          { supervisingConsultantId: userId },
        ],
      },
      select: {
        id: true, procedureName: true, scheduledDate: true, scheduledTime: true,
        status: true, theatreId: true,
        // See my-board: the boolean is the whole question being asked.
        consentFileName: true, consentSignedElectronically: true,
        consentCompletedAt: true, preopOutstanding: true,
        // A nurse confirming at the pre-operative visit that the signed form is
        // in the folder counts as consent, the same as it does at the
        // holding-area door. Newest visit only: an earlier OBTAINED must not
        // outvote a later visit that found it missing.
        preOperativeVisits: {
          select: { consentStatus: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        patient: { select: { name: true, folderNumber: true } },
        movements: { select: { phase: true, timestamp: true } },
        preOpReviews: {
          orderBy: { reviewDate: 'desc' },
          take: 1,
          select: {
            fitnessDecision: true,
            optimisationRequirements: { select: { status: true } },
          },
        },
      },
      orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
      take: 60,
    });

    // Theatre names are a soft reference with no foreign key, so they are
    // looked up rather than joined.
    const theatreIds = Array.from(
      new Set(surgeries.map((s) => s.theatreId).filter((x): x is string => !!x)),
    );
    const names = new Map<string, string>();
    if (theatreIds.length) {
      const rooms = await prisma.theatreSuite.findMany({
        where: { id: { in: theatreIds } },
        select: { id: true, name: true },
      });
      for (const r of rooms) names.set(r.id, r.name);
    }

    const rows = surgeries.map((s) => {
      const review = s.preOpReviews[0];
      const movements: RecordedPhase[] = s.movements
        .filter((m) => isPhase(m.phase))
        .map((m) => ({ phase: m.phase as RecordedPhase['phase'], timestamp: m.timestamp }));

      return trackCase({
        surgery: {
          id: s.id,
          procedureName: s.procedureName,
          patientName: s.patient?.name ?? null,
          folderNumber: s.patient?.folderNumber ?? null,
          theatreName: s.theatreId ? (names.get(s.theatreId) ?? null) : null,
          scheduledDate: s.scheduledDate,
          scheduledTime: s.scheduledTime,
          status: s.status,
        },
        movements,
        now,
        fitness: review
          ? {
              decision: review.fitnessDecision,
              outstandingRequirements: review.optimisationRequirements
                .filter((r) => r.status !== 'VERIFIED').length,
            }
          : null,
        hasAnaestheticReview: !!review,
        hasConsent: Boolean(
          s.consentFileName || s.consentSignedElectronically || s.consentCompletedAt
          || s.preOperativeVisits?.[0]?.consentStatus === 'OBTAINED',
        ),
        preopOutstanding: s.preopOutstanding,
      });
    });

    const sorted = sortTracker(rows);
    return NextResponse.json({
      patients: sorted,
      summary: trackerSummary(sorted),
      checkedAt: now.toISOString(),
    });
  } catch (err) {
    return apiError('dashboard.my-patients', err);
  }
}
