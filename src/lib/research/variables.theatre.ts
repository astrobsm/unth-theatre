// ============================================================
// Research variables: inside the theatre
// ------------------------------------------------------------
// The holding area, the WHO checklist, the process intervals, the operation
// itself, the conduct of the anaesthetic, and the surgical counts.
//
// THE INTERVALS ARE THE POINT OF THIS FILE. A theatre has four clocks running
// at once — the room, the anaesthetic, the operation and the surgeon — and
// almost every efficiency question is about the gaps between them rather than
// about any one of them. Each interval here is computed from two named
// timestamps by one pure function, so a figure in a paper can be traced to the
// two moments it came from.
//
// AND EACH ONE FALLS BACK HONESTLY. Three different screens write theatre
// timings: the surgical timing sheet, the intraoperative record, and the
// coarse timestamps on the case itself. The timing sheet is preferred where it
// exists because it is the one recorded at the time by somebody standing in
// the room; the others stand in rather than leaving a case out, and the
// fallback order is written down in each variable's help so a reader knows
// which clock a figure came from.
// ============================================================

import type { ResearchVariable, RawCase } from './types';
import { rec, at, whoChecklist, operationNote, movementAt } from './access';
import {
  num, text, flag, minutesBetween, startDelayMinutes, startedOnTime,
  overrunMinutes, overrunRatio, bloodLossPerHour, outOfHours, hourOfDay,
  whoPhasesComplete, whoFullyCompliant, woundClass,
} from './derive';

const v = (x: ResearchVariable): ResearchVariable => x;

// ── The four clocks, resolved once each ─────────────────────────────

/** When the patient entered the operating room. */
export const roomInAt = (c: RawCase): unknown =>
  at(c, 'surgicalTiming', 'patientEnteredRoomTime')
  ?? at(c, 'intraOperativeRecord', 'theatreEntryTime')
  ?? movementAt(c, 'ENTERED_THEATRE');

/** When the patient left the operating room. */
export const roomOutAt = (c: RawCase): unknown =>
  at(c, 'surgicalTiming', 'patientLeftRoomTime')
  ?? at(c, 'intraOperativeRecord', 'transferToPACUTime')
  ?? c.actualEndTime;

/** Knife to skin. */
export const incisionAt = (c: RawCase): unknown =>
  at(c, 'surgicalTiming', 'incisionTime')
  ?? at(c, 'intraOperativeRecord', 'knifeToSkinTime')
  ?? c.knifeOnSkinTime
  ?? c.actualStartTime;

/** End of the procedure. */
export const procedureEndAt = (c: RawCase): unknown =>
  at(c, 'surgicalTiming', 'procedureEndTime')
  ?? at(c, 'intraOperativeRecord', 'procedureEndTime')
  ?? c.surgeryEndTime
  ?? c.actualEndTime;

/** Induction of anaesthesia. */
export const anaesthesiaStartAt = (c: RawCase): unknown =>
  at(c, 'surgicalTiming', 'anesthesiaStartTime')
  ?? at(c, 'intraOperativeRecord', 'anesthesiaStart')
  ?? at(c, 'anesthesiaRecord', 'inductionTime');

/** The operating time: incision to the end of the procedure. */
export const operatingMinutes = (c: RawCase): number | null =>
  minutesBetween(incisionAt(c) as never, procedureEndAt(c) as never);

export const PROCESS_VARIABLES: readonly ResearchVariable[] = [
  v({
    key: 'operatingMinutes', label: 'Operating time', domain: 'process', kind: 'numeric', unit: 'minutes',
    derived: true,
    help: 'Incision to end of procedure. Taken from the surgical timing sheet, then the intraoperative record, then the case timestamps.',
    source: 'Surgical timing sheet',
    read: (c) => operatingMinutes(c),
  }),
  v({
    key: 'totalOrMinutes', label: 'Total theatre time', domain: 'process', kind: 'numeric', unit: 'minutes',
    derived: true,
    help: 'Patient into the room to patient out of the room. Always longer than the operating time, and it is what the theatre actually spent.',
    source: 'Surgical timing sheet',
    read: (c) => minutesBetween(roomInAt(c) as never, roomOutAt(c) as never)
      ?? num(at(c, 'surgicalTiming', 'totalORTime')),
  }),
  v({
    key: 'anaesthesiaMinutes', label: 'Anaesthesia time', domain: 'process', kind: 'numeric', unit: 'minutes',
    derived: true,
    help: 'Induction to the end of anaesthesia.',
    source: 'Anaesthesia record',
    read: (c) => minutesBetween(anaesthesiaStartAt(c) as never, at(c, 'anesthesiaRecord', 'anesthesiaEndTime') as never)
      ?? num(at(c, 'surgicalTiming', 'anesthesiaDuration'))
      ?? num(at(c, 'anesthesiaRecord', 'anesthesiaDuration')),
  }),
  v({
    key: 'inductionToIncisionMinutes', label: 'Induction to incision', domain: 'process',
    kind: 'numeric', unit: 'minutes', derived: true,
    help: 'How long the patient was anaesthetised before the operation began: positioning, prepping, drapes and the time out.',
    source: 'Surgical timing sheet',
    read: (c) => minutesBetween(anaesthesiaStartAt(c) as never, incisionAt(c) as never),
  }),
  v({
    key: 'roomInToIncisionMinutes', label: 'Room entry to incision', domain: 'process',
    kind: 'numeric', unit: 'minutes', derived: true,
    help: 'Everything between the patient arriving in the room and the knife. The largest recoverable block in most lists.',
    source: 'Surgical timing sheet',
    read: (c) => minutesBetween(roomInAt(c) as never, incisionAt(c) as never),
  }),
  v({
    key: 'closureMinutes', label: 'Closure time', domain: 'process', kind: 'numeric', unit: 'minutes',
    derived: true,
    help: 'Start of closure to the end of closure.',
    source: 'Surgical timing sheet',
    read: (c) => minutesBetween(at(c, 'surgicalTiming', 'closureStartTime') as never,
      at(c, 'surgicalTiming', 'closureEndTime') as never)
      ?? minutesBetween(at(c, 'intraOperativeRecord', 'closureStartTime') as never,
        at(c, 'intraOperativeRecord', 'closureEndTime') as never)
      ?? num(at(c, 'surgicalTiming', 'closureDuration')),
  }),
  v({
    key: 'procedureEndToRoomOutMinutes', label: 'Procedure end to room exit', domain: 'process',
    kind: 'numeric', unit: 'minutes', derived: true,
    help: 'Emergence, extubation and transfer. The tail of the case, and the part a list manager can least afford to ignore.',
    source: 'Surgical timing sheet',
    read: (c) => minutesBetween(procedureEndAt(c) as never, roomOutAt(c) as never),
  }),
  v({
    key: 'turnoverMinutes', label: 'Turnover time', domain: 'process', kind: 'numeric', unit: 'minutes',
    help: 'Recorded turnover between this case and the previous one in the same room.',
    source: 'Surgical timing sheet',
    read: (c) => num(at(c, 'surgicalTiming', 'turnoverTime')),
  }),
];

/** The on-time-start measures, kept together because they share one input. */
const delayOf = (c: RawCase): number | null =>
  startDelayMinutes(c.scheduledDate as never, text(c.scheduledTime), incisionAt(c) as never);

export const TIMELINESS_VARIABLES: readonly ResearchVariable[] = [
  v({
    key: 'startDelayMinutes', label: 'Start delay against listed time', domain: 'process',
    kind: 'numeric', unit: 'minutes', derived: true,
    help: 'Incision time against the time the case was listed for. Negative means it started early, which is kept because it is a real observation and not an error.',
    source: 'Booking and surgical timing sheet',
    read: (c) => delayOf(c),
  }),
  v({
    key: 'startedOnTime', label: 'Started within 15 minutes', domain: 'process', kind: 'boolean',
    derived: true,
    help: 'The usual audit line for on-time starts.',
    source: 'Booking and surgical timing sheet',
    read: (c) => startedOnTime(delayOf(c)),
  }),
  v({
    key: 'overrunMinutes', label: 'Over-run against estimate', domain: 'process', kind: 'numeric',
    unit: 'minutes', derived: true,
    help: 'Operating time minus the duration estimated at booking. Positive is an over-run.',
    source: 'Booking and surgical timing sheet',
    read: (c) => overrunMinutes(c.estimatedDuration, operatingMinutes(c)),
  }),
  v({
    key: 'overrunRatio', label: 'Actual over estimated duration', domain: 'process', kind: 'numeric',
    derived: true,
    help: 'One is a perfect estimate. Reported beside the minutes because short and long cases are not mis-estimated in the same proportion.',
    source: 'Booking and surgical timing sheet',
    read: (c) => overrunRatio(c.estimatedDuration, operatingMinutes(c)),
  }),
  v({
    key: 'delayOccurred', label: 'Delay recorded', domain: 'process', kind: 'boolean',
    help: 'A delay was recorded on the timing sheet.',
    source: 'Surgical timing sheet',
    read: (c) => flag(at(c, 'surgicalTiming', 'delayOccurred')),
  }),
  v({
    key: 'delayMinutes', label: 'Delay duration', domain: 'process', kind: 'numeric', unit: 'minutes',
    help: 'How long the recorded delay lasted.',
    source: 'Surgical timing sheet',
    read: (c) => num(at(c, 'surgicalTiming', 'delayDuration')),
  }),
  v({
    key: 'delayReason', label: 'Delay reason', domain: 'process', kind: 'categorical',
    help: 'Why the case was delayed, as recorded.',
    source: 'Surgical timing sheet',
    read: (c) => text(at(c, 'surgicalTiming', 'delayReason')),
  }),
  v({
    key: 'interruptionOccurred', label: 'Interruption recorded', domain: 'process', kind: 'boolean',
    help: 'The operation was interrupted once under way.',
    source: 'Surgical timing sheet',
    read: (c) => flag(at(c, 'surgicalTiming', 'interruptionOccurred')),
  }),
  v({
    key: 'startHour', label: 'Hour of incision', domain: 'process', kind: 'numeric', derived: true,
    help: 'Hour of the day the operation began, 0 to 23 in local time.',
    source: 'Surgical timing sheet',
    read: (c) => hourOfDay(incisionAt(c) as never),
  }),
  v({
    key: 'outOfHours', label: 'Out of hours', domain: 'process', kind: 'boolean', derived: true,
    help: 'Operated outside 08:00 to 18:00 on a weekday, or at a weekend. A standard adjustment variable: the team is smaller and the support services thinner.',
    source: 'Surgical timing sheet',
    read: (c) => outOfHours(incisionAt(c) as never),
  }),
];

export const HOLDING_VARIABLES: readonly ResearchVariable[] = [
  v({
    key: 'holdingAssessed', label: 'Holding area assessment done', domain: 'holding',
    kind: 'boolean', derived: true,
    help: 'A holding area assessment exists for the case.',
    source: 'Holding area',
    read: (c) => rec(c, 'holdingAreaAssessment') !== null,
  }),
  v({
    key: 'holdingToTheatreMinutes', label: 'Holding area wait', domain: 'holding',
    kind: 'numeric', unit: 'minutes', derived: true,
    help: 'Arrival in the holding area to transfer into theatre. The patient is gowned and fasting for the whole of it.',
    source: 'Holding area',
    read: (c) => minutesBetween(at(c, 'holdingAreaAssessment', 'arrivalTime') as never,
      at(c, 'holdingAreaAssessment', 'transferTime') as never),
  }),
  v({
    key: 'identityConfirmed', label: 'Identity confirmed', domain: 'holding', kind: 'boolean',
    help: 'Patient identity verified in the holding area.',
    source: 'Holding area',
    read: (c) => flag(at(c, 'holdingAreaAssessment', 'patientIdentityConfirmed')),
  }),
  v({
    key: 'siteMarked', label: 'Operation site marked', domain: 'holding', kind: 'boolean',
    help: 'The site was marked before the patient went to theatre. A never-event prevention measure.',
    source: 'Holding area',
    read: (c) => flag(at(c, 'holdingAreaAssessment', 'surgicalSiteMarked'))
      ?? flag(at(c, 'holdingAreaAssessment', 'operationSiteMarked')),
  }),
  v({
    key: 'lateralityConfirmed', label: 'Laterality confirmed', domain: 'holding', kind: 'boolean',
    help: 'Left or right confirmed against the consent and the list.',
    source: 'Holding area',
    read: (c) => flag(at(c, 'holdingAreaAssessment', 'lateralityConfirmed')),
  }),
  v({
    key: 'fastingCompliant', label: 'Fasting compliant', domain: 'holding', kind: 'boolean',
    help: 'The patient had kept to the fasting instruction.',
    source: 'Holding area',
    read: (c) => flag(at(c, 'holdingAreaAssessment', 'fastingCompliant'))
      ?? flag(at(c, 'holdingAreaAssessment', 'nilPerOralMaintained')),
  }),
  v({
    key: 'consentSignedAtHolding', label: 'Consent signed', domain: 'holding', kind: 'boolean',
    help: 'A signed consent was present in the holding area.',
    source: 'Holding area',
    read: (c) => flag(at(c, 'holdingAreaAssessment', 'consentFormSigned')),
  }),
  v({
    key: 'allergiesPresent', label: 'Known allergies', domain: 'holding', kind: 'boolean',
    help: 'Allergies recorded at the holding area check.',
    source: 'Holding area',
    read: (c) => flag(at(c, 'holdingAreaAssessment', 'hasAllergies')),
  }),
  v({
    key: 'documentationCompleteAtHolding', label: 'Documentation complete', domain: 'holding',
    kind: 'boolean',
    help: 'Every document the holding area expects was in the folder.',
    source: 'Holding area',
    read: (c) => flag(at(c, 'holdingAreaAssessment', 'allDocumentationComplete')),
  }),
  v({
    key: 'holdingRedAlert', label: 'Red alert in holding area', domain: 'holding', kind: 'boolean',
    help: 'A red alert was raised before the patient reached theatre.',
    source: 'Holding area',
    read: (c) => flag(at(c, 'holdingAreaAssessment', 'redAlertTriggered')),
  }),
  v({
    key: 'holdingSpo2', label: 'Oxygen saturation in holding', domain: 'holding', kind: 'numeric', unit: '%',
    help: 'SpO2 recorded at the holding area check.',
    source: 'Holding area',
    read: (c) => num(at(c, 'holdingAreaAssessment', 'oxygenSaturation'))
      ?? num(at(c, 'holdingAreaAssessment', 'spo2')),
  }),
  v({
    key: 'holdingPulse', label: 'Pulse in holding', domain: 'holding', kind: 'numeric', unit: '/min',
    help: 'Pulse recorded at the holding area check.',
    source: 'Holding area',
    read: (c) => num(at(c, 'holdingAreaAssessment', 'heartRate'))
      ?? num(at(c, 'holdingAreaAssessment', 'pulseRate')),
  }),
  v({
    key: 'readyForSurgery', label: 'Declared ready for surgery', domain: 'holding', kind: 'boolean',
    help: 'The holding area declared the patient ready.',
    source: 'Holding area',
    read: (c) => flag(at(c, 'holdingAreaAssessment', 'patientReadyForSurgery')),
  }),
];

/** The three WHO phases, each read from the field that marks it performed. */
const whoPhases = (c: RawCase) => {
  const w = whoChecklist(c);
  if (!w) return null;
  return {
    signIn: w.patientConfirmed === true || w.hasPatientConfirmedIdentity === true,
    timeOut: w.teamIntroduced === true || w.haveTeamMembersIntroduced === true
      || w.criticalStepsReviewed === true,
    signOut: w.procedureRecorded === true || w.nurseVerballyConfirms === true,
  };
};

export const WHO_VARIABLES: readonly ResearchVariable[] = [
  v({
    key: 'whoChecklistExists', label: 'WHO checklist recorded', domain: 'who', kind: 'boolean',
    derived: true,
    help: 'A checklist exists for the case at all. Where several exist the completed one is used, because an abandoned draft has every box unticked and would report a compliant team as non-compliant.',
    source: 'WHO surgical safety checklist',
    read: (c) => whoChecklist(c) !== null,
  }),
  v({
    key: 'whoSignIn', label: 'Sign in performed', domain: 'who', kind: 'boolean', derived: true,
    help: 'The sign-in phase, before induction.',
    source: 'WHO surgical safety checklist',
    read: (c) => whoPhases(c)?.signIn ?? null,
  }),
  v({
    key: 'whoTimeOut', label: 'Time out performed', domain: 'who', kind: 'boolean', derived: true,
    help: 'The time-out phase, before incision.',
    source: 'WHO surgical safety checklist',
    read: (c) => whoPhases(c)?.timeOut ?? null,
  }),
  v({
    key: 'whoSignOut', label: 'Sign out performed', domain: 'who', kind: 'boolean', derived: true,
    help: 'The sign-out phase, before the patient leaves the room.',
    source: 'WHO surgical safety checklist',
    read: (c) => whoPhases(c)?.signOut ?? null,
  }),
  v({
    key: 'whoPhasesComplete', label: 'WHO phases completed', domain: 'who', kind: 'numeric',
    derived: true,
    help: 'How many of the three phases were performed. Kept as a count rather than one flag because the three are done by different people at different moments, and a single flag hides which one is being skipped.',
    source: 'WHO surgical safety checklist',
    read: (c) => whoPhasesComplete(whoPhases(c) ?? {}),
  }),
  v({
    key: 'whoFullyCompliant', label: 'All three WHO phases', domain: 'who', kind: 'boolean',
    derived: true,
    help: 'The compliance numerator: all three phases recorded.',
    source: 'WHO surgical safety checklist',
    read: (c) => whoFullyCompliant(whoPhases(c) ?? {}),
  }),
  v({
    key: 'antibioticProphylaxis', label: 'Antibiotic prophylaxis given', domain: 'who', kind: 'boolean',
    help: 'Prophylactic antibiotic given within the hour before incision, as recorded at the time out.',
    source: 'WHO surgical safety checklist',
    read: (c) => flag(whoChecklist(c)?.antibioticGiven),
  }),
  v({
    key: 'pulseOximeterOn', label: 'Pulse oximeter on patient', domain: 'who', kind: 'boolean',
    help: 'Confirmed at sign in.',
    source: 'WHO surgical safety checklist',
    read: (c) => flag(whoChecklist(c)?.pulseOximeterOn)
      ?? flag(whoChecklist(c)?.isPulseOximeterOnPatient),
  }),
  v({
    key: 'difficultAirwayAnticipated', label: 'Difficult airway anticipated', domain: 'who',
    kind: 'boolean',
    help: 'Flagged at sign in, before induction.',
    source: 'WHO surgical safety checklist',
    read: (c) => flag(whoChecklist(c)?.difficultyAirwayRisk),
  }),
  v({
    key: 'aspirationRiskFlagged', label: 'Aspiration risk flagged', domain: 'who', kind: 'boolean',
    help: 'Flagged at sign in.',
    source: 'WHO surgical safety checklist',
    read: (c) => flag(whoChecklist(c)?.aspirationRisk),
  }),
  v({
    key: 'bloodLossRiskFlagged', label: 'Major blood loss anticipated', domain: 'who', kind: 'boolean',
    help: 'Flagged at sign in, which is when two intravenous lines would be planned.',
    source: 'WHO surgical safety checklist',
    read: (c) => flag(whoChecklist(c)?.riskOfBloodLoss),
  }),
  v({
    key: 'sterilityConfirmed', label: 'Instrument sterility confirmed', domain: 'who', kind: 'boolean',
    help: 'Confirmed by the scrub nurse at the time out.',
    source: 'WHO surgical safety checklist',
    read: (c) => flag(whoChecklist(c)?.hasSterilityBeenConfirmed),
  }),
  v({
    key: 'imagingDisplayed', label: 'Essential imaging displayed', domain: 'who', kind: 'boolean',
    help: 'Confirmed at the time out.',
    source: 'WHO surgical safety checklist',
    read: (c) => flag(whoChecklist(c)?.imagingDisplayed),
  }),
  v({
    key: 'equipmentProblems', label: 'Equipment problems at sign out', domain: 'who', kind: 'boolean',
    help: 'Equipment problems declared at the sign out.',
    source: 'WHO surgical safety checklist',
    read: (c) => flag(whoChecklist(c)?.equipmentProblems),
  }),
  v({
    key: 'specimenLabelled', label: 'Specimen labelled', domain: 'who', kind: 'boolean',
    help: 'Specimen labelling confirmed aloud at the sign out.',
    source: 'WHO surgical safety checklist',
    read: (c) => flag(whoChecklist(c)?.specimenLabeled),
  }),
];

export const INTRAOP_VARIABLES: readonly ResearchVariable[] = [
  v({
    key: 'bloodLossMl', label: 'Estimated blood loss', domain: 'intraop', kind: 'numeric', unit: 'mL',
    help: 'From the signed operation note, then the anaesthesia record, then the intraoperative record.',
    source: 'Signed operation note',
    read: (c) => num(operationNote(c)?.estimatedBloodLossMl)
      ?? num(at(c, 'anesthesiaRecord', 'estimatedBloodLoss'))
      ?? num(at(c, 'intraOperativeRecord', 'estimatedBloodLoss')),
  }),
  v({
    key: 'bloodLossPerHour', label: 'Blood loss per operating hour', domain: 'intraop',
    kind: 'numeric', unit: 'mL/h', derived: true,
    help: 'Comparable across long and short cases, which raw blood loss is not.',
    source: 'Signed operation note and surgical timing sheet',
    read: (c) => bloodLossPerHour(
      num(operationNote(c)?.estimatedBloodLossMl)
      ?? num(at(c, 'anesthesiaRecord', 'estimatedBloodLoss'))
      ?? num(at(c, 'intraOperativeRecord', 'estimatedBloodLoss')),
      operatingMinutes(c),
    ),
  }),
  v({
    key: 'woundClass', label: 'Wound class', domain: 'intraop', kind: 'categorical', derived: true,
    values: ['Clean', 'Clean-contaminated', 'Contaminated', 'Dirty'],
    help: 'Normalised to the four standard classes. Infection risk is stratified on this variable, and four spellings of one class is four cohorts too small to say anything with.',
    source: 'Signed operation note',
    read: (c) => woundClass(operationNote(c)?.woundClass),
  }),
  v({
    key: 'contaminationPresent', label: 'Contamination found', domain: 'intraop', kind: 'boolean',
    help: 'Contamination recorded in the operative findings.',
    source: 'Signed operation note',
    read: (c) => flag(operationNote(c)?.contaminationPresent),
  }),
  v({
    key: 'pusPresent', label: 'Pus found', domain: 'intraop', kind: 'boolean',
    help: 'Pus recorded in the operative findings.',
    source: 'Signed operation note',
    read: (c) => flag(operationNote(c)?.pusPresent),
  }),
  v({
    key: 'implantPlaced', label: 'Implant placed', domain: 'intraop', kind: 'boolean',
    help: 'An implant or prosthesis was placed.',
    source: 'Signed operation note',
    read: (c) => flag(operationNote(c)?.implantPlaced),
  }),
  v({
    key: 'tourniquetMinutes', label: 'Tourniquet time', domain: 'intraop', kind: 'numeric', unit: 'minutes',
    help: 'Tourniquet time recorded on the note.',
    source: 'Signed operation note',
    read: (c) => num(operationNote(c)?.tourniquetMinutes),
  }),
  v({
    key: 'incisionLengthCm', label: 'Incision length', domain: 'intraop', kind: 'numeric', unit: 'cm',
    help: 'Incision length recorded on the note.',
    source: 'Signed operation note',
    read: (c) => num(operationNote(c)?.incisionLengthCm),
  }),
  v({
    key: 'haemostasisSatisfactory', label: 'Haemostasis satisfactory', domain: 'intraop', kind: 'boolean',
    help: 'Declared satisfactory on the signed note.',
    source: 'Signed operation note',
    read: (c) => flag(operationNote(c)?.haemostasisSatisfactory),
  }),
  v({
    key: 'drainsInserted', label: 'Drain inserted', domain: 'intraop', kind: 'boolean',
    help: 'A drain was left in at the end of the operation.',
    source: 'Intraoperative record',
    read: (c) => flag(at(c, 'intraOperativeRecord', 'drainsInserted')),
  }),
  v({
    key: 'intraOpComplication', label: 'Intraoperative complication', domain: 'intraop', kind: 'boolean',
    help: 'A complication during the operation, from the note or the intraoperative record.',
    source: 'Signed operation note',
    read: (c) => flag(operationNote(c)?.complicationOccurred)
      ?? flag(at(c, 'intraOperativeRecord', 'complicationsOccurred')),
  }),
  v({
    key: 'patientPositioning', label: 'Patient position', domain: 'intraop', kind: 'categorical',
    help: 'Supine, prone, lateral or lithotomy, as recorded.',
    source: 'Intraoperative record',
    read: (c) => text(at(c, 'intraOperativeRecord', 'patientPositioning')),
  }),
  v({
    key: 'urineOutputMl', label: 'Intraoperative urine output', domain: 'intraop', kind: 'numeric', unit: 'mL',
    help: 'Urine output over the operation.',
    source: 'Anaesthesia record',
    read: (c) => num(at(c, 'anesthesiaRecord', 'urineOutput'))
      ?? num(at(c, 'intraOperativeRecord', 'urineOutput')),
  }),
  v({
    key: 'fluidsGivenMl', label: 'Total fluid input', domain: 'intraop', kind: 'numeric', unit: 'mL',
    help: 'Crystalloid, colloid and blood together.',
    source: 'Anaesthesia record',
    read: (c) => num(at(c, 'anesthesiaRecord', 'totalFluidInput'))
      ?? num(operationNote(c)?.fluidsGivenMl),
  }),
];

export const ANAESTHESIA_VARIABLES: readonly ResearchVariable[] = [
  v({
    key: 'anaesthesiaType', label: 'Anaesthesia type', domain: 'anaesthesia', kind: 'categorical',
    help: 'The technique actually used, from the anaesthesia record and then the case.',
    source: 'Anaesthesia record',
    read: (c) => text(at(c, 'anesthesiaRecord', 'anesthesiaType')) ?? text(c.anesthesiaType),
  }),
  v({
    key: 'anaesthesiaTechnique', label: 'Technique detail', domain: 'anaesthesia', kind: 'categorical',
    help: 'The sub-technique recorded, such as the spinal level or the block performed.',
    source: 'Anaesthesia record',
    read: (c) => text(at(c, 'anesthesiaRecord', 'anesthesiaTechnique')),
  }),
  v({
    key: 'airwayGrade', label: 'Laryngoscopy grade', domain: 'anaesthesia', kind: 'categorical',
    help: 'Cormack-Lehane grade at laryngoscopy. The outcome in every difficult-airway analysis.',
    source: 'Anaesthesia record',
    read: (c) => text(at(c, 'anesthesiaRecord', 'airwayGrade')),
  }),
  v({
    key: 'intubationAttempts', label: 'Intubation attempts', domain: 'anaesthesia', kind: 'numeric',
    help: 'How many attempts were needed.',
    source: 'Anaesthesia record',
    read: (c) => num(at(c, 'anesthesiaRecord', 'intubationAttempts')),
  }),
  v({
    key: 'difficultAirway', label: 'Difficult airway encountered', domain: 'anaesthesia', kind: 'boolean',
    help: 'A difficult airway was met, as against merely anticipated at sign in.',
    source: 'Anaesthesia record',
    read: (c) => flag(at(c, 'anesthesiaRecord', 'difficultAirway')),
  }),
  v({
    key: 'spinalAttempts', label: 'Spinal attempts', domain: 'anaesthesia', kind: 'numeric',
    help: 'Attempts at the spinal.',
    source: 'Anaesthesia record',
    read: (c) => num(at(c, 'anesthesiaRecord', 'spinalAttempts')),
  }),
  v({
    key: 'spinalSuccessful', label: 'Spinal successful', domain: 'anaesthesia', kind: 'boolean',
    help: 'The spinal was achieved. A regional-technique success rate needs this and the attempts together.',
    source: 'Anaesthesia record',
    read: (c) => flag(at(c, 'anesthesiaRecord', 'spinalSuccessful')),
  }),
  v({
    key: 'hypotensionOccurred', label: 'Hypotension', domain: 'anaesthesia', kind: 'boolean',
    help: 'Intraoperative hypotension requiring management.',
    source: 'Anaesthesia record',
    read: (c) => flag(at(c, 'anesthesiaRecord', 'hypotensionOccurred')),
  }),
  v({
    key: 'bradycardiaOccurred', label: 'Bradycardia', domain: 'anaesthesia', kind: 'boolean',
    help: 'Intraoperative bradycardia requiring management.',
    source: 'Anaesthesia record',
    read: (c) => flag(at(c, 'anesthesiaRecord', 'bradycardiaOccurred')),
  }),
  v({
    key: 'desaturationOccurred', label: 'Desaturation', domain: 'anaesthesia', kind: 'boolean',
    help: 'Intraoperative desaturation requiring management.',
    source: 'Anaesthesia record',
    read: (c) => flag(at(c, 'anesthesiaRecord', 'desaturationOccurred')),
  }),
  v({
    key: 'anaphylaxis', label: 'Anaphylaxis', domain: 'anaesthesia', kind: 'boolean',
    help: 'Anaphylaxis during the anaesthetic.',
    source: 'Anaesthesia record',
    read: (c) => flag(at(c, 'anesthesiaRecord', 'anaphylaxis')),
  }),
  v({
    key: 'anaestheticEvent', label: 'Any anaesthetic event', domain: 'anaesthesia', kind: 'boolean',
    derived: true,
    help: 'Hypotension, hypertension, bradycardia, tachycardia, desaturation, difficult airway or anaphylaxis. Null when no anaesthesia record exists.',
    source: 'Anaesthesia record',
    read: (c) => {
      const a = rec(c, 'anesthesiaRecord');
      if (!a) return null;
      const keys = ['hypotensionOccurred', 'hypertensionOccurred', 'bradycardiaOccurred',
        'tachycardiaOccurred', 'desaturationOccurred', 'difficultAirway', 'anaphylaxis'];
      return keys.some((k) => a[k] === true);
    },
  }),
  v({
    key: 'arterialLine', label: 'Arterial line', domain: 'anaesthesia', kind: 'boolean',
    help: 'An arterial line was inserted.',
    source: 'Anaesthesia record',
    read: (c) => flag(at(c, 'anesthesiaRecord', 'arterialLineInserted')),
  }),
  v({
    key: 'centralLine', label: 'Central line', domain: 'anaesthesia', kind: 'boolean',
    help: 'A central venous line was inserted.',
    source: 'Anaesthesia record',
    read: (c) => flag(at(c, 'anesthesiaRecord', 'centralLineInserted')),
  }),
  v({
    key: 'postOpVentilation', label: 'Ventilated after surgery', domain: 'anaesthesia', kind: 'boolean',
    help: 'The patient left theatre still ventilated.',
    source: 'Anaesthesia record',
    read: (c) => flag(at(c, 'anesthesiaRecord', 'postOpVentilation')),
  }),
  v({
    key: 'etco2Monitored', label: 'Capnography used', domain: 'anaesthesia', kind: 'boolean',
    help: 'End-tidal carbon dioxide monitoring, a minimum monitoring standard under general anaesthesia.',
    source: 'Anaesthesia record',
    read: (c) => flag(at(c, 'anesthesiaRecord', 'etco2Monitored')),
  }),
];

export const COUNT_VARIABLES: readonly ResearchVariable[] = [
  v({
    key: 'countsAllCorrect', label: 'All counts correct', domain: 'counts', kind: 'boolean',
    help: 'Swab, instrument and sharps counts all reconciled.',
    source: 'Surgical count sheet',
    read: (c) => flag(at(c, 'surgicalCount', 'allCountsCorrect')),
  }),
  v({
    key: 'countDiscrepancy', label: 'Count discrepancy', domain: 'counts', kind: 'boolean',
    help: 'A discrepancy occurred at any count.',
    source: 'Surgical count sheet',
    read: (c) => flag(at(c, 'surgicalCount', 'discrepancyOccurred')),
  }),
  v({
    key: 'countDiscrepancyResolved', label: 'Discrepancy resolved', domain: 'counts', kind: 'boolean',
    help: 'The discrepancy was reconciled before the patient left the room.',
    source: 'Surgical count sheet',
    read: (c) => flag(at(c, 'surgicalCount', 'discrepancyResolved')),
  }),
  v({
    key: 'countXrayOrdered', label: 'X-ray ordered for count', domain: 'counts', kind: 'boolean',
    help: 'An intraoperative radiograph was taken because of a count discrepancy.',
    source: 'Surgical count sheet',
    read: (c) => flag(at(c, 'surgicalCount', 'xRayOrdered')),
  }),
  v({
    key: 'countSheetCompleted', label: 'Count sheet completed', domain: 'counts', kind: 'boolean',
    help: 'The count sheet was completed and signed.',
    source: 'Surgical count sheet',
    read: (c) => flag(at(c, 'surgicalCount', 'countSheetCompleted')),
  }),
];

export const THEATRE_VARIABLES: readonly ResearchVariable[] = [
  ...PROCESS_VARIABLES,
  ...TIMELINESS_VARIABLES,
  ...HOLDING_VARIABLES,
  ...WHO_VARIABLES,
  ...INTRAOP_VARIABLES,
  ...ANAESTHESIA_VARIABLES,
  ...COUNT_VARIABLES,
];
