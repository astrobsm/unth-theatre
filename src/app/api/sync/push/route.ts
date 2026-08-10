import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticateSync } from '@/lib/sync/serviceAuth';
import { byHlc, validatePush, SYNC_PROTOCOL_VERSION, type EntryResult } from '@/lib/sync/transport';
import { applyEntry, type TxRunner } from '@/lib/sync/applyEntry';

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

  for (const e of [...parsed.req.entries].sort(byHlc)) {
    try {
      // Same implementation the worker uses when pulling. See lib/sync/applyEntry.
      results.push(await applyEntry(prisma as unknown as TxRunner, e, auth.node, thisNode, columnCache));
    } catch (err) {
      // One bad entry must not fail the batch: the rest is good work, and the
      // sender retries only what it got no result for.
      console.error('[sync/push] entry failed', e.id, err);
    }
  }

  return NextResponse.json({ protocol: SYNC_PROTOCOL_VERSION, node: thisNode, results });
}
