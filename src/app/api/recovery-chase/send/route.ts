// ============================================================
// Writing to one nurse about one day's recovery records
// ------------------------------------------------------------
//   POST { day, personId, preview? }
//
// THE GAPS ARE RECOMPUTED HERE, never taken from the request. The client says
// who to write to and about which day; the server decides what is actually
// outstanding. A message alleging a missing recovery record for a patient
// whose record was completed an hour ago is worse than no message at all: it
// is read once, disproved, and nothing in this series is read again. That
// matters more here than anywhere else in the application, because this
// message carries a medicolegal warning, and a warning that turns out to be
// factually wrong does lasting damage to every later one.
//
// AND IT IS REFUSED WHEN THERE IS NOTHING TO SAY, with the figures, so
// whoever pressed the button can see why.
//
// ONE DAY PER MESSAGE. A nurse's accountability is for a shift on a date, and
// a letter spanning a fortnight of other people's shifts cannot be answered.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/apiMiddleware';
import prisma from '@/lib/prisma';
import { collectRecoveryGaps, recipientOn } from '@/lib/recoveryChase/collect';
import { buildRecoveryChase, recoveryHeadline, dayWords } from '@/lib/recoveryChase/messages';
import { RECOVERY_CHASE_TYPE, recoveryChaseLink } from '@/lib/recoveryChase/notify';
import { RECOVERY_SEND_ROLES, isDayString } from '@/lib/recoveryChase/access';
import { queueMessage } from '@/lib/comms/send';
import { toWhatsAppNumber } from '@/lib/comms/whatsapp';

export const dynamic = 'force-dynamic';

/** Role in words: "Recovery Room Nurse". */
const roleWords = (role: string | null | undefined): string =>
  (role || '').split('_').filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

export async function POST(request: NextRequest) {
  const { error, session } = await requireRole(RECOVERY_SEND_ROLES as never);
  if (error) return error;

  const actor = session!.user as {
    id?: string; name?: string | null; fullName?: string | null;
  };
  const actorName = actor.fullName || actor.name || 'Theatre Management';

  try {
    const body = await request.json();
    const day = String(body?.day ?? '');
    const personId = String(body?.personId ?? '');
    const preview = body?.preview === true;

    if (!personId) return NextResponse.json({ error: 'Which colleague?' }, { status: 400 });
    if (!isDayString(day)) return NextResponse.json({ error: 'Which day?' }, { status: 400 });

    const person = await prisma.user.findUnique({
      where: { id: personId },
      select: { id: true, fullName: true, role: true, phoneNumber: true, status: true },
    });
    if (!person) return NextResponse.json({ error: 'No such colleague' }, { status: 404 });

    const link = recoveryChaseLink(day, person.id);

    // Already written to about this day? Say so rather than send twice. A
    // chase that arrives three times reads as harassment, and the nurse who
    // acted on the first two has every reason to ignore the third.
    if (!preview) {
      const already = await prisma.notification.findFirst({
        where: { userId: person.id, type: RECOVERY_CHASE_TYPE, link },
        select: { createdAt: true },
      });
      if (already) {
        return NextResponse.json({
          alreadySent: true,
          message:
            `${person.fullName} was already written to about ${dayWords(day)} on `
            + `${already.createdAt.toISOString().slice(0, 10)}. Nothing was sent again.`,
        });
      }
    }

    // ── What is actually outstanding, now ────────────────────────────
    const days = await collectRecoveryGaps(day, day);
    const bucket = days.find((d) => d.day === day) ?? null;
    const recipient = bucket ? recipientOn(bucket, person.id) : null;

    if (!bucket || !recipient || recipient.caseIds.length === 0) {
      return NextResponse.json({
        error:
          `${person.fullName} has nothing outstanding for ${dayWords(day)}. `
          + (bucket && bucket.cases.length > 0
            ? 'There are gaps on that day, but none of them fall on this person’s shift — '
              + 'write to whoever covered the hour instead.'
            : 'Every completed case that day has a recovery record, and every record was '
              + 'closed. There is nothing to ask about.'),
      }, { status: 400 });
    }

    const mine = bucket.cases.filter((c) => recipient.caseIds.indexOf(c.id) !== -1);

    const text = buildRecoveryChase({
      personName: person.fullName,
      roleLabel: roleWords(person.role ? String(person.role) : null),
      source: recipient.source,
      shift: recipient.shift,
      day,
      completedCount: bucket.completedCount,
      cases: mine,
    });

    if (preview) {
      return NextResponse.json({
        preview: true,
        text,
        headline: recoveryHeadline(mine),
        caseCount: mine.length,
        source: recipient.source,
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
      // Filed against the person and the day, not against one case: this is
      // one message about several, and filing it under one would make the
      // rest untraceable.
      relatedType: 'USER',
      relatedId: person.id,
      trigger: RECOVERY_CHASE_TYPE,
      scope: `${day}:${recipient.source}`,
      createdById: actor.id ?? null,
      createdByName: actorName,
    });

    await prisma.notification.create({
      data: {
        userId: person.id,
        type: RECOVERY_CHASE_TYPE,
        title: `Recovery records outstanding — ${dayWords(day)}`,
        message: text,
        link,
      },
    });

    // Audited, because this message carries a medicolegal warning. Who sent
    // it, to whom, about which day and on what evidence has to be answerable
    // later — including to the nurse who received it.
    if (actor.id) {
      await prisma.auditLog.create({
        data: {
          userId: actor.id,
          action: 'RECOVERY_RECORD_CHASE_SENT',
          tableName: 'pacu_assessments',
          recordId: person.id,
          changes: JSON.stringify({
            day,
            recipient: person.fullName,
            accountability: recipient.source,
            shift: recipient.shift,
            caseIds: mine.map((c) => c.id),
            counts: bucket.counts,
          }),
        },
      }).catch(() => { /* the message stands even if the log does not */ });
    }

    return NextResponse.json({
      sent: true,
      personName: person.fullName,
      headline: recoveryHeadline(mine),
      whatsappQueued: queued.queued === true,
      whatsappSkipped: wa
        ? (queued.queued ? null : (queued.reason ?? 'Not queued'))
        : `${person.fullName} has no phone number on file — sent in the app only.`,
      message: `Sent to ${person.fullName}.`,
    });
  } catch (err) {
    console.error('[recovery-chase/send] failed:', err);
    return NextResponse.json({ error: 'Could not send it' }, { status: 500 });
  }
}
