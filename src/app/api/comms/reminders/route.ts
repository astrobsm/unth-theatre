// ============================================================
// POST /api/comms/reminders — the jobs that decide who to remind
// ------------------------------------------------------------
// Two jobs behind one route, chosen by ?job=. They share an authorisation
// check, a shape of response and a habit of never throwing, and splitting them
// into two routes would have duplicated all three.
//
//   ?job=tomorrow   the six o'clock digest about tomorrow's list
//   ?job=emergency  the ladder for an emergency that has not started
//
// NEITHER OF THESE SENDS ANYTHING. They queue. /api/comms/dispatch is what
// hands the queue to WhatsApp, and keeping the two apart is deliberate: a
// provider outage must not stop the hospital working out who should be told,
// and the record of "we decided to tell this person" is worth having even on a
// day when nothing could be delivered.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { authoriseCron } from '@/lib/cronAuth';
import { apiError } from '@/lib/apiError';
import { sendTomorrowDigest } from '@/lib/comms/tomorrowDigest';
import { runEmergencyNudges } from '@/lib/comms/emergencyNudges';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const auth = await authoriseCron(request);
  if (!auth.ok) {
    return NextResponse.json(
      {
        error: auth.status === 401
          ? 'Sign in to continue.'
          : 'Only an administrator or the scheduler may run the reminder jobs.',
      },
      { status: auth.status ?? 403 },
    );
  }

  const job = request.nextUrl.searchParams.get('job');

  try {
    if (job === 'tomorrow') {
      return NextResponse.json({ job, ...(await sendTomorrowDigest()), ranBy: auth.who });
    }
    if (job === 'emergency') {
      return NextResponse.json({ job, ...(await runEmergencyNudges()), ranBy: auth.who });
    }
    return NextResponse.json(
      { error: 'Name the job: ?job=tomorrow or ?job=emergency.' },
      { status: 400 },
    );
  } catch (error) {
    return apiError(`comms/reminders:${job}`, error);
  }
}
