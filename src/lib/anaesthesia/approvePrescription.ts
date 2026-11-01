// ============================================================
// Approving (or rejecting) one anaesthetic prescription
// ------------------------------------------------------------
// Lifted out of POST /api/prescriptions/[id]/approve unchanged, so that the
// consultant's dashboard card can approve a prescription by exactly the same
// route the approvals screen does: same late-arrival rule, same audit row,
// same radio announcement to pharmacy.
//
// It is shared rather than copied because the two things that must never
// diverge are here. The late-arrival flag is what the booking-punctuality
// reports are built on, and the radio announcement is how pharmacy learns
// there is anything to pack — a second approval path missing either would
// produce drugs nobody packs and a report that quietly under-counts.
// ============================================================

import { prisma } from '@/lib/prisma';
import { triggerRadio } from '@/lib/radioEvents';

export interface ApproveActor {
  id: string;
  name?: string | null;
}

export interface ApprovePrescriptionArgs {
  prescriptionId: string;
  approved: boolean;
  approvalNotes?: string;
  rejectionReason?: string;
  actor: ApproveActor;
}

export type ApproveResult =
  | { ok: true; prescription: Record<string, unknown>; isLateArrival: boolean }
  | { ok: false; reason: 'NOT_FOUND' | 'ALREADY_APPROVED' };

/**
 * Approval after 6 PM on the day before surgery is late.
 *
 * Exported so the deadline can be shown before it is missed rather than
 * reported afterwards.
 */
export function approvalDeadlineFor(surgeryDate: Date | string): Date {
  const d = new Date(surgeryDate);
  d.setDate(d.getDate() - 1);
  d.setHours(18, 0, 0, 0);
  return d;
}

export async function approveAnaestheticPrescription(
  args: ApprovePrescriptionArgs,
): Promise<ApproveResult> {
  const { prescriptionId, approved, approvalNotes, rejectionReason, actor } = args;

  const existing = await prisma.anestheticPrescription.findUnique({
    where: { id: prescriptionId },
    include: { prescribedBy: true },
  });

  if (!existing) return { ok: false, reason: 'NOT_FOUND' };
  if (existing.status === 'APPROVED') return { ok: false, reason: 'ALREADY_APPROVED' };

  const deadline = existing.scheduledSurgeryDate
    ? approvalDeadlineFor(existing.scheduledSurgeryDate)
    : null;
  const isLateArrival = !!(approved && deadline && new Date() > deadline);

  const updated = await prisma.anestheticPrescription.update({
    where: { id: prescriptionId },
    data: {
      status: approved ? 'APPROVED' : 'REJECTED',
      approvedById: approved ? actor.id : null,
      approvedByName: approved ? (actor.name ?? null) : null,
      approvedAt: approved ? new Date() : null,
      rejectionReason: approved ? null : rejectionReason,
      isLateArrival,
      lateArrivalFlaggedAt: isLateArrival ? new Date() : null,
      approvalDeadline: deadline,
    },
    include: {
      surgery: true,
      patient: true,
      prescribedBy: { select: { id: true, fullName: true, role: true } },
      approvedBy: { select: { id: true, fullName: true, role: true } },
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      action: approved ? 'APPROVE' : 'REJECT',
      tableName: 'AnestheticPrescription',
      recordId: updated.id,
      changes: JSON.stringify({
        approved,
        notes: approvalNotes || rejectionReason,
      }),
    },
  });

  const u = updated as unknown as {
    patient?: { fullName?: string };
    patientName?: string;
    surgery?: { theatreName?: string; theatre?: string };
  };
  const patientName = u.patient?.fullName || u.patientName || 'patient';
  const theatreName = u.surgery?.theatreName || u.surgery?.theatre || null;

  if (approved) {
    await triggerRadio({
      category: 'CONFIRMATION',
      title: 'Anaesthetic prescription approved',
      message: `Anaesthetic prescription for ${patientName} has been reviewed and approved by ${actor.name ?? 'the consultant anaesthetist'}.${isLateArrival ? ' Note: late arrival flagged.' : ''} Pharmacy please proceed to pack the drugs.`,
      location: theatreName,
      priority: 60,
      triggeredById: actor.id,
      metadata: { prescriptionId: updated.id, isLateArrival },
    });
  } else {
    await triggerRadio({
      category: 'WORKFLOW',
      title: 'Anaesthetic prescription rejected',
      message: `Anaesthetic prescription for ${patientName} was rejected by ${actor.name ?? 'the consultant anaesthetist'}. Reason: ${rejectionReason ?? 'see prescription notes'}.`,
      location: theatreName,
      priority: 65,
      triggeredById: actor.id,
      metadata: { prescriptionId: updated.id },
    });
  }

  return { ok: true, prescription: updated as unknown as Record<string, unknown>, isLateArrival };
}
