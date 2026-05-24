'use client';

/**
 * Public, no-login view of the UNTH Theatre Surgical Catalog.
 * Shareable link — anyone with the URL can view the active
 * consumables and drugs/IV fluids/dressing agents.
 * Read-only. No CRUD, no auth.
 */

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, Package, Pill, ExternalLink } from 'lucide-react';

interface Consumable {
  id: string;
  name: string;
  category: string;
  size?: string | null;
  unit: string;
  specialty?: string | null;
  defaultQuantity: number;
}

interface Drug {
  id: string;
  name: string;
  type: string;
  defaultDosage?: string | null;
  defaultRoute?: string | null;
  defaultQuantity: number;
  unit: string;
  specialty?: string | null;
  isControlled: boolean;
}

export default function PublicSurgicalCatalogPage() {
  const [tab, setTab] = useState<'consumables' | 'drugs'>('consumables');
  const [filter, setFilter] = useState('');
  const [consumables, setConsumables] = useState<Consumable[]>([]);
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/public/surgical-catalog', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setConsumables(data.consumables ?? []);
      setDrugs(data.drugs ?? []);
      setGeneratedAt(data.generatedAt ?? null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load catalog');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filteredConsumables = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return consumables;
    return consumables.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
      (c.specialty || '').toLowerCase().includes(q) ||
      (c.size || '').toLowerCase().includes(q)
    );
  }, [filter, consumables]);

  const filteredDrugs = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return drugs;
    return drugs.filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.type.toLowerCase().includes(q) ||
      (d.specialty || '').toLowerCase().includes(q) ||
      (d.defaultDosage || '').toLowerCase().includes(q) ||
      (d.defaultRoute || '').toLowerCase().includes(q)
    );
  }, [filter, drugs]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
                UNTH
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Surgical Catalog</h1>
                <p className="text-xs text-gray-500">
                  UNTH Ituku-Ozalla · Theatre Management System
                  {generatedAt && (
                    <span className="ml-2 text-gray-400">
                      · updated {new Date(generatedAt).toLocaleString()}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={load}
              disabled={loading}
              className="px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 inline-flex items-center text-sm"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-lg px-3 py-2 mb-4">
          Read-only public view. To edit or contribute items, sign in to the Theatre Management System.
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-4">
          <button
            onClick={() => setTab('consumables')}
            className={`px-4 py-2 text-sm font-medium inline-flex items-center border-b-2 -mb-px ${
              tab === 'consumables'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Package className="w-4 h-4 mr-2" />
            Consumables ({consumables.length})
          </button>
          <button
            onClick={() => setTab('drugs')}
            className={`px-4 py-2 text-sm font-medium inline-flex items-center border-b-2 -mb-px ${
              tab === 'drugs'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Pill className="w-4 h-4 mr-2" />
            Drugs / IV / Dressings ({drugs.length})
          </button>
        </div>

        {/* Filter */}
        <div className="relative mb-4 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <label htmlFor="catalog-filter" className="sr-only">Filter catalog</label>
          <input
            id="catalog-filter"
            type="text"
            placeholder="Filter by name, category, specialty…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
            Failed to load catalog: {error}
          </div>
        )}

        {loading && !consumables.length && !drugs.length ? (
          <div className="text-center py-12 text-gray-500 text-sm">Loading catalog…</div>
        ) : tab === 'consumables' ? (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Name</th>
                    <th className="px-3 py-2 text-left font-semibold">Category</th>
                    <th className="px-3 py-2 text-left font-semibold">Size</th>
                    <th className="px-3 py-2 text-left font-semibold">Unit</th>
                    <th className="px-3 py-2 text-left font-semibold">Default Qty</th>
                    <th className="px-3 py-2 text-left font-semibold">Specialty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredConsumables.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-900">{c.name}</td>
                      <td className="px-3 py-2 text-gray-600">{c.category}</td>
                      <td className="px-3 py-2 text-gray-600">{c.size || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{c.unit}</td>
                      <td className="px-3 py-2 text-gray-600">{c.defaultQuantity}</td>
                      <td className="px-3 py-2 text-gray-600">{c.specialty || 'all'}</td>
                    </tr>
                  ))}
                  {!filteredConsumables.length && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                        No consumables match your filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Name</th>
                    <th className="px-3 py-2 text-left font-semibold">Type</th>
                    <th className="px-3 py-2 text-left font-semibold">Dosage</th>
                    <th className="px-3 py-2 text-left font-semibold">Route</th>
                    <th className="px-3 py-2 text-left font-semibold">Default Qty</th>
                    <th className="px-3 py-2 text-left font-semibold">Unit</th>
                    <th className="px-3 py-2 text-left font-semibold">Specialty</th>
                    <th className="px-3 py-2 text-left font-semibold">Controlled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredDrugs.map((d) => (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-900">{d.name}</td>
                      <td className="px-3 py-2 text-gray-600">{d.type}</td>
                      <td className="px-3 py-2 text-gray-600">{d.defaultDosage || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{d.defaultRoute || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{d.defaultQuantity}</td>
                      <td className="px-3 py-2 text-gray-600">{d.unit}</td>
                      <td className="px-3 py-2 text-gray-600">{d.specialty || 'all'}</td>
                      <td className="px-3 py-2">
                        {d.isControlled
                          ? <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">YES</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                    </tr>
                  ))}
                  {!filteredDrugs.length && (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                        No drugs match your filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <footer className="mt-8 text-center text-xs text-gray-500">
          <a
            href="/auth/login"
            className="inline-flex items-center hover:text-blue-700"
          >
            Staff sign-in <ExternalLink className="w-3 h-3 ml-1" />
          </a>
        </footer>
      </main>
    </div>
  );
}
