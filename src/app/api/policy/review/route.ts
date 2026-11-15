/**
 * One committee member's review: read it, and save it a piece at a time.
 *
 * WHY A REFUSAL IS HTTP 200. A reviewer who opens a link that has expired, or
 * that somebody withdrew, needs to be told which of those happened in words.
 * Answering 404 gives the page nothing to say and the browser's own error
 * instead, which is how "the link does not work" becomes a phone call to the
 * Chairman. The patient feedback invite settled this already
 * (src/app/api/feedback/invite/route.ts) and this follows it: 200 with
 * `{ ok: false, problem, message }`.
 *
 * WHY POST EXISTS AND DOES THE SAME AS PATCH. navigator.sendBeacon can only
 * POST. The reviewer page flushes the step cursor on `visibilitychange` -- a
 * member switching to WhatsApp to check a folder number, on a handset that may
 * then discard the tab -- and a beacon is the only request that survives that.
 * The surgery draft route has the same alias for the same reason.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import {
  loadReviewState,
  recordRevision,
  resolveReviewer,
  type ReviewerContext,
} from '@/lib/policy/server';
import { buildPolicySteps, isKnownStepId, type SectionLike } from '@/lib/policy/steps';

export const dynamic = 'force-dynamic';

/** Long enough for a considered paragraph, short enough to refuse an upload. */
const MAX_TEXT = 4000;
const text = z.string().max(MAX_TEXT).trim().nullish();

const sectionSave = z.object({
  kind: z.literal('section'),
  sectionId: z.string().min(1),
  stance: z.enum(['AGREE', 'AGREE_WITH_CHANGES', 'DISAGREE', 'NOT_MY_AREA']),
  comment: text,
  proposedWording: text,
  concernType: z
    .enum(['PATIENT_SAFETY', 'FEASIBILITY', 'RESOURCES', 'LEGAL_OR_DISCIPLINARY', 'CLARITY', 'OTHER'])
    .nullish(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).nullish(),
});

const itemSave = z.object({
  kind: z.literal('item'),
  decisionItemId: z.string().min(1),
  acceptsCurrent: z.boolean(),
  proposedValue: z.string().max(400).trim().nullish(),
  reason: text,
});

const generalSave = z.object({
  kind: z.literal('general'),
  overallSupport: z.number().int().min(1).max(5).nullish(),
  concern1: text,
  concern2: text,
  concern3: text,
  barriers: text,
  resourcesNeeded: text,
  otherComments: text,
});

const cursorSave = z.object({
  kind: z.literal('cursor'),
  stepId: z.string().min(1).max(200),
});

const saveSchema = z.discriminatedUnion('kind', [
  sectionSave,
  itemSave,
  generalSave,
  cursorSave,
]);

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim();
  return t === '' ? null : t.slice(0, MAX_TEXT);
};

async function reviewerFromRequest(request: NextRequest) {
  const url = new URL(request.url);
  const token = url.searchParams.get('t');
  const roundId = url.searchParams.get('round');

  // A session is only looked up for the general link. A token reviewer has no
  // account, and asking for a session we do not need would make the route fail
  // differently depending on whether a stray cookie happened to be present.
  const user = token
    ? null
    : (await getServerSession(authOptions))?.user ?? null;

  return resolveReviewer({
    token,
    roundId,
    user: user ? { id: user.id, name: user.name, role: user.role } : null,
  });
}

export async function GET(request: NextRequest) {
  try {
    const who = await reviewerFromRequest(request);
    if (!who.ok) {
      return NextResponse.json(who, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    }

    const state = await loadReviewState(who);
    return NextResponse.json(
      { ok: true, ...state },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[policy/review] GET failed', error);
    return NextResponse.json({ error: 'Could not load the review' }, { status: 500 });
  }
}

/**
 * Save one piece of the review.
 *
 * Every write is an upsert keyed on the resolved invitation, so a flaky
 * connection retrying the same save cannot create a second answer to one
 * section — and nothing the client sends can reach another reviewer's row.
 */
async function save(request: NextRequest, cursorOnly: boolean) {
  const who = await reviewerFromRequest(request);
  if (!who.ok) {
    // The round has closed, or the link was withdrawn, mid-review. Said in
    // words rather than as a bare refusal, because the member is mid-sentence.
    return NextResponse.json(who, { status: 200 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 });
  }

  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Could not read that change', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const change = parsed.data;

  if (cursorOnly && change.kind !== 'cursor') {
    // The beacon endpoint exists for the cursor and nothing else. Letting it
    // carry answers too would mean a request with no response the client ever
    // reads could silently fail to record somebody's work.
    return NextResponse.json({ error: 'This endpoint saves the step only' }, { status: 400 });
  }

  switch (change.kind) {
    case 'cursor':
      return saveCursor(who, change.stepId);
    case 'section':
      return saveSection(who, change);
    case 'item':
      return saveItem(who, change);
    case 'general':
    default:
      return saveGeneral(who, change);
  }
}

async function saveCursor(who: ReviewerContext, stepId: string) {
  const round = await prisma.policyReviewRound.findUniqueOrThrow({
    where: { id: who.roundId },
    select: { documentId: true },
  });
  const sections = await prisma.policySection.findMany({
    where: { documentId: round.documentId },
    select: { id: true, number: true, title: true, parentId: true, order: true },
  });

  // Validated against THIS ROUND's own steps, not a hardcoded list. The
  // booking draft route checks its step against a fixed array that has drifted
  // out of order with the page's, which is how a resumed booking lands on the
  // wrong step. A cursor here can never name a step that does not exist.
  if (!isKnownStepId(buildPolicySteps(sections as SectionLike[]), stepId)) {
    return NextResponse.json({ error: 'No such step in this review' }, { status: 400 });
  }

  const now = new Date();
  await prisma.policyParticipation.upsert({
    where: { invitationId: who.invitationId },
    create: {
      roundId: who.roundId,
      invitationId: who.invitationId,
      currentStepId: stepId,
      lastSeenAt: now,
    },
    update: { currentStepId: stepId, lastSeenAt: now },
  });

  return NextResponse.json({ ok: true, savedAt: now.toISOString() });
}

async function saveSection(who: ReviewerContext, change: z.infer<typeof sectionSave>) {
  const section = await prisma.policySection.findUnique({
    where: { id: change.sectionId },
    select: { id: true, documentId: true },
  });
  const round = await prisma.policyReviewRound.findUniqueOrThrow({
    where: { id: who.roundId },
    select: { documentId: true },
  });
  if (!section || section.documentId !== round.documentId) {
    return NextResponse.json({ error: 'That section is not in this review' }, { status: 400 });
  }

  // A concern and a priority only mean anything where somebody is asking for a
  // change. Cleared otherwise, server-side as well as in the form: a row
  // claiming a HIGH patient-safety concern on a section marked "not my area"
  // would be counted as a safety objection by the analysis.
  const wantsChange = change.stance === 'AGREE_WITH_CHANGES' || change.stance === 'DISAGREE';

  const existing = await prisma.policySectionResponse.findUnique({
    where: {
      roundId_invitationId_sectionId: {
        roundId: who.roundId,
        invitationId: who.invitationId,
        sectionId: change.sectionId,
      },
    },
  });

  if (existing) {
    await recordRevision({
      kind: 'SECTION',
      responseId: existing.id,
      roundId: who.roundId,
      invitationId: who.invitationId,
      snapshot: existing,
      submittedAt: existing.submittedAt,
    });
  }

  const data = {
    stance: change.stance,
    comment: clean(change.comment),
    proposedWording: clean(change.proposedWording),
    concernType: wantsChange ? change.concernType ?? null : null,
    priority: wantsChange ? change.priority ?? null : null,
  };

  const row = await prisma.policySectionResponse.upsert({
    where: {
      roundId_invitationId_sectionId: {
        roundId: who.roundId,
        invitationId: who.invitationId,
        sectionId: change.sectionId,
      },
    },
    create: {
      roundId: who.roundId,
      invitationId: who.invitationId,
      sectionId: change.sectionId,
      ...data,
      // Mirrors whatever the reviewer has already done. A section answered
      // after they submitted is submitted; one answered before is still draft.
      submittedAt: who.submittedAt,
    },
    update: data,
    select: { id: true },
  });

  await touch(who);
  return NextResponse.json({ ok: true, id: row.id, savedAt: new Date().toISOString() });
}

async function saveItem(who: ReviewerContext, change: z.infer<typeof itemSave>) {
  const item = await prisma.policyDecisionItem.findUnique({
    where: { id: change.decisionItemId },
    select: { id: true, section: { select: { documentId: true } } },
  });
  const round = await prisma.policyReviewRound.findUniqueOrThrow({
    where: { id: who.roundId },
    select: { documentId: true },
  });
  if (!item || item.section.documentId !== round.documentId) {
    return NextResponse.json({ error: 'That item is not in this review' }, { status: 400 });
  }

  const key = {
    roundId_invitationId_decisionItemId: {
      roundId: who.roundId,
      invitationId: who.invitationId,
      decisionItemId: change.decisionItemId,
    },
  };

  const existing = await prisma.policyDecisionItemResponse.findUnique({ where: key });
  if (existing) {
    await recordRevision({
      kind: 'DECISION_ITEM',
      responseId: existing.id,
      roundId: who.roundId,
      invitationId: who.invitationId,
      snapshot: existing,
      submittedAt: existing.submittedAt,
    });
  }

  // Accepting the current value and also proposing another is contradictory.
  // The proposal is dropped rather than the acceptance, because "accept" is
  // the explicit button and a stale proposal is usually a leftover.
  const data = {
    acceptsCurrent: change.acceptsCurrent,
    proposedValue: change.acceptsCurrent ? null : clean(change.proposedValue),
    reason: clean(change.reason),
  };

  const row = await prisma.policyDecisionItemResponse.upsert({
    where: key,
    create: {
      roundId: who.roundId,
      invitationId: who.invitationId,
      decisionItemId: change.decisionItemId,
      ...data,
      submittedAt: who.submittedAt,
    },
    update: data,
    select: { id: true },
  });

  await touch(who);
  return NextResponse.json({ ok: true, id: row.id, savedAt: new Date().toISOString() });
}

async function saveGeneral(who: ReviewerContext, change: z.infer<typeof generalSave>) {
  const existing = await prisma.policyGeneralResponse.findUnique({
    where: { invitationId: who.invitationId },
  });
  if (existing) {
    await recordRevision({
      kind: 'GENERAL',
      responseId: existing.id,
      roundId: who.roundId,
      invitationId: who.invitationId,
      snapshot: existing,
      submittedAt: existing.submittedAt,
    });
  }

  const data = {
    overallSupport: change.overallSupport ?? null,
    concern1: clean(change.concern1),
    concern2: clean(change.concern2),
    concern3: clean(change.concern3),
    barriers: clean(change.barriers),
    resourcesNeeded: clean(change.resourcesNeeded),
    otherComments: clean(change.otherComments),
  };

  const row = await prisma.policyGeneralResponse.upsert({
    where: { invitationId: who.invitationId },
    create: {
      roundId: who.roundId,
      invitationId: who.invitationId,
      ...data,
      submittedAt: who.submittedAt,
    },
    update: data,
    select: { id: true },
  });

  await touch(who);
  return NextResponse.json({ ok: true, id: row.id, savedAt: new Date().toISOString() });
}

/** Keep "last seen" current, so the dashboard can show who is mid-review. */
async function touch(who: ReviewerContext) {
  const now = new Date();
  await prisma.policyParticipation.upsert({
    where: { invitationId: who.invitationId },
    create: { roundId: who.roundId, invitationId: who.invitationId, lastSeenAt: now },
    update: { lastSeenAt: now },
  });
}

export async function PATCH(request: NextRequest) {
  try {
    return await save(request, false);
  } catch (error) {
    console.error('[policy/review] PATCH failed', error);
    return NextResponse.json({ error: 'Could not save that change' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    return await save(request, true);
  } catch (error) {
    console.error('[policy/review] POST (beacon) failed', error);
    return NextResponse.json({ error: 'Could not save the step' }, { status: 500 });
  }
}
