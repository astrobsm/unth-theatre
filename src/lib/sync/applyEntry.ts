// ============================================================
// Applying one incoming change — the only implementation
// ------------------------------------------------------------
// Used by BOTH the push route (a peer sending to us) and the worker (us
// pulling from a peer). Those are the same operation seen from two ends, and
// two implementations of it would drift apart in exactly the ways that are
// hardest to notice: one side quarantining where the other overwrites.
// ============================================================

import { decide, isSynced, policyFor } from './syncPolicy';
import type { EntryResult, JournalEntryWire } from './transport';

/** Just enough of Prisma to run raw SQL, so a client or a transaction both fit. */
export interface SqlRunner {
  $queryRawUnsafe<T = unknown>(sql: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(sql: string, ...values: unknown[]): Promise<number>;
}
export interface TxRunner extends SqlRunner {
  $transaction<T>(fn: (tx: SqlRunner) => Promise<T>): Promise<T>;
}

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

async function realColumns(db: SqlRunner, table: string): Promise<Set<string>> {
  const rows = await db.$queryRawUnsafe<Array<{ column_name: string }>>(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = $1`, table);
  return new Set(rows.map((r) => r.column_name));
}

/**
 * Decide and apply. Returns what was done, for the sender to acknowledge.
 *
 * Every path records a sync_applied row in the SAME transaction as its effect.
 * That is what makes at-least-once delivery safe rather than merely tolerable:
 * a replayed entry finds its own record and returns the original decision.
 */
export async function applyEntry(
  db: TxRunner,
  e: JournalEntryWire,
  fromNode: string,
  thisNode: string,
  columnCache: Map<string, Set<string>>
): Promise<EntryResult> {
  // A table with no policy on THIS node is never written, however the peer
  // labelled it. Classification is a local decision.
  if (!isSynced(e.table)) {
    return await recordOnly(db, e, fromNode, 'IGNORE', `Table "${e.table}" is not synced on this node.`);
  }

  const seen = await db.$queryRawUnsafe<Array<{ decision: string; reason: string | null }>>(
    'select decision, reason from sync_applied where journal_id = $1::uuid', e.id);
  if (seen.length) {
    return {
      id: e.id,
      decision: seen[0].decision as EntryResult['decision'],
      reason: seen[0].reason ?? 'Already applied.',
    };
  }

  const local = await db.$queryRawUnsafe<Array<{ sync_version: number | null; sync_hlc: string | null }>>(
    `select sync_version, sync_hlc from ${q(e.table)} where id = $1`, e.rowId);

  const decision = decide(
    {
      table: e.table, op: e.op, baseVersion: e.baseVersion, hlc: e.hlc,
      originNode: e.originNode, changedColumns: e.changedColumns ?? undefined,
    },
    local.length
      ? { exists: true, version: local[0].sync_version ?? 0, hlc: local[0].sync_hlc ?? '' }
      : null,
    { thisNode, cloudNode: 'cloud' }
  );

  if (decision.action === 'IGNORE') {
    return await recordOnly(db, e, fromNode, 'IGNORE', decision.reason);
  }

  if (decision.action === 'QUARANTINE') {
    const snap = local.length
      ? await db.$queryRawUnsafe<Array<{ row: unknown }>>(
          `select to_jsonb(t.*) as row from ${q(e.table)} t where id = $1`, e.rowId)
      : [];
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `insert into sync_conflicts
           (table_name, row_id, sync_class, incoming, incoming_hlc, incoming_node,
            local_snapshot, local_hlc, reason, status)
         values ($1,$2,$3,$4::jsonb,$5,$6,$7::jsonb,$8,$9,'OPEN')`,
        e.table, e.rowId, policyFor(e.table)?.cls ?? 'UNKNOWN',
        JSON.stringify(e.payload ?? {}), e.hlc, e.originNode,
        JSON.stringify(snap[0]?.row ?? null), local[0]?.sync_hlc ?? null, decision.reason);
      await markApplied(tx, e, fromNode, 'QUARANTINE', decision.reason);
    });
    return { id: e.id, decision: 'QUARANTINE', reason: decision.reason };
  }

  let cols = columnCache.get(e.table);
  if (!cols) { cols = await realColumns(db, e.table); columnCache.set(e.table, cols); }

  await db.$transaction(async (tx) => {
    // Suppress capture while applying, or this write journals an entry that
    // ships straight back and the two nodes trade one row forever.
    await tx.$executeRawUnsafe(`select set_config('orm.sync_applying','on',true)`);
    try {
      if (e.op === 'DELETE') {
        await tx.$executeRawUnsafe(`delete from ${q(e.table)} where id = $1`, e.rowId);
      } else {
        const payload = (e.payload ?? {}) as Record<string, unknown>;
        // Only real columns. A payload key becomes an identifier in the SQL
        // below, so an unfiltered key would be an injection point. Omitted
        // large columns are simply absent and keep whatever this node holds.
        const keys = Object.keys(payload).filter((k) => cols!.has(k));
        if (keys.length) {
          const values = keys.map((k) => payload[k]);
          const ph = keys.map((_, i) => `$${i + 1}`);
          const upd = keys.filter((k) => k !== 'id').map((k) => `${q(k)} = excluded.${q(k)}`);
          await tx.$executeRawUnsafe(
            `insert into ${q(e.table)} (${keys.map(q).join(',')}) values (${ph.join(',')})
             on conflict (id) do update set ${upd.join(',')}`, ...values);
        }
      }
      await markApplied(tx, e, fromNode, 'APPLY', decision.reason);
    } finally {
      // Restored even if the write fails, so a later statement in the same
      // session cannot silently skip capture.
      await tx.$executeRawUnsafe(`select set_config('orm.sync_applying','off',true)`);
    }
  });

  return { id: e.id, decision: 'APPLY', reason: decision.reason };
}

function markApplied(
  db: SqlRunner, e: JournalEntryWire, fromNode: string,
  decision: string, reason: string
): Promise<number> {
  return db.$executeRawUnsafe(
    `insert into sync_applied (journal_id, from_node, table_name, row_id, decision, reason)
     values ($1::uuid,$2,$3,$4,$5,$6) on conflict (journal_id) do nothing`,
    e.id, fromNode, e.table, e.rowId, decision, reason);
}

async function recordOnly(
  db: SqlRunner, e: JournalEntryWire, fromNode: string,
  decision: 'IGNORE' | 'QUARANTINE', reason: string
): Promise<EntryResult> {
  await markApplied(db, e, fromNode, decision, reason);
  return { id: e.id, decision, reason };
}
