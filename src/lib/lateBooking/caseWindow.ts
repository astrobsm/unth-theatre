// ============================================================
// One query, two reports
// ------------------------------------------------------------
// The late-booking report and the punctuality board are the same rows asked
// two opposite questions. Fetching them in one place is not tidiness: if the
// two routes each kept their own select and their own window arithmetic, one
// could drift — a different date boundary, an excluded case type — and the
// hospital would be shown a breach rate and a compliance rate that do not add
// up to a hundred. Somebody would notice that in a meeting, and they would be
// right to.
// ============================================================

import prisma from '@/lib/prisma';
import type { LateBookingCaseInput } from '@/lib/lateBooking/report';

/**
 * A WAT calendar day as the UTC instant it begins.
 *
 * Nigeria is UTC+1 all year. Reading "2026-10-01" as midnight UTC would put
 * the first hour of 1 October into September and silently move cases between
 * reporting months.
 */
export function watDayStart(iso: string): Date {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0) - 60 * 60_000);
}

/**
 * Every case on the operating list between two WAT calendar days, inclusive.
 *
 * SELECTED ON SCHEDULED DATE, NOT BOOKING DATE. "October's bookings" means
 * the October operating list: a case booked on 30 September for 2 October
 * belongs to October, and one booked on 31 October for 3 November does not.
 */
export async function fetchCasesInWindow(
  from: string,
  to: string,
): Promise<LateBookingCaseInput[]> {
  const start = watDayStart(from);
  // Inclusive of the last day: start of the day after.
  const endDay = new Date(watDayStart(to).getTime() + 24 * 3_600_000);

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

  return rows.map((r) => ({
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
}
