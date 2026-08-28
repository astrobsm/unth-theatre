import { describe, it, expect } from 'vitest';
import {
  generateCode,
  hashCode,
  codeMatches,
  normaliseNigerianPhone,
  maskPhone,
  canRequest,
  verifyCode,
  otpMessage,
  CODE_LENGTH,
  MAX_ATTEMPTS,
  MAX_REQUESTS_PER_WINDOW,
  RESEND_COOLDOWN_MS,
  REQUEST_WINDOW_MS,
} from '../../src/lib/auth/otp';

const PEPPER = 'test-pepper-not-the-real-one';
const NOW = new Date('2026-08-28T09:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe('generateCode', () => {
  it('is always exactly the stated length, including leading zeros', () => {
    for (let i = 0; i < 400; i += 1) {
      const c = generateCode();
      expect(c).toHaveLength(CODE_LENGTH);
      expect(/^\d+$/.test(c)).toBe(true);
    }
  });

  it('does not repeat itself in any meaningful way', () => {
    const seen = new Set(Array.from({ length: 300 }, () => generateCode()));
    // 300 draws from a million: collisions are possible but a stuck generator
    // would show up immediately as a tiny set.
    expect(seen.size).toBeGreaterThan(280);
  });
});

describe('hashCode / codeMatches', () => {
  it('never stores the code itself', () => {
    const h = hashCode('123456', PEPPER);
    expect(h).not.toContain('123456');
    expect(h).toHaveLength(64);
  });

  it('matches the right code', () => {
    expect(codeMatches('123456', hashCode('123456', PEPPER), PEPPER)).toBe(true);
  });

  it('rejects the wrong code', () => {
    expect(codeMatches('123457', hashCode('123456', PEPPER), PEPPER)).toBe(false);
  });

  // The pepper is what makes a stolen database useless: a million candidates is
  // trivial to grind offline without it.
  it('is useless without the pepper', () => {
    const stored = hashCode('123456', PEPPER);
    expect(codeMatches('123456', stored, 'a-different-pepper')).toBe(false);
  });
});

describe('normaliseNigerianPhone', () => {
  it('accepts the six ways staff actually type their number', () => {
    for (const raw of [
      '08039133373',
      '+2348039133373',
      '2348039133373',
      '234 803 913 3373',
      '0803-913-3373',
      '(0803) 913 3373',
    ]) {
      expect(normaliseNigerianPhone(raw)).toBe('2348039133373');
    }
  });

  it('handles a dropped leading zero, which happens with contact-card pastes', () => {
    expect(normaliseNigerianPhone('8039133373')).toBe('2348039133373');
  });

  it('handles the 00234 international prefix', () => {
    expect(normaliseNigerianPhone('002348039133373')).toBe('2348039133373');
  });

  it('refuses what is not a Nigerian number', () => {
    for (const bad of ['', '   ', '123', '0803913', 'not a number', '+447700900123', null, undefined]) {
      expect(normaliseNigerianPhone(bad as any)).toBeNull();
    }
  });
});

describe('maskPhone', () => {
  it('shows enough to identify the handset and no more', () => {
    expect(maskPhone('2348039133373')).toBe('0803****373');
    expect(maskPhone('08039133373')).toBe('0803****373');
  });

  it('says something harmless when there is nothing to show', () => {
    expect(maskPhone(null)).toBe('the number on file');
    expect(maskPhone('rubbish')).toBe('the number on file');
  });
});

describe('canRequest', () => {
  it('allows a first request', () => {
    expect(canRequest([], NOW).allowed).toBe(true);
  });

  it('refuses a second request within the cooldown', () => {
    const v = canRequest([{ createdAt: ago(10_000), consumedAt: null }], NOW);
    expect(v.allowed).toBe(false);
    if (!v.allowed) {
      expect(v.reason).toBe('COOLDOWN');
      expect(v.retryAfterMs).toBeGreaterThan(0);
      expect(v.retryAfterMs).toBeLessThanOrEqual(RESEND_COOLDOWN_MS);
    }
  });

  it('allows a resend once the cooldown has passed', () => {
    expect(canRequest([{ createdAt: ago(RESEND_COOLDOWN_MS + 1000), consumedAt: null }], NOW).allowed).toBe(true);
  });

  it('caps the number of codes in the window', () => {
    const recent = Array.from({ length: MAX_REQUESTS_PER_WINDOW }, (_, i) => ({
      createdAt: ago(RESEND_COOLDOWN_MS + 1000 * (i + 1) * 60),
      consumedAt: null,
    }));
    const v = canRequest(recent, NOW);
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toBe('TOO_MANY');
  });

  // Counting only unused codes would let an attacker request, consume, repeat
  // for ever - which is precisely the pattern of working through a name list.
  it('counts consumed codes towards the cap', () => {
    const recent = Array.from({ length: MAX_REQUESTS_PER_WINDOW }, (_, i) => ({
      createdAt: ago(RESEND_COOLDOWN_MS + 1000 * (i + 1) * 60),
      consumedAt: ago(1000),
    }));
    expect(canRequest(recent, NOW).allowed).toBe(false);
  });

  it('forgets codes older than the window', () => {
    const old = Array.from({ length: 10 }, () => ({
      createdAt: ago(REQUEST_WINDOW_MS + 60_000),
      consumedAt: null,
    }));
    expect(canRequest(old, NOW).allowed).toBe(true);
  });
});

describe('verifyCode', () => {
  const good = (over: Partial<Parameters<typeof verifyCode>[0]> = {}) => ({
    codeHash: hashCode('123456', PEPPER),
    expiresAt: new Date(NOW.getTime() + 60_000),
    attempts: 0,
    consumedAt: null,
    ...(over as any),
  });

  it('accepts the right code', () => {
    expect(verifyCode(good(), '123456', PEPPER, NOW)).toEqual({ ok: true });
  });

  it('ignores spaces and dashes the user typed', () => {
    expect(verifyCode(good(), '123 456', PEPPER, NOW).ok).toBe(true);
    expect(verifyCode(good(), '123-456', PEPPER, NOW).ok).toBe(true);
  });

  it('rejects a wrong code', () => {
    const v = verifyCode(good(), '654321', PEPPER, NOW);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('WRONG_CODE');
  });

  it('rejects an expired code', () => {
    const v = verifyCode(good({ expiresAt: ago(1000) }), '123456', PEPPER, NOW);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('EXPIRED');
  });

  it('rejects a code that has already been used', () => {
    const v = verifyCode(good({ consumedAt: ago(1000) }), '123456', PEPPER, NOW);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('ALREADY_USED');
  });

  it('stops accepting once the attempt cap is reached, even for the right code', () => {
    const v = verifyCode(good({ attempts: MAX_ATTEMPTS }), '123456', PEPPER, NOW);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('TOO_MANY_ATTEMPTS');
  });

  it('treats a missing record as not found', () => {
    const v = verifyCode(null, '123456', PEPPER, NOW);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('NOT_FOUND');
  });

  // Expiry and the cap are checked BEFORE the comparison, so probing a dead
  // code cannot tell an attacker whether their guess was right.
  it('reports a dead code as dead, not as wrong', () => {
    const expired = verifyCode(good({ expiresAt: ago(1) }), '654321', PEPPER, NOW);
    if (!expired.ok) expect(expired.reason).toBe('EXPIRED');
    const capped = verifyCode(good({ attempts: MAX_ATTEMPTS }), '654321', PEPPER, NOW);
    if (!capped.ok) expect(capped.reason).toBe('TOO_MANY_ATTEMPTS');
  });

  it('rejects a code of the wrong length without comparing', () => {
    for (const bad of ['', '1', '12345', '1234567']) {
      const v = verifyCode(good(), bad, PEPPER, NOW);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.reason).toBe('WRONG_CODE');
    }
  });
});

describe('otpMessage', () => {
  it('leads with the code and fits one SMS segment', () => {
    const m = otpMessage('123456', 'PASSWORD_RESET');
    expect(m.startsWith('123456')).toBe(true);
    expect(m.length).toBeLessThanOrEqual(160);
    expect(m).toMatch(/Do not share/i);
  });

  it('says which thing the code is for', () => {
    expect(otpMessage('123456', 'PASSWORD_RESET')).toMatch(/password/i);
    expect(otpMessage('123456', 'USERNAME_RECOVERY')).toMatch(/username/i);
  });
});
