// ============================================================
// Enrolling and un-enrolling a phone for fingerprint sign-in
// ------------------------------------------------------------
//   POST   — mint a credential for the CURRENT user's device. The secret is
//            returned exactly once and never again.
//   GET    — list this user's enrolled devices, so they can see and revoke.
//   DELETE — revoke one, or all of them.
//
// AUTHORITY COMES FROM THE SESSION, NEVER FROM THE BODY. A request cannot
// name the user it is enrolling for: that would turn this endpoint into a way
// to mint a permanent credential for somebody else's account, which is
// strictly worse than knowing their password because it survives a password
// change. The userId is read from the session and nowhere else.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { newDeviceCredential } from '@/lib/auth/deviceCredential';

export const dynamic = 'force-dynamic';

/** One person, one phone each. Beyond this, the oldest is retired on enrolment. */
const MAX_DEVICES_PER_USER = 5;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    let deviceLabel: string | null = null;
    let platform = 'android';
    try {
      const body = await request.json();
      // A label only — it is shown back to the user in the revoke list and is
      // never trusted for anything. Truncated because it comes from the
      // handset and ends up in an audit trail.
      if (typeof body?.deviceLabel === 'string') deviceLabel = body.deviceLabel.slice(0, 80);
      if (typeof body?.platform === 'string' && /^(android|ios|web)$/.test(body.platform)) {
        platform = body.platform;
      }
    } catch {
      // No body is fine; the defaults stand.
    }

    const minted = newDeviceCredential();

    await prisma.deviceCredential.create({
      data: {
        selector: minted.selector,
        verifierHash: minted.verifierHash,
        expiresAt: minted.expiresAt,
        userId,
        deviceLabel,
        platform,
      },
    });

    // Retire the oldest beyond the cap. Revoked rather than deleted, so the
    // trail of which phone was enrolled when survives.
    const live = await prisma.deviceCredential.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (live.length > MAX_DEVICES_PER_USER) {
      await prisma.deviceCredential.updateMany({
        where: { id: { in: live.slice(MAX_DEVICES_PER_USER).map((d) => d.id) } },
        data: { revokedAt: new Date() },
      });
    }

    // The only time the secret exists outside the phone. Not logged.
    return NextResponse.json({
      credential: minted.credential,
      expiresAt: minted.expiresAt.toISOString(),
    });
  } catch (err) {
    console.error('[device-credentials] enrol failed:', err);
    return NextResponse.json({ error: 'Could not enrol this device' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const devices = await prisma.deviceCredential.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      // Never the selector or the hash: this response reaches the browser,
      // and neither is any use to the person reading it.
      select: { id: true, deviceLabel: true, platform: true, createdAt: true, lastUsedAt: true, expiresAt: true },
    });

    return NextResponse.json({ devices });
  } catch (err) {
    console.error('[device-credentials] list failed:', err);
    return NextResponse.json({ error: 'Could not list devices' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const id = request.nextUrl.searchParams.get('id');

    // SCOPED TO THE SESSION'S userId in both branches. Without that, an id
    // from anywhere would revoke anyone's device — a denial of service against
    // a colleague, and a quiet one.
    const where = id ? { id, userId, revokedAt: null } : { userId, revokedAt: null };

    const result = await prisma.deviceCredential.updateMany({
      where,
      data: { revokedAt: new Date() },
    });

    return NextResponse.json({ revoked: result.count });
  } catch (err) {
    console.error('[device-credentials] revoke failed:', err);
    return NextResponse.json({ error: 'Could not revoke' }, { status: 500 });
  }
}
