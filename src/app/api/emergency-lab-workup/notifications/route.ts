import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET - Fetch pending notifications for the current user (for voice/push alerts)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const unacknowledgedOnly = searchParams.get('unacknowledged') === 'true';
    const voiceOnly = searchParams.get('voice') === 'true';

    const where: any = {
      OR: [
        { recipientId: session.user.id },
        { recipientRole: session.user.role },
      ],
    };

    if (unacknowledgedOnly) {
      where.acknowledged = false;
    }

    if (voiceOnly) {
      where.isVoiceNotification = true;
      where.voicePlayed = false;
    }

    const notifications = await prisma.emergencyLabNotification.findMany({
      where,
      include: {
        emergencyLabRequest: {
          select: {
            id: true,
            patientName: true,
            folderNumber: true,
            priority: true,
            status: true,
          },
        },
      },
      orderBy: { sentAt: 'desc' },
      take: 20,
    });

    return NextResponse.json(notifications);
  } catch (error) {
    console.error('Error fetching lab notifications:', error);
    return NextResponse.json([]);
  }
}

// PATCH - Acknowledge notification or mark voice as played
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { notificationId, action } = body;

    if (!notificationId) {
      return NextResponse.json({ error: 'notificationId is required' }, { status: 400 });
    }

    if (action === 'ACKNOWLEDGE') {
      await prisma.emergencyLabNotification.update({
        where: { id: notificationId },
        data: {
          acknowledged: true,
          acknowledgedAt: new Date(),
          acknowledgedById: session.user.id,
        },
      });
    } else if (action === 'VOICE_PLAYED') {
      await prisma.emergencyLabNotification.update({
        where: { id: notificationId },
        data: {
          voicePlayed: true,
          voicePlayedAt: new Date(),
        },
      });
    }

    return NextResponse.json({ message: 'Notification updated' });
  } catch (error) {
    console.error('Error updating notification:', error);
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
  }
}
