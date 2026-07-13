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
 * GET /api/device-tokens — diagnostic for the current user: how many devices
 * are registered for push, on which platforms, and when last seen. Lets the
 * app show the user whether THIS install successfully registered for push.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id ?? null;
    if (!userId) {
      return NextResponse.json({ registered: 0, platforms: [], lastSeenAt: null });
    }
    const tokens = await prisma.deviceToken.findMany({
      where: { userId },
      select: { platform: true, lastSeenAt: true },
      orderBy: { lastSeenAt: 'desc' },
    });
    return NextResponse.json({
      registered: tokens.length,
      platforms: Array.from(new Set(tokens.map((t) => t.platform))),
      lastSeenAt: tokens[0]?.lastSeenAt ?? null,
    });
  } catch (err) {
    console.error('device-tokens GET error:', err);
    return NextResponse.json({ registered: 0, platforms: [], lastSeenAt: null });
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
