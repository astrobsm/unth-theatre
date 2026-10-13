// ============================================================
// POST /api/sync/node-report — the theatre server saying how it is
// ------------------------------------------------------------
// The theatre server has gone invisible three times, each for a different
// reason, each costing a day: serving a four-day-old build, blocked by a
// failed migration, and three weeks behind with ssh shut while the app itself
// answered fine. Every diagnosis required reaching INTO a machine behind a
// hospital NAT on a relayed link — which is the part that keeps failing.
//
// This reverses the direction. The sync worker already reaches OUT every
// cycle, through a path that has never been the problem, holding a token it
// already has. It now brings a short report of its own state along with it.
//
// One row per node, overwritten. "How is it right now", not a history: a
// growing table would need pruning and nobody has ever wanted to know what
// the queue depth was last March.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticateSync } from '@/lib/sync/serviceAuth';
import { apiError } from '@/lib/apiError';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * A report larger than this is a bug, not a report.
 *
 * The beacon exists to carry a dozen numbers. An unbounded jsonb column
 * reachable with a service token is somewhere a mistake could quietly write
 * megabytes on every sync cycle — which is the exact shape of the
 * announcements problem that wedged this queue for three days.
 */
const MAX_REPORT_BYTES = 16_000;

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> | null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'A report body is required.' }, { status: 400 });
  }

  // fromNode in the body, matching /sync/push and /sync/pull. One convention
  // for all three, so a node that can talk to one can talk to all of them.
  const auth = authenticateSync(
    request.headers.get('authorization'),
    (body as { fromNode?: unknown }).fromNode,
    process.env.SYNC_SERVICE_TOKEN,
  );
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {

    const serialised = JSON.stringify(body);
    if (serialised.length > MAX_REPORT_BYTES) {
      return NextResponse.json(
        { error: `A node report must be under ${MAX_REPORT_BYTES} bytes.` },
        { status: 413 },
      );
    }

    // The node's own clock is recorded as it claims, and the arrival time
    // separately. A node with a wrong clock is itself worth seeing, and
    // trusting its timestamp alone would let a stale report look fresh.
    const reportedAt = typeof (body as { at?: unknown }).at === 'string' && !Number.isNaN(Date.parse(String((body as { at?: unknown }).at)))
      ? new Date(String((body as { at?: unknown }).at))
      : new Date();

    await prisma.$executeRawUnsafe(
      `INSERT INTO sync_node_reports (node_id, reported_at, received_at, payload)
       VALUES ($1, $2, now(), $3::jsonb)
       ON CONFLICT (node_id) DO UPDATE
         SET reported_at = excluded.reported_at,
             received_at = now(),
             payload     = excluded.payload`,
      auth.node, reportedAt, serialised,
    );

    return NextResponse.json({ stored: true, node: auth.node });
  } catch (error) {
    return apiError('sync/node-report', error);
  }
}
