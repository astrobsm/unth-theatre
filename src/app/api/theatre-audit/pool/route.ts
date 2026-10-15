// ============================================================
// The week's pool, and convening the sitting that reviews it
// ------------------------------------------------------------
// GET shows the chairman what a week contains and exactly who would be
// called, WITHOUT calling anybody. That preview is the point: convening is
// not reversible in any way that matters — a summons sent to forty people
// cannot be unsent — so the chairman sees the room before filling it.
//
// POST creates the sitting and raises the summonses. Reusing
// TheatreAuditConference rather than a second meeting model, but NOT filing
// cancellations as conference_issues: that model means "a proposed structural
// adjustment", and a cancelled hernia is not one. The cancellations hang off
// the sitting as summonses, and any structural point the committee wants to
// raise about them is a separate issue they add themselves.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { canRecord } from '@/lib/audit/conferenceGuard';
import {
  auditWeekOf, previousAuditWeek, targetsForCase, serviceRoleFor,
} from '@/lib/audit/cancellationPool';

export const dynamic = 'force-dynamic';

/** The week asked for, or the one that has just finished. */
function weekFrom(param: string | null) {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
    return auditWeekOf(new Date(`${param}T12:00:00.000Z`));
  }
  return previousAuditWeek(new Date());
}

/**
 * GET /api/theatre-audit/pool?week=YYYY-MM-DD
 *
 * The cancellations and review lapses in that week, and who would be called.
 * Reads only.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const week = weekFrom(searchParams.get('week'));

  try {
    const cancellations = await prisma.caseCancellation.findMany({
      where: { cancelledAt: { gte: week.from, lt: week.to } },
      orderBy: { cancelledAt: 'asc' },
      select: {
        id: true, reason: true, category: true, detailedNotes: true,
        cancelledAt: true, cancelledBy: true,
        user: { select: { id: true, fullName: true } },
        surgery: {
          select: {
            id: true, procedureName: true, scheduledDate: true, unit: true,
            subspecialty: true, surgeonId: true, anesthetistId: true, bookedById: true,
            patient: { select: { name: true, folderNumber: true } },
            surgeon: { select: { id: true, fullName: true } },
            anesthetist: { select: { id: true, fullName: true } },
          },
        },
      },
    });

    // Review lapses in the same week, so one sitting covers both findings.
    const lapses = await prisma.preopReviewAssignment.findMany({
      where: { lapsedAt: { gte: week.from, lt: week.to } },
      orderBy: { surgeryDate: 'asc' },
      select: {
        id: true, surgeryId: true, surgeryDate: true, lapsedAt: true,
        lapseGround: true, expectedReviewerName: true, assignmentSource: true,
        surgery: {
          select: {
            procedureName: true,
            patient: { select: { name: true, folderNumber: true } },
          },
        },
      },
    });

    // Who WOULD be called, without calling them. Counted by person so the
    // chairman sees the size of the room, not a list of rows.
    const perPerson = new Map<string, { name: string; matters: number }>();
    const names = new Map<string, string>();
    for (const c of cancellations) {
      if (c.surgery?.surgeon) names.set(c.surgery.surgeon.id, c.surgery.surgeon.fullName);
      if (c.surgery?.anesthetist) names.set(c.surgery.anesthetist.id, c.surgery.anesthetist.fullName);
      if (c.user) names.set(c.user.id, c.user.fullName);

      for (const t of targetsForCase({
        surgeryId: c.surgery?.id ?? '',
        category: c.category,
        surgeonId: c.surgery?.surgeonId,
        anaesthetistId: c.surgery?.anesthetistId,
        bookedById: c.surgery?.bookedById,
        cancelledById: c.cancelledBy,
      })) {
        const cur = perPerson.get(t.userId);
        if (cur) cur.matters += 1;
        else perPerson.set(t.userId, { name: names.get(t.userId) ?? 'Unnamed', matters: 1 });
      }
    }

    // Fill in any names the includes above did not reach (bookers, mostly).
    const missing = Array.from(perPerson.entries())
      .filter(([, v]) => v.name === 'Unnamed').map(([k]) => k);
    if (missing.length) {
      const users = await prisma.user.findMany({
        where: { id: { in: missing } }, select: { id: true, fullName: true },
      });
      for (const u of users) {
        const e = perPerson.get(u.id);
        if (e) e.name = u.fullName;
      }
    }

    const services = Array.from(
      new Set(cancellations.map((c) => serviceRoleFor(c.category)).filter(Boolean)),
    ) as string[];

    // Has this week already been convened?
    const existing = await prisma.theatreAuditConference.findFirst({
      where: { periodStart: new Date(`${week.start}T00:00:00.000Z`) },
      select: { id: true, title: true, sittingDate: true, status: true, mode: true },
    });

    return NextResponse.json({
      week: { start: week.start, end: week.end, label: week.label },
      cancellations,
      lapses,
      wouldSummon: Array.from(perPerson.entries())
        .map(([userId, v]) => ({ userId, ...v }))
        .sort((a, b) => b.matters - a.matters),
      serviceRoles: services,
      alreadyConvened: existing,
      canConvene: canRecord(session.user.role),
    });
  } catch (error) {
    console.error('audit pool failed:', error);
    return NextResponse.json({ error: 'Could not read the pool' }, { status: 500 });
  }
}

/**
 * POST /api/theatre-audit/pool
 *
 * Convene the sitting for a week and raise its summonses.
 * Body: { week, sittingDate, mode, venue?, meetingLink?, title? }
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!canRecord(session.user.role)) {
    return NextResponse.json(
      { error: 'Convening the theatre audit is done by the chairman, theatre management or the executive.' },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  const week = weekFrom(typeof body.week === 'string' ? body.week : null);
  const mode = String(body.mode ?? 'PHYSICAL').toUpperCase();
  if (!['PHYSICAL', 'VIRTUAL', 'HYBRID'].includes(mode)) {
    return NextResponse.json({ error: 'Mode must be physical, virtual or hybrid.' }, { status: 400 });
  }
  const sittingDate = body.sittingDate ? new Date(String(body.sittingDate)) : null;
  if (!sittingDate || Number.isNaN(sittingDate.getTime())) {
    return NextResponse.json({ error: 'Give the date and time of the sitting.' }, { status: 400 });
  }

  const venue = typeof body.venue === 'string' ? body.venue.trim() : '';
  const meetingLink = typeof body.meetingLink === 'string' ? body.meetingLink.trim() : '';

  // A summons has to say where to go or what to join. Checked here rather
  // than left to the recipient to work out.
  if (mode !== 'VIRTUAL' && !venue) {
    return NextResponse.json(
      { error: 'A physical or hybrid sitting needs a venue — the summons has to say where to go.' },
      { status: 400 },
    );
  }
  if (mode !== 'PHYSICAL' && !meetingLink) {
    return NextResponse.json(
      { error: 'A virtual or hybrid sitting needs a joining link.' },
      { status: 400 },
    );
  }

  try {
    const periodStart = new Date(`${week.start}T00:00:00.000Z`);
    const already = await prisma.theatreAuditConference.findFirst({
      where: { periodStart }, select: { id: true },
    });
    if (already) {
      return NextResponse.json(
        { error: `A sitting for ${week.label} has already been convened.`, conferenceId: already.id },
        { status: 409 },
      );
    }

    const conference = await prisma.theatreAuditConference.create({
      data: {
        title: `Theatre Audit — cancellations for ${week.label}`,
        sittingDate,
        mode: mode as 'PHYSICAL' | 'VIRTUAL' | 'HYBRID',
        venue: venue || null,
        meetingLink: meetingLink || null,
        periodStart,
        periodEnd: new Date(`${week.end}T00:00:00.000Z`),
        purpose: `Review of every case that did not hold between ${week.label}, and of `
          + 'preoperative anaesthetic reviews not completed by the 9pm deadline.',
        chairName: session.user.name || 'Theatre Audit Chairman',
        chairId: session.user.id,
        createdById: session.user.id,
      },
      select: { id: true, title: true },
    });

    // Attach every summons already raised in the week but not yet pooled —
    // the review lapses the nightly watch has been recording.
    const attached = await prisma.auditSummons.updateMany({
      where: { conferenceId: null, status: 'PENDING', raisedAt: { gte: week.from, lt: week.to } },
      data: { conferenceId: conference.id, status: 'NOTIFIED', notifiedAt: new Date() },
    });

    // Then raise one for each cancellation in the week.
    const cancellations = await prisma.caseCancellation.findMany({
      where: { cancelledAt: { gte: week.from, lt: week.to } },
      select: {
        id: true, reason: true, category: true, cancelledBy: true,
        surgery: {
          select: {
            id: true, procedureName: true, surgeonId: true, anesthetistId: true,
            bookedById: true, patient: { select: { name: true, folderNumber: true } },
          },
        },
      },
    });

    let raised = 0;
    for (const c of cancellations) {
      if (!c.surgery) continue;
      const label = `${c.surgery.patient?.name ?? 'Patient'} `
        + `(${c.surgery.patient?.folderNumber ?? '—'}) — ${c.surgery.procedureName}`;

      for (const t of targetsForCase({
        surgeryId: c.surgery.id,
        category: c.category,
        surgeonId: c.surgery.surgeonId,
        anaesthetistId: c.surgery.anesthetistId,
        bookedById: c.surgery.bookedById,
        cancelledById: c.cancelledBy,
      })) {
        const u = await prisma.user.findUnique({
          where: { id: t.userId }, select: { id: true, fullName: true },
        });
        if (!u) continue;
        try {
          await prisma.auditSummons.create({
            data: {
              cause: 'CASE_CANCELLATION',
              ground: c.category,
              conferenceId: conference.id,
              userId: u.id,
              personName: u.fullName,
              roleOnCase: t.roleOnCase,
              surgeryId: c.surgery.id,
              cancellationId: c.id,
              status: 'NOTIFIED',
              notifiedAt: new Date(),
              raisedBy: session.user.id,
              reason: `${label}. Cancelled: ${c.reason}`,
            },
          });
          raised += 1;
        } catch {
          // Already summoned for this case — the unique index doing its job.
          continue;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      conferenceId: conference.id,
      week: week.label,
      summonsesRaised: raised,
      lapsesAttached: attached.count,
    }, { status: 201 });
  } catch (error) {
    console.error('convene failed:', error);
    return NextResponse.json({ error: 'The sitting could not be convened' }, { status: 500 });
  }
}
