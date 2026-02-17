import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const approvePrescriptionSchema = z.object({
  approved: z.boolean(),
  approvalNotes: z.string().optional(),
  rejectionReason: z.string().optional(),
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

    // Check if user is an anesthetist (consultant level)
    if (!['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Only consultant anesthetists can approve prescriptions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = approvePrescriptionSchema.parse(body);

    // Check if prescription exists
    const existingPrescription = await prisma.anestheticPrescription.findUnique({
      where: { id: params.id },
      include: {
        prescribedBy: true,
      },
    });

    if (!existingPrescription) {
      return NextResponse.json(
        { error: 'Prescription not found' },
        { status: 404 }
      );
    }

    if (existingPrescription.status === 'APPROVED') {
      return NextResponse.json(
        { error: 'Prescription is already approved' },
        { status: 400 }
      );
    }

    // Check late arrival: if approved after 6 PM the day before surgery
    let isLateArrival = false;
    if (validatedData.approved && existingPrescription.scheduledSurgeryDate) {
      const surgeryDate = new Date(existingPrescription.scheduledSurgeryDate);
      const deadline = new Date(surgeryDate);
      deadline.setDate(deadline.getDate() - 1);
      deadline.setHours(18, 0, 0, 0); // 6 PM day before
      
      if (new Date() > deadline) {
        isLateArrival = true;
      }
    }

    // Update prescription with approval
    const updatedPrescription = await prisma.anestheticPrescription.update({
      where: { id: params.id },
      data: {
        status: validatedData.approved ? 'APPROVED' : 'REJECTED',
        approvedById: validatedData.approved ? session.user.id : null,
        approvedByName: validatedData.approved ? session.user.name : null,
        approvedAt: validatedData.approved ? new Date() : null,
        rejectionReason: validatedData.approved ? null : validatedData.rejectionReason,
        isLateArrival: isLateArrival,
        lateArrivalFlaggedAt: isLateArrival ? new Date() : null,
        approvalDeadline: existingPrescription.scheduledSurgeryDate ? (() => {
          const d = new Date(existingPrescription.scheduledSurgeryDate);
          d.setDate(d.getDate() - 1);
          d.setHours(18, 0, 0, 0);
          return d;
        })() : null,
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
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: validatedData.approved ? 'APPROVE' : 'REJECT',
        tableName: 'AnestheticPrescription',
        recordId: updatedPrescription.id,
        changes: JSON.stringify({
          approved: validatedData.approved,
          notes: validatedData.approvalNotes || validatedData.rejectionReason,
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

    console.error('Error approving prescription:', error);
    return NextResponse.json(
      { error: 'Failed to approve prescription' },
      { status: 500 }
    );
  }
}
