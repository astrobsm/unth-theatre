/**
 * Signing in with a username or a phone number.
 *
 * The same check backs the application and the Wi-Fi captive portal, so a
 * mistake here admits the wrong person to both at once.
 *
 * The awkward case is real and measured, not hypothetical. In the live data,
 * 53 phone numbers belong to more than one approved account, covering 111
 * users — duplicate registrations of the same person. Twenty approved users
 * have no phone number at all. So "log in with your phone number" cannot be
 * the only route, and must never resolve by guessing.
 */
import { describe, expect, it } from 'vitest';

import {
  failureMessage,
  looksLikePhone,
  normalisePhone,
  verifyStaffCredentials,
  type CredentialDeps,
} from './staffCredentials';

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'u1',
  username: 'jdoe',
  fullName: 'J Doe',
  role: 'SURGEON',
  email: null,
  password: 'hash:correct',
  status: 'APPROVED',
  phoneNumber: '08031234567',
  ...over,
}) as never;

/** Passwords "match" when the hash is `hash:<password>`. */
function deps(over: Partial<CredentialDeps> = {}): CredentialDeps {
  return {
    findByUsername: async () => null,
    findByPhoneSuffix: async () => [],
    comparePassword: async (plain, hash) => hash === `hash:${plain}`,
    ...over,
  };
}

describe('normalising a phone number', () => {
  it('reduces every shape in the live data to the same ten digits', () => {
    // Both formats present in the database, plus how people actually type.
    for (const input of [
      '08031234567',
      '+2348031234567',
      '2348031234567',
      '8031234567',
      '0803 123 4567',
      '+234 803-123-4567',
    ]) {
      expect(normalisePhone(input)).toBe('8031234567');
    }
  });

  it('rejects anything that cannot be a number', () => {
    for (const input of ['', null, undefined, 'jdoe', '12345', '0803123456789012']) {
      expect(normalisePhone(input)).toBeNull();
    }
  });
});

describe('telling a phone number from a username', () => {
  it('recognises numbers however they are punctuated', () => {
    expect(looksLikePhone('08031234567')).toBe(true);
    expect(looksLikePhone('+234 803 123 4567')).toBe(true);
  });

  it('treats usernames as usernames', () => {
    expect(looksLikePhone('jdoe')).toBe(false);
    expect(looksLikePhone('mmadubuike.judith')).toBe(false);
    // A username may not be all digits, so this is a mistyped number and
    // should be reported as one rather than searched for as a username.
    expect(looksLikePhone('0803')).toBe(false);   // too short to be either
  });
});

describe('signing in by username', () => {
  it('admits an approved user with the right password', async () => {
    const r = await verifyStaffCredentials(
      deps({ findByUsername: async () => row() }), 'jdoe', 'correct');
    expect(r.ok && r.user.username).toBe('jdoe');
  });

  it('never returns the password hash', async () => {
    const r = await verifyStaffCredentials(
      deps({ findByUsername: async () => row() }), 'jdoe', 'correct');
    expect(JSON.stringify(r)).not.toContain('hash:');
  });

  it('refuses a wrong password, an unknown user and an unapproved account', async () => {
    const found = deps({ findByUsername: async () => row() });
    expect(await verifyStaffCredentials(found, 'jdoe', 'wrong'))
      .toEqual({ ok: false, reason: 'BAD_PASSWORD' });
    expect(await verifyStaffCredentials(deps(), 'nobody', 'x'))
      .toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(await verifyStaffCredentials(
      deps({ findByUsername: async () => row({ status: 'PENDING' }) }), 'jdoe', 'correct'))
      .toEqual({ ok: false, reason: 'NOT_APPROVED' });
  });

  it('requires both halves', async () => {
    expect(await verifyStaffCredentials(deps(), '', 'x'))
      .toEqual({ ok: false, reason: 'MISSING' });
    expect(await verifyStaffCredentials(deps(), 'jdoe', ''))
      .toEqual({ ok: false, reason: 'MISSING' });
  });
});

describe('signing in by phone number', () => {
  it('matches whichever shape is stored', async () => {
    // Stored as +234…, typed as 0803… — the last ten digits are the key.
    const r = await verifyStaffCredentials(
      deps({ findByPhoneSuffix: async () => [row({ phoneNumber: '+2348031234567' })] }),
      '08031234567', 'correct');
    expect(r.ok).toBe(true);
  });

  it('reports a half-typed number as a number, not as an unknown user', async () => {
    // Long enough to be unmistakably a phone number attempt (>= 7 digits), but
    // not a complete one. Anything shorter is indistinguishable from a short
    // username, and is looked up as one — see the looksLikePhone tests above.
    expect(await verifyStaffCredentials(deps(), '0803123', 'x'))
      .toEqual({ ok: false, reason: 'MALFORMED_PHONE' });
  });

  it('ignores unapproved duplicates that share the number', async () => {
    // Common in the live data: one live account plus an abandoned registration.
    const r = await verifyStaffCredentials(deps({
      findByPhoneSuffix: async () => [
        row({ id: 'pending', status: 'PENDING' }),
        row({ id: 'live', status: 'APPROVED' }),
      ],
    }), '08031234567', 'correct');
    expect(r.ok && r.user.id).toBe('live');
  });

  it('admits the one duplicate whose password matches', async () => {
    // 111 approved users are duplicate registrations of the same person. If
    // only one of them has the password being offered, that is not a guess.
    const r = await verifyStaffCredentials(deps({
      findByPhoneSuffix: async () => [
        row({ id: 'old', password: 'hash:oldpass' }),
        row({ id: 'current', password: 'hash:correct' }),
      ],
    }), '08031234567', 'correct');
    expect(r.ok && r.user.id).toBe('current');
  });

  it('REFUSES when the password matches several accounts', async () => {
    // Signing somebody into a colleague's record — or into their own stale
    // duplicate with a different role — is not an acceptable way to resolve
    // ambiguity in a clinical system. It asks for the username instead.
    const r = await verifyStaffCredentials(deps({
      findByPhoneSuffix: async () => [
        row({ id: 'a', role: 'SURGEON' }),
        row({ id: 'b', role: 'HOUSE_OFFICER' }),
      ],
    }), '08031234567', 'correct');
    expect(r).toEqual({ ok: false, reason: 'AMBIGUOUS_PHONE' });
  });

  it('says the password is wrong when none of the duplicates match', async () => {
    const r = await verifyStaffCredentials(deps({
      findByPhoneSuffix: async () => [row({ id: 'a' }), row({ id: 'b' })],
    }), '08031234567', 'nope');
    expect(r).toEqual({ ok: false, reason: 'BAD_PASSWORD' });
  });

  it('does not bcrypt an unbounded number of candidates', async () => {
    let calls = 0;
    await verifyStaffCredentials(deps({
      findByPhoneSuffix: async () => Array.from({ length: 40 }, (_, i) => row({ id: `u${i}` })),
      comparePassword: async () => { calls++; return false; },
    }), '08031234567', 'x');
    expect(calls).toBeLessThanOrEqual(5);
  });
});

describe('what the person is told', () => {
  it('tells an ambiguous phone user exactly what to do instead', () => {
    const msg = failureMessage('AMBIGUOUS_PHONE');
    expect(msg).toContain('username');
    expect(msg).toContain('merge');
  });

  it('never blames the password when the account is simply unapproved', () => {
    expect(failureMessage('NOT_APPROVED').toLowerCase()).not.toContain('password');
  });
});
