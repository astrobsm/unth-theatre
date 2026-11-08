// ============================================================
// What a research query has to load, and what it must never load
// ------------------------------------------------------------
// ONE INCLUDE TREE, SELECTED FIELD BY FIELD. Loading whole relations would
// pull the patient's name, folder number, phone number and the free-text
// clinical narrative of every case into a process whose output is an
// anonymised dataset — and a field that was never loaded cannot leak.
//
// THE PATIENT SELECT IS THE ONE TO READ TWICE. It carries age, age unit, sex
// and ward and nothing else that identifies anybody: no name, no folder
// number, no phone, no caregiver. The research module has never needed them
// and must not be able to export them by accident.
//
// IT IS ALSO A PERFORMANCE DECISION. Thirteen relations over a year of cases
// is a large read; selecting columns rather than whole rows is what keeps it
// answerable on the theatre server as well as on Vercel.
// ============================================================

export const RESEARCH_INCLUDE = {
  patient: {
    // Deliberately four columns. See the header.
    select: { age: true, ageUnit: true, gender: true, ward: true,
      asaScore: true, whoRiskClass: true, finalRiskScore: true,
      fitnessForSurgery: true, dvtRiskScore: true, bleedingRiskScore: true,
      nutritionalStatus: true, pressureSoreRisk: true,
      onAnticoagulants: true, onAntiplatelets: true,
      hasActiveCancer: true, hasPriorDVT: true,
      // The comorbidity flags live here, on the patient, not on the case.
      // Newest first and one row: a patient with three operations has three
      // assessments, and the comorbidities at the first are not necessarily
      // the ones they had at the third.
      fitnessAssessments: {
        select: {
          assessmentDate: true, diabetes: true, hypertension: true,
          heartDisease: true, asthma: true, kidneyDisease: true,
          liverDisease: true, asaScore: true, fitnessLevel: true,
        },
        orderBy: { assessmentDate: 'desc' },
        take: 1,
      },
    },
  },
  surgeon: { select: { id: true, fullName: true, role: true } },
  anesthetist: { select: { id: true, fullName: true, role: true } },
  cancellation: { select: { category: true, reason: true, cancelledAt: true } },
  mortality: { select: { location: true, causeOfDeath: true, timeOfDeath: true } },
  surgicalTiming: {
    select: {
      patientEnteredRoomTime: true, anesthesiaStartTime: true, incisionTime: true,
      procedureStartTime: true, procedureEndTime: true, closureStartTime: true,
      closureEndTime: true, patientLeftRoomTime: true, patientExtubatedTime: true,
      anesthesiaDuration: true, surgicalDuration: true, totalORTime: true,
      closureDuration: true, turnoverTime: true,
      delayOccurred: true, delayReason: true, delayDuration: true,
      interruptionOccurred: true,
    },
  },
  intraOperativeRecord: {
    select: {
      theatreEntryTime: true, patientPositioning: true, anesthesiaStart: true,
      knifeToSkinTime: true, procedureEndTime: true,
      closureStartTime: true, closureEndTime: true,
      complicationsOccurred: true, specimensSent: true,
      bloodProductsGiven: true, drainsInserted: true,
      estimatedBloodLoss: true, urineOutput: true, transferToPACUTime: true,
    },
  },
  anesthesiaRecord: {
    select: {
      asaClassification: true, weightKg: true, heightCm: true,
      anesthesiaType: true, anesthesiaTechnique: true,
      airwayGrade: true, intubationAttempts: true, difficultAirway: true,
      spinalAttempts: true, spinalSuccessful: true,
      inductionTime: true, anesthesiaEndTime: true, anesthesiaDuration: true,
      hypotensionOccurred: true, hypertensionOccurred: true,
      bradycardiaOccurred: true, tachycardiaOccurred: true,
      desaturationOccurred: true, anaphylaxis: true,
      arterialLineInserted: true, centralLineInserted: true,
      etco2Monitored: true, postOpVentilation: true, transferToICU: true,
      totalFluidInput: true, urineOutput: true, estimatedBloodLoss: true,
    },
  },
  surgicalCount: {
    select: {
      allCountsCorrect: true, discrepancyOccurred: true, discrepancyResolved: true,
      xRayOrdered: true, countSheetCompleted: true,
    },
  },
  pacuAssessment: {
    select: {
      admissionTime: true, dischargeTime: true, dischargedTo: true,
      aldreteActivity: true, aldreteRespiration: true, aldreteCirculation: true,
      aldreteConsciousness: true, aldreteOxygenSaturation: true,
      painScoreOnAdmission: true, nauseaPresent: true, vomitingOccurred: true,
      normothermic: true, oxygenTherapy: true,
      complicationsDetected: true, redAlertTriggered: true,
    },
  },
  holdingAreaAssessment: {
    select: {
      arrivalTime: true, transferTime: true,
      patientIdentityConfirmed: true, surgicalSiteMarked: true, operationSiteMarked: true,
      lateralityConfirmed: true, fastingCompliant: true, nilPerOralMaintained: true,
      consentFormSigned: true, hasAllergies: true, allDocumentationComplete: true,
      redAlertTriggered: true, oxygenSaturation: true, spo2: true,
      heartRate: true, pulseRate: true, patientReadyForSurgery: true,
    },
  },
  whoChecklists: {
    select: {
      checklistCompletedAt: true, updatedAt: true,
      patientConfirmed: true, hasPatientConfirmedIdentity: true,
      teamIntroduced: true, haveTeamMembersIntroduced: true, criticalStepsReviewed: true,
      procedureRecorded: true, nurseVerballyConfirms: true,
      antibioticGiven: true, pulseOximeterOn: true, isPulseOximeterOnPatient: true,
      difficultyAirwayRisk: true, aspirationRisk: true, riskOfBloodLoss: true,
      hasSterilityBeenConfirmed: true, imagingDisplayed: true,
      equipmentProblems: true, specimenLabeled: true, asaGrade: true,
    },
  },
  postOpNotes: {
    select: {
      signedAt: true, procedureName: true, procedurePerformed: true,
      operativeDiagnosis: true, postOpDiagnosis: true, findings: true,
      woundClass: true, contaminationPresent: true, pusPresent: true,
      implantPlaced: true, tourniquetMinutes: true, incisionLengthCm: true,
      haemostasisSatisfactory: true, estimatedBloodLossMl: true,
      complicationOccurred: true, procedureChanged: true, fluidsGivenMl: true,
    },
  },
  preOpReviews: {
    select: {
      status: true, reviewDate: true, asaClass: true, airwayClass: true,
      neckMovement: true, dentition: true, fastingStatus: true,
      proposedAnesthesiaType: true, riskLevel: true, fitnessDecision: true,
      weight: true, height: true, hemoglobin: true, plateletCount: true,
      ptInr: true, creatinine: true, sodium: true, potassium: true,
      bloodGlucose: true, anaesthesiaConsentSignedAt: true, createdAt: true,
      optimisationRequirements: { select: { id: true } },
    },
  },
  bloodRequests: {
    select: {
      requestedAt: true, readyAt: true, unitsRequested: true,
      bloodType: true, rhFactor: true, crossMatchCompleted: true, status: true,
    },
  },
  teamMembers: { select: { role: true, userId: true } },
  movements: { select: { phase: true, timestamp: true } },
} as const;
