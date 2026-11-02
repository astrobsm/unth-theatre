import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';
import { approveAnaestheticPrescription } from '@/lib/anaesthesia/approvePrescription';
import { prisma } from '@/lib/prisma';
import { caseAccessForSurgery } from '@/lib/anaesthesia/caseAccess.server';
import { refusalMessage } from '@/lib/anaesthesia/caseAccess';

export const dynamic = 'force-dynamic';

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

    // Check if user is an anesthetist (consultant level) or admin
    if (!['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'ADMIN', 'THEATRE_MANAGER'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Only consultant anesthetists and administrators can approve prescriptions' },
        { status: 403 }
      );
    }

    // WHOSE CASE IS IT. The role check above is not an answer to that. Until
    // this was added, any anaesthetist could approve any prescription in the
    // hospital -- a registrar in Theatre 2 could sign off the drugs for a
    // neurosurgical case he had never seen. The bulk endpoint at
    // /api/anaesthesia/my-cases/approve has always recomputed the caller's own
    // cases before acting; this single-case route trusted the id.
    const rx = await prisma.anestheticPrescription.findUnique({
      where: { id: params.id },
      select: { surgeryId: true },
    });
    if (!rx) {
      return NextResponse.json({ error: 'Prescription not found' }, { status: 404 });
    }

    const access = await caseAccessForSurgery({
      surgeryId: rx.surgeryId,
      userId: session.user.id,
      role: session.user.role,
    });
    // The surgery behind a prescription that exists cannot be missing, but a
    // null here must not read as permission.
    if (!access || !access.mayApprove) {
      return NextResponse.json(
        { error: access ? refusalMessage(access) : 'Case not found' },
        { status: access ? 403 : 404 },
      );
    }

    const body = await request.json();
    const validatedData = approvePrescriptionSchema.parse(body);

    // The work itself lives in lib/anaesthesia/approvePrescription, so that the
    // consultant's dashboard card approves by the same path as this screen:
    // same late-arrival rule, same audit row, same radio call to pharmacy.
    const result = await approveAnaestheticPrescription({
      prescriptionId: params.id,
      approved: validatedData.approved,
      // An unclaimed case approved by a consultant who is not named on it is
      // a legitimate thing to do and an unusual one. The audit row should say
      // so by itself, rather than leaving a reader to work it out from the
      // absence of a name on the booking.
      approvalNotes: access.reason === 'UNCLAIMED'
        ? [validatedData.approvalNotes, 'Approved by a consultant not named on this case (no anaesthetist was assigned).']
            .filter(Boolean).join(' ')
        : validatedData.approvalNotes,
      rejectionReason: validatedData.rejectionReason,
      actor: { id: session.user.id, name: session.user.name },
    });

    if (!result.ok) {
      return result.reason === 'NOT_FOUND'
        ? NextResponse.json({ error: 'Prescription not found' }, { status: 404 })
        : NextResponse.json({ error: 'Prescription is already approved' }, { status: 400 });
    }

    return NextResponse.json(result.prescription);
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
