/**
 * Which session cookie the app uses, and when it may be Secure.
 *
 * This is the bug that made sign-in IMPOSSIBLE on the hospital's local server
 * while working perfectly on Vercel, and it stayed hidden for exactly that
 * reason — the broken deployment was the one nobody tested.
 *
 * The old rule was `process.env.NODE_ENV === "production"`. The local server
 * runs `next start` behind PM2, so NODE_ENV is "production", but it is served
 * over plain http on a LAN address. That produced a cookie named
 * `__Secure-next-auth.session-token` with secure: true, and browsers REJECT a
 * `__Secure-` cookie not set over a secure channel. Sign-in appeared to work,
 * the cookie was discarded, and every request afterwards was answered 401 —
 * which reads as a wrong password rather than a cookie policy.
 *
 * The rule that matters: NODE_ENV describes how the app was BUILT. Whether a
 * cookie can be Secure depends on how it is SERVED.
 */
import { describe, expect, it } from 'vitest';

import { sessionCookieConfig } from './authCookies';

describe('https origins', () => {
  it('uses the hardened __Secure- cookie on the cloud', () => {
    expect(sessionCookieConfig('https://unth-theatre-mai.vercel.app')).toEqual({
      name: '__Secure-next-auth.session-token',
      secure: true,
    });
  });

  it('uses it for an internal hostname served over TLS too', () => {
    // The eventual local-server target: a hostname with an internal certificate.
    expect(sessionCookieConfig('https://theatre.unth.local').secure).toBe(true);
  });

  it('is not fooled by case or surrounding whitespace', () => {
    expect(sessionCookieConfig('  HTTPS://theatre.unth.local  ').secure).toBe(true);
  });
});

describe('plain http origins', () => {
  it('uses an unprefixed, non-secure cookie for the LAN server', () => {
    // The exact origin the hospital's local server is served on.
    expect(sessionCookieConfig('http://192.168.88.252:3000')).toEqual({
      name: 'next-auth.session-token',
      secure: false,
    });
  });

  it('does the same for localhost', () => {
    expect(sessionCookieConfig('http://localhost:3000').secure).toBe(false);
  });

  it('is not fooled by "https" appearing later in the URL', () => {
    // A host or path containing the string must not flip the flag; only the
    // scheme decides, because only the scheme decides in the browser.
    expect(sessionCookieConfig('http://192.168.88.252:3000/go?to=https://x').secure).toBe(false);
  });
});

describe('when NEXTAUTH_URL is missing', () => {
  it('falls back to insecure rather than to Secure', () => {
    // This asymmetry is deliberate. Guessing "secure" wrongly makes sign-in
    // impossible and hard to diagnose; guessing "insecure" wrongly only forgoes
    // a hardening measure on an origin that was never configured.
    for (const value of [undefined, null, '', '   ']) {
      expect(sessionCookieConfig(value as string | undefined | null).secure).toBe(false);
    }
  });
});

describe('the name and the flag can never disagree', () => {
  it('pairs the __Secure- prefix with secure: true, always', () => {
    // A `__Secure-` name without secure:true is rejected by the browser just as
    // firmly as the mismatch that caused the outage, so the two must move
    // together for every possible input.
    const origins = [
      'https://unth-theatre-mai.vercel.app',
      'https://theatre.unth.local',
      'http://192.168.88.252:3000',
      'http://localhost:3000',
      '',
      undefined,
    ];
    for (const origin of origins) {
      const c = sessionCookieConfig(origin as string | undefined);
      expect(c.name.startsWith('__Secure-')).toBe(c.secure);
    }
  });
});
