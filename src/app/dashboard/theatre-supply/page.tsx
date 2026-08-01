'use client';

// ============================================================
// Theatre Supply Unit — what is on the shelf
// ------------------------------------------------------------
// Two audiences, one screen. A surgeon about to book wants one question
// answered: is there enough, and is any of it about to expire? A store officer
// wants the same figures broken down by lot so they know what to pull first.
//
// So availability leads and batches sit underneath it, expanded on demand. The
// arithmetic is the server's — summariseAvailability in lib/stock/allocate —
// because a screen that computed availability its own way would eventually
// disagree with the reservation the allocator produced from it.
//
// Plain `fetch`, so the app's offline layer serves it from cache when there is
// no signal. A store with no signal still knows what it holds.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  Boxes,
  ChevronDown,
  ChevronRight,
  PackageSearch,
  RefreshCw,
  Search,
} from 'lucide-react';

interface BatchRow {
  id: string;
  batchNumber: string;
  status: string;
  owner: string;
  expiryDate: string | null;
  daysUntilExpiry: number | null;
  sellingPrice: number;
  quantityReserved: number;
  location: { id: string; name: string; isEmergency?: boolean; isControlled?: boolean } | null;
}

interface ItemRow {
  itemId: string;
  name: string;
  category: string;
  reorderLevel: number;
  legacyQuantity: number;
  available: number;
  reserved: number;
  onHand: number;
  batches: number;
  nextExpiry: string | null;
  expiringSoon: number;
  belowReorderLevel: boolean;
}

interface ItemWithBatches extends ItemRow {
  batches: number;
  batchRows?: BatchRow[];
}

const naira = (kobo: number) =>
  `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TheatreSupplyPage() {
  const [items, setItems] = useState<(ItemRow & { batchRows: BatchRow[] })[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [query, setQuery] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (lowOnly) params.set('lowOnly', 'true');

      const res = await fetch(`/api/stock/availability?${params.toString()}`);
      if (res.status === 401 || res.status === 403) {
        const b = await res.json().catch(() => ({}));
        setDenied(true);
        setError(b.error || 'Your role does not allow you to view theatre stock.');
        return;
      }
      if (!res.ok) throw new Error(`Request failed (${res.status})`);

      const data = await res.json();
      setDenied(false);
      setItems(
        (data.items ?? []).map((i: ItemWithBatches & { batches: unknown }) => ({
          ...i,
          // The API returns the batch array under `batches` and the count is its
          // length; keep both without letting one shadow the other.
          batchRows: Array.isArray(i.batches) ? (i.batches as unknown as BatchRow[]) : [],
          batches: Array.isArray(i.batches) ? (i.batches as unknown[]).length : 0,
        }))
      );
      setTotals(data.totals ?? {});
    } catch {
      setError('Could not load theatre stock. If you are offline it will appear once cached.');
    } finally {
      setLoading(false);
    }
  }, [query, lowOnly]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Items that need somebody's attention today, surfaced above the list rather
  // than left to be noticed by scrolling.
  const needsAttention = useMemo(
    () => items.filter((i) => i.available === 0 || i.belowReorderLevel || i.expiringSoon > 0),
    [items]
  );

  if (denied) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-900">Theatre stock is not available to your role</p>
              <p className="text-sm text-amber-800">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-100">
            <Boxes className="h-6 w-6 text-primary-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Theatre Supply Unit</h1>
            <p className="text-sm text-gray-500">What is on the shelf, by lot — so no case is booked blind.</p>
          </div>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Items tracked" value={String(totals.items ?? 0)} />
        <Tile label="Out of stock" value={String(totals.outOfStock ?? 0)} danger={(totals.outOfStock ?? 0) > 0} />
        <Tile label="Below reorder level" value={String(totals.belowReorder ?? 0)} warn={(totals.belowReorder ?? 0) > 0} />
        <Tile label="Expiring within 30 days" value={String(totals.expiringSoon ?? 0)} warn={(totals.expiringSoon ?? 0) > 0} />
      </div>

      {needsAttention.length > 0 && !lowOnly && (
        <button
          onClick={() => setLowOnly(true)}
          className="flex w-full items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-left text-sm text-amber-900 hover:bg-amber-100"
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {needsAttention.length} item{needsAttention.length === 1 ? '' : 's'} need attention — out of stock, below reorder level, or expiring soon. Show only these.
        </button>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items…"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <label className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
          Needs attention only
        </label>
      </div>

      {error && !denied && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {items.length === 0 ? (
          <div className="p-8 text-center">
            <PackageSearch className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-2 text-sm text-gray-600">
              {loading ? 'Loading theatre stock…' : 'No items match. Stock appears here once a delivery is received against a catalogue item.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((item) => {
              const open = expanded.has(item.itemId);
              return (
                <li key={item.itemId}>
                  <button
                    onClick={() => toggle(item.itemId)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                  >
                    {open ? (
                      <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-900">{item.name}</span>
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600">
                          {item.category}
                        </span>
                        {item.available === 0 && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                            out of stock
                          </span>
                        )}
                        {item.available > 0 && item.belowReorderLevel && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                            below reorder level
                          </span>
                        )}
                        {item.expiringSoon > 0 && (
                          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
                            {item.expiringSoon} expiring soon
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs text-gray-500">
                        {item.batches} lot{item.batches === 1 ? '' : 's'}
                        {item.reserved > 0 ? ` · ${item.reserved} reserved for booked cases` : ''}
                        {item.nextExpiry ? ` · next expiry ${new Date(item.nextExpiry).toLocaleDateString('en-GB')}` : ''}
                      </span>
                    </span>
                    <span className="flex-shrink-0 text-right">
                      <span className={`block text-lg font-bold ${item.available === 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {item.available}
                      </span>
                      <span className="block text-[10px] uppercase tracking-wide text-gray-400">available</span>
                    </span>
                  </button>

                  {open && (
                    <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                      {item.batchRows.length === 0 ? (
                        <p className="text-xs text-gray-500">
                          No lots recorded. This item still shows {item.legacyQuantity} on the old single-quantity
                          field — receive it against a batch to bring it onto the supply chain.
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[560px] text-xs">
                            <thead>
                              <tr className="text-left uppercase tracking-wide text-gray-500">
                                <th className="py-1.5 pr-3 font-medium">Lot</th>
                                <th className="py-1.5 pr-3 font-medium">Store</th>
                                <th className="py-1.5 pr-3 font-medium">Owner</th>
                                <th className="py-1.5 pr-3 font-medium">Expiry</th>
                                <th className="py-1.5 pr-3 text-right font-medium">Reserved</th>
                                <th className="py-1.5 text-right font-medium">Unit price</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {item.batchRows.map((b) => (
                                <tr key={b.id}>
                                  <td className="py-1.5 pr-3 font-medium text-gray-900">{b.batchNumber}</td>
                                  <td className="py-1.5 pr-3 text-gray-600">
                                    {b.location?.name ?? '—'}
                                    {b.location?.isControlled && (
                                      <span className="ml-1 rounded bg-purple-100 px-1 text-[10px] font-semibold text-purple-700">CD</span>
                                    )}
                                    {b.location?.isEmergency && (
                                      <span className="ml-1 rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700">EMG</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 pr-3 text-gray-600">{b.owner}</td>
                                  <td className="py-1.5 pr-3">
                                    {b.expiryDate ? (
                                      <span
                                        className={
                                          (b.daysUntilExpiry ?? 999) < 0
                                            ? 'font-semibold text-red-700'
                                            : (b.daysUntilExpiry ?? 999) <= 30
                                              ? 'font-semibold text-orange-700'
                                              : 'text-gray-600'
                                        }
                                      >
                                        {new Date(b.expiryDate).toLocaleDateString('en-GB')}
                                        {b.daysUntilExpiry !== null && (
                                          <span className="ml-1 text-[10px]">
                                            ({b.daysUntilExpiry < 0 ? `${Math.abs(b.daysUntilExpiry)}d past` : `${b.daysUntilExpiry}d`})
                                          </span>
                                        )}
                                      </span>
                                    ) : (
                                      <span className="text-gray-400">—</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 pr-3 text-right tabular-nums text-gray-700">{b.quantityReserved}</td>
                                  <td className="py-1.5 text-right tabular-nums text-gray-700">{naira(b.sellingPrice)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Stock is drawn first-expired-first-out, so the lot at the top of each list is the one that will be used next.{' '}
        <Link href="/dashboard/inventory" className="font-medium text-primary-700 hover:underline">
          Manage the item catalogue →
        </Link>
      </p>
    </div>
  );
}

function Tile({ label, value, danger, warn }: { label: string; value: string; danger?: boolean; warn?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        danger ? 'border-red-200 bg-red-50' : warn ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${danger ? 'text-red-700' : warn ? 'text-amber-800' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  );
}
