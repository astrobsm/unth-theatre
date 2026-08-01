// ============================================================
// Quality Assurance review of unexplained delays
// ------------------------------------------------------------
// The detector raises a record saying a CASE ran late with nothing said. This
// is where a human decides what, if anything, that means.
//
// The distinction the whole module rests on is enforced here: the software
// says a case was unexplained; only a person says whether it was avoidable,
// and only after reading the case. `judgedAvoidable` is therefore writable
// ONLY through this route, only by the committee, and never inferred from a
// category or a timer.
//
// The review outcomes are deliberately narrow:
//   NO ACTION      — looked at, nothing to answer for.
//   SYSTEM ISSUE   — the theatre was let down by something outside its control.
//   REFERRED       — needs a conversation the software has no business having.
// There is no "guilty" outcome, because that is not a judgement a screen
// should offer.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** Who sits on the review. Narrow on purpose — this is a governance function. */
const REVIEWERS = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC',
];

const OUTCOMES = ['REVIEWED_NO_ACTION', 'REVIEWED_SYSTEM_ISSUE', 'REVIEWED_REFERRED'];

// ---------------------------------------------------------------------------
// GET — the review queue
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string } | undefined;
  if (!session?.user) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  if (!user?.role || !REVIEWERS.includes(user.role)) {
    return NextResponse.json(
      { error: 'Flagged cases are reviewed by theatre management and the Quality Assurance committee.' },
      { status: 403 }
    );
  }

  const sp = request.nextUrl.searchParams;
  const status = sp.get('status') ?? 'PENDING_REVIEW';

  try {
    const rows = await prisma.theatreUnexplainedDelay.findMany({
      where: status === 'ALL' ? {} : { reviewStatus: status as never },
      include: {
        surgery: {
          select: {
            id: true,
            procedureName: true,
            scheduledDate: true,
            scheduledTime: true,
            surgeryType: true,
            unit: true,
            location: true,
            surgeonName: true,
            // Shown so a reviewer can see whether a reason arrived LATE. A
            // theatre that explained itself at 50 minutes did document the
            // problem, just past the threshold, and that is a different matter
            // from one that never said anything at all.
            delayRecords: {
              select: { categoryCode: true, narrative: true, recordedAt: true, reportedByName: true },
              orderBy: { recordedAt: 'asc' },
            },
          },
        },
      },
      orderBy: { detectedAt: 'desc' },
      take: 300,
    });

    return NextResponse.json({
      cases: rows.map((r) => ({
        ...r,
        // Named explicitly rather than left for the reviewer to notice.
        explainedLate: r.surgery.delayRecords.length > 0,
      })),
      totals: {
        pending: await prisma.theatreUnexplainedDelay.count({ where: { reviewStatus: 'PENDING_REVIEW' } }),
        shown: rows.length,
      },
    });
  } catch (error) {
    console.error('[theatre-ops] review queue failed:', error);
    return NextResponse.json({ error: 'Failed to load the review queue' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH — record a review
// ---------------------------------------------------------------------------
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string; fullName?: string; name?: string } | undefined;
  if (!user?.id) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  if (!user.role || !REVIEWERS.includes(user.role)) {
    return NextResponse.json(
      { error: 'Only theatre management and the Quality Assurance committee may review a flagged case.' },
      { status: 403 }
    );
  }

  let body: { id?: string; outcome?: string; notes?: string; judgedAvoidable?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.id || !body.outcome || !OUTCOMES.includes(body.outcome)) {
    return NextResponse.json(
      { error: 'A case and an outcome are required.', outcomes: OUTCOMES },
      { status: 400 }
    );
  }

  const notes = body.notes?.trim();
  // A review with no reasoning is a tick-box, and a tick-box cannot be
  // defended later to the person it concerns.
  if (!notes || notes.length < 10) {
    return NextResponse.json(
      { error: 'Record what the committee concluded and why (at least 10 characters).' },
      { status: 400 }
    );
  }

  try {
    const existing = await prisma.theatreUnexplainedDelay.findUnique({ where: { id: body.id } });
    if (!existing) return NextResponse.json({ error: 'Flagged case not found' }, { status: 404 });

    const updated = await prisma.theatreUnexplainedDelay.update({
      where: { id: body.id },
      data: {
        reviewStatus: body.outcome as never,
        reviewNotes: notes,
        reviewedById: user.id,
        reviewedByName: user.fullName ?? user.name ?? null,
        reviewedAt: new Date(),
        // The only place this is ever set. A person, having read the case.
        judgedAvoidable: typeof body.judgedAvoidable === 'boolean' ? body.judgedAvoidable : null,
      },
    });

    return NextResponse.json({ case: updated, success: true });
  } catch (error) {
    console.error('[theatre-ops] review failed:', error);
    return NextResponse.json({ error: 'Failed to record the review' }, { status: 500 });
  }
}
