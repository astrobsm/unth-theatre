'use client';

/**
 * AnaesthesiaPackPicker — lets the anaesthetist apply reusable anaesthesia packs
 * on the pre-anaesthetic review. Packs are stratified by technique (General,
 * Spinal, Epidural, …) plus adjuncts (emergency drugs, difficult airway, RSI,
 * obstetric, paediatric, invasive monitoring).
 *
 * Routing (matches the requirement):
 *   - PHARMACY pack items → emitted as `medications` → the anaesthetic
 *     prescription → PHARMACY.
 *   - CONSUMABLE pack items → emitted as `consumableRequests` → the CONSUMABLE
 *     PACK PROVIDER (created as SurgeryConsumableRequest by /api/preop-reviews).
 *
 * "View pack content" opens an editable modal (change qty/dose/route, remove,
 * add custom, or add from the catalog dropdown). Edits are per-case only.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pill, Package, Check, Loader2, Eye, Plus, Trash2, X, RotateCcw } from 'lucide-react';
import { ANAESTHESIA_PACK_TECHNIQUE } from '@/lib/anaesthesiaTypes';

export interface AnaesMedication {
  id: string; category: string; name: string; dose: string; unit: string; route: string; timing: string; notes?: string;
}
export interface AnaesConsumableRequest {
  name: string; category: string; size?: string | null; unit: string; quantity: number; notes?: string;
}
export interface AnaesPackPayload {
  medications: AnaesMedication[];
  consumableRequests: AnaesConsumableRequest[];
}

interface PackItem {
  name: string; quantity: number; unit: string;
  category?: string | null; size?: string | null;
  drugType?: string | null; dosage?: string | null; route?: string | null; notes?: string | null;
}
interface Pack {
  id: string; name: string; subspecialty: string; technique?: string;
  kind: 'CONSUMABLE' | 'PHARMACY'; description?: string | null; items: PackItem[];
}
interface EditItem {
  name: string; quantity: number | ''; unit: string;
  category?: string | null; size?: string | null;
  drugType?: string | null; dosage?: string | null; route?: string | null;
  notes?: string | null; removed?: boolean; added?: boolean;
}
interface CatalogConsumable { id: string; name: string; category?: string | null; size?: string | null; unit?: string | null; defaultQuantity?: number | null; }
interface CatalogDrug { id: string; name: string; type?: string | null; defaultDosage?: string | null; defaultRoute?: string | null; defaultQuantity?: number | null; unit?: string | null; }

// Maps the AnesthesiaType enum to the seeded pack technique label. Shared with
// the review form and both APIs, so a technique cannot exist in one and not the
// other — that mismatch is what rejected every epidural review with a 400.
const TECHNIQUE_LABEL: Record<string, string> = ANAESTHESIA_PACK_TECHNIQUE;

const cloneItems = (p: Pack): EditItem[] =>
  p.items.map((it) => ({
    name: it.name, quantity: it.quantity, unit: it.unit || (p.kind === 'PHARMACY' ? 'vial' : 'piece'),
    category: it.category ?? null, size: it.size ?? null,
    drugType: it.drugType ?? null, dosage: it.dosage ?? null, route: it.route ?? null, notes: it.notes ?? null,
  }));

let uidCounter = 0;
const uid = () => `anpk-${uidCounter++}`;

export default function AnaesthesiaPackPicker({
  anaesthesiaType,
  onChange,
}: {
  anaesthesiaType?: string; // the AnesthesiaType enum value
  onChange: (payload: AnaesPackPayload) => void;
}) {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Map<string, EditItem[]>>(new Map());
  const [viewing, setViewing] = useState<string | null>(null);
  const [consumableCatalog, setConsumableCatalog] = useState<CatalogConsumable[]>([]);
  const [drugCatalog, setDrugCatalog] = useState<CatalogDrug[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/anaesthesia-packs', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { packs: [] }))
      .then((d) => { if (!cancelled) setPacks(Array.isArray(d.packs) ? d.packs : []); })
      .catch(() => { if (!cancelled) setPacks([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/consumable-templates?activeOnly=true', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : [])).then((d) => { if (!cancelled) setConsumableCatalog(Array.isArray(d) ? d : []); }).catch(() => {});
    fetch('/api/admin/drug-dressing-templates?activeOnly=true', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : [])).then((d) => { if (!cancelled) setDrugCatalog(Array.isArray(d) ? d : []); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const effectiveItems = useCallback(
    (p: Pack, m: Map<string, EditItem[]>): EditItem[] => m.get(p.id) ?? cloneItems(p), [],
  );

  const recompute = useCallback((sel: Set<string>, m: Map<string, EditItem[]>) => {
    const chosen = packs.filter((p) => sel.has(p.id));
    const medications: AnaesMedication[] = [];
    const consumableRequests: AnaesConsumableRequest[] = [];
    for (const p of chosen) {
      for (const it of effectiveItems(p, m)) {
        const qty = Number(it.quantity) || 0;
        if (it.removed || !it.name.trim() || qty < 1) continue;
        if (p.kind === 'PHARMACY') {
          medications.push({
            id: uid(), category: `Anaesthesia: ${p.name}`, name: it.name.trim(),
            dose: it.dosage ?? '', unit: it.unit || 'vial', route: it.route ?? '—',
            timing: 'Theatre (intra-operative)', notes: it.notes ?? '',
          });
        } else {
          consumableRequests.push({
            name: it.name.trim(), category: it.category ?? 'ANAESTHESIA_AIRWAY',
            size: it.size ?? null, unit: it.unit || 'piece', quantity: qty, notes: `Anaesthesia pack: ${p.name}`,
          });
        }
      }
    }
    onChange({ medications, consumableRequests });
  }, [packs, effectiveItems, onChange]);

  const toggle = (id: string) => {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); recompute(next, edits); return next; });
  };
  useEffect(() => { recompute(selected, edits); /* eslint-disable-next-line */ }, [packs]);

  const mutateEdits = (packId: string, fn: (items: EditItem[]) => EditItem[]) => {
    setEdits((prev) => {
      const base = prev.get(packId) ?? cloneItems(packs.find((p) => p.id === packId)!);
      const nextItems = fn(base.map((i) => ({ ...i })));
      const next = new Map(prev); next.set(packId, nextItems);
      if (selected.has(packId)) recompute(selected, next);
      return next;
    });
  };
  const setQty = (packId: string, idx: number, q: number | '') => mutateEdits(packId, (i) => { i[idx].quantity = q; return i; });
  const toggleRemove = (packId: string, idx: number) => mutateEdits(packId, (i) => { i[idx].removed = !i[idx].removed; return i; });
  const setField = (packId: string, idx: number, f: keyof EditItem, v: string) => mutateEdits(packId, (i) => { (i[idx] as any)[f] = v; return i; });
  const addItem = (packId: string, kind: Pack['kind'], prefill?: Partial<EditItem>) =>
    mutateEdits(packId, (i) => [...i, kind === 'CONSUMABLE'
      ? { name: '', quantity: 1, unit: 'piece', category: 'ANAESTHESIA_AIRWAY', added: true, ...prefill }
      : { name: '', quantity: 1, unit: 'vial', drugType: 'ANAESTHETIC_ADJUNCT', added: true, ...prefill }]);
  const resetPack = (packId: string) => setEdits((prev) => { const n = new Map(prev); n.delete(packId); if (selected.has(packId)) recompute(selected, n); return n; });

  const pharmacyPacks = useMemo(() => packs.filter((p) => p.kind === 'PHARMACY'), [packs]);
  const consumablePacks = useMemo(() => packs.filter((p) => p.kind === 'CONSUMABLE'), [packs]);
  const viewingPack = useMemo(() => packs.find((p) => p.id === viewing) ?? null, [packs, viewing]);
  const matchTech = anaesthesiaType ? TECHNIQUE_LABEL[anaesthesiaType] : undefined;

  if (loading) return <div className="flex items-center gap-2 text-sm text-gray-500 py-3"><Loader2 className="w-4 h-4 animate-spin" /> Loading anaesthesia packs…</div>;
  if (packs.length === 0) return <p className="text-sm text-gray-500 py-2">No anaesthesia packs available yet. Add items individually below.</p>;

  const Card = ({ p }: { p: Pack }) => {
    const on = selected.has(p.id);
    const eff = effectiveItems(p, edits);
    const activeCount = eff.filter((i) => !i.removed && i.name.trim()).length;
    const edited = edits.has(p.id);
    const isMatch = p.technique && matchTech && p.technique === matchTech;
    return (
      <div className={`rounded-lg border-2 p-3 transition ${on ? 'border-purple-500 bg-purple-50' : 'border-gray-200 bg-white'}`}>
        <button type="button" onClick={() => toggle(p.id)} className="w-full text-left">
          <div className="flex items-start justify-between gap-2">
            <span className="font-medium text-gray-900">{p.name}</span>
            {on && <Check className="w-4 h-4 text-purple-600 flex-shrink-0" />}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {p.technique && <span className={`mr-1 ${isMatch ? 'text-purple-700 font-semibold' : ''}`}>{p.technique}</span>}·{' '}
            {activeCount} item{activeCount === 1 ? '' : 's'}{edited ? ' · edited' : ''}
            {p.description ? ` · ${p.description}` : ''}
          </div>
        </button>
        <div className="mt-2 flex items-center gap-3">
          <button type="button" onClick={() => setViewing(p.id)} className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 hover:text-purple-700"><Eye className="w-3.5 h-3.5" /> View pack content</button>
          {edited && <button type="button" onClick={() => resetPack(p.id)} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"><RotateCcw className="w-3.5 h-3.5" /> Reset</button>}
        </div>
      </div>
    );
  };

  const Section = ({ title, icon, list }: { title: string; icon: React.ReactNode; list: Pack[] }) => {
    if (list.length === 0) return null;
    const sorted = [...list].sort((a, b) => {
      const am = a.technique === matchTech ? 0 : 1; const bm = b.technique === matchTech ? 0 : 1;
      return am - bm || a.name.localeCompare(b.name);
    });
    return (
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">{icon}{title}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{sorted.map((p) => <Card key={p.id} p={p} />)}</div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Apply a pack to add its items in one tap. <span className="font-medium">Drug packs</span> go to Pharmacy;
        <span className="font-medium"> consumable packs</span> (airway, monitoring, ECG electrodes, needles) go to the Consumable Pack Provider.
        {matchTech && <> Packs matching <span className="font-semibold text-purple-700">{matchTech}</span> are shown first.</>}
      </p>
      <Section title="Anaesthesia drug packs → Pharmacy" icon={<Pill className="w-4 h-4 text-purple-600" />} list={pharmacyPacks} />
      <Section title="Anaesthesia consumable packs → Pack Provider" icon={<Package className="w-4 h-4 text-teal-600" />} list={consumablePacks} />

      {viewingPack && (
        <PackContentModal
          pack={viewingPack} items={effectiveItems(viewingPack, edits)} selected={selected.has(viewingPack.id)}
          catalog={viewingPack.kind === 'CONSUMABLE' ? consumableCatalog : drugCatalog}
          onClose={() => setViewing(null)}
          onApply={() => { if (!selected.has(viewingPack.id)) toggle(viewingPack.id); }}
          onQty={(idx, q) => setQty(viewingPack.id, idx, q)}
          onToggleRemove={(idx) => toggleRemove(viewingPack.id, idx)}
          onField={(idx, f, v) => setField(viewingPack.id, idx, f, v)}
          onAdd={() => addItem(viewingPack.id, viewingPack.kind)}
          onAddPrefill={(pre) => addItem(viewingPack.id, viewingPack.kind, pre)}
          onReset={() => resetPack(viewingPack.id)} edited={edits.has(viewingPack.id)}
        />
      )}
    </div>
  );
}

function catalogLabel(t: any, isPharmacy: boolean): string {
  return isPharmacy
    ? `${t.name}${t.defaultDosage ? ` — ${t.defaultDosage}` : ''}${t.unit ? ` (${t.unit})` : ''}`
    : `${t.name}${t.size ? ` — ${t.size}` : ''}${t.unit ? ` (${t.unit})` : ''}`;
}
function catalogToPrefill(t: any, isPharmacy: boolean): Partial<EditItem> {
  return isPharmacy
    ? { name: t.name, quantity: t.defaultQuantity ?? 1, unit: t.unit ?? 'vial', drugType: t.type ?? 'ANAESTHETIC_ADJUNCT', dosage: t.defaultDosage ?? null, route: t.defaultRoute ?? null, added: true }
    : { name: t.name, quantity: t.defaultQuantity ?? 1, unit: t.unit ?? 'piece', category: t.category ?? 'ANAESTHESIA_AIRWAY', size: t.size ?? null, added: true };
}

function PackContentModal({
  pack, items, selected, catalog, onClose, onApply, onQty, onToggleRemove, onField, onAdd, onAddPrefill, onReset, edited,
}: {
  pack: Pack; items: EditItem[]; selected: boolean; catalog: any[];
  onClose: () => void; onApply: () => void;
  onQty: (idx: number, q: number | '') => void; onToggleRemove: (idx: number) => void;
  onField: (idx: number, f: keyof EditItem, v: string) => void; onAdd: () => void;
  onAddPrefill: (pre: Partial<EditItem>) => void; onReset: () => void; edited: boolean;
}) {
  const isPharmacy = pack.kind === 'PHARMACY';
  const catalogGroups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const t of catalog) {
      const label = String((isPharmacy ? t.type : t.category) || 'OTHER').replace(/_/g, ' ');
      if (!map.has(label)) map.set(label, []); map.get(label)!.push(t);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, its]) => ({ label, items: its.sort((x: any, y: any) => String(x.name).localeCompare(String(y.name))) }));
  }, [catalog, isPharmacy]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              {isPharmacy ? <Pill className="w-4 h-4 text-purple-600" /> : <Package className="w-4 h-4 text-teal-600" />}
              <h3 className="font-semibold text-gray-900">{pack.name}</h3>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {pack.technique} · {isPharmacy ? 'Drug pack — wired to Pharmacy' : 'Consumable pack — wired to Pack Provider'} · edits apply to this case only
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto p-4 space-y-2">
          {items.map((it, idx) => (
            <div key={idx} className={`rounded-lg border p-2.5 ${it.removed ? 'border-gray-100 bg-gray-50 opacity-60' : 'border-gray-200'}`}>
              <div className="flex items-center gap-2">
                <input type="text" value={it.name} placeholder={it.added ? 'New item name…' : ''}
                  onChange={(e) => onField(idx, 'name', e.target.value)} disabled={it.removed}
                  className={`input-field flex-1 text-sm py-1 ${it.removed ? 'line-through' : ''}`} />
                <input type="number" min={0} value={it.quantity} disabled={it.removed}
                  onChange={(e) => { const raw = e.target.value; onQty(idx, raw === '' ? '' : Math.max(0, parseInt(raw, 10) || 0)); }}
                  className="input-field w-14 text-sm py-1 text-center" />
                <input type="text" value={it.unit} onChange={(e) => onField(idx, 'unit', e.target.value)} disabled={it.removed}
                  className="input-field w-16 text-sm py-1" aria-label="unit" />
                <button type="button" onClick={() => onToggleRemove(idx)} title={it.removed ? 'Restore' : 'Remove'}
                  className={`p-1.5 rounded ${it.removed ? 'text-purple-600 hover:bg-purple-50' : 'text-red-500 hover:bg-red-50'}`}>
                  {it.removed ? <RotateCcw className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
              {!it.removed && (
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {isPharmacy ? (<>
                    <input type="text" value={it.dosage ?? ''} placeholder="dose" onChange={(e) => onField(idx, 'dosage', e.target.value)} className="input-field text-xs py-0.5 w-40" />
                    <input type="text" value={it.route ?? ''} placeholder="route" onChange={(e) => onField(idx, 'route', e.target.value)} className="input-field text-xs py-0.5 w-32" />
                  </>) : (
                    <input type="text" value={it.size ?? ''} placeholder="size" onChange={(e) => onField(idx, 'size', e.target.value)} className="input-field text-xs py-0.5 w-40" />
                  )}
                </div>
              )}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <select aria-label="Add from catalog" className="input-field text-sm py-1 max-w-[24rem]" value=""
              onChange={(e) => { const t = catalog.find((c) => c.id === e.target.value); if (t) onAddPrefill(catalogToPrefill(t, isPharmacy)); e.currentTarget.value = ''; }}>
              <option value="">{catalog.length ? `+ Add ${isPharmacy ? 'drug' : 'consumable'} from catalog…` : 'Catalog empty — use custom'}</option>
              {catalogGroups.map((g) => (<optgroup key={g.label} label={g.label}>{g.items.map((t: any) => <option key={t.id} value={t.id}>{catalogLabel(t, isPharmacy)}</option>)}</optgroup>))}
            </select>
            <button type="button" onClick={onAdd} className="inline-flex items-center gap-1 text-sm font-medium text-purple-600 hover:text-purple-700"><Plus className="w-4 h-4" /> Add custom item</button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 p-4 border-t border-gray-100">
          <div className="text-xs text-gray-500">{edited && <button type="button" onClick={onReset} className="inline-flex items-center gap-1 hover:text-gray-700"><RotateCcw className="w-3.5 h-3.5" /> Reset to default</button>}</div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">Close</button>
            {!selected
              ? <button type="button" onClick={() => { onApply(); onClose(); }} className="text-sm text-white px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700">Apply this pack</button>
              : <span className="inline-flex items-center gap-1 text-sm text-purple-600 font-medium"><Check className="w-4 h-4" /> Applied</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
