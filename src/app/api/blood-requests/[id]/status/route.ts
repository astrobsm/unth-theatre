import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const updateBloodStatusSchema = z.object({
  status: z.enum(['IN_PREPARATION', 'READY', 'DELIVERED', 'CANCELLED']),
  crossMatchCompleted: z.boolean().optional(),
  bloodBankNotes: z.string().optional(),
  cancellationReason: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is blood bank staff
    if (!['BLOODBANK_STAFF'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Only blood bank staff can update blood requests' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = updateBloodStatusSchema.parse(body);

    // Check if request exists
    const existingRequest = await prisma.bloodRequest.findUnique({
      where: { id: params.id },
    });

    if (!existingRequest) {
      return NextResponse.json(
        { error: 'Blood request not found' },
        { status: 404 }
      );
    }

    const updateData: any = {
      status: validatedData.status,
      bloodBankNotes: validatedData.bloodBankNotes,
    };

    if (validatedData.status === 'IN_PREPARATION') {
      updateData.preparedById = session.user.id;
      updateData.preparedByName = session.user.name;
      updateData.preparedAt = new Date();
    }

    if (validatedData.status === 'READY') {
      updateData.readyAt = new Date();
    }

    if (validatedData.status === 'DELIVERED') {
      updateData.deliveredAt = new Date();
    }

    if (validatedData.status === 'CANCELLED') {
      updateData.cancelledAt = new Date();
      updateData.cancellationReason = validatedData.cancellationReason;
    }

    if (validatedData.crossMatchCompleted !== undefined) {
      updateData.crossMatchCompleted = validatedData.crossMatchCompleted;
      updateData.crossMatchCompletedAt = validatedData.crossMatchCompleted ? new Date() : null;
    }

    // Update request
    const updatedRequest = await prisma.bloodRequest.update({
      where: { id: params.id },
      data: updateData,
      include: {
        surgery: true,
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
            role: true,
          },
        },
        preparedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        tableName: 'BloodRequest',
        recordId: updatedRequest.id,
        changes: JSON.stringify({
          status: validatedData.status,
          updatedBy: session.user.name,
          notes: validatedData.bloodBankNotes,
        }),
      },
    });

    // Notify requester based on status
    let notificationMessage = '';
    let notificationTitle = '';

    switch (validatedData.status) {
      case 'IN_PREPARATION':
        notificationTitle = 'Blood Preparation Started';
        notificationMessage = `Blood preparation has started for ${existingRequest.patientName}.`;
        break;
      case 'READY':
        notificationTitle = 'Blood Ready';
        notificationMessage = `Blood is ready for ${existingRequest.patientName} - ${existingRequest.unitsRequested} units of ${existingRequest.bloodType}${existingRequest.rhFactor}.`;
        break;
      case 'DELIVERED':
        notificationTitle = 'Blood Delivered';
        notificationMessage = `Blood has been delivered for ${existingRequest.patientName}.`;
        break;
      case 'CANCELLED':
        notificationTitle = 'Blood Request Cancelled';
        notificationMessage = `Blood request for ${existingRequest.patientName} has been cancelled. Reason: ${validatedData.cancellationReason}`;
        break;
    }

    return NextResponse.json(updatedRequest);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error updating blood request:', error);
    return NextResponse.json(
      { error: 'Failed to update blood request' },
      { status: 500 }
    );
  }
}
