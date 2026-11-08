// ============================================================
// What a log book loads
// ------------------------------------------------------------
// Unlike the research include tree next door, this one DOES load the patient's
// folder number, because the College asks for it so an entry can be checked
// against the folder. It loads the patient's name too, so the export can offer
// it — but build.ts leaves that column out unless it is explicitly asked for.
// ============================================================

export const LOGBOOK_INCLUDE = {
  patient: {
    select: {
      name: true, folderNumber: true, age: true, ageUnit: true, gender: true,
      asaScore: true,
      fitnessAssessments: {
        select: {
          assessmentDate: true, diabetes: true, hypertension: true, heartDisease: true,
          asthma: true, kidneyDisease: true, liverDisease: true,
        },
        orderBy: { assessmentDate: 'desc' },
        take: 1,
      },
    },
  },
  mortality: { select: { timeOfDeath: true, causeOfDeath: true, location: true } },
  intraOperativeRecord: {
    select: { primarySurgeonId: true, complicationsOccurred: true, complicationDetails: true },
  },
  anesthesiaRecord: {
    select: {
      asaClassification: true, anesthesiaType: true, anesthesiaTechnique: true,
      hypotensionOccurred: true, hypertensionOccurred: true, bradycardiaOccurred: true,
      tachycardiaOccurred: true, desaturationOccurred: true, difficultAirway: true,
      anaphylaxis: true,
    },
  },
  pacuAssessment: {
    select: { dischargedTo: true, complicationsDetected: true, complicationDetails: true },
  },
  surgicalCount: { select: { discrepancyOccurred: true } },
  postOpNotes: {
    select: {
      signedAt: true, procedureName: true, procedurePerformed: true,
      operativeDiagnosis: true, postOpDiagnosis: true,
      complicationOccurred: true, complicationDetails: true,
    },
  },
  teamMembers: { select: { role: true, userId: true } },
} as const;
