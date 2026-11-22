/**
 * The analysis as it stands, right now, for nothing.
 *
 * WHAT THIS IS NOT. It is not the AI run. That one spends real money per press,
 * takes three passes over a twenty-two section policy, and is chunked across
 * several requests because a single pass does not finish inside the sixty
 * seconds the deployment allows. Its own route says it is "never triggered by a
 * page load", and this route exists precisely so that rule can stay true while
 * the Chairman still sees the picture move as responses come in.
 *
 * Everything here is recomputed from the response rows on each call -- the same
 * helpers the round page already uses -- and then read through
 * src/lib/policy/livePreview.ts, which decides what counts as settled,
 * contested or simply too thin to say. It is safe to poll: no model, no spend,
 * and it cannot be wrong about a count.
 *
 * STALENESS IS DERIVED, NOT STORED. How many members had submitted when the
 * last AI run started is a count of invitations with submittedAt at or before
 * that moment, so nothing needed a new column to answer "this analysis reflects
 * 7 of 11 responses" -- which is the single thing that makes a mid-round
 * analysis safe to read.
 */
import { NextRequest, NextResponse } from 'next/server';

import prisma from '@/lib/prisma';
import { requirePolicyViewer } from '@/lib/policy/guard';
import { canSeeIndividualResponses } from '@/lib/policy/access';
import {
  decisionItemTalliesFor,
  flaggedCommentsFor,
  participationFor,
  sectionAgreementFor,
} from '@/lib/policy/owner';
import {
  coverageOf,
  leadingValue,
  liveSummary,
  provisionalBanner,
  rankSections,
  signalLabel,
  stalenessOf,
  worthRerunning,
} from '@/lib/policy/livePreview';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { error, actor } = await requirePolicyViewer();
  if (error || !actor) return error;

  try {
    const round = await prisma.policyReviewRound.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        status: true,
        version: true,
        closesAt: true,
        resultsVisibility: true,
        document: { select: { title: true } },
      },
    });
    if (!round) return NextResponse.json({ error: 'No such round' }, { status: 404 });

    const [participation, sections, items, lastRun] = await Promise.all([
      participationFor(round.id),
      sectionAgreementFor(round.id),
      decisionItemTalliesFor(round.id),
      prisma.policyAnalysisRun.findFirst({
        where: { roundId: round.id, status: 'VALIDATED' },
        orderBy: { startedAt: 'desc' },
        select: { id: true, startedAt: true, finishedAt: true, costCents: true },
      }),
    ]);

    // How many had submitted when that run began. Derived rather than stored,
    // so no migration was needed to answer the question that matters.
    const submittedAtRun = lastRun
      ? await prisma.policyInvitation.count({
        where: {
          roundId: round.id,
          revokedAt: null,
          submittedAt: { lte: lastRun.startedAt },
        },
      })
      : null;

    const coverage = coverageOf({
      invited: participation.invited,
      submitted: participation.submitted,
    });
    const staleness = stalenessOf({
      submittedAtRun,
      submittedNow: participation.submitted,
      lastRunAt: lastRun?.startedAt ?? null,
    });

    // Safety and high-priority comments carry attribution rules of their own,
    // so they go through the same gate the round page uses rather than a
    // looser one invented here for a preview.
    const flagged = canSeeIndividualResponses({
      role: actor.role,
      extraModules: actor.extraModules,
      visibility: round.resultsVisibility,
    })
      ? await flaggedCommentsFor({
        roundId: round.id,
        role: actor.role,
        extraModules: actor.extraModules,
        visibility: round.resultsVisibility,
      })
      : [];

    const ranked = rankSections(sections).map((s) => ({
      sectionId: s.sectionId,
      number: s.number,
      title: s.title,
      agree: s.agree,
      agreeWithChanges: s.agreeWithChanges,
      disagree: s.disagree,
      notMyArea: s.notMyArea,
      answered: s.answered,
      changeRequests: s.changeRequests,
      patientSafety: s.patientSafety,
      highPriority: s.highPriority,
      signal: s.signal,
      signalLabel: signalLabel(s.signal),
    }));

    return NextResponse.json({
      round: {
        id: round.id,
        title: round.document?.title ?? 'Theatre policy',
        version: round.version,
        status: round.status,
        closesAt: round.closesAt,
      },
      coverage,
      banner: provisionalBanner(coverage, round.status === 'CLOSED'),
      summary: liveSummary(sections, coverage),
      sections: ranked,
      decisionItems: items.map((t) => ({
        decisionItemId: t.decisionItemId,
        sectionNumber: t.sectionNumber,
        placeholder: t.placeholder,
        currentValue: t.currentValue,
        answered: t.answered,
        leading: leadingValue(t),
      })),
      flagged,
      analysis: {
        ...staleness,
        lastRunAt: lastRun?.startedAt ?? null,
        lastRunCostCents: lastRun?.costCents ?? null,
        submittedAtRun,
        suggestRerun: worthRerunning(staleness, coverage),
      },
      generatedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[policy/preview] failed', err);
    return NextResponse.json({ error: 'Could not build the preview' }, { status: 500 });
  }
}
