'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function PowerHouseStatusPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const [currentStatus, setCurrentStatus] = useState<any>(null);
  const [statusHistory, setStatusHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [formData, setFormData] = useState({
    currentPowerSource: 'MAINS',
    mainsAvailable: true,
    mainsVoltage: '',
    generatorStatus: 'OFF',
    generatorRunHours: '',
    generatorLoadPercentage: '',
    solarSystemStatus: 'OFFLINE',
    solarOutputKw: '',
    batteryChargePercentage: '',
    dieselLevelLiters: '',
    dieselConsumptionRate: '',
    estimatedDieselRuntime: '',
    upsStatus: 'ONLINE',
    upsLoadPercentage: '',
    upsBatteryBackupMinutes: '',
    overallStatus: 'NORMAL',
    issues: '',
    notes: '',
  });

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (authStatus === 'authenticated') {
      fetchData();
      const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [authStatus, router]);

  const fetchData = async () => {
    try {
      const [latestRes, historyRes] = await Promise.all([
        fetch('/api/power-status?latest=true'),
        fetch('/api/power-status'),
      ]);

      if (latestRes.ok) {
        const data = await latestRes.json();
        setCurrentStatus(data.status);
      }

      if (historyRes.ok) {
        const data = await historyRes.json();
        setStatusHistory(data.statuses);
      }
    } catch (error) {
      console.error('Error fetching power status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/power-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          mainsVoltage: formData.mainsVoltage ? parseFloat(formData.mainsVoltage) : null,
          generatorRunHours: formData.generatorRunHours ? parseFloat(formData.generatorRunHours) : null,
          generatorLoadPercentage: formData.generatorLoadPercentage ? parseFloat(formData.generatorLoadPercentage) : null,
          solarOutputKw: formData.solarOutputKw ? parseFloat(formData.solarOutputKw) : null,
          batteryChargePercentage: formData.batteryChargePercentage ? parseFloat(formData.batteryChargePercentage) : null,
          dieselLevelLiters: formData.dieselLevelLiters ? parseFloat(formData.dieselLevelLiters) : null,
          dieselConsumptionRate: formData.dieselConsumptionRate ? parseFloat(formData.dieselConsumptionRate) : null,
          estimatedDieselRuntime: formData.estimatedDieselRuntime ? parseFloat(formData.estimatedDieselRuntime) : null,
          upsLoadPercentage: formData.upsLoadPercentage ? parseFloat(formData.upsLoadPercentage) : null,
          upsBatteryBackupMinutes: formData.upsBatteryBackupMinutes ? parseInt(formData.upsBatteryBackupMinutes) : null,
        }),
      });

      if (response.ok) {
        setShowUpdateModal(false);
        fetchData();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to update power status');
      }
    } catch (error) {
      console.error('Error updating power status:', error);
      alert('Failed to update power status');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="text-xl">Loading...</div></div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Power House Status</h1>
        <button
          onClick={() => setShowUpdateModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
        >
          Update Status
        </button>
      </div>

      {/* Current Status Dashboard */}
      {currentStatus && (
        <div className="mb-8">
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">Current Power Status</h2>
              <span className={`px-4 py-2 rounded-full text-lg font-semibold ${
                currentStatus.overallStatus === 'NORMAL' ? 'bg-green-100 text-green-800' :
                currentStatus.overallStatus === 'WARNING' ? 'bg-yellow-100 text-yellow-800' :
                currentStatus.overallStatus === 'CRITICAL' ? 'bg-red-100 text-red-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {currentStatus.overallStatus}
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Mains Power */}
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-sm font-medium text-blue-600">Mains Power</div>
                <div className="text-2xl font-bold text-blue-900">
                  {currentStatus.mainsAvailable ? 'Available' : 'Unavailable'}
                </div>
                {currentStatus.mainsVoltage && (
                  <div className="text-sm text-blue-700">{currentStatus.mainsVoltage}V</div>
                )}
              </div>

              {/* Generator */}
              <div className="bg-orange-50 rounded-lg p-4">
                <div className="text-sm font-medium text-orange-600">Generator</div>
                <div className="text-2xl font-bold text-orange-900">{currentStatus.generatorStatus}</div>
                {currentStatus.generatorLoadPercentage !== null && (
                  <div className="text-sm text-orange-700">Load: {currentStatus.generatorLoadPercentage}%</div>
                )}
              </div>

              {/* Solar System */}
              <div className="bg-yellow-50 rounded-lg p-4">
                <div className="text-sm font-medium text-yellow-600">Solar System</div>
                <div className="text-2xl font-bold text-yellow-900">{currentStatus.solarSystemStatus}</div>
                {currentStatus.solarOutputKw !== null && (
                  <div className="text-sm text-yellow-700">Output: {currentStatus.solarOutputKw} kW</div>
                )}
              </div>

              {/* UPS */}
              <div className="bg-purple-50 rounded-lg p-4">
                <div className="text-sm font-medium text-purple-600">UPS</div>
                <div className="text-2xl font-bold text-purple-900">{currentStatus.upsStatus}</div>
                {currentStatus.upsBatteryBackupMinutes !== null && (
                  <div className="text-sm text-purple-700">Backup: {currentStatus.upsBatteryBackupMinutes} min</div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              {/* Diesel Level */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm font-medium text-gray-600">Diesel Level</div>
                <div className="text-xl font-bold text-gray-900">
                  {currentStatus.dieselLevelLiters !== null ? `${currentStatus.dieselLevelLiters} L` : 'N/A'}
                </div>
                {currentStatus.estimatedDieselRuntime !== null && (
                  <div className="text-sm text-gray-700">Runtime: ~{currentStatus.estimatedDieselRuntime} hrs</div>
                )}
              </div>

              {/* Battery Charge */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm font-medium text-gray-600">Battery Charge</div>
                <div className="text-xl font-bold text-gray-900">
                  {currentStatus.batteryChargePercentage !== null ? `${currentStatus.batteryChargePercentage}%` : 'N/A'}
                </div>
              </div>

              {/* Current Source */}
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-sm font-medium text-green-600">Active Source</div>
                <div className="text-xl font-bold text-green-900">{currentStatus.currentPowerSource}</div>
              </div>
            </div>

            {currentStatus.issues && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="text-sm font-medium text-red-600 mb-1">Issues:</div>
                <div className="text-sm text-red-800">{currentStatus.issues}</div>
              </div>
            )}

            <div className="mt-4 text-xs text-gray-500">
              Last updated: {new Date(currentStatus.timestamp).toLocaleString()} by {currentStatus.recordedBy.name}
            </div>
          </div>
        </div>
      )}

      {/* Status History */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-bold">Status History</h2>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Power Source</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mains</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Generator</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recorded By</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {statusHistory.map((status) => (
              <tr key={status.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(status.timestamp).toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {status.currentPowerSource}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {status.mainsAvailable ? '✓ Available' : '✗ Unavailable'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {status.generatorStatus}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    status.overallStatus === 'NORMAL' ? 'bg-green-100 text-green-800' :
                    status.overallStatus === 'WARNING' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {status.overallStatus}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {status.recordedBy.name}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showUpdateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">Update Power Status</h2>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium mb-2">Current Power Source *</label>
                  <select
                    required
                    value={formData.currentPowerSource}
                    onChange={(e) => setFormData({ ...formData, currentPowerSource: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="MAINS">Mains</option>
                    <option value="GENERATOR">Generator</option>
                    <option value="SOLAR">Solar</option>
                    <option value="UPS">UPS</option>
                  </select>
                </div>

                {/* Mains */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.mainsAvailable}
                    onChange={(e) => setFormData({ ...formData, mainsAvailable: e.target.checked })}
                    className="mr-2"
                  />
                  <label className="text-sm font-medium">Mains Available</label>
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

                {/* Generator */}
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
                  <label className="block text-sm font-medium mb-2">Load (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.generatorLoadPercentage}
                    onChange={(e) => setFormData({ ...formData, generatorLoadPercentage: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>

                {/* Solar */}
                <div>
                  <label className="block text-sm font-medium mb-2">Solar Status</label>
                  <select
                    value={formData.solarSystemStatus}
                    onChange={(e) => setFormData({ ...formData, solarSystemStatus: e.target.value })}
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

                {/* Diesel */}
                <div>
                  <label className="block text-sm font-medium mb-2">Diesel Level (L)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.dieselLevelLiters}
                    onChange={(e) => setFormData({ ...formData, dieselLevelLiters: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Consumption Rate (L/hr)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.dieselConsumptionRate}
                    onChange={(e) => setFormData({ ...formData, dieselConsumptionRate: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Est. Runtime (hrs)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.estimatedDieselRuntime}
                    onChange={(e) => setFormData({ ...formData, estimatedDieselRuntime: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>

                {/* UPS */}
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
                  <label className="block text-sm font-medium mb-2">UPS Load (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.upsLoadPercentage}
                    onChange={(e) => setFormData({ ...formData, upsLoadPercentage: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Backup (minutes)</label>
                  <input
                    type="number"
                    value={formData.upsBatteryBackupMinutes}
                    onChange={(e) => setFormData({ ...formData, upsBatteryBackupMinutes: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>

                {/* Overall Status */}
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium mb-2">Overall Status *</label>
                  <select
                    required
                    value={formData.overallStatus}
                    onChange={(e) => setFormData({ ...formData, overallStatus: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="NORMAL">Normal</option>
                    <option value="WARNING">Warning</option>
                    <option value="CRITICAL">Critical</option>
                    <option value="OFFLINE">Offline</option>
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium mb-2">Issues</label>
                <textarea
                  value={formData.issues}
                  onChange={(e) => setFormData({ ...formData, issues: e.target.value })}
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
                  onClick={() => setShowUpdateModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Update Status
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
