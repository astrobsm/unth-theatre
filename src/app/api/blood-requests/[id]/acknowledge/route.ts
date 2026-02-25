import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const acknowledgeBloodRequestSchema = z.object({
  bloodBankNotes: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is blood bank staff or admin
    if (!['BLOODBANK_STAFF', 'ADMIN', 'THEATRE_MANAGER'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Only blood bank staff and administrators can acknowledge requests' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = acknowledgeBloodRequestSchema.parse(body);

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

    if (existingRequest.status !== 'REQUESTED') {
      return NextResponse.json(
        { error: 'Request has already been acknowledged' },
        { status: 400 }
      );
    }

    // Update request as acknowledged
    const updatedRequest = await prisma.bloodRequest.update({
      where: { id: params.id },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedById: session.user.id,
        acknowledgedAt: new Date(),
        bloodBankNotes: validatedData.bloodBankNotes,
      },
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
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'ACKNOWLEDGE',
        tableName: 'BloodRequest',
        recordId: updatedRequest.id,
        changes: JSON.stringify({
          acknowledgedBy: session.user.id,
          acknowledgedAt: new Date(),
          notes: validatedData.bloodBankNotes,
        }),
      },
    });

    return NextResponse.json(updatedRequest);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error acknowledging blood request:', error);
    return NextResponse.json(
      { error: 'Failed to acknowledge blood request' },
      { status: 500 }
    );
  }
}
