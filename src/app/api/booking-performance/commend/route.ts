// ============================================================
// Sending one letter of appreciation
// ------------------------------------------------------------
//   POST { personId, from, to } — thank somebody whose booking record for
//   that window earns it, by WhatsApp and in the app.
//
// THE FIGURES ARE RECOMPUTED HERE, never taken from the request, for the same
// reason the chase recomputes lateness: the client says who, the server
// decides whether the record supports it. A commendation quoting a percentage
// a browser asserted is a commendation that could be wrong in front of a
// whole department.
//
// AND IT IS REFUSED WHEN UNEARNED. A board that will thank anybody on request
// produces commendations nobody values. If the record does not meet the
// threshold the request is declined with the actual figures, so whoever
// pressed the button can see why.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/apiMiddleware';
import { fetchCasesInWindow } from '@/lib/lateBooking/caseWindow';
import {
  buildPunctualityReport,
  buildCommendationMessage,
  formatNotice,
  COMMENDATION_RATE,
  MIN_CASES_TO_RANK,
} from '@/lib/lateBooking/punctuality';
import { commendationLink } from '@/lib/lateBooking/commendationLink';
import { queueMessage } from '@/lib/comms/send';
import { toWhatsAppNumber } from '@/lib/comms/whatsapp';

export const dynamic = 'force-dynamic';

const ACT_ROLES = [
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
] as const;

/** "1 October to 31 October 2026", for a sentence rather than a filter. */
function periodLabel(from: string, to: string): string {
  const fmt = (iso: string, withYear: boolean) => {
    const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const month = months[(m || 1) - 1] ?? '';
    return withYear ? `${d} ${month} ${y}` : `${d} ${month}`;
  };
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${fmt(from, !sameYear)} to ${fmt(to, true)}`;
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireRole(ACT_ROLES as never);
  if (error) return error;

  const actor = session!.user as { id?: string; name?: string | null; fullName?: string | null };
  const actorName = actor.fullName || actor.name || 'Theatre Management';

  try {
    const body = await request.json();
    const personId = String(body?.personId ?? '');
    const from = String(body?.from ?? '');
    const to = String(body?.to ?? '');

    if (!personId) {
      return NextResponse.json({ error: 'Which colleague?' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return NextResponse.json({ error: 'Which period?' }, { status: 400 });
    }

    const person = await prisma.user.findUnique({
      where: { id: personId },
      select: { id: true, fullName: true, phoneNumber: true },
    });
    if (!person) return NextResponse.json({ error: 'No such colleague' }, { status: 404 });

    const link = commendationLink(from, to);

    // Already thanked for this window? Say so rather than sending again.
    const already = await prisma.notification.findFirst({
      where: { userId: person.id, type: 'BOOKING_COMMENDATION', link },
      select: { id: true, createdAt: true },
    });
    if (already) {
      return NextResponse.json({
        alreadySent: true,
        message: `${person.fullName} was already thanked for this period on ${already.createdAt.toISOString().slice(0, 10)}. Nothing was sent again.`,
      });
    }

    // ── Does the record earn it? ──────────────────────────────────────
    const rows = await fetchCasesInWindow(from, to);
    const report = buildPunctualityReport(rows, { from, to });

    const index = report.bookers.findIndex((b) => b.personId === person.id);
    const performance =
      index >= 0
        ? report.bookers[index]
        : report.unranked.find((b) => b.personId === person.id) ?? null;

    if (!performance) {
      return NextResponse.json(
        { error: `${person.fullName} booked no elective cases in this period.` },
        { status: 400 },
      );
    }
    if (!performance.commendable) {
      const pct =
        performance.complianceRate == null
          ? '—'
          : `${Math.round(performance.complianceRate * 100)}%`;
      return NextResponse.json(
        {
          error:
            `${person.fullName}'s record for this period does not meet the threshold: ` +
            `${performance.onTime} of ${performance.electiveTotal} on time (${pct}). ` +
            `A commendation needs at least ${MIN_CASES_TO_RANK} elective cases and ` +
            `${Math.round(COMMENDATION_RATE * 100)}% booked before the deadline.`,
        },
        { status: 400 },
      );
    }

    // ── The letter ────────────────────────────────────────────────────
    // The rank is only quoted when they are at the very top, and only among
    // those with enough cases to be ranked. "You are 14th" is not a
    // commendation, and "best in the hospital" said to four people at once
    // is not true.
    const rankLabel =
      index === 0
        ? 'This is the best elective booking record in the hospital for the period.'
        : index > 0 && index < 3
          ? `That places you among the three best booking records in the hospital for the period.`
          : null;

    const label = periodLabel(from, to);
    const text = buildCommendationMessage({
      personName: person.fullName,
      performance,
      periodLabel: label,
      rankLabel,
    });

    const queued = await queueMessage({
      channel: 'WHATSAPP' as never,
      priority: 'LOW' as never,
      recipientUserId: person.id,
      recipientName: person.fullName,
      // Resolved here: the send policy refuses an external channel with no
      // address, and a thank-you that silently goes nowhere is worse than
      // none at all, because the board would show it as sent.
      recipientAddress: person.phoneNumber ? toWhatsAppNumber(person.phoneNumber) : null,
      recipientIsStaff: true,
      body: text,
      relatedType: 'USER',
      relatedId: person.id,
      trigger: 'BOOKING_COMMENDATION',
      scope: `${from}:${to}`,
      createdById: actor.id ?? null,
      createdByName: actorName,
    });

    // In the app as well as on WhatsApp. A colleague with no number on file,
    // or who has opted out of WhatsApp, should still be told they were
    // noticed — and this is also the row the board reads to know it has been
    // sent, so it is written whatever the external channel did.
    await prisma.notification.create({
      data: {
        userId: person.id,
        type: 'BOOKING_COMMENDATION',
        title: `Thank you — your elective bookings for ${label}`,
        message: text,
        link,
      },
    });

    return NextResponse.json({
      sent: true,
      whatsappQueued: queued.queued === true,
      whatsappSkipped: queued.queued ? null : (queued.reason ?? 'Not queued'),
      performance: {
        onTime: performance.onTime,
        electiveTotal: performance.electiveTotal,
        complianceRate: performance.complianceRate,
        notice: formatNotice(performance.medianNoticeHours),
      },
    });
  } catch (err) {
    console.error('[booking-performance/commend] failed:', err);
    return NextResponse.json({ error: 'Could not send it' }, { status: 500 });
  }
}
