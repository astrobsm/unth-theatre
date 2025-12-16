import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const approveReviewSchema = z.object({
  approvalNotes: z.string().optional(),
  rejectionReason: z.string().optional(),
  approved: z.boolean(),
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
        { error: 'Only consultant anesthetists can approve reviews' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = approveReviewSchema.parse(body);

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

    if (existingReview.status === 'APPROVED') {
      return NextResponse.json(
        { error: 'Review is already approved' },
        { status: 400 }
      );
    }

    // Update review with approval
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
