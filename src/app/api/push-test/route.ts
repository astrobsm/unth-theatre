import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { isFcmConfigured, sendPushToUsers } from '@/lib/fcm';

export const dynamic = 'force-dynamic';

/**
 * POST /api/push-test — send a test push notification to the CURRENT user's own
 * registered devices. Lets staff verify end-to-end that push works on their
 * phone. Returns clear diagnostics so failures are easy to understand.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id ?? null;
    if (!userId) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    if (!isFcmConfigured()) {
      return NextResponse.json(
        { ok: false, reason: 'fcm_not_configured', message: 'Push service is not configured on the server.' },
        { status: 200 },
      );
    }

    const tokenCount = await prisma.deviceToken.count({ where: { userId } });
    if (tokenCount === 0) {
      return NextResponse.json(
        {
          ok: false,
          reason: 'no_devices',
          message:
            'No push-registered device found for your account. Open the installed app, allow notifications, then try again.',
        },
        { status: 200 },
      );
    }

    await sendPushToUsers([userId], {
      title: '🔔 Test notification',
      body: 'Push notifications are working on this device.',
      link: '/dashboard',
      data: { kind: 'push_test' },
    });

    return NextResponse.json({ ok: true, devices: tokenCount });
  } catch (err) {
    console.error('push-test error:', err);
    return NextResponse.json({ error: 'Failed to send test push' }, { status: 500 });
  }
}
