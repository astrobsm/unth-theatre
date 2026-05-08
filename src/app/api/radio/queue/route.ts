import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/radio/queue
// Returns the active announcements the radio client should play.
// 1. Promotes scheduled broadcasts whose time has arrived (or whose interval
//    has elapsed) into RadioAnnouncement rows.
// 2. Returns PENDING / PLAYING announcements ordered by priority desc.
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const dow = now.getDay(); // 0..6
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const broadcasts = await prisma.radioBroadcast.findMany({
    where: { active: true },
  });

  for (const b of broadcasts) {
    // date window
    if (b.startDate && now < b.startDate) continue;
    if (b.endDate && now > b.endDate) continue;
    if (!b.daysOfWeek.split(',').map((s) => s.trim()).includes(String(dow))) continue;

    let shouldFire = false;

    if (b.timeOfDay && b.timeOfDay === hhmm) {
      // fire at exact minute, but not twice in the same minute
      if (
        !b.lastTriggered ||
        now.getTime() - b.lastTriggered.getTime() > 60 * 1000
      ) {
        shouldFire = true;
      }
    } else if (b.intervalMins && b.intervalMins > 0) {
      if (
        !b.lastTriggered ||
        now.getTime() - b.lastTriggered.getTime() >= b.intervalMins * 60 * 1000
      ) {
        shouldFire = true;
      }
    }

    if (!shouldFire) continue;

    await prisma.radioAnnouncement.create({
      data: {
        broadcastId: b.id,
        category: b.category,
        title: b.title,
        message: b.message ?? b.title,
        audioUrl: b.audioUrl,
        priority: b.priority,
        triggerSource: 'SCHEDULED',
        status: 'PENDING',
      },
    });
    await prisma.radioBroadcast.update({
      where: { id: b.id },
      data: { lastTriggered: now },
    });
  }

  // Expire ack-required announcements older than 30 min that nobody acked
  await prisma.radioAnnouncement.updateMany({
    where: {
      requireAck: true,
      status: { in: ['PENDING', 'PLAYING'] },
      createdAt: { lt: new Date(now.getTime() - 30 * 60 * 1000) },
    },
    data: { status: 'EXPIRED' },
  });

  const queue = await prisma.radioAnnouncement.findMany({
    where: { status: { in: ['PENDING', 'PLAYING'] } },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    take: 20,
  });

  return NextResponse.json({ queue, serverTime: now.toISOString() });
}
