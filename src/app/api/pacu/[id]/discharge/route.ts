import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// POST - Discharge patient from PACU
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only recovery room nurses can discharge patients
    if (session.user.role !== 'RECOVERY_ROOM_NURSE' && 
        session.user.role !== 'ADMIN' &&
        session.user.role !== 'THEATRE_MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { dischargedTo, dischargeNotes, wardNurseHandover } = body;

    // Get assessment
    const assessment = await prisma.pACUAssessment.findUnique({
      where: { id: params.id },
      include: {
        patient: true,
        surgery: true
      }
    });

    if (!assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    // Check discharge criteria
    const dischargeCriteriaMet = 
      assessment.dischargeVitalsStable &&
      assessment.dischargePainControlled &&
      assessment.dischargeFullyConscious &&
      !assessment.redAlertTriggered;

    if (!dischargeCriteriaMet) {
      return NextResponse.json(
        { error: 'Cannot discharge - discharge criteria not met or red alert active' },
        { status: 400 }
      );
    }

    // Calculate time in PACU
    const admissionTime = new Date(assessment.admissionTime);
    const dischargeTime = new Date();
    const totalTimeInPACU = Math.round((dischargeTime.getTime() - admissionTime.getTime()) / 60000); // minutes

    // Update assessment
    const updated = await prisma.pACUAssessment.update({
      where: { id: params.id },
      data: {
        dischargeReadiness: 'DISCHARGED_TO_WARD',
        dischargeTime,
        dischargedTo,
        dischargeNotes,
        wardNurseHandover,
        totalTimeInPACU
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

    // Update surgery status to completed if not already
    await prisma.surgery.update({
      where: { id: assessment.surgeryId },
      data: {
        status: 'COMPLETED',
        completedAt: dischargeTime
      }
    });

    // Create notification for ward nurse if specified
    if (wardNurseHandover) {
      await prisma.systemNotification.create({
        data: {
          userId: wardNurseHandover,
          type: 'SYSTEM_ALERT',
          title: 'Patient Discharged from PACU',
          message: `Patient ${assessment.patient.name} discharged from PACU to ${dischargedTo}. Total PACU time: ${totalTimeInPACU} minutes.`,
          priority: 'MEDIUM',
          actionUrl: `/dashboard/pacu/${params.id}`
        }
      });
    }

    return NextResponse.json({
      assessment: updated,
      message: 'Patient discharged from PACU successfully'
    });

  } catch (error) {
    console.error('Error discharging patient from PACU:', error);
    return NextResponse.json(
      { error: 'Failed to discharge patient' },
      { status: 500 }
    );
  }
}
