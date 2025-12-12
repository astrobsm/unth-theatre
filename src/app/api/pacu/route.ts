import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

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
