import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const iso = (d?: Date | null) => (d ? d.toISOString() : undefined);
const num = (d?: any) => (d === null || d === undefined ? undefined : Number(d));

// GET - Fetch the complete perioperative patient record for PDF generation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Fetch PACU assessment with the full surgery journey
    const pacu = await prisma.pACUAssessment.findUnique({
      where: { id },
      include: {
        patient: true,
        surgery: {
          include: {
            surgeon: { select: { fullName: true } },
            anesthetist: { select: { fullName: true } },
            teamMembers: true,
            holdingAreaAssessment: true,
            surgicalTiming: { include: { events: { orderBy: { eventTime: 'asc' } } } },
            transportLogs: { orderBy: { startTime: 'asc' } },
            patientCallUps: { orderBy: { invitedAt: 'asc' } },
            postOpPrescriptions: { orderBy: { createdAt: 'asc' } },
            intraOperativeRecord: true,
            anesthesiaRecord: {
              include: {
                medicationRecords: { orderBy: { administeredAt: 'asc' } },
                vitalSignsRecords: { orderBy: { recordedAt: 'asc' } },
              },
            },
          },
        },
        vitalSigns: { orderBy: { recordedAt: 'asc' } },
        redAlerts: { orderBy: { triggeredAt: 'desc' } },
      },
    });

    if (!pacu) {
      return NextResponse.json({ error: 'PACU assessment not found' }, { status: 404 });
    }

    const surgery = pacu.surgery;
    const ha = surgery.holdingAreaAssessment;
    const timing = surgery.surgicalTiming;
    const intraOp = surgery.intraOperativeRecord;
    const anes = surgery.anesthesiaRecord;
    const callUp = surgery.patientCallUps?.[0];

    // ── Resolve staff IDs to names in a single lookup ──────────────────────
    const idSet = new Set<string>();
    [
      ha?.receivedBy,
      intraOp?.primarySurgeonId,
      intraOp?.anesthetistId,
      intraOp?.nurseAnesthetistId,
      intraOp?.scrubNurseId,
      intraOp?.circulatingNurseId,
      intraOp?.createdBy,
      pacu.receivedBy,
      pacu.handoverFrom,
      ...(surgery.teamMembers || []).map((t) => t.userId || undefined),
    ].forEach((v) => {
      if (v && /^[0-9a-fA-F-]{16,}$/.test(v)) idSet.add(v);
    });

    let userMap: Record<string, string> = {};
    if (idSet.size > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: Array.from(idSet) } },
        select: { id: true, fullName: true },
      });
      userMap = Object.fromEntries(users.map((u) => [u.id, u.fullName]));
    }
    const nameOf = (v?: string | null) => (v ? userMap[v] || v : undefined);

    // ── Build a chronological perioperative timeline ───────────────────────
    const timeline: Array<{ label: string; time?: string }> = [
      { label: 'Patient sent for / invited', time: iso(callUp?.invitedAt) },
      { label: 'Porter arrived at ward', time: iso(callUp?.theatrePorterArrivedAtWardTime) },
      { label: 'Patient departed ward', time: iso(callUp?.theatrePorterDepartedWardTime) },
      { label: 'Patient en route to theatre', time: iso(callUp?.patientEnRouteAt) },
      { label: 'Arrived at holding area', time: iso(ha?.arrivalTime) },
      { label: 'Cleared for theatre', time: iso(ha?.clearanceTime) },
      { label: 'Transferred to operating room', time: iso(ha?.transferTime) },
      { label: 'Entered operating room', time: iso(timing?.patientEnteredRoomTime) },
      { label: 'Anaesthesia started', time: iso(timing?.anesthesiaStartTime || anes?.inductionTime || intraOp?.anesthesiaStart) },
      { label: 'Surgical timeout completed', time: iso(timing?.timeoutCompletedTime || intraOp?.timeOut) },
      { label: 'Knife to skin (incision)', time: iso(timing?.incisionTime || intraOp?.knifeToSkinTime || surgery.knifeOnSkinTime) },
      { label: 'Procedure ended', time: iso(timing?.procedureEndTime || intraOp?.procedureEndTime || surgery.surgeryEndTime) },
      { label: 'Wound closure completed', time: iso(timing?.closureEndTime || intraOp?.closureEndTime) },
      { label: 'Patient extubated', time: iso(timing?.patientExtubatedTime || anes?.extubationTime) },
      { label: 'Patient left operating room', time: iso(timing?.patientLeftRoomTime) },
      { label: 'Admitted to recovery (PACU)', time: iso(pacu.admissionTime) },
      { label: 'Discharged from recovery', time: iso(pacu.dischargeTime) },
    ].filter((t) => t.time);

    // ── Surgical team ──────────────────────────────────────────────────────
    const team: Array<{ role: string; name: string }> = [];
    if (surgery.surgeonName || surgery.surgeon?.fullName)
      team.push({ role: 'Primary Surgeon', name: surgery.surgeonName || surgery.surgeon!.fullName });
    if (surgery.anesthetist?.fullName)
      team.push({ role: 'Anaesthetist', name: surgery.anesthetist.fullName });
    if (intraOp?.scrubNurseId) team.push({ role: 'Scrub Nurse', name: nameOf(intraOp.scrubNurseId)! });
    if (intraOp?.circulatingNurseId)
      team.push({ role: 'Circulating Nurse', name: nameOf(intraOp.circulatingNurseId)! });
    (surgery.teamMembers || []).forEach((m) => {
      const nm = m.memberName || nameOf(m.userId || undefined);
      if (nm) team.push({ role: String(m.role).replace(/_/g, ' '), name: nm });
    });

    const data = {
      patient: {
        name: pacu.patient.name,
        folderNumber: pacu.patient.folderNumber,
        age: pacu.patient.age,
        gender: pacu.patient.gender,
        ward: pacu.patient.ward,
        diagnosis: callUp?.diagnosis || surgery.indication || undefined,
      },
      surgery: {
        procedureName: surgery.procedureName,
        indication: surgery.indication,
        unit: surgery.unit,
        location: surgery.location || undefined,
        scheduledDate: iso(surgery.scheduledDate)!,
        scheduledTime: surgery.scheduledTime,
        surgeryType: String(surgery.surgeryType),
        anesthesiaType: surgery.anesthesiaType ? String(surgery.anesthesiaType) : undefined,
        surgeonName: surgery.surgeonName || surgery.surgeon?.fullName || undefined,
        anesthetistName: surgery.anesthetist?.fullName || undefined,
        actualStartTime: iso(surgery.actualStartTime),
        actualEndTime: iso(surgery.actualEndTime),
      },
      timeline,
      team,
      callUp: callUp
        ? {
            assignedNurseName: callUp.assignedNurseName || undefined,
            assignedPorterName: callUp.assignedPorterName || undefined,
            wardNurseName: callUp.wardNurseName || undefined,
            wardEntriesNotes: callUp.wardEntriesNotes || undefined,
          }
        : undefined,
      transport: (surgery.transportLogs || []).map((t) => ({
        fromLocation: t.fromLocation,
        toLocation: t.toLocation,
        transportType: t.transportType || undefined,
        porterName: t.porterName,
        startTime: iso(t.startTime),
        endTime: iso(t.endTime),
        receivedBy: t.receivedBy || undefined,
      })),
      holdingArea: ha
        ? {
            arrivalTime: iso(ha.arrivalTime),
            receivedBy: nameOf(ha.receivedBy),
            status: String(ha.status),
            vitals: {
              pulseRate: ha.pulseRate ?? ha.heartRate ?? undefined,
              respiratoryRate: ha.respiratoryRate ?? undefined,
              bloodPressure:
                ha.bloodPressure ||
                (ha.bloodPressureSystolic && ha.bloodPressureDiastolic
                  ? `${ha.bloodPressureSystolic}/${ha.bloodPressureDiastolic}`
                  : undefined),
              spo2: ha.spo2 ?? ha.oxygenSaturation ?? undefined,
              temperature: num(ha.temperature),
              weight: num(ha.weight),
              gcs: ha.gcs ?? undefined,
            },
            consentSigned: ha.consentFormSigned,
            siteMarked: ha.operationSiteMarked || ha.surgicalSiteMarked,
            fastingConfirmed: ha.nilPerOralMaintained || ha.fastingCompliant,
            hasAllergies: ha.hasAllergies,
            allergyDetails: ha.allergyDetails || undefined,
            patientReadyForSurgery: ha.patientReadyForSurgery,
            readinessRemarks: ha.readinessRemarks || undefined,
            typeOfAnesthesia: ha.typeOfAnesthesia || undefined,
            perioperativeNurse1: ha.perioperativeNurse1 || undefined,
            perioperativeNurse2: ha.perioperativeNurse2 || undefined,
            clearedForTheatre: ha.clearedForTheatre,
            clearanceTime: iso(ha.clearanceTime),
            transferredToTheatre: ha.transferredToTheatre,
            transferTime: iso(ha.transferTime),
            handoverNurse: ha.handoverNurse || undefined,
            redAlertTriggered: ha.redAlertTriggered,
            redAlertDescription: ha.redAlertDescription || undefined,
          }
        : undefined,
      intraOp: intraOp
        ? {
            theatreEntryTime: iso(intraOp.theatreEntryTime),
            patientPositioning: intraOp.patientPositioning || undefined,
            timeOut: iso(intraOp.timeOut),
            timeOutConfirmedBy: intraOp.timeOutConfirmedBy || undefined,
            knifeToSkinTime: iso(intraOp.knifeToSkinTime),
            procedureStartTime: iso(intraOp.procedureStartTime),
            procedureEndTime: iso(intraOp.procedureEndTime),
            closureEndTime: iso(intraOp.closureEndTime),
            estimatedBloodLoss: intraOp.estimatedBloodLoss ?? undefined,
            urineOutput: intraOp.urineOutput ?? undefined,
            instrumentCountCorrect: intraOp.instrumentCountCorrect,
            swabCountCorrect: intraOp.swabCountCorrect,
            needleCountCorrect: intraOp.needleCountCorrect,
            countDiscrepancy: intraOp.countDiscrepancy || undefined,
            drainsInserted: intraOp.drainsInserted,
            drainDetails: intraOp.drainDetails || undefined,
            specimensSent: intraOp.specimensSent,
            specimenDetails: intraOp.specimenDetails || undefined,
            complicationsOccurred: intraOp.complicationsOccurred,
            complicationDetails: intraOp.complicationDetails || undefined,
            bloodProductsGiven: intraOp.bloodProductsGiven,
            bloodProductDetails: intraOp.bloodProductDetails || undefined,
            anesthesiaNotes: intraOp.anesthesiaNotes || undefined,
            transferToPACUTime: iso(intraOp.transferToPACUTime),
            handoverToRecoveryNurse: intraOp.handoverToRecoveryNurse || undefined,
          }
        : undefined,
      anesthesia: anes
        ? {
            type: String(anes.anesthesiaType),
            technique: anes.anesthesiaTechnique || undefined,
            asaClassification: anes.asaClassification || undefined,
            airwayGrade: anes.airwayGrade || undefined,
            intubationMethod: anes.intubationMethod || undefined,
            ettSize: anes.ettSize || undefined,
            spinalLevel: anes.spinalLevel || undefined,
            spinalNeedleSize: anes.spinalNeedleSize || undefined,
            localAnestheticUsed: anes.localAnestheticUsed || undefined,
            inductionTime: iso(anes.inductionTime),
            anesthesiaEndTime: iso(anes.anesthesiaEndTime),
            extubationTime: iso(anes.extubationTime),
            extubationCondition: anes.extubationCondition || undefined,
            baselineVitals: {
              heartRate: anes.baselineHR ?? undefined,
              bloodPressure: anes.baselineBP || undefined,
              spo2: anes.baselineSpo2 ?? undefined,
              temperature: num(anes.baselineTemp),
            },
            crystalloidsGiven: anes.crystalloidsGiven ?? undefined,
            colloidsGiven: anes.colloidsGiven ?? undefined,
            estimatedBloodLoss: anes.estimatedBloodLoss ?? undefined,
            urineOutput: anes.urineOutput ?? undefined,
            antibioticProphylaxis: anes.antibioticProphylaxis || undefined,
            complications: [
              anes.hypotensionOccurred && 'Hypotension',
              anes.hypertensionOccurred && 'Hypertension',
              anes.bradycardiaOccurred && 'Bradycardia',
              anes.tachycardiaOccurred && 'Tachycardia',
              anes.desaturationOccurred && 'Desaturation',
              anes.difficultAirway && 'Difficult airway',
              anes.anaphylaxis && 'Anaphylaxis',
            ].filter(Boolean) as string[],
            anesthetistNotes: anes.anesthetistNotes || undefined,
            anesthetistName: anes.anesthetistName || undefined,
            medications: anes.medicationRecords.map((m) => ({
              time: iso(m.administeredAt)!,
              name: m.medicationName,
              dosage: m.dosage || '',
              route: m.route,
              type: m.medicationType,
              volumeML: m.volumeML ?? undefined,
              rateMLPerHour: m.rateMLPerHour ?? undefined,
              bloodProductType: m.bloodProductType || undefined,
              bloodUnits: m.bloodUnits ? Number(m.bloodUnits) : undefined,
            })),
            vitalSigns: anes.vitalSignsRecords.map((v) => ({
              time: iso(v.recordedAt)!,
              phase: v.eventPhase || undefined,
              heartRate: v.heartRate ?? undefined,
              bloodPressure:
                v.systolicBP && v.diastolicBP ? `${v.systolicBP}/${v.diastolicBP}` : undefined,
              spo2: v.spo2 ?? undefined,
              etco2: v.etco2 ?? undefined,
              temperature: num(v.temperature),
            })),
          }
        : undefined,
      pacu: {
        admissionTime: iso(pacu.admissionTime)!,
        receivedBy: nameOf(pacu.receivedBy),
        handoverFrom: nameOf(pacu.handoverFrom) || pacu.handoverFrom || undefined,
        consciousnessLevel: String(pacu.consciousnessLevel),
        airwayStatus: String(pacu.airwayStatus),
        breathingPattern: pacu.breathingPattern || undefined,
        oxygenTherapy: pacu.oxygenTherapy,
        heartRateOnAdmission: pacu.heartRateOnAdmission ?? undefined,
        bloodPressureOnAdmission: pacu.bloodPressureOnAdmission || undefined,
        painScoreOnAdmission: pacu.painScoreOnAdmission ?? undefined,
        surgicalSiteCondition: pacu.surgicalSiteCondition || undefined,
        dressingIntact: pacu.dressingIntact,
        drainsPresent: pacu.drainsPresent,
        drainOutput: pacu.drainOutput || undefined,
        ivFluidsRunning: pacu.ivFluidsRunning,
        urineOutput: pacu.urineOutput ?? undefined,
        temperatureOnAdmission: num(pacu.temperatureOnAdmission),
        nauseaPresent: pacu.nauseaPresent,
        vomitingOccurred: pacu.vomitingOccurred,
        complicationsDetected: pacu.complicationsDetected,
        complicationDetails: pacu.complicationDetails || undefined,
        dischargeReadiness: String(pacu.dischargeReadiness),
        dischargeTime: iso(pacu.dischargeTime),
        dischargedTo: pacu.dischargedTo || undefined,
        dischargeVitalsStable: pacu.dischargeVitalsStable,
        dischargePainControlled: pacu.dischargePainControlled,
        dischargeFullyConscious: pacu.dischargeFullyConscious,
        dischargeNauseaFree: pacu.dischargeNauseaFree,
        totalTimeInPACU: pacu.totalTimeInPACU ?? undefined,
        dischargeNotes: pacu.dischargeNotes || undefined,
        warningSignsExplained: pacu.warningSignsExplained,
        wardNurseHandover: pacu.wardNurseHandover || undefined,
        vitalSigns: pacu.vitalSigns.map((v) => ({
          time: iso(v.recordedAt)!,
          consciousnessLevel: v.consciousnessLevel ? String(v.consciousnessLevel) : undefined,
          heartRate: v.heartRate ?? undefined,
          bloodPressure: v.bloodPressure || undefined,
          respiratoryRate: v.respiratoryRate ?? undefined,
          oxygenSaturation: v.oxygenSaturation ?? undefined,
          temperature: num(v.temperature),
          painScore: v.painScore ?? undefined,
        })),
        redAlerts: pacu.redAlerts.map((a) => ({
          time: iso(a.triggeredAt)!,
          alertType: String(a.alertType),
          severity: a.severity,
          description: a.description,
          resolved: a.resolved,
        })),
      },
      postOpPrescriptions: (surgery.postOpPrescriptions || []).map((p) => ({
        prescribedAt: iso(p.prescribedAt),
        prescribedByName: p.prescribedByName,
        medications: p.medications || undefined,
        notes: p.notes || undefined,
      })),
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching perioperative record data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch perioperative record data' },
      { status: 500 }
    );
  }
}
