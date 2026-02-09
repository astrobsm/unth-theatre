'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Plus, 
  Package,
  Save,
  AlertCircle,
  CheckCircle,
  Store
} from 'lucide-react';

interface User {
  id: string;
  fullName: string;
  staffCode: string;
  role: string;
}

export default function NewSubStoreItemPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  const [formData, setFormData] = useState({
    theatreNumber: '',
    theatreName: '',
    itemName: '',
    itemCode: '',
    category: 'CONSUMABLE',
    currentStock: 0,
    minimumStock: 10,
    maximumStock: 100,
    unit: 'pcs',
    unitPrice: 0,
    batchNumber: '',
    expiryDate: '',
    managedById: '',
    notes: '',
  });

  const theatres = [
    { value: 'THEATRE_1', label: 'Theatre 1 - General Surgery' },
    { value: 'THEATRE_2', label: 'Theatre 2 - Orthopaedics' },
    { value: 'THEATRE_3', label: 'Theatre 3 - Neurosurgery' },
    { value: 'THEATRE_4', label: 'Theatre 4 - Cardiothoracic' },
    { value: 'THEATRE_5', label: 'Theatre 5 - Urology' },
    { value: 'THEATRE_6', label: 'Theatre 6 - OB-GYN' },
    { value: 'THEATRE_7', label: 'Theatre 7 - Paediatric' },
    { value: 'THEATRE_8', label: 'Theatre 8 - ENT' },
    { value: 'THEATRE_9', label: 'Theatre 9 - Ophthalmology' },
    { value: 'THEATRE_10', label: 'Theatre 10 - Dental/Maxillofacial' },
    { value: 'THEATRE_11', label: 'Theatre 11 - Plastic Surgery' },
    { value: 'THEATRE_12', label: 'Theatre 12 - Emergency' },
    { value: 'THEATRE_13', label: 'Theatre 13 - Minor Procedures' },
  ];

  const categories = [
    { value: 'CONSUMABLE', label: 'Consumable' },
    { value: 'DEVICE', label: 'Device' },
    { value: 'MEDICATION', label: 'Medication' },
    { value: 'EQUIPMENT', label: 'Equipment' },
    { value: 'SUTURES', label: 'Sutures' },
    { value: 'SYRINGES_NEEDLES', label: 'Syringes & Needles' },
    { value: 'GLOVES', label: 'Gloves' },
    { value: 'GAUZE_DRESSINGS', label: 'Gauze & Dressings' },
    { value: 'CATHETERS_TUBES', label: 'Catheters & Tubes' },
    { value: 'IV_SUPPLIES', label: 'IV Supplies' },
    { value: 'ANESTHESIA_SUPPLIES', label: 'Anesthesia Supplies' },
    { value: 'STERILIZATION', label: 'Sterilization Items' },
    { value: 'IMPLANTS', label: 'Implants' },
    { value: 'OTHER', label: 'Other' },
  ];

  const units = ['pcs', 'pack', 'box', 'vial', 'ampoule', 'bottle', 'set', 'roll', 'pair', 'unit'];

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users?role=SCRUB_NURSE');
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/sub-stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          theatreName: theatres.find(t => t.value === formData.theatreNumber)?.label || formData.theatreNumber,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create item');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/dashboard/sub-stores');
      }, 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/sub-stores" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Plus className="w-8 h-8 text-primary-600" />
            Add Item to Sub-Store
          </h1>
          <p className="text-gray-600 mt-1">
            Add a new consumable item to a theatre sub-store
          </p>
        </div>
      </div>

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-500" />
          <span className="text-green-800">Item added successfully! Redirecting...</span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-red-500" />
          <span className="text-red-800">{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Theatre Selection */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Store className="w-5 h-5" />
            Theatre Selection
          </h2>
          <select
            name="theatreNumber"
            value={formData.theatreNumber}
            onChange={handleChange}
            required
            className="input-field"
            title="Select theatre for this item"
          >
            <option value="">Select Theatre</option>
            {theatres.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Item Details */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Package className="w-5 h-5" />
            Item Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
              <input
                type="text"
                name="itemName"
                value={formData.itemName}
                onChange={handleChange}
                required
                className="input-field"
                placeholder="e.g., Surgical Gloves Size 7"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Item Code</label>
              <input
                type="text"
                name="itemCode"
                value={formData.itemCode}
                onChange={handleChange}
                className="input-field"
                placeholder="e.g., SG-007"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                required
                className="input-field"
                title="Select item category"
              >
                {categories.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
              <select
                name="unit"
                value={formData.unit}
                onChange={handleChange}
                required
                className="input-field"
                title="Select unit of measure"
              >
                {units.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Stock Levels */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Stock Levels</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Stock</label>
              <input
                type="number"
                name="currentStock"
                value={formData.currentStock}
                onChange={handleChange}
                min="0"
                className="input-field"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Stock</label>
              <input
                type="number"
                name="minimumStock"
                value={formData.minimumStock}
                onChange={handleChange}
                min="1"
                className="input-field"
                placeholder="10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Maximum Stock</label>
              <input
                type="number"
                name="maximumStock"
                value={formData.maximumStock}
                onChange={handleChange}
                min="1"
                className="input-field"
                placeholder="100"
              />
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Additional Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price (₦)</label>
              <input
                type="number"
                name="unitPrice"
                value={formData.unitPrice}
                onChange={handleChange}
                min="0"
                step="0.01"
                className="input-field"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Batch Number</label>
              <input
                type="text"
                name="batchNumber"
                value={formData.batchNumber}
                onChange={handleChange}
                className="input-field"
                placeholder="e.g., BN-2025-001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
              <input
                type="date"
                name="expiryDate"
                value={formData.expiryDate}
                onChange={handleChange}
                className="input-field"
                placeholder="Select expiry date"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Managed By</label>
              <select
                name="managedById"
                value={formData.managedById}
                onChange={handleChange}
                className="input-field"
                title="Select staff to manage this item"
              >
                <option value="">Select Staff (Optional)</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.fullName} ({u.staffCode})</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              className="input-field"
              placeholder="Any additional notes..."
            />
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !formData.theatreNumber || !formData.itemName}
          className="w-full btn-primary py-3 flex items-center justify-center gap-2"
        >
          {loading ? (
            'Saving...'
          ) : (
            <>
              <Save className="w-5 h-5" />
              Add Item to Sub-Store
            </>
          )}
        </button>
      </form>
    </div>
  );
}
