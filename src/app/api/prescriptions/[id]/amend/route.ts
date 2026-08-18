import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import {
  checkAmendment,
  statusForAmendedVersion,
  type PrescriptionStatusValue,
} from '@/lib/anaesthesia/prescriptionVersions';

export const dynamic = 'force-dynamic';

/**
 * POST /api/prescriptions/[id]/amend
 *
 * Replaces a prescription with a corrected version WITHOUT destroying it.
 *
 * The row identified by [id] is not edited. It keeps its medications exactly
 * as they were prescribed, is marked SUPERSEDED, and is linked to the new
 * version in both directions. Pharmacy can therefore always reconstruct what
 * it was asked for at the moment it packed, which is the question asked after
 * a drug error and the one an overwritten row cannot answer.
 *
 * The new version never inherits approval. A consultant approved a particular
 * set of drugs and doses; carrying that across to a changed set would record a
 * decision they did not make.
 */
const amendSchema = z.object({
  reason: z.string(),
  // What is changing. Anything omitted is carried over from the version being
  // replaced, so an amendment that only corrects a dose does not require the
  // client to resend the entire prescription and risk dropping a field.
  medications: z.string().optional(),
  fluids: z.string().nullish(),
  emergencyDrugs: z.string().nullish(),
  specialInstructions: z.string().nullish(),
  allergyAlerts: z.string().nullish(),
  urgency: z.enum(['ROUTINE', 'URGENT', 'EMERGENCY']).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const input = amendSchema.parse(body);

    const previous = await prisma.anestheticPrescription.findUnique({
      where: { id: params.id },
    });
    if (!previous) {
      return NextResponse.json({ error: 'Prescription not found' }, { status: 404 });
    }

    const role = (session.user as { role?: string }).role ?? null;
    const userId = (session.user as { id?: string }).id ?? null;

    const verdict = checkAmendment({
      currentStatus: previous.status as PrescriptionStatusValue,
      reason: input.reason,
      byId: userId,
      byRole: role,
    });
    if (!verdict.ok) {
      return NextResponse.json({ error: verdict.problem }, { status: 422 });
    }

    // One transaction: the replacement must never exist without the original
    // being marked superseded, or two live versions would both look current
    // and pharmacy would have no way to choose between them.
    const amended = await prisma.$transaction(async (tx) => {
      const next = await tx.anestheticPrescription.create({
        data: {
          preOpReviewId: previous.preOpReviewId,
          surgeryId: previous.surgeryId,
          patientId: previous.patientId,
          patientName: previous.patientName,
          // The ORIGINAL prescriber is preserved. The amender is recorded
          // separately below — conflating the two would attribute the whole
          // prescription to whoever last touched it.
          prescribedById: previous.prescribedById,
          prescribedByName: previous.prescribedByName,
          scheduledSurgeryDate: previous.scheduledSurgeryDate,
          urgency: input.urgency ?? previous.urgency,

          medications: input.medications ?? previous.medications,
          fluids: input.fluids !== undefined ? input.fluids : previous.fluids,
          emergencyDrugs: input.emergencyDrugs !== undefined ? input.emergencyDrugs : previous.emergencyDrugs,
          specialInstructions: input.specialInstructions !== undefined
            ? input.specialInstructions : previous.specialInstructions,
          allergyAlerts: input.allergyAlerts !== undefined ? input.allergyAlerts : previous.allergyAlerts,

          status: statusForAmendedVersion(previous.status as PrescriptionStatusValue),
          version: previous.version + 1,
          supersedesId: previous.id,
          amendedById: userId,
          amendedByName: session.user.name ?? null,
          amendedAt: new Date(),
          amendmentReason: input.reason.trim(),
        },
      });

      await tx.anestheticPrescription.update({
        where: { id: previous.id },
        data: {
          status: 'SUPERSEDED',
          supersededById: next.id,
          supersededAt: new Date(),
        },
      });

      return next;
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        tableName: 'anesthetic_prescriptions',
        recordId: previous.id,
        changes: JSON.stringify({
          amendedTo: amended.id,
          version: { from: previous.version, to: amended.version },
          status: { from: previous.status, to: 'SUPERSEDED' },
          newStatus: amended.status,
          reason: input.reason.trim(),
          by: { userId, role },
        }),
      },
    });

    return NextResponse.json({
      prescription: amended,
      supersededId: previous.id,
      // The drugs are already out of the pharmacy, so the amendment has to be
      // actively communicated rather than left to be noticed on a screen.
      requiresPharmacyNotice: verdict.requiresPharmacyNotice,
      message: verdict.requiresPharmacyNotice
        ? 'Amended. The previous version had already been dispensed — tell Pharmacy directly; do not rely on the status changing.'
        : amended.status === 'PENDING_APPROVAL'
          ? 'Amended. The previous approval does not carry over, so this version needs approving again.'
          : 'Amended. The previous version is preserved and marked superseded.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid amendment', details: error.errors }, { status: 400 });
    }
    console.error('Error amending prescription:', error);
    return NextResponse.json({ error: 'Failed to amend prescription' }, { status: 500 });
  }
}
