'use client';

/**
 * Setting what consumables and drugs cost.
 *
 * SPLIT BY WHO DISPENSES IT. The consumable store prices consumables, the
 * pharmacy prices drugs, and the API enforces it on the item rather than on
 * the request — a store keeper pricing ceftriaxone is guessing, and the
 * guess would be charged to a patient.
 *
 * UNPRICED IS COUNTED AND SHOWN AT THE TOP, because an item with no price
 * silently lowers every deposit that includes it. The number of them is the
 * single most useful thing on this screen: it is how much of the tariff is
 * still missing.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, AlertTriangle, Check } from 'lucide-react';

type Row = {
  id: string;
  category: string;
  name: string;
  size: string | null;
  brand: string | null;
  unitPrice: string | null;
  pricedByName: string | null;
  dispensedByPharmacy: boolean;
};

export default function ItemPricingTable({
  side,
  title,
}: {
  side: 'consumables' | 'pharmacy';
  title: string;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [search, setSearch] = useState('');
  const [onlyUnpriced, setOnlyUnpriced] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/special-needs/pricing?side=${side}`, {
        credentials: 'include',
      });
      if (res.status === 401 || res.status === 403) {
        setDenied(true);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      setRows(data.items ?? []);
      setDenied(false);
    } catch {
      /* offline */
    }
  }, [side]);

  useEffect(() => {
    void load();
  }, [load]);

  const unpriced = useMemo(() => (rows ?? []).filter((r) => r.unitPrice == null).length, [rows]);

  const visible = useMemo(() => {
    let list = rows ?? [];
    if (onlyUnpriced) list = list.filter((r) => r.unitPrice == null);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        `${r.name} ${r.size ?? ''} ${r.brand ?? ''} ${r.category}`.toLowerCase().includes(q),
      );
    }
    return list.slice(0, 400);
  }, [rows, onlyUnpriced, search]);

  if (denied || !rows) return null;

  const setPrice = async (id: string, raw: string) => {
    setSaving(id);
    setProblem(null);
    try {
      const res = await fetch('/api/special-needs/pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ itemId: id, unitPrice: raw.trim() === '' ? null : raw.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProblem(data?.error ?? 'Could not save that price.');
        return;
      }
      setRows((prev) =>
        (prev ?? []).map((r) => (r.id === id ? { ...r, unitPrice: data.item.unitPrice } : r)),
      );
      setSaved(id);
      setTimeout(() => setSaved((s) => (s === id ? null : s)), 1500);
    } catch {
      setProblem('Could not reach the server.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
        <Banknote className="h-5 w-5 text-blue-600" />
        {title}
      </h2>
      <p className="mb-4 text-sm text-gray-600">
        What each item costs. These add up into the deposit a patient is asked for when a case is
        booked, so an item left blank makes that deposit too low.
      </p>

      {unpriced > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>{unpriced} item{unpriced === 1 ? '' : 's'} still have no price.</strong> Any
            case using one of them is quoted lower than it will actually cost.
          </span>
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          aria-label="Search items"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={onlyUnpriced}
            onChange={(e) => setOnlyUnpriced(e.target.checked)}
            className="rounded border-gray-300"
          />
          Only those without a price
        </label>
      </div>

      {problem && (
        <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{problem}</p>
      )}

      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
        {visible.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 break-words">
              {r.name}
              {r.size ? ` ${r.size}` : ''}
              {r.brand ? ` (${r.brand})` : ''}
              {r.pricedByName && (
                <span className="ml-2 text-xs text-gray-400">set by {r.pricedByName}</span>
              )}
            </span>
            <span className="text-gray-500">&#8358;</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              defaultValue={r.unitPrice ?? ''}
              placeholder="not set"
              onBlur={(e) => {
                const next = e.target.value.trim();
                if (next !== (r.unitPrice ?? '')) void setPrice(r.id, next);
              }}
              className={`w-32 rounded-lg border px-3 py-1.5 ${
                r.unitPrice == null ? 'border-amber-400 bg-amber-50' : 'border-gray-300'
              }`}
              aria-label={`Price of ${r.name}`}
            />
            <span className="w-5">
              {saving === r.id ? (
                <span className="block h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              ) : saved === r.id ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {visible.length === 0 && (
        <p className="py-6 text-center text-sm text-gray-500">
          {rows.length === 0
            ? 'The catalogue has not been loaded yet — an administrator does that in Settings.'
            : 'Nothing matches that search.'}
        </p>
      )}

      <p className="mt-2 text-xs text-gray-500">
        Leave a box empty to clear a price. Empty means <strong>not yet decided</strong>, which is
        different from zero — zero means the item genuinely costs nothing.
      </p>
    </div>
  );
}
