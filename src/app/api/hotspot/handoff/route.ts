import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { newHandoffToken } from '@/lib/hotspot/handoff';

export const dynamic = 'force-dynamic';

/**
 * POST /api/hotspot/handoff — mint a one-time link that carries this session
 * into the phone's real browser.
 *
 * Called from the Wi-Fi portal page in the instant between signing in and
 * handing the credentials to the router, because that is the only moment the
 * session exists in the captive-portal browser. See lib/hotspot/handoff.ts.
 *
 * It mints for WHOEVER IS SIGNED IN and takes no user parameter. A route that
 * accepted "issue a handoff for this user id" would be a way to obtain somebody
 * else's session by asking for it politely.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const mac = (await req.json().catch(() => ({})))?.mac;

  const { token, tokenHash, expiresAt } = newHandoffToken();

  await prisma.hotspotHandoff.create({
    data: {
      tokenHash,
      userId,
      deviceMac: typeof mac === 'string' && mac.length <= 64 ? mac : null,
      expiresAt,
    },
  });

  // Opportunistic sweep of anything long dead. Cheap, indexed, and it keeps a
  // table nobody looks at from growing without bound. Failure is ignored: a
  // handoff must not be refused because tidying up did not work.
  prisma.hotspotHandoff
    .deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } } })
    .catch(() => {});

  return NextResponse.json(
    { token, expiresAt: expiresAt.toISOString() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
