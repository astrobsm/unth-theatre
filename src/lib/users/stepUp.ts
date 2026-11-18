// ============================================================
// Asking for the administrator's own password again
// ------------------------------------------------------------
// Three things on the user-accounts screen are not ordinary edits: deleting an
// account, merging one into another, and changing the name somebody signs in
// with. Each is irreversible from the screen, each takes effect for everybody
// at once, and each is exactly what somebody would do first if they found an
// administrator's machine unlocked and unattended in a theatre corridor.
//
// So they ask for the password again. Not a second factor and not a new
// credential -- the same password that opened the session, typed deliberately,
// at the moment of the act. It turns "the browser is signed in" into "the
// person holding the keyboard knows the password", which is the only question
// worth asking when the risk is a borrowed session rather than a stolen one.
//
// This file holds the rules and the wording. The checking lives in
// adminPassword.ts, which needs a database and bcrypt; everything here is
// arithmetic and sentences, so it can be proved.
// ============================================================

import { overLimit, pruneAttempts, retryAfterSeconds } from '@/lib/auth/resetThrottle';

/** Acts that require the password, and what each one is called on screen. */
export const STEP_UP_ACTIONS = {
  delete: 'delete accounts',
  merge: 'merge accounts',
  rename: 'change a sign-in name',
} as const;

export type StepUpAction = keyof typeof STEP_UP_ACTIONS;

/**
 * Wrong passwords allowed before the account is asked to wait.
 *
 * Deliberately smaller than the sign-in limit. A member of staff mistyping
 * their own password at the login box is ordinary; an administrator mistyping
 * it five times in front of a confirmation dialogue that says what it is for
 * is not, and the next most likely explanation is somebody guessing.
 */
export const MAX_PASSWORD_ATTEMPTS = 5;

/** The window those attempts are counted over -- the same one resets use. */
export { WINDOW_MS } from '@/lib/auth/resetThrottle';

export function tooManyAttempts(attempts: readonly number[], now: number = Date.now()): boolean {
  return overLimit(attempts, MAX_PASSWORD_ATTEMPTS, now);
}

export function recordAttempt(attempts: readonly number[], now: number = Date.now()): number[] {
  return [...pruneAttempts(attempts, now), now];
}

export function waitSeconds(attempts: readonly number[], now: number = Date.now()): number {
  return retryAfterSeconds(attempts, now);
}

/** What the confirmation box says it is about to do. */
export function stepUpPrompt(action: StepUpAction): string {
  return `Enter your administrator password to ${STEP_UP_ACTIONS[action]}.`;
}

/**
 * Refusals, in the three shapes they come in.
 *
 * The wrong-password message deliberately does not say whether the account
 * exists or how many tries are left: an administrator who typed it wrong knows
 * what to do, and anybody else learns nothing.
 */
export function missingPasswordMessage(action: StepUpAction): string {
  return stepUpPrompt(action);
}

export function wrongPasswordMessage(): string {
  return 'That is not your password. Nothing was changed.';
}

export function lockedOutMessage(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return `Too many wrong passwords. Nothing was changed. Try again in ${
    minutes <= 1 ? 'a minute' : `${minutes} minutes`
  }.`;
}
