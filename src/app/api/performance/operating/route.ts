// ============================================================
// The operating record: what each person actually did
// ------------------------------------------------------------
//   GET ?from=&to=&unit=      — the board, for theatre management and the
//                               heads of the departments it names.
//   GET ?from=&to=&me=1       — one person's own record. Any signed-in user.
//
// EVERY FIGURE IS DRAWN FROM CONFIRMED CASES ONLY. A completed case with no
// confirmed team counts for nobody, and the share that have been confirmed is
// returned alongside the table rather than buried under it. A board built on a
// third of the list is a board that will be believed and should not be.
//
// RESTRICTED, LIKE THE DUTY BOARD. This names individuals against a count of
// work, which is the same material read from the other end. The restriction is
// on the board; a person's own record is not restricted from them, because
// finding out where you stand from a message rather than from the system that
// sent it is how the duty board lost people's trust the first time.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/apiMiddleware';
import {
  currentTeam,
  summarise,
  confirmationCoverage,
  LATE_START_MINUTES,
  OVERRUN_MINUTES,
  type ActualTeamRow,
  type CaseFact,
} from '@/lib/surgery/actualTeam';

export const dynamic = 'force-dynamic';

const BOARD_ROLES = [
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
  'HEAD_OF_SURGERY',
  'HEAD_OF_ANAESTHESIA',
  'HEAD_OF_OBSTETRICS_GYNAECOLOGY',
  'CMD',
  'CHIEF_MEDICAL_DIRECTOR',
  'CMAC',
];

export async function GET(request: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const sp = request.nextUrl.searchParams;
  const mine = sp.get('me') === '1';

  if (!mine && !BOARD_ROLES.includes(session!.user.role)) {
    return NextResponse.json(
      {
        error: 'The operating record board is for theatre management and the heads of department. Your own record is at ?me=1.',
      },
      { status: 403 },
    );
  }

  const from = sp.get('from');
  const to = sp.get('to');
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'Which period? Give from and to as YYYY-MM-DD.' }, { status: 400 });
  }

  // Local-time day bounds, matching every other date filter in this app. The
  // machine runs on WAT; filtering in UTC would drop the first hour of the
  // first day and pick up the last hour of the day before.
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const start = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
  const end = new Date(ty, tm - 1, td, 23, 59, 59, 999);
  if (start > end) {
    return NextResponse.json({ error: 'The period ends before it begins.' }, { status: 400 });
  }

  const unit = sp.get('unit');

  try {
    const surgeries = await prisma.surgery.findMany({
      where: {
        status: 'COMPLETED',
        scheduledDate: { gte: start, lte: end },
        ...(unit ? { unit } : {}),
      },
      select: {
        id: true,
        unit: true,
        subspecialty: true,
        procedureName: true,
        scheduledDate: true,
        scheduledTime: true,
        estimatedDuration: true,
        actualStartTime: true,
        knifeOnSkinTime: true,
        actualEndTime: true,
        surgeryEndTime: true,
        complexityClass: true,
      },
    });

    const ids = surgeries.map((s) => s.id);
    const rows = ids.length
      ? ((await prisma.surgeryActualTeam.findMany({
          where: { surgeryId: { in: ids } },
          orderBy: [{ confirmedAt: 'desc' }, { position: 'asc' }],
        })) as unknown as Array<ActualTeamRow & { surgeryId: string }>)
      : [];

    const byCase = new Map<string, Array<ActualTeamRow & { surgeryId: string }>>();
    for (const r of rows) {
      const list = byCase.get(r.surgeryId);
      if (list) list.push(r);
      else byCase.set(r.surgeryId, [r]);
    }

    const facts: CaseFact[] = [];
    const unconfirmed: Array<{ id: string; procedureName: string; unit: string; scheduledDate: Date }> = [];

    for (const s of surgeries) {
      const team = currentTeam(byCase.get(s.id) ?? []);
      if (!team) {
        unconfirmed.push({
          id: s.id,
          procedureName: s.procedureName,
          unit: s.unit,
          scheduledDate: s.scheduledDate,
        });
        continue;
      }
      facts.push({
        surgeryId: s.id,
        unit: s.unit,
        subspecialty: s.subspecialty,
        procedureName: s.procedureName,
        scheduledDate: s.scheduledDate,
        scheduledTime: s.scheduledTime,
        estimatedDuration: s.estimatedDuration,
        actualStartTime: s.actualStartTime,
        knifeOnSkinTime: s.knifeOnSkinTime,
        actualEndTime: s.actualEndTime,
        surgeryEndTime: s.surgeryEndTime,
        complexityClass: s.complexityClass,
        team: team.members,
      });
    }

    const everyone = summarise(facts);
    const coverage = confirmationCoverage(surgeries.length, facts.length);

    if (mine) {
      const own = everyone.find((r) => r.userId === session!.user.id) ?? null;
      return NextResponse.json({
        period: { from, to },
        coverage,
        me: own,
        // The whole board's totals, so a person can see whether their figure is
        // good. 78% is good in a theatre running at 60% and poor in one running
        // at 95%, and without that a person either despairs at a respectable
        // number or relaxes at a bad one.
        context: {
          people: everyone.length,
          cases: facts.length,
        },
        thresholds: { lateStartMinutes: LATE_START_MINUTES, overrunMinutes: OVERRUN_MINUTES },
      });
    }

    return NextResponse.json({
      period: { from, to },
      unit: unit ?? null,
      coverage,
      // Oldest first: the ones most likely to be forgotten are the ones to chase.
      unconfirmed: unconfirmed
        .sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime())
        .slice(0, 100),
      people: everyone,
      thresholds: { lateStartMinutes: LATE_START_MINUTES, overrunMinutes: OVERRUN_MINUTES },
    });
  } catch (e) {
    console.error('[performance/operating] failed:', e);
    return NextResponse.json({ error: 'Could not build the operating record' }, { status: 500 });
  }
}
