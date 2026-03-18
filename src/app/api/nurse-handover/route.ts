import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/nurse-handover - List handovers with filters
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const phase = searchParams.get('phase');
    const status = searchParams.get('status');
    const surgeryId = searchParams.get('surgeryId');
    const patientId = searchParams.get('patientId');
    const myHandovers = searchParams.get('my');
    const date = searchParams.get('date');

    const where: any = {};
    if (phase) where.handoverPhase = phase;
    if (status) where.status = status;
    if (surgeryId) where.surgeryId = surgeryId;
    if (patientId) where.patientId = patientId;
    if (myHandovers === 'given') where.handingOverNurseId = session.user.id;
    if (myHandovers === 'received') where.receivingNurseId = session.user.id;
    if (date) {
      const d = new Date(date);
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);
      where.createdAt = { gte: d, lt: nextDay };
    }

    const handovers = await prisma.nurseHandover.findMany({
      where,
      include: {
        surgery: {
          select: { id: true, procedureName: true, scheduledDate: true, status: true },
        },
        patient: {
          select: { id: true, name: true, folderNumber: true, ward: true },
        },
        handingOverNurse: {
          select: { id: true, fullName: true, role: true },
        },
        receivingNurse: {
          select: { id: true, fullName: true, role: true },
        },
        witnessNurse: {
          select: { id: true, fullName: true, role: true },
        },
        checklistItems: true,
        _count: { select: { auditTrail: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ handovers });
  } catch (error) {
    console.error('Error fetching handovers:', error);
    return NextResponse.json({ handovers: [] });
  }
}

// POST /api/nurse-handover - Create a new handover
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      handoverPhase,
      surgeryId,
      patientId,
      theatreName,
      // SBAR fields
      patientName, patientFolderNumber, patientAge, patientGender, patientWard,
      procedurePerformed, surgeonName, anesthetistName, anesthesiaType,
      surgeryStartTime, surgeryEndTime,
      diagnosis, relevantHistory, allergies, preOpInvestigations, asaGrade,
      estimatedBloodLoss, fluidGiven, bloodProductsGiven, urineOutput,
      vitalSignsSummary, lastBP, lastHR, lastSpO2, lastTemp,
      painScore, consciousnessLevel, airwayStatus,
      intraOpComplications, unexpectedEvents, implantsUsed,
      // WHO Sign Out
      instrumentCountCorrect, spongeCountCorrect, needleCountCorrect, sharpsCountCorrect,
      countDiscrepancy, specimenCollected, specimenLabel, specimenSentToLab,
      equipmentProblems, equipmentProblemDetails,
      // Drains / Lines
      drainsInSitu, drainDetails, catheterInSitu, catheterDetails,
      ivLinesInSitu, ivLineDetails, ngTubeInSitu, ngTubeDetails, woundDressing,
      // Recommendations
      postOpOrders, oxygenRequirement, ivFluidOrders, painManagementPlan,
      antibioticPlan, dvtProphylaxis, dietaryInstructions, mobilityInstructions,
      monitoringFrequency, investigationsOrdered, followUpPlan, escalationCriteria,
      // Theatre Preparation Status
      theatreAssigned, instrumentSetPrepared, sterilityConfirmed, equipmentChecked, implantsAvailable,
      // Anaesthesia & Safety
      consentObtained, preOpChecklistCompleted, bloodAvailability, fastingStatus, fastingDetails,
      // Nursing Tasks
      ivLineSecured, medicationsAdministered, medicationDetails, skinPreparation, skinPrepDetails,
      documentationComplete, documentationNotes,
      // Special Notes / Alerts
      infectionRisk, infectionRiskDetails, highRiskPatient, highRiskDetails,
      specialPositioning, positioningDetails, equipmentConcerns, equipmentConcernDetails, specialAlerts,
      // Photo & Voice
      woundImages, voiceNoteUrl,
      // Performance Tracking
      shiftStartTime, shiftEndTime, handoverDurationMinutes, delayMinutes, delayCause,
      // Shift handover specific
      pendingTasks, outstandingOrders, upcomingSurgeries,
      staffingConcerns, equipmentIssues, theatreCleanliness,
      // Receiving nurse
      receivingNurseId, receivingNurseName,
      witnessNurseId, witnessNurseName,
      // Checklist items
      checklistItems,
    } = body;

    if (!handoverPhase) {
      return NextResponse.json({ error: 'Handover phase is required' }, { status: 400 });
    }

    // Auto-populate from surgery if surgeryId provided
    let autoPatientName = patientName;
    let autoFolderNumber = patientFolderNumber;
    let autoProcedure = procedurePerformed;
    let autoSurgeonName = surgeonName;
    let autoPatientId = patientId;

    if (surgeryId) {
      const surgery = await prisma.surgery.findUnique({
        where: { id: surgeryId },
        include: {
          patient: { select: { id: true, name: true, folderNumber: true, ward: true, age: true, gender: true } },
          surgeon: { select: { fullName: true } },
          anesthetist: { select: { fullName: true } },
        },
      });
      if (surgery) {
        autoPatientName = autoPatientName || surgery.patient.name;
        autoFolderNumber = autoFolderNumber || surgery.patient.folderNumber;
        autoProcedure = autoProcedure || surgery.procedureName;
        autoSurgeonName = autoSurgeonName || surgery.surgeonName || surgery.surgeon?.fullName;
        autoPatientId = autoPatientId || surgery.patient.id;
      }
    }

    const handover = await prisma.nurseHandover.create({
      data: {
        handoverPhase,
        status: receivingNurseId ? 'PENDING_ACKNOWLEDGEMENT' : 'DRAFT',
        surgeryId: surgeryId || null,
        patientId: autoPatientId || null,
        theatreName: theatreName || null,
        patientName: autoPatientName || null,
        patientFolderNumber: autoFolderNumber || null,
        patientAge: patientAge ? parseInt(patientAge) : null,
        patientGender: patientGender || null,
        patientWard: patientWard || null,
        procedurePerformed: autoProcedure || null,
        surgeonName: autoSurgeonName || null,
        anesthetistName: anesthetistName || null,
        anesthesiaType: anesthesiaType || null,
        surgeryStartTime: surgeryStartTime ? new Date(surgeryStartTime) : null,
        surgeryEndTime: surgeryEndTime ? new Date(surgeryEndTime) : null,
        diagnosis: diagnosis || null,
        relevantHistory: relevantHistory || null,
        allergies: allergies || null,
        preOpInvestigations: preOpInvestigations || null,
        asaGrade: asaGrade || null,
        estimatedBloodLoss: estimatedBloodLoss || null,
        fluidGiven: fluidGiven || null,
        bloodProductsGiven: bloodProductsGiven || null,
        urineOutput: urineOutput || null,
        vitalSignsSummary: vitalSignsSummary || null,
        lastBP: lastBP || null,
        lastHR: lastHR || null,
        lastSpO2: lastSpO2 || null,
        lastTemp: lastTemp || null,
        painScore: painScore ? parseInt(painScore) : null,
        consciousnessLevel: consciousnessLevel || null,
        airwayStatus: airwayStatus || null,
        intraOpComplications: intraOpComplications || null,
        unexpectedEvents: unexpectedEvents || null,
        implantsUsed: implantsUsed || null,
        instrumentCountCorrect: instrumentCountCorrect ?? null,
        spongeCountCorrect: spongeCountCorrect ?? null,
        needleCountCorrect: needleCountCorrect ?? null,
        sharpsCountCorrect: sharpsCountCorrect ?? null,
        countDiscrepancy: countDiscrepancy || null,
        specimenCollected: specimenCollected ?? null,
        specimenLabel: specimenLabel || null,
        specimenSentToLab: specimenSentToLab ?? null,
        equipmentProblems: equipmentProblems ?? null,
        equipmentProblemDetails: equipmentProblemDetails || null,
        drainsInSitu: drainsInSitu ?? false,
        drainDetails: drainDetails || null,
        catheterInSitu: catheterInSitu ?? false,
        catheterDetails: catheterDetails || null,
        ivLinesInSitu: ivLinesInSitu ?? false,
        ivLineDetails: ivLineDetails || null,
        ngTubeInSitu: ngTubeInSitu ?? false,
        ngTubeDetails: ngTubeDetails || null,
        woundDressing: woundDressing || null,
        postOpOrders: postOpOrders || null,
        oxygenRequirement: oxygenRequirement || null,
        ivFluidOrders: ivFluidOrders || null,
        painManagementPlan: painManagementPlan || null,
        antibioticPlan: antibioticPlan || null,
        dvtProphylaxis: dvtProphylaxis || null,
        dietaryInstructions: dietaryInstructions || null,
        mobilityInstructions: mobilityInstructions || null,
        monitoringFrequency: monitoringFrequency || null,
        investigationsOrdered: investigationsOrdered || null,
        followUpPlan: followUpPlan || null,
        escalationCriteria: escalationCriteria || null,
        pendingTasks: pendingTasks || null,
        outstandingOrders: outstandingOrders || null,
        upcomingSurgeries: upcomingSurgeries || null,
        staffingConcerns: staffingConcerns || null,
        equipmentIssues: equipmentIssues || null,
        theatreCleanliness: theatreCleanliness || null,
        // Theatre Preparation
        theatreAssigned: theatreAssigned ?? null,
        instrumentSetPrepared: instrumentSetPrepared ?? null,
        sterilityConfirmed: sterilityConfirmed ?? null,
        equipmentChecked: equipmentChecked ?? null,
        implantsAvailable: implantsAvailable ?? null,
        // Anaesthesia & Safety
        consentObtained: consentObtained ?? null,
        preOpChecklistCompleted: preOpChecklistCompleted ?? null,
        bloodAvailability: bloodAvailability ?? null,
        fastingStatus: fastingStatus ?? null,
        fastingDetails: fastingDetails || null,
        // Nursing Tasks
        ivLineSecured: ivLineSecured ?? null,
        medicationsAdministered: medicationsAdministered ?? null,
        medicationDetails: medicationDetails || null,
        skinPreparation: skinPreparation ?? null,
        skinPrepDetails: skinPrepDetails || null,
        documentationComplete: documentationComplete ?? null,
        documentationNotes: documentationNotes || null,
        // Special Alerts
        infectionRisk: infectionRisk ?? false,
        infectionRiskDetails: infectionRiskDetails || null,
        highRiskPatient: highRiskPatient ?? false,
        highRiskDetails: highRiskDetails || null,
        specialPositioning: specialPositioning ?? false,
        positioningDetails: positioningDetails || null,
        equipmentConcerns: equipmentConcerns ?? false,
        equipmentConcernDetails: equipmentConcernDetails || null,
        specialAlerts: specialAlerts || null,
        // Photo & Voice
        woundImages: woundImages || [],
        voiceNoteUrl: voiceNoteUrl || null,
        // Performance
        shiftStartTime: shiftStartTime ? new Date(shiftStartTime) : null,
        shiftEndTime: shiftEndTime ? new Date(shiftEndTime) : null,
        handoverDurationMinutes: handoverDurationMinutes ? parseInt(handoverDurationMinutes) : null,
        delayMinutes: delayMinutes ? parseInt(delayMinutes) : null,
        delayCause: delayCause || null,
        handingOverNurseId: session.user.id,
        handingOverNurseName: session.user.fullName || session.user.name || 'Unknown',
        receivingNurseId: receivingNurseId || null,
        receivingNurseName: receivingNurseName || null,
        witnessNurseId: witnessNurseId || null,
        witnessNurseName: witnessNurseName || null,
        // Create checklist items
        checklistItems: checklistItems?.length ? {
          create: checklistItems.map((item: any) => ({
            category: item.category,
            itemLabel: item.itemLabel,
            isChecked: item.isChecked ?? false,
            notes: item.notes || null,
            checkedById: item.isChecked ? session.user.id : null,
            checkedByName: item.isChecked ? (session.user.fullName || session.user.name) : null,
            checkedAt: item.isChecked ? new Date() : null,
          })),
        } : undefined,
      },
      include: {
        handingOverNurse: { select: { id: true, fullName: true } },
        receivingNurse: { select: { id: true, fullName: true } },
        checklistItems: true,
      },
    });

    // Create audit trail entry
    await prisma.handoverAuditLog.create({
      data: {
        handoverId: handover.id,
        action: 'CREATED',
        performedById: session.user.id,
        performedByName: session.user.fullName || session.user.name || 'Unknown',
        details: JSON.stringify({ handoverPhase, patientName: autoPatientName, procedurePerformed: autoProcedure }),
      },
    });

    return NextResponse.json({ handover }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating handover:', error);
    return NextResponse.json({ error: error.message || 'Failed to create handover' }, { status: 500 });
  }
}
