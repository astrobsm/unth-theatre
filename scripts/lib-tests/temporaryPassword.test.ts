import { describe, it, expect } from 'vitest';
import {
  generateTemporaryPassword,
  temporaryPasswordExpiry,
  credentialMessage,
  credentialTemplateVariables,
  TEMP_PASSWORD_TTL_HOURS,
} from '../../src/lib/auth/temporaryPassword';

describe('the temporary password itself', () => {
  it('is three groups of four, hyphen-separated', () => {
    expect(generateTemporaryPassword()).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it('contains no character that looks like another one', () => {
    // Each of these is a support call: "was that a zero or an O?" is exactly
    // the problem this feature exists to stop causing.
    const banned = /[0O1lI5S2Z8Bo]/;
    for (let i = 0; i < 300; i++) {
      expect(generateTemporaryPassword()).not.toMatch(banned);
    }
  });

  it('is upper case only, so nobody has to ask about capitals', () => {
    for (let i = 0; i < 100; i++) {
      const p = generateTemporaryPassword();
      expect(p).toBe(p.toUpperCase());
    }
  });

  it('does not repeat itself', () => {
    // Not a proof of randomness, but it catches the two failures that matter:
    // a constant, and a generator seeded once per process.
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(generateTemporaryPassword());
    expect(seen.size).toBe(500);
  });

  it('uses more than a handful of distinct characters', () => {
    // Guards against an alphabet accidentally reduced to a few letters by an
    // over-enthusiastic exclusion.
    const chars = new Set<string>();
    for (let i = 0; i < 300; i++) {
      for (const c of generateTemporaryPassword().replace(/-/g, '')) chars.add(c);
    }
    expect(chars.size).toBeGreaterThan(20);
  });

  it('is long enough to be worth hashing', () => {
    expect(generateTemporaryPassword().replace(/-/g, '')).toHaveLength(12);
  });
});

describe('expiry', () => {
  it('is the stated number of hours ahead', () => {
    const from = new Date('2026-09-13T08:00:00Z');
    const exp = temporaryPasswordExpiry(from);
    expect((exp.getTime() - from.getTime()) / 3_600_000).toBe(TEMP_PASSWORD_TTL_HOURS);
  });

  it('does not modify the date it was given', () => {
    const from = new Date('2026-09-13T08:00:00Z');
    temporaryPasswordExpiry(from);
    expect(from.toISOString()).toBe('2026-09-13T08:00:00.000Z');
  });
});

describe('the message that reaches the phone', () => {
  const input = {
    fullName: 'Ogbu Chinedu Solomon',
    username: 'ochinedu',
    temporaryPassword: 'K7RM-4TQX-9FHD',
    expiresAt: new Date('2026-09-15T08:00:00Z'),
  };

  it('carries the username as well as the password', () => {
    // The complaint is "I have forgotten my username AND my password". A
    // message with only a password leaves half of it unanswered.
    const m = credentialMessage(input);
    expect(m).toContain('ochinedu');
    expect(m).toContain('K7RM-4TQX-9FHD');
  });

  it('greets them by first name only', () => {
    expect(credentialMessage(input)).toContain('Hello Ogbu');
    expect(credentialMessage(input)).not.toContain('Solomon');
  });

  it('says the password will have to be changed', () => {
    expect(credentialMessage(input)).toMatch(/set your own password/i);
  });

  it('says when it expires', () => {
    expect(credentialMessage(input)).toMatch(/expires/i);
  });

  it('tells them what to do if they did not ask for it', () => {
    // A credential arriving unasked is either a mistake or an attack, and the
    // person who can tell the difference is not the recipient.
    expect(credentialMessage(input)).toMatch(/did not ask for this/i);
  });

  it('contains no link', () => {
    // A message with credentials AND a link is the exact shape of a phishing
    // message. Staff should not be trained to expect one from the hospital.
    const m = credentialMessage(input);
    expect(m).not.toMatch(/https?:\/\//);
  });

  it('copes with a one-word name', () => {
    expect(credentialMessage({ ...input, fullName: 'Adaeze' })).toContain('Hello Adaeze');
  });

  it('copes with an empty name rather than greeting nobody', () => {
    expect(credentialMessage({ ...input, fullName: '   ' })).toContain('Hello there');
  });
});

describe('template variables', () => {
  it('carry the same facts as the free-text message', () => {
    const v = credentialTemplateVariables({
      fullName: 'Ngozi Eze',
      username: 'neze',
      temporaryPassword: 'ACDE-FGHJ-KLMN',
      expiresAt: new Date('2026-09-15T08:00:00Z'),
    });
    expect(v.name).toBe('Ngozi');
    expect(v.username).toBe('neze');
    expect(v.password).toBe('ACDE-FGHJ-KLMN');
    expect(v.expires).toBeTruthy();
  });
});
