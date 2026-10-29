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
import { buildLateBookingReport, type LateBookingCaseInput } from '@/lib/lateBooking/report';
import { DEFAULT_COUNTING_FROM } from '@/lib/lateBooking/escalation';

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

/** A WAT calendar day as the UTC instant it begins. */
function watDayStart(iso: string): Date {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0) - 60 * 60_000);
}

export async function GET(request: NextRequest) {
  const { error } = await requireRole(VIEW_ROLES as never);
  if (error) return error;

  try {
    const sp = request.nextUrl.searchParams;
    const from = sp.get('from') || '2026-10-01';
    const to = sp.get('to') || '2026-10-31';

    const start = watDayStart(from);
    // Inclusive of the last day: start of the day after.
    const endDay = new Date(watDayStart(to).getTime() + 24 * 3_600_000);

    // Selected on SCHEDULED DATE, not booking date. "October's late
    // bookings" means the October operating list; a case booked on 30
    // September for 2 October belongs to October, and one booked on 31
    // October for 3 November does not.
    const rows = await prisma.surgery.findMany({
      where: { scheduledDate: { gte: start, lt: endDay } },
      select: {
        id: true,
        scheduledDate: true,
        scheduledTime: true,
        createdAt: true,
        surgeryType: true,
        unit: true,
        subspecialty: true,
        procedureName: true,
        bookedById: true,
        bookedByName: true,
        surgeonName: true,
        supervisingConsultantId: true,
        supervisingConsultantName: true,
        patient: { select: { name: true, folderNumber: true } },
        teamMembers: {
          select: { role: true, memberName: true, user: { select: { fullName: true } } },
        },
      },
      orderBy: { scheduledDate: 'asc' },
    });

    const input: LateBookingCaseInput[] = rows.map((r) => ({
      id: r.id,
      scheduledDate: r.scheduledDate,
      scheduledTime: r.scheduledTime as never,
      createdAt: r.createdAt,
      surgeryType: r.surgeryType as unknown as string,
      unit: r.unit,
      subspecialty: r.subspecialty,
      procedureName: r.procedureName as never,
      patientName: r.patient?.name ?? null,
      folderNumber: r.patient?.folderNumber ?? null,
      bookedById: r.bookedById,
      bookedByName: r.bookedByName,
      surgeonName: r.surgeonName,
      supervisingConsultantId: r.supervisingConsultantId,
      supervisingConsultantName: r.supervisingConsultantName,
      team: r.teamMembers.map((t) => ({
        role: String(t.role),
        name: t.user?.fullName ?? t.memberName ?? null,
      })),
    }));

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
