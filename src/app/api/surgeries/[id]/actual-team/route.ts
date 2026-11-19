// ============================================================
// Who was actually in the room for this case
// ------------------------------------------------------------
//   GET  — the confirmed team, the correction trail, and the booked team to
//          start from where nothing has been confirmed yet.
//   POST — one confirmation, written as a whole set.
//
// NOT REQUIRED TO CLOSE A CASE, deliberately. A patient cannot be admitted to
// recovery until the surgery reads COMPLETED, which is why the completion
// button is open to the scrub nurse and the recovery nurse as well as the
// surgeon. Putting a team form in front of that would block a recovery
// admission on the one person who has already left the theatre — and the
// recovery nurse, who is the one most often pressing it, does not know who
// assisted. So completion stays one click and this is offered straight after.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/apiMiddleware';
import {
  prefillFromBooking,
  teamProblem,
  orderForWriting,
  currentTeam,
  confirmationHistory,
  describeChange,
  isActualTeamRole,
  type ActualTeamRow,
  type DraftMember,
} from '@/lib/surgery/actualTeam';
import { TEAM_GRADES } from '@/lib/surgery/assistants';

export const dynamic = 'force-dynamic';

/**
 * Who may confirm the operating team.
 *
 * The same shape as the completion button, and for the same reason: the people
 * who were in the room. The scrub nurse is on this list because she is very
 * often the only member of the team still at a screen when the case ends, and
 * she knows precisely who scrubbed — that is her count sheet.
 *
 * Every confirmation records who made it, so a wrong one is attributable
 * rather than anonymous.
 */
const MAY_CONFIRM = [
  'SURGEON', 'CONSULTANT_SURGEON',
  'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE',
  'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST',
  'ADMIN', 'THEATRE_MANAGER', 'SYSTEM_ADMINISTRATOR', 'THEATRE_CHAIRMAN',
];

async function loadBooking(surgeryId: string) {
  const surgery = await prisma.surgery.findUnique({
    where: { id: surgeryId },
    select: {
      id: true,
      status: true,
      procedureName: true,
      unit: true,
      scheduledDate: true,
      scheduledTime: true,
      surgeonId: true,
      surgeonName: true,
      assistantSurgeonId: true,
      anesthetistId: true,
      completedAt: true,
    },
  });
  if (!surgery) return null;

  // The nurse anaesthetist, where the intra-operative record names one. It is
  // the only place in the schema that does.
  const intraOp = await prisma.intraOperativeRecord.findUnique({
    where: { surgeryId },
    select: { nurseAnesthetistId: true, anesthetistId: true },
  });

  const ids = [
    surgery.surgeonId,
    surgery.assistantSurgeonId,
    // The intra-operative record's anaesthetist wins where it has one: it is
    // written in the room, and surgeries.anesthetistId is written at booking
    // before the anaesthetic rota exists.
    intraOp?.anesthetistId || surgery.anesthetistId,
    intraOp?.nurseAnesthetistId,
  ].filter(Boolean) as string[];
  const people = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, fullName: true, staffCode: true, role: true },
      })
    : [];

  const bookedMembers = await prisma.surgicalTeamMember.findMany({
    where: { surgeryId },
    select: { userId: true, memberName: true, role: true, specialNotes: true },
  });

  return { surgery, people, bookedMembers, intraOp };
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { error, session } = await requireAuth();
  if (error) return error;

  try {
    const loaded = await loadBooking(params.id);
    if (!loaded) return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });

    const rows = (await prisma.surgeryActualTeam.findMany({
      where: { surgeryId: params.id },
      orderBy: [{ confirmedAt: 'desc' }, { position: 'asc' }],
    })) as unknown as ActualTeamRow[];

    const booked = prefillFromBooking({
      surgeonId: loaded.surgery.surgeonId,
      surgeonName: loaded.surgery.surgeonName,
      assistantSurgeonId: loaded.surgery.assistantSurgeonId,
      anesthetistId: loaded.intraOp?.anesthetistId || loaded.surgery.anesthetistId,
      nurseAnesthetistId: loaded.intraOp?.nurseAnesthetistId,
      people: loaded.people,
      bookedMembers: loaded.bookedMembers,
    });

    const confirmed = currentTeam(rows);

    return NextResponse.json({
      surgery: {
        id: loaded.surgery.id,
        procedureName: loaded.surgery.procedureName,
        unit: loaded.surgery.unit,
        status: loaded.surgery.status,
        completedAt: loaded.surgery.completedAt,
      },
      // What the booking says. Shown as the starting point, never written on
      // its own: an unconfirmed case counts for nobody, which is the only
      // reason the confirmed figure means anything.
      booked,
      confirmed,
      history: confirmationHistory(rows),
      changedFromBooking: confirmed ? describeChange(booked, confirmed.members) : null,
      mayConfirm: MAY_CONFIRM.includes(session!.user.role),
    });
  } catch (e) {
    console.error('[actual-team] GET failed:', e);
    return NextResponse.json({ error: 'Could not load the operating team' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { error, session } = await requireAuth();
  if (error) return error;

  if (!MAY_CONFIRM.includes(session!.user.role)) {
    return NextResponse.json(
      { error: 'Only the operating team, the scrub or recovery room nurse, the theatre manager or an administrator can confirm who operated' },
      { status: 403 },
    );
  }

  try {
    const surgery = await prisma.surgery.findUnique({
      where: { id: params.id },
      select: { id: true, status: true },
    });
    if (!surgery) return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });
    if (surgery.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'A cancelled case has no operating team to confirm.' },
        { status: 400 },
      );
    }

    const body = await request.json();
    const raw = Array.isArray(body?.members) ? body.members : [];

    const members: DraftMember[] = raw.map((m: Record<string, unknown>) => ({
      userId: typeof m?.userId === 'string' && m.userId ? m.userId : null,
      memberName: String(m?.memberName ?? '').trim(),
      staffCode: typeof m?.staffCode === 'string' && m.staffCode ? m.staffCode : null,
      // An unrecognised role is read as ASSISTANT rather than refused. There is
      // exactly one operating surgeon and teamProblem() insists on it, so the
      // permissive reading cannot invent one; it can only fail to promote
      // somebody, which the person confirming will see on the screen.
      role: isActualTeamRole(m?.role) ? m.role : 'ASSISTANT',
      grade:
        typeof m?.grade === 'string' && (TEAM_GRADES as readonly string[]).includes(m.grade)
          ? m.grade
          : null,
      notes: typeof m?.notes === 'string' && m.notes.trim() ? m.notes.trim().slice(0, 500) : null,
    }));

    const problem = teamProblem(members);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    const ordered = orderForWriting(members);
    const confirmationId = randomUUID();
    const confirmedAt = new Date();
    const confirmedByName = session!.user.name || session!.user.email || 'Unknown';

    await prisma.surgeryActualTeam.createMany({
      data: ordered.map((m) => ({
        surgeryId: params.id,
        confirmationId,
        confirmedAt,
        confirmedById: session!.user.id,
        confirmedByName,
        userId: m.userId ?? null,
        memberName: m.memberName,
        staffCode: m.staffCode ?? null,
        role: m.role,
        grade: m.grade ?? null,
        position: m.position,
        notes: m.notes ?? null,
      })),
    });

    // The booking is NEVER overwritten. Whose list this was and who operated on
    // it are two different facts, and the post-operative note already loses the
    // first by writing the second over surgeries.surgeonId. Here they sit side
    // by side, which is the only way a board can say "the consultant booked
    // forty and the registrar did thirty of them".
    await prisma.auditLog.create({
      data: {
        userId: session!.user.id,
        action: 'CREATE',
        tableName: 'surgery_actual_team',
        recordId: params.id,
        changes: JSON.stringify({
          confirmationId,
          confirmedAt,
          members: ordered.map((m) => ({
            name: m.memberName, role: m.role, grade: m.grade, position: m.position,
          })),
        }),
      },
    });

    const rows = (await prisma.surgeryActualTeam.findMany({
      where: { surgeryId: params.id },
      orderBy: [{ confirmedAt: 'desc' }, { position: 'asc' }],
    })) as unknown as ActualTeamRow[];

    return NextResponse.json({
      confirmed: currentTeam(rows),
      history: confirmationHistory(rows),
      message: 'Operating team recorded.',
    }, { status: 201 });
  } catch (e) {
    console.error('[actual-team] POST failed:', e);
    return NextResponse.json({ error: 'Could not record the operating team' }, { status: 500 });
  }
}
