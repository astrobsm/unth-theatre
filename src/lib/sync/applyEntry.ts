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

/**
 * The UNIQUE indexes a row can collide on OTHER than its primary key.
 *
 * Postgres reports both as 23505 and the upsert below only knows about one of
 * them. `on conflict (id)` resolves a primary-key clash; a clash on any other
 * unique index raises, the entry is retried, and it raises identically forever.
 * surgery_drafts is unique on userId — one unfinished booking per person — so
 * a draft arriving from the peer for a user who already has one here could
 * never be applied. 180 entries were retried 522 times each against 16 users.
 *
 * Read from pg_index rather than pg_constraint: Prisma's `@unique` creates a
 * unique INDEX, not a table constraint, so pg_constraint does not list it.
 *
 * Partial indexes (indpred) and expression indexes (attnum 0) are skipped —
 * neither can be matched by comparing column values.
 */
async function uniqueIndexes(db: SqlRunner, table: string): Promise<string[][]> {
  const rows = await db.$queryRawUnsafe<Array<{ cols: string[] }>>(
    `select array_agg(a.attname order by k.ord) as cols
       from pg_index x
       join pg_class t on t.oid = x.indrelid
       join pg_class i on i.oid = x.indexrelid
       join pg_namespace n on n.oid = t.relnamespace
       cross join lateral unnest(x.indkey) with ordinality as k(attnum, ord)
       join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
      where x.indisunique and not x.indisprimary and x.indpred is null
        and k.attnum > 0 and n.nspname = 'public' and t.relname = $1
      group by i.relname`, table);
  return rows.map((r) => r.cols);
}

/**
 * The row already holding one of this payload's unique keys, if any.
 *
 * Matched with `=`, which is how a unique index behaves: NULL is distinct from
 * everything, so a payload with NULL in a unique column collides with nothing.
 * The values are coerced through jsonb_populate_record for the same reason the
 * insert does it — a timestamp arrives as a JSON string and comparing it as
 * text finds nothing.
 */
async function findUniqueRival(
  db: SqlRunner, table: string, payload: Record<string, unknown>,
  cols: Set<string>, incomingId: string,
): Promise<{ id: string; sync_version: number | null; sync_hlc: string | null } | null> {
  for (const idx of await uniqueIndexes(db, table)) {
    if (!idx.every((c) => cols.has(c) && payload[c] !== null && payload[c] !== undefined)) continue;
    const preds = idx.map((c) => `t.${q(c)} = inc.${q(c)}`).join(' and ');
    const found = await db.$queryRawUnsafe<Array<{ id: string; sync_version: number | null; sync_hlc: string | null }>>(
      `select t.id::text as id, t.sync_version, t.sync_hlc
         from ${q(table)} t, jsonb_populate_record(null::${q(table)}, $1::jsonb) inc
        where ${preds} and t.id::text <> $2
        limit 1`, JSON.stringify(payload), incomingId);
    if (found.length) return found[0];
  }
  return null;
}

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
  //
  // Reported as UNKNOWN_TABLE rather than IGNORE, and deliberately NOT
  // recorded in sync_applied. Recording it would make the answer permanent:
  // the replay guard above returns the stored decision first, so once this
  // node learned the table the entry would still come back "ignored" from the
  // record and never actually apply. The sender keeps it queued instead, and
  // it lands the moment this node is updated.
  if (!isSynced(e.table)) {
    return {
      id: e.id,
      decision: 'UNKNOWN_TABLE',
      reason: `Table "${e.table}" has no sync policy on this node — it is probably running older code.`,
    };
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

  // ── The row that already holds this one's unique key ──────────────────────
  //
  // decide() above compared against the row with the SAME id, and for a
  // collision on a SECONDARY unique key there is no such row — it returns
  // "New row. APPLY", the insert then violates the other index, and the entry
  // fails identically on every retry. So the comparison is made again against
  // the row actually standing in the way.
  //
  // Resolved automatically ONLY for LWW, where "the latest intent is correct"
  // is exactly what the class means and the loser is a superseded version of
  // the same thing. Every other class is quarantined instead: a unique clash
  // on clinical content is two different records claiming one identity, and
  // that is a person's decision, not a timestamp comparison's.
  let effective = decision;
  let rivalId: string | null = null;

  if (e.op !== 'DELETE' && e.payload) {
    let colsForRival = columnCache.get(e.table);
    if (!colsForRival) {
      colsForRival = await realColumns(db, e.table);
      columnCache.set(e.table, colsForRival);
    }
    const rival = await findUniqueRival(
      db, e.table, e.payload as Record<string, unknown>, colsForRival, e.rowId);

    if (rival) {
      const cls = policyFor(e.table)?.cls;
      if (cls === 'LWW') {
        effective = decide(
          {
            table: e.table, op: e.op, baseVersion: e.baseVersion, hlc: e.hlc,
            originNode: e.originNode, changedColumns: e.changedColumns ?? undefined,
          },
          { exists: true, version: rival.sync_version ?? 0, hlc: rival.sync_hlc ?? '' },
          { thisNode, cloudNode: 'cloud' },
        );
        // The loser is removed in the same transaction as the winner's insert,
        // or the insert hits the very index this was meant to clear.
        if (effective.action === 'APPLY') rivalId = rival.id;
      } else {
        effective = {
          action: 'QUARANTINE',
          reason: `Row ${rival.id} already holds this row's unique key on a `
            + `${cls ?? 'unclassified'} table. Two records claim one identity; a person must decide.`,
        };
      }
    }
  }

  if (effective.action === 'IGNORE') {
    return await recordOnly(db, e, fromNode, 'IGNORE', effective.reason);
  }

  if (effective.action === 'QUARANTINE') {
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
        JSON.stringify(snap[0]?.row ?? null), local[0]?.sync_hlc ?? null, effective.reason);
      await markApplied(tx, e, fromNode, 'QUARANTINE', effective.reason);
    });
    return { id: e.id, decision: 'QUARANTINE', reason: effective.reason };
  }

  let cols = columnCache.get(e.table);
  if (!cols) { cols = await realColumns(db, e.table); columnCache.set(e.table, cols); }

  await db.$transaction(async (tx) => {
    // Suppress capture while applying, or this write journals an entry that
    // ships straight back and the two nodes trade one row forever.
    await tx.$executeRawUnsafe(`select set_config('orm.sync_applying','on',true)`);

    if (e.op === 'DELETE') {
      await tx.$executeRawUnsafe(`delete from ${q(e.table)} where id = $1`, e.rowId);
    } else {
      // The LWW loser, removed before the winner is written so the insert does
      // not hit the very unique index this path exists to clear. Inside the
      // suppressed-capture block above, so it does not journal a delete back
      // to a peer that never held this row in the first place.
      if (rivalId) {
        await tx.$executeRawUnsafe(`delete from ${q(e.table)} where id = $1`, rivalId);
      }
      const payload = (e.payload ?? {}) as Record<string, unknown>;
      // Only real columns. A payload key becomes an identifier in the SQL
      // below, so an unfiltered key would be an injection point. Omitted
      // large columns are simply absent and keep whatever this node holds.
      const keys = Object.keys(payload).filter((k) => cols!.has(k));
      if (keys.length) {
        // The row is rebuilt by POSTGRES from one jsonb parameter, not by
        // binding each column as a separate value.
        //
        // The journal captures rows with to_jsonb, so every value arrives as
        // JSON: a timestamp is the string "2026-08-10T09:00:00", an enum is a
        // string, an array is a JSON array. Bound individually, the driver
        // sends each as `text` and Postgres rejects it — "column createdAt is
        // of type timestamp without time zone but expression is of type text".
        // That one error silently stopped every row carrying a date, which is
        // very nearly every row.
        //
        // jsonb_populate_record coerces the whole payload against the table's
        // own row type, so timestamps, enums, arrays, jsonb columns and
        // numerics are all converted by the same code Postgres uses for its
        // own I/O. Casting each column by hand would have fixed timestamps and
        // broken again at the first enum.
        const colList = keys.map(q).join(', ');
        const upd = keys.filter((k) => k !== 'id').map((k) => `${q(k)} = excluded.${q(k)}`);
        // Only an id means there is nothing to change; DO UPDATE SET with an
        // empty list is a syntax error.
        const onConflict = upd.length
          ? `do update set ${upd.join(', ')}`
          : 'do nothing';
        await tx.$executeRawUnsafe(
          `insert into ${q(e.table)} (${colList})
           select ${colList} from jsonb_populate_record(null::${q(e.table)}, $1::jsonb)
           on conflict (id) ${onConflict}`,
          JSON.stringify(payload));
      }
    }
    await markApplied(tx, e, fromNode, 'APPLY', effective.reason);

    // NO finally resetting the flag. set_config(..., true) is TRANSACTION-local,
    // so a rollback discards it automatically — the reset was never needed.
    //
    // Worse, it actively destroyed diagnostics: when a statement failed, the
    // transaction was already aborted, so the reset itself failed with 25P02
    // "current transaction is aborted" and REPLACED the real error. Two days of
    // logs said only that something had gone wrong, never what.
    await tx.$executeRawUnsafe(`select set_config('orm.sync_applying','off',true)`);
  });

  return { id: e.id, decision: 'APPLY', reason: effective.reason };
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
