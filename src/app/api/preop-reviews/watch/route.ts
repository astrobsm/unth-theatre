// ============================================================
// Tomorrow's reviews: who is expected, who has done one, and handing back
// ------------------------------------------------------------
// GET is the tracking board — for each case on a day, the anaesthetist the
// case names, how that name was arrived at, whether a review exists, and
// where the case stands against the 7pm and 9pm deadlines.
//
// POST carries the two actions the rule needs and nothing else wrote:
//
//   handback — "I cannot review this." Records it and tells the HOD. Allowed
//   after 7pm, but then recorded as late, because refusing the declaration
//   would leave the anaesthetist no way to say the true thing and would make
//   the 9pm finding worse rather than better. The rules already distinguish
//   handed-back-in-time from handed-back-too-late.
//
//   reassign — the HOD naming somebody else. Theirs alone: an anaesthetist
//   who could hand a case to a colleague directly would be choosing their own
//   replacement, and the rule exists precisely so that a person who can see
//   the whole rota makes that choice.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { watDay, watDayRange } from '@/lib/watDay';
import { pushToUsers } from '@/lib/pushAll';
import { classifyAnaesthetistAssignment, type RosterRow } from '@/lib/anaesthetistAssignment';
import {
  reviewWatchState, handbackDeadline, reviewDeadline, bookedTooLateToReview,
  type ReviewWatchInput,
} from '@/lib/anaesthesia/reviewWatch';

export const dynamic = 'force-dynamic';

/** Who may name a replacement. The rule says the HOD; admins can act for them. */
const MAY_REASSIGN = [
  'HEAD_OF_ANAESTHESIA', 'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER',
];

const WATCHED = ['SCHEDULED', 'IN_HOLDING_AREA', 'READY_FOR_THEATRE'] as const;

/** Tomorrow, in WAT. What the board opens on. */
function tomorrow(): string {
  const [y, m, d] = watDay(new Date()).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dayParam = searchParams.get('day');
  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : tomorrow();
  const { start, end } = watDayRange(day);
  const now = new Date();

  try {
    const surgeries = await prisma.surgery.findMany({
      where: { scheduledDate: { gte: start, lt: end }, status: { in: [...WATCHED] } },
      orderBy: [{ unit: 'asc' }, { scheduledTime: 'asc' }],
      select: {
        id: true, procedureName: true, scheduledDate: true, scheduledTime: true,
        createdAt: true, status: true, unit: true, subspecialty: true,
        anesthetistId: true,
        patient: { select: { name: true, folderNumber: true, ward: true } },
        anesthetist: { select: { id: true, fullName: true } },
        surgeon: { select: { fullName: true } },
        preOpReviews: {
          select: { id: true, reviewDate: true, anesthetistId: true, anesthetistName: true, status: true },
          take: 1,
        },
        reviewAssignment: true,
      },
    });

    const rosterRows: RosterRow[] = (await prisma.roster.findMany({
      where: {
        date: new Date(`${day}T00:00:00.000Z`),
        staffCategory: 'ANAESTHETISTS',
        status: 'PUBLISHED',
      },
      select: { userId: true, shift: true, subRole: true },
    })).map((r) => ({ userId: r.userId, shift: String(r.shift), subRole: r.subRole }));

    const cases = surgeries.map((s) => {
      const review = s.preOpReviews[0] ?? null;
      const a = s.reviewAssignment;
      const assignmentSource = classifyAnaesthetistAssignment({
        anaesthetistId: s.anesthetistId,
        subspecialty: s.subspecialty,
        rosterRows,
      });
      const input: ReviewWatchInput = {
        surgeryDate: s.scheduledDate,
        bookedAt: s.createdAt,
        status: s.status,
        expectedReviewerId: s.anesthetistId,
        assignmentSource,
        reviewedAt: review?.reviewDate ?? null,
        handedBackAt: a?.handedBackAt ?? null,
        reassignedToId: a?.reassignedToId ?? null,
      };
      return {
        surgeryId: s.id,
        procedureName: s.procedureName,
        scheduledTime: s.scheduledTime,
        unit: s.unit,
        subspecialty: s.subspecialty,
        patient: s.patient,
        surgeonName: s.surgeon?.fullName ?? null,
        expectedReviewer: s.anesthetist,
        assignmentSource,
        reviewedAt: review?.reviewDate ?? null,
        reviewedByName: review?.anesthetistName ?? null,
        reviewId: review?.id ?? null,
        handedBackAt: a?.handedBackAt ?? null,
        handedBackReason: a?.handedBackReason ?? null,
        reassignedToName: a?.reassignedToName ?? null,
        lapsedAt: a?.lapsedAt ?? null,
        lapseGround: a?.lapseGround ?? null,
        state: reviewWatchState(input, now),
        bookedTooLate: bookedTooLateToReview(input),
        mine: s.anesthetistId === session.user.id || a?.reassignedToId === session.user.id,
      };
    });

    return NextResponse.json({
      day,
      handbackBy: handbackDeadline(`${day}T00:00:00.000Z`),
      reviewBy: reviewDeadline(`${day}T00:00:00.000Z`),
      rosterPublished: rosterRows.length > 0,
      canReassign: MAY_REASSIGN.includes(session.user.role),
      cases,
    });
  } catch (error) {
    console.error('preop watch board failed:', error);
    return NextResponse.json({ error: 'Could not read the board' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  const surgeryId = typeof body.surgeryId === 'string' ? body.surgeryId : '';
  const action = String(body.action ?? '');
  if (!surgeryId) return NextResponse.json({ error: 'Which case?' }, { status: 400 });

  const surgery = await prisma.surgery.findUnique({
    where: { id: surgeryId },
    select: {
      id: true, procedureName: true, scheduledDate: true, anesthetistId: true,
      patient: { select: { name: true, folderNumber: true } },
    },
  });
  if (!surgery) return NextResponse.json({ error: 'No such case.' }, { status: 404 });

  const day = watDay(surgery.scheduledDate);
  const now = new Date();

  if (action === 'handback') {
    const isAssigned = surgery.anesthetistId === session.user.id;
    const canActFor = MAY_REASSIGN.includes(session.user.role);
    if (!isAssigned && !canActFor) {
      return NextResponse.json(
        { error: 'Only the anaesthetist assigned to this case can hand it back.' },
        { status: 403 },
      );
    }
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 5) {
      return NextResponse.json(
        { error: 'Say briefly why you cannot review it — the HOD needs it to decide who can.' },
        { status: 400 },
      );
    }

    const late = now.getTime() > handbackDeadline(surgery.scheduledDate).getTime();

    await prisma.preopReviewAssignment.upsert({
      where: { surgeryId },
      create: {
        surgeryId,
        surgeryDate: new Date(`${day}T00:00:00.000Z`),
        expectedReviewerId: surgery.anesthetistId,
        handedBackAt: now,
        handedBackById: session.user.id,
        handedBackReason: reason,
      },
      update: {
        handedBackAt: now,
        handedBackById: session.user.id,
        handedBackReason: reason,
        // Handing back again undoes a previous reassignment, so the HOD is
        // asked afresh rather than the case appearing already covered.
        reassignedToId: null, reassignedToName: null, reassignedAt: null,
      },
    });

    const label = `${surgery.patient?.name ?? 'Patient'} `
      + `(${surgery.patient?.folderNumber ?? '—'}) — ${surgery.procedureName}, listed ${day}`;

    const hods = await prisma.user.findMany({
      where: { role: 'HEAD_OF_ANAESTHESIA', status: 'APPROVED' },
      select: { id: true },
    });
    for (const h of hods) {
      await prisma.notification.create({
        data: {
          userId: h.id,
          type: 'PREOP_REVIEW_HANDBACK',
          title: late
            ? 'Case handed back AFTER the 7pm deadline'
            : 'A case needs another anaesthetist to review it',
          message: `${label}. Reason: ${reason}`
            + (late ? ' This was declared after 7pm, which leaves little time to reassign.' : ''),
          link: '/dashboard/preop-reviews/watch',
        },
      }).catch(() => undefined);
      await pushToUsers([h.id], {
        title: late ? 'Handed back after 7pm' : 'A case needs reassigning',
        body: label,
        url: '/dashboard/preop-reviews/watch',
      }).catch(() => undefined);
    }

    return NextResponse.json({
      ok: true, late,
      message: hods.length === 0
        ? 'Recorded — but no Head of Anaesthesia account exists, so nobody was notified. '
          + 'Tell the HOD directly.'
        : late
          ? 'Recorded and the HOD notified. Note this was after 7pm, so it is recorded as late.'
          : 'Recorded and the HOD notified.',
    });
  }

  if (action === 'reassign') {
    if (!MAY_REASSIGN.includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Naming a replacement reviewer is the Head of Anaesthesia’s decision.' },
        { status: 403 },
      );
    }
    const toUserId = typeof body.toUserId === 'string' ? body.toUserId : '';
    if (!toUserId) return NextResponse.json({ error: 'Name the anaesthetist.' }, { status: 400 });

    const to = await prisma.user.findUnique({
      where: { id: toUserId }, select: { id: true, fullName: true },
    });
    if (!to) return NextResponse.json({ error: 'No such user.' }, { status: 404 });

    await prisma.preopReviewAssignment.upsert({
      where: { surgeryId },
      create: {
        surgeryId,
        surgeryDate: new Date(`${day}T00:00:00.000Z`),
        expectedReviewerId: surgery.anesthetistId,
        reassignedToId: to.id, reassignedToName: to.fullName,
        reassignedAt: now, reassignedById: session.user.id,
      },
      update: {
        reassignedToId: to.id, reassignedToName: to.fullName,
        reassignedAt: now, reassignedById: session.user.id,
      },
    });

    const label = `${surgery.patient?.name ?? 'Patient'} — ${surgery.procedureName}, listed ${day}`;
    await prisma.notification.create({
      data: {
        userId: to.id,
        type: 'PREOP_REVIEW_ASSIGNED',
        title: 'You have been asked to review a case before tomorrow',
        message: `${label}. The review is due by 9pm this evening.`,
        link: `/dashboard/preop-reviews/new?surgeryId=${surgeryId}`,
      },
    }).catch(() => undefined);
    await pushToUsers([to.id], {
      title: 'Preoperative review reassigned to you',
      body: `${label}. Due by 9pm.`,
      url: `/dashboard/preop-reviews/new?surgeryId=${surgeryId}`,
    }).catch(() => undefined);

    return NextResponse.json({ ok: true, message: `${to.fullName} has been asked to review it.` });
  }

  return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 });
}
