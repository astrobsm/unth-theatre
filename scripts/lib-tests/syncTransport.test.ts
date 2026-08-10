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
} from './sync/transport';

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
