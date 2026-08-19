// ============================================================
// Carrying a signed-in session out of the captive-portal browser
// ------------------------------------------------------------
// A phone that joins UNTH-THEATRE-ORM does the whole sign-in inside the
// operating system's captive-network assistant — a stripped-down browser iOS
// and Android open to deal with portals. Two things about that window decide
// this design, and neither is something the application can change:
//
//   IT IS DESTROYED ON PURPOSE. The moment the router grants access, the
//   phone's connectivity probe succeeds, the OS concludes the portal is
//   finished, and it closes the window. Anything loaded there goes with it.
//   That is why the dashboard "flashed and disappeared": it was being loaded
//   into a window already condemned.
//
//   IT HAS ITS OWN COOKIE JAR. The session written during portal sign-in is not
//   visible to Safari or Chrome. Opening the app afterwards therefore shows a
//   login screen, which reads as "it signed me out again".
//
// So the session has to be handed across, and a cookie cannot do it. This mints
// a short-lived single-use token in the assistant, where the session exists,
// and redeems it in the real browser, where the person is actually going to
// work. The token is the only thing that crosses.
//
// WHY THE TOKEN IS SAFE TO PUT IN A URL
//
//   - 32 random bytes, so it cannot be guessed within its lifetime.
//   - Stored only as a SHA-256 hash. A copy of the table does not yield a
//     working token, in the way a stolen password hash does not yield a login.
//   - Ten minutes. Long enough for somebody fumbling with a phone on a ward,
//     short enough that a URL left in history is worthless by the time anybody
//     reads it.
//   - Single use, enforced by a conditional UPDATE rather than by read-then-
//     write, so two taps on a flaky connection cannot both succeed.
//
// It is deliberately NOT a password-equivalent: it authenticates one handoff
// for one person once, and confers nothing after it is spent.
// ============================================================

import { createHash, randomBytes } from 'crypto';

/** Ten minutes. See the note above on why not shorter and not longer. */
export const HANDOFF_TTL_MS = 10 * 60 * 1000;

/**
 * The stored form of a token. Only ever the hash — the token itself exists in
 * the URL and in memory, never at rest.
 */
export const hashHandoffToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

export interface NewHandoff {
  /** Goes in the URL. Never logged, never stored. */
  token: string;
  /** Goes in the database. */
  tokenHash: string;
  expiresAt: Date;
}

export function newHandoffToken(now: Date = new Date()): NewHandoff {
  // base64url: survives a query string with no escaping, so a token cannot be
  // corrupted by something along the way re-encoding it.
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashHandoffToken(token),
    expiresAt: new Date(now.getTime() + HANDOFF_TTL_MS),
  };
}

export type HandoffState = 'valid' | 'missing' | 'expired' | 'spent';

export interface StoredHandoff {
  expiresAt: Date;
  usedAt: Date | null;
}

/**
 * Why a handoff cannot be redeemed, as a value rather than a thrown error.
 *
 * The three failures are kept apart because they mean different things to the
 * person holding the phone: 'expired' and 'spent' are both "sign in normally",
 * while 'missing' on a link that was just issued would mean the two nodes
 * disagree about a row — worth seeing in a log rather than flattening into one
 * generic refusal.
 */
export function handoffState(
  record: StoredHandoff | null | undefined,
  now: Date = new Date()
): HandoffState {
  if (!record) return 'missing';
  if (record.usedAt) return 'spent';
  if (record.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'valid';
}

/** What the person is told. Never names the token or why it failed technically. */
export function handoffMessage(state: HandoffState): string {
  switch (state) {
    case 'valid':
      return '';
    case 'expired':
      return 'This link has expired. Sign in with your ORM details to continue.';
    case 'spent':
      return 'This link has already been used. Sign in with your ORM details to continue.';
    case 'missing':
      return 'This link is not valid. Sign in with your ORM details to continue.';
  }
}
