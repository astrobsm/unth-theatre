// ============================================================
// Booking performance: who books early, and how early
// ------------------------------------------------------------
//   GET — the punctuality board for a window: bookers ranked by compliance
//         and notice given, units ranked the same way, and the subset whose
//         record deserves a letter of appreciation.
//
// RESTRICTED TO THEATRE MANAGEMENT, like the late-booking report, and for
// the same reason. A board that praises the top of the list also shows the
// compliance rate of everybody below it, and "Dr X — 38%" published to the
// whole hospital is a public shaming nobody asked for. Recognition is sent
// TO the person commended; the ranking stays with management.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/apiMiddleware';
import { fetchCasesInWindow } from '@/lib/lateBooking/caseWindow';
import {
  buildPunctualityReport,
  MIN_CASES_TO_RANK,
  COMMENDATION_RATE,
} from '@/lib/lateBooking/punctuality';
import { commendationLink } from '@/lib/lateBooking/commendationLink';

export const dynamic = 'force-dynamic';

const VIEW_ROLES = [
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
  'HEAD_OF_SURGERY',
  'HEAD_OF_ANAESTHESIA',
  'HEAD_OF_OBSTETRICS_GYNAECOLOGY',
  'CMD',
] as const;

export async function GET(request: NextRequest) {
  const { error } = await requireRole(VIEW_ROLES as never);
  if (error) return error;

  try {
    const sp = request.nextUrl.searchParams;
    const from = sp.get('from') || '2026-10-01';
    const to = sp.get('to') || '2026-10-31';

    const rows = await fetchCasesInWindow(from, to);
    const report = buildPunctualityReport(rows, { from, to });

    // Who has already been thanked for this window, so the page shows what
    // was sent rather than offering to send it twice.
    //
    // Read off the notification trail rather than a ledger of its own. A
    // commendation is a message, and the window it covers is already carried
    // honestly in the notification's link — no table, no migration, and
    // nothing smuggled into the wording the recipient reads.
    const commended = await prisma.notification.findMany({
      where: {
        type: 'BOOKING_COMMENDATION',
        link: { contains: commendationLink(from, to) },
      },
      select: { userId: true, createdAt: true },
    });

    return NextResponse.json({
      report,
      commendedUserIds: commended.map((c) => c.userId),
      thresholds: { minCasesToRank: MIN_CASES_TO_RANK, commendationRate: COMMENDATION_RATE },
    });
  } catch (err) {
    console.error('[booking-performance] report failed:', err);
    return NextResponse.json({ error: 'Could not build the board' }, { status: 500 });
  }
}
