'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Shirt, AlertTriangle, CheckCircle, Clock, Package, TrendingUp, BarChart3 } from 'lucide-react';

export default function LaundrySupervisorDashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [readinessReports, setReadinessReports] = useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    shiftType: 'MORNING',
    overallReadiness: 'READY',
    surgicalGownsClean: 0,
    surgicalDrapesClean: 0,
    patientGownsClean: 0,
    bedSheetsClean: 0,
    towelsClean: 0,
    scrubSuitsClean: 0,
    itemsSentForWashing: '',
    itemsTransferredToCssd: '',
    criticalShortages: '',
    faultsReported: '',
    notes: '',
  });

  useEffect(() => {
    if (
      session?.user?.role &&
      !['LAUNDRY_STAFF', 'LAUNDRY_SUPERVISOR', 'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER'].includes(
        session.user.role
      )
    ) {
      router.push('/dashboard');
      return;
    }
    fetchData();
  }, [session, router]);

  const fetchData = async () => {
    try {
      const [statsRes, laundryRes] = await Promise.all([
        fetch('/api/dashboard/stats'),
        fetch('/api/laundry'),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (laundryRes.ok) {
        const data = await laundryRes.json();
        setReadinessReports(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch('/api/laundry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.redAlertTriggered) {
          alert('🔴 RED ALERT dispatched to all admins and maintenance staff.');
        }
        setShowAddModal(false);
        setFormData({
          shiftType: 'MORNING',
          overallReadiness: 'READY',
          surgicalGownsClean: 0,
          surgicalDrapesClean: 0,
          patientGownsClean: 0,
          bedSheetsClean: 0,
          towelsClean: 0,
          scrubSuitsClean: 0,
          itemsSentForWashing: '',
          itemsTransferredToCssd: '',
          criticalShortages: '',
          faultsReported: '',
          notes: '',
        });
        fetchData();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create laundry report');
      }
    } catch (error) {
      console.error('Error creating laundry report:', error);
      alert('Failed to create laundry report');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const readyCount = readinessReports.filter((r: any) => r.overallReadiness === 'READY').length;
  const pendingCount = readinessReports.filter((r: any) => r.overallReadiness && r.overallReadiness !== 'READY').length;
  const willTriggerRedAlert = Boolean(formData.faultsReported.trim());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Laundry Dashboard</h1>
          <p className="text-gray-600">Theatre linen, washing &amp; CSSD transfer management</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} className="btn-secondary text-sm">Refresh</button>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
          >
            Create Report
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Reports</p>
              <p className="text-2xl font-bold">{readinessReports.length}</p>
            </div>
            <Shirt className="h-8 w-8 text-blue-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Ready</p>
              <p className="text-2xl font-bold">{readyCount}</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Pending</p>
              <p className="text-2xl font-bold">{pendingCount}</p>
            </div>
            <Clock className="h-8 w-8 text-orange-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Today&apos;s Surgeries</p>
              <p className="text-2xl font-bold">{stats?.todaySurgeries ?? 0}</p>
            </div>
            <BarChart3 className="h-8 w-8 text-purple-500" />
          </div>
        </div>
      </div>

      {/* Recent Readiness Reports */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Shirt className="h-5 w-5 text-blue-600" />
          Laundry Readiness Reports
        </h3>
        {readinessReports.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Shift</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Sent for Washing</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Transferred to CSSD</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Alert</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Reported By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {readinessReports.slice(0, 20).map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">{new Date(r.reportDate || r.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">{r.shiftType || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        r.overallReadiness === 'READY' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {r.overallReadiness || 'Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{r.itemsSentForWashing || '-'}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{r.itemsTransferredToCssd || '-'}</td>
                    <td className="px-4 py-3">
                      {r.redAlertTriggered ? (
                        <span className="px-2 py-1 text-xs rounded-full bg-red-600 text-white">🔴 RED</span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{r.reportedBy?.fullName || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No readiness reports. Linen status data will appear here.</p>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Quick Access</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: 'Theatre Readiness', href: '/dashboard/theatre-readiness', icon: CheckCircle },
            { label: 'Theatre Allocation', href: '/dashboard/theatres', icon: Package },
            { label: 'Reports', href: '/dashboard/reports', icon: TrendingUp },
          ].map((link) => (
            <button
              key={link.href}
              onClick={() => router.push(link.href)}
              className="flex items-center gap-2 p-3 border rounded-lg hover:bg-blue-50 hover:border-blue-300 transition text-sm"
            >
              <link.icon className="h-4 w-4 text-blue-600" />
              {link.label}
            </button>
          ))}
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">Create Laundry Report</h2>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Shift *</label>
                  <select
                    required
                    aria-label="Shift"
                    value={formData.shiftType}
                    onChange={(e) => setFormData({ ...formData, shiftType: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="MORNING">Morning</option>
                    <option value="AFTERNOON">Afternoon</option>
                    <option value="NIGHT">Night</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Overall Readiness *</label>
                  <select
                    required
                    aria-label="Overall readiness"
                    value={formData.overallReadiness}
                    onChange={(e) => setFormData({ ...formData, overallReadiness: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="READY">Ready</option>
                    <option value="PARTIALLY_READY">Partially Ready</option>
                    <option value="NOT_READY">Not Ready</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-sm font-semibold mb-2">Clean Linen Counts</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {([
                    ['surgicalGownsClean', 'Surgical Gowns'],
                    ['surgicalDrapesClean', 'Surgical Drapes'],
                    ['patientGownsClean', 'Patient Gowns'],
                    ['bedSheetsClean', 'Bed Sheets'],
                    ['towelsClean', 'Towels'],
                    ['scrubSuitsClean', 'Scrub Suits'],
                  ] as const).map(([key, label]) => (
                    <div key={key}>
                      <label className="block text-xs text-gray-500 mb-1">{label}</label>
                      <input
                        type="number"
                        min={0}
                        aria-label={label}
                        placeholder="0"
                        value={(formData as any)[key]}
                        onChange={(e) => setFormData({ ...formData, [key]: parseInt(e.target.value) || 0 })}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium mb-1">Theatre Items Sent to Laundry for Washing</label>
                <textarea
                  value={formData.itemsSentForWashing}
                  onChange={(e) => setFormData({ ...formData, itemsSentForWashing: e.target.value })}
                  rows={2}
                  placeholder="List items sent for washing (e.g. 20 surgical gowns, 15 drapes from Theatre 1)..."
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium mb-1">Washed Items Transferred to CSSD for Sterilization</label>
                <textarea
                  value={formData.itemsTransferredToCssd}
                  onChange={(e) => setFormData({ ...formData, itemsTransferredToCssd: e.target.value })}
                  rows={2}
                  placeholder="List washed items transferred to CSSD for sterilization..."
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium mb-1">Critical Shortages (optional)</label>
                <textarea
                  value={formData.criticalShortages}
                  onChange={(e) => setFormData({ ...formData, criticalShortages: e.target.value })}
                  rows={2}
                  placeholder="Any critically low linen items..."
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div className="mt-4 border-2 border-red-200 rounded-lg p-4 bg-red-50">
                <label className="block text-sm font-bold text-red-700 mb-1">⚠️ Faults / Malfunctions</label>
                <p className="text-xs text-red-600 mb-2">
                  Any entry here triggers an immediate <strong>RED ALERT</strong> to all admins and maintenance staff.
                </p>
                <textarea
                  value={formData.faultsReported}
                  onChange={(e) => setFormData({ ...formData, faultsReported: e.target.value })}
                  rows={2}
                  placeholder="Describe any faulty washing machine, dryer or blocking issue..."
                  className="w-full border rounded-lg px-3 py-2"
                />
                {willTriggerRedAlert && (
                  <div className="mt-2 bg-red-600 text-white text-sm font-semibold rounded-lg px-3 py-2">
                    🔴 This report will trigger a RED ALERT on submission.
                  </div>
                )}
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium mb-1">Notes (optional)</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  placeholder="Additional notes..."
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div className="flex justify-end gap-4 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Create Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
