// ============================================================
// Research variables: from the patient to the knife
// ------------------------------------------------------------
// Patient, booking, diagnosis and indication, preoperative risk, laboratory
// results and the anaesthetic assessment — everything that exists before the
// patient enters the theatre.
//
// THE DIAGNOSIS AND THE INDICATION ARE DIFFERENT VARIABLES and are kept apart
// deliberately. The indication is why this patient is being operated on and is
// entered at booking; the operative and post-operative diagnoses are what was
// actually found and are entered afterwards on the signed note. A case series
// built on the booking indication and one built on the operative diagnosis do
// not have the same denominator, and conflating them is how a "diagnostic
// accuracy" figure gets quoted that nobody can reproduce.
// ============================================================

import type { ResearchVariable, RawCase } from './types';
import { at, preOpReview, operationNote, fitnessAssessment } from './access';
import {
  num, text, flag, ageInYears, ageBand, isPaediatric, bmi, bmiClass,
  asaNumber, asaEmergency, asaLabel, anaemiaGrade, isAnaemic,
  potassiumFlag, creatinineFlag, viralPositive, bookingLeadHours,
  weekdayName, clinicalLabel,
} from './derive';

/** Reduces the boilerplate without hiding anything a reader needs. */
const v = (x: ResearchVariable): ResearchVariable => x;

const patientAge = (c: RawCase): number | null =>
  ageInYears(at(c, 'patient', 'age'), at(c, 'patient', 'ageUnit'));

export const PATIENT_VARIABLES: readonly ResearchVariable[] = [
  v({
    key: 'ageYears', label: 'Age', domain: 'patient', kind: 'numeric', unit: 'years',
    derived: true,
    help: 'Age converted to years from whatever unit it was entered in — neonates are recorded in days and infants in months.',
    source: 'Patient record',
    read: (c) => {
      const a = patientAge(c);
      return a === null ? null : Math.round(a * 100) / 100;
    },
  }),
  v({
    key: 'ageBand', label: 'Age band', domain: 'patient', kind: 'categorical', derived: true,
    help: 'The bands a surgical paper reports in, with neonate and infant kept apart from "child".',
    source: 'Patient record',
    read: (c) => ageBand(patientAge(c)),
  }),
  v({
    key: 'paediatric', label: 'Paediatric (under 18)', domain: 'patient', kind: 'boolean', derived: true,
    help: 'Under eighteen years, which is the split the paediatric theatre and the consent rules use.',
    source: 'Patient record',
    read: (c) => isPaediatric(patientAge(c)),
  }),
  v({
    key: 'sex', label: 'Sex', domain: 'patient', kind: 'categorical',
    help: 'As recorded on the patient record.',
    source: 'Patient record',
    read: (c) => text(at(c, 'patient', 'gender')),
  }),
  v({
    key: 'ward', label: 'Ward', domain: 'patient', kind: 'categorical',
    help: 'The ward the patient came from.',
    source: 'Patient record',
    read: (c) => text(at(c, 'patient', 'ward')),
  }),
  v({
    key: 'weightKg', label: 'Weight', domain: 'patient', kind: 'numeric', unit: 'kg',
    help: 'Weight at the anaesthetic review, or from the intraoperative anaesthesia record.',
    source: 'Pre-op anaesthetic review',
    read: (c) => num(preOpReview(c)?.weight)
      ?? num(at(c, 'anesthesiaRecord', 'weightKg')),
  }),
  v({
    key: 'heightCm', label: 'Height', domain: 'patient', kind: 'numeric', unit: 'cm',
    help: 'Height at the anaesthetic review, or from the intraoperative anaesthesia record.',
    source: 'Pre-op anaesthetic review',
    read: (c) => num(preOpReview(c)?.height)
      ?? num(at(c, 'anesthesiaRecord', 'heightCm')),
  }),
  v({
    key: 'bmi', label: 'Body mass index', domain: 'patient', kind: 'numeric', unit: 'kg/m²',
    derived: true,
    help: 'Recomputed from weight and height. Values outside 8–100 are treated as entry errors and left null.',
    source: 'Pre-op anaesthetic review',
    read: (c) => {
      const r = preOpReview(c);
      const w = num(r?.weight) ?? num(at(c, 'anesthesiaRecord', 'weightKg'));
      const h = num(r?.height) ?? num(at(c, 'anesthesiaRecord', 'heightCm'));
      return bmi(w, h);
    },
  }),
  v({
    key: 'bmiClass', label: 'BMI class', domain: 'patient', kind: 'categorical', derived: true,
    values: ['Underweight', 'Normal', 'Overweight', 'Obese I', 'Obese II', 'Obese III'],
    help: 'WHO body-mass classes.',
    source: 'Pre-op anaesthetic review',
    read: (c) => {
      const r = preOpReview(c);
      const w = num(r?.weight) ?? num(at(c, 'anesthesiaRecord', 'weightKg'));
      const h = num(r?.height) ?? num(at(c, 'anesthesiaRecord', 'heightCm'));
      return bmiClass(bmi(w, h));
    },
  }),
];

export const BOOKING_VARIABLES: readonly ResearchVariable[] = [
  v({
    key: 'surgeryType', label: 'Case type', domain: 'booking', kind: 'categorical',
    values: ['ELECTIVE', 'URGENT', 'EMERGENCY'],
    help: 'Elective, urgent or emergency, as booked.',
    source: 'Booking',
    read: (c) => text(c.surgeryType),
  }),
  v({
    key: 'status', label: 'Case status', domain: 'booking', kind: 'categorical',
    values: ['SCHEDULED', 'IN_HOLDING_AREA', 'READY_FOR_THEATRE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
    help: 'Where the case got to.',
    source: 'Booking',
    read: (c) => text(c.status),
  }),
  v({
    key: 'subspecialty', label: 'Specialty', domain: 'booking', kind: 'categorical',
    help: 'The surgical specialty the case was booked under.',
    source: 'Booking',
    read: (c) => text(c.subspecialty),
  }),
  v({
    key: 'unit', label: 'Unit / firm', domain: 'booking', kind: 'categorical',
    help: 'The firm whose list the case sat on.',
    source: 'Booking',
    read: (c) => text(c.unit),
  }),
  v({
    key: 'theatre', label: 'Theatre', domain: 'booking', kind: 'categorical',
    help: 'The operating location recorded for the case.',
    source: 'Booking',
    read: (c) => text(c.location),
  }),
  v({
    key: 'scheduledMonth', label: 'Month', domain: 'booking', kind: 'categorical', derived: true,
    help: 'The month the case was listed for, as YYYY-MM. Dates are reduced to a month in every export.',
    source: 'Booking',
    read: (c) => {
      const d = c.scheduledDate ? new Date(c.scheduledDate as never) : null;
      return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 7) : null;
    },
  }),
  v({
    key: 'scheduledWeekday', label: 'Weekday listed', domain: 'booking', kind: 'categorical', derived: true,
    help: 'Which day of the week the case was listed for. Theatre lists are organised by it.',
    source: 'Booking',
    read: (c) => weekdayName(c.scheduledDate as never),
  }),
  v({
    key: 'bookingLeadHours', label: 'Booking notice', domain: 'booking', kind: 'numeric', unit: 'hours',
    derived: true,
    help: 'Hours between the booking being entered and the time the case was listed for. A retrospective entry gives null rather than a negative.',
    source: 'Booking',
    read: (c) => bookingLeadHours(c.createdAt as never, c.scheduledDate as never, text(c.scheduledTime)),
  }),
  v({
    key: 'estimatedDuration', label: 'Estimated duration', domain: 'booking', kind: 'numeric', unit: 'minutes',
    help: 'What the surgeon estimated at booking. The comparator for the over-run measures.',
    source: 'Booking',
    read: (c) => num(c.estimatedDuration),
  }),
  v({
    key: 'magnitude', label: 'Operative magnitude', domain: 'booking', kind: 'categorical',
    values: ['MAJOR', 'INTERMEDIATE', 'MINOR'],
    help: 'Major, intermediate or minor, captured at booking and used to scale the consumable pack.',
    source: 'Booking',
    read: (c) => text(c.magnitude),
  }),
  v({
    key: 'complexityScore', label: 'Complexity score', domain: 'booking', kind: 'numeric',
    help: 'The scored complexity of the case.',
    source: 'Complexity assessment',
    read: (c) => num(c.complexityScore),
  }),
  v({
    key: 'complexityClass', label: 'Complexity class', domain: 'booking', kind: 'categorical',
    help: 'Minor, intermediate, major or supermajor, from the complexity score.',
    source: 'Complexity assessment',
    read: (c) => text(c.complexityClass),
  }),
  v({
    key: 'isDayCase', label: 'Day case', domain: 'booking', kind: 'boolean',
    help: 'Booked to go home the same day.',
    source: 'Booking',
    read: (c) => flag(c.isDayCase),
  }),
  v({
    key: 'multidisciplinary', label: 'Multidisciplinary', domain: 'booking', kind: 'boolean',
    help: 'More than one surgical unit operating on the same patient in one session.',
    source: 'Booking',
    read: (c) => flag(c.isMultidisciplinary),
  }),
  v({
    key: 'plannedIcu', label: 'ICU planned at booking', domain: 'booking', kind: 'boolean',
    help: 'An intensive-care bed was asked for when the case was booked. The comparator for unplanned ICU admission.',
    source: 'Booking',
    read: (c) => flag(c.needICU),
  }),
  v({
    key: 'plannedTransfusion', label: 'Transfusion planned', domain: 'booking', kind: 'boolean',
    help: 'Blood was anticipated at booking.',
    source: 'Booking',
    read: (c) => flag(c.needBloodTransfusion),
  }),
  v({
    key: 'readinessStatus', label: 'Readiness at booking', domain: 'booking', kind: 'categorical',
    values: ['PENDING_CHECKS', 'PENDING_DEPOSIT', 'READY', 'BLOCKED'],
    help: 'Whether the case was ready, waiting on checks, waiting on a deposit, or blocked.',
    source: 'Booking',
    read: (c) => text(c.readinessStatus),
  }),
];

export const DIAGNOSIS_VARIABLES: readonly ResearchVariable[] = [
  v({
    key: 'indication', label: 'Indication for surgery', domain: 'diagnosis', kind: 'categorical',
    derived: true,
    help: 'Why this patient was listed, as entered at booking. Normalised for case and spacing only — no synonym is merged, because that would be a clinical judgement made inside a group-by.',
    source: 'Booking',
    read: (c) => clinicalLabel(c.indication),
  }),
  v({
    key: 'procedurePlanned', label: 'Procedure planned', domain: 'diagnosis', kind: 'categorical',
    derived: true,
    help: 'The operation as booked.',
    source: 'Booking',
    read: (c) => clinicalLabel(c.procedureName),
  }),
  v({
    key: 'procedurePerformed', label: 'Procedure performed', domain: 'diagnosis', kind: 'categorical',
    derived: true,
    help: 'The operation as recorded on the signed note. Against the booked procedure, this is how often the plan changed.',
    source: 'Signed operation note',
    read: (c) => clinicalLabel(operationNote(c)?.procedurePerformed ?? operationNote(c)?.procedureName),
  }),
  v({
    key: 'procedureChanged', label: 'Procedure changed from plan', domain: 'diagnosis', kind: 'boolean',
    help: 'The operation performed differed from the one booked, as declared on the note.',
    source: 'Signed operation note',
    read: (c) => flag(operationNote(c)?.procedureChanged),
  }),
  v({
    key: 'additionalProcedures', label: 'Additional procedures booked', domain: 'diagnosis', kind: 'boolean',
    derived: true,
    help: 'More than one procedure was listed for the same operation.',
    source: 'Booking',
    read: (c) => {
      const s = text(c.additionalProcedures);
      return s === null ? null : s.length > 0;
    },
  }),
  v({
    key: 'operativeDiagnosis', label: 'Operative diagnosis', domain: 'diagnosis', kind: 'categorical',
    derived: true,
    help: 'What was found at operation, from the signed note. This is NOT the booking indication and the two must not be pooled.',
    source: 'Signed operation note',
    read: (c) => clinicalLabel(operationNote(c)?.operativeDiagnosis),
  }),
  v({
    key: 'postOpDiagnosis', label: 'Post-operative diagnosis', domain: 'diagnosis', kind: 'categorical',
    derived: true,
    help: 'The diagnosis the patient left theatre with, from the signed note.',
    source: 'Signed operation note',
    read: (c) => clinicalLabel(operationNote(c)?.postOpDiagnosis),
  }),
  v({
    key: 'operativeFindingsRecorded', label: 'Findings recorded', domain: 'diagnosis', kind: 'boolean',
    derived: true,
    help: 'Whether operative findings were written on the signed note at all.',
    source: 'Signed operation note',
    read: (c) => {
      const n = operationNote(c);
      return n ? text(n.findings) !== null : null;
    },
  }),
  v({
    key: 'specimenSent', label: 'Specimen sent', domain: 'diagnosis', kind: 'boolean',
    help: 'A specimen was sent for pathology.',
    source: 'Intraoperative record',
    read: (c) => flag(at(c, 'intraOperativeRecord', 'specimensSent')),
  }),
];

const asaOf = (c: RawCase): number | null =>
  asaNumber(preOpReview(c)?.asaClass)
  ?? asaNumber(at(c, 'anesthesiaRecord', 'asaClassification'))
  ?? asaNumber(at(c, 'patient', 'asaScore'));

export const RISK_VARIABLES: readonly ResearchVariable[] = [
  v({
    key: 'asaNumber', label: 'ASA grade', domain: 'risk', kind: 'numeric', derived: true,
    help: 'Physical status 1-6, read from whichever of the three screens recorded it and normalised from "ASA II", "II" and "2".',
    source: 'Anaesthetic review, anaesthesia record, or patient record',
    read: (c) => asaOf(c),
  }),
  v({
    key: 'asaLabel', label: 'ASA grade (label)', domain: 'risk', kind: 'categorical', derived: true,
    values: ['ASA I', 'ASA II', 'ASA III', 'ASA IV', 'ASA V', 'ASA VI'],
    help: 'The same grade as a single spelling, for a table.',
    source: 'Anaesthetic review',
    read: (c) => asaLabel(asaOf(c)),
  }),
  v({
    key: 'asaEmergency', label: 'ASA emergency suffix', domain: 'risk', kind: 'boolean', derived: true,
    help: 'The grade carried an E, meaning it was assigned for an emergency operation.',
    source: 'Anaesthetic review',
    read: (c) => asaEmergency(preOpReview(c)?.asaClass)
      ?? asaEmergency(at(c, 'anesthesiaRecord', 'asaClassification')),
  }),
  v({
    key: 'whoRiskClass', label: 'WHO operative risk class', domain: 'risk', kind: 'categorical',
    help: 'The WHO operative fitness risk class recorded on the patient.',
    source: 'Patient risk assessment',
    read: (c) => text(at(c, 'patient', 'whoRiskClass')),
  }),
  v({
    key: 'finalRiskScore', label: 'Final risk score', domain: 'risk', kind: 'numeric',
    help: 'The calculated 0-100 preoperative risk score.',
    source: 'Patient risk assessment',
    read: (c) => num(at(c, 'patient', 'finalRiskScore')),
  }),
  v({
    key: 'fitnessForSurgery', label: 'Fitness for surgery', domain: 'risk', kind: 'categorical',
    values: ['FIT', 'UNFIT', 'CONDITIONAL'],
    help: 'The fitness decision recorded on the patient record.',
    source: 'Patient risk assessment',
    read: (c) => text(at(c, 'patient', 'fitnessForSurgery')),
  }),
  v({
    key: 'dvtRiskScore', label: 'DVT risk score', domain: 'risk', kind: 'numeric',
    help: 'Venous thromboembolism risk score.',
    source: 'Patient risk assessment',
    read: (c) => num(at(c, 'patient', 'dvtRiskScore')),
  }),
  v({
    key: 'bleedingRiskScore', label: 'Bleeding risk score', domain: 'risk', kind: 'numeric',
    help: 'Bleeding risk score from the patient assessment.',
    source: 'Patient risk assessment',
    read: (c) => num(at(c, 'patient', 'bleedingRiskScore')),
  }),
  v({
    key: 'bleedingRiskLevel', label: 'Bleeding risk at booking', domain: 'risk', kind: 'categorical',
    values: ['LOW', 'MODERATE', 'HIGH'],
    help: 'The bleeding risk band captured on the booking form.',
    source: 'Booking',
    read: (c) => text(c.bleedingRiskLevel),
  }),
  v({
    key: 'nutritionalStatus', label: 'Nutritional status', domain: 'risk', kind: 'categorical',
    values: ['GOOD', 'FAIR', 'POOR'],
    help: 'Nutritional status at booking - an exposure in every wound-healing analysis.',
    source: 'Booking',
    read: (c) => text(c.nutritionalStatusAtBooking) ?? text(at(c, 'patient', 'nutritionalStatus')),
  }),
  v({
    key: 'pressureSoreRisk', label: 'Pressure-sore risk', domain: 'risk', kind: 'categorical',
    values: ['LOW', 'MEDIUM', 'HIGH'],
    help: 'Pressure-sore risk, compulsory on the booking form for patients over 45.',
    source: 'Booking',
    read: (c) => text(c.pressureSoreRiskAtBooking) ?? text(at(c, 'patient', 'pressureSoreRisk')),
  }),
  v({
    key: 'onAnticoagulants', label: 'On anticoagulants', domain: 'risk', kind: 'boolean',
    help: 'Taking an anticoagulant at assessment.',
    source: 'Patient risk assessment',
    read: (c) => flag(at(c, 'patient', 'onAnticoagulants')),
  }),
  v({
    key: 'onAntiplatelets', label: 'On antiplatelets', domain: 'risk', kind: 'boolean',
    help: 'Taking an antiplatelet at assessment.',
    source: 'Patient risk assessment',
    read: (c) => flag(at(c, 'patient', 'onAntiplatelets')),
  }),
  v({
    key: 'hasActiveCancer', label: 'Active cancer', domain: 'risk', kind: 'boolean',
    help: 'Active malignancy recorded in the risk assessment.',
    source: 'Patient risk assessment',
    read: (c) => flag(at(c, 'patient', 'hasActiveCancer')),
  }),
  v({
    key: 'hasPriorDVT', label: 'Previous DVT', domain: 'risk', kind: 'boolean',
    help: 'A previous deep vein thrombosis.',
    source: 'Patient risk assessment',
    read: (c) => flag(at(c, 'patient', 'hasPriorDVT')),
  }),
  v({
    key: 'comorbidityCount', label: 'Comorbidity count', domain: 'risk', kind: 'numeric', derived: true,
    help: 'How many of diabetes, hypertension, heart disease, asthma, kidney disease and liver disease were recorded at the fitness assessment. Null when no assessment exists.',
    source: 'Preoperative fitness assessment',
    read: (c) => {
      const a = fitnessAssessment(c);
      if (!a) return null;
      const keys = ['diabetes', 'hypertension', 'heartDisease', 'asthma', 'kidneyDisease', 'liverDisease'];
      return keys.filter((k) => a[k] === true).length;
    },
  }),
];

/** The six comorbidities the fitness assessment records, each as its own variable. */
const COMORBIDITIES: Array<[string, string, string]> = [
  ['diabetes', 'diabetes', 'Diabetes mellitus'],
  ['hypertension', 'hypertension', 'Hypertension'],
  ['heartDisease', 'heartDisease', 'Heart disease'],
  ['asthma', 'asthma', 'Asthma'],
  ['kidneyDisease', 'kidneyDisease', 'Kidney disease'],
  ['liverDisease', 'liverDisease', 'Liver disease'],
];

export const COMORBIDITY_VARIABLES: readonly ResearchVariable[] = COMORBIDITIES.map(
  ([key, field, label]) => v({
    key, label, domain: 'risk', kind: 'boolean',
    help: `${label} recorded at the preoperative fitness assessment. Null where no assessment exists, which is not the same as absent.`,
    source: 'Preoperative fitness assessment',
    read: (c) => {
      const a = fitnessAssessment(c);
      return a ? a[field] === true : null;
    },
  }),
);

export const LAB_VARIABLES: readonly ResearchVariable[] = [
  v({
    key: 'haemoglobin', label: 'Haemoglobin', domain: 'labs', kind: 'numeric', unit: 'g/dL',
    help: 'The haemoglobin recorded at booking, or from the anaesthetic review.',
    source: 'Booking / anaesthetic review',
    read: (c) => num(c.recentHb) ?? num(preOpReview(c)?.hemoglobin),
  }),
  v({
    key: 'anaemiaGrade', label: 'Anaemia grade (WHO)', domain: 'labs', kind: 'categorical', derived: true,
    values: ['None', 'Mild', 'Moderate', 'Severe'],
    help: 'WHO anaemia grade, applying the male and female thresholds separately. Where sex is not recorded the lower threshold is used, so a man is never reported as less anaemic than he is.',
    source: 'Booking / anaesthetic review',
    read: (c) => anaemiaGrade(num(c.recentHb) ?? num(preOpReview(c)?.hemoglobin), at(c, 'patient', 'gender')),
  }),
  v({
    key: 'anaemic', label: 'Anaemic', domain: 'labs', kind: 'boolean', derived: true,
    help: 'Any grade of anaemia on the WHO thresholds.',
    source: 'Booking / anaesthetic review',
    read: (c) => isAnaemic(num(c.recentHb) ?? num(preOpReview(c)?.hemoglobin), at(c, 'patient', 'gender')),
  }),
  v({
    key: 'potassium', label: 'Serum potassium', domain: 'labs', kind: 'numeric', unit: 'mmol/L',
    help: 'Potassium at booking, or from the anaesthetic review.',
    source: 'Booking / anaesthetic review',
    read: (c) => num(c.potassium) ?? num(preOpReview(c)?.potassium),
  }),
  v({
    key: 'potassiumFlag', label: 'Potassium status', domain: 'labs', kind: 'categorical', derived: true,
    values: ['Hypokalaemia', 'Normal', 'Hyperkalaemia'],
    help: 'Whether potassium sat below 3.5, within range, or above 5.5 mmol/L.',
    source: 'Booking / anaesthetic review',
    read: (c) => potassiumFlag(num(c.potassium) ?? num(preOpReview(c)?.potassium)),
  }),
  v({
    key: 'sodium', label: 'Serum sodium', domain: 'labs', kind: 'numeric', unit: 'mmol/L',
    help: 'Sodium at booking, or from the anaesthetic review.',
    source: 'Booking / anaesthetic review',
    read: (c) => num(c.sodium) ?? num(preOpReview(c)?.sodium),
  }),
  v({
    key: 'creatinine', label: 'Serum creatinine', domain: 'labs', kind: 'numeric', unit: 'µmol/L',
    help: 'Creatinine at booking, or from the anaesthetic review.',
    source: 'Booking / anaesthetic review',
    read: (c) => num(c.creatinine) ?? num(preOpReview(c)?.creatinine),
  }),
  v({
    key: 'renalFlag', label: 'Renal status', domain: 'labs', kind: 'categorical', derived: true,
    values: ['Normal', 'Raised', 'Severe'],
    help: 'Creatinine banded as normal, raised above 120, or severe above 200 µmol/L.',
    source: 'Booking / anaesthetic review',
    read: (c) => creatinineFlag(num(c.creatinine) ?? num(preOpReview(c)?.creatinine)),
  }),
  v({
    key: 'plateletCount', label: 'Platelet count', domain: 'labs', kind: 'numeric', unit: '10⁹/L',
    help: 'Platelets from the anaesthetic review.',
    source: 'Pre-op anaesthetic review',
    read: (c) => num(preOpReview(c)?.plateletCount),
  }),
  v({
    key: 'ptInr', label: 'PT / INR', domain: 'labs', kind: 'numeric',
    help: 'Prothrombin ratio from the anaesthetic review.',
    source: 'Pre-op anaesthetic review',
    read: (c) => num(preOpReview(c)?.ptInr),
  }),
  v({
    key: 'bloodGlucose', label: 'Blood glucose', domain: 'labs', kind: 'numeric', unit: 'mmol/L',
    help: 'Glucose from the anaesthetic review.',
    source: 'Pre-op anaesthetic review',
    read: (c) => num(preOpReview(c)?.bloodGlucose),
  }),
  v({
    key: 'hbsAgStatus', label: 'Hepatitis B surface antigen', domain: 'labs', kind: 'categorical',
    values: ['NEGATIVE', 'POSITIVE', 'PENDING', 'NOT_DONE'],
    help: 'HBsAg status at booking.',
    source: 'Booking',
    read: (c) => text(c.hbsAgStatus),
  }),
  v({
    key: 'hcvStatus', label: 'Hepatitis C', domain: 'labs', kind: 'categorical',
    values: ['NEGATIVE', 'POSITIVE', 'PENDING', 'NOT_DONE'],
    help: 'HCV status at booking.',
    source: 'Booking',
    read: (c) => text(c.hcvStatus),
  }),
  v({
    key: 'hivStatus', label: 'HIV', domain: 'labs', kind: 'categorical',
    values: ['NEGATIVE', 'POSITIVE', 'PENDING', 'NOT_DONE'],
    help: 'HIV status at booking.',
    source: 'Booking',
    read: (c) => text(c.hivStatus),
  }),
  v({
    key: 'bloodBorneVirusPositive', label: 'Any blood-borne virus positive', domain: 'labs',
    kind: 'boolean', derived: true,
    help: 'Any of HBsAg, HCV or HIV positive. Null when none of the three was recorded.',
    source: 'Booking',
    read: (c) => viralPositive(c.hbsAgStatus, c.hcvStatus, c.hivStatus),
  }),
  v({
    key: 'systolicBp', label: 'Systolic blood pressure', domain: 'labs', kind: 'numeric', unit: 'mmHg',
    help: 'Systolic pressure recorded at booking.',
    source: 'Booking',
    read: (c) => num(c.bloodPressureSystolic),
  }),
  v({
    key: 'diastolicBp', label: 'Diastolic blood pressure', domain: 'labs', kind: 'numeric', unit: 'mmHg',
    help: 'Diastolic pressure recorded at booking.',
    source: 'Booking',
    read: (c) => num(c.bloodPressureDiastolic),
  }),
];

export const ANAESTHETIC_ASSESSMENT_VARIABLES: readonly ResearchVariable[] = [
  v({
    key: 'preOpReviewDone', label: 'Anaesthetic review done', domain: 'anaesthetic_assessment',
    kind: 'boolean', derived: true,
    help: 'A pre-operative anaesthetic review exists for the case.',
    source: 'Pre-op anaesthetic review',
    read: (c) => preOpReview(c) !== null,
  }),
  v({
    key: 'preOpReviewStatus', label: 'Review status', domain: 'anaesthetic_assessment', kind: 'categorical',
    help: 'Whether the review was approved, pending or rejected.',
    source: 'Pre-op anaesthetic review',
    read: (c) => text(preOpReview(c)?.status),
  }),
  v({
    key: 'anaestheticFitness', label: 'Anaesthetic fitness decision', domain: 'anaesthetic_assessment',
    kind: 'categorical',
    help: 'The anaesthetist’s fitness decision on the review.',
    source: 'Pre-op anaesthetic review',
    read: (c) => text(preOpReview(c)?.fitnessDecision),
  }),
  v({
    key: 'airwayClass', label: 'Airway class', domain: 'anaesthetic_assessment', kind: 'categorical',
    help: 'Mallampati or equivalent airway class from the review. The exposure in every difficult-intubation analysis.',
    source: 'Pre-op anaesthetic review',
    read: (c) => text(preOpReview(c)?.airwayClass),
  }),
  v({
    key: 'neckMovement', label: 'Neck movement', domain: 'anaesthetic_assessment', kind: 'categorical',
    help: 'Neck movement assessed at the review.',
    source: 'Pre-op anaesthetic review',
    read: (c) => text(preOpReview(c)?.neckMovement),
  }),
  v({
    key: 'dentition', label: 'Dentition', domain: 'anaesthetic_assessment', kind: 'categorical',
    help: 'Dentition assessed at the review.',
    source: 'Pre-op anaesthetic review',
    read: (c) => text(preOpReview(c)?.dentition),
  }),
  v({
    key: 'fastingStatus', label: 'Fasting status at review', domain: 'anaesthetic_assessment', kind: 'categorical',
    help: 'Fasting status recorded at the anaesthetic review.',
    source: 'Pre-op anaesthetic review',
    read: (c) => text(preOpReview(c)?.fastingStatus),
  }),
  v({
    key: 'proposedAnaesthesia', label: 'Anaesthesia planned', domain: 'anaesthetic_assessment', kind: 'categorical',
    help: 'The technique the review proposed. Against what was actually given, this is how often the plan changed.',
    source: 'Pre-op anaesthetic review',
    read: (c) => text(preOpReview(c)?.proposedAnesthesiaType),
  }),
  v({
    key: 'anaestheticRiskLevel', label: 'Anaesthetic risk level', domain: 'anaesthetic_assessment', kind: 'categorical',
    help: 'The risk level assigned at the review.',
    source: 'Pre-op anaesthetic review',
    read: (c) => text(preOpReview(c)?.riskLevel),
  }),
  v({
    key: 'optimisationRequired', label: 'Optimisation required', domain: 'anaesthetic_assessment',
    kind: 'boolean', derived: true,
    help: 'The review raised one or more optimisation requirements before the patient could proceed.',
    source: 'Pre-op anaesthetic review',
    read: (c) => {
      const r = preOpReview(c);
      if (!r) return null;
      const reqs = r.optimisationRequirements;
      return Array.isArray(reqs) ? reqs.length > 0 : null;
    },
  }),
  v({
    key: 'anaesthesiaConsentSigned', label: 'Anaesthesia consent signed', domain: 'anaesthetic_assessment',
    kind: 'boolean', derived: true,
    help: 'A signed anaesthesia consent is on the review.',
    source: 'Pre-op anaesthetic review',
    read: (c) => {
      const r = preOpReview(c);
      return r ? Boolean(r.anaesthesiaConsentSignedAt) : null;
    },
  }),
  v({
    key: 'reviewToSurgeryDays', label: 'Review to surgery interval', domain: 'anaesthetic_assessment',
    kind: 'numeric', unit: 'days', derived: true,
    help: 'Whole days between the anaesthetic review and the listed operation date. A review done months ahead is not the same assessment as one done the day before.',
    source: 'Pre-op anaesthetic review',
    read: (c) => {
      const r = preOpReview(c);
      if (!r?.reviewDate || !c.scheduledDate) return null;
      const a = new Date(r.reviewDate as never).getTime();
      const b = new Date(c.scheduledDate as never).getTime();
      if (Number.isNaN(a) || Number.isNaN(b)) return null;
      const days = Math.round((b - a) / 86_400_000);
      return days >= 0 ? days : null;
    },
  }),
];

export const PREOP_VARIABLES: readonly ResearchVariable[] = [
  ...PATIENT_VARIABLES,
  ...BOOKING_VARIABLES,
  ...DIAGNOSIS_VARIABLES,
  ...RISK_VARIABLES,
  ...COMORBIDITY_VARIABLES,
  ...LAB_VARIABLES,
  ...ANAESTHETIC_ASSESSMENT_VARIABLES,
];
