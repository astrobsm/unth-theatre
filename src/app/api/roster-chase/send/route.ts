// ============================================================
// Writing to a head of department about their roster
// ------------------------------------------------------------
//   POST { month, dept, personId?, note?, preview? }
//
// THE STANDING IS RECOMPUTED HERE. The client says which department; the
// server decides whether anything is actually late. A letter telling a head of
// department their roster is missing, sent an hour after they published it, is
// the one that ends the usefulness of every later message.
//
// AND AN ON-TIME ROSTER CANNOT BE CHASED. The board does not offer the button,
// and the route refuses it anyway: there is no wording of "you were late" that
// is acceptable to somebody who was not.
//
// personId is optional. Left out, it writes to everybody the department's
// roster is owned by — usually one person, occasionally two who share it.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/apiMiddleware';
import prisma from '@/lib/prisma';
import { collectRosterStandings } from '@/lib/rosterChase/collect';
import { buildRosterChase, rosterHeadline } from '@/lib/rosterChase/messages';
import { STATE_LABELS, watToday, worthChasing } from '@/lib/rosterChase/overdue';
import { ROSTER_CHASE_TYPE, rosterChaseLink } from '@/lib/rosterChase/notify';
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
] as const;

const roleWords = (role: string | null | undefined) => (role || '')
  .split('_').filter(Boolean)
  .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
  .join(' ');

export async function POST(request: NextRequest) {
  const { error, session } = await requireRole(ACT_ROLES as never);
  if (error) return error;

  const actor = session!.user as { id?: string; name?: string | null; fullName?: string | null };
  const actorName = actor.fullName || actor.name || 'Theatre Management';

  try {
    const body = await request.json();
    const month = String(body?.month ?? '');
    const slug = String(body?.dept ?? '');
    const personId = body?.personId ? String(body.personId) : null;
    const note = typeof body?.note === 'string' ? body.note.slice(0, 600) : null;
    const preview = body?.preview === true;

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Which month?' }, { status: 400 });
    }
    if (!slug) return NextResponse.json({ error: 'Which department?' }, { status: 400 });

    const standings = await collectRosterStandings(month, watToday());
    if (!standings) return NextResponse.json({ error: 'Which month?' }, { status: 400 });

    const dept = standings.departments.find((d) => d.slug === slug);
    if (!dept) return NextResponse.json({ error: 'No such department.' }, { status: 404 });

    if (!worthChasing(dept.assessment)) {
      return NextResponse.json(
        {
          error: dept.assessment.notYetDue
            ? `${dept.label}'s roster for ${standings.period.label} is not due until `
              + `${dept.assessment.dueDay}. There is nothing to chase yet.`
            : `${dept.label}'s roster for ${standings.period.label} was in on time `
              + `(${STATE_LABELS[dept.assessment.state].toLowerCase()}). There is nothing `
              + 'to ask them about.',
        },
        { status: 400 },
      );
    }

    const chosen = personId
      ? dept.recipients.filter((r) => r.id === personId)
      : dept.recipients;

    if (chosen.length === 0) {
      return NextResponse.json(
        {
          error: dept.nobodyToWriteTo
? `${dept.label} has no roster supervisor assigned`
              + (dept.candidateCount > 0
                ? ` and ${dept.candidateCount} colleagues who could manage it, which is not `
                  + 'a recipient list — a letter to all of them is one each of them assumes '
                  + 'was meant for somebody else.'
                : ' and nobody holding a role that can manage it, so there is nobody to '
                  + 'write to.')
              + ' Assign a supervisor on Roster → Supervisors first: a roster with no owner '
              + 'is the thing to fix here, not a late one.'
            : 'That colleague does not own this department’s roster.',
        },
        { status: 400 },
      );
    }

    const link = rosterChaseLink(month, slug);

    if (preview) {
      const one = chosen[0];
      return NextResponse.json({
        preview: true,
        headline: rosterHeadline({
          deptLabel: dept.label, period: standings.period, assessment: dept.assessment,
        }),
        recipients: chosen.map((r) => r.fullName),
        text: buildRosterChase({
          personName: one.fullName,
          roleLabel: roleWords(one.role),
          deptLabel: dept.label,
          period: standings.period,
          assessment: dept.assessment,
          priorLateMonths: dept.priorLateMonths,
          note,
        }),
      });
    }

    const sentTo: string[] = [];
    const skipped: { name: string; reason: string }[] = [];
    let whatsappQueued = 0;

    for (let i = 0; i < chosen.length; i += 1) {
      const r = chosen[i];

      if (!r.active) {
        skipped.push({ name: r.fullName, reason: 'account not active' });
        continue;
      }

      // Already written to about this department and month? Not again.
      const already = await prisma.notification.findFirst({
        where: { userId: r.id, type: ROSTER_CHASE_TYPE, link },
        select: { createdAt: true },
      });
      if (already) {
        skipped.push({
          name: r.fullName,
          reason: `already written to on ${already.createdAt.toISOString().slice(0, 10)}`,
        });
        continue;
      }

      const text = buildRosterChase({
        personName: r.fullName,
        roleLabel: roleWords(r.role),
        deptLabel: dept.label,
        period: standings.period,
        assessment: dept.assessment,
        priorLateMonths: dept.priorLateMonths,
        note,
      });

      const wa = r.hasPhone
        ? await prisma.user.findUnique({ where: { id: r.id }, select: { phoneNumber: true } })
          .then((u) => (u?.phoneNumber ? toWhatsAppNumber(u.phoneNumber) : null))
          .catch(() => null)
        : null;

      const queued = await queueMessage({
        channel: 'WHATSAPP' as never,
        priority: 'NORMAL' as never,
        recipientUserId: r.id,
        recipientName: r.fullName,
        recipientAddress: wa,
        recipientIsStaff: true,
        body: text,
        relatedType: 'ROSTER',
        relatedId: `${slug}:${month}`,
        trigger: ROSTER_CHASE_TYPE,
        scope: `${slug}:${month}`,
        createdById: actor.id ?? null,
        createdByName: actorName,
      });
      if (queued.queued) whatsappQueued += 1;

      await prisma.notification.create({
        data: {
          userId: r.id,
          type: ROSTER_CHASE_TYPE,
          title: `${dept.label} roster — ${standings.period.label}`,
          message: text,
          link,
        },
      });

      sentTo.push(r.fullName);
      if (!wa) {
        skipped.push({ name: r.fullName, reason: 'no phone number on file — sent in the app only' });
      }
    }

    return NextResponse.json({
      sent: sentTo.length > 0,
      sentTo,
      skipped,
      whatsappQueued,
      headline: rosterHeadline({
        deptLabel: dept.label, period: standings.period, assessment: dept.assessment,
      }),
      message: sentTo.length
        ? `Sent to ${sentTo.join(', ')}.`
        : 'Nothing was sent — everybody who owns this roster had already been written to.',
    });
  } catch (err) {
    console.error('[roster-chase/send] failed:', err);
    return NextResponse.json({ error: 'Could not send it' }, { status: 500 });
  }
}
