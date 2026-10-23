// ============================================================
// Is push actually working?
// ------------------------------------------------------------
//   GET /api/push-health
//
// Written because nobody could answer that question. Push had been built,
// deployed and believed to be working for weeks while FCM_SERVICE_ACCOUNT was
// simply absent — every send path is wrapped in isFcmConfigured(), which
// returns false and no-ops silently. Nothing logged, nothing failed, nothing
// arrived. The only way to find out was to read the environment variable list
// by eye.
//
// A missing credential and a working one must not look the same from outside,
// so this says which it is.
//
// WHAT IT DELIBERATELY DOES NOT RETURN: the service account, the project id,
// the private key, any device token, or anything else that would be worth
// stealing. Booleans and counts only. It still requires a signed-in session,
// because even "push is not configured" is a thing worth not advertising to
// the internet.
// ============================================================

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { isFcmConfigured } from '@/lib/fcm';
import { isWebPushConfigured } from '@/lib/webpush';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const fcm = isFcmConfigured();
    const webPush = isWebPushConfigured();

    const [myDevices, totalDevices, myWebSubs] = await Promise.all([
      prisma.deviceToken.count({ where: { userId } }),
      prisma.deviceToken.count(),
      prisma.pushSubscription.count({ where: { userId } }).catch(() => -1),
    ]);

    // Said in words, because the numbers alone do not tell you which of the
    // several ways this can be broken you are looking at.
    const problems: string[] = [];
    if (!fcm) {
      problems.push(
        'FCM_SERVICE_ACCOUNT is missing or not valid JSON, so NO native push can be sent to any phone. ' +
          'Note that a Vercel environment variable only takes effect on a NEW deployment — adding it is not enough on its own.',
      );
    }
    if (!webPush) {
      problems.push(
        'VAPID keys are missing, so browser and desktop push cannot be sent. NEXT_PUBLIC_VAPID_PUBLIC_KEY must not be marked Sensitive, or the browser cannot read it.',
      );
    }
    if (fcm && totalDevices === 0) {
      problems.push(
        'Push is configured but no device has registered. Someone must open the installed Android app and allow notifications.',
      );
    }
    if (fcm && myDevices === 0 && totalDevices > 0) {
      problems.push(
        'Other devices are registered but none of yours. Open the installed app on your own phone and allow notifications.',
      );
    }

    return NextResponse.json({
      ok: problems.length === 0,
      nativePush: { configured: fcm, myDevices, totalDevices },
      webPush: { configured: webPush, mySubscriptions: myWebSubs },
      problems,
    });
  } catch (err) {
    console.error('[push-health] failed:', err);
    return NextResponse.json({ error: 'Could not check push health' }, { status: 500 });
  }
}
