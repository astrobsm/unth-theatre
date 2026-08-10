import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { bearerFrom, tokensMatch } from '@/lib/sync/serviceAuth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sync/health — is sync working, and how far behind is it?
 *
 * Readable by an administrator with a session OR by the peer node with the
 * service token, because the most useful time to ask is when a person is
 * standing in front of one node wondering about the other.
 *
 * It deliberately reports the numbers an operator must act on rather than a
 * green tick: a backlog that is growing, and conflicts that are waiting for a
 * person, are both failures that no automatic process will clear.
 */
export async function GET(req: NextRequest) {
  const token = process.env.SYNC_SERVICE_TOKEN;
  const provided = bearerFrom(req.headers.get('authorization'));
  const viaToken = !!(token && provided && tokensMatch(provided, token));

  if (!viaToken) {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string } | undefined)?.role;
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'].includes(role ?? '')) {
      return NextResponse.json({ error: 'Administrators only.' }, { status: 403 });
    }
  }

  try {
    const [node] = await prisma.$queryRawUnsafe<Array<{ node_id: string; capture_enabled: boolean }>>(
      'select node_id, capture_enabled from sync_node where id limit 1');

    const [journal] = await prisma.$queryRawUnsafe<Array<{
      total: bigint; unacked: bigint; oldest_unacked: Date | null; failing: bigint;
    }>>(`select count(*)::bigint                                   as total,
                count(*) filter (where ack_at is null)::bigint     as unacked,
                min(created_at) filter (where ack_at is null)      as oldest_unacked,
                count(*) filter (where attempts > 3)::bigint       as failing
           from sync_journal`);

    const [conflicts] = await prisma.$queryRawUnsafe<Array<{ open: bigint; total: bigint }>>(
      `select count(*) filter (where status='OPEN')::bigint as open, count(*)::bigint as total
         from sync_conflicts`);

    const peers = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `select peer_node, last_push_ok_at, last_pull_ok_at, consecutive_errors,
              next_attempt_at, last_error
         from sync_state order by peer_node`);

    const unacked = Number(journal?.unacked ?? 0);
    const openConflicts = Number(conflicts?.open ?? 0);
    const oldest = journal?.oldest_unacked ? new Date(journal.oldest_unacked) : null;
    const behindMinutes = oldest ? Math.round((Date.now() - oldest.getTime()) / 60_000) : 0;

    // A single word an operator can act on. "degraded" is deliberate: a backlog
    // that is merely old is not broken, but it is not fine either, and calling
    // it healthy is how a two-day-old queue goes unnoticed.
    const status =
      !node?.capture_enabled ? 'disabled'
      : openConflicts > 0 ? 'conflicts'
      : behindMinutes > 60 ? 'degraded'
      : Number(journal?.failing ?? 0) > 0 ? 'degraded'
      : 'ok';

    return NextResponse.json({
      status,
      node: node?.node_id ?? 'unset',
      captureEnabled: !!node?.capture_enabled,
      journal: {
        total: Number(journal?.total ?? 0),
        unacknowledged: unacked,
        oldestUnacknowledged: oldest?.toISOString() ?? null,
        behindMinutes,
        failingEntries: Number(journal?.failing ?? 0),
      },
      conflicts: { open: openConflicts, total: Number(conflicts?.total ?? 0) },
      peers,
      checkedAt: new Date().toISOString(),
    });
  } catch (e) {
    // Before the migration is applied the sync tables do not exist. That is a
    // legitimate state, not an error, and saying so is more useful than a 500.
    const message = e instanceof Error ? e.message : String(e);
    if (/relation .*sync_/i.test(message)) {
      return NextResponse.json({ status: 'not-installed', error: 'Sync tables are not present on this node.' });
    }
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}
