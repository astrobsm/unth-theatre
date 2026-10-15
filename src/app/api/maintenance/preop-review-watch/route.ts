// ============================================================
// The evening watch on tomorrow's preoperative anaesthetic reviews
// ------------------------------------------------------------
// Two scheduled runs, both WAT:
//
//   18:00 UTC = 7pm WAT — tells the Head of Anaesthesia which of tomorrow's
//   cases are still unreviewed, while there is still time to reassign them.
//
//   20:00 UTC = 9pm WAT — records the lapse and raises the summons.
//
// The hours are WAT in the rule and UTC in the crontab because Vercel
// schedules in UTC and Nigeria has no daylight saving. The job itself does
// not read the clock to decide which pass it is: it asks reviewWatch what
// state each case is in, so running it at any hour does the right thing for
// that hour, and running it twice does nothing twice.
//
// An administrator calling this by hand gets a DRY RUN unless they ask
// otherwise, because the live run puts a summons on somebody's name and that
// should not be a thing you do by opening a URL to see what it says.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { authoriseCron } from '@/lib/cronAuth';
import { runPreopReviewWatch } from '@/lib/anaesthesia/reviewWatchRunner';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

async function handle(request: NextRequest) {
  const auth = await authoriseCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status ?? 401 });
  }

  const { searchParams } = new URL(request.url);

  // A scheduled run is live. A person gets a dry run unless they say
  // ?live=true — the difference is whether anybody is summoned.
  const dryRun = auth.who === 'scheduled'
    ? searchParams.get('dry') === 'true'
    : searchParams.get('live') !== 'true';

  // Lets an administrator look at a specific night, including one already
  // past, without waiting for it to come round again.
  const day = searchParams.get('day') ?? undefined;

  try {
    const summary = await runPreopReviewWatch({ dryRun, day });
    return NextResponse.json({ ok: true, who: auth.who, ...summary });
  } catch (error) {
    console.error('preop-review-watch failed:', error);
    return NextResponse.json(
      { error: 'The preoperative review watch failed', detail: String(error) },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
