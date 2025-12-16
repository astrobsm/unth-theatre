import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const packPrescriptionSchema = z.object({
  packingNotes: z.string().optional(),
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

    // Check if user is a pharmacist
    if (!['PHARMACIST'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Only pharmacists can pack prescriptions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = packPrescriptionSchema.parse(body);

    // Check if prescription exists and is approved
    const existingPrescription = await prisma.anestheticPrescription.findUnique({
      where: { id: params.id },
    });

    if (!existingPrescription) {
      return NextResponse.json(
        { error: 'Prescription not found' },
        { status: 404 }
      );
    }

    if (existingPrescription.status !== 'APPROVED') {
      return NextResponse.json(
        { error: 'Only approved prescriptions can be packed' },
        { status: 400 }
      );
    }

    // Update prescription as packed
    const updatedPrescription = await prisma.anestheticPrescription.update({
      where: { id: params.id },
      data: {
        status: 'PACKED',
        packedById: session.user.id,
        packedByName: session.user.name,
        packedAt: new Date(),
        packingNotes: validatedData.packingNotes,
      },
      include: {
        surgery: true,
        patient: true,
        prescribedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        packedBy: {
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
        action: 'PACK_PRESCRIPTION',
        tableName: 'AnestheticPrescription',
        recordId: updatedPrescription.id,
        changes: JSON.stringify({
          packedBy: session.user.name,
          packedAt: new Date(),
          notes: validatedData.packingNotes,
        }),
      },
    });

    return NextResponse.json(updatedPrescription);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error packing prescription:', error);
    return NextResponse.json(
      { error: 'Failed to pack prescription' },
      { status: 500 }
    );
  }
}
