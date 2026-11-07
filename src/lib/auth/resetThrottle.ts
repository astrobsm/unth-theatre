// ============================================================
// How often one machine may reset a password by Staff ID number
// ------------------------------------------------------------
// The Staff ID path has no one-time code in front of it, by instruction on
// 7 November. That decision removes the thing that made guessing pointless, so
// the only remaining defence against somebody working down a list of staff
// numbers is how fast they are allowed to work and how loudly it is recorded.
//
// This file holds the counting rule and nothing else, so the rule can be
// proved rather than read. It is deliberately generous to a real person — a
// member of staff mistyping their number four times in a row is common, and
// locking them out would send them to the Theatre Manager, which is the queue
// this whole feature exists to shorten.
// ============================================================

/** Attempts one address may make before it is asked to wait. */
export const MAX_ATTEMPTS_PER_WINDOW = 12;

/** The window those attempts are counted over. */
export const WINDOW_MS = 30 * 60 * 1000;

/** Password changes one address may complete in that window. */
export const MAX_RESETS_PER_WINDOW = 4;

/**
 * Is this address over its limit?
 *
 * Takes the timestamps rather than reading a clock or a map, so the rule is
 * testable and the storage is somebody else's problem.
 */
export function overLimit(
  attempts: readonly number[],
  limit: number,
  now: number = Date.now(),
): boolean {
  return attempts.filter((t) => now - t < WINDOW_MS).length >= limit;
}

/** Drop what has aged out, so the stored list cannot grow without bound. */
export function pruneAttempts(
  attempts: readonly number[],
  now: number = Date.now(),
): number[] {
  return attempts.filter((t) => now - t < WINDOW_MS);
}

/**
 * How long until this address may try again.
 *
 * Reported in seconds so the screen can count down rather than say "later".
 */
export function retryAfterSeconds(
  attempts: readonly number[],
  now: number = Date.now(),
): number {
  const live = pruneAttempts(attempts, now);
  if (live.length === 0) return 0;
  const oldest = Math.min(...live);
  return Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000));
}
