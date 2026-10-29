// ============================================================
// Late elective bookings: the report
// ------------------------------------------------------------
//   GET — every late elective case in a window, ranked by unit, with the
//         person who booked each one, the unit's supervising consultant,
//         and the senior registrars and house officers on the case.
//
// RESTRICTED TO THEATRE MANAGEMENT. This names individuals against a tally
// of policy breaches, which is disciplinary material; it is not something
// the whole hospital should be able to open.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/apiMiddleware';
import { buildLateBookingReport } from '@/lib/lateBooking/report';
import { DEFAULT_COUNTING_FROM } from '@/lib/lateBooking/escalation';
import { fetchCasesInWindow } from '@/lib/lateBooking/caseWindow';

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

    const input = await fetchCasesInWindow(from, to);

    const report = buildLateBookingReport(input, { from, to });

    // Which of these already have an offence recorded, so the page can show
    // what was done rather than offering to chase the same case twice.
    const ids: string[] = [];
    report.units.forEach((u) => u.cases.forEach((c) => ids.push(c.id)));
    const recorded = ids.length
      ? await prisma.lateBookingOffence.findMany({
          where: { surgeryId: { in: ids } },
          select: {
            surgeryId: true,
            offenceNumber: true,
            level: true,
            createdAt: true,
            whatsappQueued: true,
            disciplinaryQueryId: true,
          },
        })
      : [];

    return NextResponse.json({
      report,
      countingFrom: DEFAULT_COUNTING_FROM,
      recorded,
    });
  } catch (err) {
    console.error('[late-bookings] report failed:', err);
    return NextResponse.json({ error: 'Could not build the report' }, { status: 500 });
  }
}
