// ============================================================
// Writing to one anaesthetic technician about their theatre-days
// ------------------------------------------------------------
//   POST { personId, from, to, preview? }
//
// THE THEATRE-DAYS ARE RECOMPUTED HERE, never taken from the request. The
// client says who to write to; the server decides what is outstanding. A
// message listing a morning setup that was logged late and has since been
// corrected is read once, disproved, and teaches the reader to ignore the
// next one.
//
// AND IT IS REFUSED WHEN THERE IS NOTHING TO SAY. A technician whose theatres
// were all set up on time and closed down on time receiving a chase about
// them is the fastest way to lose a board like this one, and the refusal says
// so with the figures.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/apiMiddleware';
import prisma from '@/lib/prisma';
import { collectSetupGaps, groupByTechnician } from '@/lib/setupChase/collect';
import { buildTechnicianSetupChase, setupHeadline } from '@/lib/setupChase/messages';
import { SETUP_CHASE_TYPE, setupChaseLink } from '@/lib/setupChase/notify';
import { SETUP_SEND_ROLES } from '@/lib/setupChase/access';
import { isDayString } from '@/lib/recoveryChase/access';
import { periodLabel } from '@/lib/dutyPerformance/export';
import { queueMessage } from '@/lib/comms/send';
import { toWhatsAppNumber } from '@/lib/comms/whatsapp';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { error, session } = await requireRole(SETUP_SEND_ROLES as never);
  if (error) return error;

  const actor = session!.user as {
    id?: string; name?: string | null; fullName?: string | null;
  };
  const actorName = actor.fullName || actor.name || 'Theatre Management';

  try {
    const body = await request.json();
    const personId = String(body?.personId ?? '');
    const from = String(body?.from ?? '');
    const to = String(body?.to ?? '');
    const preview = body?.preview === true;

    if (!personId) return NextResponse.json({ error: 'Which colleague?' }, { status: 400 });
    if (!isDayString(from) || !isDayString(to)) {
      return NextResponse.json({ error: 'Which dates?' }, { status: 400 });
    }

    const person = await prisma.user.findUnique({
      where: { id: personId },
      select: { id: true, fullName: true, role: true, phoneNumber: true, status: true },
    });
    if (!person) return NextResponse.json({ error: 'No such colleague' }, { status: 404 });

    const link = setupChaseLink(from, to, person.id);
    const label = periodLabel(from, to);

    if (!preview) {
      const already = await prisma.notification.findFirst({
        where: { userId: person.id, type: SETUP_CHASE_TYPE, link },
        select: { createdAt: true },
      });
      if (already) {
        return NextResponse.json({
          alreadySent: true,
          message:
            `${person.fullName} was already written to about ${label} on `
            + `${already.createdAt.toISOString().slice(0, 10)}. Nothing was sent again. `
            + 'Change the dates to write about a different period.',
        });
      }
    }

    const { theatreDays, electiveTheatreDays } = await collectSetupGaps(from, to);
    const group = groupByTechnician(theatreDays)
      .find((g) => g.personId === person.id) ?? null;

    if (!group) {
      return NextResponse.json({
        error:
          `${person.fullName} has nothing outstanding in this period. Of the `
          + `${electiveTheatreDays} elective theatre-days in it, none with anything missing `
          + 'is theirs. There is nothing to ask them about.',
      }, { status: 400 });
    }

    const text = buildTechnicianSetupChase({
      personName: person.fullName,
      periodLabel: label,
      group,
    });

    if (preview) {
      return NextResponse.json({
        preview: true,
        text,
        headline: setupHeadline(group),
        dayCount: group.theatreDays.length,
        counts: group.counts,
      });
    }

    if (person.status !== 'APPROVED') {
      return NextResponse.json(
        { error: `${person.fullName}'s account is not active, so nothing was sent.` },
        { status: 400 },
      );
    }

    const wa = person.phoneNumber ? toWhatsAppNumber(person.phoneNumber) : null;

    const queued = await queueMessage({
      channel: 'WHATSAPP' as never,
      priority: 'NORMAL' as never,
      recipientUserId: person.id,
      recipientName: person.fullName,
      recipientAddress: wa,
      recipientIsStaff: true,
      body: text,
      relatedType: 'USER',
      relatedId: person.id,
      trigger: SETUP_CHASE_TYPE,
      scope: `${from}:${to}`,
      createdById: actor.id ?? null,
      createdByName: actorName,
    });

    await prisma.notification.create({
      data: {
        userId: person.id,
        type: SETUP_CHASE_TYPE,
        title: `Theatre setup and equipment checks — ${label}`,
        message: text,
        link,
      },
    });

    // Audited for the same reason the recovery chase is: this goes on a
    // technician's record, and who sent it on what evidence must be
    // answerable afterwards, including to them.
    if (actor.id) {
      await prisma.auditLog.create({
        data: {
          userId: actor.id,
          action: 'THEATRE_SETUP_CHASE_SENT',
          tableName: 'anesthesia_setup_logs',
          recordId: person.id,
          changes: JSON.stringify({
            from,
            to,
            recipient: person.fullName,
            counts: group.counts,
            theatreDays: group.theatreDays.map((td) => ({
              day: td.day, theatre: td.theatreName, gaps: td.gaps,
            })),
          }),
        },
      }).catch(() => { /* the message stands even if the log does not */ });
    }

    return NextResponse.json({
      sent: true,
      personName: person.fullName,
      headline: setupHeadline(group),
      whatsappQueued: queued.queued === true,
      whatsappSkipped: wa
        ? (queued.queued ? null : (queued.reason ?? 'Not queued'))
        : `${person.fullName} has no phone number on file — sent in the app only.`,
      message: `Sent to ${person.fullName}.`,
    });
  } catch (err) {
    console.error('[setup-chase/send] failed:', err);
    return NextResponse.json({ error: 'Could not send it' }, { status: 500 });
  }
}
