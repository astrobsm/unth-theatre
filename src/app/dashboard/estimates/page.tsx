'use client';

// The estimate list. Drafts first, because a draft is unfinished work somebody
// is waiting on — a patient cannot be told a cost until it is done.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, Search, TriangleAlert } from 'lucide-react';
import { formatNaira } from '@/lib/estimates/calculate';

interface Row {
  id: string;
  estimateNumber: string;
  status: string;
  revision: number;
  patientName: string;
  folderNumber?: string | null;
  procedureName: string;
  totalKobo: number;
  plannedDate?: string | null;
  createdAt: string;
  lines: { id: string }[];
}

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-amber-100 text-amber-800',
  PENDING_REVIEW: 'bg-orange-100 text-orange-800',
  APPROVED: 'bg-green-100 text-green-800',
  ISSUED: 'bg-blue-100 text-blue-800',
  REVISED: 'bg-indigo-100 text-indigo-800',
  EXPIRED: 'bg-gray-200 text-gray-700',
  CANCELLED: 'bg-gray-200 text-gray-600',
  SUPERSEDED: 'bg-gray-200 text-gray-600',
};

export default function EstimatesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/estimates${status ? `?status=${status}` : ''}`);
        const data = await res.json();
        setRows(data.estimates ?? []);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [status]);

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return [r.estimateNumber, r.patientName, r.procedureName, r.folderNumber ?? '']
      .some((f) => f.toLowerCase().includes(needle));
  });

  // Drafts first, then by newest. A draft is the only status with work
  // outstanding, so it belongs at the top regardless of date.
  const sorted = [...filtered].sort((a, b) => {
    const aDraft = a.status === 'DRAFT' ? 0 : 1;
    const bDraft = b.status === 'DRAFT' ? 0 : 1;
    if (aDraft !== bDraft) return aDraft - bDraft;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Surgery cost estimates</h1>
        <p className="text-sm text-gray-600">
          A draft is created automatically when a case is booked. Cost it, approve it, then give it to the patient.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Patient, folder number, procedure or estimate number"
            className="w-full rounded border-gray-300 pl-9 text-sm"
          />
        </div>
        <select
          value={status} onChange={(e) => setStatus(e.target.value)}
          className="rounded border-gray-300 text-sm"
        >
          <option value="">All statuses</option>
          {['DRAFT', 'APPROVED', 'ISSUED', 'CANCELLED', 'SUPERSEDED', 'EXPIRED'].map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed p-10 text-center text-gray-500">
          <FileText className="mx-auto mb-3 h-10 w-10 text-gray-400" />
          <p>No estimates yet. One is created automatically each time a case is booked.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Estimate</th>
                <th className="px-4 py-3 text-left">Patient</th>
                <th className="px-4 py-3 text-left">Procedure</th>
                <th className="px-4 py-3 text-left">Planned</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/estimates/${r.id}`} className="font-semibold text-blue-800 hover:underline">
                      {r.estimateNumber}
                    </Link>
                    {r.revision > 1 && <span className="ml-1 text-xs text-gray-500">rev {r.revision}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{r.patientName}</div>
                    {r.folderNumber && <div className="text-xs text-gray-500">{r.folderNumber}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{r.procedureName}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {r.plannedDate ? r.plannedDate.slice(0, 10) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {r.totalKobo > 0 ? formatNaira(r.totalKobo) : (
                      // Not "₦0.00" — that reads as "this operation is free"
                      // rather than "nobody has costed this yet".
                      <span className="inline-flex items-center gap-1 text-amber-700">
                        <TriangleAlert className="h-3.5 w-3.5" /> not costed
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-bold uppercase ${
                      STATUS_STYLE[r.status] ?? 'bg-gray-100 text-gray-700'}`}>
                      {r.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
