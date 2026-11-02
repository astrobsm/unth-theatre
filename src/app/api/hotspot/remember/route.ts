// ============================================================
// "Keep this phone on the theatre Wi-Fi"
// ------------------------------------------------------------
//   POST   { mac, remember }  — record the choice made on the portal
//   GET                       — the devices I have kept
//   DELETE ?id=…              — stop keeping one
//
// Called from the captive portal in the two seconds between the application
// sign-in succeeding and the browser leaving for the router. That ordering is
// not incidental: the row has to exist before the router asks RADIUS, because
// RADIUS is what reads it. See scripts/local-server/radius-bridge.ts.
//
// PERSONAL THROUGHOUT. The user id comes from the session and never from the
// request, so there is no way to enrol somebody else's phone or to read their
// list. A MAC arriving in the body is only ever attached to the caller.
//
// NEVER FATAL. A failure here costs the person a silent reconnection next
// week. Refusing to let them onto hospital Wi-Fi over it would be absurd, so
// the portal ignores the outcome and carries on.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  deviceLabel, expiryFrom, isRemembered, normaliseMac, rememberedUntil,
} from '@/lib/hotspot/devices';

export const dynamic = 'force-dynamic';

async function requireUser() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string } | undefined;
  return user?.id ?? null;
}

export async function POST(req: NextRequest) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const mac = normaliseMac(typeof body?.mac === 'string' ? body.mac : null);
    const remember = body?.remember !== false;

    // No MAC means the portal was opened directly rather than by the router,
    // so there is no device to remember. Said plainly rather than failed: the
    // page offers the choice before it knows whether the router named one.
    if (!mac) {
      return NextResponse.json({
        ok: false,
        reason: 'NO_DEVICE',
        message: 'The router did not say which device this is, so it cannot be kept signed in.',
      });
    }

    const now = new Date();
    const expiresAt = expiryFrom(now);
    const label = deviceLabel(req.headers.get('user-agent'), mac);

    // Upsert on the MAC, not on (user, MAC). A shared handset has ONE
    // enrolment and it belongs to whoever signed in last — which is also what
    // the router's own cookie does, so the two cannot disagree about who the
    // device is. Clearing revokedAt is deliberate: signing in again on a phone
    // you had revoked is how you un-revoke it.
    const device = await prisma.hotspotDevice.upsert({
      where: { mac },
      create: {
        mac,
        userId,
        remembered: remember,
        label,
        userAgent: req.headers.get('user-agent')?.slice(0, 400) ?? null,
        expiresAt,
        lastSeenAt: now,
      },
      update: {
        userId,
        remembered: remember,
        label,
        userAgent: req.headers.get('user-agent')?.slice(0, 400) ?? null,
        expiresAt,
        lastSeenAt: now,
        revokedAt: null,
        revokedById: null,
      },
    });

    return NextResponse.json({
      ok: true,
      remembered: device.remembered,
      until: device.remembered ? rememberedUntil(device.expiresAt) : null,
    });
  } catch (err) {
    console.error('[hotspot/remember] failed:', err);
    return NextResponse.json({ error: 'Could not record that choice' }, { status: 500 });
  }
}

export async function GET() {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const now = new Date();
    const rows = await prisma.hotspotDevice.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({
      devices: rows.map((d) => ({
        id: d.id,
        label: d.label ?? d.mac,
        mac: d.mac,
        remembered: isRemembered(d, now),
        lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
        until: rememberedUntil(d.expiresAt),
        expired: d.expiresAt.getTime() <= now.getTime(),
      })),
    });
  } catch (err) {
    console.error('[hotspot/remember] list failed:', err);
    return NextResponse.json({ error: 'Could not read your devices' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Which device?' }, { status: 400 });

    // Scoped to the caller in the WHERE clause rather than checked after
    // reading, so an id belonging to somebody else matches nothing instead of
    // being found and then refused.
    const { count } = await prisma.hotspotDevice.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: userId, remembered: false },
    });

    if (count === 0) {
      return NextResponse.json({ error: 'That device is not on your list' }, { status: 404 });
    }

    // THE ROUTER MAY STILL RECOGNISE IT for the rest of its cookie lifetime.
    // Said here rather than quietly, because "removed" that leaves a lost
    // handset online for another day is the kind of half-truth somebody makes
    // a decision on.
    return NextResponse.json({
      ok: true,
      message: 'Removed. The phone will be asked to sign in again the next time '
        + 'its network session ends — within a day, and immediately if it is out of range now.',
    });
  } catch (err) {
    console.error('[hotspot/remember] revoke failed:', err);
    return NextResponse.json({ error: 'Could not remove that device' }, { status: 500 });
  }
}
