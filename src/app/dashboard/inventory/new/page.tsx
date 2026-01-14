'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import SmartTextInput from '@/components/SmartTextInput';

export default function NewInventoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const data: any = {
      name: formData.get('name'),
      category: formData.get('category'),
      description: description,
      unitCostPrice: parseFloat(formData.get('unitCostPrice') as string),
      quantity: parseInt(formData.get('quantity') as string),
      reorderLevel: parseInt(formData.get('reorderLevel') as string),
      supplier: formData.get('supplier'),
    };

    // Add category-specific fields
    const category = formData.get('category') as string;
    
    if (category === 'MACHINE' || category === 'DEVICE') {
      data.depreciationRate = formData.get('depreciationRate') ? parseFloat(formData.get('depreciationRate') as string) : null;
      data.halfLife = formData.get('halfLife') ? parseFloat(formData.get('halfLife') as string) : null;
      data.deviceId = formData.get('deviceId') || null;
    }
    
    if (category === 'CONSUMABLE') {
      data.manufacturingDate = formData.get('manufacturingDate') || null;
      data.expiryDate = formData.get('expiryDate') || null;
      data.batchNumber = formData.get('batchNumber') || null;
    }

    try {
      const response = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        router.push('/dashboard/inventory');
      } else {
        const error = await response.json();
        setError(error.error || 'Failed to create item');
      }
    } catch (error) {
      setError('An error occurred while creating the item');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/inventory"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Add Inventory Item</h1>
          <p className="text-gray-600 mt-1">Create a new inventory item</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">Item Name *</label>
              <input
                type="text"
                name="name"
                required
                className="input-field"
                placeholder="e.g., Surgical Gloves"
              />
            </div>

            <div>
              <label className="label">Category *</label>
              <select 
                name="category" 
                required 
                className="input-field"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="">Select Category</option>
                <option value="CONSUMABLE">Consumable</option>
                <option value="MACHINE">Machine</option>
                <option value="DEVICE">Device</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div>
              <label className="label">Unit Cost Price (₦) *</label>
              <input
                type="number"
                name="unitCostPrice"
                required
                step="0.01"
                min="0"
                className="input-field"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="label">Quantity *</label>
              <input
                type="number"
                name="quantity"
                required
                min="0"
                className="input-field"
                placeholder="0"
              />
            </div>

            <div>
              <label className="label">Reorder Level *</label>
              <input
                type="number"
                name="reorderLevel"
                required
                min="0"
                className="input-field"
                placeholder="10"
                defaultValue="10"
              />
            </div>

            <div>
              <label className="label">Supplier</label>
              <input
                type="text"
                name="supplier"
                className="input-field"
                placeholder="Supplier name"
              />
            </div>
          </div>

          {/* Dynamic Fields for MACHINE/DEVICE */}
          {(selectedCategory === 'MACHINE' || selectedCategory === 'DEVICE') && (
            <div className="border-t pt-6 mt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {selectedCategory === 'MACHINE' ? 'Machine' : 'Device'} Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="label">Device/Machine ID</label>
                  <input
                    type="text"
                    name="deviceId"
                    className="input-field"
                    placeholder="e.g., DEV-2024-001"
                  />
                </div>

                <div>
                  <label className="label">Depreciation Rate (%/year)</label>
                  <input
                    type="number"
                    name="depreciationRate"
                    step="0.01"
                    min="0"
                    max="100"
                    className="input-field"
                    placeholder="e.g., 10.5"
                  />
                  <p className="text-xs text-gray-500 mt-1">Annual depreciation percentage</p>
                </div>

                <div>
                  <label className="label">Half Life (years)</label>
                  <input
                    type="number"
                    name="halfLife"
                    step="0.1"
                    min="0"
                    className="input-field"
                    placeholder="e.g., 5"
                  />
                  <p className="text-xs text-gray-500 mt-1">Expected operational lifespan</p>
                </div>
              </div>
            </div>
          )}

          {/* Dynamic Fields for CONSUMABLE */}
          {selectedCategory === 'CONSUMABLE' && (
            <div className="border-t pt-6 mt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Consumable Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="label">Manufacturing Date</label>
                  <input
                    type="date"
                    name="manufacturingDate"
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="label">Expiry Date</label>
                  <input
                    type="date"
                    name="expiryDate"
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="label">Batch Number</label>
                  <input
                    type="text"
                    name="batchNumber"
                    className="input-field"
                    placeholder="e.g., BATCH-2024-12-001"
                  />
                </div>
              </div>
            </div>
          )}

          <SmartTextInput
            label="Description"
            value={description}
            onChange={setDescription}
            rows={4}
            placeholder="Enter item description... 🎤 Dictate"
            enableSpeech={true}
            enableOCR={true}
            medicalMode={true}
          />

          <div className="flex justify-end gap-4">
            <Link href="/dashboard/inventory" className="btn-secondary">
              Cancel
            </Link>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Creating...' : 'Create Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
