/**
 * One round: everything the Chairman's dashboard shows, and the controls.
 *
 * Every figure here is COMPUTED from the response rows on each request (see
 * src/lib/policy/owner.ts). Nothing is cached and nothing is a summary, because
 * the AI analysis later reports its own stance counts and the server refuses a
 * run whose counts disagree with these. A cached figure would leave nothing to
 * check the model against.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { requirePolicyOwner, requirePolicyViewer } from '@/lib/policy/guard';
import { attributionFor, canOwnPolicyReview } from '@/lib/policy/access';
import {
  decisionItemTalliesFor,
  flaggedCommentsFor,
  participationFor,
  sectionAgreementFor,
} from '@/lib/policy/owner';
import { policyGeneralUrl } from '@/lib/policy/invite';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  action: z.enum(['open', 'close', 'reopen']).optional(),
  resultsVisibility: z
    .enum(['OWNER_ONLY', 'RELEASED_ATTRIBUTED', 'RELEASED_BY_ROLE'])
    .optional(),
  closesAt: z.string().datetime({ offset: true }).optional(),
  title: z.string().max(300).nullish(),
});

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { error, actor } = await requirePolicyViewer();
  if (error || !actor) return error;

  try {
    const round = await prisma.policyReviewRound.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        title: true,
        version: true,
        status: true,
        opensAt: true,
        closesAt: true,
        closedAt: true,
        resultsVisibility: true,
        quorumPercent: true,
        createdByName: true,
        remindedAt48h: true,
        remindedAt12h: true,
        document: { select: { id: true, title: true, version: true } },
      },
    });
    if (!round) return NextResponse.json({ error: 'No such round' }, { status: 404 });

    const isOwner = canOwnPolicyReview(actor.role, actor.extraModules);
    const attribution = attributionFor({
      role: actor.role,
      extraModules: actor.extraModules,
      visibility: round.resultsVisibility,
    });

    const [participation, sections, decisionItems, flagged] = await Promise.all([
      participationFor(round.id),
      sectionAgreementFor(round.id),
      decisionItemTalliesFor(round.id),
      // An observer who may not see individual responses is not sent them at
      // all, rather than being sent them and trusted to hide them.
      attribution === 'none'
        ? Promise.resolve([])
        : flaggedCommentsFor({
          roundId: round.id,
          role: actor.role,
          extraModules: actor.extraModules,
          visibility: round.resultsVisibility,
        }),
    ]);

    const quorumMet = round.quorumPercent == null
      ? null
      : participation.invited > 0
        && (participation.submitted / participation.invited) * 100 >= round.quorumPercent;

    return NextResponse.json(
      {
        round,
        viewer: { who: actor.who, isOwner, attribution },
        generalLink: isOwner ? policyGeneralUrl(round.id) : null,
        participation,
        quorumMet,
        sections,
        decisionItems,
        flagged,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('[policy/rounds/:id] GET failed', err);
    return NextResponse.json({ error: 'Could not load the round' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { error, actor } = await requirePolicyOwner();
  if (error || !actor) return error;

  try {
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Could not read that change' }, { status: 400 });
    }
    const input = parsed.data;

    const round = await prisma.policyReviewRound.findUnique({
      where: { id: params.id },
      select: { id: true, status: true, closesAt: true, documentId: true },
    });
    if (!round) return NextResponse.json({ error: 'No such round' }, { status: 404 });

    const data: Record<string, unknown> = {};

    if (input.title !== undefined) data.title = input.title?.trim() || null;
    if (input.resultsVisibility) data.resultsVisibility = input.resultsVisibility;

    if (input.closesAt) {
      const closesAt = new Date(input.closesAt);
      if (closesAt.getTime() <= Date.now() && round.status === 'OPEN') {
        return NextResponse.json(
          {
            error:
              'That closing time has already passed, which would shut the review immediately. '
              + 'Use Close if that is what you want.',
          },
          { status: 400 },
        );
      }
      data.closesAt = closesAt;
      // Personal links expire with the round, so moving the deadline has to
      // move them too or every member is refused as EXPIRED.
      await prisma.policyInvitation.updateMany({
        where: { roundId: round.id },
        data: { expiresAt: closesAt },
      });
    }

    switch (input.action) {
      case 'open': {
        if (round.status !== 'DRAFT' && round.status !== 'CLOSED') {
          return NextResponse.json({ error: 'That round is already open' }, { status: 409 });
        }
        const sections = await prisma.policySection.count({
          where: { documentId: round.documentId },
        });
        if (sections === 0) {
          return NextResponse.json(
            { error: 'This document has no sections, so there is nothing to review.' },
            { status: 400 },
          );
        }
        data.status = 'OPEN';
        data.opensAt = new Date();
        data.closedAt = null;
        break;
      }
      case 'close':
        data.status = 'CLOSED';
        data.closedAt = new Date();
        break;
      case 'reopen':
        // Reopening after the deadline needs a new deadline, or every reviewer
        // is still refused as EXPIRED and the round looks broken.
        if (!input.closesAt && round.closesAt.getTime() <= Date.now()) {
          return NextResponse.json(
            { error: 'Set a new closing date to reopen — the old one has passed.' },
            { status: 400 },
          );
        }
        data.status = 'OPEN';
        data.closedAt = null;
        break;
      default:
        break;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
    }

    const updated = await prisma.policyReviewRound.update({
      where: { id: round.id },
      data,
      select: { id: true, status: true, closesAt: true, resultsVisibility: true },
    });

    return NextResponse.json({ ok: true, round: updated });
  } catch (err) {
    console.error('[policy/rounds/:id] PATCH failed', err);
    return NextResponse.json({ error: 'Could not change the round' }, { status: 500 });
  }
}
