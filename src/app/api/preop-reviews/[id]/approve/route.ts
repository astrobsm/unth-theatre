import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const medicationItemSchema = z.object({
  drugName: z.string().min(1, 'Drug name is required'),
  dosage: z.string().min(1, 'Dosage is required'),
  route: z.string().min(1, 'Route is required'),
  frequency: z.string().optional(),
  timing: z.string().optional(),
  quantity: z.number().int().min(1).default(1),
});

const approveReviewSchema = z.object({
  approvalNotes: z.string().optional(),
  rejectionReason: z.string().optional(),
  approved: z.boolean(),
  // When rejecting, consultant can provide a corrected prescription
  correctedPrescription: z.object({
    medications: z.array(medicationItemSchema).min(1, 'At least one medication is required'),
    fluids: z.string().optional(),
    emergencyDrugs: z.string().optional(),
    urgency: z.enum(['ROUTINE', 'URGENT', 'EMERGENCY']).default('ROUTINE'),
    specialInstructions: z.string().optional(),
    prescriptionNotes: z.string().optional(),
  }).optional(),
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

    // Check if user is an anesthetist (consultant level) or admin
    if (!['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'ADMIN', 'THEATRE_MANAGER'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Only consultant anesthetists and administrators can approve reviews' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = approveReviewSchema.parse(body);

    // Check if review exists
    const existingReview = await prisma.preOperativeAnestheticReview.findUnique({
      where: { id: params.id },
      include: {
        surgery: true,
        patient: true,
      },
    });

    if (!existingReview) {
      return NextResponse.json(
        { error: 'Pre-op review not found' },
        { status: 404 }
      );
    }

    if (existingReview.status === 'APPROVED') {
      return NextResponse.json(
        { error: 'Review is already approved' },
        { status: 400 }
      );
    }

    // If rejecting with a corrected prescription, create the prescription and mark review as APPROVED
    if (!validatedData.approved && validatedData.correctedPrescription) {
      const rx = validatedData.correctedPrescription;

      // Mark review as APPROVED (consultant is overriding with corrected prescription)
      const updatedReview = await prisma.preOperativeAnestheticReview.update({
        where: { id: params.id },
        data: {
          status: 'APPROVED',
          approvedBy: session.user.id,
          approvedAt: new Date(),
          approvalNotes: validatedData.approvalNotes || null,
          rejectionReason: validatedData.rejectionReason,
          consultantAnesthetistId: session.user.id,
          consultantName: session.user.name,
        },
        include: {
          surgery: true,
          patient: true,
          anesthetist: {
            select: { id: true, fullName: true, role: true },
          },
          consultantAnesthetist: {
            select: { id: true, fullName: true, role: true },
          },
        },
      });

      // Create the corrected prescription as APPROVED so pharmacist can see it for packing
      const prescription = await prisma.anestheticPrescription.create({
        data: {
          preOpReviewId: params.id,
          surgeryId: existingReview.surgeryId,
          patientId: existingReview.patientId,
          patientName: existingReview.patientName,
          prescribedById: session.user.id,
          prescribedByName: session.user.name || '',
          medications: JSON.stringify(rx.medications),
          fluids: rx.fluids || null,
          emergencyDrugs: rx.emergencyDrugs || null,
          scheduledSurgeryDate: existingReview.scheduledSurgeryDate,
          urgency: rx.urgency || 'ROUTINE',
          specialInstructions: rx.specialInstructions || null,
          allergyAlerts: existingReview.allergies || null,
          prescriptionNotes: rx.prescriptionNotes || null,
          // Auto-approve since the consultant is creating it directly
          status: 'APPROVED',
          approvedById: session.user.id,
          approvedByName: session.user.name || '',
          approvedAt: new Date(),
        },
      });

      // Create individual medication items for tracking
      if (rx.medications.length > 0) {
        await prisma.prescriptionMedicationItem.createMany({
          data: rx.medications.map((med) => ({
            prescriptionId: prescription.id,
            drugName: med.drugName,
            dosage: med.dosage,
            route: med.route,
            frequency: med.frequency || null,
            timing: med.timing || null,
            quantity: med.quantity || 1,
          })),
        });
      }

      // Create audit logs
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'REJECT_WITH_CORRECTED_PRESCRIPTION',
          tableName: 'PreOperativeAnestheticReview',
          recordId: updatedReview.id,
          changes: JSON.stringify({
            rejectionReason: validatedData.rejectionReason,
            correctedPrescriptionId: prescription.id,
            medicationCount: rx.medications.length,
          }),
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'CREATE_CORRECTED_PRESCRIPTION',
          tableName: 'AnestheticPrescription',
          recordId: prescription.id,
          changes: JSON.stringify({
            sourceReviewId: params.id,
            medications: rx.medications,
            status: 'APPROVED',
          }),
        },
      });

      return NextResponse.json({
        ...updatedReview,
        correctedPrescription: prescription,
        message: 'Review rejected with corrected prescription. Prescription is now available for pharmacist packing.',
      });
    }

    // Standard approve/reject without corrected prescription
    const updatedReview = await prisma.preOperativeAnestheticReview.update({
      where: { id: params.id },
      data: {
        status: validatedData.approved ? 'APPROVED' : 'IN_PROGRESS',
        approvedBy: validatedData.approved ? session.user.id : null,
        approvedAt: validatedData.approved ? new Date() : null,
        approvalNotes: validatedData.approvalNotes,
        rejectionReason: validatedData.approved ? null : validatedData.rejectionReason,
        consultantAnesthetistId: session.user.id,
        consultantName: session.user.name,
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
        action: validatedData.approved ? 'APPROVE' : 'REJECT',
        tableName: 'PreOperativeAnestheticReview',
        recordId: updatedReview.id,
        changes: JSON.stringify({
          approved: validatedData.approved,
          notes: validatedData.approvalNotes || validatedData.rejectionReason,
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

    console.error('Error approving pre-op review:', error);
    return NextResponse.json(
      { error: 'Failed to approve pre-op review' },
      { status: 500 }
    );
  }
}
