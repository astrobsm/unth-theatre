import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/apiError';
import { parseTheatreDay, theatreDayBounds, dayKey } from '@/lib/theatre/day';
import { buildCaseTeam, roleOnCase, type TeamSource } from '@/lib/theatre/caseTeam';
import { isAvailabilityStatus, summarise } from '@/lib/theatre/availability';

export const dynamic = 'force-dynamic';

/**
 * "Am I coming to this case?", and "who else is?"
 *
 * On the morning of a list, whether the anaesthetist is coming was established
 * by telephone — one call at a time, usually by whoever was already standing in
 * the theatre, so the cost of every unanswered phone fell on the person least
 * able to do anything about it.
 *
 * Each member answers once here, and everybody on that case sees every answer.
 * No message is sent and nobody is rung.
 *
 * WHAT THIS DOES NOT DO. It does not decide whether a case goes ahead, it does
 * not chase anybody, and it does not treat silence as a refusal. People are
 * operating, teaching, post-call or out of signal; "not yet said" is the only
 * honest reading of no answer and it is the one this returns.
 */

/** The named-post columns, loaded for every case on the board. */
const POST_FIELDS = [
  'surgeonId', 'supervisingConsultantId', 'assistantSurgeonId',
  'anesthetistId', 'scrubNurseId', 'theatreTechnicianId',
] as const;

interface SurgeryRow {
  id: string;
  procedureName: string;
  scheduledDate: Date;
  scheduledTime: string;
  status: string;
  surgeryType: string;
  theatreId: string | null;
  surgeonId: string | null;
  supervisingConsultantId: string | null;
  assistantSurgeonId: string | null;
  anesthetistId: string | null;
  scrubNurseId: string | null;
  theatreTechnicianId: string | null;
  bookedById: string | null;
  patient: { name: string; folderNumber: string | null } | null;
}

const postsOf = (s: SurgeryRow): Record<string, string | null> => {
  const out: Record<string, string | null> = {};
  POST_FIELDS.forEach((f) => { out[f] = s[f]; });
  return out;
};

/**
 * Assemble the team for a set of cases, with whatever each member has said.
 *
 * Loaded in four queries for any number of cases rather than four per case: a
 * consultant with six on the list would otherwise open their dashboard onto
 * twenty-five round trips.
 */
async function teamsFor(surgeries: SurgeryRow[]) {
  const ids = surgeries.map((s) => s.id);
  if (!ids.length) return new Map<string, TeamSource>();

  const [assignments, bookedMembers, answers] = await Promise.all([
    prisma.theatreTeamAssignment.findMany({
      where: { surgeryId: { in: ids }, removedAt: null },
      select: { surgeryId: true, userId: true, userName: true, role: true },
    }).catch(() => []),
    prisma.surgicalTeamMember.findMany({
      where: { surgeryId: { in: ids } },
      select: { surgeryId: true, userId: true, memberName: true, role: true },
    }).catch(() => []),
    prisma.caseTeamAvailability.findMany({
      where: { surgeryId: { in: ids } },
      select: {
        surgeryId: true, userId: true, status: true,
        etaMinutes: true, note: true, respondedAt: true,
      },
    }).catch(() => []),
  ]);

  // Every user id mentioned anywhere, resolved once. Phone numbers come with
  // them because the CMD's board offers a WhatsApp chat with each member and a
  // second round of lookups for that would be the same query again.
  const userIds = Array.from(new Set<string>([
    ...surgeries.flatMap((s) => POST_FIELDS.map((f) => s[f]).filter(Boolean) as string[]),
    ...assignments.map((a) => a.userId),
    ...bookedMembers.map((m) => m.userId).filter(Boolean) as string[],
  ]));

  const people = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, fullName: true, phoneNumber: true, role: true },
      }).catch(() => [])
    : [];

  const map = new Map<string, TeamSource>();
  surgeries.forEach((s) => {
    map.set(s.id, {
      posts: postsOf(s),
      people,
      assignments: assignments.filter((a) => a.surgeryId === s.id),
      bookedMembers: bookedMembers.filter((m) => m.surgeryId === s.id),
      answers: answers.filter((a) => a.surgeryId === s.id),
    });
  });
  return map;
}

/**
 * GET /api/case-availability?date=YYYY-MM-DD
 *
 * This person's cases on that day, each with its whole team and what each of
 * them has said. Scoped to the session user's own cases and never to a user id
 * from the request: a team board is only for the people on the team.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const userId = session.user.id;
    const day = parseTheatreDay(request.nextUrl.searchParams.get('date'));
    const { start, end } = theatreDayBounds(day);

    // theatre_team_assignments carries surgeryId as a plain column with no
    // relation, so it cannot be filtered from inside the surgery query.
    const assignedIds = (
      await prisma.theatreTeamAssignment.findMany({
        where: { userId, removedAt: null },
        select: { surgeryId: true },
      }).catch(() => [])
    ).map((a) => a.surgeryId);

    const surgeries = await prisma.surgery.findMany({
      where: {
        scheduledDate: { gte: start, lt: end },
        status: { notIn: ['CANCELLED', 'COMPLETED'] },
        OR: [
          { surgeonId: userId },
          { supervisingConsultantId: userId },
          { assistantSurgeonId: userId },
          { anesthetistId: userId },
          { scrubNurseId: userId },
          { theatreTechnicianId: userId },
          { teamMembers: { some: { userId } } },
          ...(assignedIds.length ? [{ id: { in: assignedIds } }] : []),
        ],
      },
      select: {
        id: true, procedureName: true, scheduledDate: true, scheduledTime: true,
        status: true, surgeryType: true, theatreId: true,
        surgeonId: true, supervisingConsultantId: true, assistantSurgeonId: true,
        anesthetistId: true, scrubNurseId: true, theatreTechnicianId: true,
        bookedById: true,
        patient: { select: { name: true, folderNumber: true } },
      },
      orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
      take: 25,
    });

    const teams = await teamsFor(surgeries as SurgeryRow[]);

    // Theatre names, so a card can say "Theatre 3" rather than a uuid.
    const theatreIds = Array.from(new Set(
      surgeries.map((s) => s.theatreId).filter(Boolean) as string[],
    ));
    const theatres = theatreIds.length
      ? await prisma.theatreSuite.findMany({
          where: { id: { in: theatreIds } },
          select: { id: true, name: true },
        }).catch(() => [])
      : [];

    const cases = surgeries.map((s) => {
      const src = teams.get(s.id);
      const team = src ? buildCaseTeam(src) : [];
      return {
        id: s.id,
        procedureName: s.procedureName,
        scheduledTime: s.scheduledTime,
        status: s.status,
        surgeryType: s.surgeryType,
        theatreName: theatres.find((t) => t.id === s.theatreId)?.name ?? null,
        patientName: s.patient?.name ?? null,
        folderNumber: s.patient?.folderNumber ?? null,
        // The phone number is stripped here. This board is for knowing who is
        // coming; the CMD's board is where numbers are needed, and it is the
        // one screen that carries them.
        team: team.map(({ phone, ...rest }) => rest),
        myRole: team.find((m) => m.userId === userId)?.role ?? null,
        myStatus: team.find((m) => m.userId === userId)?.status ?? null,
        summary: summarise(team),
      };
    });

    return NextResponse.json({ date: dayKey(day), cases });
  } catch (error) {
    return apiError('case-availability GET', error);
  }
}

/**
 * POST /api/case-availability
 *
 * One person's answer for one case. Only their own — availability is a
 * personal statement and nobody may make it on somebody else's behalf, so the
 * user id comes from the session and the body cannot override it.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const userId = session.user.id;
    const body = await request.json().catch(() => ({}));
    const surgeryId = typeof body.surgeryId === 'string' ? body.surgeryId.trim() : '';
    const status = typeof body.status === 'string' ? body.status.trim().toUpperCase() : '';
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : '';

    if (!surgeryId || !isAvailabilityStatus(status)) {
      return NextResponse.json(
        { error: 'Say which case, and whether you are available.' },
        { status: 400 },
      );
    }

    // An ETA only means anything with DELAYED. Carried on the others it would
    // show "available, about 40 min" on the board, which reads as a delay
    // nobody declared.
    const rawEta = Number(body.etaMinutes);
    const etaMinutes = status === 'DELAYED' && Number.isFinite(rawEta) && rawEta > 0
      ? Math.min(Math.round(rawEta), 720)
      : null;

    const surgery = await prisma.surgery.findUnique({
      where: { id: surgeryId },
      select: {
        id: true, procedureName: true, scheduledDate: true, scheduledTime: true,
        status: true, surgeryType: true, theatreId: true,
        surgeonId: true, supervisingConsultantId: true, assistantSurgeonId: true,
        anesthetistId: true, scrubNurseId: true, theatreTechnicianId: true,
        bookedById: true,
        patient: { select: { name: true, folderNumber: true } },
      },
    });
    if (!surgery) {
      return NextResponse.json({ error: 'That case is not on file.' }, { status: 404 });
    }

    const teams = await teamsFor([surgery as SurgeryRow]);
    const src = teams.get(surgery.id);
    const team = src ? buildCaseTeam(src) : [];

    if (!team.some((m) => m.userId === userId)) {
      return NextResponse.json({
        error: 'You are not on the team for this case, so your availability would not mean anything to it. '
          + 'If you should be on it, ask whoever assigns the team to add you.',
        code: 'NOT_ON_TEAM',
      }, { status: 403 });
    }

    const saved = await prisma.caseTeamAvailability.upsert({
      where: { surgeryId_userId: { surgeryId, userId } },
      create: {
        surgeryId,
        userId,
        userName: session.user.name || 'Team member',
        roleOnCase: src ? roleOnCase(src, userId) : 'Team member',
        status,
        etaMinutes,
        note: note || null,
      },
      update: {
        status,
        etaMinutes,
        note: note || null,
        // Changing your mind is a new answer, not an amendment of the old one,
        // so the board shows when the CURRENT answer was given.
        respondedAt: new Date(),
      },
    });

    // The board as it now stands, so the screen that asked does not have to
    // fetch the whole day again to show the answer it just gave.
    const refreshed = buildCaseTeam({
      ...(src as TeamSource),
      answers: [
        ...(src?.answers ?? []).filter((a) => a.userId !== userId),
        { userId, status: saved.status, etaMinutes: saved.etaMinutes, note: saved.note, respondedAt: saved.respondedAt },
      ],
    });

    return NextResponse.json({
      saved: { status: saved.status, etaMinutes: saved.etaMinutes, note: saved.note },
      team: refreshed.map(({ phone, ...rest }) => rest),
      summary: summarise(refreshed),
    });
  } catch (error) {
    return apiError('case-availability POST', error);
  }
}
