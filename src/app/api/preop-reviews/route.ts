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
  currentMedications: z.string().optional().nullable().transform(v => v || undefined),
  allergies: z.string().optional().nullable().transform(v => v || undefined),
  comorbidities: z.string().optional().nullable().transform(v => v || undefined),
  previousAnesthesia: z.string().optional().nullable().transform(v => v || undefined),
  lastOralIntake: z.string().optional().nullable().transform(v => v || undefined),
  fastingStatus: z.string().optional().nullable().transform(v => v || undefined),
  weight: z.number().optional().nullable(),
  height: z.number().optional().nullable(),
  bmi: z.number().optional().nullable(),
  bloodPressure: z.string().optional().nullable().transform(v => v || undefined),
  heartRate: z.number().optional().nullable(),
  respiratoryRate: z.number().optional().nullable(),
  temperature: z.number().optional().nullable(),
  airwayClass: z.string().optional().nullable().transform(v => v || undefined),
  neckMovement: z.string().optional().nullable().transform(v => v || undefined),
  dentition: z.string().optional().nullable().transform(v => v || undefined),
  hemoglobin: z.number().optional().nullable(),
  plateletCount: z.number().optional().nullable(),
  ptInr: z.number().optional().nullable(),
  creatinine: z.number().optional().nullable(),
  sodium: z.number().optional().nullable(),
  potassium: z.number().optional().nullable(),
  bloodGlucose: z.number().optional().nullable(),
  otherLabResults: z.string().optional().nullable().transform(v => v || undefined),
  asaClass: z.string().optional().nullable().transform(v => v || undefined),
  proposedAnesthesiaType: z.enum(['GENERAL', 'SPINAL', 'LOCAL', 'REGIONAL', 'SEDATION']).optional().nullable().transform(v => v || undefined),
  anestheticPlan: z.string().optional().nullable().transform(v => v || undefined),
  specialConsiderations: z.string().optional().nullable().transform(v => v || undefined),
  riskLevel: z.string().optional().nullable().transform(v => v || undefined),
  riskFactors: z.string().optional().nullable().transform(v => v || undefined),
  reviewNotes: z.string().optional().nullable().transform(v => v || undefined),
  recommendations: z.string().optional().nullable().transform(v => v || undefined),
  // Prescription data
  prescription: z.object({
    medications: z.array(z.object({
      id: z.string(),
      category: z.string(),
      name: z.string(),
      dose: z.string(),
      unit: z.string(),
      route: z.string(),
      timing: z.string(),
      notes: z.string().optional(),
    })),
    urgency: z.enum(['ROUTINE', 'URGENT', 'EMERGENCY']),
    specialInstructions: z.string().optional(),
    allergyAlerts: z.string().optional(),
  }).optional(),
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

    // Check if user is an anesthetist or admin
    if (!['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'ADMIN', 'THEATRE_MANAGER'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Only anesthetists and administrators can create pre-op reviews' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = createPreOpReviewSchema.parse(body);

    // Extract prescription data before creating review
    const { prescription, ...reviewData } = validatedData;

    // Check if review already exists for this surgery
    const existingReview = await prisma.preOperativeAnestheticReview.findUnique({
      where: { surgeryId: reviewData.surgeryId },
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
        ...reviewData,
        scheduledSurgeryDate: new Date(reviewData.scheduledSurgeryDate),
        lastOralIntake: reviewData.lastOralIntake ? new Date(reviewData.lastOralIntake) : null,
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

    // Create anesthetic prescription if medications were added
    if (prescription && prescription.medications.length > 0) {
      await prisma.anestheticPrescription.create({
        data: {
          preOpReviewId: review.id,
          surgeryId: reviewData.surgeryId,
          patientId: reviewData.patientId,
          patientName: reviewData.patientName,
          prescribedById: session.user.id,
          prescribedByName: session.user.name || '',
          scheduledSurgeryDate: new Date(reviewData.scheduledSurgeryDate),
          medications: JSON.stringify(prescription.medications),
          urgency: prescription.urgency,
          specialInstructions: prescription.specialInstructions || null,
          allergyAlerts: reviewData.allergies || null,
          status: 'PENDING_APPROVAL', // Awaiting consultant approval
        },
      });
    }

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
