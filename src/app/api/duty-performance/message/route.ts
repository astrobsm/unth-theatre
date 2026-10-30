// ============================================================
// Chasing or thanking one person about one duty
// ------------------------------------------------------------
//   POST { duty, personId, from, to, kind: 'chase' | 'commend' }
//
// THE FIGURES ARE RECOMPUTED HERE, never taken from the request, for the same
// reason the late-booking chase recomputes lateness: the client says who, the
// server decides what their record actually is. A message quoting a percentage
// a browser asserted is one that can be wrong in front of a whole department.
//
// AND IT IS REFUSED WHEN UNEARNED. A commendation that will be sent to anybody
// on request is worth nothing, and a chase sent to somebody meeting the
// standard is an insult with a number attached. Both are declined with the
// real figures, so whoever pressed the button can see why.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/apiMiddleware';
import { collectDutyEvents } from '@/lib/dutyPerformance/collect';
import { buildDutyReport, MIN_EVENTS_TO_RANK, COMMENDATION_RATE, CHASE_RATE, formatRate } from '@/lib/dutyPerformance/report';
import { buildDutyChase, buildDutyCommendation } from '@/lib/dutyPerformance/messages';
import { periodLabel } from '@/lib/dutyPerformance/export';
import { DUTIES, isDutyKey } from '@/lib/dutyPerformance/types';
import { queueMessage } from '@/lib/comms/send';
import { toWhatsAppNumber } from '@/lib/comms/whatsapp';

export const dynamic = 'force-dynamic';

const ACT_ROLES = [
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
] as const;

const linkFor = (duty: string, from: string, to: string) =>
  `/dashboard/duty-performance?duty=${duty}&from=${from}&to=${to}`;

export async function POST(request: NextRequest) {
  const { error, session } = await requireRole(ACT_ROLES as never);
  if (error) return error;

  const actor = session!.user as { id?: string; name?: string | null; fullName?: string | null };
  const actorName = actor.fullName || actor.name || 'Theatre Management';

  try {
    const body = await request.json();
    const duty = String(body?.duty ?? '');
    const personId = String(body?.personId ?? '');
    const from = String(body?.from ?? '');
    const to = String(body?.to ?? '');
    const kind = body?.kind === 'commend' ? 'commend' : 'chase';

    if (!isDutyKey(duty)) return NextResponse.json({ error: 'Unknown duty' }, { status: 400 });
    if (!personId) return NextResponse.json({ error: 'Which colleague?' }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return NextResponse.json({ error: 'Which period?' }, { status: 400 });
    }

    const person = await prisma.user.findUnique({
      where: { id: personId },
      select: { id: true, fullName: true, phoneNumber: true },
    });
    if (!person) return NextResponse.json({ error: 'No such colleague' }, { status: 404 });

    const type = kind === 'commend' ? 'DUTY_COMMENDATION' : 'DUTY_CHASE';
    const link = `${linkFor(duty, from, to)}&kind=${kind}`;

    // Already sent for this duty and period? Say so rather than send twice.
    // A chase that arrives three times reads as harassment; a thank-you that
    // does reads as an automated circular.
    const already = await prisma.notification.findFirst({
      where: { userId: person.id, type, link },
      select: { id: true, createdAt: true },
    });
    if (already) {
      return NextResponse.json({
        alreadySent: true,
        message:
          `${person.fullName} was already ${kind === 'commend' ? 'thanked' : 'written to'} about `
          + `this duty for this period on ${already.createdAt.toISOString().slice(0, 10)}. `
          + `Nothing was sent again.`,
      });
    }

    // ── What their record actually is ─────────────────────────────────
    const events = await collectDutyEvents(duty, from, to);
    const report = buildDutyReport(duty, events, { from, to });

    const index = report.people.findIndex((p) => p.personId === person.id);
    const performance =
      index >= 0
        ? report.people[index]
        : report.unranked.find((p) => p.personId === person.id) ?? null;

    if (!performance) {
      return NextResponse.json(
        { error: `${person.fullName} had no ${DUTIES[duty].label.toLowerCase()} in this period.` },
        { status: 400 },
      );
    }
    if (!performance.ranked) {
      return NextResponse.json(
        {
          error:
            `${person.fullName} was responsible for only ${performance.total} in this period. `
            + `At least ${MIN_EVENTS_TO_RANK} are needed before a percentage means anything, `
            + `so neither a chase nor a commendation would be fair.`,
        },
        { status: 400 },
      );
    }

    const share = performance.total > 0
      ? (performance.done - performance.late) / performance.total
      : 0;

    if (kind === 'commend' && !performance.commendable) {
      return NextResponse.json(
        {
          error:
            `${person.fullName}'s record does not meet the threshold: `
            + `${performance.done - performance.late} of ${performance.total} on time `
            + `(${formatRate(share)}). A commendation needs ${Math.round(COMMENDATION_RATE * 100)}%.`,
        },
        { status: 400 },
      );
    }
    if (kind === 'chase' && share >= CHASE_RATE) {
      return NextResponse.json(
        {
          error:
            `${person.fullName} is at ${formatRate(share)}, which is at or above the `
            + `${Math.round(CHASE_RATE * 100)}% mark. There is nothing to chase them about — `
            + `they may be worth commending instead.`,
        },
        { status: 400 },
      );
    }

    const label = periodLabel(from, to);
    const rankLabel =
      kind === 'commend' && index === 0
        ? `That is the best record in the hospital for this duty over the period.`
        : null;

    const text =
      kind === 'commend'
        ? buildDutyCommendation({ personName: person.fullName, duty, performance, periodLabel: label, rankLabel })
        : buildDutyChase({ personName: person.fullName, duty, performance, periodLabel: label });

    const wa = person.phoneNumber ? toWhatsAppNumber(person.phoneNumber) : null;

    const queued = await queueMessage({
      channel: 'WHATSAPP' as never,
      priority: (kind === 'commend' ? 'LOW' : 'NORMAL') as never,
      recipientUserId: person.id,
      recipientName: person.fullName,
      recipientAddress: wa,
      recipientIsStaff: true,
      body: text,
      relatedType: 'USER',
      relatedId: person.id,
      trigger: type,
      scope: `${duty}:${from}:${to}`,
      createdById: actor.id ?? null,
      createdByName: actorName,
    });

    // In the app as well. A colleague with no number on file, or who has
    // opted out of WhatsApp, must still receive this — and it is also the row
    // the board reads to know it was sent, so it is written whatever the
    // external channel did.
    await prisma.notification.create({
      data: {
        userId: person.id,
        type,
        title:
          kind === 'commend'
            ? `Thank you — ${DUTIES[duty].label.toLowerCase()}, ${label}`
            : `${DUTIES[duty].label}: a request, ${label}`,
        message: text,
        link,
      },
    });

    return NextResponse.json({
      sent: true,
      kind,
      whatsappQueued: queued.queued === true,
      whatsappSkipped: wa
        ? (queued.queued ? null : (queued.reason ?? 'Not queued'))
        : `${person.fullName} has no phone number on file.`,
      whatsapp: wa ? { number: wa, text } : null,
      performance,
    });
  } catch (err) {
    console.error('[duty-performance/message] failed:', err);
    return NextResponse.json({ error: 'Could not send it' }, { status: 500 });
  }
}
