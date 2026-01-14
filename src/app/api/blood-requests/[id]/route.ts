import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

// GET single blood request by ID
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

    const bloodRequest = await prisma.bloodRequest.findUnique({
      where: { id },
      include: {
        surgery: {
          include: {
            patient: true,
            surgeon: {
              select: {
                id: true,
                fullName: true,
              },
            },
            anesthetist: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
        patient: true,
        requestedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        acknowledgedBy: {
          select: {
            id: true,
            fullName: true,
          },
        },
        preparedBy: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });

    if (!bloodRequest) {
      return NextResponse.json({ error: 'Blood request not found' }, { status: 404 });
    }

    return NextResponse.json(bloodRequest);
  } catch (error) {
    console.error('Error fetching blood request:', error);
    return NextResponse.json({ error: 'Failed to fetch blood request' }, { status: 500 });
  }
}

// PUT update blood request
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

    const existingRequest = await prisma.bloodRequest.findUnique({
      where: { id },
    });

    if (!existingRequest) {
      return NextResponse.json({ error: 'Blood request not found' }, { status: 404 });
    }

    const {
      bloodType,
      rhFactor,
      unitsRequested,
      bloodProducts,
      urgency,
      priorityLevel,
      clinicalIndication,
      specialRequirements,
      crossMatchRequired,
      crossMatchCompleted,
      status,
      bloodBankNotes,
    } = body;

    const updateData: any = {};

    if (bloodType) updateData.bloodType = bloodType;
    if (rhFactor) updateData.rhFactor = rhFactor;
    if (unitsRequested !== undefined) updateData.unitsRequested = unitsRequested;
    if (bloodProducts) updateData.bloodProducts = bloodProducts;
    if (urgency) updateData.urgency = urgency;
    if (priorityLevel !== undefined) updateData.priorityLevel = priorityLevel;
    if (clinicalIndication) updateData.clinicalIndication = clinicalIndication;
    if (specialRequirements !== undefined) updateData.specialRequirements = specialRequirements;
    if (crossMatchRequired !== undefined) updateData.crossMatchRequired = crossMatchRequired;
    if (crossMatchCompleted !== undefined) {
      updateData.crossMatchCompleted = crossMatchCompleted;
      if (crossMatchCompleted) {
        updateData.crossMatchCompletedAt = new Date();
      }
    }
    if (bloodBankNotes !== undefined) updateData.bloodBankNotes = bloodBankNotes;

    // Handle status changes
    if (status) {
      updateData.status = status;
      if (status === 'READY') {
        updateData.readyAt = new Date();
      } else if (status === 'DELIVERED') {
        updateData.deliveredAt = new Date();
      } else if (status === 'CANCELLED') {
        updateData.cancelledAt = new Date();
      }
    }

    const updatedRequest = await prisma.bloodRequest.update({
      where: { id },
      data: updateData,
      include: {
        surgery: true,
        patient: true,
        requestedBy: {
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
        tableName: 'blood_requests',
        recordId: id,
        changes: JSON.stringify(updateData),
      },
    });

    return NextResponse.json(updatedRequest);
  } catch (error) {
    console.error('Error updating blood request:', error);
    return NextResponse.json({ error: 'Failed to update blood request' }, { status: 500 });
  }
}

// DELETE blood request
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowedRoles = ['ADMIN', 'THEATRE_MANAGER', 'BLOODBANK_STAFF'];
    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = params;

    const existingRequest = await prisma.bloodRequest.findUnique({
      where: { id },
    });

    if (!existingRequest) {
      return NextResponse.json({ error: 'Blood request not found' }, { status: 404 });
    }

    // Don't allow deletion of delivered requests
    if (existingRequest.status === 'DELIVERED') {
      return NextResponse.json(
        { error: 'Cannot delete delivered blood requests' },
        { status: 400 }
      );
    }

    await prisma.bloodRequest.delete({ where: { id } });

    // Log the deletion
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        tableName: 'blood_requests',
        recordId: id,
        changes: JSON.stringify({ deletedRequest: existingRequest.patientName }),
      },
    });

    return NextResponse.json({ message: 'Blood request deleted successfully' });
  } catch (error) {
    console.error('Error deleting blood request:', error);
    return NextResponse.json({ error: 'Failed to delete blood request' }, { status: 500 });
  }
}
