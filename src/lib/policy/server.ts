// ============================================================
// Who is asking, and what have they already said
// ------------------------------------------------------------
// Two kinds of reviewer reach the same page:
//
//   a TOKEN reviewer, who opened a personal link from the committee's WhatsApp
//   group and has no ORM account -- which is most of this committee, because
//   they are heads of department;
//
//   a SIGNED-IN reviewer, who used the general link posted in the group.
//
// They are reconciled here, once, into a single PolicyInvitation row. Every
// response in this module hangs off an invitation, so there is exactly one way
// to resume and exactly one definition of "one response per reviewer". Doing it
// anywhere else would mean two identity paths with two resume behaviours, and
// the second one would be the broken one.
//
// NOTHING HERE TRUSTS A SESSION FOR SCOPE. A token names an invitation; a
// session names a user. Neither is allowed to reach another reviewer's answers,
// because every query below is keyed on the resolved invitation id rather than
// on anything the client sent.
// ============================================================

import crypto from 'crypto';

import prisma from '@/lib/prisma';

import {
  hashPolicyInviteToken,
  inviteExpiryFor,
  policyInviteState,
  INVITE_PROBLEM_MESSAGE,
  type InviteProblem,
} from './invite';
import {
  buildPolicySteps,
  policyProgress,
  resolveCursor,
  type PolicyProgress,
  type PolicyStep,
  type ResolvedCursor,
  type SectionLike,
} from './steps';

export interface SessionUserLike {
  id: string;
  name?: string | null;
  role?: string | null;
}

export type ReviewerRefusal =
  | { ok: false; problem: InviteProblem | 'SIGN_IN_REQUIRED'; message: string };

export interface ReviewerContext {
  ok: true;
  roundId: string;
  invitationId: string;
  /** True where they arrived on the general link rather than a personal one. */
  selfEnrolled: boolean;
  reviewerName: string;
  submittedAt: Date | null;
}

const SIGN_IN_MESSAGE =
  'This review link needs you to sign in to ORM first, so that your response '
  + 'is recorded under your own name. Sign in and open the link again.';

/**
 * Resolve the reviewer behind a token or a general link.
 *
 * A token is looked up BY HASH -- the token itself is never stored, so a
 * database read cannot open somebody else's review.
 */
export async function resolveReviewer(opts: {
  token?: string | null;
  roundId?: string | null;
  user?: SessionUserLike | null;
  now?: Date;
}): Promise<ReviewerContext | ReviewerRefusal> {
  const now = opts.now ?? new Date();

  if (opts.token) {
    const invitation = await prisma.policyInvitation.findUnique({
      where: { tokenHash: hashPolicyInviteToken(opts.token) },
      include: { round: true },
    });

    const state = policyInviteState(invitation, invitation?.round ?? null, now);
    if (!state.ok) return { ok: false, problem: state.problem, message: state.message };

    const row = invitation!;
    if (!row.openedAt) {
      // First open. Recorded here rather than on the client, so the
      // participation figures count people who actually got in.
      await prisma.policyInvitation.update({
        where: { id: row.id },
        data: { openedAt: now },
      });
    }

    return {
      ok: true,
      roundId: row.roundId,
      invitationId: row.id,
      selfEnrolled: row.selfEnrolled,
      reviewerName: row.inviteeName,
      submittedAt: row.submittedAt,
    };
  }

  // Neither a token nor a round: this request names no review at all. That is
  // NOT the same thing as needing to sign in, and pairing the NOT_FOUND code
  // with a "please sign in" message -- as this did -- tells somebody who
  // part-copied a link to go and do something that will not help.
  if (!opts.roundId) {
    return {
      ok: false,
      problem: 'NOT_FOUND',
      message: INVITE_PROBLEM_MESSAGE.NOT_FOUND,
    };
  }

  if (!opts.user?.id) {
    return { ok: false, problem: 'SIGN_IN_REQUIRED', message: SIGN_IN_MESSAGE };
  }

  const round = await prisma.policyReviewRound.findUnique({
    where: { id: opts.roundId },
  });
  if (!round) {
    const refusal = policyInviteState(null, null, now);
    return refusal.ok
      ? { ok: false, problem: 'NOT_FOUND', message: SIGN_IN_MESSAGE }
      : { ok: false, problem: refusal.problem, message: refusal.message };
  }

  const existing = await prisma.policyInvitation.findUnique({
    where: { roundId_userId: { roundId: round.id, userId: opts.user.id } },
  });

  if (existing) {
    const state = policyInviteState(existing, round, now);
    if (!state.ok) return { ok: false, problem: state.problem, message: state.message };
    if (!existing.openedAt) {
      await prisma.policyInvitation.update({
        where: { id: existing.id },
        data: { openedAt: now },
      });
    }
    return {
      ok: true,
      roundId: round.id,
      invitationId: existing.id,
      selfEnrolled: existing.selfEnrolled,
      reviewerName: existing.inviteeName,
      submittedAt: existing.submittedAt,
    };
  }

  // Nobody invited them by name, but the general link was posted in the
  // committee's group on purpose. Check the round would accept a personal link
  // before creating one, so that a round not yet open refuses both kinds of
  // reviewer with the same words.
  const gate = policyInviteState({ revokedAt: null, expiresAt: round.closesAt }, round, now);
  if (!gate.ok) return { ok: false, problem: gate.problem, message: gate.message };

  const created = await prisma.policyInvitation.create({
    data: {
      roundId: round.id,
      userId: opts.user.id,
      inviteeName: opts.user.name?.trim() || 'ORM user',
      inviteeRole: opts.user.role ?? null,
      selfEnrolled: true,
      // A self-enrolled reviewer has no personal link, so there is no token to
      // hash. A random value keeps the unique constraint honest and, more
      // usefully, guarantees no token can ever resolve to this row.
      tokenHash: crypto.randomBytes(32).toString('hex'),
      expiresAt: inviteExpiryFor(round.closesAt),
      openedAt: now,
      sentAt: now,
    },
  });

  return {
    ok: true,
    roundId: round.id,
    invitationId: created.id,
    selfEnrolled: true,
    reviewerName: created.inviteeName,
    submittedAt: null,
  };
}

export interface ReviewSection {
  id: string;
  number: string | null;
  title: string;
  parentId: string | null;
  order: number;
  isAppendix: boolean;
  body: string;
  decisionItems: Array<{
    id: string;
    placeholder: string;
    surroundingSentence: string;
    type: string;
    currentValue: string;
    options: unknown;
  }>;
}

export interface ReviewState {
  round: {
    id: string;
    title: string | null;
    version: string;
    closesAt: string;
    status: string;
  };
  document: { title: string; version: string } | null;
  reviewer: {
    name: string;
    submittedAt: string | null;
    selfEnrolled: boolean;
    /**
     * Opaque, and NOT a credential — the personal token is still required to
     * use it. Sent so the page can scope its local unsent-keystroke draft to
     * this reviewer: ten staff share eight handsets here, and a draft must
     * never be restored to whoever opens the browser next.
     */
    invitationId: string;
  };
  sections: ReviewSection[];
  steps: PolicyStep[];
  cursor: ResolvedCursor;
  progress: PolicyProgress;
  sectionResponses: Array<{
    sectionId: string;
    stance: string;
    comment: string | null;
    proposedWording: string | null;
    concernType: string | null;
    priority: string | null;
  }>;
  itemResponses: Array<{
    decisionItemId: string;
    acceptsCurrent: boolean;
    proposedValue: string | null;
    reason: string | null;
  }>;
  general: {
    overallSupport: number | null;
    concern1: string | null;
    concern2: string | null;
    concern3: string | null;
    barriers: string | null;
    resourcesNeeded: string | null;
    otherComments: string | null;
  } | null;
}

/**
 * Everything the reviewer page needs, in one read.
 *
 * One request rather than four, because this page is opened on a phone over
 * hospital mobile data. Four round trips on a bad connection is four chances to
 * show a half-loaded review.
 */
export async function loadReviewState(ctx: ReviewerContext): Promise<ReviewState> {
  const round = await prisma.policyReviewRound.findUniqueOrThrow({
    where: { id: ctx.roundId },
    include: { document: { select: { title: true, version: true } } },
  });

  const sections = await prisma.policySection.findMany({
    where: { documentId: round.documentId },
    orderBy: [{ order: 'asc' }, { number: 'asc' }],
    include: {
      decisionItems: {
        where: { dismissed: false },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          placeholder: true,
          surroundingSentence: true,
          type: true,
          currentValue: true,
          options: true,
        },
      },
    },
  });

  const [sectionResponses, itemResponses, general, participation] = await Promise.all([
    prisma.policySectionResponse.findMany({
      where: { roundId: ctx.roundId, invitationId: ctx.invitationId },
      select: {
        sectionId: true,
        stance: true,
        comment: true,
        proposedWording: true,
        concernType: true,
        priority: true,
      },
    }),
    prisma.policyDecisionItemResponse.findMany({
      where: { roundId: ctx.roundId, invitationId: ctx.invitationId },
      select: {
        decisionItemId: true,
        acceptsCurrent: true,
        proposedValue: true,
        reason: true,
      },
    }),
    prisma.policyGeneralResponse.findUnique({
      where: { invitationId: ctx.invitationId },
      select: {
        overallSupport: true,
        concern1: true,
        concern2: true,
        concern3: true,
        barriers: true,
        resourcesNeeded: true,
        otherComments: true,
      },
    }),
    prisma.policyParticipation.findUnique({
      where: { invitationId: ctx.invitationId },
      select: { currentStepId: true },
    }),
  ]);

  const steps = buildPolicySteps(sections as SectionLike[]);
  const answered = new Set(sectionResponses.map((r) => r.sectionId));

  return {
    round: {
      id: round.id,
      title: round.title,
      version: round.version,
      closesAt: round.closesAt.toISOString(),
      status: round.status,
    },
    document: round.document
      ? { title: round.document.title, version: round.document.version }
      : null,
    reviewer: {
      name: ctx.reviewerName,
      submittedAt: ctx.submittedAt ? ctx.submittedAt.toISOString() : null,
      selfEnrolled: ctx.selfEnrolled,
      invitationId: ctx.invitationId,
    },
    sections: sections.map((s) => ({
      id: s.id,
      number: s.number,
      title: s.title,
      parentId: s.parentId,
      order: s.order,
      isAppendix: s.isAppendix,
      body: s.body,
      decisionItems: s.decisionItems,
    })),
    steps,
    cursor: resolveCursor({
      steps,
      storedStepId: participation?.currentStepId ?? null,
      answered,
    }),
    progress: policyProgress(steps, answered),
    sectionResponses,
    itemResponses,
    general,
  };
}

/**
 * Keep the previous value of a response that is being edited AFTER submission.
 *
 * The round stays open for editing until the deadline, which is right. But the
 * committee's record of what somebody said must not be silently rewritten,
 * particularly once an analysis has cited it. So an edit before submitting is
 * just typing, and an edit afterwards leaves a trace.
 */
export async function recordRevision(opts: {
  kind: 'SECTION' | 'DECISION_ITEM' | 'GENERAL';
  responseId: string;
  roundId: string;
  invitationId: string;
  snapshot: unknown;
  submittedAt: Date | null;
}): Promise<void> {
  if (!opts.submittedAt) return;
  await prisma.policyResponseRevision.create({
    data: {
      kind: opts.kind,
      responseId: opts.responseId,
      roundId: opts.roundId,
      invitationId: opts.invitationId,
      snapshot: opts.snapshot as never,
    },
  });
}

/** Has this reviewer answered every section? Used by the submit gate. */
export async function answeredEverything(ctx: ReviewerContext): Promise<{
  complete: boolean;
  progress: PolicyProgress;
}> {
  const round = await prisma.policyReviewRound.findUniqueOrThrow({
    where: { id: ctx.roundId },
    select: { documentId: true },
  });
  const sections = await prisma.policySection.findMany({
    where: { documentId: round.documentId },
    select: { id: true, number: true, title: true, parentId: true, order: true },
  });
  const answered = new Set(
    (await prisma.policySectionResponse.findMany({
      where: { roundId: ctx.roundId, invitationId: ctx.invitationId },
      select: { sectionId: true },
    })).map((r) => r.sectionId),
  );
  const progress = policyProgress(buildPolicySteps(sections as SectionLike[]), answered);
  return { complete: progress.done === progress.total && progress.total > 0, progress };
}
