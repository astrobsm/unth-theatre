/**
 * Accept, reject, edit, or send a proposed change to the committee meeting.
 *
 * This is the gate between what the model recommended and what the policy says.
 * Nothing reaches the final document except through an ACCEPTED or EDITED
 * decision made here, by a person, one change at a time.
 *
 * A change marked FOR_COMMITTEE is not a rejection — it is a decision to decide
 * it in the room, and those are collected on the agenda page.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { requirePolicyOwner } from '@/lib/policy/guard';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  changeId: z.string().min(1),
  decision: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'EDITED', 'FOR_COMMITTEE']),
  /** Required for EDITED: the Chairman's own wording. */
  editedText: z.string().max(20000).nullish(),
});

/** Settle one [bracketed] value, which is a decision, not a wording change. */
const settleSchema = z.object({
  decisionItemId: z.string().min(1),
  finalValue: z.string().min(1).max(400),
  rationale: z.string().max(2000).nullish(),
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { error, actor } = await requirePolicyOwner();
  if (error || !actor) return error;

  try {
    const body = await request.json();

    // Settling an open value arrives here too, because from the Chairman's
    // side it is the same screen and the same gesture.
    const settle = settleSchema.safeParse(body);
    if (settle.success) {
      const item = await prisma.policyDecisionItem.findFirst({
        where: {
          id: settle.data.decisionItemId,
          section: { document: { rounds: { some: { id: params.id } } } },
        },
        select: { id: true },
      });
      if (!item) {
        return NextResponse.json(
          { error: 'That open value is not in this round' },
          { status: 404 },
        );
      }

      // Stored as a VALUE change on the run, so the change log carries it with
      // everything else rather than keeping settled values in a second place
      // the final document has to remember to consult.
      const run = await prisma.policyAnalysisRun.findFirst({
        where: { roundId: params.id, status: 'VALIDATED' },
        orderBy: { startedAt: 'desc' },
        select: { id: true },
      });
      if (!run) {
        return NextResponse.json(
          { error: 'Run the analysis first, so settled values are recorded against it.' },
          { status: 400 },
        );
      }

      const full = await prisma.policyDecisionItem.findUniqueOrThrow({
        where: { id: item.id },
        select: { placeholder: true, currentValue: true, sectionId: true },
      });

      const existing = await prisma.policyProposedChange.findFirst({
        where: {
          analysisRunId: run.id,
          sectionId: full.sectionId,
          type: 'VALUE',
          currentText: full.placeholder,
        },
        select: { id: true },
      });

      const data = {
        analysisRunId: run.id,
        sectionId: full.sectionId,
        type: 'VALUE' as const,
        currentText: full.placeholder,
        proposedText: settle.data.finalValue,
        rationale: settle.data.rationale?.trim()
          || 'Settled by the Chairman from the responses to this round.',
        supportingResponseIds: [] as never,
        supportStrength: 'STRONG' as const,
        clinicalReviewRequired: false,
        ownerDecision: 'ACCEPTED' as const,
        decidedById: actor.id,
        decidedByName: actor.name,
        decidedAt: new Date(),
      };

      const row = existing
        ? await prisma.policyProposedChange.update({
          where: { id: existing.id },
          data,
          select: { id: true },
        })
        : await prisma.policyProposedChange.create({ data, select: { id: true } });

      return NextResponse.json({ ok: true, changeId: row.id, settled: true });
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Could not read that decision', detail: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const input = parsed.data;

    if (input.decision === 'EDITED' && (input.editedText ?? '').trim() === '') {
      // "Accept with edits" and no edit is an accept, and recording it as an
      // edit would put an empty string into the policy.
      return NextResponse.json(
        { error: 'Write your wording, or use Accept to take the proposal as it stands.' },
        { status: 400 },
      );
    }

    const change = await prisma.policyProposedChange.findFirst({
      where: { id: input.changeId, analysisRun: { roundId: params.id } },
      select: { id: true, clinicalReviewRequired: true },
    });
    if (!change) {
      return NextResponse.json({ error: 'No such change in this round' }, { status: 404 });
    }

    const updated = await prisma.policyProposedChange.update({
      where: { id: change.id },
      data: {
        ownerDecision: input.decision,
        editedText: input.decision === 'EDITED' ? input.editedText!.trim() : null,
        decidedById: input.decision === 'PENDING' ? null : actor.id,
        decidedByName: input.decision === 'PENDING' ? null : actor.name,
        decidedAt: input.decision === 'PENDING' ? null : new Date(),
      },
      select: { id: true, ownerDecision: true, clinicalReviewRequired: true },
    });

    return NextResponse.json({
      ok: true,
      change: updated,
      // Said back rather than blocked. Whether a clinical provision may change
      // is the committee's judgement, not this route's -- but accepting one
      // without noticing the flag is the thing to avoid.
      notice: updated.clinicalReviewRequired
        && (updated.ownerDecision === 'ACCEPTED' || updated.ownerDecision === 'EDITED')
        ? 'This change is flagged as touching a clinical provision. It should be '
          + 'confirmed by a consultant anaesthetist or surgeon before the policy goes '
          + 'to Management.'
        : null,
    });
  } catch (err) {
    console.error('[policy/changes] PATCH failed', err);
    return NextResponse.json({ error: 'Could not record that decision' }, { status: 500 });
  }
}
