import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

// POST /api/notifications/subscribe - Save push subscription
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { endpoint, keys } = body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json(
        { error: 'Invalid push subscription format' },
        { status: 400 }
      );
    }

    // Upsert subscription (update if same endpoint exists)
    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        userId: session.user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: request.headers.get('user-agent') || undefined,
        updatedAt: new Date(),
      },
      create: {
        userId: session.user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: request.headers.get('user-agent') || undefined,
      },
    });

    return NextResponse.json({ id: subscription.id, message: 'Subscription saved' }, { status: 201 });
  } catch (error) {
    console.error('POST /api/notifications/subscribe error:', error);
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
  }
}

// DELETE /api/notifications/subscribe - Remove push subscription
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json({ error: 'endpoint is required' }, { status: 400 });
    }

    await prisma.pushSubscription.deleteMany({
      where: {
        endpoint,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ message: 'Subscription removed' });
  } catch (error) {
    console.error('DELETE /api/notifications/subscribe error:', error);
    return NextResponse.json({ error: 'Failed to remove subscription' }, { status: 500 });
  }
}
