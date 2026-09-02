import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { stableForDischarge, stabilisationNoteProblem } from '@/lib/pacu/vitals';

export const dynamic = 'force-dynamic';

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
    const {
      dischargedTo,
      dischargeNotes,
      dischargeInstructions,
      wardNurseHandover,
      dischargeVitalsStable,
      dischargePainControlled,
      dischargeNauseaControlled,
      dischargeFullyConscious,
      dischargeAbleToMobilize,
      dischargeNoActiveBleedingOrOozing,
      // How the patient was stabilised, required only when a red alert was
      // raised earlier in this recovery.
      stabilisationNote,
    } = body;

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

    // Honour the criteria the nurse just confirmed in the discharge form. Fall
    // back to whatever was previously persisted on the assessment if a flag was
    // not supplied in the request.
    const vitalsStable = dischargeVitalsStable ?? assessment.dischargeVitalsStable;
    const painControlled = dischargePainControlled ?? assessment.dischargePainControlled;
    const fullyConscious = dischargeFullyConscious ?? assessment.dischargeFullyConscious;
    const nauseaFree = dischargeNauseaControlled ?? assessment.dischargeNauseaFree;
    const ableToMobilize = dischargeAbleToMobilize ?? assessment.dischargeAbleToMobilize;
    const noActiveBleeding = dischargeNoActiveBleedingOrOozing ?? assessment.dischargeNoActiveBleedingOrOozing;

    // The nurse's own confirmations still stand on their own.
    if (!(vitalsStable && painControlled && fullyConscious)) {
      return NextResponse.json(
        { error: 'Cannot discharge - the discharge criteria have not all been confirmed.' },
        { status: 400 }
      );
    }

    // A RED ALERT NO LONGER BLOCKS DISCHARGE FOR EVER.
    //
    // redAlertTriggered is a latch: abnormal observations set it and nothing
    // ever cleared it, so one low saturation at 09:05 blocked discharge at
    // 14:00 with the patient awake and stable. The recovery nurse had no way
    // out of it at all.
    //
    // It is not simply ignored either. Discharging over an alert requires
    // positive evidence: the MOST RECENT observations must be within range,
    // and the nurse must say how the patient was stabilised. That explanation
    // is stored on the assessment and travels to the ward.
    let resolvedAlert: { note: string; vitalsId: string } | null = null;

    if (assessment.redAlertTriggered) {
      const latest = await prisma.pACUVitalSigns.findFirst({
        where: { pacuAssessmentId: params.id },
        orderBy: { recordedAt: 'desc' },
      });

      const verdict = stableForDischarge(latest);
      if (!verdict.stable) {
        return NextResponse.json(
          {
            error: 'Cannot discharge - this patient is not yet stable.',
            reasons: verdict.reasons,
            redAlert: assessment.redAlertDescription,
          },
          { status: 400 }
        );
      }

      const noteProblem = stabilisationNoteProblem(stabilisationNote);
      if (noteProblem) {
        return NextResponse.json(
          { error: noteProblem, requiresStabilisationNote: true, redAlert: assessment.redAlertDescription },
          { status: 400 }
        );
      }

      resolvedAlert = { note: String(stabilisationNote).trim(), vitalsId: latest!.id };
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
        dischargeNotes: dischargeNotes ?? dischargeInstructions,
        wardNurseHandover,
        totalTimeInPACU,
        dischargeVitalsStable: vitalsStable,
        dischargePainControlled: painControlled,
        dischargeFullyConscious: fullyConscious,
        dischargeNauseaFree: nauseaFree,
        dischargeAbleToMobilize: ableToMobilize,
        dischargeNoActiveBleedingOrOozing: noActiveBleeding,
        // Close the alert rather than erase it: redAlertType, redAlertDescription
        // and redAlertTime stay, and the PACURedAlert rows are untouched, so the
        // ward can still see that it happened and what it was.
        ...(resolvedAlert
          ? {
              redAlertTriggered: false,
              redAlertResolvedBy: session.user.id,
              redAlertResolvedAt: new Date(),
              dischargeNotes: [
                dischargeNotes ?? dischargeInstructions,
                `Stabilised before discharge: ${resolvedAlert.note}`,
              ].filter(Boolean).join('\n\n'),
            }
          : {}),
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

    await prisma.patientMovement.create({
      data: {
        surgeryId: assessment.surgeryId,
        phase: 'RETURNED_TO_WARD',
        recordedBy: session.user.id,
        notes: `Discharged from PACU to ${dischargedTo || 'WARD'}`,
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
