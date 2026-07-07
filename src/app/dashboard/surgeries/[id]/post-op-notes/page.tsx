'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Plus, Trash2, Send, Printer, ImagePlus, X } from 'lucide-react';
import { printThermalPrescription } from '@/lib/thermalPrint';
import {
  autofillCriteria,
  computeComplexity,
  classifyScore,
  COMPLEXITY_OPTIONS,
  DEFAULT_CRITERIA,
  type ComplexityCriteria,
} from '@/lib/complexityScore';

const SmartTextInput = dynamic(() => import('@/components/SmartTextInput'), { ssr: false });
import StaffComboInput from '@/components/StaffComboInput';

interface NoteItem {
  id: string;
  createdAt: string;
  changes: string | null;
  user?: { fullName?: string; username?: string };
}

// Post-operative medication categories with curated common-drug suggestions.
const MED_CATEGORIES: { value: string; label: string; suggestions: string[] }[] = [
  { value: 'ANTIBIOTIC', label: 'Antibiotics', suggestions: ['Ceftriaxone 1g IV', 'Metronidazole 500mg IV/PO', 'Augmentin 625mg PO', 'Ciprofloxacin 500mg PO', 'Gentamicin 80mg IV', 'Cefuroxime 750mg IV'] },
  { value: 'ANTI_EMETIC', label: 'Anti-emetics', suggestions: ['Metoclopramide 10mg IV', 'Ondansetron 4mg IV', 'Promethazine 25mg IM', 'Dexamethasone 8mg IV'] },
  { value: 'ANALGESIC', label: 'Analgesics', suggestions: ['Paracetamol 1g IV/PO', 'Tramadol 50mg IV/PO', 'Pentazocine 30mg IM', 'Morphine 10mg IM', 'Tapentadol 50mg PO'] },
  { value: 'ANTI_INFLAMMATORY', label: 'Anti-inflammatory (NSAID)', suggestions: ['Diclofenac 75mg IM', 'Ibuprofen 400mg PO', 'Ketorolac 30mg IV', 'Celecoxib 200mg PO'] },
  { value: 'PPI_ANTACID', label: 'PPI / Antacid (dyspepsia cover)', suggestions: ['Omeprazole 40mg IV/PO', 'Pantoprazole 40mg IV', 'Esomeprazole 40mg PO', 'Ranitidine 50mg IV'] },
  { value: 'DVT_PROPHYLAXIS', label: 'DVT prophylaxis', suggestions: ['Enoxaparin 40mg SC', 'Heparin 5000IU SC', 'Dalteparin 5000IU SC'] },
  { value: 'VITAMINS_MINERALS', label: 'Vitamins & minerals', suggestions: ['Vitamin C 1g PO', 'Multivitamin PO', 'Calcium + Vitamin D PO', 'Zinc sulphate PO'] },
  { value: 'APPETITE_STIMULANT', label: 'Appetite stimulants', suggestions: ['Cyproheptadine 4mg PO', 'Megestrol acetate PO'] },
  { value: 'HAEMATINIC', label: 'Haematinics', suggestions: ['Ferrous sulphate 200mg PO', 'Folic acid 5mg PO', 'Vitamin B-Complex PO', 'Erythropoietin SC'] },
  { value: 'OTHER', label: 'Other', suggestions: [] },
];

const ROUTES = ['PO', 'IV', 'IM', 'SC', 'PR', 'TOPICAL', 'INHALED'];

interface RxMed {
  category: string;
  drugName: string;
  dosage: string;
  route: string;
  frequency: string;
  duration: string;
  quantity: number;
  isControlled: boolean;
}

const emptyMed = (): RxMed => ({
  category: 'ANTIBIOTIC',
  drugName: '',
  dosage: '',
  route: 'IV',
  frequency: '',
  duration: '',
  quantity: 1,
  isControlled: false,
});

export default function PostOperativeNotesPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [surgery, setSurgery] = useState<any>(null);
  const [note, setNote] = useState('');
  const [noteImages, setNoteImages] = useState<string[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // The operating surgeon can be corrected while writing the post-op note.
  const [surgeonName, setSurgeonName] = useState('');
  const [surgeonId, setSurgeonId] = useState<string | null>(null);
  const [surgeonOpts, setSurgeonOpts] = useState<{ id: string; fullName: string; staffCode?: string | null; role?: string | null }[]>([]);

  // Post-operative medication prescription
  const [rxMeds, setRxMeds] = useState<RxMed[]>([emptyMed()]);
  const [rxNotes, setRxNotes] = useState('');
  const [hasDyspepsia, setHasDyspepsia] = useState(false);
  const [sendingRx, setSendingRx] = useState(false);
  const [drugDb, setDrugDb] = useState<{ name: string; type: string }[]>([]);
  // Post-op prescriptions already sent to pharmacy for this case.
  const [sentRx, setSentRx] = useState<any[]>([]);

  // Surgical Complexity Score — completed at the end of the note before submit.
  const [complexity, setComplexity] = useState<ComplexityCriteria>(DEFAULT_CRITERIA);
  const [autofilled, setAutofilled] = useState<Partial<Record<keyof ComplexityCriteria, boolean>>>({});

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sRes, nRes] = await Promise.all([
        fetch(`/api/surgeries/${params.id}`),
        fetch(`/api/surgeries/${params.id}/post-op-notes`),
      ]);
      if (sRes.ok) {
        const s = await sRes.json();
        setSurgery(s);
        setSurgeonName(s?.surgeonName || s?.surgeon?.fullName || '');
        setSurgeonId(s?.surgeonId || s?.surgeon?.id || null);
        // If a complexity assessment already exists, load it; otherwise auto-fill
        // from documented case data.
        if (s?.complexityData) {
          try {
            setComplexity({ ...DEFAULT_CRITERIA, ...JSON.parse(s.complexityData) });
          } catch {
            const { criteria, autofilled: af } = autofillCriteria(s);
            setComplexity(criteria);
            setAutofilled(af);
          }
        } else {
          const { criteria, autofilled: af } = autofillCriteria(s);
          setComplexity(criteria);
          setAutofilled(af);
        }
      }
      if (nRes.ok) setNotes(await nRes.json());
    } finally {
      setLoading(false);
    }
  };

  // Load post-op prescriptions already sent to pharmacy for this surgery.
  const fetchSentRx = async () => {
    try {
      const res = await fetch(`/api/post-op-prescriptions?surgeryId=${params.id}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setSentRx(Array.isArray(data) ? data : []);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchData();
    fetchSentRx();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  // Load the medication database for dropdown suggestions
  useEffect(() => {
    fetch('/api/admin/drug-dressing-templates?activeOnly=true')
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        if (Array.isArray(data)) {
          setDrugDb(data.map((d: any) => ({ name: d.name, type: d.type })));
        }
      })
      .catch(() => {});
  }, []);

  // Surgeon suggestions for the editable surgeon field (DB + free-type).
  useEffect(() => {
    fetch('/api/users?roles=SURGEON,HOUSE_OFFICER&limit=300')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setSurgeonOpts(Array.isArray(d) ? d : d.users || []))
      .catch(() => {});
  }, []);

  const updateMed = (i: number, k: keyof RxMed, v: any) =>
    setRxMeds((s) => s.map((m, idx) => (idx === i ? { ...m, [k]: v } : m)));

  const drugSuggestionsFor = (category: string): string[] => {
    const curated = MED_CATEGORIES.find((c) => c.value === category)?.suggestions || [];
    const fromDb = drugDb.map((d) => d.name);
    return Array.from(new Set([...curated, ...fromDb]));
  };

  const hasNsaid = rxMeds.some((m) => m.category === 'ANTI_INFLAMMATORY' && m.drugName.trim());
  const hasPpiCover = rxMeds.some((m) => m.category === 'PPI_ANTACID' && m.drugName.trim());
  const dyspepsiaWarning = hasDyspepsia && hasNsaid && !hasPpiCover;

  const buildThermalData = () => ({
    patientName: surgery?.patient?.name,
    folderNumber: surgery?.patient?.folderNumber,
    ward: surgery?.patient?.ward,
    procedureName: surgery?.procedureName,
    surgeonName: surgery?.surgeonName,
    medications: rxMeds
      .filter((m) => m.drugName.trim())
      .map((m) => ({
        category: m.category,
        drugName: m.drugName,
        dosage: m.dosage,
        route: m.route,
        frequency: m.frequency,
        duration: m.duration,
        quantity: m.quantity,
        isControlled: m.isControlled,
      })),
    notes: rxNotes || undefined,
  });

  const printRx = () => {
    const data = buildThermalData();
    if (data.medications.length === 0) {
      alert('Add at least one medication before printing.');
      return;
    }
    printThermalPrescription(data);
  };

  const sendRxToPharmacy = async () => {
    const cleaned = rxMeds.filter((m) => m.drugName.trim());
    if (cleaned.length === 0) {
      alert('Add at least one medication before sending to pharmacy.');
      return;
    }
    if (dyspepsiaWarning && !confirm('Patient has dyspepsia and an NSAID is prescribed without a PPI/antacid cover. Send anyway?')) {
      return;
    }
    setSendingRx(true);
    try {
      const res = await fetch('/api/post-op-prescriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surgeryId: params.id,
          medications: cleaned.map((m) => ({
            category: m.category,
            drugName: m.drugName.trim(),
            dosage: m.dosage || undefined,
            route: m.route || undefined,
            frequency: m.frequency || undefined,
            duration: m.duration || undefined,
            quantity: m.quantity || 1,
            isControlled: m.isControlled,
          })),
          notes: rxNotes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to send prescription to pharmacy.');
        return;
      }
      alert('Prescription sent to pharmacy for dispensing.');
      setRxMeds([emptyMed()]);
      setRxNotes('');
      fetchSentRx();
    } catch {
      alert('Failed to send prescription to pharmacy.');
    } finally {
      setSendingRx(false);
    }
  };

  const MAX_IMAGES = 2;
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

  const onPickImages = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);
    const room = MAX_IMAGES - noteImages.length;
    if (room <= 0) {
      alert(`You can attach a maximum of ${MAX_IMAGES} images.`);
      return;
    }
    const selected = incoming.slice(0, room);
    if (incoming.length > room) {
      alert(`Only ${room} more image(s) can be added (max ${MAX_IMAGES}).`);
    }
    selected.forEach((file) => {
      if (!file.type.startsWith('image/')) {
        alert(`${file.name} is not an image file.`);
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        alert(`${file.name} exceeds the 10 MB limit.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setNoteImages((s) => (s.length >= MAX_IMAGES ? s : [...s, result]));
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (idx: number) =>
    setNoteImages((s) => s.filter((_, i) => i !== idx));

  const submit = async () => {
    if (note.trim().length < 5) {
      alert('Please enter a meaningful post-operative note (minimum 5 characters).');
      return;
    }

    setSaving(true);
    try {
      const complexityResult = computeComplexity(complexity);
      const res = await fetch(`/api/surgeries/${params.id}/post-op-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: note.trim(),
          images: noteImages,
          complexity,
          complexityScore: complexityResult.score,
          complexityClass: complexityResult.classification,
          // Persist any correction to the operating surgeon.
          surgeonName: surgeonName.trim() || undefined,
          surgeonId: surgeonId || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to save post-operative note');
        return;
      }

      setNote('');
      setNoteImages([]);
      await fetchData();
      alert('Post-operative note saved successfully.');
    } catch (error) {
      alert('Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  const liveComplexity = computeComplexity(complexity);
  const complexityBand = classifyScore(liveComplexity.score);
  const bandColor =
    complexityBand === 'Minor'
      ? 'bg-green-100 text-green-800 border-green-300'
      : complexityBand === 'Intermediate'
      ? 'bg-blue-100 text-blue-800 border-blue-300'
      : complexityBand === 'Major'
      ? 'bg-amber-100 text-amber-800 border-amber-300'
      : 'bg-red-100 text-red-800 border-red-300';

  const complexityFields: {
    key: keyof ComplexityCriteria;
    label: string;
    options: readonly { value: string; label: string }[];
  }[] = [
    { key: 'operativeTime', label: 'Operative time', options: COMPLEXITY_OPTIONS.operativeTime },
    { key: 'bloodLoss', label: 'Estimated blood loss', options: COMPLEXITY_OPTIONS.bloodLoss },
    { key: 'anaesthesia', label: 'Anaesthesia', options: COMPLEXITY_OPTIONS.anaesthesia },
    { key: 'bodyCavity', label: 'Body cavity entered', options: COMPLEXITY_OPTIONS.bodyCavity },
    { key: 'physiologicalStress', label: 'Physiological stress', options: COMPLEXITY_OPTIONS.physiologicalStress },
    { key: 'hospitalStay', label: 'Expected hospital stay', options: COMPLEXITY_OPTIONS.hospitalStay },
    { key: 'icuRequirement', label: 'ICU requirement', options: COMPLEXITY_OPTIONS.icuRequirement },
    { key: 'mdtRequirement', label: 'Multidisciplinary team', options: COMPLEXITY_OPTIONS.mdtRequirement },
  ];

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <button
        onClick={() => router.back()}
        className="text-blue-600 hover:text-blue-800"
      >
        ← Back
      </button>

      <div>
        <h1 className="text-2xl font-bold">Post-Operative Notes</h1>
        {surgery && (
          <p className="text-sm text-gray-600 mt-1">
            {surgery.patient?.name || 'Unknown patient'} ({surgery.patient?.folderNumber || 'N/A'}) — {surgery.procedureName}
          </p>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-4 space-y-3">
        <label className="block text-sm font-semibold text-gray-700">Add New Post-Operative Note</label>

        {/* Operating surgeon — editable while writing the note. Pick from the
            database or type a new (visiting) surgeon. */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Operating Surgeon</label>
          <StaffComboInput
            value={surgeonName}
            onChange={(v) => {
              setSurgeonName(v);
              const match = surgeonOpts.find((o) => o.fullName === v);
              setSurgeonId(match ? match.id : null);
            }}
            options={surgeonOpts}
            placeholder="Select or type the operating surgeon"
          />
        </div>

        <SmartTextInput
          value={note}
          onChange={setNote}
          rows={6}
          placeholder="Enter surgeon post-operative notes, findings, instructions, and plan... (tap the mic to dictate)"
          enableSpeech
          enableReadBack
          medicalMode
          className="w-full"
        />

        {/* Intra-operative drawings / pictures upload (max 2, ≤ 10 MB each) */}
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 cursor-pointer border border-gray-300 rounded px-3 py-2 text-sm hover:bg-gray-50">
              <ImagePlus className="w-4 h-4" />
              Add drawings / intra-op pictures
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={noteImages.length >= MAX_IMAGES}
                onChange={(e) => {
                  onPickImages(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
            <span className="text-xs text-gray-500">
              {noteImages.length}/{MAX_IMAGES} attached • max 2 images, 10 MB each
            </span>
          </div>

          {noteImages.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-3">
              {noteImages.map((src, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`Intra-operative attachment ${i + 1}`}
                    className="h-24 w-24 object-cover rounded border"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    aria-label="Remove image"
                    className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-0.5 shadow"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button
            onClick={submit}
            disabled={saving || note.trim().length < 5}
            className="btn-primary disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Post-Op Note'}
          </button>
        </div>
      </div>

      {/* Surgical Complexity Score — auto-classifies the procedure (0-100). */}
      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Surgical Complexity Score</h2>
            <p className="text-xs text-gray-500 mt-1">
              Fields already documented for this case are auto-filled. Review and adjust before saving —
              this is recorded with the post-operative note and feeds the Research &amp; Analytics module.
            </p>
          </div>
          <div className={`flex items-center gap-3 rounded-lg border px-4 py-2 ${bandColor}`}>
            <span className="text-3xl font-extrabold tabular-nums">{liveComplexity.score}</span>
            <div className="leading-tight">
              <div className="text-[10px] uppercase tracking-wide opacity-70">Score / 100</div>
              <div className="text-sm font-bold">{complexityBand}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {complexityFields.map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {f.label}
                {autofilled[f.key] && (
                  <span className="ml-2 text-[10px] font-semibold text-green-600">• auto-filled</span>
                )}
              </label>
              <select
                className="w-full border rounded px-2 py-1.5 text-sm"
                aria-label={f.label}
                value={complexity[f.key]}
                onChange={(e) => {
                  const v = e.target.value;
                  setComplexity((prev) => ({ ...prev, [f.key]: v }));
                  setAutofilled((prev) => ({ ...prev, [f.key]: false }));
                }}
              >
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="text-xs text-gray-500">
          Bands: 0-20 Minor · 21-40 Intermediate · 41-70 Major · 71-100 Supermajor.
          The score is saved when you tap <span className="font-semibold">Save Post-Op Note</span> above.
        </div>
      </div>

      {/* Post-Operative Medications → Pharmacy */}
      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div>
          <h2 className="text-lg font-bold">Post-Operative Medications</h2>
          <p className="text-xs text-gray-500 mt-1">
            Select drugs by category from the medication database or type a drug not on the list.
            These are wired to the Pharmacy for dispensing before the patient leaves theatre.
          </p>
        </div>

        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hasDyspepsia}
            onChange={(e) => setHasDyspepsia(e.target.checked)}
          />
          Patient has dyspepsia / peptic ulcer history (avoid plain NSAIDs; add PPI cover)
        </label>

        {dyspepsiaWarning && (
          <div className="rounded-md bg-amber-50 border border-amber-300 text-amber-800 text-sm px-3 py-2">
            ⚠ An NSAID is prescribed but no PPI/antacid cover is added. Consider adding a
            proton-pump inhibitor (e.g. Omeprazole) for this dyspeptic patient.
          </div>
        )}

        <div className="space-y-3">
          {rxMeds.map((m, i) => (
            <div key={i} className="border rounded-lg p-3 space-y-2 bg-gray-50">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                  <select
                    className="w-full border rounded px-2 py-1 text-sm"
                    aria-label="Medication category"
                    value={m.category}
                    onChange={(e) => updateMed(i, 'category', e.target.value)}
                  >
                    {MED_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Drug</label>
                  <input
                    list={`drug-options-${i}`}
                    className="w-full border rounded px-2 py-1 text-sm"
                    placeholder="Select or type a drug name"
                    aria-label="Drug name"
                    value={m.drugName}
                    onChange={(e) => updateMed(i, 'drugName', e.target.value)}
                  />
                  <datalist id={`drug-options-${i}`}>
                    {drugSuggestionsFor(m.category).map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <input className="border rounded px-2 py-1 text-sm" placeholder="Dosage" aria-label="Dosage" value={m.dosage} onChange={(e) => updateMed(i, 'dosage', e.target.value)} />
                <select className="border rounded px-2 py-1 text-sm" aria-label="Route" value={m.route} onChange={(e) => updateMed(i, 'route', e.target.value)}>
                  {ROUTES.map((r) => <option key={r}>{r}</option>)}
                </select>
                <input className="border rounded px-2 py-1 text-sm" placeholder="Frequency (e.g. BD)" aria-label="Frequency" value={m.frequency} onChange={(e) => updateMed(i, 'frequency', e.target.value)} />
                <input className="border rounded px-2 py-1 text-sm" placeholder="Duration (e.g. 5/7)" aria-label="Duration" value={m.duration} onChange={(e) => updateMed(i, 'duration', e.target.value)} />
                <input type="number" min={1} className="border rounded px-2 py-1 text-sm" placeholder="Qty" aria-label="Quantity" value={m.quantity} onChange={(e) => updateMed(i, 'quantity', Number(e.target.value))} />
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={m.isControlled} onChange={(e) => updateMed(i, 'isControlled', e.target.checked)} /> Controlled drug
                </label>
                <button
                  type="button"
                  onClick={() => setRxMeds((s) => (s.length > 1 ? s.filter((_, idx) => idx !== i) : s))}
                  className="text-red-600 text-xs inline-flex items-center gap-1 disabled:opacity-40"
                  disabled={rxMeds.length === 1}
                >
                  <Trash2 className="w-3 h-3" /> Remove
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRxMeds((s) => [...s, emptyMed()])}
            className="text-sm inline-flex items-center gap-1 text-blue-600"
          >
            <Plus className="w-4 h-4" /> Add medication
          </button>
        </div>

        <textarea
          className="w-full border rounded px-2 py-1 text-sm"
          rows={2}
          placeholder="Additional instructions for pharmacy (optional)"
          aria-label="Pharmacy notes"
          value={rxNotes}
          onChange={(e) => setRxNotes(e.target.value)}
        />

        <div className="flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={printRx}
            className="inline-flex items-center gap-2 border border-gray-300 rounded px-4 py-2 text-sm hover:bg-gray-50"
          >
            <Printer className="w-4 h-4" /> Print (80mm thermal)
          </button>
          <button
            type="button"
            onClick={sendRxToPharmacy}
            disabled={sendingRx}
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Send className="w-4 h-4" /> {sendingRx ? 'Sending...' : 'Send to Pharmacy'}
          </button>
        </div>

        {/* Prescriptions already sent to pharmacy for this case */}
        {sentRx.length > 0 && (
          <div className="mt-4 border-t pt-4">
            <h3 className="text-sm font-bold text-gray-800 mb-2">Sent to Pharmacy ({sentRx.length})</h3>
            <div className="space-y-2">
              {sentRx.map((rx) => {
                let meds: any[] = [];
                try { meds = Array.isArray(rx.medications) ? rx.medications : JSON.parse(rx.medications || '[]'); } catch {}
                return (
                  <div key={rx.id} className="border rounded-lg p-3 bg-gray-50 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <span className="font-medium text-gray-800">
                        {new Date(rx.prescribedAt || rx.createdAt).toLocaleString('en-GB')} · {rx.prescribedByName || 'Surgeon'}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        {String(rx.status || '').replace(/_/g, ' ') || 'Sent'}
                      </span>
                    </div>
                    <ul className="list-disc pl-5 text-gray-700">
                      {meds.map((m: any, i: number) => (
                        <li key={i}>
                          {m.drugName}
                          {m.dosage ? ` ${m.dosage}` : ''}{m.route ? ` ${m.route}` : ''}
                          {m.frequency ? ` ${m.frequency}` : ''}{m.duration ? ` × ${m.duration}` : ''}
                          {m.isControlled ? ' (controlled)' : ''}
                        </li>
                      ))}
                    </ul>
                    {rx.notes && <p className="mt-1 text-xs text-gray-500">Note: {rx.notes}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-bold mb-3">Saved Notes</h2>
        {notes.length === 0 ? (
          <p className="text-gray-500 text-sm">No post-operative notes yet.</p>
        ) : (
          <div className="space-y-3">
            {notes.map((n) => {
              let parsed: any = {};
              try {
                parsed = n.changes ? JSON.parse(n.changes) : {};
              } catch {}
              return (
                <div key={n.id} className="border rounded-lg p-3 bg-gray-50">
                  <p className="text-xs text-gray-500 mb-1">
                    {new Date(n.createdAt).toLocaleString('en-GB')} • {n.user?.fullName || n.user?.username || 'Unknown'}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{parsed.note || '-'}</p>
                  {Array.isArray(parsed.images) && parsed.images.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {parsed.images.map((src: string, i: number) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <a key={i} href={src} target="_blank" rel="noopener noreferrer">
                          <img
                            src={src}
                            alt={`Attachment ${i + 1}`}
                            className="h-24 w-24 object-cover rounded border hover:opacity-90"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
