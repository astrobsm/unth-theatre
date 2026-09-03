import { NextRequest, NextResponse } from 'next/server';
import { authoriseCron } from '@/lib/cronAuth';
import { runEmergencyEscalation } from '@/lib/emergencyEscalationRunner';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Walk the emergency board and chase whatever has not started.
 *
 * Called by the cron in vercel.json, and by an administrator pressing "check
 * now". Both routes are the same code, because a scheduled job that behaves
 * differently from the button beside it is a job nobody trusts.
 *
 * AUTHORISATION uses the shared authoriseCron, and that matters more than it
 * looks. This route originally accepted only a CRON_SECRET bearer token — and
 * lib/cronAuth exists precisely because that pattern had already silently
 * disabled three scheduled jobs here: with the variable unset the scheduler is
 * refused every time, the job never runs, and nothing appears on any screen to
 * say so. Zero preoperative alerts had been sent since that feature shipped.
 *
 * Repeating it would have been worse here, because the thing that silently
 * would not run is the chase after an emergency that never started.
 *
 * So: the secret if it is set, Vercel's own scheduler if it is not, or a
 * signed-in administrator pressing "Check now".
 */
async function handle(request: NextRequest) {
  const auth = await authoriseCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status ?? 401 });
  }

  try {
    const summary = await runEmergencyEscalation(new Date());
    // Reported so an administrator can see which credential ran it — the
    // difference between "the cron is working" and "only I can make it work".
    return NextResponse.json({ ok: true, ranAs: auth.who, via: auth.via, ...summary });
  } catch (error) {
    console.error('[emergency-escalation] run failed:', error);
    return NextResponse.json({ error: 'The escalation check failed.' }, { status: 500 });
  }
}

// GET for the cron (Vercel calls crons with GET), POST for the button.
export const GET = handle;
export const POST = handle;
