// ============================================================
// Offline Authentication
// ------------------------------------------------------------
// Lets staff sign in with NO network, without weakening security.
//
// How it works
//   • On a successful ONLINE login we derive a key from the user's password
//     (PBKDF2-SHA256, per-user random salt) and use it to AES-GCM encrypt the
//     NextAuth session payload. Only the ciphertext, salt and IV are stored.
//   • Offline, the entered password is the ONLY thing that can derive the key
//     that decrypts that payload. A wrong password fails the GCM auth tag, so
//     there is nothing to compare against and nothing to bypass — unlike the
//     previous behaviour, where any password was accepted as long as a session
//     happened to be cached on the device.
//   • The password itself is never stored, in any form.
//
// Everything runs on WebCrypto (SubtleCrypto), which is available in every
// browser the ORM supports plus the Capacitor/Electron shells. Where it is
// missing (very old WebView, insecure origin) enrolment is skipped and offline
// login is simply unavailable — it never silently downgrades to a weaker check.
// ============================================================

import {
  getAuthVault,
  putAuthVault,
  deleteAuthVault,
  listAuthVaults,
  setCachedData,
  removeCachedData,
  type AuthVaultRecord,
} from './offlineStore';

/** PBKDF2 work factor. Tuned so derivation stays ~150-300ms on ward-grade hardware. */
const PBKDF2_ITERATIONS = 210_000;
/** How long an enrolment stays usable offline. Matches the NextAuth session maxAge. */
const VAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Wrong-password attempts before the vault locks. */
const MAX_FAILED_ATTEMPTS = 5;
/** How long the vault stays locked after too many wrong passwords. */
const LOCKOUT_MS = 15 * 60 * 1000;
/** Session cache TTL used when an offline login establishes the session. */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface OfflineSessionUser {
  id?: string;
  name?: string | null;
  email?: string | null;
  role?: string;
  extraModules?: string[];
  [key: string]: unknown;
}

export interface OfflineSession {
  user?: OfflineSessionUser;
  expires?: string;
  [key: string]: unknown;
}

export type OfflineLoginFailure =
  | 'unsupported'      // no WebCrypto / IndexedDB on this device
  | 'not-enrolled'     // this username has never signed in online here
  | 'wrong-password'
  | 'expired'          // enrolment older than VAULT_TTL_MS — must go online
  | 'locked';          // too many wrong attempts

export type OfflineLoginResult =
  | { ok: true; session: OfflineSession }
  | { ok: false; reason: OfflineLoginFailure; retryAfterMs?: number; attemptsLeft?: number };

// ------------------------------------------------------------
// WebCrypto helpers
// ------------------------------------------------------------
function subtle(): SubtleCrypto | null {
  if (typeof window === 'undefined') return null;
  const c = window.crypto;
  // `crypto.subtle` is only exposed on secure origins (https / localhost).
  return c && 'subtle' in c ? c.subtle : null;
}

/** True when this device can do encrypted offline login at all. */
export function isOfflineAuthSupported(): boolean {
  return subtle() !== null;
}

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const s = subtle();
  if (!s) throw new Error('WebCrypto unavailable');
  const baseKey = await s.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return s.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function normaliseUsername(username: string): string {
  return username.trim().toLowerCase();
}

// ------------------------------------------------------------
// Enrolment — called after a successful ONLINE sign-in
// ------------------------------------------------------------
/**
 * Store an encrypted copy of the session so this user can sign in offline next
 * time. Safe to call on every online login; it re-keys with a fresh salt/IV and
 * refreshes the expiry. Never throws — offline login is a bonus, not a
 * precondition for signing in.
 */
export async function enrollOfflineCredentials(
  username: string,
  password: string,
  session: OfflineSession
): Promise<boolean> {
  const s = subtle();
  if (!s || !username || !password || !session?.user) return false;

  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
    const plaintext = new TextEncoder().encode(JSON.stringify(session));
    const ciphertext = await s.encrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      plaintext
    );

    const now = Date.now();
    await putAuthVault({
      username: normaliseUsername(username),
      displayName: (session.user?.name as string) || username,
      salt: toBase64(salt),
      iv: toBase64(iv),
      iterations: PBKDF2_ITERATIONS,
      ciphertext: toBase64(ciphertext),
      enrolledAt: now,
      expiresAt: now + VAULT_TTL_MS,
      failedAttempts: 0,
      lockedUntil: 0,
      lastOfflineLoginAt: 0,
    });
    return true;
  } catch (err) {
    console.warn('[offlineAuth] enrolment failed:', (err as Error)?.message);
    return false;
  }
}

/**
 * Convenience wrapper for the login screen: fetch the freshly-established
 * session and enrol it. Returns false when offline enrolment is unavailable.
 */
export async function enrollFromCurrentSession(username: string, password: string): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/session');
    if (!res.ok) return false;
    const session = (await res.json()) as OfflineSession;
    if (!session?.user) return false;
    return enrollOfflineCredentials(username, password, session);
  } catch {
    return false;
  }
}

// ------------------------------------------------------------
// Offline sign-in
// ------------------------------------------------------------
/**
 * Verify a username/password pair entirely on-device and, on success,
 * re-establish the cached session so the rest of the app (useSession, the
 * fetch interceptor, module permissions) behaves exactly as when online.
 */
export async function offlineLogin(username: string, password: string): Promise<OfflineLoginResult> {
  const s = subtle();
  if (!s) return { ok: false, reason: 'unsupported' };

  const key = normaliseUsername(username);
  const vault = await getAuthVault(key);
  if (!vault) return { ok: false, reason: 'not-enrolled' };

  const now = Date.now();
  if (vault.lockedUntil > now) {
    return { ok: false, reason: 'locked', retryAfterMs: vault.lockedUntil - now };
  }
  if (vault.expiresAt < now) {
    return { ok: false, reason: 'expired' };
  }

  try {
    const derived = await deriveKey(password, fromBase64(vault.salt), vault.iterations);
    const plaintext = await s.decrypt(
      { name: 'AES-GCM', iv: fromBase64(vault.iv) as unknown as BufferSource },
      derived,
      fromBase64(vault.ciphertext) as unknown as BufferSource
    );
    const session = JSON.parse(new TextDecoder().decode(plaintext)) as OfflineSession;

    // Correct password — reset the lockout counters and record the sign-in.
    await putAuthVault({ ...vault, failedAttempts: 0, lockedUntil: 0, lastOfflineLoginAt: now });

    // Re-establish the session the rest of the app reads. `session` is what the
    // fetch interceptor serves for /api/auth/session while offline, so
    // useSession() and every permission check resolve normally.
    const offlineSession: OfflineSession = {
      ...session,
      expires: new Date(now + SESSION_TTL_MS).toISOString(),
    };
    await setCachedData('session', offlineSession, SESSION_TTL_MS);
    if (offlineSession.user) {
      await setCachedData('currentUser', offlineSession.user, SESSION_TTL_MS);
    }

    return { ok: true, session: offlineSession };
  } catch {
    // Decryption failed => wrong password (GCM auth-tag mismatch).
    const failedAttempts = (vault.failedAttempts || 0) + 1;
    const locked = failedAttempts >= MAX_FAILED_ATTEMPTS;
    await putAuthVault({
      ...vault,
      failedAttempts: locked ? 0 : failedAttempts,
      lockedUntil: locked ? now + LOCKOUT_MS : 0,
    });
    if (locked) return { ok: false, reason: 'locked', retryAfterMs: LOCKOUT_MS };
    return { ok: false, reason: 'wrong-password', attemptsLeft: MAX_FAILED_ATTEMPTS - failedAttempts };
  }
}

/** Human-readable message for a failed offline sign-in. */
export function describeOfflineFailure(result: Extract<OfflineLoginResult, { ok: false }>): string {
  switch (result.reason) {
    case 'unsupported':
      return 'Offline sign-in is not available on this device. Connect to the internet to sign in.';
    case 'not-enrolled':
      return 'This account has not signed in on this device yet. Connect to the internet for the first sign-in.';
    case 'wrong-password':
      return `Incorrect password.${result.attemptsLeft != null ? ` ${result.attemptsLeft} attempt(s) left before offline sign-in locks.` : ''}`;
    case 'expired':
      return 'Your offline sign-in has expired. Connect to the internet once to renew it.';
    case 'locked': {
      const mins = Math.max(1, Math.ceil((result.retryAfterMs ?? LOCKOUT_MS) / 60000));
      return `Too many incorrect passwords. Offline sign-in is locked for ${mins} minute(s).`;
    }
    default:
      return 'Unable to sign in offline.';
  }
}

// ------------------------------------------------------------
// Enrolment status / housekeeping
// ------------------------------------------------------------
export interface OfflineEnrolment {
  username: string;
  displayName: string;
  enrolledAt: number;
  expiresAt: number;
  expired: boolean;
  lockedUntil: number;
}

function toEnrolment(v: AuthVaultRecord): OfflineEnrolment {
  return {
    username: v.username,
    displayName: v.displayName,
    enrolledAt: v.enrolledAt,
    expiresAt: v.expiresAt,
    expired: v.expiresAt < Date.now(),
    lockedUntil: v.lockedUntil,
  };
}

/** Is this username able to sign in offline right now? */
export async function getOfflineEnrolment(username: string): Promise<OfflineEnrolment | null> {
  const v = await getAuthVault(normaliseUsername(username));
  return v ? toEnrolment(v) : null;
}

/** Every account enrolled for offline sign-in on this device. */
export async function listOfflineEnrolments(): Promise<OfflineEnrolment[]> {
  const all = await listAuthVaults();
  return all.map(toEnrolment).sort((a, b) => b.enrolledAt - a.enrolledAt);
}

/**
 * Remove a device enrolment — used by "forget this device" and on sign-out from
 * a shared workstation. Also clears the cached session so the dashboard cannot
 * be reached by navigating straight to it.
 */
export async function revokeOfflineCredentials(username: string): Promise<void> {
  await deleteAuthVault(normaliseUsername(username));
  await removeCachedData('session');
  await removeCachedData('currentUser');
}
