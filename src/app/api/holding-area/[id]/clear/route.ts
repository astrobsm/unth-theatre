import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// POST - Clear patient for theatre
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only holding area nurses can clear patients
    if (session.user.role !== 'SCRUB_NURSE' && 
        session.user.role !== 'ADMIN' &&
        session.user.role !== 'THEATRE_MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { clearanceNotes, handoverNurse } = body;

    // Get assessment
    const assessment = await prisma.holdingAreaAssessment.findUnique({
      where: { id: params.id },
      include: {
        patient: true,
        surgery: true
      }
    });

    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    // Check if all safety checks are complete
    const allChecksPassed = 
      assessment.patientIdentityConfirmed &&
      assessment.surgicalSiteConfirmed &&
      assessment.procedureConfirmed &&
      assessment.consentFormSigned &&
      assessment.allergyStatusChecked &&
      assessment.fastingStatusChecked &&
      assessment.fastingCompliant &&
      assessment.vitalSignsNormal &&
      assessment.allDocumentationComplete &&
      !assessment.redAlertTriggered;

    if (!allChecksPassed) {
      return NextResponse.json(
        { error: 'Cannot clear patient - safety checks not complete or red alert active' },
        { status: 400 }
      );
    }

    // Update assessment
    const updated = await prisma.holdingAreaAssessment.update({
      where: { id: params.id },
      data: {
        clearedForTheatre: true,
        clearanceTime: new Date(),
        clearanceNotes,
        handoverNurse,
        status: 'CLEARED_FOR_THEATRE'
      },
      include: {
        patient: true,
        surgery: {
          include: {
            surgeon: true
          }
        }
      }
    });

    // Create notification for theatre team
    if (handoverNurse) {
      await prisma.systemNotification.create({
        data: {
          userId: handoverNurse,
          type: 'SURGERY_SCHEDULED',
          title: 'Patient Cleared for Theatre',
          message: `Patient ${assessment.patient.name} cleared from holding area and ready for ${updated.surgery.procedureName}`,
          priority: 'MEDIUM',
          actionUrl: `/dashboard/surgeries/${updated.surgeryId}`
        }
      });
    }

    return NextResponse.json({
      assessment: updated,
      message: 'Patient cleared for theatre successfully'
    });

  } catch (error) {
    console.error('Error clearing patient for theatre:', error);
    return NextResponse.json(
      { error: 'Failed to clear patient' },
      { status: 500 }
    );
  }
}
