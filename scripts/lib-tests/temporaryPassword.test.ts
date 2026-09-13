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
    sentByName: 'Dr Briggs',
  };

  it('returns a title and a body, like every other message the app sends', () => {
    // The house shape, set by emergencyEscalationMessages and used by the
    // notifier. A bare string would not carry a title into the queue.
    const m = credentialMessage(input);
    expect(typeof m.title).toBe('string');
    expect(typeof m.body).toBe('string');
    expect(m.title.length).toBeGreaterThan(0);
  });

  it('opens by naming the person in full, with no greeting', () => {
    // House style: "{name}, ..." — not "Hello Ogbu" and not an introduction.
    const m = credentialMessage(input);
    expect(m.body.startsWith('Ogbu Chinedu Solomon,')).toBe(true);
    expect(m.body).not.toMatch(/^hello/i);
    expect(m.body).not.toMatch(/this is UNTH/i);
  });

  it('names who sent it', () => {
    // "A reminder from nobody is easy to ignore" — and a credential from
    // nobody is indistinguishable from a phishing message.
    expect(credentialMessage(input).body).toContain('by Dr Briggs');
  });

  it('still reads properly when the sender is unknown', () => {
    const m = credentialMessage({ ...input, sentByName: null });
    expect(m.body).toContain('have been reset.');
    expect(m.body).not.toContain('by null');
  });

  it('carries the username as well as the password', () => {
    // The complaint is "I have forgotten my username AND my password". A
    // message with only a password leaves half of it unanswered.
    const m = credentialMessage(input);
    expect(m.body).toContain('ochinedu');
    expect(m.body).toContain('K7RM-4TQX-9FHD');
  });

  it('says the password will have to be changed', () => {
    expect(credentialMessage(input).body).toMatch(/set your own/i);
  });

  it('says when it stops working, in the format the app uses elsewhere', () => {
    // "15 Sep, 09:00" — the same en-GB day/short-month/24h shape as the
    // escalation messages, so two messages on one phone read alike.
    expect(credentialMessage(input).body).toMatch(/\d{2} \w{3}/);
  });

  it('tells them what to do if they did not ask for it', () => {
    expect(credentialMessage(input).body).toMatch(/did not ask for this/i);
  });

  it('contains no link', () => {
    // Credentials AND a link is the exact shape of a phishing message. Staff
    // should not be trained to expect one from the hospital.
    expect(credentialMessage(input).body).not.toMatch(/https?:\/\//);
  });

  it('copes with an empty name rather than addressing nobody', () => {
    expect(credentialMessage({ ...input, fullName: '   ' }).body).toMatch(/^You,/);
  });
});

describe('template variables', () => {
  const input = {
    fullName: 'Ngozi Eze',
    username: 'neze',
    temporaryPassword: 'ACDE-FGHJ-KLMN',
    expiresAt: new Date('2026-09-15T08:00:00Z'),
    sentByName: 'Dr Briggs',
  };

  it('carry the same facts as the free-text message', () => {
    const v = credentialTemplateVariables(input);
    expect(v.name).toBe('Ngozi Eze');
    expect(v.username).toBe('neze');
    expect(v.password).toBe('ACDE-FGHJ-KLMN');
    expect(v.expires).toBeTruthy();
    expect(v.sentBy).toBe('Dr Briggs');
  });

  it('address people by full name, as the rest of the app does', () => {
    expect(credentialTemplateVariables(input).name).not.toBe('Ngozi');
  });

  it('never leave a variable empty, which would render as a gap in the template', () => {
    const v = credentialTemplateVariables({ ...input, fullName: '  ', sentByName: null });
    expect(v.name).toBeTruthy();
    expect(v.sentBy).toBeTruthy();
  });

  it('format the expiry the same way the body does', () => {
    const v = credentialTemplateVariables(input);
    expect(credentialMessage(input).body).toContain(v.expires);
  });
});
