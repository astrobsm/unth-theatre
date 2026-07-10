import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/device-tokens — register (or refresh) a device's FCM push token.
 * Called by the native app after it registers with Firebase Cloud Messaging.
 * Body: { token: string, platform?: 'android' | 'ios' }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const body = await request.json();
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!token) {
      return NextResponse.json({ error: 'token is required' }, { status: 400 });
    }
    const platform = ['android', 'ios', 'web'].includes(body?.platform) ? body.platform : 'android';
    const userId = (session?.user as any)?.id ?? null;
    const userRole = (session?.user as any)?.role ?? null;

    const rec = await prisma.deviceToken.upsert({
      where: { token },
      create: { token, platform, userId, userRole, lastSeenAt: new Date() },
      update: { platform, userId, userRole, lastSeenAt: new Date() },
    });
    return NextResponse.json({ ok: true, id: rec.id });
  } catch (err) {
    console.error('device-tokens register error:', err);
    return NextResponse.json({ error: 'Failed to register device token' }, { status: 500 });
  }
}

/**
 * DELETE /api/device-tokens?token=... — unregister a token (e.g. on sign-out).
 */
export async function DELETE(request: NextRequest) {
  try {
    const token = new URL(request.url).searchParams.get('token') || '';
    if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });
    await prisma.deviceToken.deleteMany({ where: { token } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('device-tokens delete error:', err);
    return NextResponse.json({ error: 'Failed to remove device token' }, { status: 500 });
  }
}
