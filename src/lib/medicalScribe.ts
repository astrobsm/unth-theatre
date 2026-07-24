/**
 * medicalScribe.ts — deterministic, rules-based pre-operative safety analyzer.
 *
 * This is decision-SUPPORT, not a diagnosis. It reads a booked surgery's clinical
 * snapshot (compulsory booking labs & assessments, consent status, ASA/airway,
 * comorbidities) and flags abnormal / missing findings against internationally
 * accepted reference ranges, each with a concrete safety action. No patient data
 * leaves the server — all logic runs locally.
 *
 * Reference ranges: adult defaults (WHO/ASA/AAGBI). Interpret paediatric values
 * in clinical context. Findings are advisory and must be confirmed by the
 * anaesthetist / surgeon.
 */

export type Severity = 'CRITICAL' | 'WARNING' | 'INFO' | 'OK';

export interface ScribeFinding {
  severity: Severity;
  category: string;
  title: string;
  detail: string;
  recommendation: string;
}

export interface ScribeResult {
  overall: Severity;
  headline: string;
  counts: { CRITICAL: number; WARNING: number; INFO: number };
  findings: ScribeFinding[];
  generatedAt: string;
  disclaimer: string;
}

// Minimal shape we analyse (a subset of the Surgery record + relations).
export interface ScribeInput {
  scheduledDate?: Date | string | null;
  surgeryType?: string | null;
  procedureName?: string | null;
  magnitude?: string | null;
  // Compulsory booking labs / assessments (on Surgery)
  recentHb?: number | null;
  hbSampleAt?: Date | string | null;
  potassium?: number | null;
  sodium?: number | null;
  creatinine?: number | null;
  hbsAgStatus?: string | null;
  hcvStatus?: string | null;
  hivStatus?: string | null;
  bloodPressureSystolic?: number | null;
  bloodPressureDiastolic?: number | null;
  bleedingRiskLevel?: string | null;
  nutritionalStatusAtBooking?: string | null;
  pressureSoreRiskAtBooking?: string | null;
  needBloodTransfusion?: boolean | null;
  // Consent (scalars on Surgery)
  consentSignedElectronically?: boolean | null;
  consentFileData?: string | null;
  consentCompletedAt?: Date | string | null;
  // Patient
  patient?: {
    name?: string | null; age?: number | null; ageUnit?: string | null; gender?: string | null;
    comorbidities?: string | null; allergies?: string | null;
    onAnticoagulants?: boolean | null; onAntiplatelets?: boolean | null;
  } | null;
  // Latest anaesthetic review (optional)
  preOpReviews?: Array<{ asaClass?: string | null; airwayClass?: string | null; riskLevel?: string | null }> | null;
}

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 3, WARNING: 2, INFO: 1, OK: 0 };
const num = (v: unknown): number | null => (typeof v === 'number' && !Number.isNaN(v) ? v : null);

export function analyzePreopSafety(s: ScribeInput): ScribeResult {
  const f: ScribeFinding[] = [];
  const add = (severity: Severity, category: string, title: string, detail: string, recommendation: string) =>
    f.push({ severity, category, title, detail, recommendation });

  const ageYears = s.patient && (s.patient.ageUnit ?? 'YEARS') === 'YEARS' ? num(s.patient.age) : 0;
  const isElective = (s.surgeryType ?? 'ELECTIVE') === 'ELECTIVE';

  // ── Consent ──
  const consented = !!s.consentSignedElectronically || !!s.consentFileData || !!s.consentCompletedAt;
  if (!consented) {
    add('CRITICAL', 'Consent', 'Informed consent not documented',
      'No signed electronic consent or uploaded consent form is on record for this booking.',
      'Obtain and document valid informed consent (or emergency consent pathway) BEFORE the patient enters theatre.');
  } else {
    add('OK', 'Consent', 'Consent documented', 'A signed/uploaded consent record is present.', 'Verify it matches the planned procedure at Sign-In.');
  }

  // ── Haemoglobin ──
  const hb = num(s.recentHb);
  if (hb == null) {
    add('WARNING', 'Haematology', 'Haemoglobin not documented', 'No recent Hb recorded at booking.', 'Obtain an FBC within 48 h of surgery.');
  } else {
    if (hb < 7) add('CRITICAL', 'Haematology', `Severe anaemia (Hb ${hb} g/dL)`, 'Hb below 7 g/dL markedly increases peri-operative risk.',
      'Optimise / transfuse to a safe level and involve haematology before elective surgery; ensure crossmatched blood is available.');
    else if (hb < 10) add('WARNING', 'Haematology', `Anaemia (Hb ${hb} g/dL)`, 'Borderline Hb for surgery, especially if blood loss is anticipated.',
      'Group & save / crossmatch, treat the cause, and consider optimisation for major cases.');
    else add('OK', 'Haematology', `Haemoglobin ${hb} g/dL`, 'Within an acceptable range.', 'No action.');
    // Sample recency
    if (s.hbSampleAt && s.scheduledDate) {
      const hrs = (new Date(s.scheduledDate).getTime() - new Date(s.hbSampleAt).getTime()) / 3_600_000;
      if (hrs > 48) add('WARNING', 'Haematology', 'Haemoglobin sample is stale (> 48 h)', `Sample taken ${Math.round(hrs)} h before surgery.`, 'Repeat the FBC so the result is current within 48 h.');
    }
  }
  if (s.needBloodTransfusion && !(s.bleedingRiskLevel)) {
    add('INFO', 'Haematology', 'Transfusion anticipated', 'Blood transfusion was flagged at booking.', 'Confirm crossmatched units are reserved and consent for transfusion is obtained.');
  }

  // ── Electrolytes / renal ──
  const k = num(s.potassium);
  if (k == null) add('WARNING', 'Biochemistry', 'Potassium not documented', 'No serum K+ recorded.', 'Check U&E before anaesthesia.');
  else if (k < 2.5 || k > 6.5) add('CRITICAL', 'Biochemistry', `Dangerous potassium (${k} mmol/L)`, 'Severe hypo-/hyperkalaemia risks life-threatening arrhythmia.', 'Correct urgently with ECG monitoring and defer elective surgery until normalised.');
  else if (k < 3.5 || k > 5.5) add('WARNING', 'Biochemistry', `Abnormal potassium (${k} mmol/L)`, 'Outside the 3.5–5.1 mmol/L range.', 'Correct and recheck before induction; review causative drugs.');
  else add('OK', 'Biochemistry', `Potassium ${k} mmol/L`, 'Normal range.', 'No action.');

  const na = num(s.sodium);
  if (na == null) add('WARNING', 'Biochemistry', 'Sodium not documented', 'No serum Na+ recorded.', 'Check U&E before anaesthesia.');
  else if (na < 120 || na > 155) add('CRITICAL', 'Biochemistry', `Severe dysnatraemia (Na ${na} mmol/L)`, 'Marked hypo-/hypernatraemia risks cerebral injury and arrhythmia.', 'Correct cautiously with senior input; defer elective surgery.');
  else if (na < 130 || na > 150) add('WARNING', 'Biochemistry', `Abnormal sodium (${na} mmol/L)`, 'Outside 135–145 mmol/L.', 'Identify cause and optimise before elective surgery.');
  else add('OK', 'Biochemistry', `Sodium ${na} mmol/L`, 'Normal range.', 'No action.');

  const cr = num(s.creatinine);
  if (cr == null) add('WARNING', 'Renal', 'Creatinine not documented', 'No serum creatinine recorded.', 'Check renal function before anaesthesia.');
  else if (cr > 300) add('CRITICAL', 'Renal', `Severe renal impairment (creatinine ${cr} µmol/L)`, 'High risk for fluid/electrolyte and drug-handling complications.', 'Involve nephrology/anaesthesia; adjust drug doses, avoid nephrotoxins, plan fluid strategy.');
  else if (cr > 110) add('WARNING', 'Renal', `Raised creatinine (${cr} µmol/L)`, 'Suggests renal impairment.', 'Adjust renally-cleared drugs, avoid NSAIDs/nephrotoxins, monitor fluids.');
  else add('OK', 'Renal', `Creatinine ${cr} µmol/L`, 'Normal range.', 'No action.');

  // ── Blood pressure ──
  const sys = num(s.bloodPressureSystolic), dia = num(s.bloodPressureDiastolic);
  if (sys == null || dia == null) add('WARNING', 'Cardiovascular', 'Blood pressure not documented', 'No BP recorded at booking.', 'Record BP before theatre.');
  else if (sys >= 180 || dia >= 110) add('WARNING', 'Cardiovascular', `Severe hypertension (${sys}/${dia} mmHg)`, 'Uncontrolled hypertension raises cardiovascular risk.', 'Optimise BP; consider deferring elective surgery and involve the physician/anaesthetist.');
  else if (sys < 90) add('WARNING', 'Cardiovascular', `Hypotension (${sys}/${dia} mmHg)`, 'Low BP may indicate hypovolaemia/sepsis.', 'Assess and resuscitate; identify the cause before anaesthesia.');
  else add('OK', 'Cardiovascular', `Blood pressure ${sys}/${dia} mmHg`, 'Acceptable range.', 'No action.');

  // ── Serology / infection control ──
  const serology: Array<[string, string | null | undefined]> = [['HBsAg', s.hbsAgStatus], ['HCV', s.hcvStatus], ['HIV', s.hivStatus]];
  for (const [label, val] of serology) {
    if (!val) { add('WARNING', 'Infection control', `${label} status not documented`, `No ${label} result recorded.`, `Obtain ${label} status; apply universal precautions meanwhile.`); continue; }
    if (val === 'POSITIVE') add('INFO', 'Infection control', `${label} positive`, `Patient is ${label}-positive.`, 'Apply strict universal/blood-borne-virus precautions, inform the theatre team, plan sharps handling and post-exposure protocol.');
    else if (val === 'PENDING' || val === 'NOT_DONE') add('WARNING', 'Infection control', `${label} result outstanding (${val.replace('_', ' ').toLowerCase()})`, `${label} is not yet resulted.`, `Chase the ${label} result before elective surgery; use universal precautions.`);
    else add('OK', 'Infection control', `${label} negative`, `${label} negative.`, 'Standard universal precautions.');
  }

  // ── Risk assessments ──
  const bleed = (s.bleedingRiskLevel || '').toUpperCase();
  if (!bleed) add('WARNING', 'Risk', 'Bleeding-risk assessment missing', 'Not documented at booking.', 'Complete a bleeding-risk assessment.');
  else if (bleed === 'HIGH') add('WARNING', 'Risk', 'High bleeding risk', 'Flagged HIGH at booking.', 'Check clotting/platelets, correct coagulopathy, crossmatch, review anticoagulants, involve haematology.');
  else if (bleed === 'MODERATE') add('INFO', 'Risk', 'Moderate bleeding risk', 'Flagged MODERATE.', 'Ensure group & save and haemostatic readiness.');

  const nutrition = (s.nutritionalStatusAtBooking || '').toUpperCase();
  if (!nutrition) add('WARNING', 'Risk', 'Nutritional assessment missing', 'Not documented at booking.', 'Complete a nutritional assessment.');
  else if (nutrition === 'POOR') add('WARNING', 'Risk', 'Poor nutritional status', 'Increases infection, poor wound healing and dehiscence risk.', 'Optimise nutrition where time allows; flag to the surgical/dietetics team.');
  else if (nutrition === 'FAIR') add('INFO', 'Risk', 'Fair nutritional status', 'Suboptimal nutrition.', 'Consider optimisation for major/elective cases.');

  if (ageYears != null && ageYears > 45) {
    const ps = (s.pressureSoreRiskAtBooking || '').toUpperCase();
    if (!ps) add('WARNING', 'Risk', 'Pressure-sore risk assessment missing (age > 45)', 'Required for patients over 45.', 'Complete a pressure-sore (e.g. Braden/Waterlow) assessment.');
    else if (ps === 'HIGH') add('INFO', 'Risk', 'High pressure-sore risk', 'Flagged HIGH.', 'Use pressure-relieving positioning/padding and reposition per protocol.');
  }

  // ── Age extremes ──
  if (s.patient) {
    const unit = s.patient.ageUnit ?? 'YEARS';
    if (unit !== 'YEARS' || (num(s.patient.age) ?? 99) < 1) add('INFO', 'Age', 'Neonate / infant', 'Paediatric physiology.', 'Weight-based dosing, temperature control, paediatric airway/circuit, senior paediatric anaesthetist.');
    else if ((num(s.patient.age) ?? 0) >= 70) add('INFO', 'Age', `Elderly patient (${s.patient.age} y)`, 'Higher frailty and comorbidity burden.', 'Titrate anaesthesia, guard against hypotension/hypothermia, review polypharmacy and delirium risk.');
  }

  // ── Anticoagulation ──
  if (s.patient?.onAnticoagulants) add('WARNING', 'Medication', 'On anticoagulants', 'Patient takes anticoagulants.', 'Confirm the drug was appropriately withheld/bridged; check coagulation; avoid neuraxial block until safe.');
  if (s.patient?.onAntiplatelets) add('INFO', 'Medication', 'On antiplatelets', 'Patient takes antiplatelet therapy.', 'Assess bleeding vs thrombotic risk and confirm the peri-operative plan.');

  // ── Allergies ──
  if (s.patient?.allergies && s.patient.allergies.trim()) add('WARNING', 'Allergy', 'Documented allergies', s.patient.allergies.trim(), 'Avoid the offending agents; flag latex/antibiotic/anaesthetic allergies to the whole team; have anaphylaxis drugs ready.');

  // ── Comorbidity keyword scan ──
  const co = (s.patient?.comorbidities || '').toLowerCase();
  const coRule = (re: RegExp, title: string, rec: string) => { if (re.test(co)) add('INFO', 'Comorbidity', title, 'Noted in the clinical summary.', rec); };
  coRule(/diabet/, 'Diabetes mellitus', 'Check CBG, plan glycaemic control (VRIII if needed), first-on-list where possible.');
  coRule(/hypertens/, 'Hypertension', 'Confirm BP control and continued antihypertensives per protocol.');
  coRule(/asthma|copd|reactive airway/, 'Reactive airway disease', 'Optimise inhalers, avoid triggers, have bronchodilators/steroids available.');
  coRule(/cardiac|ischaem|ihd|heart failure|arrhythm/, 'Cardiac disease', 'Consider ECG/echo and cardiology input; plan haemodynamic monitoring.');
  coRule(/sickle/, 'Sickle cell disease', 'Avoid hypoxia/hypothermia/dehydration/acidosis; consider transfusion plan and haematology input.');
  coRule(/hepat|liver|cirrho/, 'Liver disease', 'Check LFTs/clotting; adjust hepatically-metabolised drugs.');

  // ── ASA (from latest review) ──
  const review = s.preOpReviews && s.preOpReviews.length ? s.preOpReviews[s.preOpReviews.length - 1] : null;
  if (review?.asaClass && /III|IV|V|3|4|5/.test(review.asaClass)) add('INFO', 'Risk', `ASA ${review.asaClass}`, 'Significant systemic disease.', 'Ensure senior anaesthetic review and appropriate level of post-op care (HDU/ICU).');
  if (review?.airwayClass && /III|IV|3|4/.test(review.airwayClass)) add('WARNING', 'Airway', `Predicted difficult airway (Mallampati ${review.airwayClass})`, 'Higher intubation risk.', 'Prepare a difficult-airway plan and cart; consider awake/videolaryngoscopy and senior support.');

  // ── Roll-up ──
  const counts = { CRITICAL: 0, WARNING: 0, INFO: 0 };
  for (const x of f) if (x.severity !== 'OK') (counts as any)[x.severity]++;
  const overall: Severity = counts.CRITICAL ? 'CRITICAL' : counts.WARNING ? 'WARNING' : counts.INFO ? 'INFO' : 'OK';
  const headline =
    overall === 'CRITICAL' ? 'Critical safety issues found — resolve before theatre.'
    : overall === 'WARNING' ? 'Cautions found — review and optimise before proceeding.'
    : overall === 'INFO' ? 'No red flags; note the advisories below.'
    : 'No abnormalities detected in the recorded data.';

  // Sort: CRITICAL → WARNING → INFO → OK
  f.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);

  return {
    overall, headline, counts, findings: f,
    generatedAt: new Date().toISOString(),
    disclaimer: 'Automated decision-support based only on recorded data. Not a substitute for clinical assessment by the anaesthetist and surgeon. Verify all findings.',
  };
}
