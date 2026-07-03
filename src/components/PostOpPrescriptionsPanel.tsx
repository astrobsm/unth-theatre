'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pill, Search, RefreshCw, CheckCircle2, Clock, Package, BadgeDollarSign } from 'lucide-react';

interface Med {
  drugName: string;
  category?: string;
  dosage?: string;
  route?: string;
  frequency?: string;
  duration?: string;
  quantity?: number;
  isControlled?: boolean;
}

interface PostOpRx {
  id: string;
  patientName: string;
  folderNumber?: string | null;
  prescribedByName: string;
  prescribedAt?: string;
  createdAt: string;
  status: string;
  notes?: string | null;
  totalCost?: number | null;
  medications: Med[];
  surgery?: { procedureName?: string; scheduledDate?: string; surgeonName?: string; location?: string | null } | null;
}

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-gray-100 text-gray-700' },
  SENT_TO_PHARMACY: { label: 'Sent to pharmacy', cls: 'bg-blue-100 text-blue-700' },
  PACKING: { label: 'Packing', cls: 'bg-amber-100 text-amber-700' },
  PACKED: { label: 'Packed', cls: 'bg-indigo-100 text-indigo-700' },
  AWAITING_PAYMENT: { label: 'Awaiting payment', cls: 'bg-orange-100 text-orange-700' },
  PAID: { label: 'Paid', cls: 'bg-teal-100 text-teal-700' },
  COLLECTED: { label: 'Collected', cls: 'bg-green-100 text-green-700' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-red-100 text-red-700' },
};

function fmt(dt?: string | null) {
  if (!dt) return '';
  return new Date(dt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function PostOpPrescriptionsPanel({ canPack }: { canPack: boolean }) {
  const [items, setItems] = useState<PostOpRx[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/post-op-prescriptions', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setItems(Array.isArray(json) ? json : []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((it) =>
      [it.patientName, it.folderNumber, it.surgery?.procedureName, it.prescribedByName]
        .some((v) => (v || '').toLowerCase().includes(term))
    );
  }, [items, q]);

  const act = async (id: string, action: string, extra?: Record<string, unknown>) => {
    setBusyId(id);
    try {
      const res = await fetch('/api/post-op-prescriptions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Action failed');
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const markPacked = (rx: PostOpRx) => {
    const raw = prompt('Total cost of this post-op prescription (₦). Leave blank if not applicable:', rx.totalCost ? String(rx.totalCost) : '');
    if (raw === null) return;
    const cost = raw.trim() ? Number(raw.replace(/[^0-9.]/g, '')) : undefined;
    act(rx.id, 'PACKED', cost != null && !Number.isNaN(cost) ? { totalCost: cost } : {});
  };

  return (
    <div className="bg-white rounded-lg shadow-sm mb-6 p-4">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Pill className="w-5 h-5 text-purple-600" /> Post-Operative Prescriptions
        </h2>
        <span className="text-xs text-gray-500">Sent from the surgeon&apos;s post-op notes for dispensing.</span>
        <button onClick={load} className="ml-auto inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="relative max-w-md mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by patient name, folder no. or procedure…"
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
        />
      </div>

      {error && <div className="p-3 mb-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400">{loading ? 'Loading…' : 'No post-operative prescriptions found.'}</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((rx) => {
            const st = STATUS_STYLES[rx.status] || { label: rx.status, cls: 'bg-gray-100 text-gray-600' };
            return (
              <div key={rx.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-gray-900">
                      {rx.patientName}{rx.folderNumber ? ` (${rx.folderNumber})` : ''}
                    </div>
                    <div className="text-xs text-gray-500">
                      {rx.surgery?.procedureName || 'Procedure'} · Prescribed by {rx.prescribedByName} · {fmt(rx.prescribedAt || rx.createdAt)}
                      {rx.surgery?.location ? ` · ${rx.surgery.location}` : ''}
                    </div>
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>{st.label}</span>
                </div>

                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs min-w-[520px]">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-100">
                        <th className="py-1 pr-3">Drug</th>
                        <th className="py-1 pr-3">Dose</th>
                        <th className="py-1 pr-3">Route</th>
                        <th className="py-1 pr-3">Freq</th>
                        <th className="py-1 pr-3">Duration</th>
                        <th className="py-1 pr-3">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rx.medications.map((m, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-1 pr-3 font-medium text-gray-800">
                            {m.drugName}{m.isControlled ? <span className="ml-1 text-red-600">(controlled)</span> : ''}
                          </td>
                          <td className="py-1 pr-3">{m.dosage || '—'}</td>
                          <td className="py-1 pr-3">{m.route || '—'}</td>
                          <td className="py-1 pr-3">{m.frequency || '—'}</td>
                          <td className="py-1 pr-3">{m.duration || '—'}</td>
                          <td className="py-1 pr-3">{m.quantity ?? 1}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {rx.notes && <p className="mt-2 text-xs text-gray-500">Note: {rx.notes}</p>}
                {rx.totalCost != null && Number(rx.totalCost) > 0 && (
                  <p className="mt-1 text-xs text-gray-700">Cost: ₦{Number(rx.totalCost).toLocaleString()}</p>
                )}

                {canPack && rx.status !== 'COLLECTED' && rx.status !== 'CANCELLED' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(rx.status === 'SENT_TO_PHARMACY') && (
                      <button onClick={() => act(rx.id, 'START_PACKING')} disabled={busyId === rx.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-600 text-white text-xs rounded-lg hover:bg-amber-700 disabled:opacity-50">
                        <Clock className="w-3 h-3" /> Start packing
                      </button>
                    )}
                    {(rx.status === 'SENT_TO_PHARMACY' || rx.status === 'PACKING') && (
                      <button onClick={() => markPacked(rx)} disabled={busyId === rx.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                        <Package className="w-3 h-3" /> Mark packed + announce bill
                      </button>
                    )}
                    {rx.status === 'AWAITING_PAYMENT' && (
                      <button onClick={() => act(rx.id, 'MARK_PAID')} disabled={busyId === rx.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white text-xs rounded-lg hover:bg-teal-700 disabled:opacity-50">
                        <BadgeDollarSign className="w-3 h-3" /> Mark paid + announce pickup
                      </button>
                    )}
                    {rx.status === 'PAID' && (
                      <button onClick={() => act(rx.id, 'COLLECTED')} disabled={busyId === rx.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50">
                        <CheckCircle2 className="w-3 h-3" /> Mark collected
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
