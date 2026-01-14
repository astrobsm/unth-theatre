import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

// GET single emergency alert by ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;

    const alert = await prisma.emergencySurgeryAlert.findUnique({
      where: { id },
      include: {
        surgery: {
          include: {
            patient: true,
          },
        },
        surgeon: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        anesthetist: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!alert) {
      return NextResponse.json({ error: 'Emergency alert not found' }, { status: 404 });
    }

    return NextResponse.json(alert);
  } catch (error) {
    console.error('Error fetching emergency alert:', error);
    return NextResponse.json({ error: 'Failed to fetch emergency alert' }, { status: 500 });
  }
}

// PUT update emergency alert
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json();

    const existingAlert = await prisma.emergencySurgeryAlert.findUnique({
      where: { id },
    });

    if (!existingAlert) {
      return NextResponse.json({ error: 'Emergency alert not found' }, { status: 404 });
    }

    const {
      status,
      priority,
      estimatedStartTime,
      theatreId,
      theatreName,
      anesthetistId,
      bloodRequired,
      bloodUnits,
      specialEquipment,
      alertMessage,
      additionalNotes,
      resolutionNotes,
    } = body;

    const updateData: any = {};

    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;
    if (estimatedStartTime) updateData.estimatedStartTime = new Date(estimatedStartTime);
    if (theatreId) updateData.theatreId = theatreId;
    if (theatreName) updateData.theatreName = theatreName;
    if (anesthetistId) updateData.anesthetistId = anesthetistId;
    if (bloodRequired !== undefined) updateData.bloodRequired = bloodRequired;
    if (bloodUnits !== undefined) updateData.bloodUnits = bloodUnits;
    if (specialEquipment) updateData.specialEquipment = specialEquipment;
    if (alertMessage) updateData.alertMessage = alertMessage;
    if (additionalNotes) updateData.additionalNotes = additionalNotes;
    if (resolutionNotes) updateData.resolutionNotes = resolutionNotes;

    // Handle status-specific updates
    if (status === 'RESOLVED' || status === 'CANCELLED') {
      updateData.resolvedAt = new Date();
    }

    const updatedAlert = await prisma.emergencySurgeryAlert.update({
      where: { id },
      data: updateData,
      include: {
        surgery: true,
        surgeon: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });

    // Log the update
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        tableName: 'emergency_surgery_alerts',
        recordId: id,
        changes: JSON.stringify(updateData),
      },
    });

    return NextResponse.json(updatedAlert);
  } catch (error) {
    console.error('Error updating emergency alert:', error);
    return NextResponse.json({ error: 'Failed to update emergency alert' }, { status: 500 });
  }
}

// DELETE emergency alert (only for ADMIN)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!['ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = params;

    const existingAlert = await prisma.emergencySurgeryAlert.findUnique({
      where: { id },
    });

    if (!existingAlert) {
      return NextResponse.json({ error: 'Emergency alert not found' }, { status: 404 });
    }

    await prisma.emergencySurgeryAlert.delete({ where: { id } });

    // Log the deletion
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        tableName: 'emergency_surgery_alerts',
        recordId: id,
        changes: JSON.stringify({ deletedAlert: existingAlert.procedureName }),
      },
    });

    return NextResponse.json({ message: 'Emergency alert deleted successfully' });
  } catch (error) {
    console.error('Error deleting emergency alert:', error);
    return NextResponse.json({ error: 'Failed to delete emergency alert' }, { status: 500 });
  }
}
