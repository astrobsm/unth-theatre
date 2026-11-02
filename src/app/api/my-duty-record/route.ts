// ============================================================
// My own duty record
// ------------------------------------------------------------
//   GET ?days=30
//
// Personal, like the anaesthetist's case list: it answers only for the
// signed-in colleague, and the user id comes from the session and never from
// the request. There is no way to ask this endpoint about somebody else, which
// is the point — a staff member seeing their own figures is a different thing
// from staff members comparing each other's, and only the first belongs on a
// dashboard.
//
// WHY IT EXISTS AT ALL. Until now these figures were visible to theatre
// management and to nobody else, which meant the first a nurse heard about her
// own record was a chase message. That is the wrong order. Somebody shown two
// unrecorded discharges on a Tuesday can enter them on the Tuesday, and then
// there is no chase to send — which is the outcome everybody actually wants.
//
// ONLY THE DUTIES THEY CARRY. Each duty names the roles that perform it, and
// only those are computed. A pharmacist is not shown a recovery-room figure,
// and — this matters for the dashboard — nobody pays for ten collectors to run
// when they hold two. A colleague with work recorded against them for a duty
// outside their role will not see it here; theatre management's board does
// show it, and that asymmetry is deliberate rather than overlooked.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { collectDutyEvents } from '@/lib/dutyPerformance/collect';
import { buildDutyReport } from '@/lib/dutyPerformance/report';
import { DUTIES, DUTY_KEYS, type DutyKey } from '@/lib/dutyPerformance/types';
import {
  myHeadline, myStanding, sortMine, summariseMine, type MyDutyStanding,
} from '@/lib/dutyPerformance/myRecord';
import { periodLabel } from '@/lib/dutyPerformance/export';

export const dynamic = 'force-dynamic';

/** WAT is UTC+1 all year, so a calendar day never needs a timezone table. */
function watToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 60 * 60_000).toISOString().slice(0, 10);
}

function minusDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const raw = Number(req.nextUrl.searchParams.get('days') ?? '30');
    // Ninety at the outside: beyond that this runs several collectors over a
    // quarter of the hospital's theatre activity on a dashboard load.
    const days = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 90) : 30;

    const to = watToday();
    const from = minusDays(to, days - 1);

    const role = String(user.role ?? '');
    const mine: DutyKey[] = DUTY_KEYS.filter((k) => DUTIES[k].roles.indexOf(role) !== -1);

    if (mine.length === 0) {
      return NextResponse.json({
        from, to, days, periodLabel: periodLabel(from, to),
        duties: [], counts: null, headline: '', carriesNone: true,
      });
    }

    const standings: MyDutyStanding[] = [];
    const built = await Promise.all(mine.map(async (duty) => {
      const events = await collectDutyEvents(duty, from, to);
      return { duty, report: buildDutyReport(duty, events, { from, to }) };
    }));
    built.forEach(({ duty, report }) => {
      const s = myStanding(duty, report, user.id as string);
      if (s) standings.push(s);
    });

    const sorted = sortMine(standings);
    const counts = summariseMine(sorted);

    return NextResponse.json({
      from,
      to,
      days,
      periodLabel: periodLabel(from, to),
      duties: sorted,
      counts,
      headline: myHeadline(counts),
      carriesNone: false,
    });
  } catch (err) {
    console.error('[my-duty-record] failed:', err);
    return NextResponse.json({ error: 'Could not read your record' }, { status: 500 });
  }
}
