import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// App Router route segment config
export const dynamic = 'force-dynamic';

// POST — submit anonymous tip (NO authentication required)
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    if (!data.category || !data.location || !data.description) {
      return NextResponse.json(
        { error: 'Category, location, and description are required' },
        { status: 400 }
      );
    }

    // Validate media size (reject payloads over ~7MB to prevent abuse)
    const bodySize = JSON.stringify(data).length;
    if (bodySize > 7 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Payload too large. Please use a smaller image or video.' },
        { status: 413 }
      );
    }

    const tip = await prisma.anonymousTip.create({
      data: {
        category: data.category,
        priority: data.priority || 'MEDIUM',
        location: data.location,
        dateObserved: data.dateObserved ? new Date(data.dateObserved) : new Date(),
        description: data.description,
        frequencyOfOccurrence: data.frequencyOfOccurrence || null,
        suggestedAction: data.suggestedAction || null,
        mediaUrl: data.mediaUrl || null,
        mediaType: data.mediaType || null,
        mediaLocation: data.mediaLocation || null,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Your anonymous report has been submitted successfully. Thank you for helping improve our facility.',
      id: tip.id,
    });
  } catch (error) {
    console.error('Error submitting anonymous tip:', error);
    return NextResponse.json(
      { error: 'Failed to submit report. Please try again.' },
      { status: 500 }
    );
  }
}

// GET — view tips (admin only)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = (session.user as { role?: string }).role;
    const adminRoles = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'CHIEF_MEDICAL_DIRECTOR'];
    if (!role || !adminRoles.includes(role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const tips = await prisma.anonymousTip.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(tips);
  } catch (error) {
    console.error('Error fetching anonymous tips:', error);
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 });
  }
}

// PATCH — update tip status (admin only)
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = (session.user as { role?: string }).role;
    const adminRoles = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'CHIEF_MEDICAL_DIRECTOR'];
    if (!role || !adminRoles.includes(role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const data = await request.json();
    if (!data.id) {
      return NextResponse.json({ error: 'Report ID is required' }, { status: 400 });
    }

    const tip = await prisma.anonymousTip.update({
      where: { id: data.id },
      data: {
        status: data.status,
        adminNotes: data.adminNotes,
        actionTaken: data.actionTaken,
        resolvedAt: data.status === 'RESOLVED' ? new Date() : undefined,
      },
    });

    return NextResponse.json(tip);
  } catch (error) {
    console.error('Error updating anonymous tip:', error);
    return NextResponse.json({ error: 'Failed to update report' }, { status: 500 });
  }
}
