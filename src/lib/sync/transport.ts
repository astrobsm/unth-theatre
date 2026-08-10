// ============================================================
// The sync wire contract, and when to try again
// ------------------------------------------------------------
// Shared by the worker on the local server and the route handlers on the
// cloud, so the two cannot drift apart in what they think a batch looks like.
//
// The retry policy is here rather than inline in the worker because it is the
// part that decides whether work is LOST or merely DELAYED, and that deserves
// to be tested rather than reasoned about at 2am.
// ============================================================

/** Bumped when the batch shape changes. A peer refuses a version it cannot read. */
export const SYNC_PROTOCOL_VERSION = 1;

export interface JournalEntryWire {
  id: string;
  table: string;
  rowId: string;
  op: 'INSERT' | 'UPDATE' | 'DELETE';
  baseVersion: number;
  newVersion: number;
  hlc: string;
  originNode: string;
  payload: Record<string, unknown> | null;
  changedColumns: string[] | null;
  /** Large columns held back, with a digest so divergence stays detectable. */
  omittedColumns: string[] | null;
  omittedDigest: string | null;
}

export interface PushRequest {
  protocol: number;
  fromNode: string;
  entries: JournalEntryWire[];
}

export interface EntryResult {
  id: string;
  decision: 'APPLY' | 'IGNORE' | 'QUARANTINE';
  reason: string;
}

export interface PushResponse {
  protocol: number;
  node: string;
  /** Per entry, so the sender acknowledges exactly what the peer processed. */
  results: EntryResult[];
}

export interface PullRequest {
  protocol: number;
  fromNode: string;
  /** Highest peer HLC already applied. Empty string means "from the beginning". */
  cursor: string;
  limit: number;
}

export interface PullResponse {
  protocol: number;
  node: string;
  entries: JournalEntryWire[];
  /** Advance the cursor to this once every entry above is applied. */
  nextCursor: string;
  /** How many remain after this batch, so an operator can see a backlog draining. */
  remaining: number;
}

/**
 * How many entries per request.
 *
 * Small enough that a dropped connection wastes little, and that one batch fits
 * comfortably in a request body even when a payload is a large row. A failed
 * batch is retried whole, so the cost of a failure is bounded by this number.
 */
export const BATCH_SIZE = 200;

/** Give up on a single attempt after this. The link here is a domestic uplink. */
export const REQUEST_TIMEOUT_MS = 60_000;

export interface BackoffOptions {
  baseMs?: number;
  maxMs?: number;
  /** 0 disables jitter. Injected so tests are deterministic. */
  random?: () => number;
}

/**
 * Exponential backoff with full jitter.
 *
 * Jitter is not decoration. Both directions retry on the same timer, and the
 * hospital link fails for both at once, so without it every worker in the
 * building reconnects in the same instant the internet returns and the first
 * thing the recovered link sees is a thundering herd.
 *
 * Capped at 15 minutes: long enough not to hammer a dead link, short enough
 * that nobody waits an hour for sync to resume after a power cut.
 */
export function backoffMs(
  consecutiveErrors: number,
  { baseMs = 60_000, maxMs = 15 * 60_000, random = Math.random }: BackoffOptions = {}
): number {
  if (consecutiveErrors <= 0) return baseMs;
  // 2^n grows fast; clamp the exponent before it overflows into Infinity.
  const exp = Math.min(consecutiveErrors, 20);
  const ceiling = Math.min(maxMs, baseMs * 2 ** exp);
  // Full jitter: anywhere in [base, ceiling]. Never below base, so a hard
  // failure loop cannot turn into a hot spin against a struggling peer.
  return Math.round(baseMs + random() * Math.max(0, ceiling - baseMs));
}

/**
 * Is this worth retrying, or is it a fault that retrying cannot fix?
 *
 * The distinction matters because "no data loss" is only achievable if
 * transient failures are retried FOREVER. Entries are never dropped on age or
 * attempt count — a week-long outage must leave the journal intact, not
 * quietly truncated. Permanent faults still do not drop the entry; they stop
 * the loop and raise it, which is a decision for a person.
 */
export function isRetryable(status: number | null, err?: unknown): boolean {
  // No response at all: the network, which is the normal case here.
  if (status === null) return true;
  if (status === 408 || status === 429) return true;
  if (status >= 500) return true;
  // 400/401/403/409/422 are a misconfiguration or a protocol mismatch, and
  // will fail identically forever. Retrying them just hides the problem.
  if (status >= 400) return false;
  void err;
  return false;
}

/** Sort key so a batch is applied in causal order regardless of arrival order. */
export const byHlc = (a: { hlc: string }, b: { hlc: string }): number =>
  a.hlc < b.hlc ? -1 : a.hlc > b.hlc ? 1 : 0;

/**
 * Validate a batch before touching the database.
 *
 * This endpoint takes writes from another node, so the body is untrusted even
 * though the token is checked: a malformed batch must be rejected whole rather
 * than half-applied.
 */
export function validatePush(body: unknown): { ok: true; req: PushRequest } | { ok: false; error: string } {
  const b = body as Partial<PushRequest>;
  if (!b || typeof b !== 'object') return { ok: false, error: 'Body must be an object.' };
  if (b.protocol !== SYNC_PROTOCOL_VERSION) {
    return { ok: false, error: `Protocol ${b.protocol} not supported; this node speaks ${SYNC_PROTOCOL_VERSION}.` };
  }
  if (typeof b.fromNode !== 'string' || !b.fromNode.trim()) return { ok: false, error: 'fromNode is required.' };
  if (!Array.isArray(b.entries)) return { ok: false, error: 'entries must be an array.' };
  if (b.entries.length > BATCH_SIZE) {
    return { ok: false, error: `Batch of ${b.entries.length} exceeds the ${BATCH_SIZE} limit.` };
  }
  for (const e of b.entries) {
    if (!e || typeof e.id !== 'string') return { ok: false, error: 'Every entry needs an id.' };
    if (typeof e.table !== 'string' || typeof e.rowId !== 'string') {
      return { ok: false, error: `Entry ${e.id} is missing table or rowId.` };
    }
    if (!['INSERT', 'UPDATE', 'DELETE'].includes(e.op)) {
      return { ok: false, error: `Entry ${e.id} has an unknown op.` };
    }
    if (typeof e.hlc !== 'string' || !e.hlc) return { ok: false, error: `Entry ${e.id} has no clock stamp.` };
    if (e.op !== 'DELETE' && (e.payload === null || typeof e.payload !== 'object')) {
      return { ok: false, error: `Entry ${e.id} is a ${e.op} with no payload.` };
    }
  }
  return { ok: true, req: b as PushRequest };
}
