'use client';

/**
 * Reusable pre-pack selectors for surgery booking.
 *
 * Renders the two sections used at booking time:
 *  1. Surgical Consumables  → for the Consumable Pack Provider
 *  2. Drugs & IV Fluids / Active Wound Dressing Agents → for Pharmacy
 *
 * Used by both the regular surgery booking page and the Emergency Surgery
 * Booking page so the consumable pack provider and pharmacy receive the
 * shopping list either way.
 *
 * Pure presentation + local state — emits the booking-ready payload via
 * the `onChange` callback on every change.
 */

import { useEffect, useState } from 'react';
import { Package, Pill, Siren } from 'lucide-react';

export interface ConsumableRequest {
  templateId: string;
  name: string;
  category: string;
  size?: string | null;
  unit: string;
  quantity: number;
  notes?: string | null;
}

export interface DrugDressingRequest {
  templateId: string;
  name: string;
  type: string;
  dosage?: string | null;
  route?: string | null;
  quantity: number;
  unit: string;
  notes?: string | null;
}

export interface PrePackPayload {
  consumableRequests: ConsumableRequest[];
  drugDressingRequests: DrugDressingRequest[];
}

interface Props {
  /** Optional surgical specialty — filters the consumables catalog */
  subspecialty?: string;
  /** Emit a red "Emergency" treatment in the header/section styling */
  emergency?: boolean;
  /** Fired whenever the user changes a selection. Always called with the full payload. */
  onChange: (payload: PrePackPayload) => void;
}

export default function SurgeryPrePackSelectors({ subspecialty, emergency, onChange }: Props) {
  const [consumableTemplates, setConsumableTemplates] = useState<any[]>([]);
  const [consumableLoading, setConsumableLoading] = useState(false);
  const [selectedConsumables, setSelectedConsumables] = useState<Record<string, { quantity: number; notes?: string }>>({});

  const [drugTemplates, setDrugTemplates] = useState<any[]>([]);
  const [drugLoading, setDrugLoading] = useState(false);
  const [selectedDrugs, setSelectedDrugs] = useState<
    Record<string, { quantity: number; dosage?: string; route?: string; notes?: string }>
  >({});

  // ── Data loading
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setConsumableLoading(true);
      try {
        const url = `/api/admin/consumable-templates?activeOnly=true${
          subspecialty ? `&specialty=${encodeURIComponent(subspecialty)}` : ''
        }`;
        const r = await fetch(url);
        if (r.ok && !cancelled) setConsumableTemplates(await r.json());
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setConsumableLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [subspecialty]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setDrugLoading(true);
      try {
        const r = await fetch('/api/admin/drug-dressing-templates?activeOnly=true');
        if (r.ok && !cancelled) setDrugTemplates(await r.json());
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setDrugLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // ── Emit payload whenever a selection changes
  useEffect(() => {
    const consumableRequests: ConsumableRequest[] = Object.entries(selectedConsumables).map(([id, sel]) => {
      const t = consumableTemplates.find((x) => x.id === id);
      return {
        templateId: id,
        name: t?.name ?? '',
        category: t?.category ?? 'OTHER',
        size: t?.size ?? null,
        unit: t?.unit ?? 'piece',
        quantity: Math.max(1, sel.quantity || 1),
        notes: sel.notes ?? null,
      };
    }).filter((c) => c.name);

    const drugDressingRequests: DrugDressingRequest[] = Object.entries(selectedDrugs).map(([id, sel]) => {
      const t = drugTemplates.find((x) => x.id === id);
      return {
        templateId: id,
        name: t?.name ?? '',
        type: t?.type ?? 'OTHER',
        dosage: sel.dosage ?? t?.defaultDosage ?? null,
        route: sel.route ?? t?.defaultRoute ?? null,
        quantity: Math.max(1, sel.quantity || 1),
        unit: t?.unit ?? 'vial',
        notes: sel.notes ?? null,
      };
    }).filter((d) => d.name);

    onChange({ consumableRequests, drugDressingRequests });
  }, [selectedConsumables, selectedDrugs, consumableTemplates, drugTemplates, onChange]);

  // ── Toggle helpers
  function toggleConsumable(t: any) {
    setSelectedConsumables((p) => {
      const next = { ...p };
      if (next[t.id]) delete next[t.id];
      else next[t.id] = { quantity: t.defaultQuantity ?? 1 };
      return next;
    });
  }
  function setConsumableQty(id: string, q: number) {
    setSelectedConsumables((p) => ({ ...p, [id]: { ...p[id], quantity: Math.max(1, q) } }));
  }

  function toggleDrug(t: any) {
    setSelectedDrugs((p) => {
      const next = { ...p };
      if (next[t.id]) delete next[t.id];
      else next[t.id] = { quantity: t.defaultQuantity ?? 1, dosage: t.defaultDosage, route: t.defaultRoute };
      return next;
    });
  }
  function setDrugField(id: string, field: 'quantity' | 'dosage' | 'route' | 'notes', value: any) {
    setSelectedDrugs((p) => ({
      ...p,
      [id]: { ...p[id], [field]: field === 'quantity' ? Math.max(1, Number(value) || 1) : value },
    }));
  }

  const wrapClass = emergency
    ? 'bg-white rounded-lg shadow p-6 border-2 border-red-300'
    : 'bg-white rounded-lg shadow p-6';

  return (
    <>
      {/* Surgical Consumables — Pre-pack plan for Consumable Pack Provider */}
      <div className={wrapClass}>
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <Package className={`w-6 h-6 ${emergency ? 'text-red-600' : 'text-primary-600'}`} />
          <h2 className="text-xl font-semibold">Surgical Consumables</h2>
          {emergency && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase bg-red-600 text-white px-2 py-0.5 rounded-full">
              <Siren className="w-3 h-3" /> Emergency
            </span>
          )}
          <span className="ml-auto text-xs text-gray-500">
            Pre-pack list for the night before surgery (visible to Consumable Pack Provider).
          </span>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Tick each item the patient needs. Quantities default to typical usage and can be edited.
          {subspecialty ? ` Filtered to ${subspecialty}.` : ''}
        </p>
        {consumableLoading ? (
          <div className="text-sm text-gray-500">Loading consumables…</div>
        ) : consumableTemplates.length === 0 ? (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
            No consumables in catalog yet. An admin can seed the starter list at{' '}
            <code className="mx-1 bg-amber-100 px-1 rounded">POST /api/admin/seed-surgical-catalog</code>
            or curate items from{' '}
            <a href="/dashboard/admin/surgical-catalog" className="underline">Admin → Surgical Catalog</a>.
          </div>
        ) : (
          <div className="space-y-4 max-h-[460px] overflow-y-auto pr-2">
            {Object.entries(
              consumableTemplates.reduce((acc: Record<string, any[]>, t: any) => {
                (acc[t.category] ||= []).push(t);
                return acc;
              }, {}),
            ).map(([cat, items]: any) => (
              <div key={cat}>
                <div className="font-medium text-sm text-gray-800 mb-2">{cat.replaceAll('_', ' ')}</div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {items.map((t: any) => {
                    const sel = selectedConsumables[t.id];
                    return (
                      <div
                        key={t.id}
                        className={`flex items-center gap-2 border rounded px-3 py-2 ${
                          sel ? 'bg-primary-50 border-primary-200' : 'border-gray-200'
                        }`}
                      >
                        <input
                          aria-label={`Select ${t.name}`}
                          title={`Select ${t.name}`}
                          type="checkbox"
                          checked={!!sel}
                          onChange={() => toggleConsumable(t)}
                          className="w-4 h-4"
                        />
                        <div className="flex-1 text-sm">
                          <div className="font-medium">
                            {t.name}
                            {t.size ? ` — ${t.size}` : ''}
                          </div>
                          <div className="text-xs text-gray-500">
                            {t.unit}
                            {t.specialty ? ` · ${t.specialty}` : ''}
                          </div>
                        </div>
                        {sel && (
                          <input
                            aria-label={`Quantity for ${t.name}`}
                            title="Quantity"
                            placeholder="Qty"
                            type="number"
                            min={1}
                            value={sel.quantity}
                            onChange={(ev) => setConsumableQty(t.id, parseInt(ev.target.value, 10) || 1)}
                            className="w-16 border rounded px-1 py-0.5 text-sm"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 text-xs text-gray-600">
          Selected items: {Object.keys(selectedConsumables).length}
        </div>
      </div>

      {/* Drugs and IV Fluids / Active Wound Dressing Agents — Pharmacy pre-pack */}
      <div className={wrapClass}>
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <Pill className={`w-6 h-6 ${emergency ? 'text-red-600' : 'text-primary-600'}`} />
          <h2 className="text-xl font-semibold">Drugs and IV Fluids / Active Wound Dressing Agents</h2>
          {emergency && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase bg-red-600 text-white px-2 py-0.5 rounded-full">
              <Siren className="w-3 h-3" /> Emergency
            </span>
          )}
          <span className="ml-auto text-xs text-gray-500">Visible to Pharmacy for packing.</span>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Select antibiotics, IV fluids, dressings and wound-care agents needed for this case. Edit dosage / route / quantity per item.
        </p>
        {drugLoading ? (
          <div className="text-sm text-gray-500">Loading drugs &amp; dressings…</div>
        ) : drugTemplates.length === 0 ? (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
            No drugs/dressings in catalog yet. Admin can seed via{' '}
            <code className="mx-1 bg-amber-100 px-1 rounded">POST /api/admin/seed-surgical-catalog</code>.
          </div>
        ) : (
          <div className="space-y-4 max-h-[460px] overflow-y-auto pr-2">
            {Object.entries(
              drugTemplates.reduce((acc: Record<string, any[]>, t: any) => {
                (acc[t.type] ||= []).push(t);
                return acc;
              }, {}),
            ).map(([typ, items]: any) => (
              <div key={typ}>
                <div className="font-medium text-sm text-gray-800 mb-2">{typ.replaceAll('_', ' ')}</div>
                <div className="space-y-2">
                  {items.map((t: any) => {
                    const sel = selectedDrugs[t.id];
                    return (
                      <div
                        key={t.id}
                        className={`border rounded px-3 py-2 ${
                          sel ? 'bg-primary-50 border-primary-200' : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            aria-label={`Select ${t.name}`}
                            title={`Select ${t.name}`}
                            type="checkbox"
                            checked={!!sel}
                            onChange={() => toggleDrug(t)}
                            className="w-4 h-4"
                          />
                          <div className="flex-1 text-sm font-medium">
                            {t.name}
                            {t.isControlled ? (
                              <span className="ml-2 text-[10px] uppercase bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                                Controlled
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-gray-500">{t.unit}</div>
                        </div>
                        {sel && (
                          <div className="grid sm:grid-cols-4 gap-2 mt-2 ml-6 text-xs">
                            <input
                              className="border rounded px-1 py-0.5"
                              placeholder="Dosage"
                              value={sel.dosage || ''}
                              onChange={(e) => setDrugField(t.id, 'dosage', e.target.value)}
                            />
                            <input
                              className="border rounded px-1 py-0.5"
                              placeholder="Route"
                              value={sel.route || ''}
                              onChange={(e) => setDrugField(t.id, 'route', e.target.value)}
                            />
                            <input
                              aria-label={`Quantity for ${t.name}`}
                              title="Quantity"
                              placeholder="Qty"
                              type="number"
                              min={1}
                              className="border rounded px-1 py-0.5"
                              value={sel.quantity}
                              onChange={(e) => setDrugField(t.id, 'quantity', e.target.value)}
                            />
                            <input
                              className="border rounded px-1 py-0.5"
                              placeholder="Notes"
                              value={sel.notes || ''}
                              onChange={(e) => setDrugField(t.id, 'notes', e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 text-xs text-gray-600">Selected: {Object.keys(selectedDrugs).length}</div>
      </div>
    </>
  );
}
