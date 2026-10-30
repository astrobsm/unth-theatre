// ============================================================
// Duty performance: the board
// ------------------------------------------------------------
//   GET ?duty=…&from=…&to=… — one duty's figures for a window, ranked by
//   person and by unit, with the WhatsApp summary ready to paste.
//
// RESTRICTED TO THEATRE MANAGEMENT AND THE OWNING DEPARTMENT'S HEAD. This
// names individuals against a tally of work not done, which is the same
// material as the late-booking report read from the other end. The summary it
// produces is written to be shared; the ranking behind it is not.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/apiMiddleware';
import { collectDutyEvents } from '@/lib/dutyPerformance/collect';
import { buildDutyReport, MIN_EVENTS_TO_RANK, COMMENDATION_RATE, CHASE_RATE } from '@/lib/dutyPerformance/report';
import { buildWhatsAppSummary, buildCsv, periodLabel } from '@/lib/dutyPerformance/export';
import { DUTIES, isDutyKey } from '@/lib/dutyPerformance/types';

export const dynamic = 'force-dynamic';

const VIEW_ROLES = [
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
  'HEAD_OF_SURGERY',
  'HEAD_OF_ANAESTHESIA',
  'HEAD_OF_OBSTETRICS_GYNAECOLOGY',
  'HEAD_OF_PHARMACY',
  'CMD',
] as const;

export async function GET(request: NextRequest) {
  const { error } = await requireRole(VIEW_ROLES as never);
  if (error) return error;

  try {
    const sp = request.nextUrl.searchParams;
    const duty = sp.get('duty') ?? 'PREOP_REVIEW';
    if (!isDutyKey(duty)) {
      return NextResponse.json({ error: 'Unknown duty' }, { status: 400 });
    }
    const from = sp.get('from') || '2026-10-01';
    const to = sp.get('to') || '2026-10-31';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return NextResponse.json({ error: 'Which period?' }, { status: 400 });
    }

    const events = await collectDutyEvents(duty, from, to);
    const report = buildDutyReport(duty, events, { from, to });

    // Who has already been written to about this duty for this period, so the
    // page shows what was sent rather than offering to send it twice. Read off
    // the notification trail, which already carries the duty and the window in
    // its link — no ledger of its own, and no migration.
    const base = `/dashboard/duty-performance?duty=${duty}&from=${from}&to=${to}`;
    const messaged = await prisma.notification.findMany({
      where: {
        type: { in: ['DUTY_CHASE', 'DUTY_COMMENDATION'] },
        link: { startsWith: base },
      },
      select: { userId: true, type: true },
    });

    return NextResponse.json({
      report,
      chasedUserIds: messaged.filter((m) => m.type === 'DUTY_CHASE').map((m) => m.userId),
      commendedUserIds: messaged.filter((m) => m.type === 'DUTY_COMMENDATION').map((m) => m.userId),
      definition: DUTIES[duty],
      periodLabel: periodLabel(from, to),
      whatsapp: buildWhatsAppSummary(report),
      csv: buildCsv(report),
      thresholds: {
        minEventsToRank: MIN_EVENTS_TO_RANK,
        commendationRate: COMMENDATION_RATE,
        chaseRate: CHASE_RATE,
      },
    });
  } catch (err) {
    console.error('[duty-performance] report failed:', err);
    return NextResponse.json({ error: 'Could not build the board' }, { status: 500 });
  }
}
