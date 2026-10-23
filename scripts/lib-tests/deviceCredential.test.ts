import { describe, it, expect } from 'vitest';
import {
  newDeviceCredential,
  parseDeviceCredential,
  verifierMatches,
  decideCredential,
  hashVerifier,
  DEVICE_CREDENTIAL_TTL_MS,
} from '../../src/lib/auth/deviceCredential';

// This is the thing that signs a surgeon in without a password, so every test
// here is about the ways it must REFUSE. A bug that lets someone in is not
// visible from the outside: the app simply works, for the wrong person.

describe('minting — what the phone gets and what the server keeps', () => {
  it('never stores the secret half', () => {
    const c = newDeviceCredential();
    const verifier = c.credential.slice(c.selector.length + 1);
    expect(c.verifierHash).not.toContain(verifier);
    expect(c.verifierHash).toBe(hashVerifier(verifier));
    // The credential handed to the phone must not be recoverable from the row.
    expect(c.credential).not.toBe(c.verifierHash);
  });

  it('is unguessable', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(newDeviceCredential().credential);
    expect(seen.size).toBe(500);
    // 32 random bytes base64url-encoded; anything much shorter means the
    // randomBytes call was changed.
    const { credential, selector } = newDeviceCredential();
    expect(credential.slice(selector.length + 1).length).toBeGreaterThanOrEqual(40);
  });

  it('survives JSON and Android preference storage unescaped', () => {
    // base64url only. A '+' or '/' from plain base64 gets mangled somewhere
    // between the server and Keystore and presents as a wrong fingerprint,
    // which is the least debuggable symptom available.
    for (let i = 0; i < 200; i++) {
      expect(newDeviceCredential().credential).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    }
  });

  it('expires ninety days out, not never', () => {
    const now = new Date('2026-10-23T09:00:00Z');
    const c = newDeviceCredential(now);
    expect(c.expiresAt.getTime() - now.getTime()).toBe(DEVICE_CREDENTIAL_TTL_MS);
    expect(DEVICE_CREDENTIAL_TTL_MS).toBe(90 * 24 * 60 * 60 * 1000);
  });
});

describe('parsing — a malformed credential is a refusal, never a crash', () => {
  it('round-trips what it minted', () => {
    const c = newDeviceCredential();
    const parsed = parseDeviceCredential(c.credential);
    expect(parsed?.selector).toBe(c.selector);
    expect(verifierMatches(parsed!.verifier, c.verifierHash)).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['whitespace', '   '],
    ['no separator', 'abcdef'],
    ['leading separator', '.verifier'],
    ['trailing separator', 'selector.'],
    ['two separators', 'a.b.c'],
    ['null', null],
    ['undefined', undefined],
    ['a number', 12345],
    ['an object', { selector: 'a', verifier: 'b' }],
  ])('refuses %s', (_label, input) => {
    expect(parseDeviceCredential(input as never)).toBeNull();
  });
});

describe('verifier comparison', () => {
  it('accepts the right secret and rejects a near miss', () => {
    const c = newDeviceCredential();
    const verifier = c.credential.slice(c.selector.length + 1);
    expect(verifierMatches(verifier, c.verifierHash)).toBe(true);
    expect(verifierMatches(verifier.slice(0, -1) + 'x', c.verifierHash)).toBe(false);
    expect(verifierMatches('', c.verifierHash)).toBe(false);
  });

  it('returns false rather than throwing on a corrupted stored hash', () => {
    // timingSafeEqual throws on a length mismatch. An exception here would
    // surface as a 500 instead of a refused sign-in.
    const c = newDeviceCredential();
    const verifier = c.credential.slice(c.selector.length + 1);
    expect(() => verifierMatches(verifier, 'truncated')).not.toThrow();
    expect(verifierMatches(verifier, 'truncated')).toBe(false);
  });
});

describe('the decision', () => {
  const now = new Date('2026-10-23T09:00:00Z');
  const fresh = () => {
    const c = newDeviceCredential(now);
    return { c, verifier: c.credential.slice(c.selector.length + 1) };
  };

  it('admits a live credential', () => {
    const { c, verifier } = fresh();
    const d = decideCredential(
      { verifierHash: c.verifierHash, expiresAt: c.expiresAt, revokedAt: null },
      verifier,
      now,
    );
    expect(d.ok).toBe(true);
  });

  it('refuses a selector it has never seen', () => {
    expect(decideCredential(null, 'anything', now)).toEqual({ ok: false, reason: 'unknown' });
  });

  it('refuses a revoked credential even with the correct secret', () => {
    const { c, verifier } = fresh();
    const d = decideCredential(
      { verifierHash: c.verifierHash, expiresAt: c.expiresAt, revokedAt: new Date('2026-10-22T00:00:00Z') },
      verifier,
      now,
    );
    expect(d).toEqual({ ok: false, reason: 'revoked' });
  });

  it('reports revoked, not expired, when a credential is both', () => {
    // "Taken off the account" and "not used since July" are different events
    // and the audit trail should not merge them.
    const { c, verifier } = fresh();
    const d = decideCredential(
      {
        verifierHash: c.verifierHash,
        expiresAt: new Date('2026-01-01T00:00:00Z'),
        revokedAt: new Date('2026-02-01T00:00:00Z'),
      },
      verifier,
      now,
    );
    expect(d).toEqual({ ok: false, reason: 'revoked' });
  });

  it('refuses on the stroke of expiry, not a moment after', () => {
    const { c, verifier } = fresh();
    const row = { verifierHash: c.verifierHash, expiresAt: c.expiresAt, revokedAt: null };
    const justBefore = new Date(c.expiresAt.getTime() - 1);
    const exactly = new Date(c.expiresAt.getTime());
    expect(decideCredential(row, verifier, justBefore).ok).toBe(true);
    expect(decideCredential(row, verifier, exactly)).toEqual({ ok: false, reason: 'expired' });
  });

  it('checks the secret LAST, so a wrong secret cannot confirm a real selector', () => {
    // A revoked row with a wrong secret must answer 'revoked' — the same as a
    // revoked row with the right secret. If this ever reported 'mismatch',
    // the difference would tell a prober which selectors exist.
    const { c } = fresh();
    const d = decideCredential(
      { verifierHash: c.verifierHash, expiresAt: c.expiresAt, revokedAt: new Date('2026-10-01T00:00:00Z') },
      'completely-wrong',
      now,
    );
    expect(d).toEqual({ ok: false, reason: 'revoked' });
  });

  it('refuses a wrong secret for a live credential', () => {
    const { c } = fresh();
    const d = decideCredential(
      { verifierHash: c.verifierHash, expiresAt: c.expiresAt, revokedAt: null },
      'wrong',
      now,
    );
    expect(d).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('does not accept one device credential in place of another', () => {
    const a = fresh();
    const b = fresh();
    const d = decideCredential(
      { verifierHash: a.c.verifierHash, expiresAt: a.c.expiresAt, revokedAt: null },
      b.verifier,
      now,
    );
    expect(d).toEqual({ ok: false, reason: 'mismatch' });
  });
});
