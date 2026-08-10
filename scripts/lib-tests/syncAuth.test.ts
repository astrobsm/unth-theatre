/**
 * Guarding the endpoints that accept database writes from another machine.
 *
 * There is no user behind these requests, so a session cannot protect them.
 * The failure mode if this is wrong is not an error message — it is another
 * machine writing to a hospital's clinical database.
 */
import { describe, expect, it } from 'vitest';

import { MIN_TOKEN_LENGTH, authenticateSync, bearerFrom, tokensMatch } from './sync/serviceAuth';

const GOOD = 'a'.repeat(48);

describe('comparing tokens', () => {
  it('accepts the right token and rejects a wrong one', () => {
    expect(tokensMatch(GOOD, GOOD)).toBe(true);
    expect(tokensMatch(GOOD, 'b'.repeat(48))).toBe(false);
  });

  it('does not throw on differing lengths', () => {
    // timingSafeEqual throws when lengths differ, and that throw is itself a
    // length oracle. Hashing both sides first keeps them equal-length.
    expect(() => tokensMatch('short', GOOD)).not.toThrow();
    expect(tokensMatch('short', GOOD)).toBe(false);
    expect(tokensMatch('', GOOD)).toBe(false);
  });

  it('is not fooled by a prefix', () => {
    expect(tokensMatch('a'.repeat(47), GOOD)).toBe(false);
    expect(tokensMatch(GOOD + 'x', GOOD)).toBe(false);
  });
});

describe('reading the header', () => {
  it('accepts the usual forms', () => {
    expect(bearerFrom(`Bearer ${GOOD}`)).toBe(GOOD);
    expect(bearerFrom(`bearer  ${GOOD} `)).toBe(GOOD);
  });

  it('returns null for anything else', () => {
    for (const h of [null, '', 'Basic abc', GOOD, 'Bearer']) expect(bearerFrom(h)).toBeNull();
  });
});

describe('authenticating a sync request', () => {
  it('admits a correct token with a named node', () => {
    const r = authenticateSync(`Bearer ${GOOD}`, 'local-unth', GOOD);
    expect(r.ok && r.node).toBe('local-unth');
  });

  it('FAILS CLOSED when no token is configured', () => {
    // An endpoint that accepts writes and has no secret set must refuse
    // everything. Silently accepting anything is worse than plainly broken.
    const r = authenticateSync(`Bearer ${GOOD}`, 'local-unth', undefined);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(503);
  });

  it('refuses a token too short to be worth having', () => {
    const weak = 'abc123';
    const r = authenticateSync(`Bearer ${weak}`, 'local-unth', weak);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(503);
    expect(MIN_TOKEN_LENGTH).toBeGreaterThanOrEqual(32);
  });

  it('separates "no token" from "wrong token"', () => {
    // 401 means authenticate; 403 means you did and it was wrong. Collapsing
    // them makes a misconfigured worker indistinguishable from an attacker.
    const missing = authenticateSync(null, 'local-unth', GOOD);
    const wrong = authenticateSync(`Bearer ${'z'.repeat(48)}`, 'local-unth', GOOD);
    expect(missing.ok).toBe(false);
    expect(wrong.ok).toBe(false);
    if (!missing.ok) expect(missing.status).toBe(401);
    if (!wrong.ok) expect(wrong.status).toBe(403);
  });

  it('requires the caller to say who it is', () => {
    for (const n of [undefined, null, '', '   ', 42]) {
      expect(authenticateSync(`Bearer ${GOOD}`, n, GOOD).ok, String(n)).toBe(false);
    }
  });
});
