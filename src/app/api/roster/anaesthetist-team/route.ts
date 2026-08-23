import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAnaesthetistTeam, getOnCallAnaesthetistTeam } from '@/lib/anaesthetistTeam';

export const dynamic = 'force-dynamic';

// GET /api/roster/anaesthetist-team?date=YYYY-MM-DD&subspecialty=...&unit=...
//
// The anaesthetist team (consultant / senior registrar / registrar) rostered to
// a surgical specialty on a day. Unlike /api/roster/anaesthetist-coverage, which
// reports on surgeries that already exist, this answers the question a BOOKING
// asks: "a CTU list next Tuesday — who is anaesthetising?" — before the case is
// created.
//
// `unit` accepts a surgical unit name ("CTU 1") and is translated through
// surgical_units; pass either it or `subspecialty`.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const dateStr = sp.get('date');
  const date = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(date.getTime())) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });

  // An emergency has no elective list and no rostered specialty, so it asks for
  // the day's on-call cover instead of specialty cover.
  const wantsOnCall = sp.get('oncall') === 'true' || sp.get('emergency') === 'true';

  try {
    const team = wantsOnCall
      ? await getOnCallAnaesthetistTeam(date)
      : await getAnaesthetistTeam({
        date,
        subspecialty: sp.get('subspecialty'),
        unit: sp.get('unit'),
      });
    return NextResponse.json(team);
  } catch (error) {
    console.error('Error resolving anaesthetist team:', error);
    return NextResponse.json({ error: 'Failed to resolve anaesthetist team' }, { status: 500 });
  }
}
