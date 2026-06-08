'use client';

/**
 * Oxygen Control history: lists past readiness reports and alerts.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Wind, AlertOctagon, Loader2 } from 'lucide-react';

interface OxygenReadiness {
  id: string;
  reportDate: string;
  shiftType: string;
  overallReadiness: string;
  centralOxygenStatus: string;
  predictedShortage: boolean;
  reportedBy?: { fullName: string };
}

interface OxygenAlert {
  id: string;
  alertDate: string;
  alertType: string;
  severity: string;
  status: string;
  location: string;
  triggeredBy?: { fullName: string; role: string };
}

export default function OxygenHistoryPage() {
  const [reports, setReports] = useState<OxygenReadiness[]>([]);
  const [alerts, setAlerts] = useState<OxygenAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [rRes, aRes] = await Promise.all([
          fetch('/api/oxygen/readiness'),
          fetch('/api/oxygen/alerts'),
        ]);
        if (rRes.ok) {
          const data = await rRes.json();
          if (Array.isArray(data)) setReports(data);
        }
        if (aRes.ok) {
          const data = await aRes.json();
          if (Array.isArray(data)) setAlerts(data);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <Link
        href="/dashboard/oxygen-control"
        className="text-blue-700 hover:text-blue-900 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Oxygen Control
      </Link>

      <header>
        <h1 className="text-2xl font-bold text-blue-900">Oxygen History</h1>
        <p className="text-sm text-gray-600">All readiness reports and alerts.</p>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <>
          <section className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <header className="px-5 py-3 border-b border-gray-200 flex items-center gap-2 text-blue-900 font-semibold">
              <Wind className="w-4 h-4" /> Readiness reports ({reports.length})
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Shift</th>
                    <th className="px-4 py-2 text-left">Readiness</th>
                    <th className="px-4 py-2 text-left">Central status</th>
                    <th className="px-4 py-2 text-left">Shortage?</th>
                    <th className="px-4 py-2 text-left">Reported by</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                        No reports yet.
                      </td>
                    </tr>
                  ) : (
                    reports.map((r) => (
                      <tr key={r.id} className="border-t border-gray-100">
                        <td className="px-4 py-2">{new Date(r.reportDate).toLocaleString('en-GB')}</td>
                        <td className="px-4 py-2">{r.shiftType}</td>
                        <td className="px-4 py-2 font-semibold">{r.overallReadiness}</td>
                        <td className="px-4 py-2">{r.centralOxygenStatus}</td>
                        <td className="px-4 py-2">{r.predictedShortage ? 'Yes' : 'No'}</td>
                        <td className="px-4 py-2">{r.reportedBy?.fullName ?? '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <header className="px-5 py-3 border-b border-gray-200 flex items-center gap-2 text-red-700 font-semibold">
              <AlertOctagon className="w-4 h-4" /> Alerts ({alerts.length})
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Type</th>
                    <th className="px-4 py-2 text-left">Severity</th>
                    <th className="px-4 py-2 text-left">Location</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Triggered by</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                        No alerts on record.
                      </td>
                    </tr>
                  ) : (
                    alerts.map((a) => (
                      <tr key={a.id} className="border-t border-gray-100">
                        <td className="px-4 py-2">{new Date(a.alertDate).toLocaleString('en-GB')}</td>
                        <td className="px-4 py-2">{a.alertType.replace(/_/g, ' ')}</td>
                        <td className="px-4 py-2 font-semibold">{a.severity}</td>
                        <td className="px-4 py-2">{a.location}</td>
                        <td className="px-4 py-2">{a.status}</td>
                        <td className="px-4 py-2">
                          {a.triggeredBy?.fullName ?? '—'}{' '}
                          <span className="text-gray-500 text-xs">({a.triggeredBy?.role ?? '—'})</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
