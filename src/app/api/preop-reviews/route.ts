import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { ensureAnaesthesiaCodeForSurgery } from '@/lib/surgeryCodes';

export const dynamic = 'force-dynamic';

// Helpers: turn '' / null into undefined before validation
const emptyToUndef = (v: unknown) => (v === '' || v === null ? undefined : v);
const optStr = z.preprocess(emptyToUndef, z.string().optional());
const optNum = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : typeof v === 'string' ? Number(v) : v),
  z.number().optional()
);
const optEnum = <T extends [string, ...string[]]>(values: T) =>
  z.preprocess(emptyToUndef, z.enum(values).optional());

// Schema for creating pre-op review
const createPreOpReviewSchema = z.object({
  surgeryId: z.string().min(1, 'surgeryId is required'),
  patientId: z.string().min(1, 'patientId is required'),
  patientName: z.string().min(1, 'patientName is required'),
  folderNumber: z.string().min(1, 'folderNumber is required'),
  scheduledSurgeryDate: z.string().min(1, 'scheduledSurgeryDate is required'),
  currentMedications: optStr,
  allergies: optStr,
  comorbidities: optStr,
  previousAnesthesia: optStr,
  lastOralIntake: optStr,
  fastingStatus: optStr,
  weight: optNum,
  height: optNum,
  bmi: optNum,
  bloodPressure: optStr,
  heartRate: optNum,
  respiratoryRate: optNum,
  temperature: optNum,
  airwayClass: optStr,
  neckMovement: optStr,
  dentition: optStr,
  hemoglobin: optNum,
  plateletCount: optNum,
  ptInr: optNum,
  creatinine: optNum,
  sodium: optNum,
  potassium: optNum,
  bloodGlucose: optNum,
  otherLabResults: optStr,
  asaClass: optStr,
  proposedAnesthesiaType: optEnum(['GENERAL', 'SPINAL', 'LOCAL', 'REGIONAL', 'SEDATION']),
  anestheticPlan: optStr,
  specialConsiderations: optStr,
  riskLevel: optStr,
  riskFactors: optStr,
  reviewNotes: optStr,
  recommendations: optStr,
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
        { error: 'A pre-operative review already exists for this surgery. Open it from the list to edit.' },
        { status: 409 }
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
      } as any,
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

      // Generate the patient-facing anaesthesia drug code for pharmacy collection.
      if (reviewData.surgeryId) {
        await ensureAnaesthesiaCodeForSurgery(prisma, reviewData.surgeryId);
      }
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
      const issues = error.errors.map(e => `${e.path.join('.') || 'body'}: ${e.message}`);
      console.error('Pre-op review validation failed:', issues);
      return NextResponse.json(
        { error: `Validation error: ${issues.join('; ')}`, details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error creating pre-op review:', error);
    return NextResponse.json(
      { error: 'Failed to create pre-op review', message: (error as Error)?.message },
      { status: 500 }
    );
  }
}
