'use client';

// ============================================================
// Writing up an operation
// ------------------------------------------------------------
// This page used to be one textarea and a save button. Everything a nurse
// needed afterwards — position, feeding, when to call the surgeon — went into
// that textarea if it went anywhere, and nothing in it could be counted.
//
// It is now three things, and the tabs are in the order they are used: write
// the note, look at the sheet the ward will read, and see what was written
// before. The prescription section sits below all three, unchanged and still
// wired to pharmacy, because it is used at the same moment.
//
// THE FORM IS NOT WRITTEN HERE. It is described in lib/postop/templates.ts and
// rendered by StructuredNoteForm, so a new procedure template needs no change
// to this file.
//
// NOTHING IS LOST FROM THE OLD PAGE. The surgeon can still be corrected, the
// complexity score is still completed at the end and saved with the note, the
// two intra-operative images are still accepted at the same limits, and every
// note written before today still appears under Previous notes.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertTriangle, Check, FileText, ImagePlus, Loader2, Plus, Printer, Send, Trash2, X,
} from 'lucide-react';
import { printThermalPrescription } from '@/lib/thermalPrint';
import {
  autofillCriteria, computeComplexity, classifyScore, COMPLEXITY_OPTIONS, DEFAULT_CRITERIA,
  type ComplexityCriteria,
} from '@/lib/complexityScore';
import StructuredNoteForm from '@/components/postop/StructuredNoteForm';
import NursingSummaryCard from '@/components/postop/NursingSummaryCard';
import StaffComboInput from '@/components/StaffComboInput';
import { matchTemplate, resolveTemplate, templateByKey, PROCEDURE_TEMPLATES } from '@/lib/postop/templates';
import { validateNote, canSign, countProblems, type ChildRows, type Problem } from '@/lib/postop/validate';
import { buildNursingSummary } from '@/lib/postop/nursingSummary';
import { noteToValues } from '@/lib/postop/payload';
import type { FeedEntry } from '@/lib/postop/noteFeed';

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
  category: string; drugName: string; dosage: string; route: string;
  frequency: string; duration: string; quantity: number; isControlled: boolean;
}

const emptyMed = (): RxMed => ({
  category: 'ANTIBIOTIC', drugName: '', dosage: '', route: 'IV',
  frequency: '', duration: '', quantity: 1, isControlled: false,
});

const MAX_IMAGES = 2;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type Tab = 'write' | 'summary' | 'previous';

export default function PostOperativeNotesPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [surgery, setSurgery] = useState<any>(null);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('write');

  // ── The structured note ────────────────────────────────────────────────
  const [noteId, setNoteId] = useState<string | null>(null);
  const [noteStatus, setNoteStatus] = useState<'DRAFT' | 'SIGNED' | null>(null);
  const [noteType, setNoteType] = useState<'OPERATION_NOTE' | 'ADDENDUM'>('OPERATION_NOTE');
  const [templateKey, setTemplateKey] = useState<string>('CORE');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [childRows, setChildRows] = useState<ChildRows>({
    prepSteps: [], drains: [], specimens: [], heldMedications: [],
  });
  const [starting, setStarting] = useState(false);
  const [signing, setSigning] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [surgeonName, setSurgeonName] = useState('');
  const [surgeonId, setSurgeonId] = useState<string | null>(null);
  const [surgeonOpts, setSurgeonOpts] = useState<{ id: string; fullName: string; staffCode?: string | null; role?: string | null }[]>([]);

  const [noteImages, setNoteImages] = useState<string[]>([]);

  // ── Prescription ───────────────────────────────────────────────────────
  const [rxMeds, setRxMeds] = useState<RxMed[]>([emptyMed()]);
  const [rxNotes, setRxNotes] = useState('');
  const [hasDyspepsia, setHasDyspepsia] = useState(false);
  const [sendingRx, setSendingRx] = useState(false);
  const [drugDb, setDrugDb] = useState<{ name: string; type: string }[]>([]);
  const [sentRx, setSentRx] = useState<any[]>([]);

  // ── Complexity ─────────────────────────────────────────────────────────
  const [complexity, setComplexity] = useState<ComplexityCriteria>(DEFAULT_CRITERIA);
  const [autofilled, setAutofilled] = useState<Partial<Record<keyof ComplexityCriteria, boolean>>>({});

  // The template in force: what the note stored, or what the procedure name
  // suggests for a note that does not exist yet.
  const template = useMemo(() => {
    if (noteId) return resolveTemplate(templateByKey(templateKey));
    return resolveTemplate(matchTemplate(surgery?.procedureName, surgery?.subspecialty));
  }, [noteId, templateKey, surgery?.procedureName, surgery?.subspecialty]);

  // Validation runs on every keystroke, with the same function the server uses
  // before it will accept a signature — so the form can never claim a note is
  // ready when signing would refuse it.
  const problems: Problem[] = useMemo(
    () => validateNote(template, values, childRows),
    [template, values, childRows],
  );
  const counts = useMemo(() => countProblems(problems), [problems]);

  const summary = useMemo(
    () => buildNursingSummary(values, childRows, {
      surgeonName: surgeonName || surgery?.surgeonName,
      signedAt: (values.signedAt as string) ?? null,
    }),
    [values, childRows, surgeonName, surgery?.surgeonName],
  );

  /** Load a note from the server into the form. */
  const adoptNote = useCallback((n: any) => {
    setNoteId(n.id);
    setNoteStatus(n.status);
    setNoteType(n.noteType);
    setTemplateKey(n.templateKey ?? 'CORE');
    setValues(noteToValues(n));
    setChildRows({
      prepSteps: n.prepSteps ?? [],
      drains: n.drains ?? [],
      specimens: n.specimens ?? [],
      heldMedications: n.heldMedications ?? [],
    });
    setNoteImages(Array.isArray(n.images) ? n.images : []);
    if (n.surgeonName) setSurgeonName(n.surgeonName);
    if (n.surgeonId) setSurgeonId(n.surgeonId);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, fRes, nRes] = await Promise.all([
        fetch(`/api/surgeries/${params.id}`),
        fetch(`/api/surgeries/${params.id}/post-op-notes`),
        fetch(`/api/post-op-notes?surgeryId=${params.id}`, { cache: 'no-store' }),
      ]);

      if (sRes.ok) {
        const s = await sRes.json();
        setSurgery(s);
        setSurgeonName(s?.surgeonName || s?.surgeon?.fullName || '');
        setSurgeonId(s?.surgeonId || s?.surgeon?.id || null);
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

      if (fRes.ok) setFeed(await fRes.json());

      if (nRes.ok) {
        const notes = await nRes.json();
        // The draft first, because that is the one being worked on. Failing
        // that, the most recent signed note, so the page opens showing what is
        // in force rather than an empty form.
        const draft = Array.isArray(notes) ? notes.find((n: any) => n.status === 'DRAFT') : null;
        const chosen = draft ?? (Array.isArray(notes) ? notes[0] : null);
        if (chosen) adoptNote(chosen);
      }
    } finally {
      setLoading(false);
    }
  }, [params.id, adoptNote]);

  const fetchSentRx = useCallback(async () => {
    try {
      const res = await fetch(`/api/post-op-prescriptions?surgeryId=${params.id}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setSentRx(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ }
  }, [params.id]);

  useEffect(() => { fetchData(); fetchSentRx(); }, [fetchData, fetchSentRx]);

  useEffect(() => {
    fetch('/api/admin/drug-dressing-templates?activeOnly=true')
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        if (Array.isArray(data)) setDrugDb(data.map((d: any) => ({ name: d.name, type: d.type })));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/users?roles=SURGEON,CONSULTANT_SURGEON,HOUSE_OFFICER&limit=1000')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setSurgeonOpts(Array.isArray(d) ? d : d.users || []))
      .catch(() => {});
  }, []);

  // ── Autosave ────────────────────────────────────────────────────────────
  // Debounced, because an operation note is long and is written by somebody who
  // has been standing for hours. Notes were lost to closed laptops with the old
  // single textarea, and that is the failure this exists to stop.
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ values, childRows, noteImages, surgeonName, surgeonId, noteId, noteStatus });
  latest.current = { values, childRows, noteImages, surgeonName, surgeonId, noteId, noteStatus };

  const save = useCallback(async () => {
    const cur = latest.current;
    if (!cur.noteId || cur.noteStatus === 'SIGNED') return;
    setSaveState('saving');
    try {
      const res = await fetch(`/api/post-op-notes/${cur.noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          values: {
            ...cur.values,
            images: cur.noteImages,
            surgeonName: cur.surgeonName,
            surgeonId: cur.surgeonId,
          },
          children: cur.childRows,
        }),
      });
      if (!res.ok) { setSaveState('error'); return; }
      dirty.current = false;
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, []);

  const queueSave = useCallback(() => {
    dirty.current = true;
    setSaveState('idle');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void save(); }, 1200);
  }, [save]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Leaving with unsaved work is the one moment a warning is worth the
  // interruption.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty.current) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, []);

  const setValue = useCallback((key: string, value: unknown) => {
    setValues((s) => ({ ...s, [key]: value }));
    queueSave();
  }, [queueSave]);

  const setChildren = useCallback((kind: keyof ChildRows, rows: any[]) => {
    setChildRows((s) => ({ ...s, [kind]: rows }));
    queueSave();
  }, [queueSave]);

  // ── Starting and signing ────────────────────────────────────────────────
  const startNote = async () => {
    setStarting(true);
    try {
      const res = await fetch('/api/post-op-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surgeryId: params.id }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Could not start the note.'); return; }
      adoptNote(data.note);
      setTab('write');
    } finally {
      setStarting(false);
    }
  };

  const sign = async () => {
    if (!noteId) return;
    if (!canSign(problems)) {
      alert('Some instructions cannot be carried out as they stand. They are marked in red.');
      return;
    }
    if (!confirm('Sign this note? A signed note cannot be edited — a later correction is added as an addendum.')) return;

    setSigning(true);
    try {
      const result = computeComplexity(complexity);
      const res = await fetch(`/api/post-op-notes/${noteId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          values: { ...values, images: noteImages, surgeonName, surgeonId },
          children: childRows,
          complexity,
          complexityScore: result.score,
          complexityClass: result.classification,
        }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'The note could not be signed.'); return; }
      dirty.current = false;
      adoptNote(data.note);
      await fetchData();
      setTab('summary');
    } catch {
      alert('The note could not be signed.');
    } finally {
      setSigning(false);
    }
  };

  // ── Images ──────────────────────────────────────────────────────────────
  const onPickImages = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);
    const room = MAX_IMAGES - noteImages.length;
    if (room <= 0) { alert(`You can attach a maximum of ${MAX_IMAGES} images.`); return; }
    const selected = incoming.slice(0, room);
    if (incoming.length > room) alert(`Only ${room} more image(s) can be added (max ${MAX_IMAGES}).`);
    selected.forEach((file) => {
      if (!file.type.startsWith('image/')) { alert(`${file.name} is not an image file.`); return; }
      if (file.size > MAX_IMAGE_BYTES) { alert(`${file.name} exceeds the 10 MB limit.`); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setNoteImages((s) => (s.length >= MAX_IMAGES ? s : [...s, result]));
        queueSave();
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (idx: number) => {
    setNoteImages((s) => s.filter((_, i) => i !== idx));
    queueSave();
  };

  // ── Prescription ────────────────────────────────────────────────────────
  const updateMed = (i: number, k: keyof RxMed, v: any) =>
    setRxMeds((s) => s.map((m, idx) => (idx === i ? { ...m, [k]: v } : m)));

  const drugSuggestionsFor = (category: string): string[] => {
    const curated = MED_CATEGORIES.find((c) => c.value === category)?.suggestions || [];
    return Array.from(new Set([...curated, ...drugDb.map((d) => d.name)]));
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
    medications: rxMeds.filter((m) => m.drugName.trim()).map((m) => ({
      category: m.category, drugName: m.drugName, dosage: m.dosage, route: m.route,
      frequency: m.frequency, duration: m.duration, quantity: m.quantity, isControlled: m.isControlled,
    })),
    notes: rxNotes || undefined,
  });

  const printRx = () => {
    const data = buildThermalData();
    if (data.medications.length === 0) { alert('Add at least one medication before printing.'); return; }
    printThermalPrescription(data);
  };

  const sendRxToPharmacy = async () => {
    const cleaned = rxMeds.filter((m) => m.drugName.trim());
    if (cleaned.length === 0) { alert('Add at least one medication before sending to pharmacy.'); return; }
    if (dyspepsiaWarning && !confirm('Patient has dyspepsia and an NSAID is prescribed without a PPI/antacid cover. Send anyway?')) return;
    setSendingRx(true);
    try {
      const res = await fetch('/api/post-op-prescriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surgeryId: params.id,
          medications: cleaned.map((m) => ({
            category: m.category, drugName: m.drugName.trim(),
            dosage: m.dosage || undefined, route: m.route || undefined,
            frequency: m.frequency || undefined, duration: m.duration || undefined,
            quantity: m.quantity || 1, isControlled: m.isControlled,
          })),
          notes: rxNotes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Failed to send prescription to pharmacy.'); return; }
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

  if (loading) return <div className="p-6">Loading...</div>;

  const liveComplexity = computeComplexity(complexity);
  const complexityBand = classifyScore(liveComplexity.score);
  const bandColor =
    complexityBand === 'Minor' ? 'bg-green-100 text-green-800 border-green-300'
      : complexityBand === 'Intermediate' ? 'bg-blue-100 text-blue-800 border-blue-300'
      : complexityBand === 'Major' ? 'bg-amber-100 text-amber-800 border-amber-300'
      : 'bg-red-100 text-red-800 border-red-300';

  const complexityFields: { key: keyof ComplexityCriteria; label: string; options: readonly { value: string; label: string }[] }[] = [
    { key: 'operativeTime', label: 'Operative time', options: COMPLEXITY_OPTIONS.operativeTime },
    { key: 'bloodLoss', label: 'Estimated blood loss', options: COMPLEXITY_OPTIONS.bloodLoss },
    { key: 'anaesthesia', label: 'Anaesthesia', options: COMPLEXITY_OPTIONS.anaesthesia },
    { key: 'bodyCavity', label: 'Body cavity entered', options: COMPLEXITY_OPTIONS.bodyCavity },
    { key: 'physiologicalStress', label: 'Physiological stress', options: COMPLEXITY_OPTIONS.physiologicalStress },
    { key: 'hospitalStay', label: 'Expected hospital stay', options: COMPLEXITY_OPTIONS.hospitalStay },
    { key: 'icuRequirement', label: 'ICU requirement', options: COMPLEXITY_OPTIONS.icuRequirement },
    { key: 'mdtRequirement', label: 'Multidisciplinary team', options: COMPLEXITY_OPTIONS.mdtRequirement },
  ];

  const readOnly = noteStatus === 'SIGNED';
  const patient = surgery?.patient;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <button onClick={() => router.back()} className="no-print text-blue-600 hover:text-blue-800">
        ← Back
      </button>

      {/* ── Patient and operation, taken from the case. Never retyped. ───── */}
      <div>
        <h1 className="text-2xl font-bold">Post-Operative Notes</h1>
        {surgery && (
          <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              <Fact label="Patient" value={patient?.name} />
              <Fact label="Folder number" value={patient?.folderNumber} />
              <Fact label="Age / sex" value={[patient?.age, patient?.gender].filter(Boolean).join(' / ')} />
              <Fact label="Ward" value={patient?.ward} />
              <Fact label="Procedure" value={surgery.procedureName} />
              <Fact label="Unit" value={surgery.unit} />
              <Fact label="Indication" value={surgery.indication} />
              <Fact label="Anaesthesia" value={surgery.anesthesiaType} />
              <Fact label="Type" value={surgery.surgeryType} />
              <Fact label="Assistant" value={surgery.assistantSurgeon?.fullName} />
              <Fact label="Anaesthetist" value={surgery.anesthetist?.fullName} />
              <Fact
                label="Knife on skin"
                value={surgery.knifeOnSkinTime ? new Date(surgery.knifeOnSkinTime).toLocaleString('en-GB') : null}
              />
              <Fact
                label="Surgery end"
                value={surgery.surgeryEndTime ? new Date(surgery.surgeryEndTime).toLocaleString('en-GB') : null}
              />
              <Fact label="Duration" value={operativeDuration(surgery)} />
              <Fact label="Theatre" value={surgery.location} />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Taken from the case record. Anything wrong here should be corrected on the case rather than retyped —
              except the operating surgeon, corrected below, because the note is the more reliable source.
            </p>
          </div>
        )}
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="no-print flex gap-1 border-b border-gray-200">
        {([
          ['write', 'Operation note'],
          ['summary', 'Nursing summary'],
          ['previous', `Previous notes (${feed.length})`],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Write ───────────────────────────────────────────────────────── */}
      {tab === 'write' && (
        <div className="space-y-4">
          {!noteId ? (
            <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
              <FileText className="mx-auto h-8 w-8 text-gray-400" />
              <h2 className="mt-2 font-semibold text-gray-900">No operation note yet</h2>
              <p className="mx-auto mt-1 max-w-lg text-sm text-gray-600">
                The form adapts to the operation. This case matches the{' '}
                <span className="font-medium">{template.label}</span> template
                {template.description ? ` — ${template.description}` : '.'}
              </p>
              <button onClick={startNote} disabled={starting} className="btn-primary mt-4 disabled:opacity-50">
                {starting ? 'Starting...' : 'Start the operation note'}
              </button>
            </div>
          ) : (
            <>
              {/* Status strip */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${
                    readOnly ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {readOnly ? 'Signed' : 'Draft'}
                  </span>
                  {noteType === 'ADDENDUM' && (
                    <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-800">
                      Addendum
                    </span>
                  )}
                  <span className="text-gray-600">{template.label}</span>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  {!readOnly && (
                    <span className="text-gray-500">
                      {saveState === 'saving' && <><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Saving</>}
                      {saveState === 'saved' && <><Check className="mr-1 inline h-3 w-3 text-green-600" />Saved</>}
                      {saveState === 'error' && <span className="text-red-600">Not saved — check your connection</span>}
                    </span>
                  )}
                  {counts.blocking > 0 && (
                    <span className="flex items-center gap-1 font-medium text-red-700">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {counts.blocking} to fix before signing
                    </span>
                  )}
                  {counts.blocking === 0 && counts.advisory > 0 && (
                    <span className="text-amber-700">{counts.advisory} to consider</span>
                  )}
                </div>
              </div>

              {readOnly && (
                <div className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
                  This note is signed and cannot be edited. A correction is recorded as an addendum,
                  which leaves the original standing.
                  <button onClick={startNote} disabled={starting} className="ml-2 font-semibold underline">
                    Write an addendum
                  </button>
                </div>
              )}

              {/* Operating surgeon — correctable, as before. */}
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">Operating surgeon</label>
                <StaffComboInput
                  value={surgeonName}
                  onChange={(v) => {
                    setSurgeonName(v);
                    const match = surgeonOpts.find((o) => o.fullName === v);
                    setSurgeonId(match ? match.id : null);
                    queueSave();
                  }}
                  options={surgeonOpts}
                  placeholder="Select or type the operating surgeon"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Correcting this updates the case when the note is signed. Type a name for a visiting surgeon.
                </p>
              </div>

              {/* Template override. Keyword matching is advisory, and the person
                  at the keyboard knows better than the booking text. */}
              {!readOnly && (
                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="note-template">
                    Note template
                  </label>
                  <select
                    id="note-template"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm sm:w-96"
                    value={templateKey}
                    onChange={(e) => { setTemplateKey(e.target.value); queueSave(); }}
                  >
                    <option value="CORE">General operation note</option>
                    {PROCEDURE_TEMPLATES.map((t) => (
                      <option key={t.key} value={t.key}>{t.label}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Chosen from the procedure name. Change it if the operation was something else —
                    nothing already entered is lost.
                  </p>
                </div>
              )}

              <StructuredNoteForm
                template={template}
                values={values}
                rows={childRows}
                problems={problems}
                disabled={readOnly}
                onChange={setValue}
                onChildChange={setChildren}
              />

              {/* Intra-operative drawings / pictures (max 2, 10 MB each) */}
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <label className={`inline-flex cursor-pointer items-center gap-2 rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 ${readOnly ? 'pointer-events-none opacity-50' : ''}`}>
                    <ImagePlus className="h-4 w-4" />
                    Add drawings / intra-op pictures
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      disabled={readOnly || noteImages.length >= MAX_IMAGES}
                      onChange={(e) => { onPickImages(e.target.files); e.target.value = ''; }}
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
                        <img src={src} alt={`Intra-operative attachment ${i + 1}`} className="h-24 w-24 rounded border object-cover" />
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => removeImage(i)}
                            aria-label="Remove image"
                            className="absolute -right-2 -top-2 rounded-full bg-red-600 p-0.5 text-white shadow"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Surgical Complexity Score */}
              <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold">Surgical Complexity Score</h2>
                    <p className="mt-1 text-xs text-gray-500">
                      Fields already documented for this case are auto-filled. Review and adjust before signing —
                      this is recorded with the note and feeds the Research &amp; Analytics module.
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

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {complexityFields.map((f) => (
                    <div key={f.key}>
                      <label className="mb-1 block text-xs font-medium text-gray-600">
                        {f.label}
                        {autofilled[f.key] && <span className="ml-2 text-[10px] font-semibold text-green-600">• auto-filled</span>}
                      </label>
                      <select
                        className="w-full rounded border px-2 py-1.5 text-sm"
                        aria-label={f.label}
                        disabled={readOnly}
                        value={complexity[f.key]}
                        onChange={(e) => {
                          const v = e.target.value;
                          setComplexity((prev) => ({ ...prev, [f.key]: v }));
                          setAutofilled((prev) => ({ ...prev, [f.key]: false }));
                        }}
                      >
                        {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>

                <div className="text-xs text-gray-500">
                  Bands: 0-20 Minor · 21-40 Intermediate · 41-70 Major · 71-100 Supermajor.
                </div>
              </div>

              {/* Sign */}
              {!readOnly && (
                <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white p-4 shadow-lg">
                  <div className="text-sm">
                    {counts.blocking > 0 ? (
                      <span className="text-red-700">
                        {counts.blocking} instruction{counts.blocking === 1 ? '' : 's'} cannot be carried out as written.
                      </span>
                    ) : (
                      <span className="text-gray-600">
                        Signing records this as the operation note. It cannot be edited afterwards.
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => void save()}
                      className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                    >
                      Save draft
                    </button>
                    <button
                      onClick={sign}
                      disabled={signing || counts.blocking > 0}
                      className="btn-primary disabled:opacity-50"
                    >
                      {signing ? 'Signing...' : 'Sign the note'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Nursing summary ─────────────────────────────────────────────── */}
      {tab === 'summary' && (
        <div className="space-y-3">
          {noteStatus !== 'SIGNED' && noteId && (
            <div className="no-print rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              This note is not signed yet. What follows is a preview of the sheet the ward will read —
              it is not an instruction to anybody until the note is signed.
            </div>
          )}
          <NursingSummaryCard
            summary={summary}
            patientName={patient?.name}
            folderNumber={patient?.folderNumber}
            procedure={surgery?.procedureName}
            ward={patient?.ward}
          />
        </div>
      )}

      {/* ── Previous notes ──────────────────────────────────────────────── */}
      {tab === 'previous' && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-lg font-bold">Previous notes</h2>
          {feed.length === 0 ? (
            <p className="text-sm text-gray-500">No post-operative notes yet.</p>
          ) : (
            <div className="space-y-3">
              {feed.map((n) => (
                <div key={n.id} className="rounded-lg border bg-gray-50 p-3">
                  <p className="mb-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span>{new Date(n.createdAt).toLocaleString('en-GB')} • {n.authorName}</span>
                    {n.kind === 'STRUCTURED' && (
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 font-semibold text-blue-800">Structured</span>
                    )}
                    {n.noteType === 'ADDENDUM' && (
                      <span className="rounded bg-purple-100 px-1.5 py-0.5 font-semibold text-purple-800">Addendum</span>
                    )}
                  </p>
                  <p className="whitespace-pre-wrap text-sm">{n.narrative || '-'}</p>
                  {n.plan && (
                    <div className="mt-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Plan</p>
                      <p className="whitespace-pre-wrap text-sm">{n.plan}</p>
                    </div>
                  )}
                  {n.images.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {n.images.map((src, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <a key={i} href={src} target="_blank" rel="noopener noreferrer">
                          <img src={src} alt={`Attachment ${i + 1}`} className="h-24 w-24 rounded border object-cover hover:opacity-90" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Post-operative medications → pharmacy ───────────────────────── */}
      <div className="no-print space-y-4 rounded-lg border border-gray-200 bg-white p-4">
        <div>
          <h2 className="text-lg font-bold">Post-Operative Medications</h2>
          <p className="mt-1 text-xs text-gray-500">
            Select drugs by category from the medication database or type a drug not on the list.
            These are wired to the Pharmacy for dispensing before the patient leaves theatre.
          </p>
        </div>

        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={hasDyspepsia} onChange={(e) => setHasDyspepsia(e.target.checked)} />
          Patient has dyspepsia / peptic ulcer history (avoid plain NSAIDs; add PPI cover)
        </label>

        {dyspepsiaWarning && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            ⚠ An NSAID is prescribed but no PPI/antacid cover is added. Consider adding a
            proton-pump inhibitor (e.g. Omeprazole) for this dyspeptic patient.
          </div>
        )}

        <div className="space-y-3">
          {rxMeds.map((m, i) => (
            <div key={i} className="space-y-2 rounded-lg border bg-gray-50 p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Category</label>
                  <select
                    className="w-full rounded border px-2 py-1 text-sm"
                    aria-label="Medication category"
                    value={m.category}
                    onChange={(e) => updateMed(i, 'category', e.target.value)}
                  >
                    {MED_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Drug</label>
                  <input
                    list={`drug-options-${i}`}
                    className="w-full rounded border px-2 py-1 text-sm"
                    placeholder="Select or type a drug name"
                    aria-label="Drug name"
                    value={m.drugName}
                    onChange={(e) => updateMed(i, 'drugName', e.target.value)}
                  />
                  <datalist id={`drug-options-${i}`}>
                    {drugSuggestionsFor(m.category).map((s) => <option key={s} value={s} />)}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <input className="rounded border px-2 py-1 text-sm" placeholder="Dosage" aria-label="Dosage" value={m.dosage} onChange={(e) => updateMed(i, 'dosage', e.target.value)} />
                <select className="rounded border px-2 py-1 text-sm" aria-label="Route" value={m.route} onChange={(e) => updateMed(i, 'route', e.target.value)}>
                  {ROUTES.map((r) => <option key={r}>{r}</option>)}
                </select>
                <input className="rounded border px-2 py-1 text-sm" placeholder="Frequency (e.g. BD)" aria-label="Frequency" value={m.frequency} onChange={(e) => updateMed(i, 'frequency', e.target.value)} />
                <input className="rounded border px-2 py-1 text-sm" placeholder="Duration (e.g. 5/7)" aria-label="Duration" value={m.duration} onChange={(e) => updateMed(i, 'duration', e.target.value)} />
                <input type="number" min={1} className="rounded border px-2 py-1 text-sm" placeholder="Qty" aria-label="Quantity" value={m.quantity} onChange={(e) => updateMed(i, 'quantity', Number(e.target.value))} />
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={m.isControlled} onChange={(e) => updateMed(i, 'isControlled', e.target.checked)} /> Controlled drug
                </label>
                <button
                  type="button"
                  onClick={() => setRxMeds((s) => (s.length > 1 ? s.filter((_, idx) => idx !== i) : s))}
                  className="inline-flex items-center gap-1 text-xs text-red-600 disabled:opacity-40"
                  disabled={rxMeds.length === 1}
                >
                  <Trash2 className="h-3 w-3" /> Remove
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRxMeds((s) => [...s, emptyMed()])}
            className="inline-flex items-center gap-1 text-sm text-blue-600"
          >
            <Plus className="h-4 w-4" /> Add medication
          </button>
        </div>

        <textarea
          className="w-full rounded border px-2 py-1 text-sm"
          rows={2}
          placeholder="Additional instructions for pharmacy (optional)"
          aria-label="Pharmacy notes"
          value={rxNotes}
          onChange={(e) => setRxNotes(e.target.value)}
        />

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={printRx}
            className="inline-flex items-center gap-2 rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            <Printer className="h-4 w-4" /> Print (80mm thermal)
          </button>
          <button
            type="button"
            onClick={sendRxToPharmacy}
            disabled={sendingRx}
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Send className="h-4 w-4" /> {sendingRx ? 'Sending...' : 'Send to Pharmacy'}
          </button>
        </div>

        {sentRx.length > 0 && (
          <div className="mt-4 border-t pt-4">
            <h3 className="mb-2 text-sm font-bold text-gray-800">Sent to Pharmacy ({sentRx.length})</h3>
            <div className="space-y-2">
              {sentRx.map((rx) => {
                let meds: any[] = [];
                try { meds = Array.isArray(rx.medications) ? rx.medications : JSON.parse(rx.medications || '[]'); } catch {}
                return (
                  <div key={rx.id} className="rounded-lg border bg-gray-50 p-3 text-sm">
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-gray-800">
                        {new Date(rx.prescribedAt || rx.createdAt).toLocaleString('en-GB')} · {rx.prescribedByName || 'Surgeon'}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
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
    </div>
  );
}

/**
 * How long the operation took, from the times already recorded on the case.
 *
 * Computed rather than asked for: both ends are timestamped by theatre, and a
 * duration typed by the surgeon afterwards is a recollection, not a measurement.
 * Answers null when either end is missing, which the Fact renders as
 * "not recorded" — the honest answer rather than a plausible zero.
 */
function operativeDuration(surgery: { knifeOnSkinTime?: string | null; surgeryEndTime?: string | null }): string | null {
  if (!surgery.knifeOnSkinTime || !surgery.surgeryEndTime) return null;
  const minutes = Math.round(
    (new Date(surgery.surgeryEndTime).getTime() - new Date(surgery.knifeOnSkinTime).getTime()) / 60000,
  );
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

/** One system-populated fact. A blank one is shown as blank, not hidden. */
function Fact({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-gray-500">{label}:</span>
      <span className={value ? 'font-medium text-gray-900' : 'text-gray-400'}>
        {value || 'not recorded'}
      </span>
    </div>
  );
}
