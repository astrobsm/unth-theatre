'use client';

/**
 * What this case needs by name — sutures, catheters, drains, mesh and the
 * rest — chosen from a catalogue rather than typed into a box.
 *
 * WHY A CATALOGUE. Free text is how "3/0 nylon" becomes four items to the
 * store keeper and four lines to bill. Worse, a pack made up against a typo
 * is a pack that is wrong in theatre, which is discovered with the patient
 * already asleep.
 *
 * WHY THERE IS STILL AN "OTHER" BOX. A catalogue that cannot be added to is
 * one surgeons route around, and the way they route around it is by writing
 * requirements in the notes where no store keeper reads them. So anything
 * genuinely new is added here, once, and becomes catalogue for everybody
 * afterwards — the server matching it against what already exists so that
 * "3-0" does not become a second row beside "3/0".
 *
 * Lines the bundle added are shown as such and can be removed. A surgeon
 * taking something out of a standard pack has made a decision, and it is
 * recorded as one rather than silently restored.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, X, Package, AlertTriangle } from 'lucide-react';

export type CatalogueItem = {
  id: string;
  category: string;
  name: string;
  size: string | null;
  material: string | null;
  brand: string | null;
  absorbable: boolean | null;
  dispensedByPharmacy: boolean;
};

export type ChosenNeed = {
  itemId: string;
  quantity: number;
  note?: string;
  /** Added by the magnitude bundle rather than picked. */
  fromBundle?: boolean;
};

/** Order matters: this is the order a surgeon thinks in. */
export const CATEGORY_LABELS: { key: string; label: string }[] = [
  { key: 'SUTURE', label: 'Sutures' },
  { key: 'GLOVES', label: 'Gloves' },
  { key: 'URETHRAL_CATHETER', label: 'Urethral catheters' },
  { key: 'DRAIN', label: 'Drains' },
  { key: 'CHEST_TUBE', label: 'Chest tubes' },
  { key: 'CHEST_DRAIN_BOTTLE', label: 'Chest drain bottles' },
  { key: 'MESH', label: 'Mesh' },
  { key: 'TRACHEOSTOMY_TUBE', label: 'Tracheostomy tubes' },
  { key: 'HAEMOSTATIC_AGENT', label: 'Haemostatic agents' },
  { key: 'BANDAGE', label: 'Bandages' },
  { key: 'CASTING', label: 'Casting (POP, Scotchcast)' },
  { key: 'SYRINGE', label: 'Syringes' },
  { key: 'IV_CANNULA', label: 'IV cannulae' },
  { key: 'GIVING_SET', label: 'Giving sets' },
  { key: 'PLASTER', label: 'Plaster and tape' },
  { key: 'WATER_FOR_INJECTION', label: 'Water for injection' },
  { key: 'ANTIBIOTIC', label: 'Antibiotics' },
  { key: 'LOCAL_ANAESTHETIC', label: 'Local anaesthetic' },
  { key: 'TRANSFUSION_ADJUNCT', label: 'Transfusion adjuncts' },
  { key: 'OTHER', label: 'Other' },
];

export function describeItem(i: CatalogueItem): string {
  const bits = [i.name];
  if (i.size) bits.push(i.size);
  if (i.brand) bits.push(`(${i.brand})`);
  return bits.join(' ');
}

export default function SpecialNeedsPicker({
  value,
  onChange,
}: {
  value: ChosenNeed[];
  onChange: (next: ChosenNeed[]) => void;
}) {
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [category, setCategory] = useState('SUTURE');
  const [search, setSearch] = useState('');

  // The OTHER path.
  const [newName, setNewName] = useState('');
  const [newSize, setNewSize] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/special-needs/catalogue', { credentials: 'include' });
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const data = await res.json();
      setCatalogue(data.items ?? []);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byId = useMemo(() => {
    const m = new Map<string, CatalogueItem>();
    catalogue.forEach((c) => m.set(c.id, c));
    return m;
  }, [catalogue]);

  const chosenIds = useMemo(() => new Set(value.map((v) => v.itemId)), [value]);

  const options = useMemo(
    () =>
      catalogue
        .filter((c) => c.category === category)
        .filter((c) => !chosenIds.has(c.id))
        .filter((c) =>
          search.trim() ? describeItem(c).toLowerCase().includes(search.trim().toLowerCase()) : true,
        )
        .slice(0, 200),
    [catalogue, category, chosenIds, search],
  );

  const add = (itemId: string) => {
    if (!itemId || chosenIds.has(itemId)) return;
    onChange([...value, { itemId, quantity: 1 }]);
    setSearch('');
  };

  const remove = (itemId: string) => onChange(value.filter((v) => v.itemId !== itemId));

  const setQuantity = (itemId: string, qty: number) =>
    onChange(
      value.map((v) => (v.itemId === itemId ? { ...v, quantity: Math.max(1, qty || 1) } : v)),
    );

  const addOther = async () => {
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch('/api/special-needs/catalogue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          category,
          name: newName.trim(),
          size: newSize.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data?.error ?? 'Could not add that.');
        return;
      }
      // The server hands back the existing row when this turned out to be
      // something the catalogue already had, so either way the case ends up
      // pointing at one row rather than a near-duplicate.
      const item: CatalogueItem = data.item;
      setCatalogue((prev) => (prev.some((p) => p.id === item.id) ? prev : [...prev, item]));
      add(item.id);
      setNewName('');
      setNewSize('');
    } catch {
      setAddError('Could not reach the server.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="rounded-xl border-2 border-sky-200 bg-white p-5">
      <div className="mb-3 flex items-center gap-3">
        <Package className="h-6 w-6 text-sky-600" />
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Special requirements</h2>
          <p className="text-sm text-gray-500">
            What this case needs by name. The base pack for the operative magnitude is added
            automatically — this is everything on top of it.
          </p>
        </div>
      </div>

      {loadError && (
        <p className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          The catalogue could not be loaded. You can still book the case; tell the store what is
          needed by hand.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setSearch('');
          }}
          className="input-field"
          title="Category of special requirement"
          aria-label="Category of special requirement"
        >
          {CATEGORY_LABELS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search within this category…"
          className="input-field"
          autoComplete="off"
          aria-label="Search the catalogue"
        />
      </div>

      <select
        value=""
        onChange={(e) => add(e.target.value)}
        className="input-field mt-2"
        title="Add an item to this case"
        aria-label="Add an item to this case"
      >
        <option value="">— Add item —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {describeItem(o)}
            {o.dispensedByPharmacy ? ' · pharmacy' : ''}
          </option>
        ))}
      </select>

      {/* ── The OTHER path ───────────────────────────────────────────── */}
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-sky-700">
          Not in the list? Add it
        </summary>
        <p className="mt-2 text-xs text-gray-500">
          It is added to the catalogue for everybody, under the category selected above. If it is
          already there under a different spelling, the existing one is used instead.
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name, e.g. Polypropylene mesh"
            className="input-field"
            aria-label="Name of the new item"
          />
          <input
            type="text"
            value={newSize}
            onChange={(e) => setNewSize(e.target.value)}
            placeholder="Size (optional)"
            className="input-field"
            aria-label="Size of the new item"
          />
          <button
            type="button"
            onClick={() => void addOther()}
            disabled={adding || newName.trim().length < 2}
            className="inline-flex items-center justify-center gap-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
        {addError && <p className="mt-2 text-sm text-red-600">{addError}</p>}
      </details>

      {/* ── What has been chosen ─────────────────────────────────────── */}
      {value.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">Nothing added yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-200">
          {value.map((v) => {
            const item = byId.get(v.itemId);
            return (
              <li key={v.itemId} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 break-words">
                  {item ? describeItem(item) : 'Item no longer in the catalogue'}
                  {v.fromBundle && (
                    <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      from the {''}
                      standard pack
                    </span>
                  )}
                  {item?.dispensedByPharmacy && (
                    <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700">
                      pharmacy
                    </span>
                  )}
                </span>

                <input
                  type="number"
                  min={1}
                  value={v.quantity}
                  onChange={(e) => setQuantity(v.itemId, parseInt(e.target.value, 10))}
                  className="w-20 rounded-lg border border-gray-300 px-2 py-1"
                  aria-label={`Quantity of ${item ? describeItem(item) : 'item'}`}
                />

                <button
                  type="button"
                  onClick={() => remove(v.itemId)}
                  className="text-gray-400 hover:text-red-600"
                  title="Remove"
                  aria-label={`Remove ${item ? describeItem(item) : 'item'}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
