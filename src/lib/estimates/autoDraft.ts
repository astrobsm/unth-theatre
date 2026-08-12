// ============================================================
// The draft estimate created at booking
// ------------------------------------------------------------
// Every booked case gets a DRAFT estimate the moment it is booked, so costing
// starts from something that already exists rather than from someone
// remembering to create it. A DRAFT is not shown to a patient and commits the
// hospital to nothing.
//
// It is deliberately NOT priced here. Pricing needs the theatre charge code, the
// fee band and the expected stay — decisions a person makes, not defaults a
// booking form can guess. A draft full of guessed figures is worse than an empty
// one, because someone will hand it over.
// ============================================================

import prisma from '@/lib/prisma';
import { nextEstimateNumber } from './service';

export interface AutoDraftInput {
  surgeryId: string;
  patientId: string;
  createdById?: string | null;
  createdByName?: string | null;
}

/**
 * Create the DRAFT estimate for a newly booked case.
 *
 * NEVER throws. A booking must not fail because an estimate could not be
 * created — the case is the point, the estimate is a convenience, and the same
 * reasoning already governs procedure-use statistics in the booking route. The
 * caller uses `void safeCreateDraftEstimate(...)`.
 *
 * Returns the estimate number on success, null on any failure, having logged it.
 */
export async function safeCreateDraftEstimate(
  input: AutoDraftInput
): Promise<string | null> {
  try {
    // One live draft per case. A rebooking or a retried request must not leave
    // two drafts for the same surgery, or the wrong one gets costed.
    const existing = await prisma.surgeryEstimate.findFirst({
      where: {
        surgeryId: input.surgeryId,
        status: { in: ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'ISSUED'] },
      },
      select: { estimateNumber: true },
    });
    if (existing) return existing.estimateNumber;

    const surgery = await prisma.surgery.findUnique({
      where: { id: input.surgeryId },
      select: {
        id: true, procedureName: true, subspecialty: true, unit: true,
        scheduledDate: true, surgeryType: true, anesthesiaType: true,
        surgeonName: true,
      },
    });
    const patient = await prisma.patient.findUnique({
      where: { id: input.patientId },
      select: { name: true, folderNumber: true },
    });
    if (!surgery || !patient) return null;

    // Retried on the unique-number collision two simultaneous bookings cause.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const created = await prisma.$transaction(async (tx) => {
          const number = await nextEstimateNumber(
            tx as never, new Date().getUTCFullYear());
          return tx.surgeryEstimate.create({
            data: {
              estimateNumber: number,
              surgeryId: surgery.id,
              patientId: input.patientId,
              // Snapshotted, like everywhere else in this module: a patient
              // renamed later must not alter a document already prepared.
              patientName: patient.name,
              folderNumber: patient.folderNumber ?? null,
              procedureName: surgery.procedureName,
              subspecialty: surgery.subspecialty ?? null,
              unit: surgery.unit ?? null,
              surgeonName: surgery.surgeonName ?? null,
              anaesthesiaType: surgery.anesthesiaType ?? null,
              surgeryType: surgery.surgeryType ?? null,
              plannedDate: surgery.scheduledDate ?? null,
              // Zero days, not a guessed stay. See the header note.
              expectedStayDays: 0,
              preparedById: input.createdById ?? null,
              preparedByName: input.createdByName ?? null,
            },
            select: { estimateNumber: true },
          });
        });
        return created.estimateNumber;
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (!/estimateNumber|Unique constraint/i.test(msg)) throw err;
        if (attempt === 2) return null;
      }
    }
    return null;
  } catch (err) {
    // Logged loudly but swallowed. If this becomes common the log will say so;
    // meanwhile the theatre list is unaffected.
    console.error('[estimates] could not create draft for surgery', input.surgeryId, err);
    return null;
  }
}
