// ============================================================
// Chase the holding area for a patient who was called for
// ------------------------------------------------------------
// GET  — who this chase would reach, before it is sent. The screen shows the
//        name, so nobody presses a button addressed to an empty room.
// POST — send it: the app notice, the WhatsApp queue entry, and a wa.me
//        hand-off the caller can press while the screen is still open.
//
// WHY. The theatre nurse calls a patient up and then waits. Somewhere between
// the ward and the table the patient stops moving, and the only ways to find
// out why were to leave the theatre or to ring round. The person who can see
// the patient is the holding-area nurse, and this asks them.
//
// IT GOES TO THE HOLDING AREA OF THAT COMPLEX. Professor Ojukwu, the Eye
// Theatre, A&E and the Cardiothoracic Centre each have their own. A chase
// addressed to "the holding area" reached whoever was on one list, which for
// a patient waiting outside the Eye Theatre is somebody in another building.
//
// IT REFUSES RATHER THAN PRETEND. Where nobody is named to that holding area
// for the shift, this returns 409 and says so. A role-targeted send that
// matches no rows returns success, and then the screen says the message went
// while nothing was addressed and the caller stops looking.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/apiError';
import { queueMessage } from '@/lib/comms/send';
import { toWhatsAppNumber } from '@/lib/comms/whatsapp';
import { watToday, watMinutesOfDay } from '@/lib/watDay';
import { parseTheatreDay } from '@/lib/theatre/day';
import { electiveShiftFromMinutes, type DutyShift } from '@/lib/rosterOnDutyShift';
import {
  normaliseComplex, complexOfRow, complexForTheatre, HOLDING_AREA_COMPLEXES,
} from '@/lib/holdingArea/complexes';
import {
  buildHoldingAreaChase, chaseNotificationLine, nobodyOnDutyMessage,
  type HoldingAreaChaseFacts,
} from '@/lib/holdingArea/chase';

export const dynamic = 'force-dynamic';

/**
 * Who may chase a holding area.
 *
 * The people who call patients up and the people who run the floor. It is one
 * message to one or two nurses in the next room, not a broadcast, so this is
 * deliberately wider than the emergency team chase — but it is still not every
 * signed-in account.
 */
const MAY_CHASE = [
  'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', 'INFECTION_CONTROL_NURSE',
  'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'ANAESTHETIC_TECHNICIAN',
  'SURGEON', 'CONSULTANT_SURGEON',
  'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'ADMIN', 'SYSTEM_ADMINISTRATOR',
  'BOOKING_OFFICER',
];

const SHIFT_LABEL: Record<DutyShift, string> = {
  MORNING: 'Morning', CALL: 'Call', NIGHT: 'Night',
};

/** The shift the floor is running, on the hospital's own clock. */
const shiftNow = (): DutyShift => electiveShiftFromMinutes(watMinutesOfDay(new Date()));

interface Target {
  rosterId: string;
  userId: string;
  name: string;
  phoneNumber: string | null;
  notes: string | null;
}

/**
 * The case, the complex it belongs to, and who is on that holding area.
 *
 * Returns a `problem` rather than throwing, because every one of these is
 * something the caller has to be told in words: an unknown case, a theatre
 * nobody can place, or an empty holding area.
 */
async function resolve(surgeryId: string, complexOverride: string | null) {
  const surgery = await prisma.surgery.findUnique({
    where: { id: surgeryId },
    select: {
      id: true, procedureName: true, theatreId: true, location: true,
      patient: { select: { name: true, folderNumber: true, ward: true } },
    },
  });
  if (!surgery) return { problem: 'That case is not on file.' as const, status: 404 };

  // `Surgery.theatreId` is a soft reference with no relation on it, so the
  // suite is read separately. It is the better authority for which complex a
  // room is in: a theatre can be added without anybody editing constants.ts.
  const suite = surgery.theatreId
    ? await prisma.theatreSuite.findUnique({
        where: { id: surgery.theatreId },
        select: { name: true, location: true },
      }).catch(() => null)
    : null;

  const theatreName = suite?.name ?? null;
  const complex = normaliseComplex(complexOverride)
    ?? complexForTheatre(theatreName, suite?.location ?? surgery.location);

  if (!complex) {
    // Never guessed. A chase sent to the main holding area for a case in the
    // Eye Theatre reaches somebody who cannot see the patient — and the
    // sender is told it was delivered.
    return {
      problem: theatreName
        ? `${theatreName} is not matched to a theatre complex, so there is no way to tell `
          + 'which holding area holds this patient. Choose the complex and send again.'
        : 'This case has no theatre yet, so there is no way to tell which holding area '
          + 'holds the patient. Choose the complex and send again.',
      status: 409,
      code: 'COMPLEX_UNKNOWN' as const,
      complexes: HOLDING_AREA_COMPLEXES,
    };
  }

  const shift = shiftNow();
  const day = parseTheatreDay(watToday());

  const rows = await prisma.roster.findMany({
    where: { date: day, shift, subRole: 'HOLDING_AREA' },
    select: { id: true, userId: true, staffName: true, notes: true, location: true },
  });
  const onThisOne = rows.filter((r) => complexOfRow(r.location) === complex);

  const users = onThisOne.length
    ? await prisma.user.findMany({
        where: { id: { in: onThisOne.map((r) => r.userId) } },
        select: { id: true, fullName: true, phoneNumber: true },
      }).catch(() => [])
    : [];

  const targets: Target[] = onThisOne.map((r) => {
    const u = users.find((x) => x.id === r.userId);
    return {
      rosterId: r.id,
      userId: r.userId,
      name: u?.fullName ?? r.staffName,
      phoneNumber: u?.phoneNumber ?? null,
      notes: r.notes,
    };
  });

  // The call-up, for how long the theatre has been waiting.
  const callUp = await prisma.patientCallUp.findFirst({
    where: { surgeryId, status: { in: ['INVITED', 'PATIENT_EN_ROUTE'] as never } },
    orderBy: { invitedAt: 'desc' },
    select: { id: true, invitedAt: true, status: true },
  }).catch(() => null);

  const minutesSinceCallUp = callUp?.invitedAt
    ? Math.max(0, Math.round((Date.now() - new Date(callUp.invitedAt).getTime()) / 60000))
    : null;

  return {
    surgery, theatreName, complex, shift, targets, callUp, minutesSinceCallUp,
  };
}

/** GET /api/holding-area/chase?surgeryId=…&complex=… — who it would reach. */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const surgeryId = request.nextUrl.searchParams.get('surgeryId') ?? '';
    if (!surgeryId) {
      return NextResponse.json({ error: 'Which case?' }, { status: 400 });
    }

    const r = await resolve(surgeryId, request.nextUrl.searchParams.get('complex'));
    if ('problem' in r) {
      return NextResponse.json(
        { error: r.problem, code: r.code ?? null, complexes: r.complexes ?? null },
        { status: r.status },
      );
    }

    return NextResponse.json({
      complex: r.complex,
      shift: r.shift,
      shiftLabel: SHIFT_LABEL[r.shift],
      minutesSinceCallUp: r.minutesSinceCallUp,
      // Named, so nobody presses a button addressed to an empty room.
      willReach: r.targets.map((t) => ({
        name: t.name, hasPhone: Boolean(t.phoneNumber), notes: t.notes,
      })),
      nobodyOnDuty: r.targets.length === 0,
      message: r.targets.length === 0
        ? nobodyOnDutyMessage(r.complex, SHIFT_LABEL[r.shift])
        : null,
    });
  } catch (error) {
    return apiError('holding-area/chase GET', error);
  }
}

/** POST — send the chase. */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!MAY_CHASE.includes((session.user.role ?? '').toUpperCase())) {
    return NextResponse.json({
      error: 'Chasing the holding area is done by the theatre team and theatre management.',
      code: 'NO_ACCESS',
    }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const surgeryId = typeof body.surgeryId === 'string' ? body.surgeryId.trim() : '';
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : '';
    if (!surgeryId) {
      return NextResponse.json({ error: 'Which case?' }, { status: 400 });
    }

    const r = await resolve(surgeryId, typeof body.complex === 'string' ? body.complex : null);
    if ('problem' in r) {
      return NextResponse.json(
        { error: r.problem, code: r.code ?? null, complexes: r.complexes ?? null },
        { status: r.status },
      );
    }

    // THE REFUSAL. Nothing was sent, and the caller is told that in the same
    // breath as being told what to do instead.
    if (r.targets.length === 0) {
      return NextResponse.json({
        error: nobodyOnDutyMessage(r.complex, SHIFT_LABEL[r.shift]),
        code: 'NOBODY_ON_DUTY',
        complex: r.complex,
        shiftLabel: SHIFT_LABEL[r.shift],
        sent: 0,
      }, { status: 409 });
    }

    const chasedByName = session.user.name ?? 'A member of the theatre team';
    const facts: HoldingAreaChaseFacts = {
      complex: r.complex,
      theatreName: r.theatreName,
      patientName: r.surgery.patient?.name ?? null,
      folderNumber: r.surgery.patient?.folderNumber ?? null,
      ward: r.surgery.patient?.ward ?? null,
      procedureName: r.surgery.procedureName ?? null,
      minutesSinceCallUp: r.minutesSinceCallUp,
      calledByName: chasedByName,
      calledByRole: session.user.role ?? null,
      note: note || null,
    };

    const text = buildHoldingAreaChase(facts);
    const line = chaseNotificationLine(facts);
    const now = Date.now();

    const handoffs: Array<{ name: string; number: string; text: string }> = [];
    const skipped: string[] = [];
    let queued = 0;

    for (const t of r.targets) {
      try {
        await prisma.notification.create({
          data: {
            userId: t.userId,
            type: 'SYSTEM_ALERT' as never,
            title: `🔔 ${r.theatreName ?? 'Theatre'} is waiting for a patient`,
            message: line,
            link: '/dashboard/holding-area',
          },
        });
      } catch (e) {
        console.error('[holding-area chase] notification failed for', t.userId, e);
      }

      const wa = t.phoneNumber ? toWhatsAppNumber(t.phoneNumber) : null;
      try {
        const q = await queueMessage({
          channel: 'WHATSAPP' as never,
          priority: 'URGENT' as never,
          recipientUserId: t.userId,
          recipientName: t.name,
          recipientAddress: wa,
          recipientIsStaff: true,
          body: text,
          relatedType: 'SURGERY',
          relatedId: r.surgery.id,
          trigger: 'HOLDING_AREA_CHASE',
          // One scope per person per press. Pressing it again five minutes
          // later sends again, which is the point of pressing it again.
          scope: `${r.surgery.id}:${t.userId}:${now}`,
          createdById: session.user.id,
          createdByName: chasedByName,
        });
        if (q.queued) queued += 1;
        else if (q.reason) skipped.push(`${t.name}: ${q.reason}`);
      } catch (e) {
        console.error('[holding-area chase] queue failed for', t.userId, e);
        skipped.push(`${t.name}: the message could not be queued. It is in their app.`);
      }

      if (wa) handoffs.push({ name: t.name, number: wa, text });
      else skipped.push(`${t.name} has no phone number on file — app only.`);
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'HOLDING_AREA_CHASED',
        tableName: 'surgeries',
        recordId: r.surgery.id,
        changes: JSON.stringify({
          complex: r.complex,
          shift: r.shift,
          theatre: r.theatreName,
          recipients: r.targets.map((t) => t.name),
          minutesSinceCallUp: r.minutesSinceCallUp,
          note: note || null,
        }),
      },
    }).catch(() => { /* the chase has gone; losing the log must not fail it */ });

    return NextResponse.json({
      sent: r.targets.length,
      complex: r.complex,
      shiftLabel: SHIFT_LABEL[r.shift],
      reached: r.targets.map((t) => t.name),
      whatsappQueued: queued,
      whatsappSkipped: skipped,
      handoffs,
      minutesSinceCallUp: r.minutesSinceCallUp,
    }, { status: 201 });
  } catch (error) {
    return apiError('holding-area/chase POST', error);
  }
}
