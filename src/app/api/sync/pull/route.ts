import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticateSync } from '@/lib/sync/serviceAuth';
import { BATCH_SIZE, SYNC_PROTOCOL_VERSION, type JournalEntryWire } from '@/lib/sync/transport';
import { isSynced } from '@/lib/sync/syncPolicy';

export const dynamic = 'force-dynamic';

/**
 * POST /api/sync/pull — hand the peer everything it has not seen.
 *
 * A POST rather than a GET because the cursor is a clock stamp that belongs in
 * a body, and because this must never be cached by anything in between.
 *
 * The cloud cannot reach the hospital, so the local node polls this. That is
 * the whole reason the protocol is pull-shaped.
 */
export async function POST(req: NextRequest) {
  let body: { protocol?: number; fromNode?: unknown; cursor?: unknown; limit?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const auth = authenticateSync(
    req.headers.get('authorization'), body?.fromNode, process.env.SYNC_SERVICE_TOKEN);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (body.protocol !== SYNC_PROTOCOL_VERSION) {
    return NextResponse.json(
      { error: `Protocol ${body.protocol} not supported; this node speaks ${SYNC_PROTOCOL_VERSION}.` },
      { status: 400 });
  }

  const cursor = typeof body.cursor === 'string' ? body.cursor : '';
  const limit = Math.min(
    Number.isFinite(body.limit) ? Math.max(1, Number(body.limit)) : BATCH_SIZE,
    BATCH_SIZE);

  const node = await prisma.$queryRawUnsafe<Array<{ node_id: string }>>(
    'select node_id from sync_node where id limit 1');
  const thisNode = node[0]?.node_id ?? 'unset';

  // Only entries WE originated. Relaying a peer's own changes back would make
  // every round trip grow, and each node already has its own history.
  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string; table_name: string; row_id: string; op: string;
    base_version: number; new_version: number; hlc: string; origin_node: string;
    payload: Record<string, unknown> | null; changed_cols: string[] | null;
    omitted_cols: string[] | null; omitted_digest: string | null;
  }>>(
    `select id::text, table_name, row_id, op, base_version, new_version, hlc, origin_node,
            payload, changed_cols, omitted_cols, omitted_digest
       from sync_journal
      where origin_node = $1 and hlc > $2
      order by hlc
      limit $3`,
    thisNode, cursor, limit);

  const remaining = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `select count(*)::bigint as n from sync_journal
      where origin_node = $1 and hlc > $2`,
    thisNode, rows.length ? rows[rows.length - 1].hlc : cursor);

  // A table declassified since the entry was written is skipped here rather
  // than at the far end, so an unsynced table's data never leaves this node.
  const entries: JournalEntryWire[] = rows
    .filter((r) => isSynced(r.table_name))
    .map((r) => ({
      id: r.id,
      table: r.table_name,
      rowId: r.row_id,
      op: r.op as JournalEntryWire['op'],
      baseVersion: r.base_version,
      newVersion: r.new_version,
      hlc: r.hlc,
      originNode: r.origin_node,
      payload: r.payload,
      changedColumns: r.changed_cols,
      omittedColumns: r.omitted_cols,
      omittedDigest: r.omitted_digest,
    }));

  return NextResponse.json({
    protocol: SYNC_PROTOCOL_VERSION,
    node: thisNode,
    entries,
    // Advance past everything READ, including entries filtered out above, or
    // the cursor would stick on a declassified row forever.
    nextCursor: rows.length ? rows[rows.length - 1].hlc : cursor,
    remaining: Number(remaining[0]?.n ?? 0),
  });
}
