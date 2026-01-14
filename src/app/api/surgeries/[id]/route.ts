import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

// GET single surgery by ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;

    const surgery = await prisma.surgery.findUnique({
      where: { id },
      include: {
        patient: true,
        surgeon: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        assistantSurgeon: {
          select: {
            id: true,
            fullName: true,
          },
        },
        anesthetist: {
          select: {
            id: true,
            fullName: true,
          },
        },
        teamMembers: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
        items: {
          include: {
            item: true,
          },
        },
        whoChecklists: true,
        cancellation: true,
        mortality: true,
        movements: {
          orderBy: {
            timestamp: 'desc',
          },
        },
        safetyCheck: true,
        holdingAreaAssessment: {
          include: {
            redAlerts: true,
          },
        },
        intraOperativeRecord: true,
        pacuAssessment: {
          include: {
            vitalSigns: {
              orderBy: {
                recordedAt: 'desc',
              },
              take: 10,
            },
            redAlerts: true,
          },
        },
        surgicalTiming: true,
        surgicalCount: true,
        anesthesiaRecord: {
          include: {
            vitalSignsRecords: {
              orderBy: {
                recordedAt: 'desc',
              },
              take: 20,
            },
            medicationRecords: {
              orderBy: {
                administeredAt: 'desc',
              },
            },
          },
        },
        preOpReviews: true,
        prescriptions: true,
        bloodRequests: true,
        emergencyAlerts: true,
        investigations: true,
      },
    });

    if (!surgery) {
      return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });
    }

    return NextResponse.json(surgery);
  } catch (error) {
    console.error('Error fetching surgery:', error);
    return NextResponse.json({ error: 'Failed to fetch surgery' }, { status: 500 });
  }
}

// PUT update surgery
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json();

    // Check if surgery exists
    const existingSurgery = await prisma.surgery.findUnique({
      where: { id },
    });

    if (!existingSurgery) {
      return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });
    }

    // Only allow updates if surgery is not completed or cancelled
    if (existingSurgery.status === 'COMPLETED' || existingSurgery.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'Cannot update a completed or cancelled surgery' },
        { status: 400 }
      );
    }

    // Extract updateable fields
    const {
      scheduledDate,
      scheduledTime,
      procedureName,
      subspecialty,
      unit,
      indication,
      surgeonId,
      surgeonName,
      assistantSurgeonId,
      anesthetistId,
      anesthesiaType,
      surgeryType,
      status,
      readinessStatus,
      needICU,
      needBloodTransfusion,
      needDiathermy,
      needStereo,
      needMontrellMattress,
      needStirups,
      needPneumaticTourniquet,
      needCArm,
      needMicroscope,
      needSuction,
      otherSpecialNeeds,
      remarks,
      depositAmount,
      depositConfirmed,
    } = body;

    const updateData: any = {};

    if (scheduledDate) updateData.scheduledDate = new Date(scheduledDate);
    if (scheduledTime) updateData.scheduledTime = scheduledTime;
    if (procedureName) updateData.procedureName = procedureName;
    if (subspecialty) updateData.subspecialty = subspecialty;
    if (unit) updateData.unit = unit;
    if (indication) updateData.indication = indication;
    if (surgeonId !== undefined) updateData.surgeonId = surgeonId;
    if (surgeonName) updateData.surgeonName = surgeonName;
    if (assistantSurgeonId !== undefined) updateData.assistantSurgeonId = assistantSurgeonId;
    if (anesthetistId !== undefined) updateData.anesthetistId = anesthetistId;
    if (anesthesiaType) updateData.anesthesiaType = anesthesiaType;
    if (surgeryType) updateData.surgeryType = surgeryType;
    if (status) updateData.status = status;
    if (readinessStatus) updateData.readinessStatus = readinessStatus;
    if (needICU !== undefined) updateData.needICU = needICU;
    if (needBloodTransfusion !== undefined) updateData.needBloodTransfusion = needBloodTransfusion;
    if (needDiathermy !== undefined) updateData.needDiathermy = needDiathermy;
    if (needStereo !== undefined) updateData.needStereo = needStereo;
    if (needMontrellMattress !== undefined) updateData.needMontrellMattress = needMontrellMattress;
    if (needStirups !== undefined) updateData.needStirups = needStirups;
    if (needPneumaticTourniquet !== undefined) updateData.needPneumaticTourniquet = needPneumaticTourniquet;
    if (needCArm !== undefined) updateData.needCArm = needCArm;
    if (needMicroscope !== undefined) updateData.needMicroscope = needMicroscope;
    if (needSuction !== undefined) updateData.needSuction = needSuction;
    if (otherSpecialNeeds !== undefined) updateData.otherSpecialNeeds = otherSpecialNeeds;
    if (remarks !== undefined) updateData.remarks = remarks;
    if (depositAmount !== undefined) updateData.depositAmount = depositAmount;
    if (depositConfirmed !== undefined) updateData.depositConfirmed = depositConfirmed;

    const updatedSurgery = await prisma.surgery.update({
      where: { id },
      data: updateData,
      include: {
        patient: true,
        surgeon: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });

    // Log the update
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        tableName: 'surgeries',
        recordId: id,
        changes: JSON.stringify(updateData),
      },
    });

    return NextResponse.json(updatedSurgery);
  } catch (error) {
    console.error('Error updating surgery:', error);
    return NextResponse.json({ error: 'Failed to update surgery' }, { status: 500 });
  }
}

// DELETE surgery (only for ADMIN or THEATRE_MANAGER, and only if not completed)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only ADMIN and THEATRE_MANAGER can delete surgeries
    if (!['ADMIN', 'THEATRE_MANAGER'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = params;

    // Check if surgery exists
    const existingSurgery = await prisma.surgery.findUnique({
      where: { id },
      include: {
        items: true,
        teamMembers: true,
        whoChecklists: true,
        movements: true,
        cancellation: true,
        safetyCheck: true,
        holdingAreaAssessment: {
          include: {
            redAlerts: true,
          },
        },
        pacuAssessment: {
          include: {
            vitalSigns: true,
            redAlerts: true,
          },
        },
        surgicalTiming: {
          include: {
            events: true,
          },
        },
        surgicalCount: {
          include: {
            countEvents: true,
          },
        },
        intraOperativeRecord: true,
        anesthesiaRecord: {
          include: {
            vitalSignsRecords: true,
            medicationRecords: true,
          },
        },
      },
    });

    if (!existingSurgery) {
      return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });
    }

    // Don't allow deletion of completed surgeries (archive instead)
    if (existingSurgery.status === 'COMPLETED') {
      return NextResponse.json(
        { error: 'Cannot delete completed surgeries. Please use cancellation for record keeping.' },
        { status: 400 }
      );
    }

    // Delete related records first (cascade deletes)
    await prisma.$transaction(async (tx) => {
      // Delete nested records
      if (existingSurgery.holdingAreaAssessment) {
        await tx.holdingAreaRedAlert.deleteMany({
          where: { assessmentId: existingSurgery.holdingAreaAssessment.id },
        });
        await tx.holdingAreaAssessment.delete({
          where: { id: existingSurgery.holdingAreaAssessment.id },
        });
      }

      if (existingSurgery.pacuAssessment) {
        await tx.pACUVitalSigns.deleteMany({
          where: { pacuAssessmentId: existingSurgery.pacuAssessment.id },
        });
        await tx.pACURedAlert.deleteMany({
          where: { pacuAssessmentId: existingSurgery.pacuAssessment.id },
        });
        await tx.pACUAssessment.delete({
          where: { id: existingSurgery.pacuAssessment.id },
        });
      }

      if (existingSurgery.surgicalTiming) {
        await tx.surgicalEvent.deleteMany({
          where: { surgicalTimingId: existingSurgery.surgicalTiming.id },
        });
        await tx.surgicalTiming.delete({
          where: { id: existingSurgery.surgicalTiming.id },
        });
      }

      if (existingSurgery.surgicalCount) {
        await tx.surgicalCountEvent.deleteMany({
          where: { countChecklistId: existingSurgery.surgicalCount.id },
        });
        await tx.surgicalCountChecklist.delete({
          where: { id: existingSurgery.surgicalCount.id },
        });
      }

      if (existingSurgery.anesthesiaRecord) {
        await tx.anesthesiaVitalSigns.deleteMany({
          where: { anesthesiaRecordId: existingSurgery.anesthesiaRecord.id },
        });
        await tx.anesthesiaMedicationRecord.deleteMany({
          where: { anesthesiaRecordId: existingSurgery.anesthesiaRecord.id },
        });
        await tx.anesthesiaMonitoringRecord.delete({
          where: { id: existingSurgery.anesthesiaRecord.id },
        });
      }

      if (existingSurgery.intraOperativeRecord) {
        await tx.intraOperativeRecord.delete({
          where: { id: existingSurgery.intraOperativeRecord.id },
        });
      }

      if (existingSurgery.safetyCheck) {
        await tx.preoperativeSafetyCheck.delete({
          where: { id: existingSurgery.safetyCheck.id },
        });
      }

      if (existingSurgery.cancellation) {
        await tx.caseCancellation.delete({
          where: { id: existingSurgery.cancellation.id },
        });
      }

      // Delete other related records
      await tx.surgeryItem.deleteMany({ where: { surgeryId: id } });
      await tx.surgicalTeamMember.deleteMany({ where: { surgeryId: id } });
      await tx.wHOChecklist.deleteMany({ where: { surgeryId: id } });
      await tx.patientMovement.deleteMany({ where: { surgeryId: id } });
      await tx.consumableConsumption.deleteMany({ where: { surgeryId: id } });
      await tx.preOperativeAnestheticReview.deleteMany({ where: { surgeryId: id } });
      await tx.anestheticPrescription.deleteMany({ where: { surgeryId: id } });
      await tx.bloodRequest.deleteMany({ where: { surgeryId: id } });
      await tx.emergencySurgeryAlert.deleteMany({ where: { surgeryId: id } });
      await tx.preoperativeInvestigation.deleteMany({ where: { surgeryId: id } });
      await tx.cssdUsageHistory.deleteMany({ where: { surgeryId: id } });
      await tx.oxygenAlert.deleteMany({ where: { activeSurgeryId: id } });
      await tx.patientTransportLog.deleteMany({ where: { surgeryId: id } });

      // Finally delete the surgery
      await tx.surgery.delete({ where: { id } });

      // Log the deletion
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'DELETE',
          tableName: 'surgeries',
          recordId: id,
          changes: JSON.stringify({ deletedSurgery: existingSurgery.procedureName }),
        },
      });
    });

    return NextResponse.json({ message: 'Surgery deleted successfully' });
  } catch (error) {
    console.error('Error deleting surgery:', error);
    return NextResponse.json({ error: 'Failed to delete surgery' }, { status: 500 });
  }
}
