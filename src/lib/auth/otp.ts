// ============================================================
// One-time codes for account recovery
// ------------------------------------------------------------
// 97% of approved staff here have a phone number on file and only 82% have an
// email address, so a code sent to the phone reaches 79 more people than a
// reset link ever did. It also survives the thing email cannot: a member of
// staff standing in a theatre corridor on the hospital network, locked out,
// with no way to reach their inbox.
//
// This file holds the rules and none of the plumbing, so the rules can be
// proved rather than read. Everything here is pure: no database, no network,
// no clock of its own — the caller passes `now` in.
//
// THREE THINGS THIS MUST NEVER DO
//
// 1. Store a code anybody can read. The existing password-reset token is kept
//    in plain text on the user row, which means database read access is
//    account takeover for all 551 accounts. Codes here are hashed, and the
//    plain code exists only in the SMS and in the user's memory.
//
// 2. Tell a stranger whether an account exists. Every answer to "send me a
//    code" is identical whether the account is real or invented. Otherwise the
//    endpoint becomes a way to enumerate every member of staff in the hospital.
//
// 3. Allow guessing. A six-digit code is one in a million per attempt, which is
//    strong — and worthless without a cap, because a script can try a million
//    times in an afternoon. Five attempts, then the code dies.
// ============================================================

import crypto from 'crypto';

/** Six digits. Long enough to resist guessing under the attempt cap, short
 *  enough to be read once off a phone and typed without a mistake. */
export const CODE_LENGTH = 6;

/** How long a code lives. Long enough to arrive over a slow Nigerian SMS
 *  route and be typed; short enough that a phone left on a desk is not a key. */
export const CODE_TTL_MS = 10 * 60 * 1000;

/** Wrong guesses before the code is destroyed. */
export const MAX_ATTEMPTS = 5;

/** Codes a single account may request inside the window below. */
export const MAX_REQUESTS_PER_WINDOW = 3;
export const REQUEST_WINDOW_MS = 30 * 60 * 1000;

/** Minimum gap between two requests, so a repeated tap is not a new code. */
export const RESEND_COOLDOWN_MS = 60 * 1000;

export type OtpPurpose = 'PASSWORD_RESET' | 'USERNAME_RECOVERY';

/**
 * A cryptographically random numeric code.
 *
 * randomInt, not Math.random: this is a credential. Leading zeros are kept, so
 * the code is always exactly CODE_LENGTH characters and "004821" never becomes
 * "4821" and fails to match.
 */
export function generateCode(length: number = CODE_LENGTH): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += String(crypto.randomInt(0, 10));
  return out;
}

/**
 * Hash a code for storage.
 *
 * SHA-256 with a server-side pepper rather than bcrypt. Bcrypt is right for
 * passwords because they are low-entropy and long-lived; this is a six-digit
 * value that dies in ten minutes, and it is verified on a route that must stay
 * fast under repeated attempts. The pepper is what stops a stolen database
 * being brute-forced offline — a million candidates is nothing without it.
 */
export function hashCode(code: string, pepper: string): string {
  return crypto.createHmac('sha256', pepper).update(code).digest('hex');
}

/**
 * Compare in constant time.
 *
 * A plain === leaks, through timing, how many leading characters were right.
 * With only a million possibilities that is a real shortcut, not a theoretical
 * one.
 */
export function codeMatches(code: string, storedHash: string, pepper: string): boolean {
  const candidate = hashCode(code, pepper);
  const a = Buffer.from(candidate, 'utf8');
  const b = Buffer.from(storedHash, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Nigerian numbers, in the one shape a gateway will accept.
 *
 * Staff enter these six different ways: 08039133373, +2348039133373,
 * 2348039133373, 234 803 913 3373, with dashes, with brackets. All of them are
 * the same person, and a recovery route that only recognises one of them locks
 * out everybody who typed a different one.
 *
 * Returns E.164 without the plus (234...), which is what Termii expects.
 */
export function normaliseNigerianPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, '');
  if (!digits) return null;

  // 0803 913 3373 -> 234 803 913 3373
  if (digits.length === 11 && digits.startsWith('0')) return `234${digits.slice(1)}`;
  // 803 913 3373 (leading zero dropped, common when typed from a contact card)
  if (digits.length === 10 && !digits.startsWith('0')) return `234${digits}`;
  // Already 234...
  if (digits.length === 13 && digits.startsWith('234')) return digits;
  // 00234...
  if (digits.length === 15 && digits.startsWith('00234')) return digits.slice(2);

  return null;
}

/**
 * What the user is shown, so they can tell which phone to pick up without the
 * screen displaying a number to whoever asked for the code.
 *
 * 2348039133373 -> 0803****373
 */
export function maskPhone(e164: string | null | undefined): string {
  const n = normaliseNigerianPhone(e164);
  if (!n) return 'the number on file';
  const local = `0${n.slice(3)}`; // back to 0803...
  return `${local.slice(0, 4)}****${local.slice(-3)}`;
}

export interface ExistingCode {
  createdAt: Date;
  consumedAt: Date | null;
}

export type RequestVerdict =
  | { allowed: true }
  | { allowed: false; reason: 'COOLDOWN'; retryAfterMs: number }
  | { allowed: false; reason: 'TOO_MANY'; retryAfterMs: number };

/**
 * May this account be sent another code?
 *
 * Counts every code issued in the window, used or not. Counting only unused
 * ones would let somebody request, consume, request, consume without limit,
 * which is exactly the pattern of an attacker working through a list.
 */
export function canRequest(recent: readonly ExistingCode[], now: Date = new Date()): RequestVerdict {
  const t = now.getTime();
  const inWindow = recent.filter((c) => t - c.createdAt.getTime() < REQUEST_WINDOW_MS);

  const newest = inWindow.reduce<Date | null>(
    (max, c) => (!max || c.createdAt > max ? c.createdAt : max),
    null,
  );
  if (newest) {
    const since = t - newest.getTime();
    if (since < RESEND_COOLDOWN_MS) {
      return { allowed: false, reason: 'COOLDOWN', retryAfterMs: RESEND_COOLDOWN_MS - since };
    }
  }

  if (inWindow.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldest = inWindow.reduce((min, c) => (c.createdAt < min.createdAt ? c : min), inWindow[0]);
    return {
      allowed: false,
      reason: 'TOO_MANY',
      retryAfterMs: REQUEST_WINDOW_MS - (t - oldest.createdAt.getTime()),
    };
  }

  return { allowed: true };
}

export interface StoredOtp {
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
}

export type VerifyVerdict =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' | 'EXPIRED' | 'ALREADY_USED' | 'TOO_MANY_ATTEMPTS' | 'WRONG_CODE' };

/**
 * Is this the right code, and is it still allowed to work?
 *
 * Order matters. Expiry and the attempt cap are checked BEFORE the code is
 * compared, so a dead code costs an attacker nothing to test and tells them
 * nothing about whether their guess was right.
 */
export function verifyCode(
  stored: StoredOtp | null | undefined,
  submitted: string,
  pepper: string,
  now: Date = new Date(),
): VerifyVerdict {
  if (!stored) return { ok: false, reason: 'NOT_FOUND' };
  if (stored.consumedAt) return { ok: false, reason: 'ALREADY_USED' };
  if (stored.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'EXPIRED' };
  if (stored.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'TOO_MANY_ATTEMPTS' };

  const clean = String(submitted ?? '').replace(/\D/g, '');
  if (clean.length !== CODE_LENGTH) return { ok: false, reason: 'WRONG_CODE' };
  if (!codeMatches(clean, stored.codeHash, pepper)) return { ok: false, reason: 'WRONG_CODE' };

  return { ok: true };
}

/**
 * The single message a locked-out member of staff sees, whatever happened.
 *
 * Deliberately identical for a real account, an account with no phone number,
 * and a username somebody invented. The alternative tells anyone who asks which
 * of 551 staff names are real.
 */
export const GENERIC_REQUEST_RESPONSE =
  'If that account exists and has a phone number on file, a 6-digit code has been sent to it. ' +
  'The code lasts 10 minutes.';

/** What the SMS itself says. Short: Nigerian gateways bill per 160 characters,
 *  and a code buried in a paragraph is a code that gets mistyped. */
export function otpMessage(code: string, purpose: OtpPurpose): string {
  const what = purpose === 'PASSWORD_RESET' ? 'reset your password' : 'recover your username';
  return `${code} is your UNTH Theatre code to ${what}. It expires in 10 minutes. Do not share it with anyone.`;
}
