// ============================================================
// Merging duplicate accounts
// ------------------------------------------------------------
// POST { keepId, loseIds, preview: true }            -- what would move
// POST { keepId, loseIds, password }                 -- do it
//
// The preview needs no password because it writes nothing. The merge does,
// every time: see src/lib/users/stepUp.ts for why a signed-in session is not
// on its own an answer to "is the administrator the one typing".
//
// One account at a time, each in its own transaction. A merge that half
// succeeded across three duplicates would be unreadable afterwards, so each
// either lands whole or does not land, and the reply says which.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { confirmAdminPassword } from '@/lib/users/adminPassword';
import { countReferences, mergeUserInto, type MergeOutcome } from '@/lib/users/mergeEngine';
import { describeMergeCounts, refuseMerge } from '@/lib/users/merge';

export const dynamic = 'force-dynamic';

/** Merging accounts is an administrative act, as deleting one is. */
const CAN_MERGE = ['ADMIN', 'SYSTEM_ADMINISTRATOR'];

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const me = session?.user as { id?: string; role?: string; fullName?: string } | undefined;
  if (!me?.id) return { ok: false as const, status: 401, error: 'Sign in to continue.' };
  if (!me.role || !CAN_MERGE.includes(me.role)) {
    return { ok: false as const, status: 403, error: 'Only an administrator may merge accounts.' };
  }
  return { ok: true as const, me: { ...me, id: me.id as string } };
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { keepId?: string; loseIds?: string[]; password?: string; preview?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const keepId = typeof body.keepId === 'string' ? body.keepId : '';
  const loseIds = Array.isArray(body.loseIds)
    ? Array.from(new Set(body.loseIds.filter((i): i is string => typeof i === 'string' && i !== keepId)))
    : [];

  if (!keepId || loseIds.length === 0) {
    return NextResponse.json(
      { error: 'Choose the account to keep and at least one to fold into it.' },
      { status: 400 },
    );
  }
  // The same cap the delete route uses, for the same reason.
  if (loseIds.length > 20) {
    return NextResponse.json({ error: 'Merge at most 20 accounts at a time.' }, { status: 400 });
  }

  for (const loseId of loseIds) {
    const problem = refuseMerge({ keepId, loseId, adminId: auth.me.id });
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }

  // -------------------------------------------------------------------------
  // Preview -- read only, so no password
  // -------------------------------------------------------------------------
  if (body.preview) {
    try {
      const keeper = await prisma.user.findUnique({
        where: { id: keepId },
        select: { id: true, fullName: true, username: true, role: true, status: true },
      });
      if (!keeper) return NextResponse.json({ error: 'That account no longer exists.' }, { status: 404 });

      const plans = await Promise.all(
        loseIds.map(async (loseId) => {
          const user = await prisma.user.findUnique({
            where: { id: loseId },
            select: { id: true, fullName: true, username: true, role: true, status: true },
          });
          const counts = user ? await countReferences(prisma, loseId) : [];
          return {
            id: loseId,
            fullName: user?.fullName ?? null,
            username: user?.username ?? null,
            role: user?.role ?? null,
            status: user?.status ?? null,
            exists: Boolean(user),
            summary: user ? describeMergeCounts(counts) : 'That account no longer exists.',
            counts,
          };
        }),
      );

      return NextResponse.json({ preview: true, keeper, plans });
    } catch (error) {
      console.error('[users] merge preview failed:', error);
      return NextResponse.json({ error: 'Could not work out what would move.' }, { status: 500 });
    }
  }

  // -------------------------------------------------------------------------
  // The merge itself
  // -------------------------------------------------------------------------
  const stepUp = await confirmAdminPassword(auth.me.id, body.password, 'merge');
  if (!stepUp.ok) return NextResponse.json({ error: stepUp.error }, { status: stepUp.status });

  const results: (MergeOutcome & { id: string; name?: string })[] = [];
  for (const loseId of loseIds) {
    const user = await prisma.user.findUnique({
      where: { id: loseId },
      select: { fullName: true, username: true },
    });
    const outcome = await mergeUserInto({
      prisma,
      keepId,
      loseId,
      adminId: auth.me.id,
      adminName: auth.me.fullName,
    });
    results.push({ ...outcome, id: loseId, name: user?.fullName ?? user?.username });
  }

  const merged = results.filter((r) => r.ok).length;
  return NextResponse.json({
    merged,
    refused: results.length - merged,
    moved: results.reduce((n, r) => n + r.moved, 0),
    folded: results.reduce((n, r) => n + r.folded, 0),
    dropped: results.reduce((n, r) => n + r.dropped, 0),
    results,
  });
}
