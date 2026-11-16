'use client';

/**
 * Items the theatre issues without knowing what they cost.
 *
 * These ARE offered at booking and they ARE in the magnitude bundles. They
 * used not to be: the catalogue withheld anything unpriced so that no
 * deposit could go out short. What that produced was packs missing whatever
 * nobody had got round to pricing, discovered in theatre rather than at the
 * cashier, so the rule was reversed.
 *
 * WHAT IS MISSING IS THE MONEY, NOT THE PACK. Every case carrying one of
 * these gets a deposit that names it and says plainly that the figure is
 * not the full amount. The family is asked for the difference later, which
 * is a bad outcome — just a less dangerous one than an unordered chest
 * drain.
 *
 * PRICING ONE HERE IS THE WHOLE FIX. The moment a figure is saved, cases
 * booked afterwards quote it correctly. Nothing else has to be done.
 *
 * THE COUNT IS THE POINT. It is not a tidy-up list — it is how much of
 * every deposit the hospital is currently not collecting.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Check, AlertTriangle } from 'lucide-react';

type Row = {
  id: string;
  category: string;
  name: string;
  size: string | null;
  brand: string | null;
  unitPrice: string | null;
  dispensedByPharmacy: boolean;
};

type Side = 'consumables' | 'pharmacy';

export default function UnpricedItemsQueue() {
  const [rows, setRows] = useState<Record<Side, Row[]>>({ consumables: [], pharmacy: [] });
  const [may, setMay] = useState<{ consumables: boolean; pharmacy: boolean } | null>(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [justPriced, setJustPriced] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const sides: Side[] = ['consumables', 'pharmacy'];
      const next: Record<Side, Row[]> = { consumables: [], pharmacy: [] };
      let permissions: { consumables: boolean; pharmacy: boolean } | null = null;

      for (const side of sides) {
        const res = await fetch(`/api/special-needs/pricing?side=${side}`, {
          credentials: 'include',
        });
        if (res.status === 401 || res.status === 403) {
          setMay({ consumables: false, pharmacy: false });
          return;
        }
        if (!res.ok) continue;
        const data = await res.json();
        permissions = data.may ?? permissions;
        next[side] = (data.items ?? []).filter((i: Row) => i.unitPrice == null);
      }

      setRows(next);
      setMay(permissions);
    } catch {
      /* offline — the rest of settings still works */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pick = (list: Row[]) =>
      (q
        ? list.filter((r) =>
            `${r.name} ${r.size ?? ''} ${r.brand ?? ''} ${r.category}`.toLowerCase().includes(q),
          )
        : list
      ).slice(0, 300);
    return { consumables: pick(rows.consumables), pharmacy: pick(rows.pharmacy) };
  }, [rows, search]);

  if (!may || (!may.consumables && !may.pharmacy)) return null;

  const total = rows.consumables.length + rows.pharmacy.length;

  const setPrice = async (side: Side, id: string, raw: string) => {
    const value = raw.trim();
    if (value === '') return;
    setSaving(id);
    setProblem(null);
    try {
      const res = await fetch('/api/special-needs/pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ itemId: id, unitPrice: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProblem(data?.error ?? 'Could not save that price.');
        return;
      }
      // Drop it out of the queue: cases booked from now on will quote it,
      // and leaving it sitting here would suggest there is still something
      // to do. Cases ALREADY booked keep the figure they were given — a
      // deposit the patient has paid is not rewritten by a price set after.
      setRows((prev) => ({ ...prev, [side]: prev[side].filter((r) => r.id !== id) }));
      setJustPriced((prev) => [...prev, id]);
    } catch {
      setProblem('Could not reach the server.');
    } finally {
      setSaving(null);
    }
  };

  const section = (side: Side, heading: string, allowed: boolean) => {
    if (!allowed) return null;
    const list = visible[side];
    const all = rows[side];
    return (
      <div className="mt-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-800">
          {heading} <span className="font-normal text-gray-500">({all.length})</span>
        </h3>
        {all.length === 0 ? (
          <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
            Everything here is priced, so every deposit on this side is the full amount.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {list.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 break-words">
                  {r.name}
                  {r.size ? ` ${r.size}` : ''}
                  {r.brand ? ` (${r.brand})` : ''}
                  <span className="ml-2 text-xs text-gray-400">{r.category}</span>
                </span>
                <span className="text-gray-500">&#8358;</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="price"
                  onBlur={(e) => void setPrice(side, r.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  className="w-32 rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5"
                  aria-label={`Price of ${r.name}`}
                />
                <span className="w-5">
                  {saving === r.id && (
                    <span className="block h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
        <ClipboardList className="h-5 w-5 text-amber-600" />
        Items waiting for a price
      </h2>

      <p className="mb-3 text-sm text-gray-600">
        These are <strong>ordered and issued normally</strong> — they are in the booking list
        and in the magnitude bundles. What is missing is the money: a case carrying one gets a
        deposit that names it and says the figure is not the full amount, and somebody asks the
        family for the difference later. Give one a price and cases booked afterwards quote it
        correctly — there is nothing else to do.
      </p>

      {total > 0 ? (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>
              {total} item{total === 1 ? '' : 's'} can be put on a case but not deposited for.
            </strong>{' '}
            Every case that carries one is quoted low by whatever it costs, and the difference
            is collected at the theatre door or not at all.
          </span>
        </p>
      ) : (
        <p className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-800">
          <Check className="h-4 w-4 shrink-0" />
          Nothing is waiting. Every item in the catalogue is priced, so every deposit is the
          full amount.
        </p>
      )}

      {justPriced.length > 0 && (
        <p className="mb-3 text-sm text-green-700">
          {justPriced.length} item{justPriced.length === 1 ? '' : 's'} priced and returned to the
          booking list.
        </p>
      )}

      {problem && (
        <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{problem}</p>
      )}

      {total > 0 && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          aria-label="Search items waiting for a price"
        />
      )}

      {section('consumables', 'Consumables — priced by the store', may.consumables)}
      {section('pharmacy', 'Drugs — priced by pharmacy', may.pharmacy)}

      <p className="mt-3 text-xs text-gray-500">
        Type a price and press Enter or click away to save. Zero is a real price meaning the item
        genuinely costs nothing; leave the box alone if you do not know yet.
      </p>
    </div>
  );
}
