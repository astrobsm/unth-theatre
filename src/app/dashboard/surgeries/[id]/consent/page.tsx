'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import jsPDF from 'jspdf';
import {
  ArrowLeft, FileText, PenLine, Upload, Download, Save, Loader2, CheckCircle2, AlertCircle, Plus, Trash2,
} from 'lucide-react';
import SignaturePad from '@/components/SignaturePad';
import { formatAge } from '@/lib/age';

interface PatientInfo {
  id: string;
  name: string;
  folderNumber: string;
  age: number;
  ageUnit?: string;
  gender: string;
  ward: string;
}

interface ConsentForm {
  procedureText: string;
  patientName: string;
  surgeonName: string;
  highRiskReasons: string[];
  possibleComplications: string[];

  // Authorization of patient
  patientSignature: string | null;
  patientDate: string;
  witnessName: string;
  witnessSignature: string | null;
  witnessDate: string;
  doctorName: string;
  doctorSignature: string | null;
  doctorDate: string;

  // Representative / surrogate (used when the patient is unable to consent)
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

function emptyForm(): ConsentForm {
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

export default function SurgeryConsentPage() {
  const params = useParams();
  const router = useRouter();
  const surgeryId = params.id as string;

  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [surgeryType, setSurgeryType] = useState<string>('');
  const [form, setForm] = useState<ConsentForm>(emptyForm());
  const [mode, setMode] = useState<'ELECTRONIC' | 'UPLOAD'>('ELECTRONIC');
  const [uploadFile, setUploadFile] = useState<{ name: string; mimeType: string; base64: string; size: number } | null>(null);
  const [uploadError, setUploadError] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [signedElectronically, setSignedElectronically] = useState(false);

  const set = <K extends keyof ConsentForm>(key: K, value: ConsentForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/surgeries/${surgeryId}/consent-form`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || `Failed to load consent (HTTP ${res.status})`);
        }
        const data = await res.json();
        if (cancelled) return;
        setPatient(data.surgery?.patient || null);
        setSurgeryType(data.surgery?.surgeryType || '');
        setCompletedAt(data.completedAt || null);
        setSignedElectronically(!!data.signedElectronically);
        const surgeon = (data.surgery?.surgeonName || '').replace(/^\s*dr\.?\s*/i, '');
        if (data.form) {
          setForm({ ...emptyForm(), ...data.form });
          if (data.signedElectronically === false && data.hasHardCopy) setMode('UPLOAD');
        } else {
          setForm((f) => ({
            ...f,
            procedureText: data.surgery?.procedureName || '',
            patientName: data.surgery?.patient?.name || '',
            surgeonName: surgeon,
            doctorName: surgeon,
          }));
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load consent form');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [surgeryId]);

  const patientLabel = useMemo(() => {
    if (!patient) return '';
    return `${patient.name} · ${patient.folderNumber} · ${formatAge(patient.age, patient.ageUnit)} · ${patient.gender}`;
  }, [patient]);

  // ---- List helpers (high-risk reasons / complications) ----
  const updateList = (key: 'highRiskReasons' | 'possibleComplications', i: number, v: string) =>
    setForm((f) => ({ ...f, [key]: f[key].map((x, idx) => (idx === i ? v : x)) }));
  const addListItem = (key: 'highRiskReasons' | 'possibleComplications') =>
    setForm((f) => ({ ...f, [key]: [...f[key], ''] }));
  const removeListItem = (key: 'highRiskReasons' | 'possibleComplications', i: number) =>
    setForm((f) => ({ ...f, [key]: f[key].filter((_, idx) => idx !== i) }));

  // ---- Upload (signed paper scan) ----
  async function handleUploadChange(e: React.ChangeEvent<HTMLInputElement>) {
    setUploadError('');
    const file = e.target.files?.[0];
    if (!file) { setUploadFile(null); return; }
    if (file.size > 8 * 1024 * 1024) { setUploadError('File must be ≤ 8 MB.'); return; }
    if (!/^(application\/pdf|image\/(png|jpe?g|webp|heic))$/i.test(file.type)) {
      setUploadError('Allowed formats: PDF, PNG, JPG, WEBP, HEIC.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',').pop() || '' : result;
      setUploadFile({ name: file.name, mimeType: file.type, base64, size: file.size });
    };
    reader.onerror = () => setUploadError('Failed to read file.');
    reader.readAsDataURL(file);
  }

  // ---- PDF generation (filled UNTH consent + captured signatures) ----
  function buildPdf(): jsPDF {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentW = pageW - margin * 2;
    let y = margin;

    const ensure = (h: number) => { if (y + h > pageH - margin) { doc.addPage(); y = margin; } };
    const para = (text: string, opts?: { size?: number; bold?: boolean; gap?: number; align?: 'left' | 'center' }) => {
      const size = opts?.size ?? 10;
      const lh = size * 0.5 + 0.6;
      doc.setFontSize(size);
      doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
      const lines = doc.splitTextToSize(text, contentW);
      for (const line of lines) {
        ensure(lh);
        if (opts?.align === 'center') doc.text(line, pageW / 2, y, { align: 'center' });
        else doc.text(line, margin, y);
        y += lh;
      }
      y += opts?.gap ?? 2;
    };
    const rule = () => { ensure(3); doc.setDrawColor(180); doc.line(margin, y, pageW - margin, y); y += 3; };

    // Header
    para('UNIVERSITY OF NIGERIA TEACHING HOSPITAL', { size: 13, bold: true, align: 'center', gap: 0.5 });
    para('P.M.B. 01129, Enugu, Nigeria. Tel: 08034214664, 08030917903, 08030715981.', { size: 8, align: 'center', gap: 0.5 });
    para('CONSENT FORM FOR PROCEDURE / SURGERY TREATMENT, ANAESTHESIA, HIGH RISK CONSENT', { size: 10, bold: true, align: 'center', gap: 0.5 });
    para('(The contents of this form have been explained to me in my spoken language)', { size: 8, align: 'center' });
    rule();

    if (patient) {
      para(`Patient: ${patient.name}    Folder No: ${patient.folderNumber}    Age: ${formatAge(patient.age, patient.ageUnit)}    Sex: ${patient.gender}    Ward: ${patient.ward}`, { size: 9, bold: true });
    }

    para('INSTRUCTIONS', { size: 10, bold: true, gap: 0.5 });
    para('This consent form should be signed by the patient (if an adult 18 years or older), by a parent/guardian (if the patient is a minor), or by the spouse/adult children/parents/adult siblings/other family members/significant other (in that order of priority) if the patient is unable to make an informed decision. The physician or their designee is responsible for obtaining informed consent.');

    para('I hereby authorize the performance of the following operation(s), procedure(s), or treatment(s): (Use no abbreviation / Avoid Technical Terms)');
    para(form.procedureText || '__________________________________________________________', { bold: true });
    para(`Upon ${form.patientName || '____________________________'}  (Name of Patient)`);

    para('I have been advised of the benefits and reasons for the procedure(s), as indicated by clinical observations and/or diagnostics performed. I understand that the practice of medicine is as much an art as it is a science, and therefore acknowledge that no guarantees can be made regarding the likelihood of success or outcome.');
    para('The benefits and risks of this surgery/procedure have been explained to me, as well as the alternatives available. I have also been told about the advantages and disadvantages of the alternatives.');
    para(`I authorize Dr. ${form.surgeonName || '____________________________'} and such assistants and associates as may be selected by him/her to perform any part of the above procedure(s) on myself/the patient. I agree that any member of this team may perform any part of the procedure(s) according to their stage of training and ability. If the attending physician determines that the assistant surgeon has the required experience and capability, they may proceed accordingly.`);
    para('I understand that risks such as blood loss, infection, heart failure, cardiac arrest, changes in blood pressure, allergic reactions, and paralysis may occur and may necessitate additional attention. I also consent to the rendering of such other care and treatments as may be deemed necessary by the physician or their designee.');

    para('Blood Product Transfusions:', { size: 10, bold: true, gap: 0.5 });
    para('This consent includes the administration of blood or blood products during and after the procedure. I have been informed that although careful screening is done in compliance with international standards, there are rare risks of infections such as HIV, Hepatitis, and unknown viruses. Unpredictable reactions, such as fever, rash, breathlessness, or shock may occur and in rare cases, result in death. Benefits of transfusion include minimized shock, protection of organs, and reduced blood loss, although no guarantees are provided.');

    para('Photography:', { size: 10, bold: true, gap: 0.5 });
    para('I consent to photography or televising of the procedure(s) for the purposes of medical education and/or publication in scientific journals, ensuring that my identity is protected. I also authorize the presence of qualified observers as approved by the University of Nigeria Teaching Hospital.');

    para('HIGH RISK EXPLANATION', { size: 10, bold: true, gap: 0.5 });
    para('I have been informed by the doctors that the causes of me / my patient being High Risk are:');
    const reasons = form.highRiskReasons.filter((r) => r.trim());
    if (reasons.length === 0) para('1. ____________________________________________________________');
    else reasons.forEach((r, i) => para(`${i + 1}. ${r}`));

    para('Possible complications of surgery / anaesthesia:', { size: 10, bold: true, gap: 0.5 });
    const comps = form.possibleComplications.filter((r) => r.trim());
    if (comps.length === 0) para('1. ____________________________________________________________');
    else comps.forEach((r, i) => para(`${i + 1}. ${r}`));

    para('I also state that I or my family shall not hold the University of Nigeria Teaching Hospital (UNTH) or its doctors responsible for any consequences whatsoever.');

    // Signatures block helper
    const sigRow = (label: string, sig: string | null, name: string, date: string) => {
      ensure(24);
      const colW = contentW;
      if (sig) {
        try { doc.addImage(sig, 'PNG', margin, y, 50, 18); } catch { /* ignore */ }
      } else {
        doc.setDrawColor(150); doc.line(margin, y + 16, margin + 50, y + 16);
      }
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text(`${label}: ${name || ''}`, margin + 55, y + 8);
      doc.text(`Date: ${date || ''}`, margin + 55, y + 15);
      y += 22;
    };

    ensure(10);
    para('AUTHORIZATION OF PATIENT', { size: 10, bold: true, gap: 0.5 });
    para('I acknowledge that I have had the opportunity to discuss and understand this procedure with my physician or physician designee, and hereby consent to the procedure.');
    sigRow('Patient', form.patientSignature, form.patientName, form.patientDate);
    sigRow('Witness', form.witnessSignature, form.witnessName, form.witnessDate);
    sigRow('Doctor', form.doctorSignature, form.doctorName, form.doctorDate);

    if (form.useRepresentative) {
      rule();
      para('PATIENT REPRESENTATIVE / SURROGATE', { size: 10, bold: true, gap: 0.5 });
      para(`The patient is unable to consent because: ${form.patientUnableReason || '____________________________________'}`);
      para(`I, ${form.representativeName || '____________________________'} (Name / Relationship to the Patient), hereby consent for the patient. I acknowledge that I have had the opportunity to discuss and understand this procedure with my physician or physician designee, and hereby consent to the procedure.`);
      sigRow('Patient Representative', form.representativeSignature, form.representativeName, form.representativeDate);
      sigRow('Witness', form.repWitnessSignature, form.repWitnessName, form.repWitnessDate);
      sigRow('Doctor', form.repDoctorSignature, form.repDoctorName, form.repDoctorDate);
    }

    // Footer note on each page
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFontSize(7); doc.setTextColor(130);
      doc.text(`UNTH Theatre Complex — Surgical Consent · Generated ${new Date().toLocaleString()} · Page ${p} of ${pages}`, pageW / 2, pageH - 6, { align: 'center' });
      doc.setTextColor(0);
    }
    return doc;
  }

  const fileSafe = (s: string) => (s || 'patient').replace(/[^A-Za-z0-9._-]+/g, '_');

  const downloadPdf = () => {
    const doc = buildPdf();
    doc.save(`UNTH-Consent-${fileSafe(form.patientName)}.pdf`);
  };

  const validElectronic = () =>
    !!form.procedureText.trim() &&
    !!form.patientName.trim() &&
    !!form.surgeonName.trim() &&
    (form.useRepresentative ? !!form.representativeSignature : !!form.patientSignature);

  const save = async () => {
    setError('');
    if (mode === 'ELECTRONIC' && !validElectronic()) {
      setError('Please fill the procedure, patient name and surgeon, and capture the patient (or representative) signature.');
      return;
    }
    if (mode === 'UPLOAD' && !uploadFile) {
      setError('Please choose the signed consent file to upload.');
      return;
    }
    setSaving(true);
    try {
      let hardCopyFile: { name: string; mimeType: string; base64: string } | null = null;
      if (mode === 'ELECTRONIC') {
        const doc = buildPdf();
        const dataUri = doc.output('datauristring');
        const base64 = dataUri.split(',').pop() || '';
        hardCopyFile = { name: `UNTH-Consent-${fileSafe(form.patientName)}.pdf`, mimeType: 'application/pdf', base64 };
      } else if (uploadFile) {
        hardCopyFile = { name: uploadFile.name, mimeType: uploadFile.mimeType, base64: uploadFile.base64 };
      }

      const res = await fetch(`/api/surgeries/${surgeryId}/consent-form`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form, mode, hardCopyFile }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Failed to save (HTTP ${res.status})`);
      }
      setCompletedAt(new Date().toISOString());
      setSignedElectronically(mode === 'ELECTRONIC');
      // Auto-download the hard copy so it can be printed for the case note.
      if (mode === 'ELECTRONIC') downloadPdf();
    } catch (e: any) {
      setError(e.message || 'Failed to save consent form');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading consent form…
      </div>
    );
  }

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Go back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-600" /> Surgical Consent Form
          </h1>
          <p className="text-sm text-gray-600">{patientLabel}{surgeryType ? ` · ${surgeryType}` : ''}</p>
        </div>
      </div>

      {completedAt && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          Consent completed ({signedElectronically ? 'signed electronically' : 'signed paper uploaded'}).
          <button onClick={downloadPdf} className="ml-2 inline-flex items-center gap-1 underline">
            <Download className="w-3.5 h-3.5" /> Download hard copy
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Mode toggle */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode('ELECTRONIC')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border ${mode === 'ELECTRONIC' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
        >
          <PenLine className="w-4 h-4" /> Fill & sign electronically
        </button>
        <button
          type="button"
          onClick={() => setMode('UPLOAD')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border ${mode === 'UPLOAD' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
        >
          <Upload className="w-4 h-4" /> Upload signed paper
        </button>
      </div>

      {/* The document */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <div className="text-center border-b pb-3">
          <h2 className="text-lg font-bold text-gray-900">UNIVERSITY OF NIGERIA TEACHING HOSPITAL</h2>
          <p className="text-xs text-gray-500">P.M.B. 01129, Enugu, Nigeria.</p>
          <p className="text-sm font-semibold text-gray-800 mt-1">Consent Form for Procedure / Surgery Treatment, Anaesthesia, High Risk Consent</p>
          <p className="text-xs italic text-gray-500">(The contents of this form have been explained to me in my spoken language)</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Operation(s) / Procedure(s) / Treatment(s) — no abbreviations</label>
          <textarea value={form.procedureText} onChange={(e) => set('procedureText', e.target.value)} rows={2} className={inputCls} placeholder="e.g., Exploratory laparotomy for perforated appendix" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name of Patient</label>
            <input value={form.patientName} onChange={(e) => set('patientName', e.target.value)} className={inputCls} placeholder="Patient full name" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Authorising Doctor (Dr.)</label>
            <input value={form.surgeonName} onChange={(e) => set('surgeonName', e.target.value)} className={inputCls} placeholder="Surgeon name" />
          </div>
        </div>

        <p className="text-xs leading-relaxed text-gray-600 bg-gray-50 rounded-lg p-3">
          I have been advised of the benefits, risks and alternatives of this procedure and understand no guarantees can be made.
          This consent includes the administration of blood / blood products and the rendering of such other care as deemed
          necessary. I consent to medical photography for education/publication with my identity protected, as approved by UNTH.
        </p>

        {/* High risk reasons */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">High-risk reasons (as explained by the doctors)</label>
            <button type="button" onClick={() => addListItem('highRiskReasons')} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
          <div className="space-y-2">
            {form.highRiskReasons.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-4">{i + 1}.</span>
                <input value={r} onChange={(e) => updateList('highRiskReasons', i, e.target.value)} className={inputCls} placeholder="High-risk reason" />
                {form.highRiskReasons.length > 1 && (
                  <button type="button" onClick={() => removeListItem('highRiskReasons', i)} className="text-red-500" aria-label="Remove reason">
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
            <button type="button" onClick={() => addListItem('possibleComplications')} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
          <div className="space-y-2">
            {form.possibleComplications.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-4">{i + 1}.</span>
                <input value={r} onChange={(e) => updateList('possibleComplications', i, e.target.value)} className={inputCls} placeholder="Possible complication" />
                {form.possibleComplications.length > 1 && (
                  <button type="button" onClick={() => removeListItem('possibleComplications', i)} className="text-red-500" aria-label="Remove complication">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {mode === 'ELECTRONIC' ? (
          <>
            {/* Authorisation of patient */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-bold text-gray-800 mb-1">Authorisation of Patient</h3>
              <p className="text-xs text-gray-500 mb-3">I acknowledge that I have discussed and understood this procedure and hereby consent to it.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <SignaturePad label="Patient signature" value={form.patientSignature} onChange={(v) => set('patientSignature', v)} />
                  <label className="block text-xs text-gray-500 mt-2">Date</label>
                  <input type="date" value={form.patientDate} onChange={(e) => set('patientDate', e.target.value)} className={inputCls} title="Patient signing date" />
                </div>
                <div>
                  <SignaturePad label="Witness signature" value={form.witnessSignature} onChange={(v) => set('witnessSignature', v)} />
                  <input value={form.witnessName} onChange={(e) => set('witnessName', e.target.value)} className={`${inputCls} mt-2`} placeholder="Witness name" />
                  <input type="date" value={form.witnessDate} onChange={(e) => set('witnessDate', e.target.value)} className={`${inputCls} mt-2`} title="Witness signing date" />
                </div>
                <div>
                  <SignaturePad label="Doctor signature" value={form.doctorSignature} onChange={(v) => set('doctorSignature', v)} />
                  <input value={form.doctorName} onChange={(e) => set('doctorName', e.target.value)} className={`${inputCls} mt-2`} placeholder="Doctor name" />
                  <input type="date" value={form.doctorDate} onChange={(e) => set('doctorDate', e.target.value)} className={`${inputCls} mt-2`} title="Doctor signing date" />
                </div>
              </div>
            </div>

            {/* Representative / surrogate */}
            <div className="border-t pt-4">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input type="checkbox" checked={form.useRepresentative} onChange={(e) => set('useRepresentative', e.target.checked)} className="w-4 h-4" />
                Patient is unable to consent — a representative / surrogate will sign
              </label>
              {form.useRepresentative && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">The patient is unable to consent because</label>
                    <input value={form.patientUnableReason} onChange={(e) => set('patientUnableReason', e.target.value)} className={inputCls} placeholder="Reason patient cannot consent" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Representative name / relationship to patient</label>
                    <input value={form.representativeName} onChange={(e) => set('representativeName', e.target.value)} className={inputCls} placeholder="e.g., Jane Doe (Spouse)" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <SignaturePad label="Representative signature" value={form.representativeSignature} onChange={(v) => set('representativeSignature', v)} />
                      <input type="date" value={form.representativeDate} onChange={(e) => set('representativeDate', e.target.value)} className={`${inputCls} mt-2`} title="Representative signing date" />
                    </div>
                    <div>
                      <SignaturePad label="Witness signature" value={form.repWitnessSignature} onChange={(v) => set('repWitnessSignature', v)} />
                      <input value={form.repWitnessName} onChange={(e) => set('repWitnessName', e.target.value)} className={`${inputCls} mt-2`} placeholder="Witness name" />
                      <input type="date" value={form.repWitnessDate} onChange={(e) => set('repWitnessDate', e.target.value)} className={`${inputCls} mt-2`} title="Witness signing date" />
                    </div>
                    <div>
                      <SignaturePad label="Doctor signature" value={form.repDoctorSignature} onChange={(v) => set('repDoctorSignature', v)} />
                      <input value={form.repDoctorName} onChange={(e) => set('repDoctorName', e.target.value)} className={`${inputCls} mt-2`} placeholder="Doctor name" />
                      <input type="date" value={form.repDoctorDate} onChange={(e) => set('repDoctorDate', e.target.value)} className={`${inputCls} mt-2`} title="Doctor signing date" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="border-t pt-4">
            <h3 className="text-sm font-bold text-gray-800 mb-1">Upload signed paper consent</h3>
            <p className="text-xs text-gray-500 mb-3">
              Print the form (use “Download blank/printable copy”), have the patient/representative sign it, then upload the scan or photo.
              The uploaded document becomes the case-note hard copy.
            </p>
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp,image/heic"
              onChange={handleUploadChange}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-white"
              aria-label="Upload signed consent file"
              title="Upload signed consent file"
            />
            {uploadError && <p className="text-sm text-red-600 mt-2">{uploadError}</p>}
            {uploadFile && (
              <p className="mt-2 text-sm text-gray-700">
                <span className="font-medium">{uploadFile.name}</span>{' '}
                <span className="text-gray-500">· {(uploadFile.size / 1024).toFixed(0)} KB · {uploadFile.mimeType}</span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 z-10">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-end gap-3">
          <button onClick={downloadPdf} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Download className="w-4 h-4" /> {mode === 'UPLOAD' ? 'Download blank/printable copy' : 'Download / print PDF'}
          </button>
          <button onClick={save} disabled={saving} className="btn-primary inline-flex items-center gap-2 disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save consent & file hard copy'}
          </button>
        </div>
      </div>
    </div>
  );
}
