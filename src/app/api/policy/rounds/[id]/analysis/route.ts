/**
 * Run the analysis, and read what it produced.
 *
 * POST spends real money on the hospital's Anthropic account, so it is owner
 * only, it is never triggered by a page load, and the run records what it cost.
 * GET is read-only and returns the latest run with its proposed changes.
 *
 * A run that failed validation is RETURNED, not hidden. Its findings are not
 * shown as findings, but the Chairman is told why it was refused: a prompt that
 * has started inventing support is something he needs to know about.
 */
import { NextRequest, NextResponse } from 'next/server';

import prisma from '@/lib/prisma';
import { requirePolicyOwner, requirePolicyViewer } from '@/lib/policy/guard';
import { runPolicyAnalysis } from '@/lib/policy/analysis/run';

export const dynamic = 'force-dynamic';
/**
 * Sixty seconds, matching every other long route here, because that is the
 * ceiling the deployment actually allows.
 *
 * A twenty-two section policy at high effort does not finish in sixty seconds,
 * which is why the run is RESUMABLE rather than single-shot: each call analyses
 * what it can in about forty-five seconds, banks it, and returns `done: false`
 * with a count. The page calls again until it is done, and a resumed run skips
 * the sections already analysed so nothing is paid for twice.
 */
export const maxDuration = 60;

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { error, actor } = await requirePolicyViewer();
  if (error || !actor) return error;

  try {
    const run = await prisma.policyAnalysisRun.findFirst({
      where: { roundId: params.id },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        status: true,
        model: true,
        promptVersion: true,
        inputSnapshotHash: true,
        startedAt: true,
        finishedAt: true,
        output: true,
        validationErrors: true,
        inputTokens: true,
        outputTokens: true,
        costCents: true,
        runByName: true,
      },
    });

    if (!run) return NextResponse.json({ run: null, changes: [] });

    const changes = await prisma.policyProposedChange.findMany({
      where: { analysisRunId: run.id },
      orderBy: [{ clinicalReviewRequired: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        sectionId: true,
        type: true,
        currentText: true,
        proposedText: true,
        editedText: true,
        rationale: true,
        supportingResponseIds: true,
        supportStrength: true,
        clinicalReviewRequired: true,
        ownerDecision: true,
        decidedByName: true,
        decidedAt: true,
      },
    });

    // Section labels, so the screen does not have to hold the whole document
    // just to say which section a change belongs to.
    const round = await prisma.policyReviewRound.findUniqueOrThrow({
      where: { id: params.id },
      select: { documentId: true },
    });
    const sections = await prisma.policySection.findMany({
      where: { documentId: round.documentId },
      orderBy: [{ order: 'asc' }],
      select: { id: true, number: true, title: true },
    });

    return NextResponse.json(
      { run, changes, sections },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('[policy/analysis] GET failed', err);
    return NextResponse.json({ error: 'Could not load the analysis' }, { status: 500 });
  }
}

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const { error, actor } = await requirePolicyOwner();
  if (error || !actor) return error;

  try {
    const round = await prisma.policyReviewRound.findUnique({
      where: { id: params.id },
      select: { id: true, status: true },
    });
    if (!round) return NextResponse.json({ error: 'No such round' }, { status: 404 });

    if (round.status === 'DRAFT') {
      return NextResponse.json(
        { error: 'This round has not opened, so there are no responses to analyse.' },
        { status: 400 },
      );
    }

    // A RUNNING run is normally this caller coming back for the next slice, so
    // it must NOT be refused -- that is how the analysis makes progress. What
    // is refused is a genuinely concurrent request: two slices in flight at
    // once would double the bill and race each other writing proposed changes.
    //
    // `updatedAt` is touched every time a slice banks its findings, so "touched
    // in the last twenty seconds" means somebody is mid-slice right now, while
    // a run whose slice finished a moment ago is free to continue.
    const inFlight = await prisma.policyAnalysisRun.findFirst({
      where: {
        roundId: round.id,
        status: 'RUNNING',
        updatedAt: { gt: new Date(Date.now() - 20_000) },
      },
      select: { id: true },
    });
    if (inFlight) {
      return NextResponse.json(
        {
          error:
            'An analysis is already running for this round. Give it a moment — it '
            + 'continues a few sections at a time.',
        },
        { status: 409 },
      );
    }

    const outcome = await runPolicyAnalysis({
      roundId: round.id,
      actorId: actor.id,
      actorName: actor.name,
    });

    return NextResponse.json(
      { ok: outcome.status === 'VALIDATED', ...outcome },
      { status: 200 },
    );
  } catch (err) {
    console.error('[policy/analysis] POST failed', err);
    return NextResponse.json(
      {
        error: err instanceof Error
          ? err.message
          : 'The analysis could not be started.',
      },
      { status: 500 },
    );
  }
}
