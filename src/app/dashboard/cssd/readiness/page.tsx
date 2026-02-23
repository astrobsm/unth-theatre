'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
const SmartTextInput = dynamic(() => import('@/components/SmartTextInput'), { ssr: false });

export default function CssdReadinessPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [reports, setReports] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    totalSterileItems: 0,
    itemsInSterilization: 0,
    itemsExpiringSoon: 0,
    lowStockItems: 0,
    outOfStockItems: 0,
    readinessStatus: 'READY',
    issues: '',
    recommendedActions: '',
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
      const [reportsRes, inventoryRes] = await Promise.all([
        fetch('/api/cssd-readiness'),
        fetch('/api/cssd-inventory'),
      ]);

      if (reportsRes.ok) {
        const data = await reportsRes.json();
        setReports(data.reports);
      }

      if (inventoryRes.ok) {
        const data = await inventoryRes.json();
        const inventory = data.inventory;
        
        const sterile = inventory.filter((i: any) => i.status === 'STERILE').length;
        const inSterilization = inventory.filter((i: any) => i.status === 'IN_STERILIZATION').length;
        const lowStock = inventory.filter((i: any) => i.status === 'LOW_STOCK').length;
        const outOfStock = inventory.filter((i: any) => i.status === 'OUT_OF_STOCK').length;
        
        const expiringSoon = inventory.filter((i: any) => {
          if (!i.expiryDate) return false;
          const daysUntilExpiry = (new Date(i.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
          return daysUntilExpiry > 0 && daysUntilExpiry <= 7;
        }).length;

        setStats({
          totalSterileItems: sterile,
          itemsInSterilization: inSterilization,
          itemsExpiringSoon: expiringSoon,
          lowStockItems: lowStock,
          outOfStockItems: outOfStock,
        });

        setFormData(prev => ({
          ...prev,
          totalSterileItems: sterile,
          itemsInSterilization: inSterilization,
          itemsExpiringSoon: expiringSoon,
          lowStockItems: lowStock,
          outOfStockItems: outOfStock,
        }));
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
      const response = await fetch('/api/cssd-readiness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
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
        <h1 className="text-3xl font-bold">CSSD Readiness Dashboard</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
        >
          Create Report
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-green-100 rounded-lg p-4">
            <div className="text-sm text-green-600 font-medium">Sterile Items</div>
            <div className="text-3xl font-bold text-green-800">{stats.totalSterileItems}</div>
          </div>
          <div className="bg-yellow-100 rounded-lg p-4">
            <div className="text-sm text-yellow-600 font-medium">In Sterilization</div>
            <div className="text-3xl font-bold text-yellow-800">{stats.itemsInSterilization}</div>
          </div>
          <div className="bg-orange-100 rounded-lg p-4">
            <div className="text-sm text-orange-600 font-medium">Expiring Soon</div>
            <div className="text-3xl font-bold text-orange-800">{stats.itemsExpiringSoon}</div>
          </div>
          <div className="bg-red-100 rounded-lg p-4">
            <div className="text-sm text-red-600 font-medium">Low Stock</div>
            <div className="text-3xl font-bold text-red-800">{stats.lowStockItems}</div>
          </div>
          <div className="bg-red-100 rounded-lg p-4">
            <div className="text-sm text-red-600 font-medium">Out of Stock</div>
            <div className="text-3xl font-bold text-red-800">{stats.outOfStockItems}</div>
          </div>
        </div>
      )}

      {/* Reports Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sterile Items</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">In Sterilization</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Low Stock</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Out of Stock</th>
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
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{report.totalSterileItems}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{report.itemsInSterilization}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{report.lowStockItems}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{report.outOfStockItems}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    report.readinessStatus === 'READY' ? 'bg-green-100 text-green-800' :
                    report.readinessStatus === 'LIMITED' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {report.readinessStatus}
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
          <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">Create Readiness Report</h2>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Total Sterile Items</label>
                  <input
                    type="number"
                    value={formData.totalSterileItems}
                    onChange={(e) => setFormData({ ...formData, totalSterileItems: parseInt(e.target.value) })}
                    className="w-full border rounded-lg px-3 py-2"
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Items in Sterilization</label>
                  <input
                    type="number"
                    value={formData.itemsInSterilization}
                    onChange={(e) => setFormData({ ...formData, itemsInSterilization: parseInt(e.target.value) })}
                    className="w-full border rounded-lg px-3 py-2"
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Items Expiring Soon</label>
                  <input
                    type="number"
                    value={formData.itemsExpiringSoon}
                    onChange={(e) => setFormData({ ...formData, itemsExpiringSoon: parseInt(e.target.value) })}
                    className="w-full border rounded-lg px-3 py-2"
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Low Stock Items</label>
                  <input
                    type="number"
                    value={formData.lowStockItems}
                    onChange={(e) => setFormData({ ...formData, lowStockItems: parseInt(e.target.value) })}
                    className="w-full border rounded-lg px-3 py-2"
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Out of Stock Items</label>
                  <input
                    type="number"
                    value={formData.outOfStockItems}
                    onChange={(e) => setFormData({ ...formData, outOfStockItems: parseInt(e.target.value) })}
                    className="w-full border rounded-lg px-3 py-2"
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Readiness Status *</label>
                  <select
                    required
                    value={formData.readinessStatus}
                    onChange={(e) => setFormData({ ...formData, readinessStatus: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="READY">Ready</option>
                    <option value="LIMITED">Limited</option>
                    <option value="NOT_READY">Not Ready</option>
                  </select>
                </div>
              </div>
              <div className="mt-4">
                <SmartTextInput
                  label="Issues"
                  value={formData.issues}
                  onChange={(val) => setFormData({ ...formData, issues: val })}
                  rows={2}
                  placeholder="Document any issues... 🎤 Dictate"
                  enableSpeech={true}
                  enableOCR={true}
                  medicalMode={true}
                />
              </div>
              <div className="mt-4">
                <SmartTextInput
                  label="Recommended Actions"
                  value={formData.recommendedActions}
                  onChange={(val) => setFormData({ ...formData, recommendedActions: val })}
                  rows={2}
                  placeholder="Recommended actions... 🎤 Dictate"
                  enableSpeech={true}
                  enableOCR={true}
                  medicalMode={true}
                />
              </div>
              <div className="mt-4">
                <SmartTextInput
                  label="Notes"
                  value={formData.notes}
                  onChange={(val) => setFormData({ ...formData, notes: val })}
                  rows={2}
                  placeholder="Additional notes... 🎤 Dictate"
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
