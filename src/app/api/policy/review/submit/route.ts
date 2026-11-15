/**
 * "I have finished" — and the receipt that says so.
 *
 * Submitting does NOT close the link. A head of department who re-reads
 * section 7 at midnight should be able to correct themselves, so the round
 * stays editable until the deadline and this route may be called again. What
 * changes on a later call is that every edit from then on leaves a row in
 * policy_response_revisions, because the committee's record of what somebody
 * said must not be silently rewritten once an analysis has cited it.
 *
 * A REVIEWER MAY SUBMIT AN INCOMPLETE REVIEW, on purpose. Members are told to
 * skip anything outside their area, and the Head of Pharmacy has nothing to say
 * about section 11. Refusing to accept their review until all twenty-two
 * sections carry a stance would force them to mark eighteen sections
 * "not my area" to be heard on the four they care about — and the likelier
 * outcome is that they close the tab. The receipt states what was answered.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { answeredEverything, resolveReviewer } from '@/lib/policy/server';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  /** Client-generated, so a submission retried on a flaky link arrives once. */
  idempotencyKey: z.string().min(8).max(200).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('t');
    const roundId = url.searchParams.get('round');
    const user = token ? null : (await getServerSession(authOptions))?.user ?? null;

    const who = await resolveReviewer({
      token,
      roundId,
      user: user ? { id: user.id, name: user.name, role: user.role } : null,
    });
    if (!who.ok) return NextResponse.json(who, { status: 200 });

    let raw: unknown = {};
    try {
      raw = await request.json();
    } catch {
      // An empty body is fine; the idempotency key is optional.
      raw = {};
    }
    const parsed = bodySchema.safeParse(raw ?? {});
    const idempotencyKey = parsed.success ? parsed.data.idempotencyKey : undefined;

    if (idempotencyKey) {
      const seen = await prisma.policyParticipation.findUnique({
        where: { idempotencyKey },
        select: { invitationId: true, submittedAt: true },
      });
      if (seen && seen.invitationId === who.invitationId && seen.submittedAt) {
        const already = await receipt(who.roundId, who.invitationId, seen.submittedAt);
        return NextResponse.json({ ok: true, ...already, repeated: true });
      }
    }

    const now = new Date();
    const firstSubmission = who.submittedAt === null;

    await prisma.$transaction([
      prisma.policyParticipation.upsert({
        where: { invitationId: who.invitationId },
        create: {
          roundId: who.roundId,
          invitationId: who.invitationId,
          submittedAt: now,
          lastSeenAt: now,
          idempotencyKey: idempotencyKey ?? null,
        },
        update: {
          submittedAt: now,
          lastSeenAt: now,
          ...(idempotencyKey ? { idempotencyKey } : {}),
        },
      }),
      prisma.policyInvitation.update({
        where: { id: who.invitationId },
        data: { submittedAt: now },
      }),
      // Stamp the answers themselves, so a draft row and a submitted row are
      // distinguishable in the analysis input. Only the unstamped ones: a
      // response submitted earlier keeps the time it was actually submitted.
      prisma.policySectionResponse.updateMany({
        where: { roundId: who.roundId, invitationId: who.invitationId, submittedAt: null },
        data: { submittedAt: now },
      }),
      prisma.policyDecisionItemResponse.updateMany({
        where: { roundId: who.roundId, invitationId: who.invitationId, submittedAt: null },
        data: { submittedAt: now },
      }),
      prisma.policyGeneralResponse.updateMany({
        where: { invitationId: who.invitationId, submittedAt: null },
        data: { submittedAt: now },
      }),
    ]);

    const result = await receipt(who.roundId, who.invitationId, now);
    return NextResponse.json({ ok: true, ...result, firstSubmission });
  } catch (error) {
    console.error('[policy/review/submit] failed', error);
    return NextResponse.json({ error: 'Could not record your submission' }, { status: 500 });
  }
}

/** What the reviewer is shown, and can screenshot, as proof they contributed. */
async function receipt(roundId: string, invitationId: string, submittedAt: Date) {
  const [sections, items, general, round, invite] = await Promise.all([
    prisma.policySectionResponse.count({ where: { roundId, invitationId } }),
    prisma.policyDecisionItemResponse.count({ where: { roundId, invitationId } }),
    prisma.policyGeneralResponse.findUnique({
      where: { invitationId },
      select: { overallSupport: true },
    }),
    prisma.policyReviewRound.findUniqueOrThrow({
      where: { id: roundId },
      select: { version: true, closesAt: true, document: { select: { title: true } } },
    }),
    prisma.policyInvitation.findUniqueOrThrow({
      where: { id: invitationId },
      select: { inviteeName: true },
    }),
  ]);

  const progress = await answeredEverything({
    ok: true,
    roundId,
    invitationId,
    selfEnrolled: false,
    reviewerName: invite.inviteeName,
    submittedAt,
  });

  return {
    submittedAt: submittedAt.toISOString(),
    reviewerName: invite.inviteeName,
    policyTitle: round.document?.title ?? null,
    version: round.version,
    closesAt: round.closesAt.toISOString(),
    sectionsAnswered: sections,
    decisionItemsAnswered: items,
    gaveOverallView: general?.overallSupport != null,
    sectionsTotal: progress.progress.sectionsTotal,
    complete: progress.complete,
    /** A short, quotable reference for a member who asks "did it reach you?" */
    reference: `PR-${round.version}-${invitationId.slice(0, 8).toUpperCase()}`,
  };
}
