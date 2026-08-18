import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { detectConflict } from '@/lib/concurrency';
import { ensureEmergencyBooking } from '@/lib/emergency/ensureBooking';
import { checkSlot } from '@/lib/theatreOps/scheduling';
import { blocksReadyForTheatre } from '@/lib/anaesthesia/fitness';

export const dynamic = 'force-dynamic';

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

    let surgery;
    try {
      surgery = await prisma.surgery.findUnique({
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
    } catch (richError) {
      // If a related table/column is out of sync (e.g. a pending migration in
      // production), the rich query throws. Fall back to a minimal query so the
      // surgery detail page can still load core information instead of erroring.
      console.error('Rich surgery fetch failed, falling back to minimal query:', richError);
      surgery = await prisma.surgery.findUnique({
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
          items: {
            include: {
              item: true,
            },
          },
        },
      });
    }

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
      include: { patient: true },
    });

    if (!existingSurgery) {
      return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });
    }

    // Refuse to overwrite a booking that moved on while this edit sat in an
    // offline queue — the caller is told what the server now holds.
    const conflict = detectConflict(request, existingSurgery, 'surgery');
    if (conflict) return conflict;

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
      location,
      theatreId,
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
      patientWard,
    } = body;

    // ── Double-booking guard, on the path that now does the allocating ──────
    // The theatre is no longer chosen when a case is booked; the theatre
    // manager and the nurses allocate it here, nearer the day. The overlap
    // check used to live only in the booking POST, so moving allocation to
    // this route without moving the check would have left nothing at all
    // preventing two cases being put in one room at one time.
    //
    // Only runs when something that affects the slot actually changes, so an
    // unrelated edit — a remark, a deposit — is never refused for a clash it
    // did not create.
    const nextTheatreId = theatreId !== undefined ? (theatreId || null) : existingSurgery.theatreId;
    const nextTime = scheduledTime || existingSurgery.scheduledTime;
    const nextDate = scheduledDate ? new Date(scheduledDate) : existingSurgery.scheduledDate;
    const slotChanged =
      (theatreId !== undefined && (theatreId || null) !== existingSurgery.theatreId)
      || (!!scheduledTime && scheduledTime !== existingSurgery.scheduledTime)
      || (!!scheduledDate && new Date(scheduledDate).getTime() !== existingSurgery.scheduledDate?.getTime());

    if (slotChanged && nextTheatreId && nextTime && nextDate
        && !['CANCELLED', 'COMPLETED'].includes(String(existingSurgery.status).toUpperCase())) {
      const dayStart = new Date(nextDate); dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(nextDate); dayEnd.setUTCHours(23, 59, 59, 999);

      const sameRoom = await prisma.surgery.findMany({
        where: {
          scheduledDate: { gte: dayStart, lte: dayEnd },
          theatreId: nextTheatreId,
          status: { notIn: ['CANCELLED', 'COMPLETED'] },
          id: { not: id },
        },
        select: { id: true, scheduledTime: true, estimatedDuration: true },
      });

      const verdict = checkSlot({
        scheduledTime: nextTime,
        estimatedDuration: existingSurgery.estimatedDuration || 60,
        existing: sameRoom.map((x) => ({
          id: x.id,
          scheduledTime: x.scheduledTime,
          estimatedDuration: x.estimatedDuration || 60,
        })),
        // Belt and braces: this case is already excluded by the query above,
        // but naming it here means the rule holds if that query ever changes.
        ignoreId: id,
      });

      if (!verdict.ok) {
        return NextResponse.json(
          {
            error: `This theatre: ${verdict.message}`,
            code: verdict.code,
            suggestedStart: verdict.suggestedStart,
          },
          { status: 409 }
        );
      }
    }

    // ── A patient declared unfit does not reach the theatre ─────────────────
    // §19's rule, enforced where READY is actually written rather than only on
    // the screen that offers the button. Checked only when something is trying
    // to move the case TO ready — an unfit case may still be edited, and
    // refusing every edit would push people to work around the flag instead of
    // resolving it.
    if (readinessStatus === 'READY' && existingSurgery.readinessStatus !== 'READY') {
      const review = await prisma.preOperativeAnestheticReview.findFirst({
        where: { surgeryId: id },
        orderBy: { reviewDate: 'desc' },
        select: {
          fitnessDecision: true,
          createdAt: true,
          optimisationRequirements: { select: { status: true, category: true, action: true } },
        },
      });

      // Local anaesthesia needs no anaesthetic review, so a case that never
      // required one is not blocked for lacking it. Anything else with no
      // review at all is blocked: not-recorded is not permission.
      const needsReview = String(existingSurgery.anesthesiaType ?? '').toUpperCase() !== 'LOCAL';
      if (needsReview) {
        const blocked = blocksReadyForTheatre({
          decision: review?.fitnessDecision ?? null,
          requirements: review?.optimisationRequirements ?? [],
          // Grandfathers cases that predate the requirement, so the rule does
          // not first appear as a patient stopped at the theatre door for a
          // form nobody had been asked to fill in. The review's own age where
          // there is one; the booking's where there is not. A recorded NOT_FIT
          // is never excused by this — that branch is reached first.
          recordedAt: review?.createdAt ?? existingSurgery.createdAt,
        });
        if (blocked) {
          return NextResponse.json(
            {
              error: blocked,
              code: 'NOT_FIT_FOR_ANAESTHESIA',
              outstanding: (review?.optimisationRequirements ?? [])
                .filter((r) => r.status !== 'VERIFIED')
                .map((r) => r.action),
            },
            { status: 409 },
          );
        }
      }
    }

    const updateData: any = {};

    if (scheduledDate) updateData.scheduledDate = new Date(scheduledDate);
    if (scheduledTime) updateData.scheduledTime = scheduledTime;
    if (procedureName) updateData.procedureName = procedureName;
    if (subspecialty) updateData.subspecialty = subspecialty;
    if (unit) updateData.unit = unit;
    if (location !== undefined) updateData.location = location || null;
    if (theatreId !== undefined) updateData.theatreId = theatreId || null;
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

    // An existing case upgraded to EMERGENCY must reach the emergency board
    // too. This route is how a deteriorating elective becomes an emergency,
    // and before this it changed the type and told nobody.
    if (updatedSurgery.surgeryType === 'EMERGENCY') {
      await ensureEmergencyBooking(updatedSurgery.id, { fallbackUserId: session.user.id });
    }

    // Patient ward transfer (the patient may move wards after booking).
    let wardChange: { from: any; to: any } | null = null;
    if (
      patientWard !== undefined &&
      existingSurgery.patientId &&
      typeof patientWard === 'string' &&
      patientWard.trim() &&
      patientWard.trim() !== (existingSurgery.patient?.ward || '')
    ) {
      const newWard = patientWard.trim();
      await prisma.patient.update({
        where: { id: existingSurgery.patientId },
        data: { ward: newWard },
      });
      wardChange = { from: existingSurgery.patient?.ward || null, to: newWard };
    }

    // Log the update
    // Detect critical reschedule changes (date, time, location, theatre) and log a dedicated entry
    const reschedule: Record<string, { from: any; to: any }> = {};
    if (scheduledDate && new Date(scheduledDate).toISOString() !== new Date(existingSurgery.scheduledDate).toISOString()) {
      reschedule.scheduledDate = { from: existingSurgery.scheduledDate, to: new Date(scheduledDate) };
    }
    if (scheduledTime && scheduledTime !== existingSurgery.scheduledTime) {
      reschedule.scheduledTime = { from: existingSurgery.scheduledTime, to: scheduledTime };
    }
    if (location !== undefined && (location || null) !== (existingSurgery.location || null)) {
      reschedule.location = { from: existingSurgery.location, to: location || null };
    }
    if (theatreId !== undefined && (theatreId || null) !== (existingSurgery.theatreId || null)) {
      reschedule.theatreId = { from: existingSurgery.theatreId, to: theatreId || null };
    }
    if (wardChange) {
      reschedule.patientWard = wardChange;
    }

    if (Object.keys(reschedule).length > 0) {
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'RESCHEDULE',
          tableName: 'surgeries',
          recordId: id,
          changes: JSON.stringify(reschedule),
        },
      });
    }

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
