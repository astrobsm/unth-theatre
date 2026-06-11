/* eslint-disable */
/**
 * Seed a single TEST patient through the full peri-operative workflow so the
 * team can test:
 *   1. PACU (recovery) admission  →  /dashboard/pacu/new?surgeryId=<id>
 *   2. Writing the operation / post-operative note →
 *      /dashboard/surgeries/<id>/post-op-notes
 *
 * The script walks the patient through every logical step and leaves the
 * surgery in status = COMPLETED, WITHOUT a PACU assessment and WITHOUT a
 * post-op note (those two are intentionally left for you to test).
 *
 * Chain created:
 *   Patient (registration + pre-op assessment)
 *     → PatientTransfer (Ward → Holding → Theatre → Recovery)
 *     → Surgery (booked, then COMPLETED)
 *     → PreOperativeAnestheticReview (APPROVED)
 *     → AnestheticPrescription (APPROVED)
 *     → PreoperativeSafetyCheck (all checks complete)
 *     → HoldingAreaAssessment (cleared & transferred to theatre)
 *     → WHOChecklist (sign-in / time-out / sign-out)
 *     → SurgicalTeamMembers
 *     → IntraOperativeRecord
 *     → AnesthesiaMonitoringRecord
 *     → SurgicalTiming
 *     → PatientMovement (phase log)
 *     → PatientTransportLog (porter, if a porter user exists)
 *
 * Usage:
 *   node scripts/seed-test-patient.js
 *
 * It is safe to run multiple times — each run creates a fresh patient with a
 * unique folder number and prints the IDs + test URLs at the end.
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

// Prefer the direct (non-pgbouncer) connection for this admin task. Fall back
// to DATABASE_URL. Mirrors scripts/clear-go-live-data.js.
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    const text = fs.readFileSync(envPath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*(DIRECT_URL|DATABASE_URL)\s*=\s*(.+)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
    }
  } catch {
    /* .env optional if vars already exported */
  }
  if (process.env.DIRECT_URL) {
    process.env.DATABASE_URL = process.env.DIRECT_URL;
  }
}

loadEnv();

const prisma = new PrismaClient();

// Pick the first approved user matching one of the given roles, with fallback.
function pick(users, roles) {
  for (const role of roles) {
    const found = users.find((u) => u.role === role);
    if (found) return found;
  }
  return null;
}

async function main() {
  console.log('Connecting to database...');

  const users = await prisma.user.findMany({
    where: { status: 'APPROVED' },
    select: { id: true, fullName: true, role: true, staffCode: true },
  });

  if (users.length === 0) {
    throw new Error(
      'No APPROVED users found. Approve at least one user before seeding so workflow records can reference real staff.'
    );
  }

  const anyUser = users[0];
  const surgeon = pick(users, ['SURGEON']) || anyUser;
  const anaesthetist =
    pick(users, ['CONSULTANT_ANAESTHETIST', 'ANAESTHETIST']) || null;
  const scrubNurse = pick(users, ['SCRUB_NURSE']) || null;
  const recoveryNurse = pick(users, ['RECOVERY_ROOM_NURSE']) || null;
  const porter = pick(users, ['PORTER']) || null;
  const holdingNurse = scrubNurse || recoveryNurse || anyUser;

  console.log('Using staff:');
  console.log('  Surgeon       :', surgeon ? surgeon.fullName : '—');
  console.log('  Anaesthetist  :', anaesthetist ? anaesthetist.fullName : '— (review/prescription will be skipped)');
  console.log('  Scrub nurse   :', scrubNurse ? scrubNurse.fullName : '—');
  console.log('  Porter        :', porter ? porter.fullName : '— (transport log skipped)');

  const now = new Date();
  const stamp = Date.now().toString().slice(-6);
  const folderNumber = `TEST-${stamp}`;

  // Times for a realistic completed case earlier today.
  const enteredRoom = new Date(now.getTime() - 3 * 60 * 60 * 1000); // 3h ago
  const anaesthesiaStart = new Date(now.getTime() - 2.75 * 60 * 60 * 1000);
  const knifeOnSkin = new Date(now.getTime() - 2.5 * 60 * 60 * 1000); // 2.5h ago
  const procedureEnd = new Date(now.getTime() - 1.25 * 60 * 60 * 1000);
  const surgeryEnd = new Date(now.getTime() - 1 * 60 * 60 * 1000); // 1h ago
  const leftRoom = new Date(now.getTime() - 0.75 * 60 * 60 * 1000);

  // 1) PATIENT REGISTRATION + PRE-OP ASSESSMENT ----------------------------
  const patient = await prisma.patient.create({
    data: {
      folderNumber,
      ptNumber: `PT-${stamp}`,
      name: 'Test Patient (Workflow Demo)',
      age: 42,
      gender: 'Female',
      ward: 'Surgical Ward 3B',

      // DVT / bleeding / pressure-sore risk
      dvtRiskScore: 2,
      bleedingRiskScore: 1,
      pressureSoreRisk: 'LOW',
      mobilityStatus: 'Independently mobile',
      nutritionalStatus: 'GOOD',

      // WHO / ASA fitness
      whoRiskClass: 'II',
      asaScore: 2,
      comorbidities: 'Well-controlled hypertension',
      cardiovascularStatus: 'Stable',
      respiratoryStatus: 'Clear chest, no distress',
      metabolicStatus: 'Normal',

      finalRiskScore: 18,
      fitnessForSurgery: 'FIT',
      assessmentNotes: 'Seeded test patient — fit for elective surgery.',
      assessedBy: surgeon.fullName,
      assessmentDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    },
  });
  console.log(`\n[1] Patient registered: ${patient.name} (${patient.folderNumber})`);

  // 2) SURGERY BOOKING (then marked COMPLETED) -----------------------------
  const surgery = await prisma.surgery.create({
    data: {
      patientId: patient.id,
      surgeonId: surgeon.id,
      surgeonName: surgeon.fullName,
      anesthetistId: anaesthetist ? anaesthetist.id : null,
      scrubNurseId: scrubNurse ? scrubNurse.id : null,
      subspecialty: 'General Surgery',
      unit: 'General Surgery Unit 1',
      location: 'Professor Ojukwu Theatre Complex',
      indication: 'Symptomatic gallstones',
      procedureName: 'Laparoscopic Cholecystectomy',
      scheduledDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      scheduledTime: '08:00',
      estimatedDuration: 90,
      status: 'COMPLETED',
      surgeryType: 'ELECTIVE',
      readinessStatus: 'READY',
      anesthesiaType: 'GENERAL',
      needBloodTransfusion: false,
      needDiathermy: true,
      needSuction: true,
      depositConfirmed: true,
      knifeOnSkinTime: knifeOnSkin,
      surgeryEndTime: surgeryEnd,
      completedAt: surgeryEnd,
      actualStartTime: knifeOnSkin,
      actualEndTime: surgeryEnd,
      remarks: 'Seeded completed case for PACU admission + operation note testing.',
    },
  });
  console.log(`[2] Surgery booked & completed: ${surgery.procedureName} (id ${surgery.id})`);

  // 3) PATIENT TRANSFERS (Ward → Holding → Theatre → Recovery) -------------
  const transferLegs = [
    { fromLocation: 'WARD', toLocation: 'HOLDING_AREA', at: enteredRoom },
    { fromLocation: 'HOLDING_AREA', toLocation: 'THEATRE_SUITE', at: anaesthesiaStart },
    { fromLocation: 'THEATRE_SUITE', toLocation: 'RECOVERY', at: surgeryEnd },
  ];
  for (const leg of transferLegs) {
    await prisma.patientTransfer.create({
      data: {
        patientId: patient.id,
        fromLocation: leg.fromLocation,
        toLocation: leg.toLocation,
        transferTime: leg.at,
        transferredBy: (porter || anyUser).id,
        notes: 'Seeded transfer.',
      },
    });
  }
  console.log('[3] Patient transfers logged (Ward → Holding → Theatre → Recovery).');

  // 4) PRE-OPERATIVE ANAESTHETIC REVIEW (APPROVED) -------------------------
  let preOpReview = null;
  if (anaesthetist) {
    preOpReview = await prisma.preOperativeAnestheticReview.create({
      data: {
        surgeryId: surgery.id,
        patientId: patient.id,
        patientName: patient.name,
        folderNumber: patient.folderNumber,
        anesthetistId: anaesthetist.id,
        anesthetistName: anaesthetist.fullName,
        reviewDate: new Date(now.getTime() - 20 * 60 * 60 * 1000),
        scheduledSurgeryDate: surgery.scheduledDate,
        comorbidities: JSON.stringify(['Hypertension (controlled)']),
        allergies: JSON.stringify(['No known drug allergies']),
        fastingStatus: 'NPO since midnight',
        weight: 68,
        height: 165,
        bmi: 25,
        bloodPressure: '128/82',
        heartRate: 78,
        respiratoryRate: 16,
        temperature: 36.7,
        airwayClass: 'II',
        hemoglobin: 12.6,
        plateletCount: 240,
        asaClass: 'II',
        proposedAnesthesiaType: 'GENERAL',
        anestheticPlan: 'GA with ETT. Standard induction. Multimodal analgesia.',
        riskLevel: 'LOW',
        status: 'APPROVED',
        approvedAt: new Date(now.getTime() - 19 * 60 * 60 * 1000),
        approvedBy: anaesthetist.fullName,
        reviewNotes: 'Seeded pre-op anaesthetic review — patient fit for GA.',
      },
    });
    console.log('[4] Pre-operative anaesthetic review created (APPROVED).');

    // 5) ANAESTHETIC PRESCRIPTION (APPROVED) -------------------------------
    await prisma.anestheticPrescription.create({
      data: {
        preOpReviewId: preOpReview.id,
        surgeryId: surgery.id,
        patientId: patient.id,
        patientName: patient.name,
        prescribedById: anaesthetist.id,
        prescribedByName: anaesthetist.fullName,
        prescriptionDate: new Date(now.getTime() - 19 * 60 * 60 * 1000),
        approvedById: anaesthetist.id,
        approvedByName: anaesthetist.fullName,
        approvedAt: new Date(now.getTime() - 18 * 60 * 60 * 1000),
        medications: JSON.stringify([
          { drug: 'Propofol', dose: '2 mg/kg', route: 'IV', timing: 'Induction' },
          { drug: 'Fentanyl', dose: '100 mcg', route: 'IV', timing: 'Induction' },
          { drug: 'Atracurium', dose: '0.5 mg/kg', route: 'IV', timing: 'Induction' },
          { drug: 'Ceftriaxone', dose: '1 g', route: 'IV', timing: 'Pre-incision' },
        ]),
        fluids: 'Ringer\'s Lactate 1000 mL',
        emergencyDrugs: 'Atropine, Adrenaline, Ephedrine',
        scheduledSurgeryDate: surgery.scheduledDate,
        urgency: 'ROUTINE',
        status: 'APPROVED',
        specialInstructions: 'Seeded prescription for workflow demo.',
      },
    });
    console.log('[5] Anaesthetic prescription created (APPROVED).');
  } else {
    console.log('[4-5] Skipped pre-op review & prescription (no anaesthetist user found).');
  }

  // 6) PRE-OPERATIVE SAFETY CHECK ------------------------------------------
  await prisma.preoperativeSafetyCheck.create({
    data: {
      surgeryId: surgery.id,
      whoChecklistComplete: true,
      dvtRiskAssessed: true,
      bleedingRiskAssessed: true,
      medicationCleared: true,
      depositConfirmed: true,
      allChecksComplete: true,
      completedBy: holdingNurse.fullName,
      completedAt: enteredRoom,
      notes: 'Seeded — all pre-op safety checks complete.',
    },
  });
  console.log('[6] Pre-operative safety check completed.');

  // 7) HOLDING AREA ASSESSMENT (cleared & transferred) ---------------------
  await prisma.holdingAreaAssessment.create({
    data: {
      surgeryId: surgery.id,
      patientId: patient.id,
      arrivalTime: enteredRoom,
      receivedBy: holdingNurse.id,
      status: 'TRANSFERRED_TO_THEATRE',
      patientIdentityConfirmed: true,
      patientStatedName: true,
      crossCheckWithWristBand: true,
      compareWithFolderName: true,
      consentFormComplete: true,
      consentFormSigned: true,
      nilPerOralMaintained: true,
      operationSiteMarked: true,
      surgicalSiteMarked: true,
      surgicalSiteConfirmed: true,
      procedureConfirmed: true,
      consentFormPresent: true,
      allergyStatusChecked: true,
      fastingStatusChecked: true,
      fastingCompliant: true,
      heartRate: 78,
      bloodPressure: '128/82',
      oxygenSaturation: 99,
      vitalSignsNormal: true,
      allDocumentationComplete: true,
      patientReadyForSurgery: true,
      clearedForTheatre: true,
      clearanceTime: anaesthesiaStart,
      transferredToTheatre: true,
      transferTime: anaesthesiaStart,
      handoverNurse: scrubNurse ? scrubNurse.fullName : holdingNurse.fullName,
    },
  });
  console.log('[7] Holding-area assessment completed (cleared for theatre).');

  // 8) WHO SURGICAL SAFETY CHECKLIST ---------------------------------------
  await prisma.wHOChecklist.create({
    data: {
      surgeryId: surgery.id,
      // Sign in
      patientConfirmed: true,
      hasPatientConfirmedIdentity: true,
      hasPatientConfirmedSite: true,
      hasPatientConfirmedProcedure: true,
      hasPatientConfirmedConsent: true,
      siteMarked: true,
      anesthesiaChecked: true,
      pulseOximeterOn: true,
      allergyChecked: true,
      knownAllergy: false,
      asaGrade: '2',
      // Time out
      teamIntroduced: true,
      confirmPatientName: true,
      confirmProcedurePlanned: true,
      antibioticGiven: true,
      // Sign out
      nurseVerballyConfirms: true,
      procedureRecorded: true,
      nameOfProcedurePerformed: surgery.procedureName,
      instrumentCountCorrect: true,
      specimenLabeled: true,
      breathingSpontaneously: true,
      vitalSignsNormalAndStable: true,
      transferToRecoveryRoom: true,
      patientSurname: 'Patient',
      patientFirstName: 'Test',
      surgicalOperation: surgery.procedureName,
      completedById: (scrubNurse || holdingNurse).id,
      checklistCompletedAt: surgeryEnd,
    },
  });
  console.log('[8] WHO surgical safety checklist completed (sign-in/time-out/sign-out).');

  // 9) SURGICAL TEAM MEMBERS -----------------------------------------------
  await prisma.surgicalTeamMember.create({
    data: { surgeryId: surgery.id, userId: surgeon.id, role: 'CONSULTANT' },
  });
  if (scrubNurse) {
    await prisma.surgicalTeamMember.create({
      data: { surgeryId: surgery.id, userId: scrubNurse.id, memberName: scrubNurse.fullName, role: 'REGISTRAR' },
    });
  }
  console.log('[9] Surgical team members recorded.');

  // 10) INTRA-OPERATIVE RECORD ---------------------------------------------
  const intraOp = await prisma.intraOperativeRecord.create({
    data: {
      surgeryId: surgery.id,
      theatreEntryTime: enteredRoom,
      patientPositioning: 'Supine',
      timeOut: knifeOnSkin,
      timeOutConfirmedBy: scrubNurse ? scrubNurse.fullName : holdingNurse.fullName,
      anesthesiaStart: anaesthesiaStart,
      anesthesiaType: 'GENERAL',
      anesthetistId: anaesthetist ? anaesthetist.id : null,
      primarySurgeonId: surgeon.id,
      scrubNurseId: scrubNurse ? scrubNurse.id : null,
      knifeToSkinTime: knifeOnSkin,
      procedureStartTime: knifeOnSkin,
      procedureEndTime: procedureEnd,
      closureStartTime: procedureEnd,
      closureEndTime: surgeryEnd,
      complicationsOccurred: false,
      instrumentCountCorrect: true,
      swabCountCorrect: true,
      needleCountCorrect: true,
      estimatedBloodLoss: 80,
      urineOutput: 250,
      transferToPACUTime: surgeryEnd,
      handoverToRecoveryNurse: recoveryNurse ? recoveryNurse.fullName : 'Recovery Nurse',
      createdBy: (scrubNurse || holdingNurse).id,
    },
  });
  console.log('[10] Intra-operative record created.');

  // 11) ANAESTHESIA MONITORING RECORD --------------------------------------
  await prisma.anesthesiaMonitoringRecord.create({
    data: {
      intraOperativeRecordId: intraOp.id,
      surgeryId: surgery.id,
      patientId: patient.id,
      preOpDiagnosis: 'Symptomatic cholelithiasis',
      proposedProcedure: surgery.procedureName,
      asaClassification: 'II',
      weightKg: 68,
      heightCm: 165,
      bmi: 25,
      anesthesiaType: 'GENERAL',
      anesthesiaTechnique: 'General-ETT',
      intubationMethod: 'ETT',
      ettSize: '7.0mm',
      inductionTime: anaesthesiaStart,
      ecgMonitored: true,
      nibpMonitored: true,
      spo2Monitored: true,
      etco2Monitored: true,
      baselineHR: 78,
      baselineBP: '128/82',
      baselineSpo2: 99,
      crystalloidsGiven: 1000,
      estimatedBloodLoss: 80,
      urineOutput: 250,
      antibioticProphylaxis: 'Ceftriaxone 1g IV at induction',
      anesthesiaEndTime: surgeryEnd,
      extubationTime: surgeryEnd,
      extubationCondition: 'Awake',
      transferToPACU: true,
      anesthetistName: anaesthetist ? anaesthetist.fullName : 'Anaesthetist',
      recordCompletedAt: surgeryEnd,
      anesthetistNotes: 'Seeded — uneventful general anaesthesia.',
    },
  });
  console.log('[11] Anaesthesia monitoring record created.');

  // 12) SURGICAL TIMING ----------------------------------------------------
  await prisma.surgicalTiming.create({
    data: {
      surgeryId: surgery.id,
      patientEnteredRoomTime: enteredRoom,
      anesthesiaStartTime: anaesthesiaStart,
      anesthesiaReadyTime: knifeOnSkin,
      timeoutStartTime: knifeOnSkin,
      timeoutCompletedTime: knifeOnSkin,
      timeoutPerformedBy: scrubNurse ? scrubNurse.fullName : holdingNurse.fullName,
      incisionTime: knifeOnSkin,
      procedureStartTime: knifeOnSkin,
      procedureEndTime: procedureEnd,
      closureStartTime: procedureEnd,
      closureEndTime: surgeryEnd,
      dressingAppliedTime: surgeryEnd,
      patientExtubatedTime: surgeryEnd,
      patientLeftRoomTime: leftRoom,
      signOutTime: surgeryEnd,
      signOutPerformedBy: scrubNurse ? scrubNurse.fullName : holdingNurse.fullName,
      recordedBy: (scrubNurse || holdingNurse).id,
      timingNotes: 'Seeded surgical timing.',
    },
  });
  console.log('[12] Surgical timing recorded.');

  // 13) PATIENT MOVEMENT PHASE LOG -----------------------------------------
  const movements = [
    { phase: 'WARD', timestamp: enteredRoom },
    { phase: 'PORTER_DISPATCHED', timestamp: enteredRoom },
    { phase: 'HOLDING_AREA', timestamp: enteredRoom },
    { phase: 'INSIDE_THEATRE', timestamp: anaesthesiaStart },
    { phase: 'SURGERY_STARTED', timestamp: knifeOnSkin },
    { phase: 'SURGERY_ENDED', timestamp: surgeryEnd },
  ];
  for (const m of movements) {
    await prisma.patientMovement.create({
      data: {
        surgeryId: surgery.id,
        phase: m.phase,
        timestamp: m.timestamp,
        recordedBy: (scrubNurse || holdingNurse).id,
      },
    });
  }
  console.log('[13] Patient movement phases logged (Ward → Surgery ended).');

  // 14) PATIENT TRANSPORT LOG (porter) -------------------------------------
  if (porter) {
    await prisma.patientTransportLog.create({
      data: {
        porterId: porter.id,
        porterCode: porter.staffCode || 'PORTER',
        porterName: porter.fullName,
        patientId: patient.id,
        patientName: patient.name,
        patientFolderNumber: patient.folderNumber,
        surgeryId: surgery.id,
        fromLocation: 'Surgical Ward 3B',
        toLocation: 'Holding Area',
        transportType: 'Pre-Op Transfer',
        startTime: enteredRoom,
        endTime: new Date(enteredRoom.getTime() + 15 * 60 * 1000),
        durationMinutes: 15,
        status: 'COMPLETED',
        equipmentUsed: 'Bed',
        receivedBy: holdingNurse.fullName,
        receivedAt: new Date(enteredRoom.getTime() + 15 * 60 * 1000),
      },
    });
    console.log('[14] Patient transport log created (porter).');
  } else {
    console.log('[14] Skipped transport log (no porter user found).');
  }

  // SUMMARY ----------------------------------------------------------------
  console.log('\n========================================================');
  console.log(' TEST PATIENT SEEDED SUCCESSFULLY');
  console.log('========================================================');
  console.log(` Patient        : ${patient.name}`);
  console.log(` Folder number  : ${patient.folderNumber}`);
  console.log(` Patient ID     : ${patient.id}`);
  console.log(` Surgery ID     : ${surgery.id}`);
  console.log(` Surgery status : COMPLETED (no PACU record, no op note yet)`);
  console.log('--------------------------------------------------------');
  console.log(' Test it here:');
  console.log('   Completed list : /dashboard/surgeries/completed');
  console.log(`   Admit to PACU  : /dashboard/pacu/new?surgeryId=${surgery.id}`);
  console.log(`   Operation note : /dashboard/surgeries/${surgery.id}/post-op-notes`);
  console.log('========================================================\n');
}

main()
  .catch((e) => {
    console.error('\nSeed failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
