// ============================================================
// Applying to the Theatre Research Board, and the board deciding
// ------------------------------------------------------------
//   GET    your own applications, and — for the board — everything waiting
//   POST   apply
//   PATCH  decide, or withdraw your own
//
// THE DEADLINE IS STORED, NOT COMPUTED. Twenty-four hours from submission is
// an undertaking the board made, and storing it on the row means changing the
// undertaking later does not silently re-date every application already in
// flight.
//
// A GRANT ALWAYS EXPIRES. The board may set a date; where it does not, the
// default applies. There is no option for a permanent grant, because a
// permanent grant outlives the study it was given for and the person who
// approved it has usually moved on by the time anybody notices.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import {
  isResearchBoard, RESEARCH_BOARD_ROLES, RESEARCH_PURPOSES,
  DECISION_HOURS, DEFAULT_GRANT_DAYS,
} from '@/lib/research/board';

export const dynamic = 'force-dynamic';

const SELECT = {
  id: true, title: true, rationale: true, purpose: true, scopeRequested: true,
  periodFrom: true, periodTo: true, ethicsReference: true, status: true,
  submittedAt: true, dueBy: true, decidedAt: true, decidedByName: true,
  decisionNote: true, scopeGranted: true, expiresAt: true,
  applicant: { select: { id: true, fullName: true, role: true } },
} as const;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const actor = session.user as { id?: string; role?: string };
  const onBoard = isResearchBoard(actor.role);

  const [mine, forReview] = await Promise.all([
    prisma.researchAccessRequest.findMany({
      where: { applicantId: actor.id ?? '__none__' },
      select: SELECT,
      orderBy: { submittedAt: 'desc' },
      take: 20,
    }),
    onBoard
      ? prisma.researchAccessRequest.findMany({
        where: { status: 'PENDING' },
        select: SELECT,
        // Oldest first: the one closest to the twenty-four hours is the one
        // that needs deciding, not the one that arrived most recently.
        orderBy: { submittedAt: 'asc' },
        take: 100,
      })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    onBoard,
    boardRoles: RESEARCH_BOARD_ROLES,
    purposes: RESEARCH_PURPOSES,
    decisionHours: DECISION_HOURS,
    defaultGrantDays: DEFAULT_GRANT_DAYS,
    mine,
    forReview,
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const actor = session.user as { id?: string };
  if (!actor.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const title = String(body?.title ?? '').trim();
    const rationale = String(body?.rationale ?? '').trim();
    const purpose = String(body?.purpose ?? '').trim();
    const scopeRequested = String(body?.scopeRequested ?? '').trim();
    const ethicsReference = String(body?.ethicsReference ?? '').trim() || null;

    // Asked for in full sentences on purpose. A board cannot weigh "audit" as
    // a rationale, and an application that cannot be weighed gets approved on
    // the nod — which is the failure mode this whole process exists to avoid.
    if (title.length < 6) {
      return NextResponse.json({ error: 'Give the study a title the board will recognise.' }, { status: 400 });
    }
    if (rationale.length < 40) {
      return NextResponse.json({
        error: 'Say why you need cases that are not your own, in a sentence or two. '
          + 'The board has to be able to weigh it.',
      }, { status: 400 });
    }
    if (scopeRequested.length < 10) {
      return NextResponse.json({
        error: 'Say which cases you need — the specialty, the procedure, the period. '
          + 'The board grants the scope you describe, so a vague one is refused rather than widened.',
      }, { status: 400 });
    }

    const already = await prisma.researchAccessRequest.findFirst({
      where: { applicantId: actor.id, status: 'PENDING' },
      select: { id: true, title: true, dueBy: true },
    });
    if (already) {
      return NextResponse.json({
        alreadyPending: true,
        message: `You already have an application with the board: "${already.title}". `
          + `It is due a decision by ${already.dueBy.toISOString().slice(0, 16).replace('T', ' ')}. `
          + 'Withdraw it if you want to replace it.',
      });
    }

    const submittedAt = new Date();
    const created = await prisma.researchAccessRequest.create({
      data: {
        applicantId: actor.id,
        title,
        rationale,
        purpose: purpose || 'Clinical audit',
        scopeRequested,
        ethicsReference,
        periodFrom: body?.periodFrom ? new Date(`${body.periodFrom}T00:00:00.000Z`) : null,
        periodTo: body?.periodTo ? new Date(`${body.periodTo}T00:00:00.000Z`) : null,
        submittedAt,
        dueBy: new Date(submittedAt.getTime() + DECISION_HOURS * 3_600_000),
      },
      select: SELECT,
    });

    // The board is told. Without this the application sits on a screen nobody
    // has a reason to open, and the twenty-four hours passes in silence.
    const board = await prisma.user.findMany({
      where: { status: 'APPROVED', role: { in: RESEARCH_BOARD_ROLES as never } },
      select: { id: true },
    });
    if (board.length > 0) {
      await prisma.notification.createMany({
        data: board.map((b) => ({
          userId: b.id,
          type: 'RESEARCH_ACCESS_REQUEST',
          title: 'Research access application',
          message: `${(session.user as { fullName?: string }).fullName ?? 'A colleague'} has applied `
            + `to study cases beyond their own: "${title}". A decision is due within ${DECISION_HOURS} hours.`,
          link: '/dashboard/research?tab=access',
        })),
      }).catch(() => { /* the application stands even if the notice does not */ });
    }

    return NextResponse.json({ created, boardNotified: board.length });
  } catch (err) {
    console.error('[research/access-request] apply failed:', err);
    return NextResponse.json({ error: 'Could not submit the application' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const actor = session.user as {
    id?: string; role?: string; fullName?: string | null; name?: string | null;
  };

  try {
    const body = await request.json();
    const id = String(body?.id ?? '');
    const action = String(body?.action ?? '');
    if (!id) return NextResponse.json({ error: 'Which application?' }, { status: 400 });

    const row = await prisma.researchAccessRequest.findUnique({
      where: { id },
      select: { id: true, applicantId: true, status: true, title: true, scopeRequested: true },
    });
    if (!row) return NextResponse.json({ error: 'No such application' }, { status: 404 });

    // ── The applicant withdrawing their own ─────────────────────────
    if (action === 'withdraw') {
      if (row.applicantId !== actor.id) {
        return NextResponse.json({ error: 'Only the applicant can withdraw it.' }, { status: 403 });
      }
      if (row.status !== 'PENDING') {
        return NextResponse.json({ error: 'That application has already been decided.' }, { status: 400 });
      }
      const updated = await prisma.researchAccessRequest.update({
        where: { id }, data: { status: 'WITHDRAWN' }, select: SELECT,
      });
      return NextResponse.json({ updated });
    }

    // ── The board deciding ──────────────────────────────────────────
    if (!isResearchBoard(actor.role)) {
      return NextResponse.json({
        error: 'Research access applications are decided by the Theatre Research Board.',
        code: 'NOT_ON_BOARD',
      }, { status: 403 });
    }

    // A member must not decide their own application. It is the one conflict
    // of interest a twelve-seat board makes easy to avoid.
    if (row.applicantId === actor.id) {
      return NextResponse.json({
        error: 'You cannot decide your own application. Ask another member of the board.',
        code: 'OWN_APPLICATION',
      }, { status: 403 });
    }

    if (!['approve', 'reject', 'revoke'].includes(action)) {
      return NextResponse.json({ error: 'Approve, reject or revoke?' }, { status: 400 });
    }
    if (action !== 'revoke' && row.status !== 'PENDING') {
      return NextResponse.json({ error: 'That application has already been decided.' }, { status: 400 });
    }

    const note = String(body?.decisionNote ?? '').trim() || null;
    if (action === 'reject' && !note) {
      // A refusal with no reason is a refusal the applicant will simply
      // resubmit, and the board will spend the twenty-four hours again.
      return NextResponse.json({
        error: 'Say why it is refused. Without a reason the same application comes back next week.',
      }, { status: 400 });
    }

    const scopeGranted = String(body?.scopeGranted ?? '').trim() || row.scopeRequested;
    const days = Number(body?.grantDays);
    const grantDays = Number.isFinite(days) && days > 0 && days <= 1095
      ? Math.round(days) : DEFAULT_GRANT_DAYS;

    const updated = await prisma.researchAccessRequest.update({
      where: { id },
      data: {
        status: action === 'approve' ? 'APPROVED' : action === 'reject' ? 'REJECTED' : 'REVOKED',
        decidedAt: new Date(),
        decidedById: actor.id ?? null,
        decidedByName: actor.fullName || actor.name || 'Theatre Research Board',
        decisionNote: note,
        scopeGranted: action === 'approve' ? scopeGranted : null,
        expiresAt: action === 'approve'
          ? new Date(Date.now() + grantDays * 86_400_000)
          : null,
      },
      select: SELECT,
    });

    await prisma.notification.create({
      data: {
        userId: row.applicantId,
        type: 'RESEARCH_ACCESS_DECISION',
        title: action === 'approve'
          ? 'Research access approved'
          : action === 'reject' ? 'Research access refused' : 'Research access withdrawn',
        message: action === 'approve'
          ? `The Theatre Research Board approved "${row.title}". Scope: ${scopeGranted}. `
            + `It is in force for ${grantDays} days.`
          : `The Theatre Research Board ${action === 'reject' ? 'refused' : 'revoked'} `
            + `"${row.title}".${note ? ` ${note}` : ''}`,
        link: '/dashboard/research?tab=access',
      },
    }).catch(() => { /* the decision stands even if the notice does not */ });

    if (actor.id) {
      await prisma.auditLog.create({
        data: {
          userId: actor.id,
          action: `RESEARCH_ACCESS_${action.toUpperCase()}`,
          tableName: 'research_access_requests',
          recordId: id,
          changes: JSON.stringify({ title: row.title, scopeGranted, grantDays, note }),
        },
      }).catch(() => { /* the decision stands even if the log does not */ });
    }

    return NextResponse.json({ updated });
  } catch (err) {
    console.error('[research/access-request] decide failed:', err);
    return NextResponse.json({ error: 'Could not record the decision' }, { status: 500 });
  }
}
