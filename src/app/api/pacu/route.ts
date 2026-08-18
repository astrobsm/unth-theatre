import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { pushToUsers } from '@/lib/pushAll';

export const dynamic = 'force-dynamic';

// GET - Get all PACU assessments
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const active = searchParams.get('active') === 'true';
    const dischargeReadiness = searchParams.get('dischargeReadiness');

    const where: any = {};
    
    if (active) {
      where.dischargeReadiness = {
        in: ['NOT_READY', 'READY_WITH_CONCERNS']
      };
    }

    if (dischargeReadiness) {
      where.dischargeReadiness = dischargeReadiness;
    }

    const assessments = await prisma.pACUAssessment.findMany({
      where,
      include: {
        patient: {
          select: {
            id: true,
            folderNumber: true,
            name: true,
            age: true,
            gender: true,
            ward: true
          }
        },
        surgery: {
          select: {
            id: true,
            procedureName: true,
            surgeonId: true,
            anesthetistId: true,
            surgeon: {
              select: {
                fullName: true,
                email: true
              }
            },
            anesthetist: {
              select: {
                fullName: true,
                email: true
              }
            }
          }
        },
        vitalSigns: {
          orderBy: {
            recordedAt: 'desc'
          },
          take: 5
        },
        redAlerts: {
          where: {
            resolved: false
          },
          orderBy: {
            triggeredAt: 'desc'
          }
        }
      },
      orderBy: {
        admissionTime: 'desc'
      }
    });

    return NextResponse.json(assessments);
  } catch (error) {
    console.error('Error fetching PACU assessments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch assessments' },
      { status: 500 }
    );
  }
}

// POST - Create new PACU assessment
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only recovery room nurses can create assessments
    if (session.user.role !== 'RECOVERY_ROOM_NURSE' && 
        session.user.role !== 'ADMIN' &&
        session.user.role !== 'THEATRE_MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    console.log('PACU POST request body:', JSON.stringify(body, null, 2));
    
    const { surgeryId, patientId, consciousnessLevel, airwayStatus } = body;

    // Check if assessment already exists
    const existing = await prisma.pACUAssessment.findUnique({
      where: { surgeryId }
    });

    if (existing) {
      return NextResponse.json(
        { error: 'PACU assessment already exists for this surgery' },
        { status: 400 }
      );
    }

    // Create initial assessment with only valid fields
    const assessmentData: any = {
      surgery: {
        connect: { id: surgeryId }
      },
      patient: {
        connect: { id: patientId }
      },
      receivedBy: session.user.id,
      consciousnessLevel,
      airwayStatus,
      dischargeReadiness: 'NOT_READY'
    };

    // Add optional fields if provided
    if (body.handoverFrom) assessmentData.handoverFrom = body.handoverFrom;
    if (body.breathingPattern) assessmentData.breathingPattern = body.breathingPattern;
    if (body.oxygenTherapy !== undefined) assessmentData.oxygenTherapy = body.oxygenTherapy;
    if (body.oxygenFlowRate) assessmentData.oxygenFlowRate = body.oxygenFlowRate;
    if (body.heartRateOnAdmission) assessmentData.heartRateOnAdmission = body.heartRateOnAdmission;
    if (body.bloodPressureOnAdmission) assessmentData.bloodPressureOnAdmission = body.bloodPressureOnAdmission;
    if (body.painScoreOnAdmission) assessmentData.painScoreOnAdmission = body.painScoreOnAdmission;
    if (body.temperatureOnAdmission) assessmentData.temperatureOnAdmission = body.temperatureOnAdmission;
    if (body.surgicalSiteCondition) assessmentData.surgicalSiteCondition = body.surgicalSiteCondition;
    if (body.dressingIntact !== undefined) assessmentData.dressingIntact = body.dressingIntact;
    if (body.drainsPresent !== undefined) assessmentData.drainsPresent = body.drainsPresent;
    if (body.ivFluidsRunning !== undefined) assessmentData.ivFluidsRunning = body.ivFluidsRunning;
    if (body.catheterInSitu !== undefined) assessmentData.catheterInSitu = body.catheterInSitu;
    if (body.nauseaPresent !== undefined) assessmentData.nauseaPresent = body.nauseaPresent;
    if (body.vomitingOccurred !== undefined) assessmentData.vomitingOccurred = body.vomitingOccurred;
    // Intra-operative handover summary (JSON string) captured at admission.
    if (body.intraOpSummary) assessmentData.intraOpSummary = body.intraOpSummary;

    console.log('Creating PACU assessment with data:', JSON.stringify(assessmentData, null, 2));

    const assessment = await prisma.pACUAssessment.create({
      data: assessmentData,
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
        }
      }
    });

    await prisma.patientMovement.create({
      data: {
        surgeryId,
        phase: 'RECOVERY_ROOM',
        recordedBy: session.user.id,
        notes: 'Admitted into recovery room (PACU) after initial assessment',
      }
    });

    // ── Receiving the patient IS the end of the case ────────────────────────
    // A patient in recovery has plainly finished surgery, and requiring
    // somebody to say so separately means the case sits open until whoever
    // left the theatre remembers. The recovery nurse is the person actually
    // present, so admission closes the case — and the surgeon and the scrub
    // nurse who managed it are told, because they are the two people who would
    // otherwise discover it from a list.
    const surgery = await prisma.surgery.findUnique({
      where: { id: surgeryId },
      select: {
        id: true, status: true, procedureName: true, actualStartTime: true,
        surgeonId: true, scrubNurseId: true,
        patient: { select: { name: true, folderNumber: true } },
      },
    });

    if (surgery && !['COMPLETED', 'CANCELLED'].includes(String(surgery.status).toUpperCase())) {
      const now = new Date();
      await prisma.surgery.update({
        where: { id: surgeryId },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          actualEndTime: now,
          surgeryEndTime: now,
          // Where the start was never captured, fall back to now so the timing
          // stays internally consistent rather than negative.
          actualStartTime: surgery.actualStartTime ?? now,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'UPDATE',
          tableName: 'surgeries',
          recordId: surgeryId,
          changes: JSON.stringify({
            status: { from: surgery.status, to: 'COMPLETED' },
            completedAt: now,
            // How it was closed matters as much as when: this was inferred
            // from a recovery admission rather than asserted by the theatre.
            closedBy: { userId: session.user.id, role: (session.user as { role?: string }).role },
            trigger: 'PACU_ADMISSION',
          }),
        },
      }).catch(() => {});

      const tell = [surgery.surgeonId, surgery.scrubNurseId].filter((x): x is string => !!x);
      if (tell.length) {
        const who = surgery.patient?.name ?? 'The patient';
        await pushToUsers(tell, {
          title: 'Case completed — patient in recovery',
          body: `${who}${surgery.patient?.folderNumber ? ` (${surgery.patient.folderNumber})` : ''} `
            + `has been received in recovery, and ${surgery.procedureName} is now marked completed.`,
          url: `/dashboard/surgeries/${surgeryId}`,
        }).catch(() => {
          // A failed notification must not undo the admission or the closure,
          // both of which are already written.
        });
      }
    }

    console.log('PACU assessment created successfully:', assessment.id);

    return NextResponse.json(assessment, { status: 201 });
  } catch (error: any) {
    console.error('Error creating PACU assessment:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { error: 'Failed to create assessment', details: error.message },
      { status: 500 }
    );
  }
}
