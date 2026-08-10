import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticateSync } from '@/lib/sync/serviceAuth';
import { byHlc, validatePush, SYNC_PROTOCOL_VERSION, type EntryResult, type JournalEntryWire } from '@/lib/sync/transport';
import { decide, isSynced, policyFor } from '@/lib/sync/syncPolicy';

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

/** Columns that actually exist on a table, so a payload key cannot inject SQL. */
async function realColumns(table: string): Promise<Set<string>> {
  const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = $1`, table);
  return new Set(rows.map((r) => r.column_name));
}

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

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

  for (const e of [...parsed.req.entries].sort(byHlc)) {
    try {
      results.push(await applyOne(e, auth.node, thisNode, columnCache));
    } catch (err) {
      // One bad entry must not fail the batch: the rest is good work, and the
      // sender will retry only what it did not get a result for.
      console.error('[sync/push] entry failed', e.id, err);
    }
  }

  return NextResponse.json({ protocol: SYNC_PROTOCOL_VERSION, node: thisNode, results });
}

async function applyOne(
  e: JournalEntryWire,
  fromNode: string,
  thisNode: string,
  columnCache: Map<string, Set<string>>
): Promise<EntryResult> {
  // A table with no policy is never written, however the peer labelled it.
  if (!isSynced(e.table)) {
    return record(e, fromNode, 'IGNORE', `Table "${e.table}" is not synced on this node.`);
  }

  const seen = await prisma.$queryRawUnsafe<Array<{ decision: string; reason: string }>>(
    'select decision, reason from sync_applied where journal_id = $1::uuid', e.id);
  if (seen.length) {
    // Already processed. Returning the original decision keeps a retry
    // idempotent rather than merely harmless.
    return { id: e.id, decision: seen[0].decision as EntryResult['decision'], reason: seen[0].reason ?? 'Already applied.' };
  }

  const local = await prisma.$queryRawUnsafe<Array<{ sync_version: number | null; sync_hlc: string | null }>>(
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
    return record(e, fromNode, 'IGNORE', decision.reason);
  }

  if (decision.action === 'QUARANTINE') {
    const snapshot = local.length
      ? await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `select to_jsonb(t.*) as row from ${q(e.table)} t where id = $1`, e.rowId)
      : [];
    await prisma.$transaction([
      prisma.$executeRawUnsafe(
        `insert into sync_conflicts
           (table_name, row_id, sync_class, incoming, incoming_hlc, incoming_node,
            local_snapshot, local_hlc, reason, status)
         values ($1,$2,$3,$4::jsonb,$5,$6,$7::jsonb,$8,$9,'OPEN')`,
        e.table, e.rowId, policyFor(e.table)?.cls ?? 'UNKNOWN',
        JSON.stringify(e.payload ?? {}), e.hlc, e.originNode,
        JSON.stringify((snapshot[0] as { row?: unknown })?.row ?? null),
        local[0]?.sync_hlc ?? null, decision.reason),
      prisma.$executeRawUnsafe(
        `insert into sync_applied (journal_id, from_node, table_name, row_id, decision, reason)
         values ($1::uuid,$2,$3,$4,'QUARANTINE',$5) on conflict (journal_id) do nothing`,
        e.id, fromNode, e.table, e.rowId, decision.reason),
    ]);
    return { id: e.id, decision: 'QUARANTINE', reason: decision.reason };
  }

  // ---- APPLY ---------------------------------------------------------------
  let cols = columnCache.get(e.table);
  if (!cols) { cols = await realColumns(e.table); columnCache.set(e.table, cols); }

  await prisma.$transaction(async (tx) => {
    // Suppress capture: applying a peer change must not journal an entry that
    // ships straight back and ping-pongs between the nodes forever.
    await tx.$executeRawUnsafe(`select set_config('orm.sync_applying','on',true)`);

    if (e.op === 'DELETE') {
      await tx.$executeRawUnsafe(`delete from ${q(e.table)} where id = $1`, e.rowId);
    } else {
      const payload = e.payload ?? {};
      // Only real columns, so a crafted payload key cannot become SQL. Omitted
      // large columns are simply absent and keep whatever this node holds.
      const keys = Object.keys(payload).filter((k) => cols!.has(k));
      const values = keys.map((k) => (payload as Record<string, unknown>)[k]);
      const placeholders = keys.map((_, i) => `$${i + 1}`);
      const updates = keys.filter((k) => k !== 'id').map((k) => `${q(k)} = excluded.${q(k)}`);

      await tx.$executeRawUnsafe(
        `insert into ${q(e.table)} (${keys.map(q).join(',')}) values (${placeholders.join(',')})
         on conflict (id) do update set ${updates.join(',')}`,
        ...values);
    }

    await tx.$executeRawUnsafe(`select set_config('orm.sync_applying','off',true)`);
    await tx.$executeRawUnsafe(
      `insert into sync_applied (journal_id, from_node, table_name, row_id, decision, reason)
       values ($1::uuid,$2,$3,$4,'APPLY',$5) on conflict (journal_id) do nothing`,
      e.id, fromNode, e.table, e.rowId, decision.reason);
  });

  return { id: e.id, decision: 'APPLY', reason: decision.reason };
}

async function record(
  e: JournalEntryWire, fromNode: string,
  decision: 'IGNORE' | 'QUARANTINE', reason: string
): Promise<EntryResult> {
  await prisma.$executeRawUnsafe(
    `insert into sync_applied (journal_id, from_node, table_name, row_id, decision, reason)
     values ($1::uuid,$2,$3,$4,$5,$6) on conflict (journal_id) do nothing`,
    e.id, fromNode, e.table, e.rowId, decision, reason);
  return { id: e.id, decision, reason };
}
