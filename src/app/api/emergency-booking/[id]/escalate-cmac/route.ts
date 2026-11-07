// ============================================================
// Two hours gone: hand the CMAC the case and the team's phone numbers
// ------------------------------------------------------------
// GET  — whether the two hours have passed, and what the CMAC would be sent.
// POST — send it.
//
// The button this serves does not exist on the card until the case has sat
// for two hours unstarted. That is the whole design: an escalation an
// executive receives on nights when theatre already has it in hand is an
// escalation he stops reading, and then the one that mattered is lost with
// the rest. See the long note in lib/emergency/cmacEscalation.ts.
//
// WHY A SECOND LADDER DOES NOT RUN HERE. lib/emergencyEscalation.ts already
// informs the Chief Medical Director automatically at two hours. This is not
// that. That is a notification saying a case is late; this hands a named
// officer a working directory of the people on it, because by hour two the
// problem is not that nobody knows — it is that the person with authority to
// break the deadlock has to find seven numbers across three departments
// before he can use it.
//
// THE DIRECTORY IS THE MESSAGE, so the roll call must be the same one the
// board shows. It comes from lib/emergency/caseRollCall, shared with the team
// chase; a second resolver here would eventually name a different
// anaesthetist from the card and discredit both.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { queueMessage } from '@/lib/comms/send';
import { toWhatsAppNumber } from '@/lib/comms/whatsapp';
import { hourRuleStanding, isSettled } from '@/lib/emergency/hourRule';
import { assembleRollCall } from '@/lib/emergency/caseRollCall';
import { readReviewState } from '@/lib/emergency/assignmentChase';
import { blockerSpec } from '@/lib/emergency/blockers';
import {
  CMAC_FALLBACK_ROLES, CMAC_LABELS, CMAC_ROLES, buildCmacMessage,
  cmacNotificationLine, cmacStanding, dialable, teamDirectory,
  type CmacCaseFacts, type OpenBlocker,
} from '@/lib/emergency/cmacEscalation';

export const dynamic = 'force-dynamic';

/**
 * Who may hand a case to the CMAC.
 *
 * Narrower than the team chase. This reaches a member of hospital management
 * by name with a list of everybody's personal numbers, and a button any
 * signed-in user could press would be pressed once as a joke and disabled for
 * ever. The team on the case may press it — they are the ones who have spent
 * the two hours — and so may theatre and clinical management.
 */
const ESCALATE_ROLES = [
  'THEATRE_MANAGER', 'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_CHAIRMAN',
  'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC',
  'HEAD_OF_SURGERY', 'HEAD_OF_ANAESTHESIA', 'HEAD_OF_OBSTETRICS_GYNAECOLOGY',
  'SURGEON', 'CONSULTANT_SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST',
];

const escalateSchema = z.object({
  note: z.string().max(500).optional(),
});

async function loadBooking(id: string) {
  return prisma.emergencySurgeryBooking.findUnique({
    where: { id },
    include: {
      surgeon: { select: { id: true, fullName: true, phoneNumber: true } },
      anesthetist: { select: { id: true, fullName: true, phoneNumber: true } },
      surgery: { select: { actualStartTime: true } },
      teamAvailability: { select: { userId: true, status: true, respondedAt: true } },
      preAnaestheticReviews: {
        select: {
          reviewerId: true, reviewerName: true, status: true,
          fitnessDecision: true, createdAt: true, updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      },
      caseBlockers: {
        where: { resolvedAt: null },
        select: { reason: true, detail: true, reportedByName: true },
        orderBy: { reportedAt: 'desc' },
      },
    },
  });
}

type LoadedBooking = NonNullable<Awaited<ReturnType<typeof loadBooking>>>;

const factsOf = (
  booking: LoadedBooking,
  by?: { name?: string | null; role?: string | null },
): CmacCaseFacts => ({
  patientName: booking.patientName,
  folderNumber: booking.folderNumber,
  procedureName: booking.procedureName,
  diagnosis: booking.diagnosis,
  ward: booking.ward,
  theatreName: booking.theatreName,
  surgeonName: booking.surgeonName,
  priority: booking.priority,
  status: booking.status,
  escalatedByName: by?.name ?? null,
  escalatedByRole: by?.role ?? null,
});

const blockersOf = (booking: LoadedBooking): OpenBlocker[] =>
  booking.caseBlockers.map((b) => ({
    label: blockerSpec(b.reason)?.label ?? b.reason,
    detail: b.detail,
    reportedByName: b.reportedByName,
  }));

/** The officers this goes to, by name. Never a broadcast list. */
async function resolveOfficers() {
  const primary = await prisma.user.findMany({
    where: { status: 'APPROVED' as never, role: { in: CMAC_ROLES as never } },
    select: { id: true, fullName: true, phoneNumber: true, role: true },
    orderBy: { role: 'asc' },
  }).catch(() => []);
  if (primary.length > 0) return { officers: primary, usedFallback: false };

  const fallback = await prisma.user.findMany({
    where: { status: 'APPROVED' as never, role: { in: CMAC_FALLBACK_ROLES as never } },
    select: { id: true, fullName: true, phoneNumber: true, role: true },
    orderBy: { fullName: 'asc' },
  }).catch(() => []);
  return { officers: fallback, usedFallback: true };
}

// GET — is it due, and what would be sent?
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

    const settled = isSettled({
      status: booking.status,
      actualStartTime: booking.surgery?.actualStartTime ?? null,
    });
    const cmac = cmacStanding({ requestedAt: booking.requestedAt, settled });
    const { members, summary } = await assembleRollCall(booking);
    const review = readReviewState(booking.preAnaestheticReviews);
    const { officers, usedFallback } = await resolveOfficers();

    return NextResponse.json({
      bookingId: booking.id,
      due: cmac.due,
      waited: cmac.waited,
      waitedMinutes: cmac.waitedMinutes,
      minutesUntilDue: cmac.minutesUntilDue,
      settled,
      officers: officers.map((o) => ({
        name: o.fullName,
        label: CMAC_LABELS[o.role] ?? o.role,
        reachable: Boolean(dialable(o.phoneNumber)),
      })),
      usedFallback,
      // The directory, shown to the sender before they send it. Nobody should
      // forward a colleague's personal number without seeing what is going.
      directory: teamDirectory(members),
      reachable: members.filter((m) => Boolean(dialable(m.phoneNumber))).length,
      members: members.length,
      responded: summary.responded,
      expected: summary.expected,
      review: { done: review.done, started: review.started, reviewerName: review.reviewerName },
      openBlockers: blockersOf(booking),
      canEscalate: ESCALATE_ROLES.includes(session.user.role)
        || booking.surgeonId === session.user.id
        || booking.anesthetistId === session.user.id,
    });
  } catch (error) {
    console.error('[emergency escalate-cmac] GET failed:', error);
    return NextResponse.json({ error: 'Failed to read this case' }, { status: 500 });
  }
}

// POST — send it to the CMAC.
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

    const allowed = ESCALATE_ROLES.includes(session.user.role)
      || booking.surgeonId === session.user.id
      || booking.anesthetistId === session.user.id;
    if (!allowed) {
      return NextResponse.json(
        {
          error: 'Only the team on this case, or theatre and clinical management, can '
            + 'escalate it to the CMAC.',
        },
        { status: 403 },
      );
    }

    const settled = isSettled({
      status: booking.status,
      actualStartTime: booking.surgery?.actualStartTime ?? null,
    });
    const cmac = cmacStanding({ requestedAt: booking.requestedAt, settled });

    // Enforced on the server, not merely hidden on the card. The two hours
    // are the whole justification for sending an executive a list of personal
    // numbers, and a window that only the UI respects is not a window.
    if (!cmac.due) {
      return NextResponse.json(
        {
          error: settled
            ? 'This case is no longer waiting to start, so it was not escalated.'
            : `This case was booked ${cmac.waited} ago. The CMAC is handed a case at two `
              + `hours — ${cmac.minutesUntilDue} minutes from now if it still has not started.`,
        },
        { status: 409 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { note } = escalateSchema.parse(body ?? {});

    const { officers, usedFallback } = await resolveOfficers();
    if (officers.length === 0) {
      return NextResponse.json(
        {
          error: 'No CMAC, Deputy CMAC or Chief Medical Director account is registered on '
            + 'the system, so there is nobody to escalate to. Tell them directly.',
        },
        { status: 409 },
      );
    }

    const escalatedByName = session.user.name || 'Theatre';
    const standing = hourRuleStanding({
      requestedAt: booking.requestedAt,
      requiredByTime: booking.requiredByTime,
      actualStartTime: booking.surgery?.actualStartTime ?? null,
      status: booking.status,
    });
    const { members, summary } = await assembleRollCall(booking);
    const review = readReviewState(booking.preAnaestheticReviews);
    const facts = factsOf(booking, { name: escalatedByName, role: session.user.role });
    const blockers = blockersOf(booking);
    const reachable = members.filter((m) => Boolean(dialable(m.phoneNumber))).length;

    const now = new Date();
    const handoffs: { name: string; kind: string; number: string; text: string }[] = [];
    const skipped: string[] = [];
    let queued = 0;

    if (usedFallback) {
      skipped.push(
        'No CMAC or Deputy CMAC is registered on the system — this went to the Chief '
        + 'Medical Director instead.',
      );
    }

    for (const officer of officers) {
      const label = CMAC_LABELS[officer.role] ?? officer.role.replace(/_/g, ' ');
      const text = buildCmacMessage({
        recipientName: officer.fullName,
        recipientLabel: label,
        facts,
        standing,
        cmac,
        members,
        review,
        blockers,
        responded: summary.responded,
        expected: summary.expected,
        note,
      });

      try {
        await prisma.notification.create({
          data: {
            userId: officer.id,
            type: 'EMERGENCY_ESCALATION',
            title: `🚨 Two hours — emergency not operated: ${booking.procedureName}`,
            message: cmacNotificationLine(facts, cmac, reachable),
            link: '/dashboard/emergency-booking',
          },
        });
      } catch (e) {
        console.error('[emergency escalate-cmac] notification failed for', officer.id, e);
      }

      const wa = officer.phoneNumber ? toWhatsAppNumber(officer.phoneNumber) : null;
      try {
        const q = await queueMessage({
          channel: 'WHATSAPP' as never,
          priority: 'URGENT' as never,
          recipientUserId: officer.id,
          recipientName: officer.fullName,
          recipientAddress: wa,
          recipientIsStaff: true,
          body: text,
          relatedType: 'EMERGENCY_BOOKING',
          relatedId: booking.id,
          trigger: 'EMERGENCY_CMAC_ESCALATION',
          scope: `cmac:${booking.id}:${officer.id}:${now.getTime()}`,
          createdById: session.user.id,
          createdByName: escalatedByName,
        });
        if (q.queued) queued += 1;
        else if (q.reason) skipped.push(`${officer.fullName}: ${q.reason}`);
      } catch (e) {
        console.error('[emergency escalate-cmac] queue failed for', officer.id, e);
        skipped.push(`${officer.fullName}: the message could not be queued. It is in their app.`);
      }

      if (wa) handoffs.push({ name: officer.fullName, kind: label, number: wa, text });
      else skipped.push(`${officer.fullName} (${label}) has no phone number on file — app only.`);
    }

    let chaseId: string | null = null;
    try {
      const row = await prisma.emergencyTeamChase.create({
        data: {
          emergencyBookingId: booking.id,
          kind: 'CMAC',
          chasedAt: now,
          chasedById: session.user.id,
          chasedByName: escalatedByName,
          deadlineAt: standing.deadline,
          minutesToDeadline: standing.minutesRemaining,
          overdue: true,
          recipients: officers.length,
          expected: summary.expected,
          responded: summary.responded,
          reviewRecorded: review.done,
          rollCall: JSON.stringify({
            officers: officers.map((o) => ({ userId: o.id, name: o.fullName, role: o.role })),
            // Who the officer was given, so a review can ask whether the list
            // he was handed was the right one.
            team: members.map((m) => ({
              userId: m.userId,
              name: m.name,
              roleOnCase: m.roleOnCase,
              availability: m.availability,
              reached: Boolean(m.phoneNumber),
            })),
          }),
          whatsappQueued: queued,
          whatsappSkipped: skipped.length > 0 ? skipped.join(' | ') : null,
          note: (note ?? '').trim() || null,
        },
      });
      chaseId = row.id;
    } catch (e) {
      console.error('[emergency escalate-cmac] could not record the escalation:', e);
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        tableName: 'EmergencyTeamChase',
        recordId: chaseId ?? booking.id,
        changes: JSON.stringify({
          kind: 'CMAC',
          bookingId: booking.id,
          waitedMinutes: cmac.waitedMinutes,
          officers: officers.length,
          teamListed: members.length,
          reachable,
          openBlockers: blockers.length,
          whatsappQueued: queued,
        }),
      },
    }).catch(() => undefined);

    return NextResponse.json({
      chaseId,
      waited: cmac.waited,
      officers: officers.map((o) => ({
        name: o.fullName, label: CMAC_LABELS[o.role] ?? o.role,
      })),
      usedFallback,
      teamListed: members.length,
      reachable,
      whatsappQueued: queued,
      whatsappSkipped: skipped,
      handoffs,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('[emergency escalate-cmac] POST failed:', error);
    return NextResponse.json({ error: 'Failed to escalate to the CMAC' }, { status: 500 });
  }
}
