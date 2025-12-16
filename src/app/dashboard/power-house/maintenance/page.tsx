'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function PowerMaintenancePage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const [logs, setLogs] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    statusId: '',
    maintenanceType: 'ROUTINE',
    componentServiced: '',
    workPerformed: '',
    partsReplaced: '',
    partsCost: '',
    nextServiceDate: '',
    maintenanceStatus: 'COMPLETED',
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
      const [logsRes, statusesRes] = await Promise.all([
        fetch('/api/power-maintenance'),
        fetch('/api/power-status'),
      ]);

      if (logsRes.ok) {
        const data = await logsRes.json();
        setLogs(data.logs);
      }
      if (statusesRes.ok) {
        const data = await statusesRes.json();
        setStatuses(data.statuses.slice(0, 10)); // Last 10 statuses
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
      const response = await fetch('/api/power-maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          partsCost: formData.partsCost ? parseFloat(formData.partsCost) : null,
        }),
      });

      if (response.ok) {
        setShowAddModal(false);
        setFormData({
          statusId: '',
          maintenanceType: 'ROUTINE',
          componentServiced: '',
          workPerformed: '',
          partsReplaced: '',
          partsCost: '',
          nextServiceDate: '',
          maintenanceStatus: 'COMPLETED',
          notes: '',
        });
        fetchData();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create maintenance log');
      }
    } catch (error) {
      console.error('Error creating maintenance log:', error);
      alert('Failed to create maintenance log');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="text-xl">Loading...</div></div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Power House Maintenance Logs</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
        >
          Add Maintenance Log
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Component</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Work Performed</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Parts Cost</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Technician</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(log.maintenanceDate).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    log.maintenanceType === 'ROUTINE' ? 'bg-blue-100 text-blue-800' :
                    log.maintenanceType === 'PREVENTIVE' ? 'bg-green-100 text-green-800' :
                    log.maintenanceType === 'CORRECTIVE' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {log.maintenanceType}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{log.componentServiced}</td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  <div className="max-w-xs truncate">{log.workPerformed}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {log.partsCost ? `₦${log.partsCost.toLocaleString()}` : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    log.maintenanceStatus === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                    log.maintenanceStatus === 'IN_PROGRESS' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {log.maintenanceStatus}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.technician.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">Add Maintenance Log</h2>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">Related Power Status</label>
                  <select
                    value={formData.statusId}
                    onChange={(e) => setFormData({ ...formData, statusId: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="">Select Status (optional)</option>
                    {statuses.map((status) => (
                      <option key={status.id} value={status.id}>
                        {new Date(status.timestamp).toLocaleString()} - {status.currentPowerSource}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Maintenance Type *</label>
                  <select
                    required
                    value={formData.maintenanceType}
                    onChange={(e) => setFormData({ ...formData, maintenanceType: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="ROUTINE">Routine</option>
                    <option value="PREVENTIVE">Preventive</option>
                    <option value="CORRECTIVE">Corrective</option>
                    <option value="EMERGENCY">Emergency</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Component Serviced *</label>
                  <input
                    type="text"
                    required
                    value={formData.componentServiced}
                    onChange={(e) => setFormData({ ...formData, componentServiced: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="e.g., Generator Engine, Solar Panels"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">Work Performed *</label>
                  <textarea
                    required
                    value={formData.workPerformed}
                    onChange={(e) => setFormData({ ...formData, workPerformed: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Parts Replaced</label>
                  <input
                    type="text"
                    value={formData.partsReplaced}
                    onChange={(e) => setFormData({ ...formData, partsReplaced: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Parts Cost (₦)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.partsCost}
                    onChange={(e) => setFormData({ ...formData, partsCost: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Next Service Date</label>
                  <input
                    type="date"
                    value={formData.nextServiceDate}
                    onChange={(e) => setFormData({ ...formData, nextServiceDate: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Maintenance Status</label>
                  <select
                    value={formData.maintenanceStatus}
                    onChange={(e) => setFormData({ ...formData, maintenanceStatus: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="COMPLETED">Completed</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="PENDING">Pending</option>
                  </select>
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium mb-2">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  rows={3}
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
                  Add Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
