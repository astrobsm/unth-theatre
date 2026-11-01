// ============================================================
// Writing to one surgeon, or one unit consultant
// ------------------------------------------------------------
//   POST { kind: 'surgeon' | 'consultant', personId, from, to, preview? }
//
// THE CASES ARE RECOMPUTED HERE, never taken from the request. The client says
// who to write to; the server decides what is actually outstanding. A message
// listing a missing consent that was uploaded an hour ago is worse than no
// message at all — it is read once, disproved, and every later one is ignored.
//
// AND IT IS REFUSED WHEN THERE IS NOTHING TO SAY. A chase sent to a surgeon
// whose cases are all in order is an insult with a list attached, and the
// refusal says so with the figures, so whoever pressed the button can see why.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/apiMiddleware';
import prisma from '@/lib/prisma';
import { collectCasesWithGaps, groupBy, type ChaseCase } from '@/lib/caseChase/collect';
import {
  buildSurgeonCaseChase, buildConsultantCaseChase, chaseHeadline, roleWords,
} from '@/lib/caseChase/messages';
import { chaseLink, chaseType, type ChaseKind } from '@/lib/caseChase/notify';
import { periodLabel } from '@/lib/dutyPerformance/export';
import { queueMessage } from '@/lib/comms/send';
import { toWhatsAppNumber } from '@/lib/comms/whatsapp';

export const dynamic = 'force-dynamic';

const ACT_ROLES = [
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
  'CHIEF_MEDICAL_DIRECTOR',
  'CMAC',
  'DC_MAC',
  'HEAD_OF_SURGERY',
  'HEAD_OF_OBSTETRICS_GYNAECOLOGY',
  'HEAD_OF_ANAESTHESIA',
] as const;

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Cases grouped by whoever actually entered the booking. */
function byBooker(cases: readonly ChaseCase[]): { name: string; cases: ChaseCase[] }[] {
  const byName: Record<string, ChaseCase[]> = {};
  const order: string[] = [];
  cases.forEach((c) => {
    // Where the booker was never recorded, say so rather than file it under
    // the consultant: the consultant reading this needs to know that one of
    // these cases cannot be traced to anybody, which is its own problem.
    const name = c.bookedByName || 'Booker not recorded';
    if (!byName[name]) { byName[name] = []; order.push(name); }
    byName[name].push(c);
  });
  return order
    .map((name) => ({ name, cases: byName[name] }))
    .sort((a, b) => b.cases.length - a.cases.length);
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireRole(ACT_ROLES as never);
  if (error) return error;

  const actor = session!.user as { id?: string; name?: string | null; fullName?: string | null };
  const actorName = actor.fullName || actor.name || 'Theatre Management';

  try {
    const body = await request.json();
    const kind: ChaseKind = body?.kind === 'consultant' ? 'consultant' : 'surgeon';
    const personId = String(body?.personId ?? '');
    const from = String(body?.from ?? '');
    const to = String(body?.to ?? '');
    const preview = body?.preview === true;

    if (!personId) return NextResponse.json({ error: 'Which colleague?' }, { status: 400 });
    if (!isDay(from) || !isDay(to)) {
      return NextResponse.json({ error: 'Which dates?' }, { status: 400 });
    }

    const person = await prisma.user.findUnique({
      where: { id: personId },
      select: { id: true, fullName: true, role: true, phoneNumber: true, status: true },
    });
    if (!person) return NextResponse.json({ error: 'No such colleague' }, { status: 404 });

    const type = chaseType(kind);
    const link = chaseLink(kind, from, to);

    // Already written to about this window? Say so rather than send twice. A
    // chase that arrives three times reads as harassment, and the surgeon who
    // fixed the first two has every reason to ignore the third.
    if (!preview) {
      const already = await prisma.notification.findFirst({
        where: { userId: person.id, type, link },
        select: { createdAt: true },
      });
      if (already) {
        return NextResponse.json({
          alreadySent: true,
          message:
            `${person.fullName} was already written to about these cases on `
            + `${already.createdAt.toISOString().slice(0, 10)}. Nothing was sent again. `
            + 'Change the dates to write about a different period.',
        });
      }
    }

    // ── What is actually outstanding, now ────────────────────────────
    const cases = await collectCasesWithGaps(from, to);
    const groups = kind === 'surgeon'
      ? groupBy(cases, (c) => ({ id: c.surgeonId, name: c.surgeonName }))
      : groupBy(cases, (c) => ({ id: c.consultantId, name: c.consultantName }));

    const group = groups.find((g) => g.personId === person.id) ?? null;

    if (!group) {
      return NextResponse.json(
        {
          error:
            kind === 'surgeon'
              ? `${person.fullName} has no booked case with anything outstanding in this `
                + 'period. There is nothing to ask them about.'
              : `${person.fullName} is not recorded as the supervising consultant on any `
                + 'case with something outstanding in this period.',
        },
        { status: 400 },
      );
    }

    const label = periodLabel(from, to);
    const roleLabel = roleWords(person.role ? String(person.role) : null);
    // A consultant surgeon reading the surgeon letter should be asked the
    // consultant's question about their residents, not the junior's.
    const isConsultant = /CONSULTANT|HEAD_OF/.test(String(person.role ?? ''));

    const text = kind === 'surgeon'
      ? buildSurgeonCaseChase({
        personName: person.fullName,
        roleLabel,
        periodLabel: label,
        group,
        isConsultant,
      })
      : buildConsultantCaseChase({
        personName: person.fullName,
        unitLabel: group.units.length ? group.units.join(', ') : 'your unit',
        periodLabel: label,
        group,
        byBooker: byBooker(group.cases),
      });

    if (preview) {
      return NextResponse.json({
        preview: true,
        text,
        headline: chaseHeadline(group),
        caseCount: group.cases.length,
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
      // Identified by the person and the window, not by a case: this is one
      // message about several cases, and filing it against one of them would
      // make the other gaps untraceable.
      relatedType: 'USER',
      relatedId: person.id,
      trigger: type,
      scope: `${kind}:${from}:${to}`,
      createdById: actor.id ?? null,
      createdByName: actorName,
    });

    await prisma.notification.create({
      data: {
        userId: person.id,
        type,
        title: kind === 'surgeon'
          ? `Your booked cases, ${label}`
          : `${group.units.length ? group.units.join(', ') : 'Your unit'}: cases awaiting paperwork`,
        message: text,
        link,
      },
    });

    return NextResponse.json({
      sent: true,
      kind,
      personName: person.fullName,
      headline: chaseHeadline(group),
      whatsappQueued: queued.queued === true,
      whatsappSkipped: wa
        ? (queued.queued ? null : (queued.reason ?? 'Not queued'))
        : `${person.fullName} has no phone number on file — sent in the app only.`,
      message: `Sent to ${person.fullName}.`,
    });
  } catch (err) {
    console.error('[case-chase/send] failed:', err);
    return NextResponse.json({ error: 'Could not send it' }, { status: 500 });
  }
}
