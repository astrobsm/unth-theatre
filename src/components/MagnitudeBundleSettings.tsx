'use client';

/**
 * What each size of case is given automatically, and what that costs.
 *
 * These used to be written into the code. What a minor case needs is a
 * clinical judgement belonging to this hospital, and changing it should not
 * require a deployment.
 *
 * THE RUNNING TOTAL IS THE POINT. An administrator adding a line is setting
 * what every patient of that size will be asked to deposit, and the figure
 * has to be visible while they do it rather than discovered by the first
 * family at the cashier. Unpriced lines are called out for the same reason:
 * a bundle that looks complete and quotes low is worse than one that admits
 * what it does not know.
 */

import { useCallback, useEffect, useState } from 'react';
import { Layers, Plus, X, AlertTriangle } from 'lucide-react';
import {
  MAGNITUDE_LABELS,
  formatNaira,
  type Magnitude,
} from '@/lib/specialNeeds/pricing';
import { describeItem, type CatalogueItem } from '@/components/SpecialNeedsPicker';

type Line = {
  id: string;
  itemId: string;
  quantity: number;
  name: string;
  size: string | null;
  category: string;
  dispensedByPharmacy: boolean;
  unitPrice: string | null;
};

type Bundle = {
  magnitude: Magnitude;
  lines: Line[];
  quote: {
    consumableSubtotalKobo: number;
    pharmacySubtotalKobo: number;
    consumableContingencyKobo: number;
    totalKobo: number;
    unpricedLines: string[];
    complete: boolean;
  };
};

export default function MagnitudeBundleSettings() {
  const [bundles, setBundles] = useState<Bundle[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
  const [open, setOpen] = useState<Magnitude>('MINOR');
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/special-needs/bundles', { credentials: 'include' });
      if (res.status === 401 || res.status === 403) {
        setDenied(true);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      setBundles(data.bundles);
      setDenied(false);
    } catch {
      /* offline */
    }
  }, []);

  useEffect(() => {
    void load();
    (async () => {
      try {
        const res = await fetch('/api/special-needs/catalogue', { credentials: 'include' });
        if (res.ok) setCatalogue((await res.json()).items ?? []);
      } catch {
        /* the add box simply has nothing to offer */
      }
    })();
  }, [load]);

  if (denied || !bundles) return null;

  const current = bundles.find((b) => b.magnitude === open);

  const save = async (itemId: string, quantity: number) => {
    setBusy(true);
    try {
      await fetch('/api/special-needs/bundles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ magnitude: open, itemId, quantity }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`/api/special-needs/bundles?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const chosen = new Set(current?.lines.map((l) => l.itemId) ?? []);
  const available = catalogue.filter((c) => !chosen.has(c.id));

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Layers className="h-5 w-5 text-blue-600" />
        Automatic consumables by operation size
      </h2>

      <p className="text-sm text-gray-600 mb-4">
        What every case of each size is given without the surgeon asking. They add anything else
        on top at booking, and the deposit is the two added together.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {bundles.map((b) => (
          <button
            key={b.magnitude}
            type="button"
            onClick={() => setOpen(b.magnitude)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              open === b.magnitude
                ? 'bg-blue-600 text-white'
                : 'border border-gray-300 bg-white text-gray-700'
            }`}
          >
            {MAGNITUDE_LABELS[b.magnitude]}
            <span className="ml-2 opacity-75">{b.lines.length}</span>
          </button>
        ))}
      </div>

      {current && (
        <>
          {current.lines.length === 0 ? (
            <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              Nothing is bundled for a {MAGNITUDE_LABELS[current.magnitude].toLowerCase()} case
              yet. Until something is added, the built-in list is used instead.
            </p>
          ) : (
            <ul className="mb-3 divide-y divide-gray-100 rounded-lg border border-gray-200">
              {current.lines.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 break-words">
                    {l.name}
                    {l.size ? ` ${l.size}` : ''}
                    {l.dispensedByPharmacy && (
                      <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700">
                        pharmacy
                      </span>
                    )}
                    {l.unitPrice == null && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                        no price set
                      </span>
                    )}
                  </span>
                  <input
                    type="number"
                    min={1}
                    defaultValue={l.quantity}
                    onBlur={(e) => {
                      const q = Math.max(1, parseInt(e.target.value, 10) || 1);
                      if (q !== l.quantity) void save(l.itemId, q);
                    }}
                    className="w-20 rounded-lg border border-gray-300 px-2 py-1"
                    aria-label={`Quantity of ${l.name}`}
                  />
                  <span className="w-28 text-right text-gray-600">
                    {l.unitPrice == null ? '—' : formatNaira(Math.round(Number(l.unitPrice) * 100) * l.quantity)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void remove(l.id)}
                    disabled={busy}
                    className="text-gray-400 hover:text-red-600"
                    aria-label={`Remove ${l.name}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mb-4 flex gap-2">
            <select
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              aria-label="Item to add to this bundle"
            >
              <option value="">— Add an item to this bundle —</option>
              {available.slice(0, 300).map((c) => (
                <option key={c.id} value={c.id}>
                  {describeItem(c)}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!adding || busy}
              onClick={() => {
                void save(adding, 1);
                setAdding('');
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>

          {/* The running total. An administrator adding a line is setting
              what every patient of this size pays. */}
          <div className="rounded-lg bg-gray-50 p-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-800">
              What a {MAGNITUDE_LABELS[current.magnitude].toLowerCase()} case deposits, before
              anything the surgeon adds
            </h3>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-600">Consumables</dt>
                <dd>{formatNaira(current.quote.consumableSubtotalKobo)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Theatre contingency (10%, refundable)</dt>
                <dd>{formatNaira(current.quote.consumableContingencyKobo)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Drugs</dt>
                <dd>{formatNaira(current.quote.pharmacySubtotalKobo)}</dd>
              </div>
              <div className="flex justify-between border-t border-gray-300 pt-1 font-semibold">
                <dt>Total</dt>
                <dd>{formatNaira(current.quote.totalKobo)}</dd>
              </div>
            </dl>

            {!current.quote.complete && (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-100 p-2 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong>{current.quote.unpricedLines.length} item(s) have no price</strong>, so
                  this total is lower than the real cost. Set their prices in the consumable
                  store or pharmacy pricing page.
                </span>
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
