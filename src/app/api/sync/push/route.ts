import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticateSync } from '@/lib/sync/serviceAuth';
import { byHlc, validatePush, SYNC_PROTOCOL_VERSION, type EntryResult } from '@/lib/sync/transport';
import { applyEntry, type TxRunner, type SqlRunner } from '@/lib/sync/applyEntry';

export const dynamic = 'force-dynamic';

/**
 * POST /api/sync/push — accept a batch of changes from the peer node.
 *
 * Every entry is decided by lib/sync/syncPolicy and then applied, ignored or
 * quarantined inside ONE transaction with the row that records the decision.
 * That pairing is what makes at-least-once delivery safe: a retried batch sees
 * its own sync_applied rows and does nothing, so the sender can retry as
 * aggressively as it likes without double-applying.
 *
 * Nothing is ever discarded. A change that loses is written to sync_conflicts
 * in full, whether it lost automatically or is waiting for a person.
 */

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const auth = authenticateSync(
    req.headers.get('authorization'),
    (body as { fromNode?: unknown })?.fromNode,
    process.env.SYNC_SERVICE_TOKEN
  );
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = validatePush(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const node = await prisma.$queryRawUnsafe<Array<{ node_id: string }>>(
    'select node_id from sync_node where id limit 1');
  const thisNode = node[0]?.node_id ?? 'unset';
  if (thisNode === auth.node) {
    // A node claiming our identity would have its writes applied as ours and
    // could ship them straight back. Refuse rather than untangle it later.
    return NextResponse.json(
      { error: `Peer claims to be "${auth.node}", which is this node.` }, { status: 409 });
  }

  const results: EntryResult[] = [];
  const columnCache = new Map<string, Set<string>>();
  const sorted = [...parsed.req.entries].sort(byHlc);

  /**
   * ONE transaction for the whole batch, not two per entry.
   *
   * applyEntry opens a transaction of its own around each write, which is
   * correct — the decision and its effect must commit together. But this
   * handler called it in a loop against the base client, so a batch of N
   * entries opened up to 2N transactions, and on this deployment each one cost
   * a fresh pooled connection to a database in another continent.
   *
   * Measured against the live endpoint on 22 August:
   *
   *     entries   total      per entry
   *           0    4.1s      (fixed overhead)
   *           1   13.0s        ~8.9s
   *           4   33.7s        ~7.4s
   *           8   30.3s        ~3.3s
   *
   * against round-trips of ~5ms and queries under a millisecond. The seconds
   * were not the work; they were the connections. Connect-and-query to that
   * host measured 1.8s, and 2 x 1.8s is the 3.3s seen when the function was
   * warm.
   *
   * That is what made a push of a hundred entries impossible inside any
   * sensible timeout, why the worker walks its batch size 100 -> 50 -> 25 -> 12
   * under load, and why a 2,820-entry backlog was five to eight hours of
   * work rather than a few seconds of it.
   *
   * The runner below satisfies applyEntry's TxRunner interface but executes
   * its "transaction" INLINE, inside the one real transaction opened here.
   * applyEntry is unchanged: it still believes it has its own transaction, and
   * it still commits each decision atomically with its effect — the atomicity
   * now comes from the enclosing transaction and a savepoint rather than from
   * a connection of its own.
   */
  await prisma.$transaction(
    async (tx) => {
      const inline: TxRunner = {
        $queryRawUnsafe: (sql: string, ...values: unknown[]) =>
          (tx as unknown as SqlRunner).$queryRawUnsafe(sql, ...values),
        $executeRawUnsafe: (sql: string, ...values: unknown[]) =>
          (tx as unknown as SqlRunner).$executeRawUnsafe(sql, ...values),
        $transaction: async <T,>(fn: (t: SqlRunner) => Promise<T>) => fn(inline),
      };

      for (let i = 0; i < sorted.length; i++) {
        const e = sorted[i];
        // A savepoint per entry keeps the property the old loop had for free:
        // one bad entry must not fail the batch. Without it, a single failure
        // would roll back every entry that had already succeeded.
        const sp = `orm_sync_sp_${i}`;
        await inline.$executeRawUnsafe(`SAVEPOINT ${sp}`);
        try {
          results.push(await applyEntry(inline, e, auth.node, thisNode, columnCache));
          await inline.$executeRawUnsafe(`RELEASE SAVEPOINT ${sp}`);
        } catch (err) {
          await inline.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${sp}`);
          // The sender retries only what it got no result for.
          console.error('[sync/push] entry failed', e.id, err);
        }
      }
    },
    {
      // The client gives up at 120s (REQUEST_TIMEOUT_MS). Finish inside that,
      // so a slow batch returns a partial result rather than a dead connection.
      timeout: 110_000,
      maxWait: 15_000,
    },
  );

  return NextResponse.json({ protocol: SYNC_PROTOCOL_VERSION, node: thisNode, results });
}
