'use client';

/**
 * Admin → Surgical Catalog
 * ------------------------------------------------------------------
 * One-stop CRUD for the two booking-time pickers:
 *   • Surgical consumables   → /api/admin/consumable-templates
 *   • Drugs / IV fluids /    → /api/admin/drug-dressing-templates
 *     active dressing agents
 *
 * Plus a one-click "Seed defaults" button that calls
 * POST /api/admin/seed-surgical-catalog (idempotent upsert of the
 * curated UNTH starter list — ~50 consumables + ~30 drugs).
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  Package,
  Pill,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Sparkles,
  Save,
  X,
  ArrowLeft,
  Search,
  Share2,
  FileDown,
  Users,
} from 'lucide-react';

type ConsumableCategory =
  | 'GLOVES' | 'GOWNS_DRAPES' | 'SUTURES' | 'SYRINGES_NEEDLES' | 'CATHETERS_TUBING'
  | 'DRESSING_PACKS' | 'SKIN_PREP' | 'CLEANING_SOLUTION' | 'STERILE_DRESSINGS'
  | 'IRRIGATION' | 'DIATHERMY' | 'SUCTION' | 'ANAESTHESIA_AIRWAY' | 'PPE' | 'OTHER';

type DrugType =
  | 'ANTIBIOTIC' | 'ANALGESIC' | 'ANAESTHETIC_ADJUNCT' | 'IV_FLUID'
  | 'WOUND_DRESSING_AGENT' | 'ANTISEPTIC' | 'HAEMOSTATIC' | 'OTHER';

interface Consumable {
  id?: string;
  name: string;
  category: ConsumableCategory;
  size?: string | null;
  unit: string;
  specialty?: string | null;
  defaultQuantity: number;
  isActive: boolean;
  sortOrder: number;
  notes?: string | null;
}

interface Drug {
  id?: string;
  name: string;
  type: DrugType;
  defaultDosage?: string | null;
  defaultRoute?: string | null;
  defaultQuantity: number;
  unit: string;
  specialty?: string | null;
  isControlled: boolean;
  isActive: boolean;
  sortOrder: number;
  notes?: string | null;
}

const CONSUMABLE_CATEGORIES: ConsumableCategory[] = [
  'GLOVES', 'GOWNS_DRAPES', 'SUTURES', 'SYRINGES_NEEDLES', 'CATHETERS_TUBING',
  'DRESSING_PACKS', 'SKIN_PREP', 'CLEANING_SOLUTION', 'STERILE_DRESSINGS',
  'IRRIGATION', 'DIATHERMY', 'SUCTION', 'ANAESTHESIA_AIRWAY', 'PPE', 'OTHER',
];

const DRUG_TYPES: DrugType[] = [
  'ANTIBIOTIC', 'ANALGESIC', 'ANAESTHETIC_ADJUNCT', 'IV_FLUID',
  'WOUND_DRESSING_AGENT', 'ANTISEPTIC', 'HAEMOSTATIC', 'OTHER',
];

const ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'CONSUMABLE_PACK_PROVIDER'];

const blankConsumable = (): Consumable => ({
  name: '', category: 'OTHER', size: '', unit: 'piece', specialty: '',
  defaultQuantity: 1, isActive: true, sortOrder: 0, notes: '',
});

const blankDrug = (): Drug => ({
  name: '', type: 'OTHER', defaultDosage: '', defaultRoute: '',
  defaultQuantity: 1, unit: 'vial', specialty: '', isControlled: false,
  isActive: true, sortOrder: 0, notes: '',
});

export default function SurgicalCatalogPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const canEdit = !!role && ADMIN_ROLES.includes(role);
  const canEditDrugs = canEdit || role === 'PHARMACIST';

  const [tab, setTab] = useState<'consumables' | 'drugs'>('consumables');
  const [filter, setFilter] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [exporting, setExporting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [consumables, setConsumables] = useState<Consumable[]>([]);
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const [editing, setEditing] = useState<{ kind: 'consumable'; data: Consumable } | { kind: 'drug'; data: Drug } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, dRes] = await Promise.all([
        fetch('/api/admin/consumable-templates?activeOnly=false'),
        fetch('/api/admin/drug-dressing-templates?activeOnly=false'),
      ]);
      if (cRes.ok) setConsumables(await cRes.json());
      if (dRes.ok) setDrugs(await dRes.json());
    } catch (e: any) {
      toast.error('Failed to load catalog: ' + (e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (status === 'authenticated') refresh(); }, [status, refresh]);

  // Auto-refresh every 20s when toggled on (real-time view of crowdsourced submissions)
  useEffect(() => {
    if (!autoRefresh) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(() => { refresh(); }, 20_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [autoRefresh, refresh]);

  const copyShareLink = async () => {
    const url = `${window.location.origin}/dashboard/catalog-contribute`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Share link copied to clipboard');
    } catch {
      window.prompt('Copy this link:', url);
    }
  };

  const exportPdf = async () => {
    setExporting(true);
    try {
      const [{ default: jsPDF }, autoTableMod] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const autoTable = (autoTableMod as any).default || (autoTableMod as any);
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const today = new Date().toLocaleString();

      doc.setFontSize(16);
      doc.text('UNTH Theatre — Surgical Catalog', 40, 40);
      doc.setFontSize(10);
      doc.setTextColor(110);
      doc.text(`Generated ${today}`, 40, 56);
      doc.setTextColor(0);

      // Consumables table
      doc.setFontSize(13);
      doc.text(`Surgical Consumables (${consumables.length})`, 40, 80);
      autoTable(doc, {
        startY: 90,
        head: [['Name', 'Category', 'Size', 'Unit', 'Default Qty', 'Specialty', 'Active', 'Notes']],
        body: consumables.map(c => [
          c.name, c.category, c.size || '-', c.unit, c.defaultQuantity,
          c.specialty || 'all', c.isActive ? 'Yes' : 'No', c.notes || '',
        ]),
        styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
        headStyles: { fillColor: [37, 99, 235] },
        columnStyles: { 7: { cellWidth: 160 } },
      });

      // Drugs table on a fresh page
      doc.addPage();
      doc.setFontSize(13);
      doc.text(`Drugs / IV Fluids / Active Wound Dressings (${drugs.length})`, 40, 40);
      autoTable(doc, {
        startY: 50,
        head: [['Name', 'Type', 'Dosage', 'Route', 'Default Qty', 'Unit', 'Specialty', 'Controlled', 'Active', 'Notes']],
        body: drugs.map(d => [
          d.name, d.type, d.defaultDosage || '-', d.defaultRoute || '-',
          d.defaultQuantity, d.unit, d.specialty || 'all',
          d.isControlled ? 'YES' : '-', d.isActive ? 'Yes' : 'No', d.notes || '',
        ]),
        styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
        headStyles: { fillColor: [124, 58, 237] },
        columnStyles: { 9: { cellWidth: 140 } },
      });

      const pageCount = (doc as any).getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(140);
        doc.text(
          `Page ${i} of ${pageCount}  •  UNTH Theatre Surgical Catalog`,
          doc.internal.pageSize.getWidth() / 2,
          doc.internal.pageSize.getHeight() - 20,
          { align: 'center' },
        );
      }

      const filename = `surgical-catalog-${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(filename);
      toast.success('PDF exported');
    } catch (e: any) {
      toast.error('Export failed: ' + (e?.message ?? e));
    } finally {
      setExporting(false);
    }
  };

  const seed = async () => {
    if (!confirm('Seed the curated UNTH starter catalog?\n\nThis adds ~50 consumables and ~30 drugs/IV fluids/dressings using idempotent upserts (existing items are not duplicated).')) return;
    setSeeding(true);
    try {
      const res = await fetch('/api/admin/seed-surgical-catalog', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      toast.success(`Seeded: ${body.consumables ?? 0} consumables, ${body.drugs ?? 0} drugs.`);
      await refresh();
    } catch (e: any) {
      toast.error('Seed failed: ' + (e?.message ?? e));
    } finally {
      setSeeding(false);
    }
  };

  const save = async () => {
    if (!editing) return;
    const isNew = !editing.data.id;
    const url = editing.kind === 'consumable'
      ? '/api/admin/consumable-templates'
      : '/api/admin/drug-dressing-templates';
    try {
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing.data),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      toast.success(isNew ? 'Created' : 'Updated');
      setEditing(null);
      await refresh();
    } catch (e: any) {
      toast.error('Save failed: ' + (e?.message ?? e));
    }
  };

  const remove = async (kind: 'consumable' | 'drug', id: string) => {
    if (!confirm('Delete this item?\n\nIf any surgery requests reference it, it will be soft-deleted (deactivated) instead of permanently removed.')) return;
    const url = kind === 'consumable'
      ? `/api/admin/consumable-templates?id=${encodeURIComponent(id)}`
      : `/api/admin/drug-dressing-templates?id=${encodeURIComponent(id)}`;
    try {
      const res = await fetch(url, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      toast.success(body.softDeleted ? 'Deactivated (in use by existing requests)' : 'Deleted');
      await refresh();
    } catch (e: any) {
      toast.error('Delete failed: ' + (e?.message ?? e));
    }
  };

  if (status === 'loading') return <div className="p-8 text-gray-500">Loading…</div>;
  if (status === 'unauthenticated') return <div className="p-8">Please sign in.</div>;

  const q = filter.trim().toLowerCase();
  const filteredConsumables = q
    ? consumables.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        (c.specialty || '').toLowerCase().includes(q) ||
        (c.size || '').toLowerCase().includes(q))
    : consumables;
  const filteredDrugs = q
    ? drugs.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.type.toLowerCase().includes(q) ||
        (d.specialty || '').toLowerCase().includes(q) ||
        (d.defaultDosage || '').toLowerCase().includes(q))
    : drugs;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center mb-1">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to dashboard
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Surgical Catalog</h1>
          <p className="text-sm text-gray-600 mt-1">
            Curate the consumables and drugs/IV fluids/active wound dressing agents that surgeons can pick from on the booking form.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={refresh}
            disabled={loading}
            className="px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 inline-flex items-center text-sm"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <label className="px-3 py-2 bg-white border border-gray-300 rounded-lg inline-flex items-center text-sm cursor-pointer">
            <input type="checkbox" className="mr-2" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Live (20s)
          </label>
          <button
            onClick={exportPdf}
            disabled={exporting || (consumables.length === 0 && drugs.length === 0)}
            className="px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 inline-flex items-center text-sm"
          >
            <FileDown className={`w-4 h-4 mr-2 ${exporting ? 'animate-pulse' : ''}`} />
            {exporting ? 'Exporting…' : 'Export PDF'}
          </button>
          <button
            onClick={copyShareLink}
            className="px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 inline-flex items-center text-sm"
            title="Copy contribute link to clipboard"
          >
            <Share2 className="w-4 h-4 mr-2" />
            Share contribute link
          </button>
          <Link
            href="/dashboard/catalog-contribute"
            className="px-3 py-2 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-lg hover:bg-emerald-100 inline-flex items-center text-sm"
          >
            <Users className="w-4 h-4 mr-2" />
            Open contribute form
          </Link>
          <Link
            href="/dashboard/catalog-letter"
            className="px-3 py-2 bg-indigo-50 border border-indigo-300 text-indigo-800 rounded-lg hover:bg-indigo-100 inline-flex items-center text-sm"
            title="Letter to Chief Residents — printable / PDF / WhatsApp"
          >
            <FileDown className="w-4 h-4 mr-2" />
            Chief Residents letter
          </Link>
          {canEdit && (
            <button
              onClick={seed}
              disabled={seeding}
              className="px-3 py-2 bg-amber-100 border border-amber-300 text-amber-900 rounded-lg hover:bg-amber-200 inline-flex items-center text-sm"
            >
              <Sparkles className={`w-4 h-4 mr-2 ${seeding ? 'animate-pulse' : ''}`} />
              {seeding ? 'Seeding…' : 'Seed defaults'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-4 flex gap-1">
        <button
          onClick={() => setTab('consumables')}
          className={`px-4 py-2 text-sm font-medium border-b-2 inline-flex items-center ${
            tab === 'consumables' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <Package className="w-4 h-4 mr-2" />
          Consumables ({consumables.length})
        </button>
        <button
          onClick={() => setTab('drugs')}
          className={`px-4 py-2 text-sm font-medium border-b-2 inline-flex items-center ${
            tab === 'drugs' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <Pill className="w-4 h-4 mr-2" />
          Drugs / IV / Dressings ({drugs.length})
        </button>
      </div>

      {/* Filter + add */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            id="catalog-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name, category, specialty…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        {tab === 'consumables' && canEdit && (
          <button
            onClick={() => setEditing({ kind: 'consumable', data: blankConsumable() })}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center text-sm"
          >
            <Plus className="w-4 h-4 mr-2" /> New consumable
          </button>
        )}
        {tab === 'drugs' && canEditDrugs && (
          <button
            onClick={() => setEditing({ kind: 'drug', data: blankDrug() })}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center text-sm"
          >
            <Plus className="w-4 h-4 mr-2" /> New drug / fluid
          </button>
        )}
      </div>

      {/* Tables */}
      {loading ? (
        <div className="text-gray-500 text-sm py-12 text-center">Loading…</div>
      ) : tab === 'consumables' ? (
        <ConsumableTable
          items={filteredConsumables}
          canEdit={canEdit}
          onEdit={(c) => setEditing({ kind: 'consumable', data: { ...c } })}
          onDelete={(id) => remove('consumable', id)}
        />
      ) : (
        <DrugTable
          items={filteredDrugs}
          canEdit={canEditDrugs}
          onEdit={(d) => setEditing({ kind: 'drug', data: { ...d } })}
          onDelete={(id) => remove('drug', id)}
        />
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h3 className="font-semibold text-gray-900">
                {editing.data.id ? 'Edit' : 'New'} {editing.kind === 'consumable' ? 'consumable' : 'drug / fluid / dressing'}
              </h3>
              <button onClick={() => setEditing(null)} className="text-gray-500 hover:text-gray-800" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {editing.kind === 'consumable'
                ? <ConsumableForm data={editing.data} onChange={(d) => setEditing({ kind: 'consumable', data: d })} />
                : <DrugForm data={editing.data} onChange={(d) => setEditing({ kind: 'drug', data: d })} />}
            </div>
            <div className="border-t px-5 py-3 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              <button onClick={save} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center text-sm">
                <Save className="w-4 h-4 mr-2" /> Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------- sub-components ----------------------------- */

function ConsumableTable({ items, canEdit, onEdit, onDelete }: {
  items: Consumable[]; canEdit: boolean;
  onEdit: (c: Consumable) => void; onDelete: (id: string) => void;
}) {
  if (items.length === 0) return <EmptyState label="No consumables" />;
  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Category</th>
            <th className="px-4 py-2">Size</th>
            <th className="px-4 py-2">Unit</th>
            <th className="px-4 py-2">Default Qty</th>
            <th className="px-4 py-2">Specialty</th>
            <th className="px-4 py-2">Status</th>
            {canEdit && <th className="px-4 py-2 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((c) => (
            <tr key={c.id} className={c.isActive ? '' : 'bg-gray-50 text-gray-500'}>
              <td className="px-4 py-2 font-medium">{c.name}</td>
              <td className="px-4 py-2"><span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">{c.category}</span></td>
              <td className="px-4 py-2">{c.size || '—'}</td>
              <td className="px-4 py-2">{c.unit}</td>
              <td className="px-4 py-2">{c.defaultQuantity}</td>
              <td className="px-4 py-2">{c.specialty || 'all'}</td>
              <td className="px-4 py-2">
                {c.isActive
                  ? <span className="text-green-700 text-xs font-medium">Active</span>
                  : <span className="text-gray-500 text-xs">Inactive</span>}
              </td>
              {canEdit && (
                <td className="px-4 py-2 text-right space-x-1 whitespace-nowrap">
                  <button onClick={() => onEdit(c)} className="p-1 text-gray-600 hover:text-blue-600" aria-label={`Edit ${c.name}`} title="Edit">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => c.id && onDelete(c.id)} className="p-1 text-gray-600 hover:text-red-600" aria-label={`Delete ${c.name}`} title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DrugTable({ items, canEdit, onEdit, onDelete }: {
  items: Drug[]; canEdit: boolean;
  onEdit: (d: Drug) => void; onDelete: (id: string) => void;
}) {
  if (items.length === 0) return <EmptyState label="No drugs / fluids" />;
  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Type</th>
            <th className="px-4 py-2">Dosage</th>
            <th className="px-4 py-2">Route</th>
            <th className="px-4 py-2">Default Qty</th>
            <th className="px-4 py-2">Unit</th>
            <th className="px-4 py-2">Controlled</th>
            <th className="px-4 py-2">Status</th>
            {canEdit && <th className="px-4 py-2 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((d) => (
            <tr key={d.id} className={d.isActive ? '' : 'bg-gray-50 text-gray-500'}>
              <td className="px-4 py-2 font-medium">{d.name}</td>
              <td className="px-4 py-2"><span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded">{d.type}</span></td>
              <td className="px-4 py-2">{d.defaultDosage || '—'}</td>
              <td className="px-4 py-2">{d.defaultRoute || '—'}</td>
              <td className="px-4 py-2">{d.defaultQuantity}</td>
              <td className="px-4 py-2">{d.unit}</td>
              <td className="px-4 py-2">{d.isControlled ? <span className="text-red-700 text-xs font-bold">YES</span> : '—'}</td>
              <td className="px-4 py-2">
                {d.isActive
                  ? <span className="text-green-700 text-xs font-medium">Active</span>
                  : <span className="text-gray-500 text-xs">Inactive</span>}
              </td>
              {canEdit && (
                <td className="px-4 py-2 text-right space-x-1 whitespace-nowrap">
                  <button onClick={() => onEdit(d)} className="p-1 text-gray-600 hover:text-blue-600" aria-label={`Edit ${d.name}`} title="Edit">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => d.id && onDelete(d.id)} className="p-1 text-gray-600 hover:text-red-600" aria-label={`Delete ${d.name}`} title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="bg-white border border-dashed rounded-lg p-12 text-center text-gray-500">
      <Package className="w-10 h-10 mx-auto mb-2 text-gray-400" />
      <p>{label}. Use “Seed defaults” for the starter list, or click “New” to add one manually.</p>
    </div>
  );
}

function ConsumableForm({ data, onChange }: { data: Consumable; onChange: (d: Consumable) => void }) {
  const set = (patch: Partial<Consumable>) => onChange({ ...data, ...patch });
  return (
    <>
      <Field label="Name" htmlFor="cf-name">
        <input id="cf-name" title="Name" value={data.name} onChange={(e) => set({ name: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" htmlFor="cf-cat">
          <select id="cf-cat" title="Category" value={data.category} onChange={(e) => set({ category: e.target.value as ConsumableCategory })} className="w-full px-3 py-2 border rounded-lg">
            {CONSUMABLE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Specialty (optional)" htmlFor="cf-spec">
          <input id="cf-spec" title="Specialty" value={data.specialty || ''} onChange={(e) => set({ specialty: e.target.value })} placeholder="e.g. Orthopaedics" className="w-full px-3 py-2 border rounded-lg" />
        </Field>
        <Field label="Size" htmlFor="cf-size">
          <input id="cf-size" title="Size" value={data.size || ''} onChange={(e) => set({ size: e.target.value })} placeholder="e.g. 7.5" className="w-full px-3 py-2 border rounded-lg" />
        </Field>
        <Field label="Unit" htmlFor="cf-unit">
          <input id="cf-unit" title="Unit" value={data.unit} onChange={(e) => set({ unit: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
        </Field>
        <Field label="Default quantity" htmlFor="cf-qty">
          <input id="cf-qty" title="Default quantity" type="number" min={1} value={data.defaultQuantity} onChange={(e) => set({ defaultQuantity: parseInt(e.target.value) || 1 })} className="w-full px-3 py-2 border rounded-lg" />
        </Field>
        <Field label="Sort order" htmlFor="cf-sort">
          <input id="cf-sort" title="Sort order" type="number" value={data.sortOrder} onChange={(e) => set({ sortOrder: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 border rounded-lg" />
        </Field>
      </div>
      <Field label="Notes" htmlFor="cf-notes">
        <textarea id="cf-notes" title="Notes" value={data.notes || ''} onChange={(e) => set({ notes: e.target.value })} rows={2} className="w-full px-3 py-2 border rounded-lg" />
      </Field>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={data.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
        Active (visible in booking form)
      </label>
    </>
  );
}

function DrugForm({ data, onChange }: { data: Drug; onChange: (d: Drug) => void }) {
  const set = (patch: Partial<Drug>) => onChange({ ...data, ...patch });
  return (
    <>
      <Field label="Name" htmlFor="df-name">
        <input id="df-name" title="Name" value={data.name} onChange={(e) => set({ name: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type" htmlFor="df-type">
          <select id="df-type" title="Type" value={data.type} onChange={(e) => set({ type: e.target.value as DrugType })} className="w-full px-3 py-2 border rounded-lg">
            {DRUG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Specialty (optional)" htmlFor="df-spec">
          <input id="df-spec" title="Specialty" value={data.specialty || ''} onChange={(e) => set({ specialty: e.target.value })} placeholder="e.g. Obstetrics" className="w-full px-3 py-2 border rounded-lg" />
        </Field>
        <Field label="Default dosage" htmlFor="df-dose">
          <input id="df-dose" title="Default dosage" value={data.defaultDosage || ''} onChange={(e) => set({ defaultDosage: e.target.value })} placeholder="e.g. 1g" className="w-full px-3 py-2 border rounded-lg" />
        </Field>
        <Field label="Default route" htmlFor="df-route">
          <input id="df-route" title="Default route" value={data.defaultRoute || ''} onChange={(e) => set({ defaultRoute: e.target.value })} placeholder="e.g. IV" className="w-full px-3 py-2 border rounded-lg" />
        </Field>
        <Field label="Default quantity" htmlFor="df-qty">
          <input id="df-qty" title="Default quantity" type="number" min={1} value={data.defaultQuantity} onChange={(e) => set({ defaultQuantity: parseInt(e.target.value) || 1 })} className="w-full px-3 py-2 border rounded-lg" />
        </Field>
        <Field label="Unit" htmlFor="df-unit">
          <input id="df-unit" title="Unit" value={data.unit} onChange={(e) => set({ unit: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
        </Field>
        <Field label="Sort order" htmlFor="df-sort">
          <input id="df-sort" title="Sort order" type="number" value={data.sortOrder} onChange={(e) => set({ sortOrder: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 border rounded-lg" />
        </Field>
      </div>
      <Field label="Notes" htmlFor="df-notes">
        <textarea id="df-notes" title="Notes" value={data.notes || ''} onChange={(e) => set({ notes: e.target.value })} rows={2} className="w-full px-3 py-2 border rounded-lg" />
      </Field>
      <div className="flex flex-col gap-2 text-sm">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={data.isControlled} onChange={(e) => set({ isControlled: e.target.checked })} />
          Controlled drug (narcotic accountability)
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={data.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
          Active (visible in booking form)
        </label>
      </div>
    </>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
