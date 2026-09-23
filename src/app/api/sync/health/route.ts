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

    // The biggest thing waiting to be sent, and what it belongs to.
    //
    // WHY THIS IS HERE. On 23 September the theatre server had sent nothing for
    // three days. One journal entry was 3,298 kB — an announcement's base64
    // audio, re-serialised because a play counter changed — and the push
    // aborted on it after 120 seconds, every cycle. The worker halved the batch
    // and retried, which cannot help when a SINGLE row exceeds what the link
    // carries in the timeout, and because the queue ships oldest-first all
    // 2,721 entries behind it were stuck as well.
    //
    // Every number this endpoint already reported was consistent with a slow
    // link. None of them distinguished "the queue is long" from "the queue
    // cannot move", and that distinction was an hour of digging. One row of
    // SQL answers it: a largest entry in megabytes is a wedge, not a backlog.
    const [largest] = await prisma.$queryRawUnsafe<Array<{
      bytes: bigint | null; table_name: string | null; attempts: number | null;
    }>>(`select length(payload::text)::bigint as bytes, table_name, attempts
           from sync_journal
          where ack_at is null
          order by length(payload::text) desc nulls last
          limit 1`);

    // Entries the peer sent that this node could not apply yet.
    //
    // Parking them is correct — a child whose parent is in a later batch
    // applies perfectly well next cycle, and dropping it would lose a change.
    // What was missing is that nothing ever said one had stopped making
    // progress. Two entries for an emergency booking had been retried 1,274
    // times over four days, and the only trace was a log line reading
    // "deferred queue: 0 applied, 2 still waiting" once a minute, which is
    // indistinguishable from ordinary traffic.
    //
    // Reported, not resolved. An entry stuck this long is two records claiming
    // one identity, or a constraint a person has to adjudicate, and neither is
    // a decision this endpoint should take.
    const [deferred] = await prisma.$queryRawUnsafe<Array<{
      waiting: bigint; oldest: Date | null; worst_attempts: number | null;
    }>>(`select count(*) filter (where resolved_at is null)::bigint as waiting,
                min(first_seen_at) filter (where resolved_at is null)  as oldest,
                max(attempts) filter (where resolved_at is null)       as worst_attempts
           from sync_deferred`);

    const peers = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `select peer_node, last_push_ok_at, last_pull_ok_at, consecutive_errors,
              next_attempt_at, last_error
         from sync_state order by peer_node`);

    const unacked = Number(journal?.unacked ?? 0);
    const openConflicts = Number(conflicts?.open ?? 0);
    const oldest = journal?.oldest_unacked ? new Date(journal.oldest_unacked) : null;
    const behindMinutes = oldest ? Math.round((Date.now() - oldest.getTime()) / 60_000) : 0;

    const largestBytes = Number(largest?.bytes ?? 0);
    const deferredOldest = deferred?.oldest ? new Date(deferred.oldest) : null;
    const deferredStuckHours = deferredOldest
      ? Math.round((Date.now() - deferredOldest.getTime()) / 3_600_000)
      : 0;

    // A single entry this big cannot be pushed within the request timeout on a
    // hospital link, and because the queue ships oldest-first it stops
    // everything behind it. Below this it is a slow link; above it, a wedge.
    // 2 MB against a 3,500 kB batch budget: one such row leaves no room for
    // anything else, which is the condition worth naming.
    const WEDGE_BYTES = 2_000_000;

    // An entry parked this long is not waiting for its parent any more.
    const STUCK_HOURS = 24;

    // A single word an operator can act on. "degraded" is deliberate: a backlog
    // that is merely old is not broken, but it is not fine either, and calling
    // it healthy is how a two-day-old queue goes unnoticed.
    //
    // "wedged" and "stuck" rank above "degraded" because they name a queue that
    // will NOT drain by waiting, which is the distinction that cost three days
    // of divergence between the cloud and the theatre when only "degraded"
    // existed to describe both.
    const status =
      !node?.capture_enabled ? 'disabled'
      : largestBytes > WEDGE_BYTES ? 'wedged'
      : openConflicts > 0 ? 'conflicts'
      : deferredStuckHours > STUCK_HOURS ? 'stuck'
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
        largestUnsent: {
          bytes: largestBytes,
          table: largest?.table_name ?? null,
          attempts: Number(largest?.attempts ?? 0),
          // Said in words, because "3378688" in a JSON blob at 3 a.m. is not a
          // finding and "one row is too big to send" is.
          wedging: largestBytes > WEDGE_BYTES,
        },
      },
      conflicts: { open: openConflicts, total: Number(conflicts?.total ?? 0) },
      deferred: {
        waiting: Number(deferred?.waiting ?? 0),
        oldest: deferredOldest?.toISOString() ?? null,
        stuckHours: deferredStuckHours,
        worstAttempts: Number(deferred?.worst_attempts ?? 0),
      },
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
