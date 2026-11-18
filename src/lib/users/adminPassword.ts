// ============================================================
// Checking the administrator's password, for the acts that need it
// ------------------------------------------------------------
// The rules are in stepUp.ts and are proved there. This file does the two
// things that need a running system: compare a bcrypt hash, and remember how
// many times this administrator has got it wrong lately.
//
// The counter is in memory, per process. That is enough for what it defends
// against -- somebody at an unattended keyboard working through guesses -- and
// it is honest about what it is not: a server restart clears it, and two
// instances count separately. A durable counter would mean a table, a write on
// every wrong password, and a replication lane, for a threat that is standing
// in the room rather than coming down the wire.
// ============================================================

import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import {
  lockedOutMessage,
  missingPasswordMessage,
  recordAttempt,
  tooManyAttempts,
  waitSeconds,
  wrongPasswordMessage,
  type StepUpAction,
} from '@/lib/users/stepUp';

export type StepUpResult = { ok: true } | { ok: false; status: number; error: string };

const failures = new Map<string, number[]>();

/** Exposed for tests and for a sign-out to clear; never called by a route. */
export function forgetAttempts(adminId: string): void {
  failures.delete(adminId);
}

/**
 * Is this the signed-in administrator's own password?
 *
 * Returns a refusal rather than throwing, so a route can answer with it
 * directly and nothing half-done is left behind: every caller checks this
 * BEFORE it writes anything.
 */
export async function confirmAdminPassword(
  adminId: string,
  password: unknown,
  action: StepUpAction,
): Promise<StepUpResult> {
  const typed = typeof password === 'string' ? password : '';
  if (!typed) {
    return { ok: false, status: 400, error: missingPasswordMessage(action) };
  }

  const attempts = failures.get(adminId) ?? [];
  if (tooManyAttempts(attempts)) {
    return { ok: false, status: 429, error: lockedOutMessage(waitSeconds(attempts)) };
  }

  const me = await prisma.user.findUnique({
    where: { id: adminId },
    select: { password: true },
  });
  // No row, or an account with no usable hash, is a refusal and not a pass.
  const matches = me?.password ? await bcrypt.compare(typed, me.password) : false;

  if (!matches) {
    const next = recordAttempt(attempts);
    failures.set(adminId, next);
    return tooManyAttempts(next)
      ? { ok: false, status: 429, error: lockedOutMessage(waitSeconds(next)) }
      : { ok: false, status: 401, error: wrongPasswordMessage() };
  }

  failures.delete(adminId);
  return { ok: true };
}
