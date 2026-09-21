import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/apiError';
import { guardWrite, loadIssues } from '@/lib/audit/conferenceGuard';
import { analyse, OUTCOME_LABEL, type ConferenceOutcome } from '@/lib/audit/conference';

export const dynamic = 'force-dynamic';

/**
 * The decision on one point.
 *
 * Upserted, because there is one decision per point: recording it a second
 * time is the committee amending itself, not a rival decision sitting beside
 * the first. The amendment is audit-logged with what it replaced, so the
 * change is recoverable even though only the current decision is shown.
 */

const OUTCOMES = Object.keys(OUTCOME_LABEL) as ConferenceOutcome[];
const isOutcome = (v: unknown): v is ConferenceOutcome =>
  typeof v === 'string' && (OUTCOMES as string[]).includes(v);

const str = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

const date = (v: unknown): Date | null => {
  if (!v || typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const count = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const guard = await guardWrite(params.id, session.user.role);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error, code: guard.code }, { status: guard.status });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const issueId = str(body.issueId, 64);
    const outcome = body.outcome;
    const decisionText = str(body.decisionText, 4000);

    if (!issueId || !isOutcome(outcome)) {
      return NextResponse.json({
        error: 'Say which point, and what was decided on it.',
      }, { status: 400 });
    }
    if (!decisionText) {
      return NextResponse.json({
        // The wording is the decision. "Adopted" on its own tells a reader in
        // a year's time nothing about what was adopted.
        error: 'Write down what was decided, in the words that will be read out.',
        problems: [{ field: 'decisionText', message: 'The decision itself has not been written.' }],
      }, { status: 400 });
    }

    const issue = await prisma.conferenceIssue.findFirst({
      where: { id: issueId, conferenceId: params.id },
      select: { id: true, ordinal: true, title: true, decision: true },
    });
    if (!issue) {
      return NextResponse.json({ error: 'That point is not on this agenda.' }, { status: 404 });
    }

    // Dependencies must be points on THIS agenda, and never the point itself.
    // A point waiting on itself can never start, and the sequencer would
    // report it as a loop of one, which explains nothing to a reader.
    const siblings = await prisma.conferenceIssue.findMany({
      where: { conferenceId: params.id, id: { not: issueId } },
      select: { id: true },
    });
    const valid = new Set(siblings.map((s) => s.id));
    const dependsOnIssueIds = Array.isArray(body.dependsOnIssueIds)
      ? Array.from(new Set(
          (body.dependsOnIssueIds as unknown[])
            .filter((x): x is string => typeof x === 'string' && valid.has(x)),
        ))
      : [];

    const data = {
      outcome,
      decisionText,
      rationale: str(body.rationale, 4000) || null,
      ownerId: str(body.ownerId, 64) || null,
      ownerName: str(body.ownerName, 120) || null,
      dueDate: date(body.dueDate),
      dependsOnIssueIds,
      resourceImplication: str(body.resourceImplication, 2000) || null,
      votesFor: count(body.votesFor),
      votesAgainst: count(body.votesAgainst),
      votesAbstain: count(body.votesAbstain),
      // Only meaningful on their own outcomes. Carried over from a previous
      // answer they would show a return date on an adopted decision.
      reviewOn: outcome === 'DEFERRED' ? date(body.reviewOn) : null,
      referredTo: outcome === 'REFERRED' ? (str(body.referredTo, 200) || null) : null,
      recordedById: session.user.id,
      recordedByName: session.user.name ?? null,
    };

    const decision = await prisma.conferenceDecision.upsert({
      where: { issueId },
      create: { issueId, ...data },
      update: data,
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: issue.decision ? 'CONFERENCE_DECISION_AMENDED' : 'CONFERENCE_DECISION_RECORDED',
        tableName: 'conference_decisions',
        recordId: decision.id,
        changes: JSON.stringify({
          conferenceId: params.id,
          point: issue.ordinal,
          title: issue.title,
          outcome,
          decisionText,
          // What it replaced, so an amendment is recoverable even though the
          // screen only ever shows the decision now in force.
          previous: issue.decision
            ? { outcome: issue.decision.outcome, decisionText: issue.decision.decisionText }
            : null,
        }),
      },
    }).catch(() => { /* the decision stands even if the log does not */ });

    // Moved out of DRAFT by the act of deciding something. A sitting where
    // decisions are being recorded is in session whatever the screen last set.
    if (guard.conference?.status === 'DRAFT') {
      await prisma.theatreAuditConference.update({
        where: { id: params.id },
        data: { status: 'IN_SESSION' },
      }).catch(() => {});
    }

    // The analysis as it now stands, so the screen can show the effect of this
    // decision on the whole sitting without fetching everything again.
    const analysis = analyse(await loadIssues(params.id));

    return NextResponse.json({ decision, analysis });
  } catch (error) {
    return apiError('conference/[id]/decision PUT', error);
  }
}

/** DELETE ?issueId= — withdraw a decision recorded in error. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const guard = await guardWrite(params.id, session.user.role);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error, code: guard.code }, { status: guard.status });
  }

  try {
    const issueId = request.nextUrl.searchParams.get('issueId') ?? '';
    const issue = await prisma.conferenceIssue.findFirst({
      where: { id: issueId, conferenceId: params.id },
      select: { id: true, ordinal: true, decision: true },
    });
    if (!issue?.decision) {
      return NextResponse.json({ error: 'There is no decision on that point.' }, { status: 404 });
    }

    await prisma.conferenceDecision.delete({ where: { issueId } });

    // Logged with the full text. Withdrawing a decision is a governance act in
    // its own right, and the only trace it leaves on screen is an empty box.
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CONFERENCE_DECISION_WITHDRAWN',
        tableName: 'conference_decisions',
        recordId: issue.decision.id,
        changes: JSON.stringify({
          conferenceId: params.id,
          point: issue.ordinal,
          withdrawn: {
            outcome: issue.decision.outcome,
            decisionText: issue.decision.decisionText,
            ownerName: issue.decision.ownerName,
          },
        }),
      },
    }).catch(() => {});

    const analysis = analyse(await loadIssues(params.id));
    return NextResponse.json({ withdrawn: issueId, analysis });
  } catch (error) {
    return apiError('conference/[id]/decision DELETE', error);
  }
}
