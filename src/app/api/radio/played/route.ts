import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST /api/radio/played
// Body: { id: string }
// Marks a queued announcement as PLAYED so the radio service stops looping
// on it. Announcements that explicitly require acknowledgment (requireAck)
// are NOT auto-completed here — they must be acknowledged via the
// /api/radio/acknowledge endpoint.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const ann = await prisma.radioAnnouncement.findUnique({ where: { id: body.id } });
  if (!ann) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Honour requireAck announcements — they keep repeating until ack.
  if (ann.requireAck) {
    return NextResponse.json({ ok: true, kept: true });
  }

  await prisma.radioAnnouncement.update({
    where: { id: body.id },
    data: { status: 'PLAYED', lastPlayedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
