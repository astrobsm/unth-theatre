import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { AUDIT_COMMITTEE_ROLES } from '@/lib/emergencyEscalation';

export const dynamic = 'force-dynamic';

/**
 * The Theatre Audit Committee invitations an administrator reviews and sends.
 *
 * The system drafts them at the third hour; it never sends them. Calling
 * somebody before a committee is a decision a person takes, and the record has
 * to show which person took it.
 */
/** Who may SEND an invitation. Deliberately narrow. */
const SENDER_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER'];

/** Who may SEE the board: the sending admins plus the committee itself. */
const VIEWER_ROLES: string[] = [...SENDER_ROLES, ...AUDIT_COMMITTEE_ROLES];

const forbidden = () =>
  NextResponse.json(
    { error: 'Only an administrator or theatre manager may send committee invitations.' },
    { status: 403 },
  );

const actor = (session: any) => ({
  id: session?.user?.id as string | undefined,
  role: session?.user?.role as string | undefined,
});

// GET /api/emergency-escalation/invitations[?sent=0|1]
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { role } = actor(session);
  if (!role || !VIEWER_ROLES.includes(role)) {
    return NextResponse.json(
      { error: 'Only the Theatre Audit Committee and theatre administrators may view this.' },
      { status: 403 },
    );
  }

  const sent = request.nextUrl.searchParams.get('sent');
  const where =
    sent === '1' ? { sentAt: { not: null } } : sent === '0' ? { sentAt: null } : {};

  const escalations = await prisma.emergencyDelayEscalation.findMany({
    where: { stage: 3, invitations: { some: where } },
    orderBy: { stage3At: 'desc' },
    take: 100,
    select: {
      id: true,
      bookingId: true,
      stage: true,
      stage3At: true,
      minutesLateAtLastStage: true,
      reasonAtLastStage: true,
      resolvedAt: true,
      booking: {
        select: {
          patientName: true, folderNumber: true, procedureName: true,
          theatreName: true, requiredByTime: true, requestedAt: true, status: true,
        },
      },
      invitations: {
        where,
        orderBy: { personName: 'asc' },
        select: {
          id: true, userId: true, personName: true, roleOnCase: true, phoneNumber: true,
          message: true, appearAt: true, sentAt: true, channel: true,
        },
      },
    },
  });

  return NextResponse.json({ escalations });
}

const sendSchema = z.object({
  invitationId: z.string().min(1),
  /** When they are to appear. Required: an invitation without a time is a threat, not an appointment. */
  appearAt: z.string().min(1, 'Give the date and time they should attend.'),
  /** The administrator may correct the wording before it goes. */
  message: z.string().trim().min(20).optional(),
  channel: z.enum(['WHATSAPP', 'DASHBOARD']).default('WHATSAPP'),
});

// POST /api/emergency-escalation/invitations — mark one invitation as sent.
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: actorId, role } = actor(session);
  if (!role || !SENDER_ROLES.includes(role)) return forbidden();

  try {
    const body = sendSchema.parse(await request.json());

    const appearAt = new Date(body.appearAt);
    if (Number.isNaN(appearAt.getTime())) {
      return NextResponse.json({ error: 'That date and time could not be read.' }, { status: 400 });
    }

    const invitation = await prisma.auditCommitteeInvitation.findUnique({
      where: { id: body.invitationId },
      select: { id: true, personName: true, roleOnCase: true, userId: true, bookingId: true, sentAt: true },
    });
    if (!invitation) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });

    const updated = await prisma.auditCommitteeInvitation.update({
      where: { id: invitation.id },
      data: {
        appearAt,
        sentAt: new Date(),
        sentById: actorId ?? null,
        channel: body.channel,
        ...(body.message ? { message: body.message } : {}),
      },
      select: { id: true, sentAt: true, appearAt: true, channel: true, message: true },
    });

    // The invited person is told on their dashboard as well as by WhatsApp. A
    // message on one channel only is a message somebody can miss and honestly
    // say they never had.
    await prisma.notification.create({
      data: {
        userId: invitation.userId,
        type: 'SYSTEM_ALERT' as any,
        title: 'Theatre Audit Committee — you are asked to attend',
        message: body.message ?? 'You have been asked to meet the Theatre Audit Committee about an emergency case that did not start.',
        link: '/dashboard',
      },
    }).catch((e) => console.error('[invitations] dashboard notice failed:', e));

    if (actorId) {
      await prisma.auditLog.create({
        data: {
          userId: actorId,
          action: invitation.sentAt ? 'AUDIT_COMMITTEE_INVITATION_RESENT' : 'AUDIT_COMMITTEE_INVITATION_SENT',
          tableName: 'audit_committee_invitations',
          recordId: invitation.id,
          changes: JSON.stringify({
            person: invitation.personName,
            roleOnCase: invitation.roleOnCase,
            bookingId: invitation.bookingId,
            appearAt: appearAt.toISOString(),
            channel: body.channel,
          }),
        },
      }).catch((e) => console.error('[invitations] audit failed:', e));
    }

    return NextResponse.json({ ok: true, invitation: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message ?? 'Invalid request' }, { status: 400 });
    }
    console.error('[invitations] send failed:', error);
    return NextResponse.json({ error: 'Could not record that invitation as sent.' }, { status: 500 });
  }
}
