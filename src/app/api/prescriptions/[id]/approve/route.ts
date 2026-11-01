import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';
import { approveAnaestheticPrescription } from '@/lib/anaesthesia/approvePrescription';

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

    const body = await request.json();
    const validatedData = approvePrescriptionSchema.parse(body);

    // The work itself lives in lib/anaesthesia/approvePrescription, so that the
    // consultant's dashboard card approves by the same path as this screen:
    // same late-arrival rule, same audit row, same radio call to pharmacy.
    const result = await approveAnaestheticPrescription({
      prescriptionId: params.id,
      approved: validatedData.approved,
      approvalNotes: validatedData.approvalNotes,
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
