'use client';

/**
 * SurgicalPackPicker — lets a surgeon apply one or more named packs at booking
 * instead of ticking items one by one. Selecting a pack contributes its items
 * to the outgoing consumable/pharmacy request arrays; the booking form merges
 * these with anything the surgeon added by hand and with the mandatory base
 * pack (which the server always attaches).
 *
 * Consumable packs wire to the pack providers; pharmacy packs wire to pharmacy.
 * Only ACTIVE packs are offered. Filtered by subspecialty when one is known.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Package, Pill, Check, Loader2 } from 'lucide-react';

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

  // Emit the merged item arrays whenever the selection changes.
  const emit = useCallback((sel: Set<string>) => {
    const chosen = packs.filter((p) => sel.has(p.id));
    const consumableRequests: PackConsumableItem[] = [];
    const drugDressingRequests: PackDrugItem[] = [];
    for (const p of chosen) {
      for (const it of p.items) {
        if (p.kind === 'CONSUMABLE') {
          consumableRequests.push({
            name: it.name, category: it.category ?? 'OTHER', size: it.size ?? null,
            unit: it.unit, quantity: it.quantity, notes: `Pack: ${p.name}`,
          });
        } else {
          drugDressingRequests.push({
            name: it.name, type: it.drugType ?? 'OTHER', dosage: it.dosage ?? null,
            route: it.route ?? null, unit: it.unit, quantity: it.quantity, notes: `Pack: ${p.name}`,
          });
        }
      }
    }
    onChange({ consumableRequests, drugDressingRequests });
  }, [packs, onChange]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      emit(next);
      return next;
    });
  };

  // Re-emit if the pack list changes underneath a selection (e.g. subspecialty change).
  useEffect(() => { emit(selected); /* eslint-disable-next-line */ }, [packs]);

  const consumablePacks = useMemo(() => packs.filter((p) => p.kind === 'CONSUMABLE'), [packs]);
  const pharmacyPacks = useMemo(() => packs.filter((p) => p.kind === 'PHARMACY'), [packs]);

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

  const Section = ({ title, icon, list }: { title: string; icon: React.ReactNode; list: Pack[] }) =>
    list.length === 0 ? null : (
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">{icon}{title}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {list.map((p) => {
            const on = selected.has(p.id);
            return (
              <button
                type="button"
                key={p.id}
                onClick={() => toggle(p.id)}
                className={`text-left rounded-lg border-2 p-3 transition ${
                  on
                    ? emergency ? 'border-red-500 bg-red-50' : 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-gray-900">{p.name}</span>
                  {on && <Check className="w-4 h-4 text-primary-600 flex-shrink-0" />}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {p.items.length} item{p.items.length === 1 ? '' : 's'}
                  {p.description ? ` · ${p.description}` : ''}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Applying a pack adds all its items in one tap. You can still add extras below, and the
        mandatory base pack is always sent regardless.
      </p>
      <Section title="Consumable packs" icon={<Package className="w-4 h-4 text-teal-600" />} list={consumablePacks} />
      <Section title="Pharmacy packs" icon={<Pill className="w-4 h-4 text-purple-600" />} list={pharmacyPacks} />
    </div>
  );
}
