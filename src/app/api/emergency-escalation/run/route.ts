import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
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
 * AUTHORISATION. Vercel signs its cron calls with CRON_SECRET; a signed-in
 * administrator may also run it. Nothing else may, because this writes
 * notifications to other people and drafts committee summonses.
 */
function authorised(request: NextRequest, role: string | undefined): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get('authorization');
  if (secret && header === `Bearer ${secret}`) return true;
  return !!role && ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER'].includes(role);
}

async function handle(request: NextRequest) {
  const session = await getServerSession(authOptions).catch(() => null);
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!authorised(request, role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await runEmergencyEscalation(new Date());
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error('[emergency-escalation] run failed:', error);
    return NextResponse.json({ error: 'The escalation check failed.' }, { status: 500 });
  }
}

// GET for the cron (Vercel calls crons with GET), POST for the button.
export const GET = handle;
export const POST = handle;
