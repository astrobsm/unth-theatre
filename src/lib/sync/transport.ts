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
  /**
   * UNKNOWN_TABLE is NOT acknowledged by the sender. The other three are
   * settled outcomes — the peer considered the change and acted. This one
   * means the peer could not classify the table at all, which is a statement
   * about the peer's code rather than about the change, and treating it as
   * settled deletes the entry on both sides.
   */
  decision: 'APPLY' | 'IGNORE' | 'QUARANTINE' | 'UNKNOWN_TABLE';
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
/**
 * How long one sync request may take before it is abandoned.
 *
 * Was 60 seconds, which sounds generous and is not. The peer is a serverless
 * platform: each route is its own function with its own warm state, and the
 * worker touches it once a minute — comfortably long enough to go cold between
 * cycles. Measured on 20 August against the live cloud:
 *
 *   cold request, doing no work at all      41.5 s
 *   warm request, empty batch                1.8 s
 *   warm request, one entry applied          6.8 s
 *
 * So a cold start alone consumed two thirds of the budget, and seven entries —
 * seven, of 363 bytes each — could not finish inside it. The push aborted every
 * cycle for fifty minutes while the PULL in the same cycle succeeded, because
 * the failed push had just warmed the function for it. Shrinking the batch,
 * which the worker dutifully did from 200 down to 12, changed nothing: there
 * were only seven entries to send.
 *
 * Two minutes covers a cold start plus a full batch with room to spare. The
 * cost of it being too long is a cycle that takes longer to give up; the cost
 * of it being too short is theatre data that never leaves the building.
 *
 * The other half of this fix is keeping the sync routes warm — see
 * .github/workflows/keep-warm.yml, which pinged the dashboard and the health
 * endpoint but never these.
 */
export const REQUEST_TIMEOUT_MS = 120_000;

/**
 * Never go below this. One entry per cycle is slow but it is progress, and
 * progress is the property that matters.
 */
export const MIN_BATCH_SIZE = 5;

/**
 * How large the next push should be, given how the last one went.
 *
 * THIS EXISTS BECAUSE A FIXED BATCH SIZE DEADLOCKS. On 18 August the theatre
 * server accumulated 176 unsent entries, 154 of them notifications. That batch
 * could not be transmitted and applied inside the 60-second timeout, so the
 * push was aborted — and the next attempt assembled the identical batch and was
 * aborted identically. Twenty consecutive failures, a backlog that could only
 * shrink by being sent, and a queue that grew while it retried.
 *
 * Nothing was broken: not the token, not the network, not a foreign key.
 * The batch was simply too big to ever succeed, and it had no way to get
 * smaller.
 *
 * So a timeout HALVES the batch. Ten entries will go where two hundred will
 * not, and once they are acknowledged the backlog is genuinely smaller. Success
 * grows the batch back gently, because the small size is a response to
 * conditions rather than a new permanent truth.
 *
 * Deliberately not applied to non-timeout failures. A 403 fails at any size,
 * and shrinking the batch in response would turn a clear authentication error
 * into a slow mysterious one.
 */
export function nextBatchSize(
  current: number,
  outcome: 'ok' | 'timeout',
  { max = BATCH_SIZE, min = MIN_BATCH_SIZE }: { max?: number; min?: number } = {},
): number {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  if (outcome === 'timeout') return clamp(Math.floor(current / 2));
  // Grow by half again, so recovery takes a few cycles rather than snapping
  // straight back to a size that has just been shown not to work.
  return clamp(Math.ceil(current * 1.5));
}

/**
 * Did this failure look like the request running out of time?
 *
 * The message is the AbortController's, which differs by runtime, so both
 * spellings are matched rather than relying on one.
 */
export function isTimeout(error: string | null | undefined): boolean {
  const e = (error ?? '').toLowerCase();
  return e.includes('abort') || e.includes('timeout') || e.includes('timed out');
}

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
