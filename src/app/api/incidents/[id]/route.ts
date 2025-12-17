import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const incident = await prisma.incidentReport.findUnique({
      where: { id: params.id },
      include: {
        reportedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        investigatedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        verifiedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    if (!incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }

    return NextResponse.json(incident);
  } catch (error) {
    console.error('Error fetching incident:', error);
    return NextResponse.json({ error: 'Failed to fetch incident' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();

    const updateData: any = {};
    
    if (data.status) updateData.status = data.status;
    if (data.investigationNotes) updateData.investigationNotes = data.investigationNotes;
    if (data.verificationNotes) updateData.verificationNotes = data.verificationNotes;
    if (data.preventionMeasures) updateData.preventionMeasures = data.preventionMeasures;
    if (data.actionTaken) updateData.actionTaken = data.actionTaken;
    if (data.responsiblePerson) updateData.responsiblePerson = data.responsiblePerson;
    if (data.followUpRequired !== undefined) updateData.followUpRequired = data.followUpRequired;
    if (data.followUpDate) updateData.followUpDate = new Date(data.followUpDate);
    if (data.followUpNotes) updateData.followUpNotes = data.followUpNotes;
    
    // Investigation
    if (data.investigatedById) {
      updateData.investigatedById = data.investigatedById;
      updateData.investigationDate = new Date();
    }
    
    // Verification
    if (data.verifiedById) {
      updateData.verifiedById = data.verifiedById;
      updateData.verifiedAt = new Date();
    }

    const incident = await prisma.incidentReport.update({
      where: { id: params.id },
      data: updateData,
      include: {
        reportedBy: {
          select: {
            fullName: true,
            role: true,
          },
        },
        investigatedBy: {
          select: {
            fullName: true,
            role: true,
          },
        },
        verifiedBy: {
          select: {
            fullName: true,
            role: true,
          },
        },
      },
    });

    return NextResponse.json(incident);
  } catch (error) {
    console.error('Error updating incident:', error);
    return NextResponse.json({ error: 'Failed to update incident' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can delete
    if (session.user.role !== 'ADMIN' && session.user.role !== 'THEATRE_MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.incidentReport.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ message: 'Incident deleted successfully' });
  } catch (error) {
    console.error('Error deleting incident:', error);
    return NextResponse.json({ error: 'Failed to delete incident' }, { status: 500 });
  }
}
