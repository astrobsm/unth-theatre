import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

// Schema for creating an emergency pre-anaesthetic review
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
  
  // Emergency-Specific
  estimatedBloodLoss: z.string().optional(),
  coagulationStatus: z.string().optional(),
  hemoglobinLevel: z.number().optional(),
  crossMatchStatus: z.string().optional(),
  ivAccess: z.string().optional(),
  patientNPOStatus: z.string().optional(),
  
  // Anaesthetic Plan
  anaestheticPlan: z.string().optional(),
  specialConsiderations: z.string().optional(),
  riskAssessment: z.string().optional(),
  consentObtained: z.boolean().default(false),
  consentNotes: z.string().optional(),
  
  // Prescription data (auto-create prescription)
  medications: z.string().optional(), // JSON
  fluids: z.string().optional(),
  emergencyDrugs: z.string().optional(),
  specialInstructions: z.string().optional(),
});

// GET - Fetch reviews for an emergency booking
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get('bookingId');
    const forPharmacist = searchParams.get('forPharmacist') === 'true';

    const where: any = {};
    if (bookingId) {
      where.emergencyBookingId = bookingId;
    }

    // If pharmacist view, show all emergency reviews with prescriptions
    if (forPharmacist) {
      const prescriptions = await prisma.emergencyPrescription.findMany({
        where: {
          isEmergency: true,
          status: { notIn: ['DISPENSED'] },
        },
        include: {
          review: {
            select: {
              id: true,
              patientName: true,
              folderNumber: true,
              reviewerName: true,
              allergies: true,
              asaClassification: true,
              status: true,
              emergencyBooking: {
                select: {
                  id: true,
                  procedureName: true,
                  surgicalUnit: true,
                  priority: true,
                  requiredByTime: true,
                },
              },
            },
          },
          packedBy: {
            select: { id: true, fullName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return NextResponse.json(prescriptions);
    }

    const reviews = await prisma.emergencyPreAnaestheticReview.findMany({
      where,
      include: {
        reviewer: {
          select: { id: true, fullName: true, role: true },
        },
        approvedBy: {
          select: { id: true, fullName: true },
        },
        prescriptions: {
          include: {
            packedBy: {
              select: { id: true, fullName: true },
            },
          },
        },
        emergencyBooking: {
          select: {
            id: true,
            patientName: true,
            procedureName: true,
            priority: true,
            surgicalUnit: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(reviews);
  } catch (error) {
    console.error('Error fetching emergency reviews:', error);
    return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 });
  }
}

// POST - Create emergency pre-anaesthetic review + auto-create prescription
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only anaesthetists and admins can create reviews
    if (!['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'ADMIN', 'THEATRE_MANAGER'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Only anaesthetists or admins can create pre-anaesthetic reviews' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validated = createReviewSchema.parse(body);

    // Verify booking exists
    const booking = await prisma.emergencySurgeryBooking.findUnique({
      where: { id: validated.emergencyBookingId },
    });

    if (!booking) {
      return NextResponse.json({ error: 'Emergency booking not found' }, { status: 404 });
    }

    // Calculate BMI if weight and height provided
    let bmi: number | undefined;
    if (validated.weight && validated.height) {
      const heightM = validated.height / 100;
      bmi = Math.round((validated.weight / (heightM * heightM)) * 10) / 10;
    }

    // Create the review
    const review = await prisma.emergencyPreAnaestheticReview.create({
      data: {
        emergencyBookingId: validated.emergencyBookingId,
        surgeryId: validated.surgeryId || booking.surgeryId,
        patientName: validated.patientName,
        folderNumber: validated.folderNumber,
        reviewerId: session.user.id,
        reviewerName: session.user.name || 'Unknown',
        airwayAssessment: validated.airwayAssessment,
        asaClassification: validated.asaClassification,
        allergies: validated.allergies,
        currentMedications: validated.currentMedications,
        pastMedicalHistory: validated.pastMedicalHistory,
        lastMealTime: validated.lastMealTime ? new Date(validated.lastMealTime) : null,
        bloodPressure: validated.bloodPressure,
        heartRate: validated.heartRate,
        oxygenSaturation: validated.oxygenSaturation,
        temperature: validated.temperature,
        weight: validated.weight,
        height: validated.height,
        bmi,
        estimatedBloodLoss: validated.estimatedBloodLoss,
        coagulationStatus: validated.coagulationStatus,
        hemoglobinLevel: validated.hemoglobinLevel,
        crossMatchStatus: validated.crossMatchStatus,
        ivAccess: validated.ivAccess,
        patientNPOStatus: validated.patientNPOStatus,
        anaestheticPlan: validated.anaestheticPlan,
        specialConsiderations: validated.specialConsiderations,
        riskAssessment: validated.riskAssessment,
        consentObtained: validated.consentObtained,
        consentNotes: validated.consentNotes,
        status: 'COMPLETED',
        isEmergency: true,
      },
    });

    // Auto-create prescription if medications are provided
    let prescription = null;
    if (validated.medications) {
      prescription = await prisma.emergencyPrescription.create({
        data: {
          reviewId: review.id,
          emergencyBookingId: validated.emergencyBookingId,
          patientName: validated.patientName,
          folderNumber: validated.folderNumber,
          prescribedByName: session.user.name || 'Unknown',
          medications: validated.medications,
          fluids: validated.fluids,
          emergencyDrugs: validated.emergencyDrugs,
          allergyAlerts: validated.allergies,
          specialInstructions: validated.specialInstructions,
          isEmergency: true,
          urgencyNote: `EMERGENCY - ${booking.priority} PRIORITY - IMMEDIATE DISPENSING REQUIRED`,
          status: 'SUBMITTED',
        },
      });

      // Notify all pharmacists
      try {
        const pharmacists = await prisma.user.findMany({
          where: { role: 'PHARMACIST', status: 'APPROVED' },
          select: { id: true },
        });

        for (const pharma of pharmacists) {
          await prisma.notification.create({
            data: {
              userId: pharma.id,
              title: '🚨 EMERGENCY Prescription',
              message: `URGENT: Emergency prescription for ${validated.patientName} (${validated.folderNumber}) - ${booking.procedureName}. Immediate dispensing required.`,
              type: 'EMERGENCY',
            },
          });
        }
      } catch (e) {
        // Non-critical
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
          bookingId: validated.emergencyBookingId,
          patient: validated.patientName,
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
