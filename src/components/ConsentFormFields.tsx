'use client';

import { Plus, Trash2 } from 'lucide-react';
import SignaturePad from '@/components/SignaturePad';

// Shared UNTH "Consent Form for Procedure / Surgery Treatment, Anaesthesia,
// High Risk Consent" captured inline on the surgery booking forms (elective and
// emergency). The same shape is stored on Surgery.consentFormData so every part
// of the app that needs the consent can read it.
export interface ConsentForm {
  procedureText: string;
  patientName: string;
  surgeonName: string;
  highRiskReasons: string[];
  possibleComplications: string[];

  patientSignature: string | null;
  patientDate: string;
  witnessName: string;
  witnessSignature: string | null;
  witnessDate: string;
  doctorName: string;
  doctorSignature: string | null;
  doctorDate: string;

  useRepresentative: boolean;
  patientUnableReason: string;
  representativeName: string;
  representativeSignature: string | null;
  representativeDate: string;
  repWitnessName: string;
  repWitnessSignature: string | null;
  repWitnessDate: string;
  repDoctorName: string;
  repDoctorSignature: string | null;
  repDoctorDate: string;
}

const today = () => new Date().toISOString().slice(0, 10);

export function emptyConsentForm(): ConsentForm {
  return {
    procedureText: '',
    patientName: '',
    surgeonName: '',
    highRiskReasons: [''],
    possibleComplications: [''],
    patientSignature: null,
    patientDate: today(),
    witnessName: '',
    witnessSignature: null,
    witnessDate: today(),
    doctorName: '',
    doctorSignature: null,
    doctorDate: today(),
    useRepresentative: false,
    patientUnableReason: '',
    representativeName: '',
    representativeSignature: null,
    representativeDate: today(),
    repWitnessName: '',
    repWitnessSignature: null,
    repWitnessDate: today(),
    repDoctorName: '',
    repDoctorSignature: null,
    repDoctorDate: today(),
  };
}

// True once the consent has at least the primary signature (patient or, when the
// patient is unable, the representative) plus a doctor signature.
export function isConsentSigned(f: ConsentForm | null | undefined): boolean {
  if (!f) return false;
  if (f.useRepresentative) {
    return !!f.representativeSignature && !!f.repDoctorSignature;
  }
  return !!f.patientSignature && !!f.doctorSignature;
}

interface Props {
  value: ConsentForm;
  onChange: (next: ConsentForm) => void;
}

export default function ConsentFormFields({ value, onChange }: Props) {
  const set = <K extends keyof ConsentForm>(key: K, v: ConsentForm[K]) =>
    onChange({ ...value, [key]: v });

  const updateList = (key: 'highRiskReasons' | 'possibleComplications', idx: number, v: string) => {
    const next = [...value[key]];
    next[idx] = v;
    set(key, next);
  };
  const addToList = (key: 'highRiskReasons' | 'possibleComplications') =>
    set(key, [...value[key], '']);
  const removeFromList = (key: 'highRiskReasons' | 'possibleComplications', idx: number) =>
    set(key, value[key].filter((_, i) => i !== idx));

  const inputCls =
    'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500';

  return (
    <div className="space-y-5">
      <div className="text-center border-b border-gray-200 pb-3">
        <h3 className="text-lg font-bold text-gray-900">University of Nigeria Teaching Hospital</h3>
        <p className="text-xs text-gray-500">P.M.B. 01129, Enugu, Nigeria.</p>
        <p className="text-sm font-semibold text-gray-700 mt-1">
          Consent Form for Procedure / Surgery Treatment, Anaesthesia, High Risk Consent
        </p>
        <p className="text-xs text-gray-500 italic mt-1">
          (The contents of this form have been explained to me in my spoken language)
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Operation(s) / Procedure(s) / Treatment(s) — no abbreviations
          </label>
          <textarea
            className={inputCls + ' min-h-[60px]'}
            value={value.procedureText}
            onChange={(e) => set('procedureText', e.target.value)}
            placeholder="Write the full procedure name(s) without abbreviations"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name of Patient</label>
            <input className={inputCls} value={value.patientName} onChange={(e) => set('patientName', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Authorising Doctor (Dr.)</label>
            <input className={inputCls} value={value.surgeonName} onChange={(e) => set('surgeonName', e.target.value)} />
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
        I have been advised of the benefits, risks and alternatives of this procedure and understand no
        guarantees can be made. This consent includes the administration of blood / blood products and the
        rendering of such other care as deemed necessary. I consent to medical photography for
        education/publication with my identity protected, as approved by UNTH.
      </p>

      {/* High-risk reasons */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-gray-700">High-risk reasons (as explained by the doctors)</label>
          <button type="button" onClick={() => addToList('highRiskReasons')} className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium">
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
        <div className="space-y-2">
          {value.highRiskReasons.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-5">{i + 1}.</span>
              <input className={inputCls} value={r} onChange={(e) => updateList('highRiskReasons', i, e.target.value)} />
              {value.highRiskReasons.length > 1 && (
                <button type="button" onClick={() => removeFromList('highRiskReasons', i)} className="text-red-500 hover:text-red-700" title="Remove">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Possible complications */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-gray-700">Possible complications of surgery / anaesthesia</label>
          <button type="button" onClick={() => addToList('possibleComplications')} className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium">
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
        <div className="space-y-2">
          {value.possibleComplications.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-5">{i + 1}.</span>
              <input className={inputCls} value={c} onChange={(e) => updateList('possibleComplications', i, e.target.value)} />
              {value.possibleComplications.length > 1 && (
                <button type="button" onClick={() => removeFromList('possibleComplications', i)} className="text-red-500 hover:text-red-700" title="Remove">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Unable-to-consent toggle */}
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={value.useRepresentative}
          onChange={(e) => set('useRepresentative', e.target.checked)}
          className="w-4 h-4 text-primary-600 rounded"
        />
        Patient is unable to consent — a representative / surrogate will sign
      </label>

      {!value.useRepresentative ? (
        <div className="space-y-4 border-t border-gray-200 pt-4">
          <p className="text-sm font-semibold text-gray-800">Authorisation of Patient</p>
          <p className="text-xs text-gray-600">
            I acknowledge that I have discussed and understood this procedure and hereby consent to it.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <SignaturePad label="Patient signature" value={value.patientSignature} onChange={(d) => set('patientSignature', d)} />
              <label className="block text-xs text-gray-500 mt-1">Date</label>
              <input type="date" className={inputCls} value={value.patientDate} onChange={(e) => set('patientDate', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Witness name</label>
              <input className={inputCls} value={value.witnessName} onChange={(e) => set('witnessName', e.target.value)} />
              <div className="mt-2">
                <SignaturePad label="Witness signature" value={value.witnessSignature} onChange={(d) => set('witnessSignature', d)} />
              </div>
              <label className="block text-xs text-gray-500 mt-1">Date</label>
              <input type="date" className={inputCls} value={value.witnessDate} onChange={(e) => set('witnessDate', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Doctor name</label>
              <input className={inputCls} value={value.doctorName} onChange={(e) => set('doctorName', e.target.value)} />
              <div className="mt-2">
                <SignaturePad label="Doctor signature" value={value.doctorSignature} onChange={(d) => set('doctorSignature', d)} />
              </div>
              <label className="block text-xs text-gray-500 mt-1">Date</label>
              <input type="date" className={inputCls} value={value.doctorDate} onChange={(e) => set('doctorDate', e.target.value)} />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4 border-t border-gray-200 pt-4">
          <p className="text-sm font-semibold text-gray-800">Representative / Surrogate authorisation</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason the patient is unable to consent</label>
            <input className={inputCls} value={value.patientUnableReason} onChange={(e) => set('patientUnableReason', e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Representative name</label>
              <input className={inputCls} value={value.representativeName} onChange={(e) => set('representativeName', e.target.value)} />
              <div className="mt-2">
                <SignaturePad label="Representative signature" value={value.representativeSignature} onChange={(d) => set('representativeSignature', d)} />
              </div>
              <label className="block text-xs text-gray-500 mt-1">Date</label>
              <input type="date" className={inputCls} value={value.representativeDate} onChange={(e) => set('representativeDate', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Witness name</label>
              <input className={inputCls} value={value.repWitnessName} onChange={(e) => set('repWitnessName', e.target.value)} />
              <div className="mt-2">
                <SignaturePad label="Witness signature" value={value.repWitnessSignature} onChange={(d) => set('repWitnessSignature', d)} />
              </div>
              <label className="block text-xs text-gray-500 mt-1">Date</label>
              <input type="date" className={inputCls} value={value.repWitnessDate} onChange={(e) => set('repWitnessDate', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Doctor name</label>
              <input className={inputCls} value={value.repDoctorName} onChange={(e) => set('repDoctorName', e.target.value)} />
              <div className="mt-2">
                <SignaturePad label="Doctor signature" value={value.repDoctorSignature} onChange={(d) => set('repDoctorSignature', d)} />
              </div>
              <label className="block text-xs text-gray-500 mt-1">Date</label>
              <input type="date" className={inputCls} value={value.repDoctorDate} onChange={(e) => set('repDoctorDate', e.target.value)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
