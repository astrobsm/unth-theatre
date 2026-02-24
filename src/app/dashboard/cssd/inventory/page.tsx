'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface InventoryItem {
  id: string;
  itemName: string;
  itemCode: string;
  materialType: string;
  packType: string | null;
  quantity: number;
  minimumQuantity: number;
  status: string;
  expiryDate: string | null;
  location: string;
  notes: string | null;
  createdAt: string;
  recordedBy: {
    name: string;
    staffCode: string;
  };
}

export default function CssdInventoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filter, setFilter] = useState({ status: '', type: '' });
  const [formData, setFormData] = useState({
    itemName: '',
    itemCode: '',
    materialType: 'SURGICAL_PACK',
    packType: '',
    quantity: 0,
    minimumQuantity: 0,
    expiryDate: '',
    location: '',
    notes: '',
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      fetchInventory();
    }
  }, [status, router, filter]);

  const fetchInventory = async () => {
    try {
      const params = new URLSearchParams();
      if (filter.status) params.append('status', filter.status);
      if (filter.type) params.append('type', filter.type);

      const response = await fetch(`/api/cssd-inventory?${params}`);
      if (response.ok) {
        const data = await response.json();
        setInventory(data.inventory);
      }
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/cssd-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setShowAddModal(false);
        setFormData({
          itemName: '',
          itemCode: '',
          materialType: 'SURGICAL_PACK',
          packType: '',
          quantity: 0,
          minimumQuantity: 0,
          expiryDate: '',
          location: '',
          notes: '',
        });
        fetchInventory();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create inventory item');
      }
    } catch (error) {
      console.error('Error creating inventory item:', error);
      alert('Failed to create inventory item');
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      AVAILABLE: 'bg-green-100 text-green-800',
      STERILE: 'bg-blue-100 text-blue-800',
      IN_STERILIZATION: 'bg-yellow-100 text-yellow-800',
      IN_USE: 'bg-purple-100 text-purple-800',
      LOW_STOCK: 'bg-orange-100 text-orange-800',
      OUT_OF_STOCK: 'bg-red-100 text-red-800',
    };
    return badges[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">CSSD Inventory Management</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
        >
          Add Item
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Status</label>
            <select
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="">All Statuses</option>
              <option value="AVAILABLE">Available</option>
              <option value="STERILE">Sterile</option>
              <option value="IN_STERILIZATION">In Sterilization</option>
              <option value="IN_USE">In Use</option>
              <option value="LOW_STOCK">Low Stock</option>
              <option value="OUT_OF_STOCK">Out of Stock</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Material Type</label>
            <select
              value={filter.type}
              onChange={(e) => setFilter({ ...filter, type: e.target.value })}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="">All Types</option>
              <option value="SURGICAL_PACK">Surgical Pack</option>
              <option value="SURGICAL_GOWN">Surgical Gown</option>
              <option value="DRAPES">Drapes</option>
              <option value="INSTRUMENT_SET">Instrument Set</option>
              <option value="LINEN">Linen</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expiry</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {inventory.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{item.itemName}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.itemCode}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {item.materialType.replace('_', ' ')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{item.quantity}</div>
                  <div className="text-xs text-gray-500">Min: {item.minimumQuantity}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(item.status)}`}>
                    {item.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.location}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    onClick={() => router.push(`/dashboard/cssd/inventory/${item.id}`)}
                    className="text-blue-600 hover:text-blue-900 mr-3"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">Add New Inventory Item</h2>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Item Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.itemName}
                    onChange={(e) => setFormData({ ...formData, itemName: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Item Code *</label>
                  <input
                    type="text"
                    required
                    value={formData.itemCode}
                    onChange={(e) => setFormData({ ...formData, itemCode: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Material Type *</label>
                  <select
                    required
                    value={formData.materialType}
                    onChange={(e) => setFormData({ ...formData, materialType: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="SURGICAL_PACK">Surgical Pack</option>
                    <option value="SURGICAL_GOWN">Surgical Gown</option>
                    <option value="DRAPES">Drapes</option>
                    <option value="INSTRUMENT_SET">Instrument Set</option>
                    <option value="LINEN">Linen</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Pack Type</label>
                  <select
                    value={formData.packType}
                    onChange={(e) => setFormData({ ...formData, packType: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="">Select Pack Type</option>
                    <option value="MAJOR_BUNDLE">Major Bundle</option>
                    <option value="MINOR_BUNDLE">Minor Bundle</option>
                    <option value="INSTRUMENT_SET">Instrument Set</option>
                    <option value="OPERATING_GOWN">Operating Gown</option>
                    <option value="DRAPE_SET">Drape Set</option>
                    <option value="SPECIALIZED_KIT">Specialized Kit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Quantity *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Minimum Quantity</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.minimumQuantity}
                    onChange={(e) => setFormData({ ...formData, minimumQuantity: parseInt(e.target.value) })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Expiry Date</label>
                  <input
                    type="date"
                    value={formData.expiryDate}
                    onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Location</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="e.g., Shelf A1"
                  />
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
                  Add Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
