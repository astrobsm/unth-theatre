// An invitation that promises anonymity has to deliver it.
//
// The whole feature rests on one claim made to a frightened or angry patient:
// "nobody who looked after you can be told this came from you". If that is not
// true, the feature is worse than not existing — it is what persuades somebody
// to write the complaint they would otherwise have swallowed, and then hands
// it over with their name on it.
//
// So the things tested here are the things that would quietly break the claim:
// a token that can be read back out of the database, a link that carries a
// name alongside it, an invitation that can be replayed, and an "expired"
// that is indistinguishable from "already answered".
import { describe, it, expect } from 'vitest';
import {
  newInviteToken, hashInviteToken, inviteExpiry, inviteUrl, inviteState,
  buildInviteMessage, careContextOf, INVITE_TTL_DAYS, INVITE_PROBLEM_MESSAGE,
} from '../../src/lib/patients/feedbackInvite';

describe('the token', () => {
  it('is different every time', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) seen.add(newInviteToken().token);
    expect(seen.size).toBe(200);
  });

  it('is long enough that guessing one is not a thing that happens', () => {
    // 32 random bytes. Short tokens are the reason "anonymous feedback" systems
    // end up being read by the people being complained about.
    const { token } = newInviteToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    // base64url — safe in a URL without escaping, so it survives being copied
    // out of WhatsApp by hand.
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('is not recoverable from what gets stored', () => {
    // THE ONE THAT MATTERS. Only the hash is kept, so a database read — or a
    // leaked backup — cannot open somebody's feedback form or submit in their
    // name.
    const { token, tokenHash } = newInviteToken();
    expect(tokenHash).not.toContain(token);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInviteToken(token)).toBe(tokenHash);
  });

  it('hashes deterministically, so the link can be looked up', () => {
    expect(hashInviteToken('abc')).toBe(hashInviteToken('abc'));
    expect(hashInviteToken('abc')).not.toBe(hashInviteToken('abd'));
  });
});

describe('the link', () => {
  it('carries the token and nothing else', () => {
    // The public feedback page accepts ?name=, ?folder= and ?phone= so staff
    // can send a pre-filled link. Any of those riding along here would turn an
    // anonymous invitation into a signed one without anybody deciding to.
    const url = inviteUrl('TOKEN123');
    const qs = new URL(url).searchParams;
    expect(Array.from(qs.keys())).toEqual(['t']);
    expect(qs.get('t')).toBe('TOKEN123');
  });

  it('escapes a token that would otherwise break the URL', () => {
    const url = inviteUrl('a+b/c=d');
    expect(new URL(url).searchParams.get('t')).toBe('a+b/c=d');
  });

  it('goes to the short public path', () => {
    // Read off a phone screen and sometimes typed by hand.
    expect(inviteUrl('x')).toContain('/f?t=');
    expect(inviteUrl('x')).toMatch(/^https:\/\//);
  });
});

describe('whether an invitation can be used', () => {
  const future = new Date(Date.now() + 60_000);
  const past = new Date(Date.now() - 60_000);

  it('opens a fresh one', () => {
    expect(inviteState({ expiresAt: future, submittedAt: null }).ok).toBe(true);
  });

  it('knows an unknown token from an expired one', () => {
    const missing = inviteState(null);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.problem).toBe('NOT_FOUND');

    const old = inviteState({ expiresAt: past, submittedAt: null });
    expect(old.ok).toBe(false);
    if (!old.ok) expect(old.problem).toBe('EXPIRED');
  });

  it('will not let one be used twice', () => {
    // Otherwise anybody who sees the message over a shoulder can submit again
    // in the patient's name, and the hospital cannot tell which was theirs.
    const used = inviteState({ expiresAt: future, submittedAt: new Date() });
    expect(used.ok).toBe(false);
    if (!used.ok) expect(used.problem).toBe('ALREADY_USED');
  });

  it('says "already answered" even after it has also expired', () => {
    // Order matters. These are different facts and a patient reacts to them
    // differently: one is the hospital's fault, the other means their words
    // already arrived and they do not need to write them again.
    const both = inviteState({ expiresAt: past, submittedAt: new Date() });
    expect(both.ok).toBe(false);
    if (!both.ok) expect(both.problem).toBe('ALREADY_USED');
  });

  it('gives every refusal a way forward', () => {
    // A patient who followed a link the hospital broke must not be turned
    // away; the ordinary form is open to anyone.
    for (const m of Object.values(INVITE_PROBLEM_MESSAGE)) {
      expect(m).toMatch(/ordinary feedback form/i);
    }
  });

  it('expires in a month, not a day', () => {
    expect(INVITE_TTL_DAYS).toBe(30);
    const from = new Date('2026-11-09T00:00:00Z');
    expect(inviteExpiry(from).toISOString().slice(0, 10)).toBe('2026-12-09');
  });
});

describe('what travels with the feedback', () => {
  it('is the unit and the complex, and nothing else', () => {
    const ctx = careContextOf({ unit: 'Uro Unit I', location: 'Professor Ojukwu Theatre Complex' });
    expect(ctx).toEqual({ unit: 'Uro Unit I', complex: 'Professor Ojukwu Theatre Complex' });
    expect(Object.keys(ctx).sort()).toEqual(['complex', 'unit']);
  });

  it('turns blanks into nulls rather than empty strings', () => {
    expect(careContextOf({ unit: '   ', location: null }))
      .toEqual({ unit: null, complex: null });
    expect(careContextOf({})).toEqual({ unit: null, complex: null });
  });
});

describe('the message that goes with the link', () => {
  const msg = buildInviteMessage({ patientName: 'Adaeze Okafor', url: 'https://x/f?t=abc' });

  it('addresses the patient and carries the link', () => {
    expect(msg).toContain('Adaeze Okafor');
    expect(msg).toContain('https://x/f?t=abc');
  });

  it('says complaining is safe, because that is the part that gets swallowed', () => {
    expect(msg).toMatch(/anonymous/i);
    expect(msg).toMatch(/treated you badly|asked you for money/i);
  });

  it('admits the limit of the anonymity instead of overselling it', () => {
    // A promise bigger than the thing delivered is what persuades somebody to
    // write what they would otherwise have kept to themselves.
    expect(msg).toMatch(/which unit cared for you/i);
    expect(msg).toMatch(/small group|point to you/i);
  });

  it('says how long the link lasts', () => {
    expect(msg).toMatch(/30 days/);
  });

  it('does not open with the phrase everybody ignores', () => {
    expect(msg).not.toMatch(/we value your feedback/i);
  });
});
