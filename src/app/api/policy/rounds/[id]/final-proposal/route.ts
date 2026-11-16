/**
 * Generate the revised policy from the accepted changes, and read it back.
 *
 * ACCEPTED CHANGES ONLY. A change still PENDING, rejected, or sent to the
 * committee meeting does not appear in this document, and the change log says
 * what went in and why.
 *
 * AN ACCEPTED CHANGE THAT COULD NOT BE APPLIED IS REPORTED, not swallowed. A
 * wording change names the text it replaces; if that text has moved the
 * substitution silently does nothing, and the Chairman would carry a document
 * to Management believing it contained a change it does not. The response
 * carries the unapplied count so the screen can say so.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { requirePolicyOwner, requirePolicyViewer } from '@/lib/policy/guard';
import { buildFinalProposal, type AcceptedChange, type SettledValue } from '@/lib/policy/finalProposal';

export const dynamic = 'force-dynamic';

const postSchema = z.object({
  version: z.string().min(1).max(40),
  approve: z.boolean().optional(),
});

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { error, actor } = await requirePolicyViewer();
  if (error || !actor) return error;

  const proposals = await prisma.policyFinalProposal.findMany({
    where: { roundId: params.id },
    orderBy: { generatedAt: 'desc' },
    select: {
      id: true,
      version: true,
      body: true,
      changeLog: true,
      generatedAt: true,
      generatedByName: true,
      approvedByName: true,
      approvedAt: true,
    },
  });

  return NextResponse.json({ proposals }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { error, actor } = await requirePolicyOwner();
  if (error || !actor) return error;

  try {
    const parsed = postSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Which version is this?' }, { status: 400 });
    }

    const round = await prisma.policyReviewRound.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        documentId: true,
        document: { select: { title: true } },
      },
    });
    if (!round) return NextResponse.json({ error: 'No such round' }, { status: 404 });

    const sections = await prisma.policySection.findMany({
      where: { documentId: round.documentId },
      orderBy: [{ order: 'asc' }],
      select: {
        id: true,
        number: true,
        title: true,
        parentId: true,
        order: true,
        body: true,
        isAppendix: true,
      },
    });

    const decided = await prisma.policyProposedChange.findMany({
      where: {
        analysisRun: { roundId: round.id },
        ownerDecision: { in: ['ACCEPTED', 'EDITED'] },
      },
      orderBy: { decidedAt: 'asc' },
      select: {
        id: true,
        sectionId: true,
        type: true,
        currentText: true,
        proposedText: true,
        editedText: true,
        rationale: true,
        supportingResponseIds: true,
        clinicalReviewRequired: true,
      },
    });

    // A settled open value is stored as an accepted VALUE change whose
    // currentText is the placeholder. Split out here so the generator can
    // substitute placeholders before the wording changes run, since a wording
    // change may quote a sentence that still contains one.
    const placeholders = await prisma.policyDecisionItem.findMany({
      where: { section: { documentId: round.documentId } },
      select: { id: true, sectionId: true, placeholder: true },
    });
    const placeholderSet = new Map(
      placeholders.map((p) => [`${p.sectionId}::${p.placeholder}`, p]),
    );

    const settledValues: SettledValue[] = [];
    const changes: AcceptedChange[] = [];

    for (const row of decided) {
      const finalText = row.editedText?.trim() || row.proposedText;
      const key = `${row.sectionId}::${row.currentText}`;
      const asPlaceholder = row.type === 'VALUE' && row.currentText
        ? placeholderSet.get(key)
        : undefined;

      if (asPlaceholder) {
        settledValues.push({
          decisionItemId: asPlaceholder.id,
          sectionId: asPlaceholder.sectionId,
          placeholder: asPlaceholder.placeholder,
          finalValue: finalText,
          rationale: row.rationale,
        });
        continue;
      }

      changes.push({
        id: row.id,
        sectionId: row.sectionId,
        type: row.type,
        currentText: row.currentText,
        finalText,
        rationale: row.rationale,
        supportingResponseIds: Array.isArray(row.supportingResponseIds)
          ? (row.supportingResponseIds as string[])
          : [],
        clinicalReviewRequired: row.clinicalReviewRequired,
      });
    }

    if (settledValues.length === 0 && changes.length === 0) {
      return NextResponse.json(
        {
          error:
            'Nothing has been accepted yet, so the revised policy would be identical to '
            + 'the draft. Accept at least one change, or settle one open value.',
        },
        { status: 400 },
      );
    }

    const built = buildFinalProposal({
      policyTitle: round.document?.title ?? 'Theatre policy',
      version: parsed.data.version.trim(),
      sections,
      changes,
      settledValues,
    });

    const proposal = await prisma.policyFinalProposal.upsert({
      where: {
        roundId_version: { roundId: round.id, version: parsed.data.version.trim() },
      },
      create: {
        roundId: round.id,
        version: parsed.data.version.trim(),
        body: built.body,
        changeLog: built.changeLog as never,
        generatedById: actor.id,
        generatedByName: actor.name,
        ...(parsed.data.approve
          ? { approvedById: actor.id, approvedByName: actor.name, approvedAt: new Date() }
          : {}),
      },
      update: {
        body: built.body,
        changeLog: built.changeLog as never,
        generatedAt: new Date(),
        generatedById: actor.id,
        generatedByName: actor.name,
        ...(parsed.data.approve
          ? { approvedById: actor.id, approvedByName: actor.name, approvedAt: new Date() }
          : {}),
      },
      select: { id: true, version: true, generatedAt: true },
    });

    if (parsed.data.approve) {
      await prisma.policyReviewRound.update({
        where: { id: round.id },
        data: { status: 'FINALISED' },
      });
      await prisma.policyDocument.update({
        where: { id: round.documentId },
        data: { status: 'FINAL' },
      });
    }

    return NextResponse.json({
      ok: true,
      proposal,
      applied: built.applied,
      unapplied: built.unapplied,
      changeLog: built.changeLog,
      notice: built.unapplied > 0
        ? `${built.unapplied} accepted change(s) could NOT be applied automatically — the `
          + 'wording they replace is no longer in the section. They are listed in the '
          + 'change log and must be put in by hand before this goes to Management.'
        : null,
    });
  } catch (err) {
    console.error('[policy/final-proposal] POST failed', err);
    return NextResponse.json({ error: 'Could not generate the revised policy' }, { status: 500 });
  }
}
