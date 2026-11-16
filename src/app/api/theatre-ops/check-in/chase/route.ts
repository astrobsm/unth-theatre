/**
 * Chase a case team for their check-in, or thank the ones who answered early.
 *
 * POST { surgeryId, kind: 'CHASE' | 'COMMEND', note? }
 *
 * THE QUEUE IS NOT A DELIVERY. queueMessage writes a row for a provider
 * configured on the cloud and not on the theatre server, so every reachable
 * person also comes back as a wa.me hand-off the sender can press while the
 * screen is still open. That is the part that reaches a consultant at night.
 * Same arrangement as the emergency team chase, for the same reason.
 *
 * WHO IT GOES TO IS DECIDED HERE, NOT BY THE CLIENT. The browser names a case
 * and an intention; the server reads the check-in rows and works out who is
 * silent or who was early. A client that could name recipients could chase a
 * colleague who had already answered, or commend somebody who had not turned
 * up — and both of those destroy the thing they are trying to use.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { queueMessage } from '@/lib/comms/send';
import { toWhatsAppNumber } from '@/lib/comms/whatsapp';
import { publicSiteUrl } from '@/lib/patients/publicLink';
import { caseTeamSlots, CASE_TEAM_SELECT } from '@/lib/theatreOps/caseTeam';
import { scheduledInstant } from '@/lib/theatreOps/clock';
import {
  EARLY_CONFIRM_MINUTES,
  REFUSAL_MESSAGE,
  buildCheckInChaseMessage,
  buildCheckInCommendMessage,
  chaseNotificationLine,
  commendNotificationLine,
  commendableMembers,
  minutesAhead,
  silentMembers,
  type CaseFacts,
  type ChaseMember,
} from '@/lib/theatreOps/checkInChase';
import type { CheckInStatus } from '@/lib/theatreOps/checkIn';

export const dynamic = 'force-dynamic';

/**
 * Who may press these.
 *
 * The people who make a theatre run, plus anybody named on the case itself —
 * a surgeon chasing their own team at 07:00 is the commonest use and should
 * not need a coordinator. NOT every signed-in user: a chase is a stack of
 * WhatsApp messages to consultants, and a button that lets anyone fire that
 * would be used once as a joke and then switched off for good.
 */
const CHASE_ROLES = [
  'THEATRE_MANAGER', 'ADMIN', 'SYSTEM_ADMINISTRATOR', 'CHIEF_MEDICAL_DIRECTOR',
  'CMAC', 'DC_MAC', 'THEATRE_CHAIRMAN',
  'HEAD_OF_SURGERY', 'HEAD_OF_ANAESTHESIA', 'HEAD_OF_OBSTETRICS_GYNAECOLOGY',
  'SURGEON', 'CONSULTANT_SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST',
  'SCRUB_NURSE', 'ANAESTHETIC_TECHNICIAN',
];

const bodySchema = z.object({
  surgeryId: z.string().min(1),
  kind: z.enum(['CHASE', 'COMMEND']),
  note: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const me = session?.user as { id?: string; name?: string | null; role?: string } | undefined;
  if (!me?.id) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Could not read that request.' }, { status: 400 });
    }
    const { surgeryId, kind, note } = parsed.data;

    const surgery = await prisma.surgery.findUnique({
      where: { id: surgeryId },
      select: {
        id: true,
        procedureName: true,
        scheduledDate: true,
        scheduledTime: true,
        location: true,
        unit: true,
        status: true,
        ...CASE_TEAM_SELECT,
        teamCheckIns: {
          select: { userId: true, status: true, checkedInAt: true },
        },
      },
    });
    if (!surgery) {
      return NextResponse.json({ error: 'No such case.' }, { status: 404 });
    }

    const slots = caseTeamSlots(surgery);
    const onThisCase = slots.some((s) => s.userId === me.id);
    if (!onThisCase && !CHASE_ROLES.includes(me.role ?? '')) {
      return NextResponse.json(
        {
          error:
            'Only somebody on this case, or a theatre co-ordinator, may message its team.',
        },
        { status: 403 },
      );
    }

    if (slots.length === 0) {
      return NextResponse.json(
        { error: 'Nobody is assigned to this case yet, so there is no team to message.' },
        { status: 400 },
      );
    }

    // Phone numbers are not on the team select — looked up once, here.
    const users = await prisma.user.findMany({
      where: { id: { in: slots.map((s) => s.userId) } },
      select: { id: true, phoneNumber: true, fullName: true },
    });
    const phoneById = new Map(users.map((u) => [u.id, u.phoneNumber]));
    const checkInByUser = new Map(surgery.teamCheckIns.map((c) => [c.userId, c]));

    const members: ChaseMember[] = slots.map((slot) => {
      const c = checkInByUser.get(slot.userId);
      return {
        userId: slot.userId,
        name: slot.name,
        roleOnCase: slot.roleOnCase,
        status: (c?.status as CheckInStatus | undefined) ?? null,
        checkedInAt: c?.checkedInAt ?? null,
        phoneNumber: phoneById.get(slot.userId) ?? null,
      };
    });

    const scheduledAt = scheduledInstant(surgery.scheduledDate, surgery.scheduledTime);
    const facts: CaseFacts = {
      procedureName: surgery.procedureName,
      scheduledTime: surgery.scheduledTime ?? 'an unscheduled time',
      scheduledAt,
      theatre: surgery.location,
      unit: surgery.unit,
    };

    // ── Who, decided from the record ────────────────────────────────────
    let targets: ChaseMember[];
    if (kind === 'CHASE') {
      targets = silentMembers(members);
      if (targets.length === 0) {
        return NextResponse.json(
          { refused: true, reason: 'NOBODY_SILENT', message: REFUSAL_MESSAGE.NOBODY_SILENT },
          { status: 200 },
        );
      }
    } else {
      if (!scheduledAt) {
        return NextResponse.json(
          {
            refused: true,
            reason: 'NO_SCHEDULED_TIME',
            message: REFUSAL_MESSAGE.NO_SCHEDULED_TIME,
          },
          { status: 200 },
        );
      }
      targets = commendableMembers(members, scheduledAt);
      if (targets.length === 0) {
        return NextResponse.json(
          { refused: true, reason: 'NOBODY_EARLY', message: REFUSAL_MESSAGE.NOBODY_EARLY },
          { status: 200 },
        );
      }
    }

    const link = `${publicSiteUrl()}/dashboard/theatre-ops/check-in`;
    const senderName = me.name?.trim() || null;
    const day = (surgery.scheduledDate ?? new Date()).toISOString().slice(0, 10);

    const sent: Array<{ name: string; roleOnCase: string; whatsapp: string | null }> = [];
    const skipped: string[] = [];

    for (const member of targets) {
      const ahead = kind === 'COMMEND' ? minutesAhead(member, scheduledAt) ?? 0 : 0;
      const body = kind === 'CHASE'
        ? buildCheckInChaseMessage({ member, facts, link, note, senderName })
        : buildCheckInCommendMessage({ member, facts, minutesAhead: ahead, note, senderName });

      const wa = member.phoneNumber ? toWhatsAppNumber(member.phoneNumber) : null;

      await queueMessage({
        channel: wa ? 'WHATSAPP' : 'IN_APP',
        priority: kind === 'CHASE' ? 'HIGH' : 'NORMAL',
        recipientUserId: member.userId,
        recipientName: member.name ?? 'Colleague',
        recipientAddress: member.phoneNumber ?? null,
        recipientIsStaff: true,
        body,
        subject: kind === 'CHASE'
          ? chaseNotificationLine(facts)
          : commendNotificationLine(facts, ahead),
        sensitivity: 'OPERATIONAL',
        relatedType: 'SURGERY',
        relatedId: surgery.id,
        trigger: kind === 'CHASE' ? 'check-in-chase' : 'check-in-commend',
        // The day is part of the identity, so chasing the same person again
        // tomorrow is a new message while a double-click today is not.
        scope: `${surgery.id}:${member.userId}:${kind}:${day}`,
        createdById: me.id,
        createdByName: senderName,
      });

      if (wa) {
        sent.push({
          name: member.name ?? 'Colleague',
          roleOnCase: member.roleOnCase,
          whatsapp: `https://wa.me/${wa}?text=${encodeURIComponent(body)}`,
        });
      } else {
        sent.push({ name: member.name ?? 'Colleague', roleOnCase: member.roleOnCase, whatsapp: null });
        skipped.push(
          `${member.name ?? 'Colleague'} (${member.roleOnCase}) has no phone number on file — sent in the app only.`,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      kind,
      count: sent.length,
      sent,
      skipped,
      thresholdMinutes: EARLY_CONFIRM_MINUTES,
      notice:
        'Queued in the app. The WhatsApp provider is configured on the cloud only, so '
        + 'press each hand-off below to send from this device.',
    });
  } catch (error) {
    console.error('[theatre-ops/check-in/chase] failed', error);
    return NextResponse.json({ error: 'Could not send that.' }, { status: 500 });
  }
}
