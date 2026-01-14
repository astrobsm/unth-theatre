'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import SmartTextInput from '@/components/SmartTextInput';

export default function CssdSterilizationPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [logs, setLogs] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    inventoryId: '',
    sterilizationMethod: 'AUTOCLAVE',
    cycleNumber: '',
    batchNumber: '',
    temperature: '',
    pressure: '',
    duration: '',
    biologicalIndicatorResult: '',
    chemicalIndicatorResult: '',
    expiryAfterSterilization: '',
    notes: '',
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      fetchData();
    }
  }, [status, router]);

  const fetchData = async () => {
    try {
      const [logsRes, inventoryRes] = await Promise.all([
        fetch('/api/cssd-sterilization'),
        fetch('/api/cssd-inventory?status=IN_STERILIZATION'),
      ]);

      if (logsRes.ok) {
        const data = await logsRes.json();
        setLogs(data.logs);
      }
      if (inventoryRes.ok) {
        const data = await inventoryRes.json();
        setInventory(data.inventory);
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
      const response = await fetch('/api/cssd-sterilization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          temperature: formData.temperature ? parseFloat(formData.temperature) : null,
          pressure: formData.pressure ? parseFloat(formData.pressure) : null,
          duration: formData.duration ? parseInt(formData.duration) : null,
        }),
      });

      if (response.ok) {
        setShowAddModal(false);
        setFormData({
          inventoryId: '',
          sterilizationMethod: 'AUTOCLAVE',
          cycleNumber: '',
          batchNumber: '',
          temperature: '',
          pressure: '',
          duration: '',
          biologicalIndicatorResult: '',
          chemicalIndicatorResult: '',
          expiryAfterSterilization: '',
          notes: '',
        });
        fetchData();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create sterilization log');
      }
    } catch (error) {
      console.error('Error creating sterilization log:', error);
      alert('Failed to create sterilization log');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="text-xl">Loading...</div></div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">CSSD Sterilization Logs</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
        >
          Add Sterilization Log
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cycle</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bio Indicator</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Chem Indicator</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sterilized By</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{log.inventory.itemName}</div>
                  <div className="text-xs text-gray-500">{log.inventory.itemCode}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.sterilizationMethod}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.cycleNumber}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(log.sterilizationDate).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    log.biologicalIndicatorResult === 'PASS' ? 'bg-green-100 text-green-800' : 
                    log.biologicalIndicatorResult === 'FAIL' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {log.biologicalIndicatorResult || 'N/A'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    log.chemicalIndicatorResult === 'PASS' ? 'bg-green-100 text-green-800' : 
                    log.chemicalIndicatorResult === 'FAIL' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {log.chemicalIndicatorResult || 'N/A'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.sterilizedBy.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">Add Sterilization Log</h2>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">Item *</label>
                  <select
                    required
                    value={formData.inventoryId}
                    onChange={(e) => setFormData({ ...formData, inventoryId: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="">Select Item</option>
                    {inventory.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.itemName} ({item.itemCode})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Sterilization Method *</label>
                  <select
                    required
                    value={formData.sterilizationMethod}
                    onChange={(e) => setFormData({ ...formData, sterilizationMethod: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="AUTOCLAVE">Autoclave</option>
                    <option value="ETO">ETO</option>
                    <option value="PLASMA">Plasma</option>
                    <option value="DRY_HEAT">Dry Heat</option>
                    <option value="CHEMICAL">Chemical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Cycle Number *</label>
                  <input
                    type="text"
                    required
                    value={formData.cycleNumber}
                    onChange={(e) => setFormData({ ...formData, cycleNumber: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Batch Number</label>
                  <input
                    type="text"
                    value={formData.batchNumber}
                    onChange={(e) => setFormData({ ...formData, batchNumber: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Temperature (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.temperature}
                    onChange={(e) => setFormData({ ...formData, temperature: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Pressure (PSI)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.pressure}
                    onChange={(e) => setFormData({ ...formData, pressure: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Duration (minutes)</label>
                  <input
                    type="number"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Biological Indicator</label>
                  <select
                    value={formData.biologicalIndicatorResult}
                    onChange={(e) => setFormData({ ...formData, biologicalIndicatorResult: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="">Not Tested</option>
                    <option value="PASS">Pass</option>
                    <option value="FAIL">Fail</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Chemical Indicator</label>
                  <select
                    value={formData.chemicalIndicatorResult}
                    onChange={(e) => setFormData({ ...formData, chemicalIndicatorResult: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="">Not Tested</option>
                    <option value="PASS">Pass</option>
                    <option value="FAIL">Fail</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Expiry After Sterilization</label>
                  <input
                    type="date"
                    value={formData.expiryAfterSterilization}
                    onChange={(e) => setFormData({ ...formData, expiryAfterSterilization: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
              </div>
              <div className="mt-4">
                <SmartTextInput
                  label="Notes"
                  value={formData.notes}
                  onChange={(val) => setFormData({ ...formData, notes: val })}
                  rows={3}
                  placeholder="Sterilization notes... 🎤 Dictate"
                  enableSpeech={true}
                  enableOCR={true}
                  medicalMode={true}
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
