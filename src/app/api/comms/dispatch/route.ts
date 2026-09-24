// ============================================================
// POST /api/comms/dispatch — hand the queue to WhatsApp
// ------------------------------------------------------------
// The queue has existed for months with nothing to drain it. This is the tick
// that does, run by the scheduler every few minutes, and callable by an
// administrator from the setup screen to see what would happen.
//
// It is deliberately dull. It claims, it sends, it records. Every decision
// about WHETHER a message should exist was made when it was queued, by
// checkSendAllowed, and re-litigating any of that here would give the hospital
// two places to look when a message did not arrive.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { authoriseCron } from '@/lib/cronAuth';
import { apiError } from '@/lib/apiError';
import { dispatchWhatsApp, rescueStranded, dispatchMode } from '@/lib/comms/dispatch';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const auth = await authoriseCron(request);
  if (!auth.ok) {
    return NextResponse.json(
      {
        error: auth.status === 401
          ? 'Sign in to continue.'
          : 'Only an administrator or the scheduler may send the queue.',
      },
      { status: auth.status ?? 403 },
    );
  }

  try {
    // Rescue first. A row stranded by the previous run is older than anything
    // queued since, and putting it back before claiming means it goes out in
    // this tick rather than waiting for the next one.
    const rescued = await rescueStranded();
    const summary = await dispatchWhatsApp();

    return NextResponse.json({
      ...summary,
      rescued,
      mode: await dispatchMode(),
      ranBy: auth.who,
      // In dry run this is the whole point of the call: the exact template and
      // values that would have gone to each number, so the wording can be
      // checked before a single consultant is messaged.
      at: new Date().toISOString(),
    });
  } catch (error) {
    return apiError('comms/dispatch', error);
  }
}

/** Convenience for the setup screen: what would happen, without doing it. */
export async function GET(request: NextRequest) {
  const auth = await authoriseCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: 'Only an administrator may read this.' },
      { status: auth.status ?? 403 });
  }
  return NextResponse.json({ mode: await dispatchMode() });
}
