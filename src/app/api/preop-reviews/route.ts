import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

// Schema for creating pre-op review
const createPreOpReviewSchema = z.object({
  surgeryId: z.string(),
  patientId: z.string(),
  patientName: z.string(),
  folderNumber: z.string(),
  scheduledSurgeryDate: z.string(),
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
});

// GET - Fetch all pre-op reviews or filtered by surgery
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const surgeryId = searchParams.get('surgeryId');
    const status = searchParams.get('status');
    const date = searchParams.get('date');

    const where: any = {};

    if (surgeryId) {
      where.surgeryId = surgeryId;
    }

    if (status) {
      where.status = status;
    }

    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      
      where.scheduledSurgeryDate = {
        gte: startDate,
        lte: endDate,
      };
    }

    const reviews = await prisma.preOperativeAnestheticReview.findMany({
      where,
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
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(reviews);
  } catch (error) {
    console.error('Error fetching pre-op reviews:', error);
    // Return empty array instead of error if table doesn't exist yet
    return NextResponse.json([]);
  }
}

// POST - Create new pre-op review
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is an anesthetist
    if (!['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Only anesthetists can create pre-op reviews' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = createPreOpReviewSchema.parse(body);

    // Check if review already exists for this surgery
    const existingReview = await prisma.preOperativeAnestheticReview.findUnique({
      where: { surgeryId: validatedData.surgeryId },
    });

    if (existingReview) {
      return NextResponse.json(
        { error: 'Pre-operative review already exists for this surgery' },
        { status: 400 }
      );
    }

    // Create pre-op review
    const review = await prisma.preOperativeAnestheticReview.create({
      data: {
        ...validatedData,
        scheduledSurgeryDate: new Date(validatedData.scheduledSurgeryDate),
        lastOralIntake: validatedData.lastOralIntake ? new Date(validatedData.lastOralIntake) : null,
        anesthetistId: session.user.id,
        anesthetistName: session.user.name || '',
        status: 'IN_PROGRESS',
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
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        tableName: 'PreOperativeAnestheticReview',
        recordId: review.id,
        changes: JSON.stringify(review),
      },
    });

    return NextResponse.json(review, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error creating pre-op review:', error);
    return NextResponse.json(
      { error: 'Failed to create pre-op review' },
      { status: 500 }
    );
  }
}
