'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function PowerReadinessPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const [reports, setReports] = useState<any[]>([]);
  const [currentStatus, setCurrentStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    mainsStatus: 'ONLINE',
    mainsVoltage: '',
    generatorStatus: 'OFF',
    generatorFuelLevel: '',
    generatorRunHours: '',
    solarStatus: 'OFFLINE',
    solarOutputKw: '',
    batteryChargePercentage: '',
    upsStatus: 'ONLINE',
    upsBackupMinutes: '',
    overallReadinessStatus: 'READY',
    criticalIssues: '',
    maintenanceDue: '',
    estimatedBackupDuration: '',
    recommendedActions: '',
    notes: '',
  });

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (authStatus === 'authenticated') {
      fetchData();
    }
  }, [authStatus, router]);

  const fetchData = async () => {
    try {
      const [reportsRes, statusRes] = await Promise.all([
        fetch('/api/power-readiness'),
        fetch('/api/power-status?latest=true'),
      ]);

      if (reportsRes.ok) {
        const data = await reportsRes.json();
        setReports(data.reports);
      }

      if (statusRes.ok) {
        const data = await statusRes.json();
        setCurrentStatus(data.status);
        
        if (data.status) {
          setFormData(prev => ({
            ...prev,
            mainsStatus: data.status.mainsAvailable ? 'ONLINE' : 'OFFLINE',
            mainsVoltage: data.status.mainsVoltage?.toString() || '',
            generatorStatus: data.status.generatorStatus || 'OFF',
            generatorFuelLevel: data.status.dieselLevelLiters?.toString() || '',
            generatorRunHours: data.status.generatorRunHours?.toString() || '',
            solarStatus: data.status.solarSystemStatus || 'OFFLINE',
            solarOutputKw: data.status.solarOutputKw?.toString() || '',
            batteryChargePercentage: data.status.batteryChargePercentage?.toString() || '',
            upsStatus: data.status.upsStatus || 'ONLINE',
            upsBackupMinutes: data.status.upsBatteryBackupMinutes?.toString() || '',
          }));
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/power-readiness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          mainsVoltage: formData.mainsVoltage ? parseFloat(formData.mainsVoltage) : null,
          generatorFuelLevel: formData.generatorFuelLevel ? parseFloat(formData.generatorFuelLevel) : null,
          generatorRunHours: formData.generatorRunHours ? parseFloat(formData.generatorRunHours) : null,
          solarOutputKw: formData.solarOutputKw ? parseFloat(formData.solarOutputKw) : null,
          batteryChargePercentage: formData.batteryChargePercentage ? parseFloat(formData.batteryChargePercentage) : null,
          upsBackupMinutes: formData.upsBackupMinutes ? parseInt(formData.upsBackupMinutes) : null,
          estimatedBackupDuration: formData.estimatedBackupDuration ? parseFloat(formData.estimatedBackupDuration) : null,
        }),
      });

      if (response.ok) {
        setShowAddModal(false);
        fetchData();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create readiness report');
      }
    } catch (error) {
      console.error('Error creating readiness report:', error);
      alert('Failed to create readiness report');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="text-xl">Loading...</div></div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Power House Readiness Dashboard</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
        >
          Create Report
        </button>
      </div>

      {/* Current Status Overview */}
      {currentStatus && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className={`rounded-lg p-4 ${currentStatus.mainsAvailable ? 'bg-green-100' : 'bg-red-100'}`}>
            <div className={`text-sm font-medium ${currentStatus.mainsAvailable ? 'text-green-600' : 'text-red-600'}`}>
              Mains Power
            </div>
            <div className={`text-2xl font-bold ${currentStatus.mainsAvailable ? 'text-green-800' : 'text-red-800'}`}>
              {currentStatus.mainsAvailable ? 'Online' : 'Offline'}
            </div>
            {currentStatus.mainsVoltage && (
              <div className={`text-sm ${currentStatus.mainsAvailable ? 'text-green-700' : 'text-red-700'}`}>
                {currentStatus.mainsVoltage}V
              </div>
            )}
          </div>

          <div className={`rounded-lg p-4 ${currentStatus.generatorStatus === 'RUNNING' ? 'bg-green-100' : 'bg-gray-100'}`}>
            <div className={`text-sm font-medium ${currentStatus.generatorStatus === 'RUNNING' ? 'text-green-600' : 'text-gray-600'}`}>
              Generator
            </div>
            <div className={`text-2xl font-bold ${currentStatus.generatorStatus === 'RUNNING' ? 'text-green-800' : 'text-gray-800'}`}>
              {currentStatus.generatorStatus}
            </div>
            {currentStatus.dieselLevelLiters && (
              <div className={`text-sm ${currentStatus.generatorStatus === 'RUNNING' ? 'text-green-700' : 'text-gray-700'}`}>
                Fuel: {currentStatus.dieselLevelLiters}L
              </div>
            )}
          </div>

          <div className={`rounded-lg p-4 ${currentStatus.solarSystemStatus === 'ACTIVE' ? 'bg-yellow-100' : 'bg-gray-100'}`}>
            <div className={`text-sm font-medium ${currentStatus.solarSystemStatus === 'ACTIVE' ? 'text-yellow-600' : 'text-gray-600'}`}>
              Solar System
            </div>
            <div className={`text-2xl font-bold ${currentStatus.solarSystemStatus === 'ACTIVE' ? 'text-yellow-800' : 'text-gray-800'}`}>
              {currentStatus.solarSystemStatus}
            </div>
            {currentStatus.solarOutputKw && (
              <div className={`text-sm ${currentStatus.solarSystemStatus === 'ACTIVE' ? 'text-yellow-700' : 'text-gray-700'}`}>
                {currentStatus.solarOutputKw} kW
              </div>
            )}
          </div>

          <div className={`rounded-lg p-4 ${currentStatus.upsStatus === 'ONLINE' ? 'bg-purple-100' : 'bg-red-100'}`}>
            <div className={`text-sm font-medium ${currentStatus.upsStatus === 'ONLINE' ? 'text-purple-600' : 'text-red-600'}`}>
              UPS
            </div>
            <div className={`text-2xl font-bold ${currentStatus.upsStatus === 'ONLINE' ? 'text-purple-800' : 'text-red-800'}`}>
              {currentStatus.upsStatus}
            </div>
            {currentStatus.upsBatteryBackupMinutes && (
              <div className={`text-sm ${currentStatus.upsStatus === 'ONLINE' ? 'text-purple-700' : 'text-red-700'}`}>
                {currentStatus.upsBatteryBackupMinutes} min
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reports Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mains</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Generator</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Solar</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">UPS</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Backup Duration</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reported By</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {reports.map((report) => (
              <tr key={report.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(report.reportDate).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{report.mainsStatus}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{report.generatorStatus}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{report.solarStatus}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{report.upsStatus}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {report.estimatedBackupDuration ? `${report.estimatedBackupDuration} hrs` : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    report.overallReadinessStatus === 'READY' ? 'bg-green-100 text-green-800' :
                    report.overallReadinessStatus === 'LIMITED' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {report.overallReadinessStatus}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{report.reportedBy.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">Create Readiness Report</h2>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Mains Status</label>
                  <select
                    value={formData.mainsStatus}
                    onChange={(e) => setFormData({ ...formData, mainsStatus: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="ONLINE">Online</option>
                    <option value="OFFLINE">Offline</option>
                    <option value="UNSTABLE">Unstable</option>
                    <option value="FAULT">Fault</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Mains Voltage (V)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.mainsVoltage}
                    onChange={(e) => setFormData({ ...formData, mainsVoltage: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div></div>

                <div>
                  <label className="block text-sm font-medium mb-2">Generator Status</label>
                  <select
                    value={formData.generatorStatus}
                    onChange={(e) => setFormData({ ...formData, generatorStatus: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="OFF">Off</option>
                    <option value="RUNNING">Running</option>
                    <option value="STANDBY">Standby</option>
                    <option value="FAULT">Fault</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Fuel Level (L)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.generatorFuelLevel}
                    onChange={(e) => setFormData({ ...formData, generatorFuelLevel: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Run Hours</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.generatorRunHours}
                    onChange={(e) => setFormData({ ...formData, generatorRunHours: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Solar Status</label>
                  <select
                    value={formData.solarStatus}
                    onChange={(e) => setFormData({ ...formData, solarStatus: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="OFFLINE">Offline</option>
                    <option value="ACTIVE">Active</option>
                    <option value="CHARGING">Charging</option>
                    <option value="FAULT">Fault</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Solar Output (kW)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.solarOutputKw}
                    onChange={(e) => setFormData({ ...formData, solarOutputKw: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Battery Charge (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.batteryChargePercentage}
                    onChange={(e) => setFormData({ ...formData, batteryChargePercentage: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">UPS Status</label>
                  <select
                    value={formData.upsStatus}
                    onChange={(e) => setFormData({ ...formData, upsStatus: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="ONLINE">Online</option>
                    <option value="ON_BATTERY">On Battery</option>
                    <option value="OFFLINE">Offline</option>
                    <option value="FAULT">Fault</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">UPS Backup (min)</label>
                  <input
                    type="number"
                    value={formData.upsBackupMinutes}
                    onChange={(e) => setFormData({ ...formData, upsBackupMinutes: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Est. Backup Duration (hrs)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.estimatedBackupDuration}
                    onChange={(e) => setFormData({ ...formData, estimatedBackupDuration: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="block text-sm font-medium mb-2">Overall Readiness Status *</label>
                  <select
                    required
                    value={formData.overallReadinessStatus}
                    onChange={(e) => setFormData({ ...formData, overallReadinessStatus: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="READY">Ready</option>
                    <option value="LIMITED">Limited</option>
                    <option value="NOT_READY">Not Ready</option>
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium mb-2">Critical Issues</label>
                <textarea
                  value={formData.criticalIssues}
                  onChange={(e) => setFormData({ ...formData, criticalIssues: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  rows={2}
                />
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium mb-2">Maintenance Due</label>
                <textarea
                  value={formData.maintenanceDue}
                  onChange={(e) => setFormData({ ...formData, maintenanceDue: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  rows={2}
                />
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium mb-2">Recommended Actions</label>
                <textarea
                  value={formData.recommendedActions}
                  onChange={(e) => setFormData({ ...formData, recommendedActions: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  rows={2}
                />
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium mb-2">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  rows={2}
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
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Create Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
