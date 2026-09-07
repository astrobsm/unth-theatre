/**
 * The wire contract and the retry rule.
 *
 * "Zero data loss" rests almost entirely on the retry rule being right: an
 * entry that is dropped because a failure was misjudged as permanent is work
 * that silently never arrives. So the tests here are mostly about what must
 * NOT happen.
 */
import { describe, expect, it } from 'vitest';

import {
  BATCH_SIZE,
  SYNC_PROTOCOL_VERSION,
  backoffMs,
  byHlc,
  isRetryable,
  validatePush,
  MIN_BATCH_SIZE,
  nextBatchSize,
  isTimeout,
  isTooLarge,
} from '../../src/lib/sync/transport';

describe('backoff', () => {
  const fixed = (r: number) => () => r;

  it('never returns less than the base interval', () => {
    // A hard failure loop must not become a hot spin against a struggling peer.
    for (let n = 0; n < 30; n++) {
      expect(backoffMs(n, { random: fixed(0) })).toBeGreaterThanOrEqual(60_000);
    }
  });

  it('never exceeds the cap, however long the outage', () => {
    // Without the exponent clamp, 2^n overflows to Infinity and the worker
    // schedules a retry that never fires — sync stops permanently after a long
    // outage, which is exactly when it is needed most.
    for (const n of [10, 50, 1000, Number.MAX_SAFE_INTEGER]) {
      const ms = backoffMs(n, { random: fixed(1) });
      expect(Number.isFinite(ms)).toBe(true);
      expect(ms).toBeLessThanOrEqual(15 * 60_000);
    }
  });

  it('grows with consecutive failures', () => {
    const a = backoffMs(1, { random: fixed(1) });
    const b = backoffMs(4, { random: fixed(1) });
    expect(b).toBeGreaterThan(a);
  });

  it('spreads retries out, so both directions do not reconnect in the same instant', () => {
    const spread = new Set(Array.from({ length: 200 }, () => backoffMs(5)));
    expect(spread.size).toBeGreaterThan(50);
  });
});

describe('what is worth retrying', () => {
  it('retries anything that looks like the network', () => {
    // The whole system exists because this link fails. A dropped connection is
    // the normal case, not an error condition.
    expect(isRetryable(null)).toBe(true);
    for (const s of [408, 429, 500, 502, 503, 504]) expect(isRetryable(s), String(s)).toBe(true);
  });

  it('does not retry a fault that retrying cannot fix', () => {
    // A bad token or a protocol mismatch fails identically forever; retrying
    // hides the problem behind a queue that never drains.
    for (const s of [400, 401, 403, 409, 422]) expect(isRetryable(s), String(s)).toBe(false);
  });

  it('treats success as not-retryable', () => {
    expect(isRetryable(200)).toBe(false);
  });
});

describe('ordering', () => {
  it('sorts by clock so a batch applies causally regardless of arrival order', () => {
    const entries = [{ hlc: 'c' }, { hlc: 'a' }, { hlc: 'b' }];
    expect([...entries].sort(byHlc).map((e) => e.hlc)).toEqual(['a', 'b', 'c']);
  });
});

const entry = (over: Record<string, unknown> = {}) => ({
  id: '11111111-1111-1111-1111-111111111111',
  table: 'wards', rowId: 'w1', op: 'INSERT',
  baseVersion: 0, newVersion: 1, hlc: '000000000001:000000:local-unth',
  originNode: 'local-unth', payload: { id: 'w1' },
  changedColumns: null, omittedColumns: null, omittedDigest: null,
  ...over,
});

const push = (over: Record<string, unknown> = {}) => ({
  protocol: SYNC_PROTOCOL_VERSION, fromNode: 'local-unth', entries: [entry()], ...over,
});

describe('validating an incoming batch', () => {
  it('accepts a well-formed one', () => {
    expect(validatePush(push()).ok).toBe(true);
  });

  it('refuses a protocol it cannot read, rather than guessing', () => {
    const r = validatePush(push({ protocol: 99 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('99');
  });

  it('refuses a batch larger than the agreed limit', () => {
    // An unbounded body is a way to exhaust memory on a hospital server.
    const r = validatePush(push({ entries: Array.from({ length: BATCH_SIZE + 1 }, () => entry()) }));
    expect(r.ok).toBe(false);
  });

  it('refuses an entry missing anything the apply step needs', () => {
    // Rejected WHOLE rather than half-applied: this endpoint takes writes from
    // another node, so a malformed batch must not land partially.
    for (const bad of [
      { id: undefined }, { table: undefined }, { rowId: undefined },
      { op: 'TRUNCATE' }, { hlc: '' },
    ]) {
      expect(validatePush(push({ entries: [entry(bad)] })).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it('refuses a write with no payload, but allows a delete without one', () => {
    expect(validatePush(push({ entries: [entry({ op: 'UPDATE', payload: null })] })).ok).toBe(false);
    expect(validatePush(push({ entries: [entry({ op: 'DELETE', payload: null })] })).ok).toBe(true);
  });

  it('refuses rubbish without throwing', () => {
    for (const b of [null, undefined, 'x', 42, []]) {
      expect(validatePush(b).ok, String(b)).toBe(false);
    }
  });
});

describe('a batch that can get smaller', () => {
  // The 18 August stall. 176 unsent entries, 154 of them notifications, a batch
  // too large to transmit and apply inside the 60-second timeout — and the next
  // attempt assembled the identical batch and failed identically. Twenty
  // consecutive failures against a backlog that could only shrink by being
  // sent. Nothing was broken; the batch simply had no way to get smaller.
  it('halves the batch after a timeout', () => {
    expect(nextBatchSize(200, 'timeout')).toBe(100);
    expect(nextBatchSize(100, 'timeout')).toBe(50);
  });

  it('keeps halving until something can actually get through', () => {
    let size = 200;
    for (let i = 0; i < 10; i++) size = nextBatchSize(size, 'timeout');
    expect(size).toBe(MIN_BATCH_SIZE);
  });

  it('never reaches zero, because zero is not progress', () => {
    // One small batch per cycle is slow. Slow drains; stuck does not.
    expect(nextBatchSize(1, 'timeout')).toBeGreaterThan(0);
    expect(nextBatchSize(MIN_BATCH_SIZE, 'timeout')).toBe(MIN_BATCH_SIZE);
  });

  it('grows back gradually on success, not straight back to the size that failed', () => {
    expect(nextBatchSize(10, 'ok')).toBe(15);
    expect(nextBatchSize(100, 'ok')).toBe(150);
  });

  it('never grows past the protocol limit the peer enforces', () => {
    // The push endpoint rejects anything over BATCH_SIZE outright, so growing
    // past it would trade a timeout for a 400.
    expect(nextBatchSize(BATCH_SIZE, 'ok')).toBe(BATCH_SIZE);
    expect(nextBatchSize(BATCH_SIZE - 1, 'ok')).toBe(BATCH_SIZE);
  });

  it('recognises the abort message the runtime actually produces', () => {
    // What the log showed for twenty cycles.
    expect(isTimeout('push failed: This operation was aborted')).toBe(true);
    expect(isTimeout('The operation timed out')).toBe(true);
    expect(isTimeout('AbortError')).toBe(true);
  });

  it('does not treat an authentication failure as a timeout', () => {
    // A 403 fails at any size. Shrinking the batch for it would turn a clear
    // error into a slow mysterious one.
    expect(isTimeout('push failed: HTTP 403')).toBe(false);
    expect(isTimeout(null)).toBe(false);
  });
});

/**
 * 7 September 2026. The theatre server stopped pushing for five days and
 * nobody could tell, because the failure looked like a decision.
 *
 * Vercel answered 413 FUNCTION_PAYLOAD_TOO_LARGE. isRetryable filed that with
 * 403 and 422 as "misconfiguration, will fail identically forever", so the
 * worker exited; systemd restarted it 28 times into the identical failure and
 * then gave up. 962 changes sat unsent — 50 surgeries, 32 emergency bookings,
 * 23 PACU assessments — with the oldest five days old.
 *
 * 413 is the one 4xx that is a statement about the SIZE OF THIS REQUEST rather
 * than about the link, the token or the protocol, and the remedy already
 * existed for timeouts: halve the batch and try again.
 */
describe('a body the peer refuses as too large', () => {
  it('is retryable, unlike the other 4xx', () => {
    expect(isRetryable(413)).toBe(true);
    // Unchanged: these really do fail identically at any size.
    expect(isRetryable(400)).toBe(false);
    expect(isRetryable(401)).toBe(false);
    expect(isRetryable(403)).toBe(false);
    expect(isRetryable(422)).toBe(false);
  });

  it('is recognised by status, and by the wording when the status is lost', () => {
    expect(isTooLarge(413)).toBe(true);
    expect(isTooLarge(null, 'push failed: Request Entity Too Large')).toBe(true);
    expect(isTooLarge(null, 'FUNCTION_PAYLOAD_TOO_LARGE')).toBe(true);
    expect(isTooLarge(null, 'payload too large')).toBe(true);
  });

  it('is not confused with an ordinary failure', () => {
    expect(isTooLarge(500, 'internal error')).toBe(false);
    expect(isTooLarge(403, 'forbidden')).toBe(false);
    expect(isTooLarge(null, null)).toBe(false);
    expect(isTooLarge(null, 'the request timed out')).toBe(false);
  });

  it('halves the batch, exactly as a timeout does', () => {
    expect(nextBatchSize(200, 'too-large')).toBe(100);
    expect(nextBatchSize(100, 'too-large')).toBe(50);
  });

  it('never shrinks below the floor, so progress is always possible', () => {
    expect(nextBatchSize(MIN_BATCH_SIZE, 'too-large')).toBe(MIN_BATCH_SIZE);
    expect(nextBatchSize(6, 'too-large')).toBe(MIN_BATCH_SIZE);
  });

  it('converges from a full batch to the floor in a handful of cycles', () => {
    // The property that matters: repeated refusal must reach a size that can
    // get through, rather than repeating one that cannot.
    let size = BATCH_SIZE;
    const seen = [size];
    for (let i = 0; i < 10 && size > MIN_BATCH_SIZE; i++) {
      size = nextBatchSize(size, 'too-large');
      seen.push(size);
    }
    expect(size).toBe(MIN_BATCH_SIZE);
    expect(seen.length).toBeLessThanOrEqual(8);
  });

  it('still grows back after a success', () => {
    expect(nextBatchSize(MIN_BATCH_SIZE, 'ok')).toBeGreaterThan(MIN_BATCH_SIZE);
  });
});
