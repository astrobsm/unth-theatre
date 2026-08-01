// ============================================================
// The delay detector — the thing that actually watches
// ------------------------------------------------------------
// assessDelay knows when a case is late. Until something calls it on a
// schedule, it knows that privately and nobody is ever told. This is that
// something.
//
// Runs every five minutes. It looks at cases due today that have not started,
// and raises an unexplained record for any that passed forty-five minutes with
// no reason recorded.
//
// IDEMPOTENT BY CONSTRUCTION. theatre_unexplained_delays.surgeryId is unique,
// so a case cannot be flagged twice however often this runs — and it runs
// often. Without that, a five-minute schedule would raise twelve records an
// hour for the same case and every report built on them would be wrong.
//
// It raises nothing against a case that has been explained, and withdraws a
// flag if an explanation arrives afterwards (see the delays route).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { assessDelay, assessEmergency } from '@/lib/theatreOps/delays';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];

async function authorise(request: NextRequest): Promise<{ ok: boolean; who: string; status?: number }> {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') === `Bearer ${secret}`) {
    return { ok: true, who: 'scheduled' };
  }
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user) return { ok: false, who: '', status: 401 };
  if (!role || !ADMIN_ROLES.includes(role)) return { ok: false, who: '', status: 403 };
  return { ok: true, who: 'administrator' };
}

/** "HH:MM" on a date, as an instant. Null when the time is unreadable. */
function startInstant(date: Date, time: string | null): Date | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const d = new Date(date);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

export async function GET(request: NextRequest) {
  const auth = await authorise(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Sign in to continue.' : 'Only an administrator may run the detector.' },
      { status: auth.status ?? 403 }
    );
  }

  const dryRun = auth.who !== 'scheduled' && request.nextUrl.searchParams.get('commit') !== 'true';
  const now = new Date();

  try {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

    const cases = await prisma.surgery.findMany({
      where: {
        scheduledDate: { gte: dayStart, lte: dayEnd },
        status: { notIn: ['CANCELLED', 'COMPLETED'] },
      },
      select: {
        id: true,
        procedureName: true,
        scheduledDate: true,
        scheduledTime: true,
        surgeryType: true,
        createdAt: true,
        knifeOnSkinTime: true,
        actualStartTime: true,
        // Whether anybody has explained this case. One record is enough.
        delayRecords: { select: { id: true }, take: 1 },
        unexplainedDelay: { select: { id: true } },
        movements: {
          where: { phase: 'SURGERY_STARTED' },
          select: { timestamp: true },
          take: 1,
        },
      },
    });

    const toRaise: Array<{ surgeryId: string; minutesLate: number; isEmergency: boolean }> = [];
    let alreadyFlagged = 0;
    let explained = 0;
    let running = 0;

    for (const c of cases) {
      // Started is started, whichever way it was recorded.
      const startedAt = c.movements[0]?.timestamp ?? c.knifeOnSkinTime ?? c.actualStartTime ?? null;
      if (startedAt) { running += 1; continue; }

      const documented = c.delayRecords.length > 0;
      if (documented) explained += 1;

      const assessment =
        c.surgeryType === 'EMERGENCY'
          ? assessEmergency({ bookedAt: c.createdAt, startedAt, documented, now })
          : assessDelay({
              scheduledStart: startInstant(c.scheduledDate, c.scheduledTime),
              startedAt,
              documented,
              now,
            });

      if (!assessment.needsUnexplainedRecord) continue;

      // Already flagged — the unique constraint would refuse it anyway, but
      // counting it here keeps the run's report honest.
      if (c.unexplainedDelay) { alreadyFlagged += 1; continue; }

      toRaise.push({
        surgeryId: c.id,
        minutesLate: assessment.minutesLate ?? 0,
        isEmergency: c.surgeryType === 'EMERGENCY',
      });
    }

    if (dryRun) {
      return NextResponse.json({
        committed: false,
        checked: cases.length,
        running,
        explained,
        alreadyFlagged,
        wouldRaise: toRaise.length,
        cases: toRaise,
      });
    }

    let raised = 0;
    for (const r of toRaise) {
      try {
        await prisma.theatreUnexplainedDelay.create({
          data: {
            surgeryId: r.surgeryId,
            minutesLate: r.minutesLate,
            isEmergency: r.isEmergency,
            detectedAt: now,
          },
        });
        raised += 1;
      } catch (err) {
        // A race with another run, or with somebody recording a reason at the
        // same moment. The unique constraint did its job; carry on.
        if ((err as { code?: string }).code !== 'P2002') throw err;
      }
    }

    if (raised > 0) {
      console.log(`[delay-detector] raised ${raised} unexplained record(s) at ${now.toISOString()} (${auth.who})`);
    }

    return NextResponse.json({
      committed: true,
      checked: cases.length,
      running,
      explained,
      alreadyFlagged,
      raised,
      ranBy: auth.who,
    });
  } catch (error) {
    console.error('[delay-detector] run failed:', error);
    return NextResponse.json({ error: 'The delay detector failed' }, { status: 500 });
  }
}
