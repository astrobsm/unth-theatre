// ============================================================
// Retention — location pings do not live for ever
// ------------------------------------------------------------
// The ping history exists so a coordinator can see that somebody marked
// themselves available from the car park, and so an incident can be
// reconstructed afterwards. Neither of those needs last year's movements.
//
// Staff location is among the most sensitive data this system holds, and the
// honest default for sensitive data is that it expires. Ninety days covers any
// realistic review, audit or incident investigation and then it is gone.
//
// Deleted, not archived. An "archive" of staff positions is the same data with
// a softer name.
//
// The current position on the user row is NOT touched: that is the live board,
// it is overwritten by the next update, and it is cleared the moment somebody
// goes off duty.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Days of history kept. Overridable, but the default is deliberately short. */
const RETENTION_DAYS = Number(process.env.LOCATION_PING_RETENTION_DAYS ?? 90);

const ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];

/**
 * Who may run this.
 *
 * Vercel signs its scheduled invocations with CRON_SECRET, so the cron gets in
 * without a session. Otherwise an administrator may run it by hand — useful
 * after changing the retention period, rather than waiting a day for the
 * schedule to come round.
 */
async function authorise(request: NextRequest): Promise<{ ok: boolean; who: string; status?: number }> {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (secret && auth === `Bearer ${secret}`) return { ok: true, who: 'scheduled' };

  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user) return { ok: false, who: '', status: 401 };
  if (!role || !ADMIN_ROLES.includes(role)) return { ok: false, who: '', status: 403 };
  return { ok: true, who: 'administrator' };
}

/**
 * Vercel invokes a scheduled job with GET, so GET has to be the one that
 * actually prunes — a schedule that only ever reported would look healthy in
 * the logs while the data it was meant to expire quietly accumulated.
 *
 * An administrator opening this by hand gets a DRY RUN instead, and has to ask
 * for `?commit=true` to delete anything. Same verb, different caller, different
 * default: the machine does the job it was scheduled for, a person is shown
 * what would happen first.
 */
export async function GET(request: NextRequest) {
  const auth = await authorise(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Sign in to continue.' : 'Only an administrator may prune location history.' },
      { status: auth.status ?? 403 }
    );
  }
  const askedToCommit = request.nextUrl.searchParams.get('commit') === 'true';
  return run(auth, auth.who === 'scheduled' || askedToCommit);
}

/** Explicit commit, for a caller that wants no ambiguity. */
export async function POST(request: NextRequest) {
  const auth = await authorise(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Sign in to continue.' : 'Only an administrator may prune location history.' },
      { status: auth.status ?? 403 }
    );
  }
  return run(auth, true);
}

/** Both entry points authorise before calling this, so it only does the work. */
async function run(auth: { who: string }, commit: boolean) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  try {
    // How much is due to go, counted either way so a dry run and a real run
    // report the same number.
    const due = await prisma.staffLocationPing.count({ where: { capturedAt: { lt: cutoff } } });

    if (!commit) {
      const total = await prisma.staffLocationPing.count();
      return NextResponse.json({
        retentionDays: RETENTION_DAYS,
        cutoff,
        totalPings: total,
        olderThanCutoff: due,
        committed: false,
      });
    }

    const { count } = await prisma.staffLocationPing.deleteMany({
      where: { capturedAt: { lt: cutoff } },
    });

    console.log(`[retention] pruned ${count} location pings older than ${cutoff.toISOString()} (${auth.who})`);

    return NextResponse.json({
      retentionDays: RETENTION_DAYS,
      cutoff,
      deleted: count,
      committed: true,
      ranBy: auth.who,
    });
  } catch (error) {
    console.error('[retention] location ping prune failed:', error);
    return NextResponse.json({ error: 'Failed to prune location history' }, { status: 500 });
  }
}
