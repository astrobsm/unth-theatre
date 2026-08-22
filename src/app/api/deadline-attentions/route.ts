import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { applyAction, type AttentionRecord } from '@/lib/deadlineAttention';

export const dynamic = 'force-dynamic';

/**
 * A person's missed deadlines, and what they want to say about them.
 *
 * GET  — the caller's own open items, for their dashboard.
 * POST — start / log a delay / record a resolution.
 *
 * The rule lives in lib/deadlineAttention.ts and is applied here rather than
 * reimplemented: what counts as attended to must not differ between the screen
 * a clinician reads and the sweep that refers them to audit.
 */

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as { id?: string }).id;
  if (!userId) return NextResponse.json({ items: [] });

  const items = await prisma.deadlineAttention.findMany({
    // Closed items are not somebody's business any more. Anything still in
    // audit stays visible to the person it concerns — being referred is not a
    // reason to stop seeing it.
    where: { userId, status: { in: ['OPEN', 'DELAY_LOGGED', 'IN_AUDIT'] } },
    orderBy: [{ status: 'asc' }, { deadlineAt: 'asc' }],
    take: 25,
  });

  return NextResponse.json({ items });
}

const actionSchema = z.object({
  id: z.string().min(1),
  action: z.enum(['START', 'DELAY', 'RESOLVE']),
  reason: z.string().trim().max(2000).optional(),
  resolution: z.string().trim().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as { id?: string }).id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Could not read the request.' }, { status: 400 });
  }
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' },
      { status: 400 },
    );
  }

  const existing = await prisma.deadlineAttention.findUnique({ where: { id: parsed.data.id } });
  if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  // Only the person it was addressed to may answer it. An explanation typed by
  // somebody else is not that person's account of what happened.
  if (existing.userId !== userId) {
    return NextResponse.json(
      { error: 'This item was raised with somebody else.' },
      { status: 403 },
    );
  }

  const record: AttentionRecord = {
    status: existing.status as AttentionRecord['status'],
    notifiedAt: existing.notifiedAt,
    delayReason: existing.delayReason,
    resolution: existing.resolution,
    movedToAuditAt: existing.movedToAuditAt,
  };

  const outcome = applyAction(
    record,
    parsed.data.action === 'START'
      ? { kind: 'START' }
      : parsed.data.action === 'DELAY'
        ? { kind: 'DELAY', reason: parsed.data.reason ?? '' }
        : { kind: 'RESOLVE', resolution: parsed.data.resolution ?? '' },
  );

  if (!outcome.ok || !outcome.next) {
    // A refusal here is guidance, not an error: the message says what to do.
    return NextResponse.json({ ok: false, message: outcome.message }, { status: 400 });
  }

  const now = new Date();
  const updated = await prisma.deadlineAttention.update({
    where: { id: existing.id },
    data: {
      status: outcome.next.status,
      ...(outcome.next.delayReason
        ? { delayReason: outcome.next.delayReason, delayLoggedAt: now }
        : {}),
      ...(outcome.next.resolution
        ? { resolution: outcome.next.resolution, resolvedAt: now, resolvedById: userId }
        : {}),
    },
  });

  return NextResponse.json({ ok: true, message: outcome.message, item: updated });
}
