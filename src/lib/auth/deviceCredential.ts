// ============================================================
// Signing back in with a fingerprint
// ------------------------------------------------------------
// Staff were retyping a password several times a day on a phone, in a theatre,
// often with one glove half off. This lets the phone do it: after one real
// sign-in, the device holds a credential that redeems for a session, and the
// fingerprint is what releases it.
//
// THE CREDENTIAL IS NOT A PASSWORD AND MUST NOT BECOME ONE. It authenticates
// one device for one person, it expires, it can be revoked from the server,
// and the secret half never touches the database. What makes it safe is the
// combination, not any single part:
//
//   - 32 random bytes of secret, so it cannot be guessed.
//   - Split into a SELECTOR and a VERIFIER. The selector is the lookup key and
//     is not secret; only a SHA-256 of the verifier is stored. A dump of the
//     table therefore signs nobody in, exactly as a password hash does not.
//     Splitting them also means the lookup is an indexed equality match, not a
//     scan comparing every hash in the table.
//   - Compared with timingSafeEqual, so a wrong guess takes the same time as
//     a right one and the comparison leaks nothing.
//   - Ninety days, then it is gone and the password is required again.
//   - Held on the phone in Keystore-backed storage behind the fingerprint
//     prompt, so possession of the handset alone is not enough.
//
// WHY IT IS NOT ROTATED ON EACH USE, which is the one place this departs from
// how a bank app would do it: device_credentials replicates between the cloud
// and the theatre server under last-write-wins. Two nodes rotating the same
// credential independently would leave the phone holding a secret matching
// neither — locking a surgeon out mid-list in order to defend against an
// attacker who by then has their unlocked phone AND their fingerprint. The
// expiry, the revocation and the biometric gate carry the weight instead.
//
// Deliberately a separate table and a separate provider from the Wi-Fi handoff
// token: that one is single-use and lives ten minutes, this one lives three
// months, and merging them would eventually let one be offered where the other
// is expected.
// ============================================================

import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/** Ninety days. A phone left in a drawer stops being a way in. */
export const DEVICE_CREDENTIAL_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** Separates the two halves. Not in the base64url alphabet, so it cannot occur inside either half. */
const SEPARATOR = '.';

export const hashVerifier = (verifier: string): string =>
  createHash('sha256').update(verifier, 'utf8').digest('hex');

export interface NewDeviceCredential {
  /** Handed to the phone ONCE and never stored server-side in this form. */
  credential: string;
  /** Stored, and used to find the row. Not secret. */
  selector: string;
  /** Stored. The secret half never is. */
  verifierHash: string;
  expiresAt: Date;
}

/**
 * Mint a credential for a device. The caller must already have established who
 * the user is — this confers authority, it does not check it.
 */
export function newDeviceCredential(now: Date = new Date()): NewDeviceCredential {
  // base64url so the value survives JSON, headers and Android's preference
  // storage without escaping, which is where a stray '+' or '/' would be
  // mangled silently and look like a wrong fingerprint.
  const selector = randomBytes(12).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');

  return {
    credential: `${selector}${SEPARATOR}${verifier}`,
    selector,
    verifierHash: hashVerifier(verifier),
    expiresAt: new Date(now.getTime() + DEVICE_CREDENTIAL_TTL_MS),
  };
}

export interface ParsedCredential {
  selector: string;
  verifier: string;
}

/**
 * Split a presented credential. Returns null rather than throwing: a malformed
 * value is an ordinary failed sign-in, not an exceptional condition, and
 * throwing here would turn a truncated string into a 500.
 */
export function parseDeviceCredential(raw: unknown): ParsedCredential | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const idx = trimmed.indexOf(SEPARATOR);
  if (idx <= 0 || idx === trimmed.length - 1) return null;

  const selector = trimmed.slice(0, idx);
  const verifier = trimmed.slice(idx + 1);

  // A second separator means this is not a credential we minted. Reject rather
  // than guess which half is which.
  if (verifier.includes(SEPARATOR)) return null;

  return { selector, verifier };
}

/**
 * Constant-time check of a presented verifier against the stored hash.
 *
 * Both sides are hex digests of fixed length, so the length guard below can
 * only fail on a corrupted row — but timingSafeEqual THROWS on a length
 * mismatch, and an exception here would read as a server error instead of a
 * refusal.
 */
export function verifierMatches(verifier: string, storedHash: string): boolean {
  const presented = Buffer.from(hashVerifier(verifier), 'utf8');
  const stored = Buffer.from(storedHash, 'utf8');
  if (presented.length !== stored.length) return false;
  return timingSafeEqual(presented, stored);
}

export type CredentialRefusal = 'unknown' | 'revoked' | 'expired' | 'mismatch';

export interface StoredCredential {
  verifierHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

/**
 * The whole decision, with no database and no clock of its own, so it can be
 * tested exhaustively.
 *
 * ORDER MATTERS. Revocation is checked before expiry so that a credential
 * which was revoked and has since also expired still reports as revoked —
 * "this phone was taken off the account" and "this phone has not been used
 * since July" are different events and the audit trail should not merge them.
 * The verifier is checked LAST so that a wrong secret for a revoked
 * credential does not reveal, by its answer, that the selector was real.
 */
export function decideCredential(
  stored: StoredCredential | null,
  verifier: string,
  now: Date = new Date(),
): { ok: true } | { ok: false; reason: CredentialRefusal } {
  if (!stored) return { ok: false, reason: 'unknown' };
  if (stored.revokedAt) return { ok: false, reason: 'revoked' };
  if (stored.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'expired' };
  if (!verifierMatches(verifier, stored.verifierHash)) return { ok: false, reason: 'mismatch' };
  return { ok: true };
}

/**
 * What the person is told. Never which of the four it was: the difference
 * between "no such device" and "wrong secret" is exactly what an attacker
 * probing selectors wants, and the person holding the phone cannot act on it
 * either way. The server log keeps the real reason.
 */
export const DEVICE_SIGN_IN_FAILED =
  'This device could not sign you in. Please sign in with your password once more.';
