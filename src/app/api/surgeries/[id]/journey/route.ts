import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const iso = (d?: Date | null) => (d ? d.toISOString() : undefined);

// GET - the patient's journey from ward → theatre → back to ward for a surgery
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const surgery = await prisma.surgery.findUnique({
      where: { id: params.id },
      include: {
        patient: {
          select: {
            name: true,
            folderNumber: true,
            ptNumber: true,
            age: true,
            gender: true,
            ward: true,
          },
        },
        surgeon: { select: { fullName: true } },
        anesthetist: { select: { fullName: true } },
        holdingAreaAssessment: true,
        surgicalTiming: true,
        transportLogs: { orderBy: { startTime: 'asc' } },
        patientCallUps: { orderBy: { invitedAt: 'asc' } },
        pacuAssessment: {
          select: { id: true, admissionTime: true, dischargeTime: true, dischargedTo: true },
        },
      },
    });

    if (!surgery) {
      return NextResponse.json({ error: 'Surgery not found' }, { status: 404 });
    }

    const ha = surgery.holdingAreaAssessment;
    const timing = surgery.surgicalTiming;
    const callUp = surgery.patientCallUps?.[0];
    const pacu = surgery.pacuAssessment;

    // Movement phase log (ward → theatre → ward)
    const movements = await prisma.patientMovement.findMany({
      where: { surgeryId: surgery.id },
      orderBy: { timestamp: 'asc' },
    });

    // Resolve recordedBy IDs to names
    const idSet = new Set<string>();
    movements.forEach((m) => {
      if (m.recordedBy && /^[0-9a-fA-F-]{16,}$/.test(m.recordedBy)) idSet.add(m.recordedBy);
    });
    if (ha?.receivedBy && /^[0-9a-fA-F-]{16,}$/.test(ha.receivedBy)) idSet.add(ha.receivedBy);

    let userMap: Record<string, string> = {};
    if (idSet.size > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: Array.from(idSet) } },
        select: { id: true, fullName: true },
      });
      userMap = Object.fromEntries(users.map((u) => [u.id, u.fullName]));
    }
    const nameOf = (v?: string | null) => (v ? userMap[v] || v : undefined);

    const PHASE_LABELS: Record<string, string> = {
      WARD: 'On the ward',
      PORTER_DISPATCHED: 'Porter dispatched to ward',
      HOLDING_AREA: 'Holding area',
      INSIDE_THEATRE: 'Inside theatre',
      SURGERY_STARTED: 'Surgery started',
      SURGERY_ENDED: 'Surgery ended',
      RECOVERY_ROOM: 'Recovery room (PACU)',
      RETURNED_TO_WARD: 'Returned to ward',
    };

    const movementLog = movements.map((m) => ({
      phase: m.phase,
      label: PHASE_LABELS[m.phase] || m.phase,
      time: iso(m.timestamp),
      recordedBy: nameOf(m.recordedBy),
      notes: m.notes || undefined,
    }));

    // Detailed chronological timeline (ward → theatre → recovery → ward)
    const timeline: Array<{ stage: string; label: string; time?: string }> = [
      { stage: 'Ward', label: 'Patient sent for / invited', time: iso(callUp?.invitedAt) },
      { stage: 'Ward', label: 'Porter arrived at ward', time: iso(callUp?.theatrePorterArrivedAtWardTime) },
      { stage: 'Ward', label: 'Patient departed ward', time: iso(callUp?.theatrePorterDepartedWardTime) },
      { stage: 'Transit', label: 'En route to theatre', time: iso(callUp?.patientEnRouteAt) },
      { stage: 'Holding', label: 'Arrived at holding area', time: iso(ha?.arrivalTime) },
      { stage: 'Holding', label: 'Cleared for theatre', time: iso(ha?.clearanceTime) },
      { stage: 'Holding', label: 'Transferred to operating room', time: iso(ha?.transferTime) },
      { stage: 'Theatre', label: 'Entered operating room', time: iso(timing?.patientEnteredRoomTime) },
      { stage: 'Theatre', label: 'Anaesthesia started', time: iso(timing?.anesthesiaStartTime) },
      { stage: 'Theatre', label: 'Surgical timeout completed', time: iso(timing?.timeoutCompletedTime) },
      { stage: 'Theatre', label: 'Knife to skin (incision)', time: iso(timing?.incisionTime || surgery.knifeOnSkinTime) },
      { stage: 'Theatre', label: 'Procedure ended', time: iso(timing?.procedureEndTime || surgery.surgeryEndTime) },
      { stage: 'Theatre', label: 'Wound closure completed', time: iso(timing?.closureEndTime) },
      { stage: 'Theatre', label: 'Patient extubated', time: iso(timing?.patientExtubatedTime) },
      { stage: 'Theatre', label: 'Patient left operating room', time: iso(timing?.patientLeftRoomTime) },
      { stage: 'Recovery', label: 'Admitted to recovery (PACU)', time: iso(pacu?.admissionTime) },
      { stage: 'Recovery', label: 'Discharged from recovery', time: iso(pacu?.dischargeTime) },
    ].filter((t) => t.time);

    // Transport legs (ward → theatre, theatre → ward, etc.)
    const transport = (surgery.transportLogs || []).map((t) => ({
      fromLocation: t.fromLocation,
      toLocation: t.toLocation,
      transportType: t.transportType || undefined,
      porterName: t.porterName,
      startTime: iso(t.startTime),
      endTime: iso(t.endTime),
      receivedBy: t.receivedBy || undefined,
    }));

    return NextResponse.json({
      surgery: {
        id: surgery.id,
        procedureName: surgery.procedureName,
        unit: surgery.unit,
        status: surgery.status,
        scheduledDate: iso(surgery.scheduledDate),
        scheduledTime: surgery.scheduledTime,
        surgeonName: surgery.surgeonName || surgery.surgeon?.fullName || undefined,
        anesthetistName: surgery.anesthetist?.fullName || undefined,
      },
      patient: {
        name: surgery.patient?.name,
        folderNumber: surgery.patient?.folderNumber,
        ptNumber: surgery.patient?.ptNumber,
        age: surgery.patient?.age,
        gender: surgery.patient?.gender,
        ward: surgery.patient?.ward,
      },
      pacuAssessmentId: pacu?.id || null,
      dischargedTo: pacu?.dischargedTo || undefined,
      movements: movementLog,
      timeline,
      transport,
      callUp: callUp
        ? {
            ward: callUp.ward || undefined,
            theatreName: callUp.theatreName || undefined,
            assignedPorterName: callUp.assignedPorterName || undefined,
            assignedNurseName: callUp.assignedNurseName || undefined,
            wardNurseName: callUp.wardNurseName || undefined,
            wardEntriesNotes: callUp.wardEntriesNotes || undefined,
          }
        : undefined,
      holdingArea: ha
        ? { arrivalTime: iso(ha.arrivalTime), receivedBy: nameOf(ha.receivedBy), status: String(ha.status) }
        : undefined,
    });
  } catch (error) {
    console.error('Error building patient journey:', error);
    return NextResponse.json({ error: 'Failed to build patient journey' }, { status: 500 });
  }
}
