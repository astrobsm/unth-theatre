'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

interface SurgeryItem {
  id: string;
  procedureName: string;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
  unit?: string;
  theatreName?: string | null;
  patient?: { name?: string; folderNumber?: string; ward?: string };
  surgeon?: { fullName?: string };
  surgeonName?: string;
  pacuAssessment?: { id: string } | null;
}

interface SurgeryGroup {
  key: string;
  dateLabel: string;
  unitLabel: string;
  items: SurgeryItem[];
}

export default function CompletedSurgeriesPage() {
  const [items, setItems] = useState<SurgeryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/surgeries?status=COMPLETED');
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((s) =>
      (s.patient?.name || '').toLowerCase().includes(q) ||
      (s.patient?.folderNumber || '').toLowerCase().includes(q) ||
      (s.procedureName || '').toLowerCase().includes(q)
    );
  }, [items, query]);

  // Sort by date (newest first), then by operating unit, then by time; grouped for display.
  const groups = useMemo<SurgeryGroup[]>(() => {
    const dayKey = (s: SurgeryItem) => {
      const d = new Date(s.scheduledDate);
      return isNaN(d.getTime()) ? '0000-00-00' : d.toISOString().slice(0, 10);
    };
    const unitOf = (s: SurgeryItem) => (s.unit || 'Unassigned Unit').trim();

    const sorted = [...filtered].sort((a, b) => {
      // Date descending (most recent first)
      const da = dayKey(a);
      const db = dayKey(b);
      if (da !== db) return da < db ? 1 : -1;
      // Operating unit ascending
      const ua = unitOf(a).toLowerCase();
      const ub = unitOf(b).toLowerCase();
      if (ua !== ub) return ua < ub ? -1 : 1;
      // Time ascending
      return (a.scheduledTime || '').localeCompare(b.scheduledTime || '');
    });

    const map = new Map<string, SurgeryGroup>();
    for (const s of sorted) {
      const key = `${dayKey(s)}::${unitOf(s)}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          dateLabel: new Date(s.scheduledDate).toLocaleDateString('en-GB', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }),
          unitLabel: unitOf(s),
          items: [],
        });
      }
      map.get(key)!.items.push(s);
    }
    return Array.from(map.values());
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Completed Surgeries</h1>
          <p className="text-gray-600 mt-1">Select patient to write post-operative notes or admit to PACU</p>
        </div>
        <Link href="/dashboard/surgeries" className="btn-secondary">Back to Surgeries</Link>
      </div>

      <div className="card">
        <input
          type="text"
          className="input-field"
          placeholder="Search by patient, folder number, procedure"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="card">
          <div className="py-8 text-center text-gray-500">Loading completed surgeries...</div>
        </div>
      ) : groups.length === 0 ? (
        <div className="card">
          <div className="py-8 text-center text-gray-500">No completed surgeries found.</div>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.key} className="card">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-3 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{group.dateLabel}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                    {group.unitLabel}
                  </span>
                </div>
                <span className="text-xs text-gray-500">
                  {group.items.length} {group.items.length === 1 ? 'surgery' : 'surgeries'}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Patient</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Procedure</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Surgeon</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Theatre</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {group.items.map((s) => (
                      <tr key={s.id}>
                        <td className="px-4 py-3 text-sm">
                          <div className="font-medium text-gray-900">{s.patient?.name || 'Unknown'}</div>
                          <div className="text-gray-500">{s.patient?.folderNumber || 'N/A'} {s.patient?.ward ? `• ${s.patient.ward}` : ''}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">{s.procedureName}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{s.surgeon?.fullName || s.surgeonName || 'Not assigned'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{s.theatreName || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{s.scheduledTime}</td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/dashboard/surgeries/${s.id}/journey`} className="text-blue-700 hover:text-blue-900 font-medium">
                              View Journey
                            </Link>
                            <Link href={`/dashboard/surgeries/${s.id}/post-op-notes`} className="text-indigo-600 hover:text-indigo-800 font-medium">
                              Post-Op Notes
                            </Link>
                            {s.pacuAssessment ? (
                              <Link href={`/dashboard/pacu/${s.pacuAssessment.id}`} className="text-green-700 hover:text-green-900 font-medium">
                                Open PACU
                              </Link>
                            ) : (
                              <Link href={`/dashboard/pacu/new?surgeryId=${s.id}`} className="text-green-600 hover:text-green-800 font-medium">
                                Admit to PACU
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
