import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { triggerRadio } from '@/lib/radioEvents';
import { generateUniqueEmergencyAnaesthesiaCode } from '@/lib/surgeryCodes';

export const dynamic = 'force-dynamic';

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
  /// What must be put right before the patient goes to theatre. Announced on
  /// the radio and on the surgeon's board the moment this is saved.
  optimisationNeeded: z.string().optional(),
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
        optimisationNeeded: validated.optimisationNeeded,
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
          anaesthesiaDrugCode: await generateUniqueEmergencyAnaesthesiaCode(prisma),
        },
      });

      // Mirror the code onto the linked Surgery (if one exists) so a single
      // lookup works whether the patient presents the elective or emergency code.
      if (booking.surgeryId && prescription.anaesthesiaDrugCode) {
        try {
          await prisma.surgery.update({
            where: { id: booking.surgeryId },
            data: { anaesthesiaDrugCode: prescription.anaesthesiaDrugCode },
          });
        } catch { /* surgery may already have a code; ignore */ }
      }

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

    // ── Say that the review has happened ──────────────────────────────────
    //
    // Until now the only person who knew a patient had been reviewed was the
    // anaesthetist who did it. The surgeon waiting to start found out by
    // asking, or by the case simply beginning; a crossmatch the anaesthetist
    // wanted reached nobody who could arrange it.
    //
    // So saving the review now says so in the two places people are actually
    // looking: out loud in the theatre, and on the board of everybody on the
    // case.
    //
    // Both are wrapped and swallowed on failure. A radio that is down, or a
    // notification that cannot be written, must not lose a review that has
    // already been saved — the announcement is how people hear about it, not
    // the record of it.
    const optimisation = (validated.optimisationNeeded ?? '').trim();
    const reviewerName = session.user.name || 'the anaesthetist';
    const sentToPharmacy = Boolean(prescription);

    try {
      await triggerRadio({
        // WORKFLOW, not EMERGENCY: the booking itself already announced the
        // emergency, and a second override that cancels the music to say a
        // form was filled in would be the kind of announcement people learn
        // to ignore.
        category: 'WORKFLOW',
        title: 'Pre-anaesthetic review complete',
        message:
          `${validated.patientName}, folder ${validated.folderNumber}, for `
          + `${booking.procedureName}, has been reviewed by ${reviewerName}.`
          + (sentToPharmacy ? ' The anaesthetic prescription has gone to Pharmacy.' : '')
          + (optimisation ? ` Before surgery: ${optimisation}` : ''),
        // Raised above routine traffic when something has to be done first:
        // that is the half of the message somebody has to act on.
        urgency: optimisation ? 'HIGH' : 'MEDIUM',
        triggeredById: session.user.id,
        metadata: { emergencyBookingId: validated.emergencyBookingId, reviewId: review.id },
      });
    } catch { /* the review is saved; the radio is not how it is recorded */ }

    try {
      // The operating surgeon first, then everyone else named on the case.
      // Deduplicated, because a consultant who is also the booker should get
      // one notice, not three.
      const recipients = new Set<string>();
      if (booking.surgeryId) {
        const surgery = await prisma.surgery.findUnique({
          where: { id: booking.surgeryId },
          select: {
            surgeonId: true, assistantSurgeonId: true, supervisingConsultantId: true,
            bookedById: true, scrubNurseId: true, theatreTechnicianId: true,
            teamMembers: { select: { userId: true } },
          },
        });
        for (const id of [
          surgery?.surgeonId, surgery?.assistantSurgeonId, surgery?.supervisingConsultantId,
          surgery?.bookedById, surgery?.scrubNurseId, surgery?.theatreTechnicianId,
          ...(surgery?.teamMembers ?? []).map((t) => t.userId),
        ]) {
          if (id) recipients.add(id);
        }
      }
      // The emergency booking names its own surgeon, which is the one person
      // who must hear this even when no Surgery row exists yet.
      if (booking.surgeonId) recipients.add(booking.surgeonId);
      // Not the anaesthetist who just wrote it — they know.
      recipients.delete(session.user.id);

      const body =
        `${validated.patientName} (${validated.folderNumber}) has been reviewed for `
        + `${booking.procedureName} by ${reviewerName}.`
        + (sentToPharmacy ? ' The anaesthetic prescription has been sent to Pharmacy.' : '')
        + (optimisation ? ` Before surgery: ${optimisation}` : '');

      for (const userId of Array.from(recipients)) {
        await prisma.notification.create({
          data: {
            userId,
            type: 'PREOP_REVIEW_DONE',
            title: optimisation
              ? 'Patient reviewed — something is needed before surgery'
              : 'Patient reviewed for surgery',
            message: body,
            link: booking.surgeryId
              ? `/dashboard/surgeries/${booking.surgeryId}`
              : '/dashboard/emergency-booking',
          },
        }).catch(() => undefined);
      }
    } catch { /* as above: the review stands whether or not the notice lands */ }

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
