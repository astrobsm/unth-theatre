import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/holding-area/eligible?date=YYYY-MM-DD
 *
 * Cases that may be admitted to the holding area right now: booked for TODAY,
 * and already called up from the ward.
 *
 * Two filters, both deliberate:
 *
 * 1. TODAY ONLY. The previous list showed every SCHEDULED case ever booked, so
 *    the nurse scrolled a list of hundreds to find one of a dozen — and could
 *    admit next month's case by mistyping a click.
 *
 * 2. CALLED UP ONLY. A patient arrives in the holding area BECAUSE the theatre
 *    asked the ward to send them. If no call-up exists, either the patient is
 *    not on their way or the call was never recorded — and admitting them here
 *    would paper over a broken step in the chain.
 *
 * A separate endpoint rather than more parameters on /api/surgeries: that route
 * feeds the theatre list, the boards and the calendar, and this filter is
 * meaningless to all of them.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dateParam = req.nextUrl.searchParams.get('date');
  // Same day arithmetic as the call-for-patient board, so the two screens
  // always agree about which cases are "today".
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
      status: { in: ['SCHEDULED', 'READY_FOR_THEATRE'] },
    },
    select: {
      id: true,
      procedureName: true,
      scheduledDate: true,
      scheduledTime: true,
      subspecialty: true,
      surgeonName: true,
      // Surgery has theatreId (a soft reference), not a theatre name column.
      theatreId: true,
      // What consent or labs were deferred at booking. The holding area is the
      // last check before the theatre door, so this is where it must show.
      preopOutstanding: true,
      preopOverrideReason: true,
      preopOverrideByName: true,
      patient: { select: { id: true, name: true, folderNumber: true, ward: true } },
    },
    orderBy: [{ scheduledTime: 'asc' }],
  });

  // Which of them have been called up. Queried separately rather than as a
  // relation filter so the response can say WHEN each was called — a nurse
  // deciding whether to chase the ward needs that, not just a yes.
  const callUps = await prisma.patientCallUp.findMany({
    where: { surgeryId: { in: surgeries.map((s) => s.id) } },
    select: { surgeryId: true, invitedAt: true, ward: true, assignedPorterName: true },
    orderBy: { invitedAt: 'desc' },
  });

  const calledBySurgery = new Map<string, (typeof callUps)[number]>();
  for (const c of callUps) {
    // Newest first from the query, so the first one seen for a surgery is the
    // most recent call — a patient can be called more than once.
    if (!calledBySurgery.has(c.surgeryId)) calledBySurgery.set(c.surgeryId, c);
  }

  // Already in the holding area, so they must not be offered for admission
  // twice. An open assessment is one with no clearance decision recorded yet.
  const alreadyIn = await prisma.holdingAreaAssessment.findMany({
    where: {
      surgeryId: { in: surgeries.map((s) => s.id) },
      // The real terminal states. A patient already cleared or already through
      // the door must not be offered for admission again.
      status: { notIn: ['CLEARED_FOR_THEATRE', 'ENROUTE_TO_THEATRE', 'TRANSFERRED_TO_THEATRE'] },
    },
    select: { surgeryId: true },
  });
  const inHolding = new Set(alreadyIn.map((a) => a.surgeryId));

  const eligible = surgeries
    .filter((s) => calledBySurgery.has(s.id) && !inHolding.has(s.id))
    .map((s) => {
      const call = calledBySurgery.get(s.id)!;
      return {
        ...s,
        calledAt: call.invitedAt,
        calledFromWard: call.ward ?? s.patient?.ward ?? null,
        porterName: call.assignedPorterName ?? null,
      };
    });

  return NextResponse.json({
    date: startOfDay.toISOString().slice(0, 10),
    eligible,
    // Counts so the page can explain an empty list instead of just showing one.
    // "No patients" and "nobody has been called up yet" are different problems
    // with different fixes, and a nurse should not have to guess which she has.
    summary: {
      bookedToday: surgeries.length,
      calledUp: calledBySurgery.size,
      alreadyInHolding: inHolding.size,
      eligible: eligible.length,
    },
  });
}
