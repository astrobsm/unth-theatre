import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticateSync } from '@/lib/sync/serviceAuth';
import { byHlc, validatePush, SYNC_PROTOCOL_VERSION, type EntryResult } from '@/lib/sync/transport';
import { applyEntry, type TxRunner, type SqlRunner } from '@/lib/sync/applyEntry';
import { isPermanentApplyFailure, permanentFailureReason } from '@/lib/sync/permanentFailure';

export const dynamic = 'force-dynamic';

/**
 * How long the apply loop may run before it stops and commits what it has.
 *
 * Comfortably inside the transaction's own 110s budget, because stopping is
 * only useful if there is time left to COMMIT. The gap is the margin for the
 * commit itself and for one entry that turns out to be slower than the rest.
 */
const APPLY_BUDGET_MS = 75_000;

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
  try {
    await prisma.$transaction(
    async (tx) => {
      const inline: TxRunner = {
        $queryRawUnsafe: (sql: string, ...values: unknown[]) =>
          (tx as unknown as SqlRunner).$queryRawUnsafe(sql, ...values),
        $executeRawUnsafe: (sql: string, ...values: unknown[]) =>
          (tx as unknown as SqlRunner).$executeRawUnsafe(sql, ...values),
        $transaction: async <T,>(fn: (t: SqlRunner) => Promise<T>) => fn(inline),
      };

      // ALWAYS COMMIT WHAT SUCCEEDED, EVEN IF THE BATCH CANNOT FINISH.
      //
      // This loop used to run until it was done or the 110s budget killed the
      // transaction. When it was killed, EVERYTHING rolled back — including
      // every entry that had applied perfectly — and the sender, getting no
      // results, re-sent the identical batch. A batch that cannot finish in
      // the budget therefore never makes progress, however many times it is
      // tried.
      //
      // On 19 November that was a theatre list. Sixty-five child rows were
      // waiting on a parent the cloud did not have; each failure cost about a
      // second, the budget went, and the two surgeries in the same batch —
      // which would have applied — were rolled back with them. Every cycle,
      // for hours.
      //
      // So: stop while there is still time to commit. Entries not reached get
      // no result and stay queued, which is the no-loss rule they already
      // relied on, and the next batch starts where this one stopped. Progress
      // becomes guaranteed rather than conditional on the whole batch fitting.
      const startedAt = Date.now();
      let stoppedEarly = 0;

      for (let i = 0; i < sorted.length; i++) {
        if (Date.now() - startedAt > APPLY_BUDGET_MS) {
          stoppedEarly = sorted.length - i;
          console.warn(
            `[sync/push] stopping after ${i} of ${sorted.length} entries to commit what applied; `
            + `${stoppedEarly} stay queued for the next batch`);
          break;
        }
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

          // AN ENTRY THAT CAN NEVER APPLY MUST NOT BE RETRIED FOREVER.
          //
          // Returning no result is right for a transient failure — the sender
          // re-sends, and the parent row or the free connection arrives. It is
          // wrong for a UNIQUE violation, which means the peer already holds a
          // different row under that key and will refuse this one identically
          // every time.
          //
          // On 7 September 33 such entries had each been retried 248 times.
          // They did not merely fail: every batch carrying one spent its
          // savepoint and rollback on them, the batch transaction then passed
          // its 110s budget and returned 500, and 861 applicable changes sat
          // behind them for five days while the cloud's one connection was
          // held for a hundred seconds at a time.
          //
          // Quarantine settles the entry so the sender stops sending it, and
          // records both sides in sync_conflicts for a person to resolve. It
          // does NOT apply the change and does NOT delete anything.
          if (isPermanentApplyFailure(err)) {
            const reason = permanentFailureReason(err);
            try {
              await inline.$executeRawUnsafe(`SAVEPOINT ${sp}_q`);
              await inline.$executeRawUnsafe(
                `insert into sync_conflicts
                   (table_name, row_id, sync_class, incoming, incoming_hlc, incoming_node,
                    local_snapshot, local_hlc, reason, status)
                 values ($1,$2,$3,$4::jsonb,$5,$6,NULL,NULL,$7,'OPEN')`,
                e.table, e.rowId, 'PERMANENT_FAILURE',
                JSON.stringify(e.payload ?? {}), e.hlc, e.originNode, reason);
              await inline.$executeRawUnsafe(`RELEASE SAVEPOINT ${sp}_q`);
              results.push({ id: e.id, decision: 'QUARANTINE', reason });
              console.error('[sync/push] quarantined', e.table, e.rowId, reason);
              continue;
            } catch (qerr) {
              // Recording the conflict is itself best-effort: if it fails the
              // entry must go back to being retried rather than vanish.
              await inline.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${sp}_q`).catch(() => {});
              console.error('[sync/push] could not quarantine', e.id, qerr);
            }
          }

          // The sender retries only what it got no result for.
          console.error('[sync/push] entry failed', e.id, err);
        }
      }
    },
    {
      // The client gives up at 120s (REQUEST_TIMEOUT_MS). Finish inside that,
      // so a slow batch returns a partial result rather than a dead connection.
      // APPLY_BUDGET_MS stops the loop well before this, leaving room to
      // commit; this remains the backstop for a single pathological entry.
      timeout: 110_000,
      maxWait: 15_000,
    },
    );
  } catch (err) {
    // THE WHOLE BATCH FAILED, AND IT USED TO FAIL SILENTLY.
    //
    // Everything above is per-entry and caught per-entry. This catches the
    // transaction itself — it could not start, or it ran past its budget — and
    // that used to escape the handler entirely. Next then returned a bare 500
    // with no body, the sender logged "push failed: " with nothing after it,
    // and five days of diagnosis had nothing to work from. Whatever else is
    // true, a failure has to be able to say what it was.
    //
    // No results are returned: the transaction rolled back, so nothing was
    // written, and reporting decisions for entries that were not applied would
    // have the sender acknowledge changes the peer does not hold. Every entry
    // stays queued, which is the no-loss rule.
    const code = (err && typeof err === 'object' && 'code' in err)
      ? String((err as { code: unknown }).code) : 'unknown';
    const message = err instanceof Error ? err.message.split('\n')[0].slice(0, 300) : String(err);
    console.error(`[sync/push] batch of ${sorted.length} failed (${code}):`, err);

    // 503, not 500: this is retryable and the sender must know that. The code
    // travels in the body so the sender can tell "too much at once" (a
    // transaction that timed out, or a connection it could not get) from a
    // fault that a smaller batch will not fix.
    return NextResponse.json(
      { protocol: SYNC_PROTOCOL_VERSION, node: thisNode, error: message, code, results: [] },
      { status: 503 },
    );
  }

  return NextResponse.json({ protocol: SYNC_PROTOCOL_VERSION, node: thisNode, results });
}
