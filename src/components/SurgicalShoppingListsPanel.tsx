'use client';

/**
 * Surgical Shopping Lists Panel — Pharmacy view of per-surgery
 * drug / IV / wound-dressing items selected at booking time.
 *
 * Lets pharmacy see (and pack) what each surgery will need a night
 * before, grouped by surgery. Pulls from /api/drug-dressing-requests.
 *
 * Status flow: REQUESTED → PACKING → PACKED → DELIVERED (or CANCELLED).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Package,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  CheckCircle,
  PlayCircle,
  Truck,
  AlertCircle,
  Siren,
} from 'lucide-react';
import { isNarcotic } from '@/lib/narcotics';

type PackStatus = 'REQUESTED' | 'PACKING' | 'PACKED' | 'DELIVERED' | 'CANCELLED';

interface DDRequest {
  id: string;
  surgeryId: string;
  name: string;
  type: string;
  dosage?: string | null;
  route?: string | null;
  quantity: number;
  unit: string;
  notes?: string | null;
  status: PackStatus;
  packedByName?: string | null;
  packedAt?: string | null;
  surgery: {
    id: string;
    procedureName: string;
    scheduledDate: string;
    scheduledTime?: string | null;
    subspecialty?: string | null;
    surgeonName?: string | null;
    location?: string | null;
    surgeryType?: string | null;
    patient: { name: string; folderNumber?: string | null };
  };
}

interface Props {
  fromDate: string; // YYYY-MM-DD
  toDate: string;
  canPack: boolean;
}

const STATUS_FILTERS: { value: PackStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'REQUESTED', label: 'Requested' },
  { value: 'PACKING', label: 'Packing' },
  { value: 'PACKED', label: 'Packed' },
  { value: 'DELIVERED', label: 'Delivered' },
];

const statusBadgeClass = (s: PackStatus) => {
  switch (s) {
    case 'REQUESTED': return 'bg-amber-100 text-amber-800 border-amber-300';
    case 'PACKING': return 'bg-blue-100 text-blue-800 border-blue-300';
    case 'PACKED': return 'bg-green-100 text-green-800 border-green-300';
    case 'DELIVERED': return 'bg-purple-100 text-purple-800 border-purple-300';
    case 'CANCELLED': return 'bg-gray-100 text-gray-700 border-gray-300';
  }
};

export default function SurgicalShoppingListsPanel({ fromDate, toDate, canPack }: Props) {
  const [items, setItems] = useState<DDRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PackStatus | 'ALL'>('ALL');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('fromDate', `${fromDate}T00:00:00.000Z`);
      if (toDate) params.set('toDate', `${toDate}T23:59:59.999Z`);
      const res = await fetch(`/api/drug-dressing-requests?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 60s
  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const filtered = useMemo(
    () => statusFilter === 'ALL' ? items : items.filter(i => i.status === statusFilter),
    [items, statusFilter]
  );

  // Group by surgery
  const grouped = useMemo(() => {
    const m = new Map<string, { surgery: DDRequest['surgery']; items: DDRequest[] }>();
    for (const it of filtered) {
      const g = m.get(it.surgeryId);
      if (g) g.items.push(it);
      else m.set(it.surgeryId, { surgery: it.surgery, items: [it] });
    }
    // Emergencies first, then earliest scheduled
    return Array.from(m.values()).sort((a, b) => {
      const ae = a.surgery.surgeryType === 'EMERGENCY' ? 0 : 1;
      const be = b.surgery.surgeryType === 'EMERGENCY' ? 0 : 1;
      if (ae !== be) return ae - be;
      return new Date(a.surgery.scheduledDate).getTime() - new Date(b.surgery.scheduledDate).getTime();
    });
  }, [filtered]);

  const totals = useMemo(() => {
    const t = { REQUESTED: 0, PACKING: 0, PACKED: 0, DELIVERED: 0, CANCELLED: 0 } as Record<PackStatus, number>;
    for (const i of items) t[i.status]++;
    return t;
  }, [items]);

  const updateItem = async (id: string, action: 'START_PACKING' | 'PACKED' | 'DELIVERED' | 'CANCEL') => {
    setBusy(b => ({ ...b, [id]: true }));
    try {
      const res = await fetch('/api/drug-dressing-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e: any) {
      alert(`Failed to update: ${e?.message ?? e}`);
    } finally {
      setBusy(b => ({ ...b, [id]: false }));
    }
  };

  return (
    <section className="bg-white rounded-lg shadow-sm mb-6 overflow-hidden border border-blue-100">
      <header className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-blue-100 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-blue-700" />
          <div>
            <h2 className="text-base font-semibold text-gray-900">Surgical Shopping Lists — Drugs / IV / Wound Dressings</h2>
            <p className="text-xs text-gray-600">
              Selected at booking. Pack the night before surgery. Date range follows the export filter above.
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1 text-sm bg-white border border-gray-300 rounded px-2 py-1 hover:bg-gray-50"
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map(f => {
          const count = f.value === 'ALL' ? items.length : totals[f.value as PackStatus] ?? 0;
          const active = statusFilter === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium ${
                active
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {f.label} <span className={`ml-1 ${active ? 'text-blue-100' : 'text-gray-500'}`}>({count})</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-2 border-b border-red-100 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="px-4 py-6 text-sm text-gray-500 text-center">Loading shopping lists…</div>
      ) : grouped.length === 0 ? (
        <div className="px-4 py-6 text-sm text-gray-500 text-center">
          No surgical shopping lists in this date range.
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {grouped.map(({ surgery, items: gItems }) => {
            const isOpen = expanded[surgery.id] !== false; // default open
            const allPacked = gItems.every(i => i.status === 'PACKED' || i.status === 'DELIVERED' || i.status === 'CANCELLED');
            const anyPacking = gItems.some(i => i.status === 'PACKING');
            const narcoticCount = gItems.filter(i => isNarcotic(i.name)).length;
            const isEmergency = surgery.surgeryType === 'EMERGENCY';
            const dt = new Date(surgery.scheduledDate);

            return (
              <li key={surgery.id} className={`px-4 py-3 ${isEmergency ? 'bg-red-50/40 border-l-4 border-red-500' : ''}`}>
                <button
                  type="button"
                  onClick={() => setExpanded(e => ({ ...e, [surgery.id]: !isOpen }))}
                  className="w-full flex items-start justify-between gap-3 text-left"
                >
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    {isOpen ? <ChevronDown className="h-4 w-4 mt-1 text-gray-500" /> : <ChevronRight className="h-4 w-4 mt-1 text-gray-500" />}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isEmergency && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase bg-red-600 text-white px-2 py-0.5 rounded-full">
                            <Siren className="h-3 w-3" /> Emergency
                          </span>
                        )}
                        <span className="font-semibold text-gray-900">{surgery.patient.name}</span>
                        {surgery.patient.folderNumber && (
                          <span className="text-xs text-gray-500">Folder: {surgery.patient.folderNumber}</span>
                        )}
                        {narcoticCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-700 border border-red-300 px-2 py-0.5 rounded-full">
                            <ShieldAlert className="h-3 w-3" /> {narcoticCount} narcotic
                          </span>
                        )}
                        {allPacked && (
                          <span className="text-xs bg-green-100 text-green-800 border border-green-300 px-2 py-0.5 rounded-full">All packed</span>
                        )}
                        {!allPacked && anyPacking && (
                          <span className="text-xs bg-blue-100 text-blue-800 border border-blue-300 px-2 py-0.5 rounded-full">In progress</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        <span className="font-medium">{surgery.procedureName}</span>
                        {surgery.subspecialty && <span> · {surgery.subspecialty}</span>}
                        {surgery.surgeonName && <span> · {surgery.surgeonName}</span>}
                        {surgery.location && <span> · {surgery.location}</span>}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Scheduled: {dt.toLocaleDateString()}{surgery.scheduledTime ? ` · ${surgery.scheduledTime}` : ''}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap">{gItems.length} item{gItems.length === 1 ? '' : 's'}</span>
                </button>

                {isOpen && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-semibold">Item</th>
                          <th className="px-2 py-1.5 text-left font-semibold">Type</th>
                          <th className="px-2 py-1.5 text-left font-semibold">Dosage</th>
                          <th className="px-2 py-1.5 text-left font-semibold">Route</th>
                          <th className="px-2 py-1.5 text-left font-semibold">Qty</th>
                          <th className="px-2 py-1.5 text-left font-semibold">Status</th>
                          {canPack && <th className="px-2 py-1.5 text-left font-semibold">Action</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {gItems.map(it => {
                          const narcotic = isNarcotic(it.name);
                          return (
                            <tr key={it.id} className={narcotic ? 'bg-red-50' : ''}>
                              <td className={`px-2 py-1.5 font-medium ${narcotic ? 'text-red-800' : 'text-gray-900'}`}>
                                {narcotic && <ShieldAlert className="inline h-3 w-3 mr-1 text-red-600" />}
                                {it.name}
                                {it.notes && <div className="text-[10px] text-gray-500">{it.notes}</div>}
                              </td>
                              <td className="px-2 py-1.5 text-gray-600">{it.type.replace(/_/g, ' ')}</td>
                              <td className="px-2 py-1.5 text-gray-600">{it.dosage || '—'}</td>
                              <td className="px-2 py-1.5 text-gray-600">{it.route || '—'}</td>
                              <td className="px-2 py-1.5 text-gray-600">{it.quantity} {it.unit}</td>
                              <td className="px-2 py-1.5">
                                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${statusBadgeClass(it.status)}`}>
                                  {it.status}
                                </span>
                                {it.packedByName && it.packedAt && (
                                  <div className="text-[10px] text-gray-500 mt-0.5">
                                    by {it.packedByName} · {new Date(it.packedAt).toLocaleString()}
                                  </div>
                                )}
                              </td>
                              {canPack && (
                                <td className="px-2 py-1.5 whitespace-nowrap">
                                  <div className="flex flex-wrap gap-1">
                                    {it.status === 'REQUESTED' && (
                                      <button
                                        onClick={() => updateItem(it.id, 'START_PACKING')}
                                        disabled={!!busy[it.id]}
                                        className="inline-flex items-center gap-1 text-[10px] bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-2 py-0.5 rounded"
                                      >
                                        <PlayCircle className="h-3 w-3" /> Start
                                      </button>
                                    )}
                                    {(it.status === 'REQUESTED' || it.status === 'PACKING') && (
                                      <button
                                        onClick={() => updateItem(it.id, 'PACKED')}
                                        disabled={!!busy[it.id]}
                                        className="inline-flex items-center gap-1 text-[10px] bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-2 py-0.5 rounded"
                                      >
                                        <CheckCircle className="h-3 w-3" /> Packed
                                      </button>
                                    )}
                                    {it.status === 'PACKED' && (
                                      <button
                                        onClick={() => updateItem(it.id, 'DELIVERED')}
                                        disabled={!!busy[it.id]}
                                        className="inline-flex items-center gap-1 text-[10px] bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-2 py-0.5 rounded"
                                      >
                                        <Truck className="h-3 w-3" /> Delivered
                                      </button>
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
