// ============================================================
// Operational analytics over a period
// ------------------------------------------------------------
// Loads the movement log for every case in the window, derives the timings,
// and hands them to lib/theatreOps/analytics. None of the arithmetic happens
// here — the same functions the tests exercise are the ones that produce what
// management reads.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { timingsFor } from '@/lib/theatreOps/durations';
import {
  bottlenecks,
  byDepartment,
  bySpecialty,
  byTheatre,
  delayTrend,
  overall,
  utilisation,
} from '@/lib/theatreOps/analytics';

export const dynamic = 'force-dynamic';

/** Management figures, not a clinical view. */
const CAN_VIEW = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC',
  'CONSULTANT_SURGEON', 'CONSULTANT_ANAESTHETIST',
];

/** "HH:MM" on a date, as an instant. */
function startInstant(date: Date, time: string | null): Date | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const d = new Date(date);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string } | undefined;
  if (!session?.user) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  if (!user?.role || !CAN_VIEW.includes(user.role)) {
    return NextResponse.json(
      { error: 'Theatre performance figures are shown to consultants and management.' },
      { status: 403 }
    );
  }

  const sp = request.nextUrl.searchParams;
  // Default to the last 30 days — long enough for a rate to mean something,
  // short enough to still describe how the theatre is running now.
  const to = sp.get('to') ? new Date(sp.get('to') as string) : new Date();
  const from = sp.get('from')
    ? new Date(sp.get('from') as string)
    : new Date(to.getTime() - 30 * 86_400_000);

  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);

  try {
    const [surgeries, delays, escalations] = await Promise.all([
      prisma.surgery.findMany({
        where: { scheduledDate: { gte: from, lte: to }, status: { notIn: ['CANCELLED'] } },
        select: {
          id: true,
          scheduledDate: true,
          scheduledTime: true,
          surgeryType: true,
          subspecialty: true,
          theatreId: true,
          location: true,
          movements: { select: { phase: true, timestamp: true } },
        },
        take: 5000,
      }),
      prisma.theatreDelayRecord.findMany({
        where: { recordedAt: { gte: from, lte: to } },
        select: { categoryCode: true, minutesLateAtRecord: true, recordedAt: true },
      }),
      prisma.theatreEscalation.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { notifiedRole: true, status: true, createdAt: true, acknowledgedAt: true, resolvedAt: true },
      }),
    ]);

    const cases = surgeries.map((s) => ({
      id: s.id,
      // The theatre id is an opaque key; the location is what a person calls
      // the room, so that is what the report is grouped by.
      theatreName: s.location ?? s.theatreId ?? null,
      specialty: s.subspecialty ?? null,
      surgeryType: s.surgeryType,
      timings: timingsFor({
        movements: s.movements.map((m) => ({ phase: m.phase as never, timestamp: m.timestamp })),
        scheduledStart: startInstant(s.scheduledDate, s.scheduledTime),
      }),
    }));

    // Days on which a list actually ran. A theatre that had no list on a day
    // had no session to utilise, so it is not counted against it.
    const daysWithLists = new Set(
      surgeries.map((s) => s.scheduledDate.toISOString().slice(0, 10))
    ).size;

    return NextResponse.json({
      period: { from, to, days: Math.round((to.getTime() - from.getTime()) / 86_400_000) },
      overall: overall(cases),
      byTheatre: byTheatre(cases),
      bySpecialty: bySpecialty(cases),
      utilisation: utilisation({ cases, daysWithLists }),
      bottlenecks: bottlenecks(
        delays.map((d) => ({
          categoryCode: d.categoryCode,
          minutesLate: d.minutesLateAtRecord,
          recordedAt: d.recordedAt,
        }))
      ),
      trend: delayTrend(
        delays.map((d) => ({
          categoryCode: d.categoryCode,
          minutesLate: d.minutesLateAtRecord,
          recordedAt: d.recordedAt,
        })),
        from,
        to
      ),
      byDepartment: byDepartment(escalations),
      totals: {
        cases: cases.length,
        delaysRecorded: delays.length,
        escalationsRaised: escalations.length,
        daysWithLists,
      },
    });
  } catch (error) {
    console.error('[theatre-ops] analytics failed:', error);
    return NextResponse.json({ error: 'Failed to produce the figures' }, { status: 500 });
  }
}
