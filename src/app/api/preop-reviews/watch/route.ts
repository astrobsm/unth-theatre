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
import { getAnaesthetistTeamsForDate, subspecialtyForUnit } from '@/lib/anaesthetistTeam';
import { expectedReviewersFor } from '@/lib/anaesthesia/expectedReviewers';
import { buildReviewChaseMessage, registerForState } from '@/lib/anaesthesia/reviewChaseMessage';
import {
  reviewWatchState, handbackDeadline, reviewDeadline, bookedTooLateToReview,
  type ReviewWatchInput,
} from '@/lib/anaesthesia/reviewWatch';

export const dynamic = 'force-dynamic';

/** Who may name a replacement. The rule says the HOD; admins can act for them. */
const MAY_REASSIGN = [
  'HEAD_OF_ANAESTHESIA', 'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER',
];

/**
 * Who may write to a defaulting reviewer.
 *
 * The same people who may reassign, plus the head of surgery -- the surgical
 * team is the party left exposed by a missing review, and the message says so
 * on their behalf. Deliberately not every anaesthetist: a chase that any
 * colleague can fire is a chase nobody reads.
 */
const MAY_CHASE = [
  'HEAD_OF_ANAESTHESIA', 'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
];

const WATCHED = ['SCHEDULED', 'IN_HOLDING_AREA', 'READY_FOR_THEATRE'] as const;

/** A unit name that names no unit. Saves a pointless lookup per case. */
const s0 = (v: string) => !v.trim() || /^unassigned/i.test(v.trim());

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
        anesthetist: { select: { id: true, fullName: true, phoneNumber: true } },
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

    // WHO IS EXPECTED TO REVIEW. The registrar and senior registrar rostered
    // to the case's specialty that day -- not the consultant.
    //
    // This board used to name whoever was on the booking, which is usually
    // the consultant, because that is who the booking route fills in. So it
    // asked the wrong person for the review and then recorded the wrong
    // person as having missed it. The consultant approves; the registrar and
    // senior registrar do the pre-operative assessment.
    const teams = await getAnaesthetistTeamsForDate(new Date(`${day}T12:00:00.000Z`));

    // One lookup per distinct unit, not per case: a list of eleven cases in
    // four units is four queries, not eleven.
    const unitNames = Array.from(new Set(
      surgeries.map((s) => s.unit).filter((u): u is string => !!u && !s0(u)),
    ));
    const subForUnit = new Map<string, string | null>();
    for (let i = 0; i < unitNames.length; i += 1) {
      subForUnit.set(unitNames[i], await subspecialtyForUnit(unitNames[i]));
    }

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
      const reviewers = expectedReviewersFor({
        subspecialty: s.subspecialty || subForUnit.get(s.unit || '') || s.unit || null,
        teams,
        namedOnCase: s.anesthetist
          ? { userId: s.anesthetist.id, name: s.anesthetist.fullName, phone: s.anesthetist.phoneNumber, seniority: null, role: null }
          : null,
      });

      return {
        surgeryId: s.id,
        procedureName: s.procedureName,
        scheduledTime: s.scheduledTime,
        unit: s.unit,
        subspecialty: s.subspecialty,
        patient: s.patient,
        surgeonName: s.surgeon?.fullName ?? null,
        // Kept so nothing reading the old shape breaks; it is now the first
        // of the people below rather than the consultant on the booking.
        expectedReviewer: reviewers.reviewers[0]
          ? { id: reviewers.reviewers[0].userId, fullName: reviewers.reviewers[0].name }
          : null,
        expectedReviewers: reviewers.reviewers.map((r) => ({
          id: r.userId, fullName: r.name, phone: r.phone, grade: r.grade,
        })),
        reviewerSource: reviewers.source,
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
        // "Mine" now follows the people who are actually expected to do it.
        mine: reviewers.reviewers.some((r) => r.userId === session.user.id)
          || s.anesthetistId === session.user.id
          || a?.reassignedToId === session.user.id,
      };
    });

    return NextResponse.json({
      day,
      handbackBy: handbackDeadline(`${day}T00:00:00.000Z`),
      reviewBy: reviewDeadline(`${day}T00:00:00.000Z`),
      rosterPublished: rosterRows.length > 0,
      canReassign: MAY_REASSIGN.includes(session.user.role),
      canChase: MAY_CHASE.includes(session.user.role),
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

  // ------------------------------------------------------------------
  // chase -- write to the people who were expected to review and did not
  // ------------------------------------------------------------------
  //
  // THE RECORD IS WRITTEN BEFORE THE LINK IS HANDED BACK. A blocked pop-up
  // can then only leave the message unsent; it can never leave it sent and
  // unrecorded. This is the same order the roster chase uses and for the same
  // reason -- the half that matters is the one that survives in the system.
  //
  // WHATSAPP RATHER THAN A QUEUED MESSAGE. A queued WHATSAPP row waits on a
  // provider this installation does not have configured, so "chased" would
  // mean the registrar heard nothing. wa.me reaches them, and it arrives from
  // a person rather than from a system, which for an appeal is the point.
  if (action === 'chase') {
    if (!MAY_CHASE.includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Only the HOD, theatre management or an administrator can chase a review.' },
        { status: 403 },
      );
    }

    const day2 = watDay(surgery.scheduledDate);
    const teams = await getAnaesthetistTeamsForDate(new Date(`${day2}T12:00:00.000Z`));
    const full = await prisma.surgery.findUnique({
      where: { id: surgeryId },
      select: {
        unit: true, subspecialty: true, scheduledTime: true, status: true, createdAt: true,
        anesthetistId: true,
        anesthetist: { select: { id: true, fullName: true, phoneNumber: true } },
        surgeon: { select: { fullName: true } },
        preOpReviews: { select: { reviewDate: true }, take: 1 },
        reviewAssignment: true,
      },
    });
    if (!full) return NextResponse.json({ error: 'No such case.' }, { status: 404 });

    // The state is recomputed here from the database rather than taken from
    // the request. A client that could name the state could chase a colleague
    // who is not late, which is how a chase stops being read.
    const state = reviewWatchState({
      surgeryDate: surgery.scheduledDate,
      bookedAt: full.createdAt,
      status: full.status,
      expectedReviewerId: full.anesthetistId,
      assignmentSource: 'unrostered',
      reviewedAt: full.preOpReviews[0]?.reviewDate ?? null,
      handedBackAt: full.reviewAssignment?.handedBackAt ?? null,
      reassignedToId: full.reviewAssignment?.reassignedToId ?? null,
    }, now);

    const register = registerForState(state);
    if (!register) {
      return NextResponse.json({
        error: state === 'REVIEWED'
          ? 'This case has already been reviewed.'
          : 'This case is not late yet. Chasing somebody who is still within time is how a chase stops being read.',
      }, { status: 400 });
    }

    const resolved = expectedReviewersFor({
      subspecialty: full.subspecialty || (full.unit ? await subspecialtyForUnit(full.unit) : null) || full.unit || null,
      teams,
      namedOnCase: full.anesthetist
        ? { userId: full.anesthetist.id, name: full.anesthetist.fullName, phone: full.anesthetist.phoneNumber, seniority: null, role: null }
        : null,
    });

    if (resolved.reviewers.length === 0) {
      return NextResponse.json({
        error: 'Nobody is named to review this case, so there is nobody to chase. '
          + 'Reassign it instead.',
      }, { status: 400 });
    }

    const longDay = new Date(`${day2}T12:00:00.000Z`).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos',
    });

    const whatsapp: { id: string; name: string; number: string | null; text: string }[] = [];

    for (let i = 0; i < resolved.reviewers.length; i += 1) {
      const r = resolved.reviewers[i];
      const text = buildReviewChaseMessage({
        reviewerName: r.name,
        patientName: surgery.patient?.name ?? null,
        folderNumber: surgery.patient?.folderNumber ?? null,
        procedureName: surgery.procedureName,
        surgeryDay: longDay,
        scheduledTime: full.scheduledTime,
        unit: full.unit,
        surgeonName: full.surgeon?.fullName ?? null,
        register,
        fromName: session.user.name ?? null,
        fromRole: 'Theatre Management',
      });

      // In-app first, so the chase exists whether or not WhatsApp opens.
      await prisma.notification.create({
        data: {
          userId: r.userId,
          type: 'PREOP_REVIEW_CHASE',
          title: register === 'MISSED'
            ? 'A pre-operative review has missed the 9pm deadline'
            : 'A pre-operative review is overdue',
          message: text,
          link: `/dashboard/preop-reviews/new?surgeryId=${surgeryId}`,
        },
      }).catch(() => undefined);

      await pushToUsers([r.userId], {
        title: register === 'MISSED' ? 'Review missed the 9pm deadline' : 'Review overdue',
        body: `${surgery.patient?.name ?? 'A patient'} — ${surgery.procedureName}`,
        url: `/dashboard/preop-reviews/new?surgeryId=${surgeryId}`,
      }).catch(() => undefined);

      whatsapp.push({ id: r.userId, name: r.name, number: r.phone, text });
    }

    // Who chased whom, and when. A chase that leaves no trace cannot be shown
    // to have happened, which is exactly the failure the message complains of.
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'PREOP_REVIEW_CHASED',
        tableName: 'preop_review_assignments',
        recordId: surgeryId,
        changes: JSON.stringify({
          register,
          state,
          surgeryDay: day2,
          reviewers: resolved.reviewers.map((r) => ({ id: r.userId, name: r.name, grade: r.grade })),
          reviewerSource: resolved.source,
        }),
      },
    }).catch(() => undefined);

    const reachable = whatsapp.filter((w) => w.number).length;
    return NextResponse.json({
      ok: true,
      whatsapp,
      message: reachable === whatsapp.length
        ? `Written to ${whatsapp.length === 1 ? whatsapp[0].name : `${whatsapp.length} reviewers`}. Opening WhatsApp.`
        : reachable === 0
          ? 'Recorded on their dashboards. None of them has a phone number on file, so there is nothing to open.'
          : `Recorded for all ${whatsapp.length}. Only ${reachable} has a phone number on file.`,
    });
  }

  return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 });
}
