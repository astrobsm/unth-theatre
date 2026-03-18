'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import {
  FlaskConical,
  Bell,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  Plus,
  Volume2,
  Eye,
  Beaker,
  TestTube,
  Send,
  RefreshCw,
  FileCheck,
  ClipboardCheck,
  Microscope,
  Upload,
  CheckCheck,
  Loader2,
  Activity,
  ArrowRight,
  Clipboard,
  Download,
} from 'lucide-react';

interface LabTest {
  id: string;
  testName: string;
  testCategory: string;
  sampleCollected: boolean;
  sampleCollectedAt: string | null;
  sampleCollectedBy: { fullName: string } | null;
  receivedAtLabAt: string | null;
  receivedByLab: { fullName: string } | null;
  processingStartedAt: string | null;
  resultValue: string | null;
  resultUnit: string | null;
  referenceRange: string | null;
  abnormalResult: boolean;
  criticalResult: boolean;
  resultNotes: string | null;
  resultEnteredBy: { fullName: string } | null;
  resultEnteredAt: string | null;
  resultVerifiedBy: { fullName: string } | null;
  viewedBySurgeon: boolean;
  viewedByAnaesthetist: boolean;
  status: string;
  turnaroundMinutes: number | null;
}

interface LabRequest {
  id: string;
  patientName: string;
  folderNumber: string;
  age: number | null;
  gender: string | null;
  ward: string | null;
  diagnosis: string | null;
  priority: string;
  clinicalIndication: string;
  status: string;
  requestedByName: string;
  requestedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: { fullName: string; role: string } | null;
  voiceNotificationSent: boolean;
  emergencyBooking: { procedureName: string; priority: string } | null;
  surgery: { procedureName: string; status: string } | null;
  labTests: LabTest[];
  requestedBy: { fullName: string; role: string };
}

interface VoiceNotification {
  id: string;
  isVoiceNotification: boolean;
  voiceMessage: string;
  pushTitle: string;
  pushMessage: string;
  notificationType: string;
  acknowledged: boolean;
  voicePlayed: boolean;
  emergencyLabRequest: {
    id: string;
    patientName: string;
    folderNumber: string;
    priority: string;
  };
}

const TEST_CATEGORIES = [
  { value: 'HEMATOLOGY', label: 'Hematology', tests: ['FBC', 'ESR', 'Blood Film', 'Reticulocyte Count', 'HbSS Genotype'] },
  { value: 'BIOCHEMISTRY', label: 'Biochemistry', tests: ['U&E', 'LFT', 'Glucose', 'Lipid Profile', 'Serum Amylase', 'Cardiac Enzymes', 'TFT', 'Serum Proteins'] },
  { value: 'COAGULATION', label: 'Coagulation', tests: ['PT/INR', 'aPTT', 'Bleeding Time', 'Clotting Time', 'D-Dimer', 'Fibrinogen'] },
  { value: 'BLOOD_GAS', label: 'Blood Gas', tests: ['ABG', 'VBG', 'Lactate'] },
  { value: 'CROSS_MATCH', label: 'Cross Match', tests: ['Group & Cross-match', 'Blood Grouping', 'Antibody Screen'] },
  { value: 'URINALYSIS', label: 'Urinalysis', tests: ['Urinalysis', 'Urine MCS', 'Urine Pregnancy Test'] },
  { value: 'MICROBIOLOGY', label: 'Microbiology', tests: ['Blood Culture', 'Wound Swab MCS', 'Sputum MCS'] },
  { value: 'SEROLOGY', label: 'Serology', tests: ['HIV Screening', 'HBsAg', 'HCV', 'VDRL'] },
  { value: 'RADIOLOGY', label: 'Radiology', tests: ['Chest X-ray', 'Abdominal X-ray', 'CT Scan', 'Ultrasound'] },
  { value: 'ECG', label: 'ECG', tests: ['12-Lead ECG', 'Rhythm Strip'] },
  { value: 'OTHER', label: 'Other', tests: [] },
];

// === WHO/IFCC STANDARD REFERENCE RANGES & CLINICAL DECISION SUPPORT ===
interface TestReference {
  unit: string;
  normalLow: number | null;
  normalHigh: number | null;
  criticalLow: number | null;
  criticalHigh: number | null;
  referenceRange: string;
  isQualitative?: boolean;  // For tests like Blood Grouping, HIV, HBsAg
  qualitativeNormal?: string;
  components?: Record<string, TestReference>; // Sub-components for panels like FBC, U&E, LFT
}

const WHO_REFERENCE_RANGES: Record<string, TestReference> = {
  // === HEMATOLOGY ===
  'FBC': {
    unit: '', referenceRange: 'Panel', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null,
    components: {
      'Haemoglobin (Hb)': { unit: 'g/dL', normalLow: 12.0, normalHigh: 17.5, criticalLow: 7.0, criticalHigh: 20.0, referenceRange: '12.0-17.5' },
      'PCV/Haematocrit': { unit: '%', normalLow: 36, normalHigh: 54, criticalLow: 20, criticalHigh: 60, referenceRange: '36-54' },
      'WBC': { unit: '×10⁹/L', normalLow: 4.0, normalHigh: 11.0, criticalLow: 2.0, criticalHigh: 30.0, referenceRange: '4.0-11.0' },
      'Platelets': { unit: '×10⁹/L', normalLow: 150, normalHigh: 400, criticalLow: 50, criticalHigh: 1000, referenceRange: '150-400' },
      'Neutrophils': { unit: '×10⁹/L', normalLow: 2.0, normalHigh: 7.5, criticalLow: 0.5, criticalHigh: 20.0, referenceRange: '2.0-7.5' },
      'Lymphocytes': { unit: '×10⁹/L', normalLow: 1.0, normalHigh: 4.0, criticalLow: 0.5, criticalHigh: 15.0, referenceRange: '1.0-4.0' },
      'MCV': { unit: 'fL', normalLow: 80, normalHigh: 100, criticalLow: 50, criticalHigh: 120, referenceRange: '80-100' },
      'MCH': { unit: 'pg', normalLow: 27, normalHigh: 32, criticalLow: null, criticalHigh: null, referenceRange: '27-32' },
      'MCHC': { unit: 'g/dL', normalLow: 32, normalHigh: 36, criticalLow: null, criticalHigh: null, referenceRange: '32-36' },
      'RBC': { unit: '×10¹²/L', normalLow: 4.0, normalHigh: 6.0, criticalLow: 2.0, criticalHigh: 8.0, referenceRange: '4.0-6.0' },
    },
  },
  'ESR': { unit: 'mm/hr', normalLow: 0, normalHigh: 20, criticalLow: null, criticalHigh: 100, referenceRange: '0-20' },
  'Blood Film': { unit: '', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null, referenceRange: 'Morphology report', isQualitative: true, qualitativeNormal: 'Normal morphology' },
  'Reticulocyte Count': { unit: '%', normalLow: 0.5, normalHigh: 2.5, criticalLow: null, criticalHigh: 15, referenceRange: '0.5-2.5' },
  'HbSS Genotype': { unit: '', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null, referenceRange: 'AA/AS/SS/SC', isQualitative: true, qualitativeNormal: 'AA' },

  // === BIOCHEMISTRY ===
  'U&E': {
    unit: '', referenceRange: 'Panel', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null,
    components: {
      'Sodium (Na⁺)': { unit: 'mmol/L', normalLow: 135, normalHigh: 145, criticalLow: 120, criticalHigh: 160, referenceRange: '135-145' },
      'Potassium (K⁺)': { unit: 'mmol/L', normalLow: 3.5, normalHigh: 5.0, criticalLow: 2.5, criticalHigh: 6.5, referenceRange: '3.5-5.0' },
      'Chloride (Cl⁻)': { unit: 'mmol/L', normalLow: 98, normalHigh: 106, criticalLow: 80, criticalHigh: 120, referenceRange: '98-106' },
      'Bicarbonate (HCO₃⁻)': { unit: 'mmol/L', normalLow: 22, normalHigh: 29, criticalLow: 10, criticalHigh: 40, referenceRange: '22-29' },
      'Urea': { unit: 'mmol/L', normalLow: 2.5, normalHigh: 6.7, criticalLow: null, criticalHigh: 35.7, referenceRange: '2.5-6.7' },
      'Creatinine': { unit: 'µmol/L', normalLow: 62, normalHigh: 106, criticalLow: null, criticalHigh: 884, referenceRange: '62-106' },
    },
  },
  'LFT': {
    unit: '', referenceRange: 'Panel', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null,
    components: {
      'Total Bilirubin': { unit: 'µmol/L', normalLow: 3, normalHigh: 21, criticalLow: null, criticalHigh: 300, referenceRange: '3-21' },
      'Direct Bilirubin': { unit: 'µmol/L', normalLow: 0, normalHigh: 5, criticalLow: null, criticalHigh: null, referenceRange: '0-5' },
      'AST (SGOT)': { unit: 'U/L', normalLow: 5, normalHigh: 40, criticalLow: null, criticalHigh: 500, referenceRange: '5-40' },
      'ALT (SGPT)': { unit: 'U/L', normalLow: 5, normalHigh: 40, criticalLow: null, criticalHigh: 500, referenceRange: '5-40' },
      'ALP': { unit: 'U/L', normalLow: 44, normalHigh: 147, criticalLow: null, criticalHigh: null, referenceRange: '44-147' },
      'GGT': { unit: 'U/L', normalLow: 5, normalHigh: 85, criticalLow: null, criticalHigh: null, referenceRange: '5-85' },
      'Total Protein': { unit: 'g/L', normalLow: 60, normalHigh: 80, criticalLow: null, criticalHigh: null, referenceRange: '60-80' },
      'Albumin': { unit: 'g/L', normalLow: 35, normalHigh: 50, criticalLow: 15, criticalHigh: null, referenceRange: '35-50' },
    },
  },
  'Glucose': { unit: 'mmol/L', normalLow: 3.9, normalHigh: 5.6, criticalLow: 2.2, criticalHigh: 27.8, referenceRange: '3.9-5.6 (fasting)' },
  'Lipid Profile': {
    unit: '', referenceRange: 'Panel', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null,
    components: {
      'Total Cholesterol': { unit: 'mmol/L', normalLow: 0, normalHigh: 5.2, criticalLow: null, criticalHigh: 13.0, referenceRange: '<5.2 desirable' },
      'Triglycerides': { unit: 'mmol/L', normalLow: 0, normalHigh: 1.7, criticalLow: null, criticalHigh: 11.3, referenceRange: '<1.7 desirable' },
      'HDL': { unit: 'mmol/L', normalLow: 1.0, normalHigh: 99, criticalLow: null, criticalHigh: null, referenceRange: '>1.0' },
      'LDL': { unit: 'mmol/L', normalLow: 0, normalHigh: 3.4, criticalLow: null, criticalHigh: null, referenceRange: '<3.4 optimal' },
    },
  },
  'Serum Amylase': { unit: 'U/L', normalLow: 28, normalHigh: 100, criticalLow: null, criticalHigh: 300, referenceRange: '28-100' },
  'Cardiac Enzymes': {
    unit: '', referenceRange: 'Panel', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null,
    components: {
      'Troponin I': { unit: 'ng/mL', normalLow: 0, normalHigh: 0.04, criticalLow: null, criticalHigh: 2.0, referenceRange: '<0.04' },
      'CK-MB': { unit: 'U/L', normalLow: 0, normalHigh: 25, criticalLow: null, criticalHigh: null, referenceRange: '0-25' },
      'LDH': { unit: 'U/L', normalLow: 140, normalHigh: 280, criticalLow: null, criticalHigh: null, referenceRange: '140-280' },
    },
  },
  'TFT': {
    unit: '', referenceRange: 'Panel', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null,
    components: {
      'TSH': { unit: 'mIU/L', normalLow: 0.4, normalHigh: 4.0, criticalLow: 0.01, criticalHigh: 100, referenceRange: '0.4-4.0' },
      'Free T4': { unit: 'pmol/L', normalLow: 12, normalHigh: 22, criticalLow: 5, criticalHigh: 50, referenceRange: '12-22' },
      'Free T3': { unit: 'pmol/L', normalLow: 3.1, normalHigh: 6.8, criticalLow: null, criticalHigh: null, referenceRange: '3.1-6.8' },
    },
  },
  'Serum Proteins': {
    unit: '', referenceRange: 'Panel', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null,
    components: {
      'Total Protein': { unit: 'g/L', normalLow: 60, normalHigh: 80, criticalLow: null, criticalHigh: null, referenceRange: '60-80' },
      'Albumin': { unit: 'g/L', normalLow: 35, normalHigh: 50, criticalLow: 15, criticalHigh: null, referenceRange: '35-50' },
      'Globulin': { unit: 'g/L', normalLow: 20, normalHigh: 35, criticalLow: null, criticalHigh: null, referenceRange: '20-35' },
    },
  },

  // === COAGULATION ===
  'PT/INR': {
    unit: '', referenceRange: 'Panel', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null,
    components: {
      'PT': { unit: 'seconds', normalLow: 11.0, normalHigh: 13.5, criticalLow: null, criticalHigh: 30, referenceRange: '11.0-13.5' },
      'INR': { unit: 'ratio', normalLow: 0.8, normalHigh: 1.2, criticalLow: null, criticalHigh: 5.0, referenceRange: '0.8-1.2' },
    },
  },
  'aPTT': { unit: 'seconds', normalLow: 25, normalHigh: 35, criticalLow: null, criticalHigh: 100, referenceRange: '25-35' },
  'Bleeding Time': { unit: 'minutes', normalLow: 2, normalHigh: 7, criticalLow: null, criticalHigh: 15, referenceRange: '2-7' },
  'Clotting Time': { unit: 'minutes', normalLow: 5, normalHigh: 11, criticalLow: null, criticalHigh: 20, referenceRange: '5-11' },
  'D-Dimer': { unit: 'µg/mL FEU', normalLow: 0, normalHigh: 0.5, criticalLow: null, criticalHigh: 5.0, referenceRange: '<0.5' },
  'Fibrinogen': { unit: 'g/L', normalLow: 2.0, normalHigh: 4.0, criticalLow: 1.0, criticalHigh: null, referenceRange: '2.0-4.0' },

  // === BLOOD GAS ===
  'ABG': {
    unit: '', referenceRange: 'Panel', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null,
    components: {
      'pH': { unit: '', normalLow: 7.35, normalHigh: 7.45, criticalLow: 7.20, criticalHigh: 7.60, referenceRange: '7.35-7.45' },
      'pCO₂': { unit: 'mmHg', normalLow: 35, normalHigh: 45, criticalLow: 20, criticalHigh: 70, referenceRange: '35-45' },
      'pO₂': { unit: 'mmHg', normalLow: 80, normalHigh: 100, criticalLow: 40, criticalHigh: null, referenceRange: '80-100' },
      'HCO₃⁻': { unit: 'mmol/L', normalLow: 22, normalHigh: 26, criticalLow: 10, criticalHigh: 40, referenceRange: '22-26' },
      'Base Excess': { unit: 'mmol/L', normalLow: -2, normalHigh: 2, criticalLow: -10, criticalHigh: 10, referenceRange: '-2 to +2' },
      'SaO₂': { unit: '%', normalLow: 95, normalHigh: 100, criticalLow: 80, criticalHigh: null, referenceRange: '95-100' },
    },
  },
  'VBG': {
    unit: '', referenceRange: 'Panel', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null,
    components: {
      'pH': { unit: '', normalLow: 7.31, normalHigh: 7.41, criticalLow: 7.15, criticalHigh: 7.55, referenceRange: '7.31-7.41' },
      'pCO₂': { unit: 'mmHg', normalLow: 41, normalHigh: 51, criticalLow: 20, criticalHigh: 70, referenceRange: '41-51' },
      'HCO₃⁻': { unit: 'mmol/L', normalLow: 22, normalHigh: 26, criticalLow: 10, criticalHigh: 40, referenceRange: '22-26' },
    },
  },
  'Lactate': { unit: 'mmol/L', normalLow: 0.5, normalHigh: 2.0, criticalLow: null, criticalHigh: 4.0, referenceRange: '0.5-2.0' },

  // === CROSS MATCH ===
  'Group & Cross-match': { unit: '', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null, referenceRange: 'Compatible/Incompatible', isQualitative: true, qualitativeNormal: 'Compatible' },
  'Blood Grouping': { unit: '', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null, referenceRange: 'A/B/AB/O, Rh+/-', isQualitative: true, qualitativeNormal: '' },
  'Antibody Screen': { unit: '', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null, referenceRange: 'Negative', isQualitative: true, qualitativeNormal: 'Negative' },

  // === URINALYSIS ===
  'Urinalysis': { unit: '', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null, referenceRange: 'Dipstick report', isQualitative: true, qualitativeNormal: 'Normal' },
  'Urine MCS': { unit: '', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null, referenceRange: 'Culture report', isQualitative: true, qualitativeNormal: 'No growth' },
  'Urine Pregnancy Test': { unit: '', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null, referenceRange: 'Positive/Negative', isQualitative: true, qualitativeNormal: 'Negative' },

  // === MICROBIOLOGY ===
  'Blood Culture': { unit: '', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null, referenceRange: 'Culture & Sensitivity', isQualitative: true, qualitativeNormal: 'No growth after 5 days' },
  'Wound Swab MCS': { unit: '', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null, referenceRange: 'Culture & Sensitivity', isQualitative: true, qualitativeNormal: 'No pathogenic organisms' },
  'Sputum MCS': { unit: '', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null, referenceRange: 'Culture & Sensitivity', isQualitative: true, qualitativeNormal: 'Normal flora' },

  // === SEROLOGY ===
  'HIV Screening': { unit: '', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null, referenceRange: 'Reactive/Non-Reactive', isQualitative: true, qualitativeNormal: 'Non-Reactive' },
  'HBsAg': { unit: '', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null, referenceRange: 'Reactive/Non-Reactive', isQualitative: true, qualitativeNormal: 'Non-Reactive' },
  'HCV': { unit: '', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null, referenceRange: 'Reactive/Non-Reactive', isQualitative: true, qualitativeNormal: 'Non-Reactive' },
  'VDRL': { unit: '', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null, referenceRange: 'Reactive/Non-Reactive', isQualitative: true, qualitativeNormal: 'Non-Reactive' },

  // === RADIOLOGY ===
  'Chest X-ray': { unit: '', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null, referenceRange: 'Radiologist report', isQualitative: true, qualitativeNormal: 'Normal study' },
  'Abdominal X-ray': { unit: '', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null, referenceRange: 'Radiologist report', isQualitative: true, qualitativeNormal: 'Normal study' },
  'CT Scan': { unit: '', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null, referenceRange: 'Radiologist report', isQualitative: true, qualitativeNormal: 'No abnormality' },
  'Ultrasound': { unit: '', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null, referenceRange: 'Sonographer report', isQualitative: true, qualitativeNormal: 'Normal study' },

  // === ECG ===
  '12-Lead ECG': { unit: '', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null, referenceRange: 'ECG interpretation', isQualitative: true, qualitativeNormal: 'Normal sinus rhythm' },
  'Rhythm Strip': { unit: '', normalLow: null, normalHigh: null, criticalLow: null, criticalHigh: null, referenceRange: 'Rhythm interpretation', isQualitative: true, qualitativeNormal: 'Normal sinus rhythm' },
};

// Clinical recommendations based on deranged results (WHO/surgical safety standards)
function getRecommendation(testName: string, componentName: string, value: number, ref: TestReference): string {
  const { normalLow, normalHigh, criticalLow, criticalHigh } = ref;
  const isLow = normalLow !== null && value < normalLow;
  const isHigh = normalHigh !== null && value > normalHigh;
  const isCritLow = criticalLow !== null && value < criticalLow;
  const isCritHigh = criticalHigh !== null && value > criticalHigh;
  const key = componentName || testName;

  if (isCritLow || isCritHigh) {
    // Critical value recommendations
    if (key.includes('Haemoglobin') || key === 'Hb') return isCritLow ? '🚨 URGENT: Severe anaemia — Transfuse packed RBCs. Type & Cross-match. Inform surgeon/anaesthetist STAT.' : '🚨 Polycythaemia — Investigate cause. Hydration + haematology consult.';
    if (key.includes('Platelet')) return isCritLow ? '🚨 CRITICAL: Severe thrombocytopenia — Risk of spontaneous bleeding. Platelet transfusion indicated. Hold surgery if <50.' : '🚨 Thrombocytosis — Investigate reactive vs primary cause.';
    if (key.includes('WBC')) return isCritLow ? '🚨 CRITICAL: Severe leucopenia/neutropenia — Infection risk. Reverse barrier nursing. Haematology consult.' : '🚨 Severe leucocytosis — Sepsis workup/differential. Consider ICU.';
    if (key.includes('Potassium') || key === 'K⁺') return isCritLow ? '🚨 CRITICAL: Severe hypokalaemia — ECG monitoring. IV KCl replacement. Risk of cardiac arrhythmia.' : '🚨 CRITICAL: Severe hyperkalaemia — ECG STAT. Calcium gluconate + insulin/dextrose. Cardiac arrest risk.';
    if (key.includes('Sodium') || key === 'Na⁺') return isCritLow ? '🚨 CRITICAL: Severe hyponatraemia — Risk of cerebral oedema. Restrict fluids. 3% NaCl if symptomatic.' : '🚨 CRITICAL: Severe hypernatraemia — Free water deficit. Slow correction to avoid osmotic demyelination.';
    if (key.includes('Glucose')) return isCritLow ? '🚨 CRITICAL: Severe hypoglycaemia — IV 50% Dextrose STAT. Monitor hourly. Assess cause.' : '🚨 CRITICAL: Severe hyperglycaemia — DKA/HHS protocol. Insulin infusion. Fluid resuscitation.';
    if (key === 'pH') return isCritLow ? '🚨 CRITICAL: Severe acidaemia — Assess for sepsis/DKA/lactic acidosis. ABG correlation. ICU referral.' : '🚨 CRITICAL: Severe alkalaemia — Check ventilation, electrolytes. Risk of arrhythmia.';
    if (key.includes('INR')) return isCritHigh ? '🚨 CRITICAL: Coagulopathy — FFP/Vitamin K. High surgical bleeding risk. Postpone elective surgery.' : '';
    if (key === 'Lactate') return isCritHigh ? '🚨 CRITICAL: Severe lactic acidosis — Assess tissue perfusion. Sepsis protocol. Fluid resuscitation. Urgent surgical review.' : '';
    if (key.includes('Troponin')) return isCritHigh ? '🚨 CRITICAL: Acute myocardial injury — Cardiology consult STAT. Serial troponins. ECG. Postpone non-cardiac surgery.' : '';
    if (key.includes('Creatinine')) return isCritHigh ? '🚨 CRITICAL: Acute kidney injury — Nephrology consult. Avoid nephrotoxins. Fluid balance. Consider dialysis.' : '';
    if (key.includes('Bilirubin') && key.includes('Total')) return isCritHigh ? '🚨 CRITICAL: Severe hyperbilirubinaemia — Hepatology consult. Assess liver synthetic function.' : '';
    if (key.includes('Albumin')) return isCritLow ? '🚨 CRITICAL: Severe hypoalbuminaemia — Nutritional support. Albumin infusion if indicated. Increased surgical risk.' : '';
    if (key.includes('Fibrinogen')) return isCritLow ? '🚨 CRITICAL: Hypofibrinogenaemia — DIC screen. Cryoprecipitate. High bleeding risk.' : '';
    if (key.includes('pO₂') || key.includes('SaO₂')) return isCritLow ? '🚨 CRITICAL: Severe hypoxaemia — Supplemental O₂. Assess airway/ventilation. ABG. ICU referral.' : '';
    if (key.includes('Bicarbonate') || key.includes('HCO₃')) return isCritLow ? '🚨 CRITICAL: Severe metabolic acidosis — Identify cause (DKA, lactic acidosis, renal). NaHCO₃ if pH <7.1.' : '🚨 CRITICAL: Severe metabolic alkalosis — Assess volume status. Replace KCl/NaCl.';
    return isCritLow ? '🚨 CRITICALLY LOW — Urgent clinical review required.' : '🚨 CRITICALLY HIGH — Urgent clinical review required.';
  }

  if (isLow || isHigh) {
    // Abnormal (non-critical) recommendations
    if (key.includes('Haemoglobin') || key === 'Hb') return isLow ? '⚠️ Anaemia — Assess type (iron/B12/folate). Consider transfusion if Hb <8 for surgery. Iron studies.' : '⚠️ Elevated Hb — Assess hydration status, consider polycythaemia workup.';
    if (key.includes('Platelet')) return isLow ? '⚠️ Thrombocytopenia — Bleeding risk. Assess cause. Platelet transfusion if <50 pre-op.' : '⚠️ Thrombocytosis — Reactive vs essential. Thrombotic risk assessment.';
    if (key.includes('WBC')) return isLow ? '⚠️ Leucopenia — Infection risk. Assess cause. Monitor closely.' : '⚠️ Leucocytosis — Assess for infection/inflammation. Blood culture if febrile.';
    if (key.includes('Potassium') || key === 'K⁺') return isLow ? '⚠️ Hypokalaemia — Oral/IV replacement. Check ECG. Monitor during anaesthesia.' : '⚠️ Hyperkalaemia — Hold K-sparing drugs. Check ECG. Repeat to confirm.';
    if (key.includes('Sodium') || key === 'Na⁺') return isLow ? '⚠️ Hyponatraemia — Fluid balance review. Assess cause (dilutional vs depletional).' : '⚠️ Hypernatraemia — Assess fluid status. Free water replacement.';
    if (key.includes('Glucose')) return isLow ? '⚠️ Hypoglycaemia — Glucose monitoring. Oral glucose if alert. IV dextrose if symptomatic.' : '⚠️ Hyperglycaemia — Sliding scale insulin. HbA1c check. Optimise before surgery.';
    if (key === 'pH') return isLow ? '⚠️ Acidaemia — Assess respiratory vs metabolic cause. Electrolytes + lactate.' : '⚠️ Alkalaemia — Assess cause. Electrolyte replacement.';
    if (key.includes('PT') && !key.includes('aPTT')) return isHigh ? '⚠️ Prolonged PT — Assess liver function, Vitamin K status. Bleeding risk for surgery.' : '';
    if (key.includes('INR')) return isHigh ? '⚠️ Elevated INR — Warfarin effect or liver dysfunction. Assess bleeding risk.' : '';
    if (key === 'aPTT') return isHigh ? '⚠️ Prolonged aPTT — Assess for heparin effect, factor deficiency, lupus anticoagulant.' : '';
    if (key.includes('D-Dimer')) return isHigh ? '⚠️ Elevated D-Dimer — Consider DVT/PE. Thromboprophylaxis review.' : '';
    if (key === 'Lactate') return isHigh ? '⚠️ Elevated lactate — Early sepsis indicator. Assess tissue perfusion. Fluid resuscitation.' : '';
    if (key.includes('Troponin')) return isHigh ? '⚠️ Elevated troponin — Myocardial injury. Serial monitoring. Cardiology consult. Pre-op risk assessment.' : '';
    if (key.includes('Urea')) return isHigh ? '⚠️ Elevated urea — Assess renal function. Hydration. Pre-renal vs renal cause.' : '';
    if (key.includes('Creatinine')) return isHigh ? '⚠️ Elevated creatinine — Renal impairment. Avoid nephrotoxins. Adjust drug doses.' : '';
    if (key.includes('AST') || key.includes('ALT')) return isHigh ? '⚠️ Elevated transaminases — Hepatic injury. Assess cause. Anaesthetic implications.' : '';
    if (key.includes('Amylase')) return isHigh ? '⚠️ Elevated amylase — Assess for pancreatitis. NPO + IV fluids if >3× ULN.' : '';
    if (key.includes('TSH')) return isHigh ? '⚠️ Elevated TSH — Hypothyroidism. Anaesthetic risk. Assess Free T4.' : isLow ? '⚠️ Low TSH — Hyperthyroidism. Cardiac risk. Beta-blocker. Postpone if thyrotoxic.' : '';
    if (key.includes('ESR')) return isHigh ? '⚠️ Elevated ESR — Non-specific inflammation. Correlate clinically.' : '';
    if (key.includes('MCV')) return isLow ? '⚠️ Microcytosis — Iron deficiency anaemia likely. Iron studies.' : isHigh ? '⚠️ Macrocytosis — B12/folate deficiency. Assess reticulocytes.' : '';
    if (key.includes('Albumin')) return isLow ? '⚠️ Hypoalbuminaemia — Nutritional assessment. Increased surgical risk. Drug binding affected.' : '';
    if (key.includes('pCO₂')) return isLow ? '⚠️ Hypocapnia — Hyperventilation. Assess respiratory compensation.' : isHigh ? '⚠️ Hypercapnia — Hypoventilation. Respiratory failure risk. Assess airway.' : '';
    if (key.includes('pO₂')) return isLow ? '⚠️ Hypoxaemia — Supplemental O₂. Assess ventilation-perfusion.' : '';
    if (key.includes('Base Excess')) return isLow ? '⚠️ Negative base excess — Metabolic acidosis. Assess cause.' : isHigh ? '⚠️ Positive base excess — Metabolic alkalosis.' : '';
    return isLow ? '⚠️ Below normal range — Clinical correlation required.' : '⚠️ Above normal range — Clinical correlation required.';
  }

  return '✅ Within normal range';
}

// Evaluate a result value against the reference
function evaluateResult(testName: string, componentName: string, value: string, ref: TestReference): {
  abnormal: boolean;
  critical: boolean;
  flag: 'NORMAL' | 'LOW' | 'HIGH' | 'CRITICAL_LOW' | 'CRITICAL_HIGH';
  recommendation: string;
  flagColor: string;
  flagLabel: string;
} {
  if (ref.isQualitative) {
    const isAbnormal = ref.qualitativeNormal ? value.trim().toLowerCase() !== ref.qualitativeNormal.toLowerCase() : false;
    // Special handling for serology
    if (['HIV Screening', 'HBsAg', 'HCV', 'VDRL'].includes(testName)) {
      const isReactive = value.toLowerCase().includes('reactive') && !value.toLowerCase().includes('non');
      return {
        abnormal: isReactive,
        critical: isReactive,
        flag: isReactive ? 'CRITICAL_HIGH' : 'NORMAL',
        recommendation: isReactive ? `🚨 ${testName} REACTIVE — Confirm with supplementary test. Infection control precautions. Inform surgeon. Universal precautions in theatre.` : '✅ Non-Reactive',
        flagColor: isReactive ? 'text-red-700 bg-red-50 border-red-200' : 'text-green-700 bg-green-50 border-green-200',
        flagLabel: isReactive ? '🚨 REACTIVE' : '✅ Non-Reactive',
      };
    }
    if (testName === 'Group & Cross-match') {
      const isIncompat = value.toLowerCase().includes('incompatible');
      return {
        abnormal: isIncompat,
        critical: isIncompat,
        flag: isIncompat ? 'CRITICAL_HIGH' : 'NORMAL',
        recommendation: isIncompat ? '🚨 INCOMPATIBLE — Do NOT transfuse. Re-cross-match with fresh sample.' : '✅ Compatible units available',
        flagColor: isIncompat ? 'text-red-700 bg-red-50 border-red-200' : 'text-green-700 bg-green-50 border-green-200',
        flagLabel: isIncompat ? '🚨 INCOMPATIBLE' : '✅ Compatible',
      };
    }
    return {
      abnormal: isAbnormal,
      critical: false,
      flag: isAbnormal ? 'HIGH' : 'NORMAL',
      recommendation: isAbnormal ? '⚠️ Abnormal finding — Clinical review required.' : '✅ Normal',
      flagColor: isAbnormal ? 'text-orange-700 bg-orange-50 border-orange-200' : 'text-green-700 bg-green-50 border-green-200',
      flagLabel: isAbnormal ? '⚠️ Abnormal' : '✅ Normal',
    };
  }

  const numVal = parseFloat(value);
  if (isNaN(numVal)) {
    return { abnormal: false, critical: false, flag: 'NORMAL', recommendation: 'Unable to evaluate — non-numeric value', flagColor: 'text-gray-500 bg-gray-50 border-gray-200', flagLabel: '—' };
  }

  const { normalLow, normalHigh, criticalLow, criticalHigh } = ref;
  const isCritLow = criticalLow !== null && numVal < criticalLow;
  const isCritHigh = criticalHigh !== null && numVal > criticalHigh;
  const isLow = normalLow !== null && numVal < normalLow;
  const isHigh = normalHigh !== null && numVal > normalHigh;

  if (isCritLow) return {
    abnormal: true, critical: true, flag: 'CRITICAL_LOW',
    recommendation: getRecommendation(testName, componentName, numVal, ref),
    flagColor: 'text-red-700 bg-red-50 border-red-300 animate-pulse', flagLabel: '🚨 CRITICAL ↓',
  };
  if (isCritHigh) return {
    abnormal: true, critical: true, flag: 'CRITICAL_HIGH',
    recommendation: getRecommendation(testName, componentName, numVal, ref),
    flagColor: 'text-red-700 bg-red-50 border-red-300 animate-pulse', flagLabel: '🚨 CRITICAL ↑',
  };
  if (isLow) return {
    abnormal: true, critical: false, flag: 'LOW',
    recommendation: getRecommendation(testName, componentName, numVal, ref),
    flagColor: 'text-orange-700 bg-orange-50 border-orange-200', flagLabel: '⚠️ LOW ↓',
  };
  if (isHigh) return {
    abnormal: true, critical: false, flag: 'HIGH',
    recommendation: getRecommendation(testName, componentName, numVal, ref),
    flagColor: 'text-orange-700 bg-orange-50 border-orange-200', flagLabel: '⚠️ HIGH ↑',
  };

  return {
    abnormal: false, critical: false, flag: 'NORMAL',
    recommendation: '✅ Within normal range — No action required.',
    flagColor: 'text-green-700 bg-green-50 border-green-200', flagLabel: '✅ NORMAL',
  };
}

const STATUS_COLORS: Record<string, string> = {
  REQUESTED: 'bg-yellow-100 text-yellow-800',
  NOTIFIED: 'bg-blue-100 text-blue-800',
  ACKNOWLEDGED: 'bg-teal-100 text-teal-800',
  SAMPLE_COLLECTION_DISPATCHED: 'bg-indigo-100 text-indigo-800',
  SAMPLE_COLLECTED: 'bg-purple-100 text-purple-800',
  SAMPLE_RECEIVED_AT_LAB: 'bg-cyan-100 text-cyan-800',
  PROCESSING: 'bg-orange-100 text-orange-800',
  RESULTS_READY: 'bg-green-100 text-green-800',
  RESULTS_VERIFIED: 'bg-emerald-100 text-emerald-800',
  RESULTS_VIEWED: 'bg-gray-100 text-gray-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-600 text-white animate-pulse',
  URGENT: 'bg-orange-500 text-white',
  ROUTINE: 'bg-blue-500 text-white',
};

export default function EmergencyLabWorkupPage() {
  const { data: session } = useSession();
  const [requests, setRequests] = useState<LabRequest[]>([]);
  const [notifications, setNotifications] = useState<VoiceNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showResultsForm, setShowResultsForm] = useState<{ requestId: string; testId: string } | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<LabRequest | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    patientName: '',
    folderNumber: '',
    age: '',
    gender: '',
    ward: '',
    diagnosis: '',
    priority: 'CRITICAL',
    clinicalIndication: '',
    specialInstructions: '',
    selectedTests: [] as { testName: string; testCategory: string; sampleType: string }[],
  });

  // Result entry form
  const [resultData, setResultData] = useState({
    resultValue: '',
    resultUnit: '',
    referenceRange: '',
    abnormalResult: false,
    criticalResult: false,
    resultNotes: '',
  });

  // Bulk result entry
  const [showBulkResultsForm, setShowBulkResultsForm] = useState<string | null>(null);
  const [bulkResults, setBulkResults] = useState<Record<string, {
    resultValue: string;
    resultUnit: string;
    referenceRange: string;
    abnormalResult: boolean;
    criticalResult: boolean;
    resultNotes: string;
    components?: Record<string, { value: string; unit: string; referenceRange: string; }>;
  }>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'in-lab' | 'processing' | 'results'>('all');

  const fetchRequests = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterPriority) params.set('priority', filterPriority);

      const res = await fetch(`/api/emergency-lab-workup?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRequests(data);
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterPriority]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/emergency-lab-workup/notifications?unacknowledged=true&voice=true');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
        // Auto-play voice for new notifications
        data.forEach((n: VoiceNotification) => {
          if (n.isVoiceNotification && !n.voicePlayed && n.voiceMessage) {
            playVoiceAlert(n);
          }
        });
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
    fetchNotifications();
    // Poll every 15 seconds for new notifications
    const interval = setInterval(() => {
      fetchRequests();
      fetchNotifications();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchRequests, fetchNotifications]);

  const playVoiceAlert = async (notification: VoiceNotification) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(notification.voiceMessage);
      utterance.rate = 1.0;
      utterance.pitch = 1.2;
      utterance.volume = 1;
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);

      // Mark as played
      await fetch('/api/emergency-lab-workup/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: notification.id, action: 'VOICE_PLAYED' }),
      });
    }
  };

  const acknowledgeNotification = async (notificationId: string) => {
    await fetch('/api/emergency-lab-workup/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId, action: 'ACKNOWLEDGE' }),
    });
    fetchNotifications();
  };

  const handleAddTest = (testName: string, testCategory: string) => {
    if (!formData.selectedTests.find(t => t.testName === testName)) {
      setFormData(prev => ({
        ...prev,
        selectedTests: [...prev.selectedTests, { testName, testCategory, sampleType: 'Blood' }],
      }));
    }
  };

  const handleRemoveTest = (testName: string) => {
    setFormData(prev => ({
      ...prev,
      selectedTests: prev.selectedTests.filter(t => t.testName !== testName),
    }));
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/emergency-lab-workup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          age: formData.age ? parseInt(formData.age) : undefined,
          tests: formData.selectedTests,
        }),
      });

      if (res.ok) {
        setShowCreateForm(false);
        setFormData({
          patientName: '', folderNumber: '', age: '', gender: '', ward: '',
          diagnosis: '', priority: 'CRITICAL', clinicalIndication: '', specialInstructions: '',
          selectedTests: [],
        });
        fetchRequests();
      }
    } catch (error) {
      console.error('Error creating request:', error);
    }
  };

  const handleAction = async (requestId: string, testId: string, action: string, extraData?: any) => {
    const actionKey = `${requestId}-${testId}-${action}`;
    setActionLoading(actionKey);
    try {
      const res = await fetch(`/api/emergency-lab-workup/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, testId, ...extraData }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.message || 'Action completed successfully');
        fetchRequests();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Action failed');
      }
    } catch (error) {
      console.error('Error performing action:', error);
      toast.error('Network error - please try again');
    } finally {
      setActionLoading(null);
    }
  };

  // Bulk action handler (no testId needed)
  const handleBulkAction = async (requestId: string, action: string, extraData?: any) => {
    const actionKey = `${requestId}-bulk-${action}`;
    setActionLoading(actionKey);
    try {
      const res = await fetch(`/api/emergency-lab-workup/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extraData }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.message || 'Bulk action completed');
        fetchRequests();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Bulk action failed');
      }
    } catch (error) {
      console.error('Error performing bulk action:', error);
      toast.error('Network error');
    } finally {
      setActionLoading(null);
    }
  };

  // Initialize bulk results form for a request
  const initBulkResults = (req: LabRequest) => {
    const initial: Record<string, any> = {};
    req.labTests
      .filter(t => !t.resultValue && (t.receivedAtLabAt || t.processingStartedAt))
      .forEach(t => {
        const ref = WHO_REFERENCE_RANGES[t.testName];
        const hasComponents = ref?.components && Object.keys(ref.components).length > 0;

        // Build components from WHO reference if panel test
        const components: Record<string, { value: string; unit: string; referenceRange: string }> = {};
        if (hasComponents && ref?.components) {
          Object.entries(ref.components).forEach(([compName, compRef]) => {
            components[compName] = {
              value: '',
              unit: compRef.unit,
              referenceRange: compRef.referenceRange,
            };
          });
        }

        initial[t.id] = {
          resultValue: '',
          resultUnit: ref?.unit || '',
          referenceRange: ref?.referenceRange || '',
          abnormalResult: false,
          criticalResult: false,
          resultNotes: '',
          ...(hasComponents ? { components } : {}),
        };
      });
    setBulkResults(initial);
    setShowBulkResultsForm(req.id);
  };

  // Submit bulk results
  const handleSubmitBulkResults = async () => {
    if (!showBulkResultsForm) return;
    const reqForSubmit = requests.find(r => r.id === showBulkResultsForm);
    const results = Object.entries(bulkResults)
      .filter(([, v]) => {
        // Check if direct value or any component value is filled
        if (v.resultValue.trim()) return true;
        if (v.components) return Object.values(v.components).some(c => c.value.trim());
        return false;
      })
      .map(([testId, v]) => {
        const test = reqForSubmit?.labTests.find(t => t.id === testId);
        const testName = test?.testName || '';
        const ref = WHO_REFERENCE_RANGES[testName];

        // For panel tests, aggregate component results into the value field
        let resultValue = v.resultValue;
        let resultUnit = v.resultUnit;
        let referenceRange = v.referenceRange;
        let abnormalResult = false;
        let criticalResult = false;
        let resultNotes = v.resultNotes;

        if (v.components && ref?.components) {
          const lines: string[] = [];
          const refLines: string[] = [];
          const flags: string[] = [];
          Object.entries(v.components).forEach(([compName, comp]) => {
            if (comp.value.trim()) {
              const compRef = ref.components![compName];
              if (compRef) {
                const evaluation = evaluateResult(testName, compName, comp.value, compRef);
                lines.push(`${compName}: ${comp.value} ${comp.unit}`);
                refLines.push(`${compName}: ${comp.referenceRange} ${comp.unit}`);
                if (evaluation.abnormal) abnormalResult = true;
                if (evaluation.critical) criticalResult = true;
                if (evaluation.flag !== 'NORMAL') flags.push(`${compName}: ${evaluation.flagLabel}`);
              }
            }
          });
          resultValue = lines.join(' | ');
          referenceRange = refLines.join(' | ');
          resultUnit = 'Panel';
          if (flags.length > 0 && !resultNotes) resultNotes = flags.join('; ');
        } else if (ref && !ref.isQualitative && resultValue.trim()) {
          const evaluation = evaluateResult(testName, '', resultValue, ref);
          abnormalResult = evaluation.abnormal;
          criticalResult = evaluation.critical;
        } else if (ref?.isQualitative && resultValue.trim()) {
          const evaluation = evaluateResult(testName, '', resultValue, ref);
          abnormalResult = evaluation.abnormal;
          criticalResult = evaluation.critical;
        }

        return { testId, resultValue, resultUnit, referenceRange, abnormalResult, criticalResult, resultNotes };
      });

    if (results.length === 0) {
      toast.error('Please enter at least one result value');
      return;
    }
    await handleBulkAction(showBulkResultsForm, 'BULK_ENTER_RESULTS', { results });
    setShowBulkResultsForm(null);
    setBulkResults({});
  };

  const handleSubmitResults = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showResultsForm) return;
    await handleAction(showResultsForm.requestId, showResultsForm.testId, 'ENTER_RESULTS', resultData);
    setShowResultsForm(null);
    setResultData({ resultValue: '', resultUnit: '', referenceRange: '', abnormalResult: false, criticalResult: false, resultNotes: '' });
  };

  const isLabStaff = session?.user?.role === 'LABORATORY_STAFF';
  const isAdmin = session?.user?.role === 'ADMIN' || session?.user?.role === 'THEATRE_MANAGER';
  const isClinician = ['SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'].includes(session?.user?.role || '');

  // Filter requests by active tab
  const filteredByTab = requests.filter(req => {
    switch (activeTab) {
      case 'pending': return ['REQUESTED', 'NOTIFIED', 'ACKNOWLEDGED'].includes(req.status);
      case 'in-lab': return ['SAMPLE_COLLECTED', 'SAMPLE_RECEIVED_AT_LAB', 'SAMPLE_COLLECTION_DISPATCHED'].includes(req.status);
      case 'processing': return req.status === 'PROCESSING';
      case 'results': return ['RESULTS_READY', 'RESULTS_VERIFIED', 'RESULTS_VIEWED'].includes(req.status);
      default: return true;
    }
  });

  // Get workflow step for a request
  const getWorkflowStep = (req: LabRequest) => {
    const steps = [
      { key: 'REQUESTED', label: 'Requested', icon: Clipboard },
      { key: 'ACKNOWLEDGED', label: 'Acknowledged', icon: ClipboardCheck },
      { key: 'SAMPLE_COLLECTED', label: 'Sample Collected', icon: TestTube },
      { key: 'SAMPLE_RECEIVED_AT_LAB', label: 'Received at Lab', icon: FlaskConical },
      { key: 'PROCESSING', label: 'Processing', icon: Microscope },
      { key: 'RESULTS_READY', label: 'Results Ready', icon: FileCheck },
      { key: 'RESULTS_VERIFIED', label: 'Verified', icon: CheckCheck },
    ];
    const statusOrder = steps.map(s => s.key);
    const currentIdx = statusOrder.indexOf(req.status);
    return { steps, currentIdx };
  };

  return (
    <div className="space-y-6">
      {/* Voice Notification Banner */}
      {notifications.length > 0 && (
        <div className="bg-red-50 border-2 border-red-500 rounded-xl p-4 animate-pulse">
          <div className="flex items-center gap-3 mb-3">
            <Volume2 className="w-8 h-8 text-red-600 animate-bounce" />
            <h3 className="text-lg font-bold text-red-800">
              🔊 EMERGENCY LAB ALERTS ({notifications.length})
            </h3>
          </div>
          {notifications.map(n => (
            <div key={n.id} className="flex items-center justify-between bg-white rounded-lg p-3 mb-2 border border-red-200">
              <div>
                <p className="font-bold text-red-800">{n.pushTitle}</p>
                <p className="text-sm text-red-600">{n.pushMessage}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => playVoiceAlert(n)}
                  className="px-3 py-1 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 flex items-center gap-1"
                >
                  <Volume2 className="w-4 h-4" /> Play
                </button>
                <button
                  onClick={() => acknowledgeNotification(n.id)}
                  className="px-3 py-1 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                >
                  Acknowledge
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <FlaskConical className="w-8 h-8 text-purple-600" />
            Emergency Lab Workup
          </h1>
          <p className="text-gray-600 mt-1">
            Priority lab investigations for emergency surgeries with voice notifications
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { fetchRequests(); fetchNotifications(); }}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          {!isLabStaff && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 flex items-center gap-2 font-semibold shadow-lg"
            >
              <Plus className="w-5 h-5" /> Request Emergency Lab Workup
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{requests.filter(r => r.status === 'REQUESTED' || r.status === 'NOTIFIED').length}</p>
              <p className="text-xs text-gray-500">Pending</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{requests.filter(r => r.status === 'ACKNOWLEDGED').length}</p>
              <p className="text-xs text-gray-500">Acknowledged</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <TestTube className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{requests.filter(r => r.status === 'SAMPLE_COLLECTED' || r.status === 'SAMPLE_RECEIVED_AT_LAB').length}</p>
              <p className="text-xs text-gray-500">In Lab</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <Microscope className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{requests.filter(r => r.status === 'PROCESSING').length}</p>
              <p className="text-xs text-gray-500">Processing</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{requests.filter(r => r.status === 'RESULTS_READY' || r.status === 'RESULTS_VERIFIED' || r.status === 'RESULTS_VIEWED').length}</p>
              <p className="text-xs text-gray-500">Results Ready</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{requests.filter(r => r.priority === 'CRITICAL').length}</p>
              <p className="text-xs text-gray-500">Critical</p>
            </div>
          </div>
        </div>
      </div>

      {/* Lab Scientist Workflow Tabs */}
      {(isLabStaff || isAdmin) && (
        <div className="bg-white rounded-xl shadow-sm border p-2">
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: 'All Requests', count: requests.length, color: 'gray' },
              { key: 'pending', label: '🔔 Awaiting Acknowledgement', count: requests.filter(r => ['REQUESTED', 'NOTIFIED', 'ACKNOWLEDGED'].includes(r.status)).length, color: 'yellow' },
              { key: 'in-lab', label: '🧪 Samples In Lab', count: requests.filter(r => ['SAMPLE_COLLECTED', 'SAMPLE_RECEIVED_AT_LAB', 'SAMPLE_COLLECTION_DISPATCHED'].includes(r.status)).length, color: 'blue' },
              { key: 'processing', label: '🔬 Processing', count: requests.filter(r => r.status === 'PROCESSING').length, color: 'orange' },
              { key: 'results', label: '✅ Results', count: requests.filter(r => ['RESULTS_READY', 'RESULTS_VERIFIED', 'RESULTS_VIEWED'].includes(r.status)).length, color: 'green' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  activeTab === tab.key
                    ? `bg-${tab.color}-600 text-white shadow-md`
                    : `bg-${tab.color}-50 text-${tab.color}-700 hover:bg-${tab.color}-100`
                }`}
              >
                {tab.label}
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  activeTab === tab.key ? 'bg-white/20' : `bg-${tab.color}-200`
                }`}>{tab.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 bg-white rounded-xl shadow-sm border p-4">
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm"
        >
          <option value="">All Statuses</option>
          <option value="REQUESTED">Requested</option>
          <option value="NOTIFIED">Notified</option>
          <option value="ACKNOWLEDGED">Acknowledged</option>
          <option value="SAMPLE_COLLECTED">Sample Collected</option>
          <option value="SAMPLE_RECEIVED_AT_LAB">In Lab</option>
          <option value="PROCESSING">Processing</option>
          <option value="RESULTS_READY">Results Ready</option>
          <option value="RESULTS_VERIFIED">Results Verified</option>
          <option value="RESULTS_VIEWED">Results Viewed</option>
        </select>
        <select
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm"
        >
          <option value="">All Priorities</option>
          <option value="CRITICAL">Critical</option>
          <option value="URGENT">Urgent</option>
          <option value="ROUTINE">Routine</option>
        </select>
      </div>

      {/* Request List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredByTab.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl shadow-sm border">
          <FlaskConical className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-500">
            {activeTab === 'all' ? 'No Emergency Lab Requests' : `No ${activeTab} requests`}
          </h3>
          <p className="text-gray-400">
            {activeTab === 'all' ? 'Emergency lab workup requests will appear here' : 'No requests in this category'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredByTab.map(req => {
            const { steps, currentIdx } = getWorkflowStep(req);
            const pendingTests = req.labTests.filter(t => !t.resultValue);
            const completedTests = req.labTests.filter(t => t.resultValue);
            const allSamplesCollected = req.labTests.every(t => t.sampleCollected);
            const allReceived = req.labTests.every(t => t.receivedAtLabAt);
            const allProcessing = req.labTests.every(t => t.processingStartedAt);
            const needsAcknowledge = ['REQUESTED', 'NOTIFIED'].includes(req.status);
            const canReceiveAll = req.labTests.some(t => t.sampleCollected && !t.receivedAtLabAt);
            const canProcessAll = req.labTests.some(t => t.receivedAtLabAt && !t.processingStartedAt && !t.resultValue);
            const canBulkEnterResults = req.labTests.some(t => (t.receivedAtLabAt || t.processingStartedAt) && !t.resultValue);

            return (
            <div
              key={req.id}
              className={`bg-white rounded-xl shadow-sm border-2 p-6 ${
                req.priority === 'CRITICAL' ? 'border-red-400' : 
                req.priority === 'URGENT' ? 'border-orange-400' : 'border-gray-200'
              }`}
            >
              {/* Request Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${PRIORITY_COLORS[req.priority]}`}>
                    {req.priority}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[req.status] || 'bg-gray-100'}`}>
                    {req.status.replace(/_/g, ' ')}
                  </span>
                  <h3 className="text-lg font-bold text-gray-900">{req.patientName}</h3>
                  <span className="text-sm text-gray-500">({req.folderNumber})</span>
                </div>
                <div className="text-right text-sm text-gray-500">
                  <p>Requested by: {req.requestedBy.fullName}</p>
                  <p>{new Date(req.requestedAt).toLocaleString()}</p>
                  {req.acknowledgedBy && (
                    <p className="text-teal-700 font-medium">
                      ✅ Acknowledged by: {req.acknowledgedBy.fullName}
                      {req.acknowledgedAt && ` at ${new Date(req.acknowledgedAt).toLocaleTimeString()}`}
                    </p>
                  )}
                </div>
              </div>

              {/* Workflow Progress Bar (Lab Staff & Admin) */}
              {(isLabStaff || isAdmin) && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    {steps.map((step, idx) => {
                      const StepIcon = step.icon;
                      const isCompleted = idx <= currentIdx;
                      const isCurrent = idx === currentIdx;
                      return (
                        <div key={step.key} className="flex items-center flex-1">
                          <div className={`flex flex-col items-center ${isCurrent ? 'scale-110' : ''}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                              isCompleted
                                ? isCurrent ? 'bg-purple-600 text-white ring-4 ring-purple-200' : 'bg-green-500 text-white'
                                : 'bg-gray-200 text-gray-500'
                            }`}>
                              {isCompleted && !isCurrent ? <CheckCircle className="w-4 h-4" /> : <StepIcon className="w-4 h-4" />}
                            </div>
                            <span className={`text-[10px] mt-1 text-center leading-tight ${
                              isCurrent ? 'font-bold text-purple-700' : isCompleted ? 'text-green-700' : 'text-gray-400'
                            }`}>{step.label}</span>
                          </div>
                          {idx < steps.length - 1 && (
                            <div className={`flex-1 h-0.5 mx-1 ${idx < currentIdx ? 'bg-green-400' : 'bg-gray-200'}`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Patient Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 p-3 bg-gray-50 rounded-lg text-sm">
                {req.age && <div><span className="text-gray-500">Age:</span> {req.age}</div>}
                {req.gender && <div><span className="text-gray-500">Gender:</span> {req.gender}</div>}
                {req.ward && <div><span className="text-gray-500">Ward:</span> {req.ward}</div>}
                {req.diagnosis && <div><span className="text-gray-500">Diagnosis:</span> {req.diagnosis}</div>}
                <div className="col-span-2"><span className="text-gray-500">Indication:</span> {req.clinicalIndication}</div>
              </div>

              {/* Lab Scientist Bulk Actions */}
              {(isLabStaff || isAdmin) && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {needsAcknowledge && (
                    <button
                      onClick={() => handleBulkAction(req.id, 'ACKNOWLEDGE')}
                      disabled={actionLoading === `${req.id}-bulk-ACKNOWLEDGE`}
                      className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 flex items-center gap-2 shadow-sm disabled:opacity-50 transition-all"
                    >
                      {actionLoading === `${req.id}-bulk-ACKNOWLEDGE` ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ClipboardCheck className="w-4 h-4" />
                      )}
                      Acknowledge Request
                    </button>
                  )}
                  {needsAcknowledge && (
                    <button
                      onClick={() => handleBulkAction(req.id, 'ACKNOWLEDGE_AND_COLLECT_ALL')}
                      disabled={actionLoading === `${req.id}-bulk-ACKNOWLEDGE_AND_COLLECT_ALL`}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 flex items-center gap-2 shadow-sm disabled:opacity-50 transition-all"
                    >
                      {actionLoading === `${req.id}-bulk-ACKNOWLEDGE_AND_COLLECT_ALL` ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <TestTube className="w-4 h-4" />
                      )}
                      Acknowledge & Collect All Samples
                    </button>
                  )}
                  {canReceiveAll && (
                    <button
                      onClick={() => handleBulkAction(req.id, 'RECEIVE_ALL_SAMPLES')}
                      disabled={actionLoading === `${req.id}-bulk-RECEIVE_ALL_SAMPLES`}
                      className="px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-semibold hover:bg-cyan-700 flex items-center gap-2 shadow-sm disabled:opacity-50 transition-all"
                    >
                      {actionLoading === `${req.id}-bulk-RECEIVE_ALL_SAMPLES` ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      Receive All Samples at Lab
                    </button>
                  )}
                  {canProcessAll && (
                    <button
                      onClick={() => handleBulkAction(req.id, 'START_PROCESSING_ALL')}
                      disabled={actionLoading === `${req.id}-bulk-START_PROCESSING_ALL`}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700 flex items-center gap-2 shadow-sm disabled:opacity-50 transition-all"
                    >
                      {actionLoading === `${req.id}-bulk-START_PROCESSING_ALL` ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Microscope className="w-4 h-4" />
                      )}
                      Start Processing All
                    </button>
                  )}
                  {canBulkEnterResults && (
                    <button
                      onClick={() => initBulkResults(req)}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 flex items-center gap-2 shadow-sm transition-all"
                    >
                      <Upload className="w-4 h-4" />
                      Upload All Results
                    </button>
                  )}
                </div>
              )}

              {/* Tests Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-3 font-semibold">Test</th>
                      <th className="text-left p-3 font-semibold">Category</th>
                      <th className="text-left p-3 font-semibold">Status</th>
                      <th className="text-left p-3 font-semibold">Result</th>
                      <th className="text-left p-3 font-semibold">Reference</th>
                      <th className="text-left p-3 font-semibold">Lab Info</th>
                      <th className="text-left p-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {req.labTests.map(test => (
                      <tr key={test.id} className={`border-t ${test.criticalResult ? 'bg-red-50' : test.abnormalResult ? 'bg-yellow-50' : ''}`}>
                        <td className="p-3 font-medium">{test.testName}</td>
                        <td className="p-3 text-gray-600">{test.testCategory.replace(/_/g, ' ')}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLORS[test.status] || 'bg-gray-100'}`}>
                            {test.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="p-3">
                          {test.resultValue ? (
                            <span className={`font-bold ${test.criticalResult ? 'text-red-700' : test.abnormalResult ? 'text-orange-700' : 'text-green-700'}`}>
                              {test.resultValue} {test.resultUnit || ''}
                              {test.criticalResult && ' 🚨'}
                              {test.abnormalResult && !test.criticalResult && ' ⚠️'}
                            </span>
                          ) : (
                            <span className="text-gray-400 italic">Pending</span>
                          )}
                        </td>
                        <td className="p-3 text-gray-500">{test.referenceRange || '-'}</td>
                        <td className="p-3 text-xs text-gray-500">
                          {test.sampleCollectedBy && (
                            <div>Collected: {test.sampleCollectedBy.fullName}</div>
                          )}
                          {test.receivedByLab && (
                            <div>Received: {test.receivedByLab.fullName}</div>
                          )}
                          {test.resultEnteredBy && (
                            <div>Result by: {test.resultEnteredBy.fullName}</div>
                          )}
                          {test.resultVerifiedBy && (
                            <div className="text-green-700 font-semibold">Verified: {test.resultVerifiedBy.fullName}</div>
                          )}
                          {test.turnaroundMinutes && (
                            <div className="text-purple-600">TAT: {test.turnaroundMinutes}min</div>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {/* Lab Staff Individual Actions */}
                            {(isLabStaff || isAdmin) && !test.sampleCollected && (
                              <button
                                onClick={() => handleAction(req.id, test.id, 'COLLECT_SAMPLE')}
                                disabled={actionLoading === `${req.id}-${test.id}-COLLECT_SAMPLE`}
                                className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 flex items-center gap-1 disabled:opacity-50"
                              >
                                {actionLoading === `${req.id}-${test.id}-COLLECT_SAMPLE` ? <Loader2 className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />}
                                Collect
                              </button>
                            )}
                            {(isLabStaff || isAdmin) && test.sampleCollected && !test.receivedAtLabAt && (
                              <button
                                onClick={() => handleAction(req.id, test.id, 'RECEIVE_SAMPLE')}
                                disabled={actionLoading === `${req.id}-${test.id}-RECEIVE_SAMPLE`}
                                className="px-2 py-1 bg-cyan-600 text-white rounded text-xs hover:bg-cyan-700 flex items-center gap-1 disabled:opacity-50"
                              >
                                {actionLoading === `${req.id}-${test.id}-RECEIVE_SAMPLE` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                                Receive
                              </button>
                            )}
                            {(isLabStaff || isAdmin) && test.receivedAtLabAt && !test.processingStartedAt && !test.resultValue && (
                              <button
                                onClick={() => handleAction(req.id, test.id, 'START_PROCESSING')}
                                disabled={actionLoading === `${req.id}-${test.id}-START_PROCESSING`}
                                className="px-2 py-1 bg-orange-600 text-white rounded text-xs hover:bg-orange-700 flex items-center gap-1 disabled:opacity-50"
                              >
                                {actionLoading === `${req.id}-${test.id}-START_PROCESSING` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Microscope className="w-3 h-3" />}
                                Process
                              </button>
                            )}
                            {(isLabStaff || isAdmin) && (test.receivedAtLabAt || test.processingStartedAt) && !test.resultValue && (
                              <button
                                onClick={() => setShowResultsForm({ requestId: req.id, testId: test.id })}
                                className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 flex items-center gap-1"
                              >
                                <Upload className="w-3 h-3" /> Enter Result
                              </button>
                            )}
                            {(isLabStaff || isAdmin) && test.resultValue && !test.resultVerifiedBy && (
                              <button
                                onClick={() => handleAction(req.id, test.id, 'VERIFY_RESULTS')}
                                disabled={actionLoading === `${req.id}-${test.id}-VERIFY_RESULTS`}
                                className="px-2 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700 flex items-center gap-1 disabled:opacity-50"
                              >
                                {actionLoading === `${req.id}-${test.id}-VERIFY_RESULTS` ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
                                Verify
                              </button>
                            )}
                            {/* Clinician Actions */}
                            {isClinician && test.resultValue && (
                              <button
                                onClick={() => handleAction(req.id, test.id, 'VIEW_RESULTS')}
                                className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 flex items-center gap-1"
                              >
                                <Eye className="w-3 h-3" /> View
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Progress Summary */}
              <div className="mt-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-4">
                  <span className="text-gray-500">
                    <Activity className="w-4 h-4 inline mr-1" />
                    {completedTests.length}/{req.labTests.length} results uploaded
                  </span>
                  {req.labTests.some(t => t.turnaroundMinutes) && (
                    <span className="flex items-center gap-1 text-gray-500">
                      <Clock className="w-4 h-4" />
                      Avg TAT: {Math.round(
                        req.labTests.filter(t => t.turnaroundMinutes).reduce((a, t) => a + (t.turnaroundMinutes || 0), 0) /
                        req.labTests.filter(t => t.turnaroundMinutes).length
                      )} min
                    </span>
                  )}
                </div>
                {/* Progress bar */}
                <div className="flex items-center gap-2">
                  <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        completedTests.length === req.labTests.length ? 'bg-green-500' : 'bg-purple-500'
                      }`}
                      style={{ width: `${(completedTests.length / req.labTests.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500">
                    {Math.round((completedTests.length / req.labTests.length) * 100)}%
                  </span>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Create Request Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                <FlaskConical className="w-7 h-7 text-purple-600" />
                Request Emergency Lab Workup
              </h2>
              <button onClick={() => setShowCreateForm(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="space-y-6">
              {/* Patient Info */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Patient Name *</label>
                  <input
                    type="text" required
                    value={formData.patientName}
                    onChange={e => setFormData(prev => ({ ...prev, patientName: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Folder Number *</label>
                  <input
                    type="text" required
                    value={formData.folderNumber}
                    onChange={e => setFormData(prev => ({ ...prev, folderNumber: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Age</label>
                  <input
                    type="number"
                    value={formData.age}
                    onChange={e => setFormData(prev => ({ ...prev, age: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Gender</label>
                  <select
                    value={formData.gender}
                    onChange={e => setFormData(prev => ({ ...prev, gender: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Ward</label>
                  <input
                    type="text"
                    value={formData.ward}
                    onChange={e => setFormData(prev => ({ ...prev, ward: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Diagnosis</label>
                  <input
                    type="text"
                    value={formData.diagnosis}
                    onChange={e => setFormData(prev => ({ ...prev, diagnosis: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              {/* Priority & Indication */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Priority *</label>
                  <select
                    value={formData.priority}
                    onChange={e => setFormData(prev => ({ ...prev, priority: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="CRITICAL">🚨 CRITICAL</option>
                    <option value="URGENT">⚠️ URGENT</option>
                    <option value="ROUTINE">📋 ROUTINE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Clinical Indication *</label>
                  <input
                    type="text" required
                    value={formData.clinicalIndication}
                    onChange={e => setFormData(prev => ({ ...prev, clinicalIndication: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="e.g., Emergency appendectomy - rule out infection"
                  />
                </div>
              </div>

              {/* Test Selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">Select Investigations *</label>
                <div className="space-y-3">
                  {TEST_CATEGORIES.map(cat => (
                    <div key={cat.value} className="border rounded-lg p-3">
                      <p className="font-semibold text-sm text-gray-800 mb-2">{cat.label}</p>
                      <div className="flex flex-wrap gap-2">
                        {cat.tests.map(test => {
                          const isSelected = formData.selectedTests.some(t => t.testName === test);
                          return (
                            <button
                              key={test}
                              type="button"
                              onClick={() => isSelected ? handleRemoveTest(test) : handleAddTest(test, cat.value)}
                              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                                isSelected
                                  ? 'bg-purple-600 text-white'
                                  : 'bg-gray-100 text-gray-700 hover:bg-purple-100'
                              }`}
                            >
                              {isSelected ? '✓ ' : ''}{test}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {formData.selectedTests.length > 0 && (
                  <div className="mt-3 p-3 bg-purple-50 rounded-lg">
                    <p className="text-sm font-semibold text-purple-800">
                      Selected Tests ({formData.selectedTests.length}):
                    </p>
                    <p className="text-sm text-purple-600">
                      {formData.selectedTests.map(t => t.testName).join(', ')}
                    </p>
                  </div>
                )}
              </div>

              {/* Special Instructions */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Special Instructions</label>
                <textarea
                  value={formData.specialInstructions}
                  onChange={e => setFormData(prev => ({ ...prev, specialInstructions: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={2}
                  placeholder="Any special instructions for the lab..."
                />
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formData.selectedTests.length === 0}
                  className="px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 flex items-center gap-2 font-semibold disabled:opacity-50"
                >
                  <Send className="w-5 h-5" /> Submit & Notify Lab
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Results Entry Modal */}
      {showResultsForm && (() => {
        const reqForResult = requests.find(r => r.id === showResultsForm.requestId);
        const testForResult = reqForResult?.labTests.find(t => t.id === showResultsForm.testId);
        return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
              <Beaker className="w-6 h-6 text-green-600" />
              Enter Investigation Results
            </h2>
            {testForResult && (
              <div className="mb-4 p-3 bg-purple-50 rounded-lg">
                <p className="font-semibold text-purple-800">{testForResult.testName}</p>
                <p className="text-sm text-purple-600">{testForResult.testCategory.replace(/_/g, ' ')} &bull; {reqForResult?.patientName} ({reqForResult?.folderNumber})</p>
              </div>
            )}
            <form onSubmit={handleSubmitResults} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Result Value *</label>
                <input
                  type="text" required
                  value={resultData.resultValue}
                  onChange={e => setResultData(prev => ({ ...prev, resultValue: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="e.g., 12.5, Positive, Reactive, A+"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Unit</label>
                  <input
                    type="text"
                    value={resultData.resultUnit}
                    onChange={e => setResultData(prev => ({ ...prev, resultUnit: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="e.g., g/dL, mmol/L"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Reference Range</label>
                  <input
                    type="text"
                    value={resultData.referenceRange}
                    onChange={e => setResultData(prev => ({ ...prev, referenceRange: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="e.g., 11.5-16.0"
                  />
                </div>
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={resultData.abnormalResult}
                    onChange={e => setResultData(prev => ({ ...prev, abnormalResult: e.target.checked }))}
                    className="w-4 h-4 text-orange-600 rounded"
                  />
                  <span className="text-sm font-medium text-orange-700">⚠️ Abnormal</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={resultData.criticalResult}
                    onChange={e => setResultData(prev => ({ ...prev, criticalResult: e.target.checked }))}
                    className="w-4 h-4 text-red-600 rounded"
                  />
                  <span className="text-sm font-medium text-red-700">🚨 Critical</span>
                </label>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Lab Scientist Notes</label>
                <textarea
                  value={resultData.resultNotes}
                  onChange={e => setResultData(prev => ({ ...prev, resultNotes: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={2}
                  placeholder="Additional comments on the result..."
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowResultsForm(null)} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">
                  Cancel
                </button>
                <button type="submit" className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold flex items-center gap-2">
                  <Upload className="w-4 h-4" /> Submit Results
                </button>
              </div>
            </form>
          </div>
        </div>
        );
      })()}

      {/* Bulk Results Entry Modal — WHO Standard */}
      {showBulkResultsForm && (() => {
        const reqForBulk = requests.find(r => r.id === showBulkResultsForm);
        const testsToFill = reqForBulk?.labTests.filter(t => !t.resultValue && (t.receivedAtLabAt || t.processingStartedAt)) || [];

        // Count filled results
        const filledCount = Object.values(bulkResults).filter(v => {
          if (v.resultValue.trim()) return true;
          if (v.components) return Object.values(v.components).some(c => c.value.trim());
          return false;
        }).length;

        // Count flagged results
        const flaggedTests: { testName: string; evaluation: ReturnType<typeof evaluateResult> }[] = [];
        testsToFill.forEach(test => {
          const br = bulkResults[test.id];
          if (!br) return;
          const ref = WHO_REFERENCE_RANGES[test.testName];
          if (!ref) return;
          if (br.components && ref.components) {
            Object.entries(br.components).forEach(([compName, comp]) => {
              if (comp.value.trim() && ref.components![compName]) {
                const ev = evaluateResult(test.testName, compName, comp.value, ref.components![compName]);
                if (ev.flag !== 'NORMAL') flaggedTests.push({ testName: `${test.testName} → ${compName}`, evaluation: ev });
              }
            });
          } else if (br.resultValue.trim()) {
            const ev = evaluateResult(test.testName, '', br.resultValue, ref);
            if (ev.flag !== 'NORMAL') flaggedTests.push({ testName: test.testName, evaluation: ev });
          }
        });

        return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b z-10 px-8 py-5 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                  <Upload className="w-7 h-7 text-green-600" />
                  Upload Investigation Results
                  <span className="text-sm font-normal text-gray-500">(WHO Standard)</span>
                </h2>
                <button onClick={() => { setShowBulkResultsForm(null); setBulkResults({}); }} className="text-gray-400 hover:text-gray-600">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              {reqForBulk && (
                <div className="mt-3 p-3 bg-purple-50 rounded-lg border border-purple-200 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-lg text-purple-900">{reqForBulk.patientName} ({reqForBulk.folderNumber})</p>
                    <p className="text-sm text-purple-700">{reqForBulk.diagnosis} &bull; {reqForBulk.ward} &bull; Age: {reqForBulk.age} &bull; {reqForBulk.gender}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${PRIORITY_COLORS[reqForBulk.priority]}`}>
                    {reqForBulk.priority}
                  </span>
                </div>
              )}

              {/* Flagged results summary bar */}
              {flaggedTests.length > 0 && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm font-bold text-red-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    {flaggedTests.filter(f => f.evaluation.critical).length} Critical &bull; {flaggedTests.filter(f => f.evaluation.abnormal && !f.evaluation.critical).length} Abnormal Results Detected
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {flaggedTests.map((ft, i) => (
                      <span key={i} className={`text-xs px-2 py-0.5 rounded-full border ${ft.evaluation.flagColor}`}>
                        {ft.testName}: {ft.evaluation.flagLabel}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Test entries */}
            <div className="px-8 py-4 space-y-4">
              {testsToFill.map(test => {
                const ref = WHO_REFERENCE_RANGES[test.testName];
                const isPanel = ref?.components && Object.keys(ref.components).length > 0;
                const br = bulkResults[test.id];

                return (
                  <div key={test.id} className="border rounded-xl overflow-hidden bg-white shadow-sm">
                    {/* Test header */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b">
                      <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-bold">
                        {test.testCategory.replace(/_/g, ' ')}
                      </span>
                      <h4 className="font-bold text-gray-900">{test.testName}</h4>
                      {isPanel && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Panel Test</span>}
                      {ref?.isQualitative && <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded">Qualitative</span>}
                      {test.processingStartedAt && (
                        <span className="text-xs text-orange-600 flex items-center gap-1 ml-auto">
                          <Microscope className="w-3 h-3" /> Processing since {new Date(test.processingStartedAt).toLocaleTimeString()}
                        </span>
                      )}
                    </div>

                    <div className="p-4">
                      {isPanel && ref?.components ? (
                        /* === PANEL TEST: Render each component separately === */
                        <div className="space-y-3">
                          <div className="grid grid-cols-12 gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider px-1">
                            <div className="col-span-3">Parameter</div>
                            <div className="col-span-2">Result</div>
                            <div className="col-span-1">Unit</div>
                            <div className="col-span-2">Reference</div>
                            <div className="col-span-2">Flag</div>
                            <div className="col-span-2">Status</div>
                          </div>
                          {Object.entries(ref.components).map(([compName, compRef]) => {
                            const compValue = br?.components?.[compName]?.value || '';
                            const evaluation = compValue.trim() ? evaluateResult(test.testName, compName, compValue, compRef) : null;
                            return (
                              <div key={compName} className={`grid grid-cols-12 gap-2 items-center px-1 py-2 rounded-lg ${evaluation?.critical ? 'bg-red-50 border border-red-200' : evaluation?.abnormal ? 'bg-orange-50 border border-orange-200' : compValue.trim() ? 'bg-green-50 border border-green-100' : 'bg-gray-50'}`}>
                                <div className="col-span-3">
                                  <span className="text-sm font-semibold text-gray-800">{compName}</span>
                                </div>
                                <div className="col-span-2">
                                  <input
                                    type="text"
                                    value={compValue}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setBulkResults(prev => ({
                                        ...prev,
                                        [test.id]: {
                                          ...prev[test.id],
                                          components: {
                                            ...prev[test.id]?.components,
                                            [compName]: { ...prev[test.id]?.components?.[compName]!, value: val },
                                          },
                                        },
                                      }));
                                    }}
                                    className={`w-full px-2 py-1.5 border rounded-lg text-sm font-medium ${evaluation?.critical ? 'border-red-400 bg-white text-red-800 font-bold' : evaluation?.abnormal ? 'border-orange-400 bg-white text-orange-800' : 'border-gray-300'}`}
                                    placeholder="Enter value"
                                  />
                                </div>
                                <div className="col-span-1">
                                  <span className="text-xs text-gray-600">{compRef.unit}</span>
                                </div>
                                <div className="col-span-2">
                                  <span className="text-xs text-gray-600 font-mono">{compRef.referenceRange}</span>
                                </div>
                                <div className="col-span-2">
                                  {evaluation && (
                                    <span className={`text-xs px-2 py-1 rounded-full border font-bold ${evaluation.flagColor}`}>
                                      {evaluation.flagLabel}
                                    </span>
                                  )}
                                </div>
                                <div className="col-span-2">
                                  {evaluation && evaluation.flag !== 'NORMAL' && (
                                    <span className={`text-xs ${evaluation.critical ? 'text-red-700' : 'text-orange-700'}`}>
                                      {evaluation.flag === 'LOW' || evaluation.flag === 'CRITICAL_LOW' ? '↓ Low' : '↑ High'}
                                    </span>
                                  )}
                                  {evaluation && evaluation.flag === 'NORMAL' && (
                                    <span className="text-xs text-green-700">Normal</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          {/* Recommendations for this panel */}
                          {(() => {
                            const panelRecs: { comp: string; rec: string; critical: boolean }[] = [];
                            if (br?.components && ref.components) {
                              Object.entries(br.components).forEach(([compName, comp]) => {
                                if (comp.value.trim() && ref.components![compName]) {
                                  const ev = evaluateResult(test.testName, compName, comp.value, ref.components![compName]);
                                  if (ev.flag !== 'NORMAL') panelRecs.push({ comp: compName, rec: ev.recommendation, critical: ev.critical });
                                }
                              });
                            }
                            if (panelRecs.length === 0) return null;
                            return (
                              <div className="mt-2 space-y-1">
                                <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Clinical Recommendations</p>
                                {panelRecs.map((pr, i) => (
                                  <div key={i} className={`text-xs p-2 rounded-lg border ${pr.critical ? 'bg-red-50 border-red-200 text-red-800' : 'bg-orange-50 border-orange-200 text-orange-800'}`}>
                                    <span className="font-bold">{pr.comp}:</span> {pr.rec}
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                          {/* Notes */}
                          <div className="mt-2">
                            <input
                              type="text"
                              value={br?.resultNotes || ''}
                              onChange={e => setBulkResults(prev => ({
                                ...prev,
                                [test.id]: { ...prev[test.id], resultNotes: e.target.value },
                              }))}
                              className="w-full px-3 py-1.5 border rounded-lg text-sm text-gray-700"
                              placeholder="Additional notes for this panel..."
                            />
                          </div>
                        </div>
                      ) : ref?.isQualitative ? (
                        /* === QUALITATIVE TEST === */
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 mb-1">Result *</label>
                              {['HIV Screening', 'HBsAg', 'HCV', 'VDRL'].includes(test.testName) ? (
                                <select
                                  value={br?.resultValue || ''}
                                  onChange={e => setBulkResults(prev => ({
                                    ...prev,
                                    [test.id]: { ...prev[test.id], resultValue: e.target.value },
                                  }))}
                                  className="w-full px-3 py-2 border rounded-lg text-sm font-medium"
                                >
                                  <option value="">Select result...</option>
                                  <option value="Non-Reactive">Non-Reactive</option>
                                  <option value="Reactive">Reactive</option>
                                  <option value="Indeterminate">Indeterminate</option>
                                </select>
                              ) : test.testName === 'Blood Grouping' ? (
                                <select
                                  value={br?.resultValue || ''}
                                  onChange={e => setBulkResults(prev => ({
                                    ...prev,
                                    [test.id]: { ...prev[test.id], resultValue: e.target.value },
                                  }))}
                                  className="w-full px-3 py-2 border rounded-lg text-sm font-medium"
                                >
                                  <option value="">Select blood group...</option>
                                  <option value="A Rh Positive">A Rh Positive</option>
                                  <option value="A Rh Negative">A Rh Negative</option>
                                  <option value="B Rh Positive">B Rh Positive</option>
                                  <option value="B Rh Negative">B Rh Negative</option>
                                  <option value="AB Rh Positive">AB Rh Positive</option>
                                  <option value="AB Rh Negative">AB Rh Negative</option>
                                  <option value="O Rh Positive">O Rh Positive</option>
                                  <option value="O Rh Negative">O Rh Negative</option>
                                </select>
                              ) : test.testName === 'Group & Cross-match' ? (
                                <select
                                  value={br?.resultValue || ''}
                                  onChange={e => setBulkResults(prev => ({
                                    ...prev,
                                    [test.id]: { ...prev[test.id], resultValue: e.target.value },
                                  }))}
                                  className="w-full px-3 py-2 border rounded-lg text-sm font-medium"
                                >
                                  <option value="">Select result...</option>
                                  <option value="Compatible">Compatible</option>
                                  <option value="Incompatible">Incompatible</option>
                                  <option value="Pending further testing">Pending further testing</option>
                                </select>
                              ) : test.testName === 'HbSS Genotype' ? (
                                <select
                                  value={br?.resultValue || ''}
                                  onChange={e => setBulkResults(prev => ({
                                    ...prev,
                                    [test.id]: { ...prev[test.id], resultValue: e.target.value },
                                  }))}
                                  className="w-full px-3 py-2 border rounded-lg text-sm font-medium"
                                >
                                  <option value="">Select genotype...</option>
                                  <option value="AA">AA (Normal)</option>
                                  <option value="AS">AS (Sickle Cell Trait)</option>
                                  <option value="SS">SS (Sickle Cell Disease)</option>
                                  <option value="SC">SC (Sickle Cell HbC)</option>
                                  <option value="AC">AC (HbC Trait)</option>
                                  <option value="CC">CC (HbC Disease)</option>
                                </select>
                              ) : (
                                <textarea
                                  value={br?.resultValue || ''}
                                  onChange={e => setBulkResults(prev => ({
                                    ...prev,
                                    [test.id]: { ...prev[test.id], resultValue: e.target.value },
                                  }))}
                                  className="w-full px-3 py-2 border rounded-lg text-sm"
                                  rows={3}
                                  placeholder={`Enter ${test.testName} findings...`}
                                />
                              )}
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 mb-1">Expected Normal</label>
                              <div className="px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 font-medium">
                                {ref?.qualitativeNormal || ref?.referenceRange || '—'}
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 mb-1">Flag</label>
                              {br?.resultValue.trim() ? (() => {
                                const ev = evaluateResult(test.testName, '', br.resultValue, ref);
                                return (
                                  <div className={`px-3 py-2 rounded-lg border text-sm font-bold ${ev.flagColor}`}>
                                    {ev.flagLabel}
                                  </div>
                                );
                              })() : (
                                <div className="px-3 py-2 bg-gray-50 border rounded-lg text-sm text-gray-400">Awaiting result</div>
                              )}
                            </div>
                          </div>
                          {/* Recommendation for qualitative */}
                          {br?.resultValue.trim() && (() => {
                            const ev = evaluateResult(test.testName, '', br.resultValue, ref);
                            if (ev.flag === 'NORMAL') return null;
                            return (
                              <div className={`mt-2 text-xs p-3 rounded-lg border ${ev.critical ? 'bg-red-50 border-red-200 text-red-800' : 'bg-orange-50 border-orange-200 text-orange-800'}`}>
                                <span className="font-bold">Recommendation:</span> {ev.recommendation}
                              </div>
                            );
                          })()}
                          {/* Notes */}
                          <div className="mt-2">
                            <input
                              type="text"
                              value={br?.resultNotes || ''}
                              onChange={e => setBulkResults(prev => ({
                                ...prev,
                                [test.id]: { ...prev[test.id], resultNotes: e.target.value },
                              }))}
                              className="w-full px-3 py-1.5 border rounded-lg text-sm"
                              placeholder="Notes..."
                            />
                          </div>
                        </div>
                      ) : (
                        /* === SIMPLE NUMERIC TEST === */
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
                            <div className="col-span-2 md:col-span-1">
                              <label className="block text-xs font-semibold text-gray-600 mb-1">Result *</label>
                              <input
                                type="text"
                                value={br?.resultValue || ''}
                                onChange={e => setBulkResults(prev => ({
                                  ...prev,
                                  [test.id]: { ...prev[test.id], resultValue: e.target.value },
                                }))}
                                className={`w-full px-2 py-1.5 border rounded-lg text-sm font-medium ${
                                  br?.resultValue.trim() && ref ? (() => {
                                    const ev = evaluateResult(test.testName, '', br.resultValue, ref);
                                    return ev.critical ? 'border-red-400 text-red-800 font-bold' : ev.abnormal ? 'border-orange-400 text-orange-800' : 'border-green-400';
                                  })() : 'border-gray-300'
                                }`}
                                placeholder="Value"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 mb-1">Unit</label>
                              <div className="px-2 py-1.5 bg-gray-50 border rounded-lg text-sm text-gray-700 font-medium">
                                {ref?.unit || br?.resultUnit || '—'}
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 mb-1">Reference Range</label>
                              <div className="px-2 py-1.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 font-mono">
                                {ref?.referenceRange || br?.referenceRange || '—'}
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 mb-1">Critical Range</label>
                              <div className="px-2 py-1.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-mono">
                                {ref ? `<${ref.criticalLow ?? '—'} or >${ref.criticalHigh ?? '—'}` : '—'}
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 mb-1">Flag</label>
                              {br?.resultValue.trim() && ref ? (() => {
                                const ev = evaluateResult(test.testName, '', br.resultValue, ref);
                                return (
                                  <div className={`px-2 py-1.5 rounded-lg border text-sm font-bold text-center ${ev.flagColor}`}>
                                    {ev.flagLabel}
                                  </div>
                                );
                              })() : (
                                <div className="px-2 py-1.5 bg-gray-50 border rounded-lg text-sm text-gray-400 text-center">—</div>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
                              <input
                                type="text"
                                value={br?.resultNotes || ''}
                                onChange={e => setBulkResults(prev => ({
                                  ...prev,
                                  [test.id]: { ...prev[test.id], resultNotes: e.target.value },
                                }))}
                                className="w-full px-2 py-1.5 border rounded-lg text-sm"
                                placeholder="Notes"
                              />
                            </div>
                          </div>
                          {/* Recommendation */}
                          {br?.resultValue.trim() && ref && (() => {
                            const ev = evaluateResult(test.testName, '', br.resultValue, ref);
                            return (
                              <div className={`text-xs p-2 rounded-lg border ${ev.critical ? 'bg-red-50 border-red-200 text-red-800' : ev.abnormal ? 'bg-orange-50 border-orange-200 text-orange-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
                                <span className="font-bold">Recommendation:</span> {ev.recommendation}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white border-t px-8 py-4 rounded-b-2xl">
              <div className="flex gap-3 justify-between items-center">
                <div className="flex items-center gap-4">
                  <p className="text-sm text-gray-600">
                    <span className="font-bold text-gray-900">{filledCount}</span> of {testsToFill.length} results filled
                  </p>
                  {flaggedTests.length > 0 && (
                    <p className="text-sm">
                      <span className="font-bold text-red-600">{flaggedTests.filter(f => f.evaluation.critical).length} critical</span>
                      {' • '}
                      <span className="font-bold text-orange-600">{flaggedTests.filter(f => f.evaluation.abnormal && !f.evaluation.critical).length} abnormal</span>
                    </p>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowBulkResultsForm(null); setBulkResults({}); }}
                    className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitBulkResults}
                    disabled={filledCount === 0}
                    className="px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 flex items-center gap-2 font-semibold disabled:opacity-50 shadow-lg"
                  >
                    <Send className="w-5 h-5" /> Submit Results & Notify Clinical Team
                    {flaggedTests.filter(f => f.evaluation.critical).length > 0 && (
                      <span className="px-2 py-0.5 bg-red-500 rounded-full text-xs animate-pulse">
                        {flaggedTests.filter(f => f.evaluation.critical).length} Critical
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
