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
/** Twenty-odd model calls at high effort do not finish in ten seconds. */
export const maxDuration = 800;

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

    const running = await prisma.policyAnalysisRun.findFirst({
      where: { roundId: round.id, status: 'RUNNING' },
      select: { id: true, startedAt: true },
    });
    if (running) {
      // Two concurrent runs would double the bill and race each other writing
      // proposed changes. Ten minutes is well past the longest honest run.
      const stale = Date.now() - running.startedAt.getTime() > 10 * 60 * 1000;
      if (!stale) {
        return NextResponse.json(
          { error: 'An analysis is already running for this round. Wait for it to finish.' },
          { status: 409 },
        );
      }
      await prisma.policyAnalysisRun.update({
        where: { id: running.id },
        data: {
          status: 'FAILED_API',
          finishedAt: new Date(),
          validationErrors: {
            message: 'Abandoned: it was still marked running when a later run started.',
          } as never,
        },
      });
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
