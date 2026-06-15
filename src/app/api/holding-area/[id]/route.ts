import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { triggerRadio, speak3 } from '@/lib/radioEvents';

export const dynamic = 'force-dynamic';

// GET - Get specific holding area assessment
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const assessment = await prisma.holdingAreaAssessment.findUnique({
      where: { id: params.id },
      include: {
        patient: true,
        surgery: {
          include: {
            surgeon: {
              select: {
                id: true,
                fullName: true,
                email: true
              }
            },
            anesthetist: {
              select: {
                id: true,
                fullName: true,
                email: true
              }
            }
          }
        },
        redAlerts: {
          orderBy: {
            triggeredAt: 'desc'
          }
        }
      }
    });

    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    return NextResponse.json(assessment);
  } catch (error) {
    console.error('Error fetching holding area assessment:', error);
    return NextResponse.json(
      { error: 'Failed to fetch assessment' },
      { status: 500 }
    );
  }
}

// PUT - Update holding area assessment
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Holding-area nurses and theatre clinical staff can update the assessment
    // (verification, clearance, transfer requests, receiving in theatre).
    const HOLDING_WRITE_ROLES = [
      'SCRUB_NURSE',
      'RECOVERY_ROOM_NURSE',
      'ANAESTHETIST',
      'CONSULTANT_ANAESTHETIST',
      'ANAESTHETIC_TECHNICIAN',
      'THEATRE_MANAGER',
      'ADMIN',
      'SYSTEM_ADMINISTRATOR',
    ];
    if (!HOLDING_WRITE_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const cancelToWard = body.returnToWardCancelled === true;
    const cancelReason = typeof body.cancellationReason === 'string' ? body.cancellationReason.trim() : '';

    // Return-to-ward cancellation from holding area
    if (cancelToWard) {
      if (cancelReason.length < 5) {
        return NextResponse.json(
          { error: 'Cancellation reason (minimum 5 characters) is required' },
          { status: 400 }
        );
      }

      const currentAssessment = await prisma.holdingAreaAssessment.findUnique({
        where: { id: params.id },
        select: { surgeryId: true }
      });

      if (!currentAssessment) {
        return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
      }

      await prisma.surgery.update({
        where: { id: currentAssessment.surgeryId },
        data: {
          status: 'CANCELLED',
          remarks: cancelReason,
        }
      });

      await prisma.patientMovement.create({
        data: {
          surgeryId: currentAssessment.surgeryId,
          phase: 'RETURNED_TO_WARD',
          recordedBy: session.user.id,
          notes: `Returned to ward - case cancelled. Reason: ${cancelReason}`,
        }
      });

      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'HOLDING_AREA_CANCEL_TO_WARD',
          tableName: 'holding_area_assessments',
          recordId: params.id,
          changes: JSON.stringify({ reason: cancelReason }),
        }
      });

      const cancelledAssessment = await prisma.holdingAreaAssessment.update({
        where: { id: params.id },
        data: {
          status: 'DISCREPANCY_FOUND',
          discrepancyDetected: true,
          clearanceNotes: `Returned to ward. ${cancelReason}`,
        },
        include: {
          patient: true,
          surgery: {
            include: {
              surgeon: {
                select: {
                  id: true,
                  fullName: true,
                  email: true
                }
              },
              anesthetist: {
                select: {
                  id: true,
                  fullName: true,
                  email: true
                }
              }
            }
          },
          redAlerts: true
        }
      });

      return NextResponse.json(cancelledAssessment);
    }

    // Request transfer to theatre: holding-area nurse dispatches a cleared patient.
    // Status becomes ENROUTE_TO_THEATRE; the theatre team then "receives" the patient
    // (from the Surgeries page) which flips it to TRANSFERRED_TO_THEATRE.
    if (body.requestTransferToTheatre === true) {
      const current = await prisma.holdingAreaAssessment.findUnique({
        where: { id: params.id },
        select: { surgeryId: true, status: true, clearedForTheatre: true },
      });

      if (!current) {
        return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
      }
      if (!current.clearedForTheatre && current.status !== 'CLEARED_FOR_THEATRE') {
        return NextResponse.json(
          { error: 'Patient must be cleared for theatre before transfer can be requested' },
          { status: 400 }
        );
      }

      await prisma.surgery.update({
        where: { id: current.surgeryId },
        data: { status: 'READY_FOR_THEATRE' },
      });

      await prisma.patientMovement.create({
        data: {
          surgeryId: current.surgeryId,
          phase: 'PORTER_DISPATCHED',
          recordedBy: session.user.id,
          notes: 'Transfer to theatre requested — patient en route from holding area',
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'HOLDING_AREA_ENROUTE_TO_THEATRE',
          tableName: 'holding_area_assessments',
          recordId: params.id,
          changes: JSON.stringify({ status: { from: current.status, to: 'ENROUTE_TO_THEATRE' } }),
        },
      });

      const enrouteAssessment = await prisma.holdingAreaAssessment.update({
        where: { id: params.id },
        data: { status: 'ENROUTE_TO_THEATRE' },
        include: {
          patient: true,
          surgery: {
            include: {
              surgeon: { select: { id: true, fullName: true, email: true } },
              anesthetist: { select: { id: true, fullName: true, email: true } },
            },
          },
          redAlerts: true,
        },
      });

      // Theatre radio: announce the patient is en route (spoken three times).
      try {
        const enrouteMsg = `Patient ${enrouteAssessment.patient.name} is now en route to theatre for ${enrouteAssessment.surgery.procedureName}. Theatre team, please prepare to receive the patient.`;
        await triggerRadio({
          category: 'WORKFLOW',
          title: `En route to theatre — ${enrouteAssessment.patient.name}`,
          message: speak3(enrouteMsg),
          priority: 78,
          urgency: 'MEDIUM',
          triggeredById: session.user.id,
          metadata: { source: 'HoldingArea.enroute', surgeryId: current.surgeryId, kind: 'holding_enroute', tripleRepeat: true },
        });
      } catch (e) {
        console.error('Radio announce (enroute) failed:', e);
      }

      return NextResponse.json(enrouteAssessment);
    }

    // Calculate if all safety checks are complete
    const allChecksComplete = 
      body.patientIdentityConfirmed === true &&
      body.surgicalSiteConfirmed === true &&
      body.consentFormSigned === true &&
      body.allergyStatusChecked === true &&
      body.fastingCompliant === true &&
      body.vitalSignsNormal === true &&
      body.allDocumentationComplete === true &&
      body.ivAccessEstablished === true;

    // Check for discrepancies that should trigger alerts
    const hasDiscrepancies = 
      body.patientIdentityConfirmed === false ||
      body.surgicalSiteConfirmed === false ||
      body.consentFormSigned === false ||
      body.fastingCompliant === false ||
      body.vitalSignsNormal === false ||
      body.allDocumentationComplete === false;

    const updateData: any = { ...body };

    // Auto-update status based on checks
    if (hasDiscrepancies && !body.redAlertTriggered) {
      updateData.discrepancyDetected = true;
      updateData.status = 'DISCREPANCY_FOUND';
    } else if (allChecksComplete && !body.clearedForTheatre) {
      // If all checks pass, mark as verification in progress
      updateData.status = 'VERIFICATION_IN_PROGRESS';
      updateData.discrepancyDetected = false;
    }

    // Manual clearance for theatre
    if (body.clearedForTheatre === true) {
      if (!allChecksComplete) {
        return NextResponse.json(
          { error: 'Cannot clear for theatre - not all safety checks are complete' },
          { status: 400 }
        );
      }
      updateData.status = 'CLEARED_FOR_THEATRE';
      updateData.clearanceTime = new Date();
      
      // Update surgery status
      const currentAssessment = await prisma.holdingAreaAssessment.findUnique({
        where: { id: params.id },
        select: { surgeryId: true }
      });
      
      if (currentAssessment) {
        await prisma.surgery.update({
          where: { id: currentAssessment.surgeryId },
          data: { status: 'READY_FOR_THEATRE' }
        });
      }
    }

    // Transfer to theatre
    if (body.transferredToTheatre === true) {
      updateData.status = 'TRANSFERRED_TO_THEATRE';
      updateData.transferredToTheatre = true;
      updateData.transferTime = new Date();
      
      // Update surgery status
      const currentAssessment = await prisma.holdingAreaAssessment.findUnique({
        where: { id: params.id },
        select: { surgeryId: true }
      });
      
      if (currentAssessment) {
        await prisma.surgery.update({
          where: { id: currentAssessment.surgeryId },
          data: { status: 'IN_PROGRESS' }
        });

        await prisma.patientMovement.create({
          data: {
            surgeryId: currentAssessment.surgeryId,
            phase: 'INSIDE_THEATRE',
            recordedBy: session.user.id,
            notes: 'Transferred from holding area to operating theatre',
          }
        });
      }
    }

    const assessment = await prisma.holdingAreaAssessment.update({
      where: { id: params.id },
      data: updateData,
      include: {
        patient: true,
        surgery: {
          include: {
            surgeon: {
              select: {
                id: true,
                fullName: true,
                email: true
              }
            },
            anesthetist: {
              select: {
                id: true,
                fullName: true,
                email: true
              }
            }
          }
        },
        redAlerts: true
      }
    });

    return NextResponse.json(assessment);
  } catch (error) {
    console.error('Error updating holding area assessment:', error);
    return NextResponse.json(
      { error: 'Failed to update assessment' },
      { status: 500 }
    );
  }
}

// DELETE - Delete holding area assessment (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN' && session.user.role !== 'THEATRE_MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.holdingAreaAssessment.delete({
      where: { id: params.id }
    });

    return NextResponse.json({ message: 'Assessment deleted successfully' });
  } catch (error) {
    console.error('Error deleting holding area assessment:', error);
    return NextResponse.json(
      { error: 'Failed to delete assessment' },
      { status: 500 }
    );
  }
}
