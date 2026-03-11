import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// Allow larger body for media uploads (up to 6MB)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '6mb',
    },
  },
};

// POST — submit anonymous security report (NO authentication required)
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

    const report = await prisma.securityReport.create({
      data: {
        category: data.category,
        priority: data.priority || 'HIGH',
        location: data.location,
        dateObserved: data.dateObserved ? new Date(data.dateObserved) : new Date(),
        description: data.description,
        suspectDescription: data.suspectDescription || null,
        personsInvolved: data.personsInvolved || null,
        evidenceDescription: data.evidenceDescription || null,
        isOngoing: data.isOngoing || false,
        immediateRiskToLife: data.immediateRiskToLife || false,
        mediaUrl: data.mediaUrl || null,
        mediaType: data.mediaType || null,
        mediaLocation: data.mediaLocation || null,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Your anonymous security report has been submitted. It will be reviewed by management. Thank you for keeping our facility safe.',
      id: report.id,
    });
  } catch (error) {
    console.error('Error submitting security report:', error);
    return NextResponse.json(
      { error: 'Failed to submit report. Please try again.' },
      { status: 500 }
    );
  }
}

// GET — view reports (admin only)
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

    const reports = await prisma.securityReport.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(reports);
  } catch (error) {
    console.error('Error fetching security reports:', error);
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 });
  }
}

// PATCH — update report status (admin only)
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

    const report = await prisma.securityReport.update({
      where: { id: data.id },
      data: {
        status: data.status,
        adminNotes: data.adminNotes,
        actionTaken: data.actionTaken,
        resolvedAt: data.status === 'RESOLVED' ? new Date() : undefined,
      },
    });

    return NextResponse.json(report);
  } catch (error) {
    console.error('Error updating security report:', error);
    return NextResponse.json({ error: 'Failed to update report' }, { status: 500 });
  }
}
