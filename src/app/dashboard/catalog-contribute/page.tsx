'use client';

/**
 * /dashboard/catalog-contribute
 * --------------------------------------------------------------
 * Sub-specialty contribution form. Anyone with the link (and a
 * login) can list the consumables and drugs/IV fluids/dressings
 * their specialty needs. Submissions go straight into the
 * shared catalog (de-duplicated by name within the specialty).
 */

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  Package, Pill, Plus, Trash2, Send, ArrowLeft, CheckCircle2, Info,
} from 'lucide-react';

const CONSUMABLE_CATEGORIES = [
  'GLOVES', 'GOWNS_DRAPES', 'SUTURES', 'SYRINGES_NEEDLES', 'CATHETERS_TUBING',
  'DRESSING_PACKS', 'SKIN_PREP', 'CLEANING_SOLUTION', 'STERILE_DRESSINGS',
  'IRRIGATION', 'DIATHERMY', 'SUCTION', 'ANAESTHESIA_AIRWAY', 'PPE', 'OTHER',
] as const;
type ConsumableCategory = typeof CONSUMABLE_CATEGORIES[number];

const DRUG_TYPES = [
  'ANTIBIOTIC', 'ANALGESIC', 'ANAESTHETIC_ADJUNCT', 'IV_FLUID',
  'WOUND_DRESSING_AGENT', 'ANTISEPTIC', 'HAEMOSTATIC', 'OTHER',
] as const;
type DrugType = typeof DRUG_TYPES[number];

interface ConsumableRow {
  id: number;
  name: string;
  category: ConsumableCategory;
  size: string;
  unit: string;
  defaultQuantity: number;
  notes: string;
}

interface DrugRow {
  id: number;
  name: string;
  type: DrugType;
  defaultDosage: string;
  defaultRoute: string;
  defaultQuantity: number;
  unit: string;
  isControlled: boolean;
  notes: string;
}

const SPECIALTIES = [
  'General Surgery', 'Orthopaedics', 'Neurosurgery', 'Cardiothoracic',
  'Paediatric Surgery', 'Plastic Surgery', 'Urology', 'ENT',
  'Ophthalmology', 'Maxillofacial', 'Obstetrics & Gynaecology',
  'Vascular Surgery', 'Burns & Wound Care', 'Dental Surgery', 'Other',
];

let rowId = 0;
const nextId = () => ++rowId;

const blankConsumable = (): ConsumableRow => ({
  id: nextId(), name: '', category: 'OTHER', size: '', unit: 'piece', defaultQuantity: 1, notes: '',
});
const blankDrug = (): DrugRow => ({
  id: nextId(), name: '', type: 'OTHER', defaultDosage: '', defaultRoute: '',
  defaultQuantity: 1, unit: 'vial', isControlled: false, notes: '',
});

export default function CatalogContributePage() {
  const { data: session, status } = useSession();
  const [specialty, setSpecialty] = useState('');
  const [submitterName, setSubmitterName] = useState('');
  const [consumables, setConsumables] = useState<ConsumableRow[]>([blankConsumable()]);
  const [drugs, setDrugs] = useState<DrugRow[]>([blankDrug()]);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  if (status === 'loading') return <div className="p-8 text-gray-500">Loading…</div>;
  if (status === 'unauthenticated') {
    return (
      <div className="p-8 max-w-xl mx-auto text-center">
        <h2 className="text-xl font-semibold mb-2">Please sign in</h2>
        <p className="text-gray-600 mb-4">You need to be logged in to contribute to the surgical catalog.</p>
        <Link href="/auth/login" className="px-4 py-2 bg-blue-600 text-white rounded-lg">Sign in</Link>
      </div>
    );
  }

  const updateC = (id: number, patch: Partial<ConsumableRow>) =>
    setConsumables(rows => rows.map(r => r.id === id ? { ...r, ...patch } : r));
  const updateD = (id: number, patch: Partial<DrugRow>) =>
    setDrugs(rows => rows.map(r => r.id === id ? { ...r, ...patch } : r));

  const submit = async () => {
    if (!specialty) { toast.error('Choose a sub-specialty'); return; }
    const cleanC = consumables.filter(c => c.name.trim().length > 0)
      .map(({ id, ...c }) => c);
    const cleanD = drugs.filter(d => d.name.trim().length > 0)
      .map(({ id, ...d }) => d);
    if (cleanC.length === 0 && cleanD.length === 0) {
      toast.error('Add at least one item with a name'); return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/catalog/contribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specialty,
          submittedByName: submitterName.trim() || undefined,
          consumables: cleanC,
          drugs: cleanD,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      setLastResult(body);
      toast.success(
        `Submitted! Added ${body.consumablesCreated} consumables, ${body.drugsCreated} drugs. ` +
        `Skipped ${body.consumablesSkipped + body.drugsSkipped} duplicates.`
      );
      setConsumables([blankConsumable()]);
      setDrugs([blankDrug()]);
    } catch (e: any) {
      toast.error('Submission failed: ' + (e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center mb-2">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to dashboard
      </Link>
      <h1 className="text-2xl font-bold text-gray-900">Contribute to the Surgical Catalog</h1>
      <p className="text-sm text-gray-600 mt-1 mb-4 max-w-3xl">
        List the consumables and drugs/IV fluids/active wound-dressing agents your sub-specialty
        needs for routine surgeries. Items appear immediately in the booking form pickers
        for everyone in your specialty.
      </p>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900 mb-5 flex items-start gap-2">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          Duplicates within your specialty are skipped automatically.
          Admins can later edit, deactivate or merge entries from{' '}
          <Link href="/dashboard/admin/surgical-catalog" className="underline">Admin → Surgical Catalog</Link>.
        </div>
      </div>

      {/* Submitter info */}
      <div className="bg-white border rounded-lg p-4 mb-5 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label htmlFor="cc-specialty" className="block text-xs font-semibold text-gray-700 mb-1">
            Sub-specialty <span className="text-red-600">*</span>
          </label>
          <select
            id="cc-specialty"
            title="Sub-specialty"
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">— choose your specialty —</option>
            {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="cc-name" className="block text-xs font-semibold text-gray-700 mb-1">
            Submitted by (optional)
          </label>
          <input
            id="cc-name"
            title="Your name"
            value={submitterName}
            onChange={(e) => setSubmitterName(e.target.value)}
            placeholder={(session?.user as any)?.name || 'Your name'}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>

      {/* Consumables */}
      <SectionHeader icon={<Package className="w-5 h-5" />} title="Surgical Consumables" />
      <ConsumableRows rows={consumables} update={updateC}
        remove={(id) => setConsumables(rs => rs.filter(r => r.id !== id))}
        add={() => setConsumables(rs => [...rs, blankConsumable()])}
      />

      {/* Drugs */}
      <SectionHeader icon={<Pill className="w-5 h-5" />} title="Drugs / IV Fluids / Active Wound Dressings" />
      <DrugRows rows={drugs} update={updateD}
        remove={(id) => setDrugs(rs => rs.filter(r => r.id !== id))}
        add={() => setDrugs(rs => [...rs, blankDrug()])}
      />

      {/* Submit */}
      <div className="mt-6 flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-gray-600">
          {consumables.filter(c => c.name.trim()).length} consumables ·{' '}
          {drugs.filter(d => d.name.trim()).length} drugs ready to submit
        </div>
        <button
          onClick={submit}
          disabled={submitting}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center disabled:opacity-50"
        >
          <Send className={`w-4 h-4 mr-2 ${submitting ? 'animate-pulse' : ''}`} />
          {submitting ? 'Submitting…' : 'Submit to catalog'}
        </button>
      </div>

      {/* Last result */}
      {lastResult && (
        <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-900">
          <div className="flex items-center gap-2 font-semibold mb-1">
            <CheckCircle2 className="w-4 h-4" /> Submission accepted
          </div>
          <ul className="ml-6 list-disc">
            <li>Consumables created: <strong>{lastResult.consumablesCreated}</strong> (skipped {lastResult.consumablesSkipped} duplicates)</li>
            <li>Drugs / fluids / dressings created: <strong>{lastResult.drugsCreated}</strong> (skipped {lastResult.drugsSkipped} duplicates)</li>
            <li>Specialty: <strong>{lastResult.specialty}</strong>, by <strong>{lastResult.submittedBy}</strong></li>
          </ul>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mt-2 mb-2 text-gray-800 font-semibold">
      {icon}
      <span>{title}</span>
    </div>
  );
}

function ConsumableRows({ rows, update, remove, add }: {
  rows: ConsumableRow[];
  update: (id: number, p: Partial<ConsumableRow>) => void;
  remove: (id: number) => void;
  add: () => void;
}) {
  return (
    <div className="bg-white border rounded-lg overflow-x-auto mb-4">
      <table className="w-full text-sm min-w-[820px]">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
          <tr>
            <th className="px-3 py-2 text-left">Name *</th>
            <th className="px-3 py-2 text-left">Category</th>
            <th className="px-3 py-2 text-left">Size</th>
            <th className="px-3 py-2 text-left">Unit</th>
            <th className="px-3 py-2 text-left">Default Qty</th>
            <th className="px-3 py-2 text-left">Notes</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-2 py-1">
                <input title="Item name" value={r.name} onChange={(e) => update(r.id, { name: e.target.value })}
                  placeholder="e.g. Surgical gloves sterile"
                  className="w-full px-2 py-1 border rounded" />
              </td>
              <td className="px-2 py-1">
                <select title="Category" value={r.category}
                  onChange={(e) => update(r.id, { category: e.target.value as ConsumableCategory })}
                  className="w-full px-2 py-1 border rounded">
                  {CONSUMABLE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </td>
              <td className="px-2 py-1">
                <input title="Size" value={r.size} onChange={(e) => update(r.id, { size: e.target.value })}
                  placeholder="e.g. 7.5" className="w-24 px-2 py-1 border rounded" />
              </td>
              <td className="px-2 py-1">
                <input title="Unit" value={r.unit} onChange={(e) => update(r.id, { unit: e.target.value })}
                  className="w-24 px-2 py-1 border rounded" />
              </td>
              <td className="px-2 py-1">
                <input type="number" min={1} title="Default quantity" value={r.defaultQuantity}
                  onChange={(e) => update(r.id, { defaultQuantity: parseInt(e.target.value) || 1 })}
                  className="w-20 px-2 py-1 border rounded" />
              </td>
              <td className="px-2 py-1">
                <input title="Notes" value={r.notes} onChange={(e) => update(r.id, { notes: e.target.value })}
                  placeholder="optional" className="w-full px-2 py-1 border rounded" />
              </td>
              <td className="px-2 py-1 text-right">
                <button onClick={() => remove(r.id)} disabled={rows.length === 1}
                  aria-label="Remove row" title="Remove row"
                  className="p-1 text-gray-500 hover:text-red-600 disabled:opacity-30">
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-2 border-t bg-gray-50 text-right">
        <button onClick={add} className="px-3 py-1 text-sm bg-white border rounded hover:bg-gray-100 inline-flex items-center">
          <Plus className="w-4 h-4 mr-1" /> Add row
        </button>
      </div>
    </div>
  );
}

function DrugRows({ rows, update, remove, add }: {
  rows: DrugRow[];
  update: (id: number, p: Partial<DrugRow>) => void;
  remove: (id: number) => void;
  add: () => void;
}) {
  return (
    <div className="bg-white border rounded-lg overflow-x-auto mb-4">
      <table className="w-full text-sm min-w-[920px]">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
          <tr>
            <th className="px-3 py-2 text-left">Name *</th>
            <th className="px-3 py-2 text-left">Type</th>
            <th className="px-3 py-2 text-left">Dosage</th>
            <th className="px-3 py-2 text-left">Route</th>
            <th className="px-3 py-2 text-left">Default Qty</th>
            <th className="px-3 py-2 text-left">Unit</th>
            <th className="px-3 py-2 text-left">Controlled</th>
            <th className="px-3 py-2 text-left">Notes</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-2 py-1">
                <input title="Drug name" value={r.name} onChange={(e) => update(r.id, { name: e.target.value })}
                  placeholder="e.g. Ceftriaxone" className="w-full px-2 py-1 border rounded" />
              </td>
              <td className="px-2 py-1">
                <select title="Type" value={r.type}
                  onChange={(e) => update(r.id, { type: e.target.value as DrugType })}
                  className="w-full px-2 py-1 border rounded">
                  {DRUG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </td>
              <td className="px-2 py-1">
                <input title="Dosage" value={r.defaultDosage}
                  onChange={(e) => update(r.id, { defaultDosage: e.target.value })}
                  placeholder="e.g. 1g" className="w-24 px-2 py-1 border rounded" />
              </td>
              <td className="px-2 py-1">
                <input title="Route" value={r.defaultRoute}
                  onChange={(e) => update(r.id, { defaultRoute: e.target.value })}
                  placeholder="e.g. IV" className="w-20 px-2 py-1 border rounded" />
              </td>
              <td className="px-2 py-1">
                <input type="number" min={1} title="Default quantity" value={r.defaultQuantity}
                  onChange={(e) => update(r.id, { defaultQuantity: parseInt(e.target.value) || 1 })}
                  className="w-20 px-2 py-1 border rounded" />
              </td>
              <td className="px-2 py-1">
                <input title="Unit" value={r.unit}
                  onChange={(e) => update(r.id, { unit: e.target.value })}
                  className="w-24 px-2 py-1 border rounded" />
              </td>
              <td className="px-2 py-1 text-center">
                <input type="checkbox" aria-label="Controlled" title="Controlled drug"
                  checked={r.isControlled} onChange={(e) => update(r.id, { isControlled: e.target.checked })} />
              </td>
              <td className="px-2 py-1">
                <input title="Notes" value={r.notes} onChange={(e) => update(r.id, { notes: e.target.value })}
                  placeholder="optional" className="w-full px-2 py-1 border rounded" />
              </td>
              <td className="px-2 py-1 text-right">
                <button onClick={() => remove(r.id)} disabled={rows.length === 1}
                  aria-label="Remove row" title="Remove row"
                  className="p-1 text-gray-500 hover:text-red-600 disabled:opacity-30">
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-2 border-t bg-gray-50 text-right">
        <button onClick={add} className="px-3 py-1 text-sm bg-white border rounded hover:bg-gray-100 inline-flex items-center">
          <Plus className="w-4 h-4 mr-1" /> Add row
        </button>
      </div>
    </div>
  );
}
