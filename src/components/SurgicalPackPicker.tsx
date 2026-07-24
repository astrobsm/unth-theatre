'use client';

/**
 * SurgicalPackPicker — lets a surgeon apply one or more named packs at booking
 * instead of ticking items one by one. Selecting a pack contributes its items
 * to the outgoing consumable/pharmacy request arrays; the booking form merges
 * these with anything the surgeon added by hand and with the mandatory base
 * pack (which the server always attaches).
 *
 * Consumable packs wire to the pack providers; pharmacy packs (antibiotics, IV
 * fluids, adjuncts) wire to pharmacy. Only ACTIVE packs are offered, filtered by
 * subspecialty when one is known.
 *
 * "View pack content": each pack has a button that opens its items in a modal
 * where the surgeon can change quantities, remove items, or add extras for THIS
 * case before booking. Edits are per-booking (they never alter the master pack)
 * and flow straight into the requests sent to the pack providers / pharmacy.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Package, Pill, Check, Loader2, Eye, Plus, Trash2, X, RotateCcw } from 'lucide-react';

export interface PackConsumableItem {
  templateId?: string | null;
  name: string;
  category?: string | null;
  size?: string | null;
  unit?: string | null;
  quantity: number;
  notes?: string | null;
}
export interface PackDrugItem {
  templateId?: string | null;
  name: string;
  type?: string | null;
  dosage?: string | null;
  route?: string | null;
  unit?: string | null;
  quantity: number;
  notes?: string | null;
}
export interface PackPickerPayload {
  consumableRequests: PackConsumableItem[];
  drugDressingRequests: PackDrugItem[];
}

interface PackItem {
  name: string; quantity: number; unit: string;
  category?: string | null; size?: string | null;
  drugType?: string | null; dosage?: string | null; route?: string | null;
}
interface Pack {
  id: string; name: string; subspecialty: string;
  kind: 'CONSUMABLE' | 'PHARMACY'; description?: string | null;
  items: PackItem[];
}

// Per-booking editable copy of a pack item (never persisted to the master pack).
interface EditItem {
  name: string; quantity: number; unit: string;
  category?: string | null; size?: string | null;
  drugType?: string | null; dosage?: string | null; route?: string | null;
  removed?: boolean; // soft-removed for this case
  added?: boolean;   // surgeon-added extra for this case
}

const cloneItems = (p: Pack): EditItem[] =>
  p.items.map((it) => ({
    name: it.name, quantity: it.quantity, unit: it.unit || (p.kind === 'PHARMACY' ? 'vial' : 'piece'),
    category: it.category ?? null, size: it.size ?? null,
    drugType: it.drugType ?? null, dosage: it.dosage ?? null, route: it.route ?? null,
  }));

export default function SurgicalPackPicker({
  subspecialty,
  emergency,
  onChange,
}: {
  subspecialty?: string;
  emergency?: boolean;
  onChange: (payload: PackPickerPayload) => void;
}) {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Per-pack per-booking edits (keyed by pack id). Absent => use master items as-is.
  const [edits, setEdits] = useState<Map<string, EditItem[]>>(new Map());
  const [viewing, setViewing] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams();
    if (subspecialty) qs.set('subspecialty', subspecialty);
    fetch(`/api/surgical-packs?${qs.toString()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { packs: [] }))
      .then((d) => { if (!cancelled) setPacks(Array.isArray(d.packs) ? d.packs : []); })
      .catch(() => { if (!cancelled) setPacks([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [subspecialty]);

  // The effective (possibly-edited) items for a pack.
  const effectiveItems = useCallback(
    (p: Pack, editMap: Map<string, EditItem[]>): EditItem[] => editMap.get(p.id) ?? cloneItems(p),
    [],
  );

  // Emit the merged item arrays from the current selection + edits.
  const recompute = useCallback((sel: Set<string>, editMap: Map<string, EditItem[]>) => {
    const chosen = packs.filter((p) => sel.has(p.id));
    const consumableRequests: PackConsumableItem[] = [];
    const drugDressingRequests: PackDrugItem[] = [];
    for (const p of chosen) {
      for (const it of effectiveItems(p, editMap)) {
        if (it.removed || !it.name.trim()) continue;
        const qty = Math.max(1, Number(it.quantity) || 1);
        if (p.kind === 'CONSUMABLE') {
          consumableRequests.push({
            name: it.name.trim(), category: it.category ?? 'OTHER', size: it.size ?? null,
            unit: it.unit || 'piece', quantity: qty, notes: `Pack: ${p.name}`,
          });
        } else {
          drugDressingRequests.push({
            name: it.name.trim(), type: it.drugType ?? 'OTHER', dosage: it.dosage ?? null,
            route: it.route ?? null, unit: it.unit || 'vial', quantity: qty, notes: `Pack: ${p.name}`,
          });
        }
      }
    }
    onChange({ consumableRequests, drugDressingRequests });
  }, [packs, effectiveItems, onChange]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      recompute(next, edits);
      return next;
    });
  };

  // Re-emit if the pack list changes underneath a selection (e.g. subspecialty change).
  useEffect(() => { recompute(selected, edits); /* eslint-disable-next-line */ }, [packs]);

  // ---- editing handlers (operate on a working copy for one pack) ----
  const mutateEdits = (packId: string, fn: (items: EditItem[]) => EditItem[]) => {
    setEdits((prev) => {
      const base = prev.get(packId) ?? cloneItems(packs.find((p) => p.id === packId)!);
      const nextItems = fn(base.map((i) => ({ ...i })));
      const next = new Map(prev);
      next.set(packId, nextItems);
      // If the pack is applied, its edits change the outgoing payload immediately.
      if (selected.has(packId)) recompute(selected, next);
      return next;
    });
  };
  const setQty = (packId: string, idx: number, q: number) =>
    mutateEdits(packId, (items) => { items[idx].quantity = Math.max(1, q || 1); return items; });
  const toggleRemove = (packId: string, idx: number) =>
    mutateEdits(packId, (items) => { items[idx].removed = !items[idx].removed; return items; });
  const setField = (packId: string, idx: number, field: keyof EditItem, value: string) =>
    mutateEdits(packId, (items) => { (items[idx] as any)[field] = value; return items; });
  const addItem = (packId: string, kind: Pack['kind']) =>
    mutateEdits(packId, (items) => [
      ...items,
      kind === 'CONSUMABLE'
        ? { name: '', quantity: 1, unit: 'piece', category: 'OTHER', added: true }
        : { name: '', quantity: 1, unit: 'vial', drugType: 'OTHER', added: true },
    ]);
  const resetPack = (packId: string) =>
    setEdits((prev) => {
      const next = new Map(prev);
      next.delete(packId);
      if (selected.has(packId)) recompute(selected, next);
      return next;
    });

  const consumablePacks = useMemo(() => packs.filter((p) => p.kind === 'CONSUMABLE'), [packs]);
  const pharmacyPacks = useMemo(() => packs.filter((p) => p.kind === 'PHARMACY'), [packs]);
  const viewingPack = useMemo(() => packs.find((p) => p.id === viewing) ?? null, [packs, viewing]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-3">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading packs…
      </div>
    );
  }
  if (packs.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-2">
        No packs available{subspecialty ? ` for ${subspecialty}` : ''} yet. You can still add items
        individually below; the mandatory base pack is always included.
      </p>
    );
  }

  const activeColor = emergency ? 'border-red-500 bg-red-50' : 'border-primary-500 bg-primary-50';

  const Card = ({ p }: { p: Pack }) => {
    const on = selected.has(p.id);
    const eff = effectiveItems(p, edits);
    const activeCount = eff.filter((i) => !i.removed && i.name.trim()).length;
    const edited = edits.has(p.id);
    return (
      <div
        className={`rounded-lg border-2 p-3 transition ${on ? activeColor : 'border-gray-200 bg-white'}`}
      >
        <button type="button" onClick={() => toggle(p.id)} className="w-full text-left">
          <div className="flex items-start justify-between gap-2">
            <span className="font-medium text-gray-900">{p.name}</span>
            {on && <Check className="w-4 h-4 text-primary-600 flex-shrink-0" />}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {activeCount} item{activeCount === 1 ? '' : 's'}
            {edited ? ' · edited for this case' : ''}
            {p.description ? ` · ${p.description}` : ''}
          </div>
        </button>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setViewing(p.id)}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
          >
            <Eye className="w-3.5 h-3.5" /> View pack content
          </button>
          {edited && (
            <button
              type="button"
              onClick={() => resetPack(p.id)}
              className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          )}
        </div>
      </div>
    );
  };

  const Section = ({ title, icon, list }: { title: string; icon: React.ReactNode; list: Pack[] }) =>
    list.length === 0 ? null : (
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">{icon}{title}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {list.map((p) => <Card key={p.id} p={p} />)}
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Applying a pack adds all its items in one tap. Use <span className="font-medium">View pack content</span> to
        change quantities, remove items or add extras for this case. The mandatory base pack is always sent regardless.
      </p>
      <Section title="Consumable packs" icon={<Package className="w-4 h-4 text-teal-600" />} list={consumablePacks} />
      <Section title="Pharmacy packs" icon={<Pill className="w-4 h-4 text-purple-600" />} list={pharmacyPacks} />

      {viewingPack && (
        <PackContentModal
          pack={viewingPack}
          items={effectiveItems(viewingPack, edits)}
          selected={selected.has(viewingPack.id)}
          emergency={emergency}
          onClose={() => setViewing(null)}
          onApply={() => { if (!selected.has(viewingPack.id)) toggle(viewingPack.id); }}
          onQty={(idx, q) => setQty(viewingPack.id, idx, q)}
          onToggleRemove={(idx) => toggleRemove(viewingPack.id, idx)}
          onField={(idx, f, v) => setField(viewingPack.id, idx, f, v)}
          onAdd={() => addItem(viewingPack.id, viewingPack.kind)}
          onReset={() => resetPack(viewingPack.id)}
          edited={edits.has(viewingPack.id)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal: view & edit a pack's contents for this booking.
// ---------------------------------------------------------------------------
function PackContentModal({
  pack, items, selected, emergency, onClose, onApply, onQty, onToggleRemove, onField, onAdd, onReset, edited,
}: {
  pack: Pack;
  items: EditItem[];
  selected: boolean;
  emergency?: boolean;
  onClose: () => void;
  onApply: () => void;
  onQty: (idx: number, q: number) => void;
  onToggleRemove: (idx: number) => void;
  onField: (idx: number, field: keyof EditItem, value: string) => void;
  onAdd: () => void;
  onReset: () => void;
  edited: boolean;
}) {
  const isPharmacy = pack.kind === 'PHARMACY';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              {isPharmacy ? <Pill className="w-4 h-4 text-purple-600" /> : <Package className="w-4 h-4 text-teal-600" />}
              <h3 className="font-semibold text-gray-900">{pack.name}</h3>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {pack.subspecialty} · {isPharmacy ? 'Pharmacy pack — wired to Pharmacy' : 'Consumable pack — wired to pack providers'}
              {' · '}edits apply to this case only
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* items */}
        <div className="overflow-y-auto p-4 space-y-2">
          {items.map((it, idx) => (
            <div
              key={idx}
              className={`rounded-lg border p-2.5 ${it.removed ? 'border-gray-100 bg-gray-50 opacity-60' : 'border-gray-200'}`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={it.name}
                  placeholder={it.added ? 'New item name…' : ''}
                  onChange={(e) => onField(idx, 'name', e.target.value)}
                  className={`input-field flex-1 text-sm py-1 ${it.removed ? 'line-through' : ''}`}
                  disabled={it.removed}
                />
                <input
                  type="number"
                  min={1}
                  value={it.quantity}
                  onChange={(e) => onQty(idx, parseInt(e.target.value, 10))}
                  className="input-field w-16 text-sm py-1 text-center"
                  disabled={it.removed}
                />
                <input
                  type="text"
                  value={it.unit}
                  onChange={(e) => onField(idx, 'unit', e.target.value)}
                  className="input-field w-20 text-sm py-1"
                  disabled={it.removed}
                  aria-label="unit"
                />
                <button
                  type="button"
                  onClick={() => onToggleRemove(idx)}
                  title={it.removed ? 'Restore item' : 'Remove item'}
                  className={`p-1.5 rounded ${it.removed ? 'text-primary-600 hover:bg-primary-50' : 'text-red-500 hover:bg-red-50'}`}
                >
                  {it.removed ? <RotateCcw className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
              {/* secondary detail line */}
              {!it.removed && (
                <div className="flex flex-wrap gap-2 mt-1.5 pl-0.5">
                  {isPharmacy ? (
                    <>
                      <input
                        type="text" value={it.dosage ?? ''} placeholder="dosage"
                        onChange={(e) => onField(idx, 'dosage', e.target.value)}
                        className="input-field text-xs py-0.5 w-40"
                      />
                      <input
                        type="text" value={it.route ?? ''} placeholder="route"
                        onChange={(e) => onField(idx, 'route', e.target.value)}
                        className="input-field text-xs py-0.5 w-32"
                      />
                      <span className="text-[11px] text-gray-400 self-center">
                        {(it.drugType ?? 'OTHER').replace(/_/g, ' ').toLowerCase()}
                      </span>
                    </>
                  ) : (
                    <>
                      <input
                        type="text" value={it.size ?? ''} placeholder="size"
                        onChange={(e) => onField(idx, 'size', e.target.value)}
                        className="input-field text-xs py-0.5 w-40"
                      />
                      <span className="text-[11px] text-gray-400 self-center">
                        {(it.category ?? 'OTHER').replace(/_/g, ' ').toLowerCase()}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700 mt-1"
          >
            <Plus className="w-4 h-4" /> Add item
          </button>
        </div>

        {/* footer */}
        <div className="flex items-center justify-between gap-3 p-4 border-t border-gray-100">
          <div className="text-xs text-gray-500">
            {edited && (
              <button type="button" onClick={onReset} className="inline-flex items-center gap-1 hover:text-gray-700">
                <RotateCcw className="w-3.5 h-3.5" /> Reset to default
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">Close</button>
            {!selected ? (
              <button
                type="button"
                onClick={() => { onApply(); onClose(); }}
                className={`text-sm text-white px-4 py-2 rounded-lg ${emergency ? 'bg-red-600 hover:bg-red-700' : 'btn-primary'}`}
              >
                Apply this pack
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 text-sm text-primary-600 font-medium">
                <Check className="w-4 h-4" /> Applied
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
