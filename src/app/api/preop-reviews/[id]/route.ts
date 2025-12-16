import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

// Schema for updating pre-op review
const updatePreOpReviewSchema = z.object({
  currentMedications: z.string().optional(),
  allergies: z.string().optional(),
  comorbidities: z.string().optional(),
  previousAnesthesia: z.string().optional(),
  lastOralIntake: z.string().optional(),
  fastingStatus: z.string().optional(),
  weight: z.number().optional(),
  height: z.number().optional(),
  bmi: z.number().optional(),
  bloodPressure: z.string().optional(),
  heartRate: z.number().optional(),
  respiratoryRate: z.number().optional(),
  temperature: z.number().optional(),
  airwayClass: z.string().optional(),
  neckMovement: z.string().optional(),
  dentition: z.string().optional(),
  hemoglobin: z.number().optional(),
  plateletCount: z.number().optional(),
  ptInr: z.number().optional(),
  creatinine: z.number().optional(),
  sodium: z.number().optional(),
  potassium: z.number().optional(),
  bloodGlucose: z.number().optional(),
  otherLabResults: z.string().optional(),
  asaClass: z.string().optional(),
  proposedAnesthesiaType: z.enum(['GENERAL', 'SPINAL', 'LOCAL', 'REGIONAL', 'SEDATION']).optional(),
  anestheticPlan: z.string().optional(),
  specialConsiderations: z.string().optional(),
  riskLevel: z.string().optional(),
  riskFactors: z.string().optional(),
  reviewNotes: z.string().optional(),
  recommendations: z.string().optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'APPROVED']).optional(),
  consultantAnesthetistId: z.string().optional(),
});

// GET - Fetch single pre-op review
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const review = await prisma.preOperativeAnestheticReview.findUnique({
      where: { id: params.id },
      include: {
        surgery: {
          include: {
            patient: true,
          },
        },
        anesthetist: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        consultantAnesthetist: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        prescriptions: {
          include: {
            prescribedBy: {
              select: {
                id: true,
                fullName: true,
              },
            },
            approvedBy: {
              select: {
                id: true,
                fullName: true,
              },
            },
            packedBy: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
      },
    });

    if (!review) {
      return NextResponse.json(
        { error: 'Pre-op review not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(review);
  } catch (error) {
    console.error('Error fetching pre-op review:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pre-op review' },
      { status: 500 }
    );
  }
}

// PATCH - Update pre-op review
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = updatePreOpReviewSchema.parse(body);

    // Check if review exists
    const existingReview = await prisma.preOperativeAnestheticReview.findUnique({
      where: { id: params.id },
    });

    if (!existingReview) {
      return NextResponse.json(
        { error: 'Pre-op review not found' },
        { status: 404 }
      );
    }

    // Update review
    const updatedReview = await prisma.preOperativeAnestheticReview.update({
      where: { id: params.id },
      data: {
        ...validatedData,
        lastOralIntake: validatedData.lastOralIntake
          ? new Date(validatedData.lastOralIntake)
          : undefined,
        consultantName: validatedData.consultantAnesthetistId
          ? (await prisma.user.findUnique({
              where: { id: validatedData.consultantAnesthetistId },
            }))?.fullName
          : undefined,
      },
      include: {
        surgery: true,
        patient: true,
        anesthetist: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        consultantAnesthetist: {
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
        tableName: 'PreOperativeAnestheticReview',
        recordId: updatedReview.id,
        changes: JSON.stringify({
          before: existingReview,
          after: updatedReview,
        }),
      },
    });

    return NextResponse.json(updatedReview);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error updating pre-op review:', error);
    return NextResponse.json(
      { error: 'Failed to update pre-op review' },
      { status: 500 }
    );
  }
}

// DELETE - Delete pre-op review
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has permission
    if (!['ADMIN', 'THEATRE_MANAGER'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const review = await prisma.preOperativeAnestheticReview.delete({
      where: { id: params.id },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        tableName: 'PreOperativeAnestheticReview',
        recordId: params.id,
        changes: JSON.stringify(review),
      },
    });

    return NextResponse.json({ message: 'Pre-op review deleted successfully' });
  } catch (error) {
    console.error('Error deleting pre-op review:', error);
    return NextResponse.json(
      { error: 'Failed to delete pre-op review' },
      { status: 500 }
    );
  }
}
