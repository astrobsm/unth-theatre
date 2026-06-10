'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

interface SurgeryItem {
  id: string;
  procedureName: string;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
  patient?: { name?: string; folderNumber?: string; ward?: string };
  surgeon?: { fullName?: string };
  surgeonName?: string;
  pacuAssessment?: { id: string } | null;
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

      <div className="card">
        {loading ? (
          <div className="py-8 text-center text-gray-500">Loading completed surgeries...</div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-gray-500">No completed surgeries found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Patient</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Procedure</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Surgeon</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date/Time</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium text-gray-900">{s.patient?.name || 'Unknown'}</div>
                      <div className="text-gray-500">{s.patient?.folderNumber || 'N/A'} {s.patient?.ward ? `• ${s.patient.ward}` : ''}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{s.procedureName}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{s.surgeon?.fullName || s.surgeonName || 'Not assigned'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(s.scheduledDate).toLocaleDateString('en-GB')} • {s.scheduledTime}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
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
        )}
      </div>
    </div>
  );
}
