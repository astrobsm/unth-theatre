import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST - Log a playback event and update announcement
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { announcementId, playedBySystem, triggeredByName } = await request.json();

    if (!announcementId) {
      return NextResponse.json({ error: 'Announcement ID is required' }, { status: 400 });
    }

    // Create playback log
    await prisma.announcementPlayback.create({
      data: {
        announcementId,
        playedBySystem: playedBySystem ?? true,
        triggeredByName: triggeredByName || session.user.name || null,
      },
    });

    // Update announcement play count and last played
    const announcement = await prisma.announcement.update({
      where: { id: announcementId },
      data: {
        playCount: { increment: 1 },
        lastPlayedAt: new Date(),
        status: 'PLAYED',
      },
    });

    // If ONE_TIME, mark as PLAYED/EXPIRED
    if (announcement.frequency === 'ONE_TIME') {
      await prisma.announcement.update({
        where: { id: announcementId },
        data: { status: 'EXPIRED' },
      });
    } else {
      // For repeating, set back to ACTIVE
      await prisma.announcement.update({
        where: { id: announcementId },
        data: { status: 'ACTIVE' },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error logging playback:', error);
    return NextResponse.json({ error: 'Failed to log playback' }, { status: 500 });
  }
}
