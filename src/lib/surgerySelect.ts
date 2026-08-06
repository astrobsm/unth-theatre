// ============================================================
// Selecting a surgery without dragging its attachments along
// ------------------------------------------------------------
// Surgery carries three @db.Text columns that hold base64 FILE CONTENTS:
// consentFileData (a scanned or generated consent PDF), consentFormData and
// complexityData. A single row measured 4.27 MB.
//
// Prisma has no way to say "every column except these", so any `include` on a
// surgery pulls all three. That is how a monthly report became a 33 MB, 62
// second response that timed out, and how a list of seventeen blood requests
// came to 8.47 MB.
//
// This is every scalar EXCEPT those three. Use it wherever a surgery is
// listed. Fetch the attachments deliberately, by id, when something actually
// needs to display one.
// ============================================================

export const SURGERY_WITHOUT_ATTACHMENTS = {
  id: true,
  patientId: true,
  surgeonId: true,
  surgeonName: true,
  assistantSurgeonId: true,
  anesthetistId: true,
  scrubNurseId: true,
  theatreTechnicianId: true,
  subspecialty: true,
  unit: true,
  location: true,
  theatreId: true,
  indication: true,
  procedureName: true,
  scheduledDate: true,
  scheduledTime: true,
  estimatedDuration: true,
  magnitude: true,
  needICU: true,
  needBloodTransfusion: true,
  needDiathermy: true,
  needStereo: true,
  needMontrellMattress: true,
  needStirups: true,
  needPneumaticTourniquet: true,
  needCArm: true,
  needMicroscope: true,
  needSuction: true,
  otherSpecialNeeds: true,
  remarks: true,
  recentHb: true,
  hbSampleAt: true,
  potassium: true,
  sodium: true,
  creatinine: true,
  hbsAgStatus: true,
  hcvStatus: true,
  hivStatus: true,
  bloodPressureSystolic: true,
  bloodPressureDiastolic: true,
  bleedingRiskLevel: true,
  nutritionalStatusAtBooking: true,
  pressureSoreRiskAtBooking: true,
  totalItemsCost: true,
  patientCharge: true,
  depositAmount: true,
  depositConfirmed: true,
  knifeOnSkinTime: true,
  surgeryEndTime: true,
  completedAt: true,
  actualStartTime: true,
  actualEndTime: true,
  createdAt: true,
  updatedAt: true,
  complexityScore: true,
  complexityClass: true,
  complexityAssessedAt: true,
  complexityAssessedBy: true,
  postOpDestination: true,
  isDayCase: true,
  listOrder: true,
  supervisingConsultantId: true,
  supervisingConsultantName: true,
  consentFileName: true,
  consentFileMimeType: true,
  consentUploadedAt: true,
  consentUploadedById: true,
  consentSignedElectronically: true,
  consentCompletedAt: true,
  consumablePackCode: true,
  pharmacyDrugCode: true,
  anaesthesiaDrugCode: true,
} as const;
