'use client';

// ============================================================
// Imprest Register
// ------------------------------------------------------------
// Ported from the imprest system's ImprestListPage. Two deliberate changes:
//
//   • It fetches with plain `fetch`, so the app's offline layer handles it —
//     cached reads, queued writes, pending rows merged into the list. The
//     original app's Dexie store and its second sync engine are not used.
//   • Access follows the assigned imprest DUTY, not a clinical role. Someone
//     without one gets told how to obtain it instead of an empty screen.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Wallet, Search, AlertCircle, Plus, RefreshCw, CalendarClock } from 'lucide-react';
import { formatNaira } from '@/lib/imprest/money';

interface ImprestRow {
  id: string;
  imprestNumber: string;
  voucherNumber: string | null;
  purpose: string;
  status: string;
  amountApproved: number;
  amountReceived: number;
  balance: number;
  dateApproved: string | null;
  expectedRetirementDate: string | null;
  department?: { name: string; code: string } | null;
  receivingOfficer?: { fullName: string; staffCode: string | null } | null;
  _count?: { expenditures: number };
  _offlinePending?: string;
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-200',
  ACTIVE: 'bg-blue-100 text-blue-800 border-blue-200',
  PARTIALLY_RETIRED: 'bg-amber-100 text-amber-800 border-amber-200',
  FULLY_RETIRED: 'bg-green-100 text-green-800 border-green-200',
  CLOSED: 'bg-slate-200 text-slate-700 border-slate-300',
  CANCELLED: 'bg-red-100 text-red-800 border-red-200',
};

export default function ImprestRegisterPage() {
  const [rows, setRows] = useState<ImprestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noDuty, setNoDuty] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (status) params.set('status', status);
      const res = await fetch(`/api/imprest/imprests?${params.toString()}`);

      if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        setNoDuty(true);
        setError(body.error || 'You do not have an imprest duty assigned.');
        setRows([]);
        return;
      }
      if (!res.ok) throw new Error(`Request failed (${res.status})`);

      const data = await res.json();
      setNoDuty(false);
      setRows(Array.isArray(data.imprests) ? data.imprests : []);
    } catch {
      // Offline with nothing cached is the usual cause; the app's offline
      // indicator already explains the connection state.
      setError('Could not load the imprest register. If you are offline, it will appear once cached.');
    } finally {
      setLoading(false);
    }
  }, [query, status]);

  useEffect(() => { load(); }, [load]);

  const totals = rows.reduce(
    (acc, r) => ({
      approved: acc.approved + (r.amountApproved || 0),
      received: acc.received + (r.amountReceived || 0),
      balance: acc.balance + (r.balance || 0),
    }),
    { approved: 0, received: 0, balance: 0 }
  );

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-100">
            <Wallet className="h-6 w-6 text-primary-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Imprest Register</h1>
            <p className="text-sm text-gray-500">
              Office of the Chairman, Theatre Commercialized Unit
            </p>
          </div>
        </div>
        {!noDuty && (
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/imprest/quarterly"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <CalendarClock className="h-4 w-4" /> Quarterly Position
            </Link>
            <Link
              href="/dashboard/imprest/new"
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
            >
              <Plus className="h-4 w-4" /> New Imprest
            </Link>
          </div>
        )}
      </div>

      {noDuty ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-900">No imprest duty assigned</p>
              <p className="text-sm text-amber-800">{error}</p>
              <p className="text-xs text-amber-700">
                An imprest duty (cashier, account officer, chairman, auditor…) is granted
                separately from your clinical role, because it governs the approval chain.
              </p>
              <Link
                href="/dashboard/imprest/duties"
                className="inline-block pt-1 text-xs font-semibold text-amber-900 underline"
              >
                Open Imprest Duties →
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryTile label="Approved" value={formatNaira(totals.approved)} />
            <SummaryTile label="Received" value={formatNaira(totals.received)} />
            <SummaryTile label="Unretired balance" value={formatNaira(totals.balance)} highlight />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search number, voucher or purpose…"
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">All statuses</option>
              {Object.keys(STATUS_STYLES).map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <button
              onClick={load}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>

          {error && !noDuty && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {error}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Imprest No.</th>
                  <th className="px-4 py-3">Purpose</th>
                  <th className="px-4 py-3">Officer</th>
                  <th className="px-4 py-3 text-right">Received</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3">Retire by</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && rows.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                      No imprest records yet. Create the first one with “New Imprest”.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className={r._offlinePending ? 'bg-amber-50/60' : 'hover:bg-gray-50'}>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <Link href={`/dashboard/imprest/${r.id}`} className="hover:text-primary-600">
                          {r.imprestNumber}
                        </Link>
                        {r._offlinePending && (
                          <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                            SAVED ON THIS DEVICE
                          </span>
                        )}
                      </td>
                      <td className="max-w-[260px] truncate px-4 py-3 text-gray-700">{r.purpose}</td>
                      <td className="px-4 py-3 text-gray-700">{r.receivingOfficer?.fullName ?? '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatNaira(r.amountReceived)}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">{formatNaira(r.balance)}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {r.expectedRetirementDate ? new Date(r.expectedRetirementDate).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[r.status] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                          {r.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'border-primary-200 bg-primary-50' : 'border-gray-200 bg-white'}`}>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${highlight ? 'text-primary-800' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}
