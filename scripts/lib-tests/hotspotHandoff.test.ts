import { describe, it, expect } from 'vitest';
import {
  newHandoffToken,
  hashHandoffToken,
  handoffState,
  handoffMessage,
  HANDOFF_TTL_MS,
} from '../../src/lib/hotspot/handoff';

// The behaviour these protect: staff joining UNTH-THEATRE-ORM sign in inside
// the phone's captive-network assistant, which the OS destroys as soon as the
// network works and whose cookies the real browser cannot see. The token is the
// only thing that crosses that gap, so its lifetime and its single use are the
// whole of the security story.

const T0 = new Date('2026-08-19T08:00:00Z');

describe('newHandoffToken', () => {
  it('never stores the token itself, only its hash', () => {
    const h = newHandoffToken(T0);
    expect(h.tokenHash).toBe(hashHandoffToken(h.token));
    expect(h.tokenHash).not.toBe(h.token);
    // A stolen table must not yield a working token, as a stolen password hash
    // does not yield a login.
    expect(h.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('issues a different token every time', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(newHandoffToken(T0).token);
    expect(seen.size).toBe(200);
  });

  it('produces a token that survives a query string unescaped', () => {
    for (let i = 0; i < 50; i++) {
      const { token } = newHandoffToken(T0);
      expect(encodeURIComponent(token)).toBe(token);
    }
  });

  it('expires ten minutes after minting', () => {
    expect(newHandoffToken(T0).expiresAt.getTime() - T0.getTime()).toBe(HANDOFF_TTL_MS);
    expect(HANDOFF_TTL_MS).toBe(600_000);
  });
});

describe('handoffState', () => {
  const valid = { expiresAt: new Date(T0.getTime() + HANDOFF_TTL_MS), usedAt: null };

  it('accepts an unspent token inside its window', () => {
    expect(handoffState(valid, T0)).toBe('valid');
  });

  it('refuses a token that has already been redeemed', () => {
    // The failure that matters: a second tap must not produce a second session.
    expect(handoffState({ ...valid, usedAt: T0 }, T0)).toBe('spent');
  });

  it('refuses a token past its expiry', () => {
    const later = new Date(T0.getTime() + HANDOFF_TTL_MS + 1);
    expect(handoffState(valid, later)).toBe('expired');
  });

  it('treats the expiry instant itself as expired, not valid', () => {
    // Boundary chosen deliberately: at exactly expiresAt the token is dead.
    expect(handoffState(valid, valid.expiresAt)).toBe('expired');
  });

  it('reports a token it has never seen as missing', () => {
    expect(handoffState(null, T0)).toBe('missing');
    expect(handoffState(undefined, T0)).toBe('missing');
  });

  it('prefers "spent" over "expired" when a used token has also aged out', () => {
    // Both are true; which is reported decides what the log says happened.
    const old = { expiresAt: new Date(T0.getTime() - 1), usedAt: new Date(T0.getTime() - 60_000) };
    expect(handoffState(old, T0)).toBe('spent');
  });
});

describe('handoffMessage', () => {
  it('tells the person what to do rather than what went wrong', () => {
    for (const s of ['expired', 'spent', 'missing'] as const) {
      expect(handoffMessage(s)).toContain('Sign in with your ORM details');
    }
  });

  it('never mentions the token, a hash, or why it failed technically', () => {
    for (const s of ['expired', 'spent', 'missing'] as const) {
      expect(handoffMessage(s).toLowerCase()).not.toContain('token');
      expect(handoffMessage(s).toLowerCase()).not.toContain('hash');
    }
  });

  it('says nothing at all when the handoff is good', () => {
    expect(handoffMessage('valid')).toBe('');
  });
});
