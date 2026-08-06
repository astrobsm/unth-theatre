// ============================================================
// Deleting user accounts
// ------------------------------------------------------------
// POST — delete a set of accounts, after checking each one.
// GET  — duplicate registrations, grouped.
//
// Every deletion is checked individually and independently: one account that
// cannot be removed does not stop the rest, and the response says exactly what
// happened to each. A bulk action that fails silently in the middle is worse
// than one that refuses outright.
//
// What this deliberately will not do:
//   * delete an APPROVED account that has ANY record against it
//   * delete the account making the request
//   * delete anything with records against it (see lib/users/deletion)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import {
  checkUserDeletable,
  findDuplicates,
  statusAllowsDeletion,
  type DuplicateCandidate,
} from '@/lib/users/deletion';

export const dynamic = 'force-dynamic';

/** Removing accounts is an administrative act, not a clinical one. */
const CAN_DELETE = ['ADMIN', 'SYSTEM_ADMINISTRATOR'];

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const me = session?.user as { id?: string; role?: string; fullName?: string } | undefined;
  if (!me?.id) return { ok: false as const, status: 401, error: 'Sign in to continue.' };
  if (!me.role || !CAN_DELETE.includes(me.role)) {
    return { ok: false as const, status: 403, error: 'Only an administrator may delete accounts.' };
  }
  return { ok: true as const, me: { ...me, id: me.id as string } };
}

// ---------------------------------------------------------------------------
// GET — duplicate registrations
// ---------------------------------------------------------------------------
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true, fullName: true, username: true, email: true,
        staffCode: true, role: true, status: true, createdAt: true,
      },
      take: 5000,
    });

    const groups = findDuplicates(users as DuplicateCandidate[]);

    // Say, per member, whether it could actually be removed — an administrator
    // should not discover halfway through that the duplicate is the one with
    // all the surgeries against it.
    const enriched = await Promise.all(
      groups.map(async (g) => ({
        ...g,
        members: await Promise.all(
          g.members.map(async (m) => {
            if (m.id === g.keepId) {
              return { ...m, deletable: false, needsConfirm: false, reason: 'Suggested keeper' };
            }
            const check = await checkUserDeletable(m.id);
            if (!check.deletable) {
              return { ...m, deletable: false, needsConfirm: false, reason: check.reason };
            }
            // Nothing references it. A PENDING or REJECTED one goes quietly; an
            // APPROVED one is removable too but asks first, because approving it
            // was somebody's decision even if it was never used.
            const needsConfirm = !statusAllowsDeletion(m.status);
            return {
              ...m,
              deletable: true,
              needsConfirm,
              reason: needsConfirm
                ? `${m.status}, but nothing references it — never used.`
                : 'Unused registration.',
            };
          })
        ),
      }))
    );

    return NextResponse.json({
      groups: enriched,
      counts: {
        groups: enriched.length,
        accounts: enriched.reduce((n, g) => n + g.members.length, 0),
        removable: enriched.reduce((n, g) => n + g.members.filter((m: any) => m.deletable).length, 0),
      },
    });
  } catch (error) {
    console.error('[users] duplicate scan failed:', error);
    return NextResponse.json({ error: 'Failed to scan for duplicates' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — delete the given accounts
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { ids?: string[]; force?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((i) => typeof i === 'string') : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'Select at least one account.' }, { status: 400 });
  }
  // A cap, so a mis-click cannot empty the staff list in one request.
  if (ids.length > 100) {
    return NextResponse.json({ error: 'Delete at most 100 accounts at a time.' }, { status: 400 });
  }

  const results: { id: string; name?: string; deleted: boolean; reason: string }[] = [];

  for (const id of ids) {
    if (id === auth.me.id) {
      results.push({ id, deleted: false, reason: 'You cannot delete the account you are signed in with.' });
      continue;
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, fullName: true, username: true, status: true, role: true },
    });
    if (!user) {
      results.push({ id, deleted: false, reason: 'Account no longer exists.' });
      continue;
    }

    const check = await checkUserDeletable(id);
    if (!check.deletable) {
      results.push({ id, name: user.fullName, deleted: false, reason: check.reason });
      continue;
    }

    // An APPROVED account is normally a person who works here, and removing one
    // is a leavers process rather than a tidy-up. But the check above examined
    // every table that references a user and found NOTHING — no roster line, no
    // surgery, no grant, not even a login session. An approved account with no
    // trace anywhere has never been used, which is exactly what a duplicate
    // registration looks like. Those may go; the caller must have said so.
    if (!statusAllowsDeletion(user.status) && !body.force) {
      results.push({
        id, name: user.fullName, deleted: false,
        reason: `${user.status} and unused. Nothing references it, so it can be removed — confirm to proceed.`,
      });
      continue;
    }

    try {
      // Recorded BEFORE the delete: afterwards there is no user row to describe,
      // and an audit entry that cannot say who was removed is not an audit entry.
      await prisma.auditLog.create({
        data: {
          userId: auth.me.id,
          action: 'DELETE_USER',
          tableName: 'users',
          recordId: id,
          changes: JSON.stringify({
            fullName: user.fullName,
            username: user.username,
            role: user.role,
            status: user.status,
            deletedBy: auth.me.fullName ?? auth.me.id,
          }),
        },
      });

      await prisma.user.delete({ where: { id } });
      results.push({ id, name: user.fullName, deleted: true, reason: 'Deleted.' });
    } catch (error: unknown) {
      // P2003 — a foreign key refused it. The database is the final guarantee
      // and it is allowed to overrule the check above.
      const code = (error as { code?: string })?.code;
      results.push({
        id, name: user.fullName, deleted: false,
        reason: code === 'P2003'
          ? 'The database refused: something still references this account.'
          : 'Could not delete this account.',
      });
      if (code !== 'P2003') console.error('[users] delete failed:', id, error);
    }
  }

  const deleted = results.filter((r) => r.deleted).length;
  return NextResponse.json({
    deleted,
    refused: results.length - deleted,
    results,
  });
}
