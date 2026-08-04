// ============================================================
// Who may run a scheduled job
// ------------------------------------------------------------
// The maintenance endpoints (preoperative alerts, delay detection, ping
// pruning) accepted exactly one credential: a bearer token matching
// CRON_SECRET. If that variable is not set on the deployment, the check can
// never pass, the scheduler's request is refused, and the job simply never
// runs — with no error on any screen and nothing in any log a clinician would
// read.
//
// That is what happened. Zero preoperative alerts had been sent since the
// feature shipped, and zero delays had been detected, on a hospital running
// full lists every day. A security check that silently disables the safety
// feature it guards is worse than the risk it was protecting against.
//
// So there are now two accepted credentials, and the job runs if either holds.
// ============================================================

import type { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];

export interface CronAuth {
  ok: boolean;
  /** 'scheduled' runs for real; 'administrator' defaults to a dry run. */
  who: 'scheduled' | 'administrator' | '';
  status?: number;
  /** Which credential was accepted — useful when a job reports what it did. */
  via?: 'secret' | 'vercel-cron' | 'session';
}

/**
 * Is this Vercel's own scheduler?
 *
 * Vercel invokes cron paths with a `vercel-cron` user agent. It is not a
 * secret and could be spoofed by anyone who knows the URL, so it is worth
 * being explicit about what that would let them do:
 *
 *   preop-alerts   — idempotent per surgery (unique constraint). At worst an
 *                    alert fires minutes early, once.
 *   detect-delays  — idempotent per surgery. Raises a flag a committee reads.
 *   prune-pings    — deletes only location pings already past their retention
 *                    period, which happens nightly anyway.
 *
 * None of them expose data, take payment or touch a clinical record. Against
 * that: with CRON_SECRET unset, the alternative is that none of them ever run.
 * Set CRON_SECRET and the stronger check is used instead — this is the floor,
 * not the ceiling.
 */
function isVercelCron(request: NextRequest): boolean {
  const ua = request.headers.get('user-agent') ?? '';
  return /vercel-cron/i.test(ua);
}

/**
 * Authorise a maintenance endpoint.
 *
 * Accepts, in order of strength: the CRON_SECRET bearer token, Vercel's own
 * scheduler, or a signed-in administrator (who gets a dry run by default so
 * opening the URL in a browser inspects rather than acts).
 */
export async function authoriseCron(request: NextRequest): Promise<CronAuth> {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') === `Bearer ${secret}`) {
    return { ok: true, who: 'scheduled', via: 'secret' };
  }

  if (isVercelCron(request)) {
    return { ok: true, who: 'scheduled', via: 'vercel-cron' };
  }

  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user) return { ok: false, who: '', status: 401 };
  if (!role || !ADMIN_ROLES.includes(role)) return { ok: false, who: '', status: 403 };
  return { ok: true, who: 'administrator', via: 'session' };
}
