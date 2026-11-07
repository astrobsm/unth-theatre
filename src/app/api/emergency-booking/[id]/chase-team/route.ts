// ============================================================
// Chase the whole team on one emergency, against the hour
// ------------------------------------------------------------
// GET  — the roll call: everybody on this case, who has answered, whether
//        the pre-anaesthetic review is recorded, and how long is left.
// POST — send the chase: a personalised message to each of them, in the app
//        and on WhatsApp, and a record of who was told and when.
//
// WHY A CHASE SOMEBODY PRESSES, WHEN A LADDER ALREADY RUNS BY ITSELF. The
// delay ladder (lib/emergencyEscalation.ts) waits for the hour to pass and
// then asks everybody why the case did not start. By the time it speaks the
// hour is gone. This is the thing a theatre manager presses at minute twenty,
// while the hour can still be made.
//
// THE QUEUE IS NOT A DELIVERY. queueMessage writes a row for a provider
// configured on the cloud and not on the theatre server, so every reachable
// person also comes back as a wa.me hand-off the sender can press while the
// screen is still open. That is the part that reaches a consultant at night.
//
// NOTHING HERE INVENTS A SANCTION. The notice carried by the messages states
// the standard and what the system already does at one, two and three hours.
// See the long note on HOUR_RULE_NOTICE in lib/emergency/hourRule.ts.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { queueMessage } from '@/lib/comms/send';
import { toWhatsAppNumber } from '@/lib/comms/whatsapp';
import { hourRuleStanding } from '@/lib/emergency/hourRule';
import { assembleRollCall } from '@/lib/emergency/caseRollCall';
import {
  buildTeamChaseMessage, chaseNotificationLine, type CaseFacts,
} from '@/lib/emergency/teamChase';

export const dynamic = 'force-dynamic';

/**
 * Who may chase a team.
 *
 * Anyone named on the case, plus the people whose job it is to make a
 * theatre run. NOT everybody who can see the board: a chase is thirteen
 * WhatsApp messages and a formal notice, and a screen that lets any signed-in
 * user fire that at the consultant body would be used once as a joke and
 * then disabled for ever.
 */
const CHASE_ROLES = [
  'THEATRE_MANAGER', 'ADMIN', 'SYSTEM_ADMINISTRATOR', 'CHIEF_MEDICAL_DIRECTOR',
  'CMAC', 'DC_MAC', 'THEATRE_CHAIRMAN', 'HEAD_OF_SURGERY', 'HEAD_OF_ANAESTHESIA',
  'HEAD_OF_OBSTETRICS_GYNAECOLOGY', 'NURSE_MANAGER', 'CHIEF_NURSING_OFFICER',
  'SURGEON', 'CONSULTANT_SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST',
];

const chaseSchema = z.object({
  /** Anything the sender wants to add. Carried into every message. */
  note: z.string().max(500).optional(),
});

/** Load the booking with everything the roll call needs. */
async function loadBooking(id: string) {
  return prisma.emergencySurgeryBooking.findUnique({
    where: { id },
    include: {
      surgeon: { select: { id: true, fullName: true, phoneNumber: true } },
      anesthetist: { select: { id: true, fullName: true, phoneNumber: true } },
      surgery: { select: { actualStartTime: true } },
      teamAvailability: {
        select: { userId: true, status: true, respondedAt: true, teamRole: true },
      },
      preAnaestheticReviews: { select: { reviewerId: true, status: true } },
      teamChases: { orderBy: { chasedAt: 'desc' }, take: 5 },
    },
  });
}

type LoadedBooking = NonNullable<Awaited<ReturnType<typeof loadBooking>>>;

/** The roll call, the standing against the hour, and the case facts. */
async function assemble(booking: LoadedBooking, chasedByName?: string | null) {
  // One resolver, shared with the CMAC escalation and the assignment chase.
  // See lib/emergency/caseRollCall for why there must never be a second.
  const { members, summary, roster } = await assembleRollCall(booking);

  const standing = hourRuleStanding({
    requestedAt: booking.requestedAt,
    requiredByTime: booking.requiredByTime,
    actualStartTime: booking.surgery?.actualStartTime ?? null,
    status: booking.status,
  });

  const facts: CaseFacts = {
    patientName: booking.patientName,
    folderNumber: booking.folderNumber,
    procedureName: booking.procedureName,
    theatreName: booking.theatreName,
    surgeonName: booking.surgeonName,
    priority: booking.priority,
    chasedByName: chasedByName ?? null,
  };

  return { members, summary, standing, facts, roster };
}

// GET — the roll call, for the panel on the booking card.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const booking = await loadBooking(params.id);
    if (!booking) {
      return NextResponse.json({ error: 'Emergency booking not found' }, { status: 404 });
    }

    const { members, summary, standing } = await assemble(booking);

    return NextResponse.json({
      bookingId: booking.id,
      standing: {
        deadline: standing.deadline,
        minutesRemaining: standing.minutesRemaining,
        overdue: standing.overdue,
        settled: standing.settled,
        setByRequiredBy: standing.setByRequiredBy,
        label: standing.label,
      },
      members,
      summary: {
        total: summary.total,
        expected: summary.expected,
        responded: summary.responded,
        coming: summary.coming,
        unavailable: summary.unavailable,
        silent: summary.silent.map((m) => ({ name: m.name, roleOnCase: m.roleOnCase })),
        reviewDone: summary.reviewDone,
        reachable: summary.reachable,
      },
      canChase: CHASE_ROLES.includes(session.user.role)
        || booking.surgeonId === session.user.id
        || booking.anesthetistId === session.user.id,
      chases: booking.teamChases.map((c) => ({
        id: c.id,
        chasedAt: c.chasedAt,
        chasedByName: c.chasedByName,
        recipients: c.recipients,
        responded: c.responded,
        overdue: c.overdue,
        whatsappQueued: c.whatsappQueued,
      })),
    });
  } catch (error) {
    console.error('[emergency chase-team] GET failed:', error);
    return NextResponse.json({ error: 'Failed to read the team roll call' }, { status: 500 });
  }
}

// POST — chase everybody.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const booking = await loadBooking(params.id);
    if (!booking) {
      return NextResponse.json({ error: 'Emergency booking not found' }, { status: 404 });
    }

    const allowed = CHASE_ROLES.includes(session.user.role)
      || booking.surgeonId === session.user.id
      || booking.anesthetistId === session.user.id;
    if (!allowed) {
      return NextResponse.json(
        { error: 'Only the team on this case, or theatre management, can chase it.' },
        { status: 403 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { note } = chaseSchema.parse(body ?? {});

    const chasedByName = session.user.name || 'Theatre';
    const { members, summary, standing, facts } = await assemble(booking, chasedByName);

    if (members.length === 0) {
      return NextResponse.json(
        {
          error: 'Nobody is named on this case and no on-call roster is published for it, '
            + 'so there is no one to chase. Publish the call roster or name the team on the booking.',
        },
        { status: 409 },
      );
    }

    // A case that has started, been cancelled or completed is not chased.
    // Sending a formal notice about an operation already under way is how a
    // notice stops being read.
    if (standing.settled) {
      return NextResponse.json(
        { error: 'This case is no longer waiting to start, so the team was not chased.' },
        { status: 409 },
      );
    }

    const now = new Date();
    const handoffs: { name: string; kind: string; number: string; text: string }[] = [];
    const skipped: string[] = [];
    let queued = 0;

    for (const member of members) {
      const text = buildTeamChaseMessage({ member, facts, standing, summary, note });

      // The app first: it is the only channel that is certain to arrive, and
      // it is where the buttons they are being asked to press live.
      try {
        await prisma.notification.create({
          data: {
            userId: member.userId,
            type: 'EMERGENCY_TEAM_CHASE',
            title: standing.overdue
              ? `🚨 Emergency PAST THE HOUR — ${facts.procedureName}`
              : `🚨 Emergency — ${standing.label}`,
            message: chaseNotificationLine(member, standing),
            link: '/dashboard/emergency-booking',
          },
        });
      } catch (e) {
        console.error('[emergency chase-team] notification failed for', member.userId, e);
      }

      const wa = member.phoneNumber ? toWhatsAppNumber(member.phoneNumber) : null;
      try {
        const q = await queueMessage({
          channel: 'WHATSAPP' as never,
          priority: 'URGENT' as never,
          recipientUserId: member.userId,
          recipientName: member.name,
          recipientAddress: wa,
          recipientIsStaff: true,
          body: text,
          relatedType: 'EMERGENCY_BOOKING',
          relatedId: booking.id,
          trigger: 'EMERGENCY_TEAM_CHASE',
          // One scope per person per chase round, so chasing twice in an
          // hour sends twice -- which is the point of pressing it twice --
          // while one round cannot double-send to the same person.
          scope: `${booking.id}:${member.userId}:${now.getTime()}`,
          createdById: session.user.id,
          createdByName: chasedByName,
        });
        if (q.queued) queued += 1;
        else if (q.reason) skipped.push(`${member.name}: ${q.reason}`);
      } catch (e) {
        console.error('[emergency chase-team] queue failed for', member.userId, e);
        skipped.push(`${member.name}: the message could not be queued. It is in their app.`);
      }

      if (wa) handoffs.push({ name: member.name, kind: member.roleOnCase, number: wa, text });
      else skipped.push(`${member.name} (${member.roleOnCase}) has no phone number on file — app only.`);
    }

    // The record of who was told, as it stood at the moment of telling.
    let chaseId: string | null = null;
    try {
      const row = await prisma.emergencyTeamChase.create({
        data: {
          emergencyBookingId: booking.id,
          chasedAt: now,
          chasedById: session.user.id,
          chasedByName,
          deadlineAt: standing.deadline,
          minutesToDeadline: standing.minutesRemaining,
          overdue: standing.overdue,
          recipients: members.length,
          expected: summary.expected,
          responded: summary.responded,
          reviewRecorded: summary.reviewDone,
          rollCall: JSON.stringify(members.map((m) => ({
            userId: m.userId,
            name: m.name,
            roleOnCase: m.roleOnCase,
            availability: m.availability,
            reviewDone: m.reviewDone,
            reached: Boolean(m.phoneNumber),
          }))),
          whatsappQueued: queued,
          whatsappSkipped: skipped.length > 0 ? skipped.join(' | ') : null,
          note: (note ?? '').trim() || null,
        },
      });
      chaseId = row.id;
    } catch (e) {
      // The messages have gone. Losing the record is bad and is logged, but
      // failing the request would tell the sender nothing was sent.
      console.error('[emergency chase-team] could not record the chase:', e);
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        tableName: 'EmergencyTeamChase',
        recordId: chaseId ?? booking.id,
        changes: JSON.stringify({
          bookingId: booking.id,
          recipients: members.length,
          responded: summary.responded,
          expected: summary.expected,
          reviewRecorded: summary.reviewDone,
          minutesToDeadline: standing.minutesRemaining,
          overdue: standing.overdue,
          whatsappQueued: queued,
        }),
      },
    }).catch(() => undefined);

    return NextResponse.json({
      chaseId,
      standing: {
        deadline: standing.deadline,
        minutesRemaining: standing.minutesRemaining,
        overdue: standing.overdue,
        label: standing.label,
      },
      recipients: members.length,
      expected: summary.expected,
      responded: summary.responded,
      reviewDone: summary.reviewDone,
      silent: summary.silent.map((m) => ({ name: m.name, roleOnCase: m.roleOnCase })),
      whatsappQueued: queued,
      whatsappSkipped: skipped,
      handoffs,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('[emergency chase-team] POST failed:', error);
    return NextResponse.json({ error: 'Failed to chase the team' }, { status: 500 });
  }
}
