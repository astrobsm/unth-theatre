// ============================================================
// Authenticating the peer node
// ------------------------------------------------------------
// The sync endpoints accept database writes from another machine, so they
// cannot use a staff session: there is no user, and no user should be able to
// reach them. A shared service token is checked instead, the same shape as the
// RADIUS secret that is already working.
// ============================================================

import crypto from 'crypto';

export type AuthResult =
  | { ok: true; node: string }
  | { ok: false; status: 401 | 403 | 503; error: string };

/**
 * Compare without leaking length or content through timing.
 *
 * A plain `a === b` returns as soon as it finds a differing byte, so an
 * attacker can recover a token one character at a time by measuring response
 * times. Both sides are hashed first so timingSafeEqual always sees equal
 * lengths — it throws otherwise, and that throw is itself a length oracle.
 */
export function tokensMatch(provided: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/** Pull the bearer token out of an Authorization header. */
export function bearerFrom(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}

/**
 * Authenticate a sync request.
 *
 * Refuses outright when no token is configured. An endpoint that accepts
 * writes and has no secret set must fail closed — an unconfigured deployment
 * silently accepting anything is worse than one that is plainly broken.
 */
export function authenticateSync(
  authorization: string | null,
  fromNode: unknown,
  expectedToken: string | undefined
): AuthResult {
  if (!expectedToken || expectedToken.length < 32) {
    return {
      ok: false, status: 503,
      error: 'SYNC_SERVICE_TOKEN is not configured (or is too short); this endpoint is closed.',
    };
  }
  const provided = bearerFrom(authorization);
  if (!provided) return { ok: false, status: 401, error: 'Bearer token required.' };
  if (!tokensMatch(provided, expectedToken)) return { ok: false, status: 403, error: 'Invalid token.' };
  if (typeof fromNode !== 'string' || !fromNode.trim()) {
    return { ok: false, status: 401, error: 'fromNode is required.' };
  }
  // A node claiming to be us would apply its changes as though we had made
  // them, and the loop-suppression flag would let them ship straight back.
  return { ok: true, node: fromNode.trim() };
}

/** Minimum length for a generated token. 32 hex chars is 128 bits. */
export const MIN_TOKEN_LENGTH = 32;
