import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET - List announcements (all for admin, active/scheduled for playback)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode'); // 'playback' = only due announcements, default = all

    if (mode === 'playback') {
      // Return announcements that are due to play now
      const now = new Date();
      const announcements = await prisma.announcement.findMany({
        where: {
          status: { in: ['SCHEDULED', 'ACTIVE'] },
          scheduledDate: { lte: now },
          OR: [
            { endDate: null },
            { endDate: { gte: now } },
          ],
        },
        orderBy: { scheduledDate: 'asc' },
      });
      return NextResponse.json(announcements);
    }

    // Admin list — return all
    const announcements = await prisma.announcement.findMany({
      include: {
        createdBy: { select: { id: true, fullName: true } },
        _count: { select: { playbackLogs: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(announcements);
  } catch (error) {
    console.error('Error fetching announcements:', error);
    return NextResponse.json({ error: 'Failed to fetch announcements' }, { status: 500 });
  }
}

// POST - Create new announcement (admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminRoles = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC'];
    if (!adminRoles.includes(session.user.role)) {
      return NextResponse.json({ error: 'Only administrators can create announcements' }, { status: 403 });
    }

    const body = await request.json();
    const {
      title,
      description,
      audioFileName,
      audioData,
      audioMimeType,
      audioDurationSec,
      scheduledDate,
      endDate,
      frequency,
      repeatDays,
      customIntervalMin,
    } = body;

    if (!title || !audioFileName || !audioData || !scheduledDate) {
      return NextResponse.json(
        { error: 'Title, audio file, and scheduled date are required' },
        { status: 400 }
      );
    }

    // Validate audio data size (max ~10MB base64)
    if (audioData.length > 14_000_000) {
      return NextResponse.json(
        { error: 'Audio file too large. Maximum 10MB allowed.' },
        { status: 400 }
      );
    }

    const announcement = await prisma.announcement.create({
      data: {
        title,
        description: description || null,
        audioFileName,
        audioData,
        audioMimeType: audioMimeType || 'audio/mpeg',
        audioDurationSec: audioDurationSec ? parseInt(audioDurationSec) : null,
        scheduledDate: new Date(scheduledDate),
        endDate: endDate ? new Date(endDate) : null,
        frequency: frequency || 'ONE_TIME',
        repeatDays: repeatDays ? JSON.stringify(repeatDays) : null,
        customIntervalMin: customIntervalMin ? parseInt(customIntervalMin) : null,
        status: 'SCHEDULED',
        createdById: session.user.id,
        createdByName: session.user.name || '',
      },
    });

    return NextResponse.json(announcement, { status: 201 });
  } catch (error) {
    console.error('Error creating announcement:', error);
    return NextResponse.json({ error: 'Failed to create announcement' }, { status: 500 });
  }
}

// PATCH - Update announcement (status, reschedule, etc.)
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminRoles = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC'];
    if (!adminRoles.includes(session.user.role)) {
      return NextResponse.json({ error: 'Only administrators can update announcements' }, { status: 403 });
    }

    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: 'Announcement ID is required' }, { status: 400 });
    }

    // Handle date conversions
    if (updateData.scheduledDate) {
      updateData.scheduledDate = new Date(updateData.scheduledDate);
    }
    if (updateData.endDate) {
      updateData.endDate = new Date(updateData.endDate);
    }
    if (updateData.repeatDays && Array.isArray(updateData.repeatDays)) {
      updateData.repeatDays = JSON.stringify(updateData.repeatDays);
    }

    updateData.updatedById = session.user.id;
    updateData.updatedByName = session.user.name || '';

    const announcement = await prisma.announcement.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(announcement);
  } catch (error) {
    console.error('Error updating announcement:', error);
    return NextResponse.json({ error: 'Failed to update announcement' }, { status: 500 });
  }
}

// DELETE - Remove announcement
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminRoles = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC'];
    if (!adminRoles.includes(session.user.role)) {
      return NextResponse.json({ error: 'Only administrators can delete announcements' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Announcement ID is required' }, { status: 400 });
    }

    await prisma.announcement.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting announcement:', error);
    return NextResponse.json({ error: 'Failed to delete announcement' }, { status: 500 });
  }
}
