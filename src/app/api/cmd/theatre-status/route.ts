import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/apiError';
import { parseTheatreDay, theatreDayBounds, dayKey } from '@/lib/theatre/day';
import { buildCaseTeam, type TeamSource } from '@/lib/theatre/caseTeam';
import { summarise } from '@/lib/theatre/availability';
import { progress, theatreFullyReady, type Ticks } from '@/lib/theatre/readiness';

export const dynamic = 'force-dynamic';

/**
 * The day's theatre, on one screen, for the people who run the hospital.
 *
 * Which theatres are ready and who said so; what is booked into each; who is
 * on each case and who has confirmed they are coming. The point of gathering
 * it in one place is that a question about this morning currently takes six
 * telephone calls, and by the time it is answered the morning is over.
 *
 * PHONE NUMBERS ARE ON THIS SCREEN AND ALMOST NO OTHER. The CMD's two actions
 * are to ask what is missing and to say thank you, and both need a chat to
 * open. So this route is restricted to the executive and theatre-management
 * roles, and it carries numbers for staff only — never a patient's.
 *
 * NOTHING IS SENT FROM HERE. The messages are drafted in the browser and open
 * in WhatsApp for the CMD to read, edit and send. A message signed by the CMD
 * that the CMD did not write would be worse than no message.
 */

const MAY_VIEW = [
  'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC',
  'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'HEAD_OF_SURGERY', 'HEAD_OF_ANAESTHESIA', 'HEAD_OF_OBSTETRICS_GYNAECOLOGY',
  'ADMIN', 'SYSTEM_ADMINISTRATOR',
];

const POST_FIELDS = [
  'surgeonId', 'supervisingConsultantId', 'assistantSurgeonId',
  'anesthetistId', 'scrubNurseId', 'theatreTechnicianId',
] as const;

function parseTicks(raw: string | null): Ticks {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Ticks = {};
    Object.keys(parsed as Record<string, unknown>).forEach((k) => {
      out[k] = Boolean((parsed as Record<string, unknown>)[k]);
    });
    return out;
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!MAY_VIEW.includes((session.user.role ?? '').toUpperCase())) {
    return NextResponse.json({
      error: 'This board carries staff telephone numbers, so it is limited to the executive and theatre management.',
      code: 'NO_ACCESS',
    }, { status: 403 });
  }

  try {
    const day = parseTheatreDay(request.nextUrl.searchParams.get('date'));
    const { start, end } = theatreDayBounds(day);

    const [theatres, readiness, surgeries] = await Promise.all([
      prisma.theatreSuite.findMany({
        where: { isOperatingRoom: true },
        select: { id: true, name: true, location: true },
        orderBy: { name: 'asc' },
      }).catch(() => []),
      prisma.theatreReadinessConfirmation.findMany({
        where: { readyDate: day },
      }).catch(() => []),
      prisma.surgery.findMany({
        where: {
          scheduledDate: { gte: start, lt: end },
          status: { notIn: ['CANCELLED'] },
        },
        select: {
          id: true, procedureName: true, scheduledDate: true, scheduledTime: true,
          status: true, surgeryType: true, theatreId: true, unit: true,
          surgeonId: true, supervisingConsultantId: true, assistantSurgeonId: true,
          anesthetistId: true, scrubNurseId: true, theatreTechnicianId: true,
          bookedById: true,
          patient: { select: { name: true, folderNumber: true } },
        },
        orderBy: [{ scheduledTime: 'asc' }],
        take: 120,
      }),
    ]);

    const surgeryIds = surgeries.map((s) => s.id);

    const [assignments, bookedMembers, answers] = await Promise.all([
      surgeryIds.length
        ? prisma.theatreTeamAssignment.findMany({
            where: { surgeryId: { in: surgeryIds }, removedAt: null },
            select: { surgeryId: true, userId: true, userName: true, role: true },
          }).catch(() => [])
        : [],
      surgeryIds.length
        ? prisma.surgicalTeamMember.findMany({
            where: { surgeryId: { in: surgeryIds } },
            select: { surgeryId: true, userId: true, memberName: true, role: true },
          }).catch(() => [])
        : [],
      surgeryIds.length
        ? prisma.caseTeamAvailability.findMany({
            where: { surgeryId: { in: surgeryIds } },
            select: {
              surgeryId: true, userId: true, status: true,
              etaMinutes: true, note: true, respondedAt: true,
            },
          }).catch(() => [])
        : [],
    ]);

    const userIds = Array.from(new Set<string>([
      ...surgeries.flatMap((s) => POST_FIELDS.map((f) => s[f]).filter(Boolean) as string[]),
      ...assignments.map((a) => a.userId),
      ...bookedMembers.map((m) => m.userId).filter(Boolean) as string[],
      ...readiness.map((r) => r.confirmedById),
    ]));

    const people = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true, phoneNumber: true, role: true },
        }).catch(() => [])
      : [];

    const cases = surgeries.map((s) => {
      const src: TeamSource = {
        posts: Object.fromEntries(POST_FIELDS.map((f) => [f, s[f]])),
        people,
        assignments: assignments.filter((a) => a.surgeryId === s.id),
        bookedMembers: bookedMembers.filter((m) => m.surgeryId === s.id),
        answers: answers.filter((a) => a.surgeryId === s.id),
      };
      const team = buildCaseTeam(src);
      return {
        id: s.id,
        procedureName: s.procedureName,
        scheduledTime: s.scheduledTime,
        status: s.status,
        surgeryType: s.surgeryType,
        unit: s.unit,
        theatreId: s.theatreId,
        patientName: s.patient?.name ?? null,
        team,
        summary: summarise(team),
      };
    });

    const theatreRows = theatres.map((t) => {
      const rows = readiness.filter((r) => r.theatreId === t.id);
      const confirmations = rows.map((r) => {
        const ticks = parseTicks(r.ticks);
        const state = progress(r.role, ticks);
        return {
          role: r.role,
          complete: r.complete,
          confirmedByName: r.confirmedByName,
          confirmedById: r.confirmedById,
          phone: people.find((p) => p.id === r.confirmedById)?.phoneNumber ?? null,
          completedAt: r.completedAt,
          announcedAt: r.announcedAt,
          note: r.note,
          // Named, not counted. "2 outstanding" tells the CMD to ring somebody
          // to find out what; the names tell them whether it matters.
          outstanding: state.outstanding.map((c) => c.label),
          done: state.done,
          total: state.total,
        };
      });

      return {
        id: t.id,
        name: t.name,
        location: t.location,
        confirmations,
        // Both sides, or the theatre is not ready for a patient however
        // prepared either half of it is.
        ready: theatreFullyReady(confirmations.map((c) => ({ role: c.role, complete: c.complete }))),
        cases: cases.filter((c) => c.theatreId === t.id).length,
      };
    });

    // Cases with no theatre yet. They are real and they are on the list, and a
    // board that silently drops them is a board that says the morning is
    // lighter than it is.
    const unallocated = cases.filter((c) => !c.theatreId);

    return NextResponse.json({
      date: dayKey(day),
      theatres: theatreRows,
      cases,
      unallocated: unallocated.length,
      totals: {
        cases: cases.length,
        emergencies: cases.filter((c) => c.surgeryType === 'EMERGENCY').length,
        theatresReady: theatreRows.filter((t) => t.ready).length,
        theatresWithCases: theatreRows.filter((t) => t.cases > 0).length,
        confirmed: cases.reduce((n, c) => n + c.summary.available + c.summary.delayed, 0),
        awaited: cases.reduce((n, c) => n + c.summary.silent, 0),
        unavailable: cases.reduce((n, c) => n + c.summary.unavailable, 0),
      },
    });
  } catch (error) {
    return apiError('cmd/theatre-status GET', error);
  }
}
