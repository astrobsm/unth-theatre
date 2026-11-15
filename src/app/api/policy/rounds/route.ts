/**
 * Review rounds: list them, and open one.
 *
 * A round is created in DRAFT and opened explicitly. The gap matters: between
 * the two the owner invites people and checks the links, and an invitation
 * opened before the round is told to keep the message rather than shown an
 * empty review (see policyInviteState).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { requirePolicyOwner, requirePolicyViewer } from '@/lib/policy/guard';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  documentId: z.string().min(1),
  title: z.string().max(300).nullish(),
  closesAt: z.string().datetime({ offset: true }),
  opensAt: z.string().datetime({ offset: true }).nullish(),
  quorumPercent: z.number().int().min(0).max(100).nullish(),
});

export async function GET() {
  const { error, actor } = await requirePolicyViewer();
  if (error || !actor) return error;

  const rounds = await prisma.policyReviewRound.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      title: true,
      version: true,
      status: true,
      opensAt: true,
      closesAt: true,
      resultsVisibility: true,
      createdByName: true,
      createdAt: true,
      document: { select: { id: true, title: true, version: true } },
      _count: { select: { invitations: true, sectionResponses: true } },
    },
  });

  return NextResponse.json({ rounds }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const { error, actor } = await requirePolicyOwner();
  if (error || !actor) return error;

  try {
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Could not read that round', detail: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const input = parsed.data;

    const document = await prisma.policyDocument.findUnique({
      where: { id: input.documentId },
      select: { id: true, version: true, _count: { select: { sections: true } } },
    });
    if (!document) {
      return NextResponse.json({ error: 'No such policy document' }, { status: 404 });
    }
    if (document._count.sections === 0) {
      return NextResponse.json(
        { error: 'That document has no sections, so there would be nothing to review.' },
        { status: 400 },
      );
    }

    const closesAt = new Date(input.closesAt);
    if (closesAt.getTime() <= Date.now()) {
      // A round that closes in the past accepts nothing and refuses every
      // reviewer with "the review has closed" — which reads as a system fault.
      return NextResponse.json(
        { error: 'The closing date is in the past. Nobody would be able to answer.' },
        { status: 400 },
      );
    }

    const round = await prisma.policyReviewRound.create({
      data: {
        documentId: document.id,
        // The document's version is COPIED, not referenced. The draft may move
        // on; what these people answered about must not.
        version: document.version,
        title: input.title?.trim() || null,
        opensAt: input.opensAt ? new Date(input.opensAt) : null,
        closesAt,
        quorumPercent: input.quorumPercent ?? null,
        status: 'DRAFT',
        createdById: actor.id,
        createdByName: actor.name,
      },
      select: { id: true, version: true, closesAt: true, status: true },
    });

    return NextResponse.json({ ok: true, round });
  } catch (err) {
    console.error('[policy/rounds] POST failed', err);
    return NextResponse.json({ error: 'Could not create the round' }, { status: 500 });
  }
}
