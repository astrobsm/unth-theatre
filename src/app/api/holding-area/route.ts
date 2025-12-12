import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET - Get all holding area assessments (with filters)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const active = searchParams.get('active') === 'true';

    const where: any = {};
    
    if (status) {
      where.status = status;
    }

    if (active) {
      where.status = {
        in: ['ARRIVED', 'VERIFICATION_IN_PROGRESS', 'DISCREPANCY_FOUND', 'RED_ALERT_ACTIVE']
      };
    }

    const assessments = await prisma.holdingAreaAssessment.findMany({
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
            scheduledDate: true,
            scheduledTime: true,
            surgeonId: true,
            surgeon: {
              select: {
                fullName: true,
                email: true
              }
            }
          }
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
        arrivalTime: 'desc'
      }
    });

    return NextResponse.json(assessments);
  } catch (error) {
    console.error('Error fetching holding area assessments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch assessments' },
      { status: 500 }
    );
  }
}

// POST - Create new holding area assessment
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only authorized staff can create assessments
    if (session.user.role !== 'HOLDING_AREA_NURSE' && 
        session.user.role !== 'SCRUB_NURSE' &&
        session.user.role !== 'CIRCULATING_NURSE' &&
        session.user.role !== 'NURSE_ANAESTHETIST' &&
        session.user.role !== 'ADMIN' &&
        session.user.role !== 'THEATRE_MANAGER' &&
        session.user.role !== 'THEATRE_COORDINATOR') {
      return NextResponse.json({ error: 'Forbidden - Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { surgeryId, patientId } = body;

    // Check if assessment already exists for this surgery
    const existing = await prisma.holdingAreaAssessment.findUnique({
      where: { surgeryId }
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Assessment already exists for this surgery' },
        { status: 400 }
      );
    }

    // Create assessment with proper relations and initialize status
    const assessment = await prisma.holdingAreaAssessment.create({
      data: {
        surgery: {
          connect: { id: surgeryId }
        },
        patient: {
          connect: { id: patientId }
        },
        receivedBy: session.user.id,
        status: 'ARRIVED',
        // Initialize all safety checks to false
        patientIdentityConfirmed: false,
        surgicalSiteMarked: false,
        surgicalSiteConfirmed: false,
        procedureConfirmed: false,
        consentFormPresent: false,
        consentFormSigned: false,
        consentUnderstandingConfirmed: false,
        allergyStatusChecked: false,
        hasAllergies: false,
        fastingStatusChecked: false,
        fastingCompliant: false,
        vitalSignsNormal: false,
        preOpAssessmentPresent: false,
        labResultsPresent: false,
        anesthesiaAssessmentPresent: false,
        medicationChartPresent: false,
        allDocumentationComplete: false,
        preMedicationGiven: false,
        ivAccessEstablished: false,
        discrepancyDetected: false,
        redAlertTriggered: false,
        clearedForTheatre: false
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
            }
          }
        }
      }
    });

    // Update surgery status to indicate patient is in holding area
    await prisma.surgery.update({
      where: { id: surgeryId },
      data: { status: 'IN_HOLDING_AREA' }
    });

    return NextResponse.json(assessment, { status: 201 });
  } catch (error: any) {
    console.error('Error creating holding area assessment:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { error: 'Failed to create assessment', details: error.message },
      { status: 500 }
    );
  }
}
