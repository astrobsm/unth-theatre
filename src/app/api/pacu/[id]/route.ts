import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET - Get specific PACU assessment
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const assessment = await prisma.pACUAssessment.findUnique({
      where: { id: params.id },
      include: {
        patient: true,
        surgery: {
          include: {
            surgeon: true,
            anesthetist: true
          }
        },
        vitalSigns: {
          orderBy: {
            recordedAt: 'desc'
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
    console.error('Error fetching PACU assessment:', error);
    return NextResponse.json(
      { error: 'Failed to fetch assessment' },
      { status: 500 }
    );
  }
}

// PUT - Update PACU assessment
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only recovery room nurses can update
    if (session.user.role !== 'RECOVERY_ROOM_NURSE' && 
        session.user.role !== 'ADMIN' &&
        session.user.role !== 'THEATRE_MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    // Check for conditions requiring red alert
    const shouldTriggerAlert = 
      body.consciousnessLevel === 'UNRESPONSIVE' ||
      body.airwayStatus === 'COMPROMISED' ||
      (body.painScore && body.painScore > 8) ||
      body.complicationsDetected === true;

    const updateData: any = { ...body };

    if (shouldTriggerAlert && !body.redAlertTriggered) {
      updateData.complicationsDetected = true;
    }

    const assessment = await prisma.pACUAssessment.update({
      where: { id: params.id },
      data: updateData,
      include: {
        patient: true,
        surgery: {
          include: {
            surgeon: true,
            anesthetist: true
          }
        },
        vitalSigns: {
          orderBy: {
            recordedAt: 'desc'
          },
          take: 10
        },
        redAlerts: true
      }
    });

    return NextResponse.json(assessment);
  } catch (error) {
    console.error('Error updating PACU assessment:', error);
    return NextResponse.json(
      { error: 'Failed to update assessment' },
      { status: 500 }
    );
  }
}
