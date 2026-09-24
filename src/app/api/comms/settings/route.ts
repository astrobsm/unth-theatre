// ============================================================
// GET/PATCH /api/comms/settings — is messaging on, and what has it done?
// ------------------------------------------------------------
// One call behind the setup screen. It answers the three questions an
// administrator actually has — can it send, is it switched on, and what has it
// been doing — rather than making the screen assemble that from four requests.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/apiError';
import { dispatchMode } from '@/lib/comms/dispatch';
import { whatsappConfig } from '@/lib/comms/whatsapp';

export const dynamic = 'force-dynamic';

const MAY_MANAGE = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];

async function gate() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { error: 'Unauthorized', status: 401 as const };
  if (!MAY_MANAGE.includes((session.user.role ?? '').toUpperCase())) {
    return { error: 'Only an administrator may manage messaging.', status: 403 as const };
  }
  return { session };
}

export async function GET() {
  const g = await gate();
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });

  try {
    const [mode, row, counts, recent, optedOut, noPhone] = await Promise.all([
      dispatchMode(),
      prisma.communicationSetting.findUnique({ where: { id: 'singleton' } }),
      prisma.communicationMessage.groupBy({
        by: ['status'], where: { channel: 'WHATSAPP' }, _count: { _all: true },
      }),
      prisma.communicationMessage.findMany({
        where: { channel: 'WHATSAPP' },
        orderBy: { queuedAt: 'desc' },
        take: 20,
        select: {
          id: true, status: true, recipientName: true, templateCode: true,
          queuedAt: true, sentAt: true, failureReason: true, escalationLevel: true,
        },
      }),
      prisma.user.count({ where: { whatsappOptOut: true } }),
      // The quiet reason a reminder never arrives. Counted so it is a number on
      // a screen rather than a mystery.
      prisma.user.count({
        where: { status: 'APPROVED', OR: [{ phoneNumber: null }, { phoneNumber: '' }] },
      }),
    ]);

    const byStatus: Record<string, number> = {};
    for (const c of counts) byStatus[c.status] = c._count._all;

    return NextResponse.json({
      mode,
      // Never the token itself. Whether one is present is the useful fact; the
      // value is a credential and has no business being rendered.
      credentials: {
        configured: Boolean(whatsappConfig()),
        phoneNumberIdSet: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
        accessTokenSet: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
      },
      settings: row ?? { id: 'singleton', allDisabled: false, disabledChannels: null, dryRun: false },
      envOverride: process.env.COMMUNICATION_DISABLED === 'true',
      counts: byStatus,
      staff: { optedOut, withoutPhone: noPhone },
      recent,
    });
  } catch (error) {
    return apiError('comms/settings GET', error);
  }
}

export async function PATCH(request: NextRequest) {
  const g = await gate();
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });

  try {
    const body = await request.json().catch(() => ({}));
    const data: Record<string, unknown> = {
      updatedById: g.session.user.id,
      updatedByName: g.session.user.name ?? null,
    };

    if (typeof body.allDisabled === 'boolean') data.allDisabled = body.allDisabled;
    if (typeof body.dryRun === 'boolean') data.dryRun = body.dryRun;
    if (typeof body.note === 'string') data.note = body.note.slice(0, 500);

    const row = await prisma.communicationSetting.upsert({
      where: { id: 'singleton' },
      update: data,
      create: { id: 'singleton', ...data },
    });

    // Worth an audit entry: switching the hospital's automated messaging on or
    // off is a decision somebody should be able to trace to a person.
    await prisma.auditLog.create({
      data: {
        userId: g.session.user.id,
        action: 'COMMUNICATION_SETTINGS_CHANGED',
        tableName: 'communication_settings',
        recordId: 'singleton',
        changes: JSON.stringify(data),
      },
    }).catch(() => { /* the setting stands even if the log does not */ });

    return NextResponse.json({ settings: row, mode: await dispatchMode() });
  } catch (error) {
    return apiError('comms/settings PATCH', error);
  }
}
