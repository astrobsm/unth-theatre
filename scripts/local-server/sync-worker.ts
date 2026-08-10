/**
 * Sync worker — the only thing that moves data between the two databases.
 * ============================================================================
 *
 *   SYNC_PEER_URL=https://unth-theatre-mai.vercel.app \
 *   SYNC_SERVICE_TOKEN=... DATABASE_URL=... npx tsx scripts/local-server/sync-worker.ts
 *
 * or as a service: ./install-sync-worker.sh
 *
 * It runs on the LOCAL server and always initiates, in both directions. The
 * cloud cannot reach the hospital — NAT, domestic uplink, no inbound route —
 * so a pull-shaped protocol is not a preference here, it is the only thing
 * that can work.
 *
 * ONE CYCLE: push everything unacknowledged, then pull everything unseen.
 * Push first, deliberately: the hospital's own work is the data that exists in
 * one place only, and if the link closes mid-cycle that is what should already
 * have left.
 *
 * NOTHING IS EVER DROPPED. An entry stays unacknowledged until the peer
 * confirms what it did with it. A week-long outage grows the journal; it does
 * not lose a single write.
 */

import { PrismaClient } from '@prisma/client';
import {
  BATCH_SIZE, REQUEST_TIMEOUT_MS, SYNC_PROTOCOL_VERSION,
  backoffMs, isRetryable,
  type JournalEntryWire, type PullResponse, type PushResponse,
} from '../../src/lib/sync/transport';
import { applyEntry, type TxRunner } from '../../src/lib/sync/applyEntry';

const PEER_URL = (process.env.SYNC_PEER_URL ?? '').replace(/\/+$/, '');
const TOKEN = process.env.SYNC_SERVICE_TOKEN ?? '';
const INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS ?? 60_000);
const ONCE = process.argv.includes('--once');

if (!PEER_URL || !TOKEN) {
  console.error('SYNC_PEER_URL and SYNC_SERVICE_TOKEN are both required.');
  process.exit(1);
}

const prisma = new PrismaClient();
const db = prisma as unknown as TxRunner;
const columnCache = new Map<string, Set<string>>();

let stopping = false;
let consecutiveErrors = 0;

async function thisNode(): Promise<string> {
  const r = await prisma.$queryRawUnsafe<Array<{ node_id: string }>>(
    'select node_id from sync_node where id limit 1');
  return r[0]?.node_id ?? 'unset';
}

async function call<T>(path: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number | null; error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${PEER_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, status: res.status, error: text.slice(0, 300) };
    return { ok: true, data: JSON.parse(text) as T };
  } catch (e) {
    // No status at all: the network, which is the expected case here.
    return { ok: false, status: null, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/** Send what the peer has not confirmed, oldest first. */
async function push(node: string): Promise<{ sent: number; failed: boolean }> {
  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string; table_name: string; row_id: string; op: string;
    base_version: number; new_version: number; hlc: string; origin_node: string;
    payload: Record<string, unknown> | null; changed_cols: string[] | null;
    omitted_cols: string[] | null; omitted_digest: string | null;
  }>>(
    `select id::text, table_name, row_id, op, base_version, new_version, hlc, origin_node,
            payload, changed_cols, omitted_cols, omitted_digest
       from sync_journal
      where ack_at is null and origin_node = $1
      order by hlc
      limit $2`, node, BATCH_SIZE);

  if (!rows.length) return { sent: 0, failed: false };

  const entries: JournalEntryWire[] = rows.map((r) => ({
    id: r.id, table: r.table_name, rowId: r.row_id, op: r.op as JournalEntryWire['op'],
    baseVersion: r.base_version, newVersion: r.new_version, hlc: r.hlc,
    originNode: r.origin_node, payload: r.payload, changedColumns: r.changed_cols,
    omittedColumns: r.omitted_cols, omittedDigest: r.omitted_digest,
  }));

  await prisma.$executeRawUnsafe(
    `update sync_journal set shipped_at = now(), attempts = attempts + 1 where id = any($1::uuid[])`,
    entries.map((e) => e.id));

  const res = await call<PushResponse>('/api/sync/push', {
    protocol: SYNC_PROTOCOL_VERSION, fromNode: node, entries,
  });

  if (!res.ok) {
    await prisma.$executeRawUnsafe(
      `update sync_journal set last_error = $2 where id = any($1::uuid[])`,
      entries.map((e) => e.id), res.error);
    throw Object.assign(new Error(`push failed: ${res.error}`), { status: res.status });
  }

  // Acknowledge ONLY what the peer reported on. An entry it never mentioned
  // stays unacknowledged and is sent again, which is the whole no-loss rule.
  const acked = res.data.results.map((r) => r.id);
  if (acked.length) {
    await prisma.$executeRawUnsafe(
      `update sync_journal set ack_at = now(), last_error = null where id = any($1::uuid[])`, acked);
  }
  const quarantined = res.data.results.filter((r) => r.decision === 'QUARANTINE').length;
  if (quarantined) console.warn(`[sync] peer quarantined ${quarantined} change(s) — a person must resolve them`);
  return { sent: acked.length, failed: false };
}

/** Fetch and apply what the peer originated and we have not seen. */
async function pull(node: string): Promise<number> {
  const state = await prisma.$queryRawUnsafe<Array<{ pull_cursor: string }>>(
    `select pull_cursor from sync_state where peer_node = 'cloud'`);
  const cursor = state[0]?.pull_cursor ?? '';

  const res = await call<PullResponse>('/api/sync/pull', {
    protocol: SYNC_PROTOCOL_VERSION, fromNode: node, cursor, limit: BATCH_SIZE,
  });
  if (!res.ok) throw Object.assign(new Error(`pull failed: ${res.error}`), { status: res.status });

  let applied = 0;
  for (const e of res.data.entries) {
    try {
      const r = await applyEntry(db, e, res.data.node, node, columnCache);
      if (r.decision === 'APPLY') applied++;
      if (r.decision === 'QUARANTINE') {
        console.warn(`[sync] quarantined ${e.table}/${e.rowId}: ${r.reason}`);
      }
    } catch (err) {
      // Stop at the first failure rather than skipping past it. Advancing the
      // cursor over an entry we could not apply would lose it silently, and
      // this loop will retry from here on the next cycle.
      console.error(`[sync] could not apply ${e.id} (${e.table}):`, err);
      throw err;
    }
  }

  // Only after every entry in the batch succeeded.
  await prisma.$executeRawUnsafe(
    `insert into sync_state (peer_node, pull_cursor, last_pull_at, last_pull_ok_at, consecutive_errors, last_error)
     values ('cloud', $1, now(), now(), 0, null)
     on conflict (peer_node) do update set
       pull_cursor = excluded.pull_cursor, last_pull_at = now(), last_pull_ok_at = now(),
       consecutive_errors = 0, last_error = null, updated_at = now()`,
    res.data.nextCursor);

  if (res.data.remaining > 0) console.log(`[sync] ${res.data.remaining} more waiting; will continue next cycle`);
  return applied;
}

async function cycle(): Promise<void> {
  const node = await thisNode();
  if (node === 'unset') {
    console.warn('[sync] node id is "unset" — refusing to sync until it is configured');
    return;
  }

  const pushed = await push(node);
  const pulled = await pull(node);

  await prisma.$executeRawUnsafe(
    `insert into sync_state (peer_node, last_push_at, last_push_ok_at, consecutive_errors, last_error)
     values ('cloud', now(), now(), 0, null)
     on conflict (peer_node) do update set
       last_push_at = now(), last_push_ok_at = now(),
       consecutive_errors = 0, last_error = null, updated_at = now()`);

  if (pushed.sent || pulled) console.log(`[sync] pushed ${pushed.sent}, applied ${pulled}`);
}

async function loop(): Promise<void> {
  while (!stopping) {
    let waitMs = INTERVAL_MS;
    try {
      await cycle();
      consecutiveErrors = 0;
    } catch (e) {
      consecutiveErrors++;
      const status = (e as { status?: number | null }).status ?? null;
      const message = e instanceof Error ? e.message : String(e);

      await prisma.$executeRawUnsafe(
        `insert into sync_state (peer_node, consecutive_errors, last_error, next_attempt_at)
         values ('cloud', $1, $2, now())
         on conflict (peer_node) do update set
           consecutive_errors = $1, last_error = $2, updated_at = now()`,
        consecutiveErrors, message.slice(0, 500));

      if (!isRetryable(status, e)) {
        // A bad token or a protocol mismatch fails identically forever.
        // Retrying would hide it behind a queue that never drains, so stop and
        // let the service manager surface it. Nothing is lost: the journal
        // keeps every unacknowledged entry.
        console.error(`[sync] permanent failure (HTTP ${status}): ${message}`);
        console.error('[sync] stopping. Nothing was lost; fix the cause and restart.');
        process.exitCode = 1;
        return;
      }

      waitMs = backoffMs(consecutiveErrors);
      console.warn(`[sync] ${message} — retrying in ${Math.round(waitMs / 1000)}s (failure ${consecutiveErrors})`);
    }

    if (ONCE) return;
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.log(`[sync] ${sig} — finishing the current cycle`);
    stopping = true;
  });
}

console.log(`[sync] peer ${PEER_URL}, every ${Math.round(INTERVAL_MS / 1000)}s`);
loop()
  .catch((e) => { console.error('[sync] fatal:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
