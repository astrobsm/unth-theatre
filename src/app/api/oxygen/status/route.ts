import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { scheduleState, slotCoverageFor } from '@/lib/oxygen/schedule';

export const dynamic = 'force-dynamic';

/**
 * GET /api/oxygen/status
 *
 * Everything a screen needs to show the oxygen position in one request: the
 * latest posting, how old it is against the posting schedule, the day's four
 * slots and what happened to each, the comment thread, and who to ring.
 *
 * ONE ROUTE, because three screens show this — the anaesthetic technician's
 * setup page, the oxygen status page everybody can open, and the oxygen room's
 * own control page. Three routes computing freshness separately is three
 * places for them to disagree about whether the 10 o'clock update arrived,
 * and the one thing worse than a stale status is two screens arguing about it.
 *
 * Open to every signed-in account. An oxygen pressure is plant, not a patient
 * record, and the porter wheeling a trolley past a dead outlet is as much use
 * reporting it as anybody.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [reports, todaysReports, comments, staff] = await Promise.all([
      prisma.oxygenReadinessReport.findMany({
        orderBy: { reportDate: 'desc' },
        take: 1,
        include: {
          reportedBy: { select: { id: true, fullName: true, role: true, phoneNumber: true } },
          verifiedBy: { select: { id: true, fullName: true } },
        },
      }),
      prisma.oxygenReadinessReport.findMany({
        where: { reportDate: { gte: startOfDay } },
        orderBy: { reportDate: 'asc' },
        select: { id: true, reportDate: true },
      }),
      prisma.oxygenStatusComment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      // The oxygen room. Approved accounts only — a pending account has a
      // number nobody has verified, and a number nobody has verified is worse
      // than no number at all when a theatre is ringing it at 11:40.
      prisma.user.findMany({
        where: { role: 'OXYGEN_UNIT_SUPERVISOR' as any, status: 'APPROVED' },
        select: { id: true, fullName: true, phoneNumber: true, extension: true, role: true },
        orderBy: { fullName: 'asc' },
      }),
    ]);

    const latest = reports[0] ?? null;
    const lastReportAt = latest ? new Date(latest.reportDate) : null;
    const state = scheduleState(now, lastReportAt);
    const coverage = slotCoverageFor(
      now,
      todaysReports.map((r) => new Date(r.reportDate)),
      now,
    );

    return NextResponse.json({
      now: now.toISOString(),
      report: latest,
      schedule: {
        level: state.level,
        message: state.message,
        workingDay: state.workingDay,
        ageMinutes: state.ageMinutes,
        minutesLate: state.minutesLate,
        lastReportAt: lastReportAt ? lastReportAt.toISOString() : null,
        expectedAt: state.expected ? state.expected.at.toISOString() : null,
        expectedLabel: state.expected ? state.expected.slot.label : null,
        nextAt: state.next ? state.next.at.toISOString() : null,
        nextLabel: state.next ? state.next.slot.label : null,
      },
      slots: coverage.map((c) => ({
        key: c.slot.key,
        label: c.slot.label,
        at: c.at.toISOString(),
        status: c.status,
        coveredAt: c.coveredAt ? c.coveredAt.toISOString() : null,
        minutesLate: c.minutesLate,
      })),
      comments,
      // Nobody with the role, or nobody with a number on file, is itself the
      // answer the screen has to show — not an empty box that reads as "fine".
      staff: staff.map((s) => ({
        id: s.id,
        fullName: s.fullName,
        phoneNumber: s.phoneNumber,
        extension: s.extension,
      })),
    });
  } catch (error) {
    console.error('Error building oxygen status:', error);
    return NextResponse.json({ error: 'Failed to read oxygen status' }, { status: 500 });
  }
}
