import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const createReviewSchema = z.object({
  emergencyBookingId: z.string(),
  patientName: z.string(),
  folderNumber: z.string(),
  surgeryId: z.string().optional(),
  // Assessment
  airwayAssessment: z.string().optional(),
  asaClassification: z.string().optional(),
  allergies: z.string().optional(),
  currentMedications: z.string().optional(),
  pastMedicalHistory: z.string().optional(),
  lastMealTime: z.string().optional(),
  // Vitals
  bloodPressure: z.string().optional(),
  heartRate: z.number().optional(),
  oxygenSaturation: z.number().optional(),
  temperature: z.number().optional(),
  weight: z.number().optional(),
  height: z.number().optional(),
  // Emergency-specific
  estimatedBloodLoss: z.string().optional(),
  coagulationStatus: z.string().optional(),
  hemoglobinLevel: z.number().optional(),
  crossMatchStatus: z.string().optional(),
  ivAccess: z.string().optional(),
  patientNPOStatus: z.string().optional(),
  // Plan
  anaestheticPlan: z.string().optional(),
  specialConsiderations: z.string().optional(),
  riskAssessment: z.string().optional(),
  consentObtained: z.boolean().default(false),
  consentNotes: z.string().optional(),
  // Prescription
  medications: z.string().optional(), // JSON array
  fluids: z.string().optional(),
  emergencyDrugs: z.string().optional(),
  specialInstructions: z.string().optional(),
});

// GET - Fetch reviews for a booking
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get('bookingId');

    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId is required' }, { status: 400 });
    }

    const reviews = await prisma.emergencyPreAnaestheticReview.findMany({
      where: { emergencyBookingId: bookingId },
      include: {
        reviewer: { select: { id: true, fullName: true, role: true } },
        approvedBy: { select: { id: true, fullName: true, role: true } },
        prescriptions: {
          include: {
            packedBy: { select: { id: true, fullName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(reviews);
  } catch (error) {
    console.error('Error fetching emergency reviews:', error);
    return NextResponse.json([], { status: 200 });
  }
}

// POST - Create pre-anaesthetic review + auto-create emergency prescription
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only anaesthetists and admins can create reviews
    if (!['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'ADMIN', 'THEATRE_MANAGER'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Only anaesthetists can perform pre-anaesthetic reviews' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const data = createReviewSchema.parse(body);

    // BMI calculation
    let bmi: number | undefined;
    if (data.weight && data.height) {
      const heightM = data.height / 100;
      bmi = Math.round((data.weight / (heightM * heightM)) * 10) / 10;
    }

    // Create the review
    const review = await prisma.emergencyPreAnaestheticReview.create({
      data: {
        emergencyBookingId: data.emergencyBookingId,
        surgeryId: data.surgeryId,
        patientName: data.patientName,
        folderNumber: data.folderNumber,
        reviewerId: session.user.id,
        reviewerName: session.user.name || '',
        airwayAssessment: data.airwayAssessment,
        asaClassification: data.asaClassification,
        allergies: data.allergies,
        currentMedications: data.currentMedications,
        pastMedicalHistory: data.pastMedicalHistory,
        lastMealTime: data.lastMealTime ? new Date(data.lastMealTime) : null,
        bloodPressure: data.bloodPressure,
        heartRate: data.heartRate,
        oxygenSaturation: data.oxygenSaturation,
        temperature: data.temperature,
        weight: data.weight,
        height: data.height,
        bmi,
        estimatedBloodLoss: data.estimatedBloodLoss,
        coagulationStatus: data.coagulationStatus,
        hemoglobinLevel: data.hemoglobinLevel,
        crossMatchStatus: data.crossMatchStatus,
        ivAccess: data.ivAccess,
        patientNPOStatus: data.patientNPOStatus,
        anaestheticPlan: data.anaestheticPlan,
        specialConsiderations: data.specialConsiderations,
        riskAssessment: data.riskAssessment,
        consentObtained: data.consentObtained,
        consentNotes: data.consentNotes,
        status: 'COMPLETED',
      },
    });

    // Auto-create emergency prescription if medications provided
    let prescription = null;
    if (data.medications) {
      prescription = await prisma.emergencyPrescription.create({
        data: {
          reviewId: review.id,
          emergencyBookingId: data.emergencyBookingId,
          patientName: data.patientName,
          folderNumber: data.folderNumber,
          prescribedByName: session.user.name || '',
          medications: data.medications,
          fluids: data.fluids,
          emergencyDrugs: data.emergencyDrugs,
          allergyAlerts: data.allergies,
          specialInstructions: data.specialInstructions,
          isEmergency: true,
          status: 'SUBMITTED',
        },
      });

      // Notify pharmacists — create notification for all pharmacists
      try {
        const pharmacists = await prisma.user.findMany({
          where: { role: 'PHARMACIST', status: 'APPROVED' },
          select: { id: true },
        });

        if (pharmacists.length > 0) {
          await prisma.notification.createMany({
            data: pharmacists.map((p) => ({
              userId: p.id,
              title: '🚨 EMERGENCY Prescription',
              message: `Emergency prescription for ${data.patientName} (${data.folderNumber}) requires IMMEDIATE dispensing. Review and pack medications now.`,
              type: 'EMERGENCY',
              link: `/dashboard/pharmacy/emergency?bookingId=${data.emergencyBookingId}`,
            })),
          });
        }
      } catch (e) {
        // Notification failure shouldn't block the review
        console.error('Failed to notify pharmacists:', e);
      }
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        tableName: 'EmergencyPreAnaestheticReview',
        recordId: review.id,
        changes: JSON.stringify({
          bookingId: data.emergencyBookingId,
          patient: data.patientName,
          hasPrescription: !!prescription,
        }),
      },
    });

    return NextResponse.json({ review, prescription }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    console.error('Error creating emergency review:', error);
    return NextResponse.json({ error: 'Failed to create review' }, { status: 500 });
  }
}
