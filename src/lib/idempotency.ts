// Server-side idempotency guard for offline-queued writes.
//
// The offline layer attaches a stable `X-Idempotency-Key` to every mutation on
// its FIRST attempt and on every reconnect replay. A route that opts in:
//   1. reads the key,
//   2. returns the stored response verbatim if this key was already completed
//      (so a replay never re-creates a record or re-fires notifications),
//   3. stores the first successful response under the key.
//
// Best-effort: any storage error degrades to normal (non-idempotent) behaviour
// rather than blocking the write. Old keys can be pruned by createdAt.
import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';

export function idempotencyKeyFrom(request: Request): string | null {
  const k = request.headers.get('x-idempotency-key') || request.headers.get('X-Idempotency-Key');
  return k && k.trim() ? k.trim() : null;
}

// If this key was already completed, return the stored NextResponse to replay.
export async function replayIfSeen(key: string | null): Promise<NextResponse | null> {
  if (!key) return null;
  try {
    const seen = await prisma.idempotencyKey.findUnique({ where: { key } });
    if (!seen) return null;
    return new NextResponse(seen.responseBody, {
      status: seen.responseStatus,
      headers: { 'Content-Type': 'application/json', 'X-Idempotent-Replay': 'true' },
    });
  } catch {
    return null;
  }
}

// Record the first successful response for this key (only 2xx are stored).
export async function rememberResult(key: string | null, status: number, body: unknown, route?: string): Promise<void> {
  if (!key || status < 200 || status >= 300) return;
  try {
    await prisma.idempotencyKey.create({
      data: { key, responseStatus: status, responseBody: JSON.stringify(body), route: route ?? null },
    });
  } catch {
    // Duplicate key (concurrent request) or storage error — ignore.
  }
}
