'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Truck, 
  Search, 
  Plus, 
  Package,
  Trash2,
  AlertCircle,
  CheckCircle,
  Loader2
} from 'lucide-react';

interface TransferEntry {
  itemId: string;
  itemName: string;
  theatreNumber: string;
  quantity: number;
  unit: string;
  currentStock: number;
}

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  availableQuantity: number;
}

export default function NewTransferPage() {
  const router = useRouter();
  const [selectedTheatre, setSelectedTheatre] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [transferEntries, setTransferEntries] = useState<TransferEntry[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

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

  useEffect(() => {
    if (searchTerm.length >= 2) {
      fetchInventoryItems();
    }
  }, [searchTerm]);

  const fetchInventoryItems = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/inventory?search=${encodeURIComponent(searchTerm)}`);
      if (response.ok) {
        const data = await response.json();
        // Map inventory items to the expected format
        const items = (data.items || []).map((item: any) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          unit: item.unit || 'pcs',
          availableQuantity: item.quantity || 0,
        }));
        setInventoryItems(items);
      }
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const addTransferEntry = (item: InventoryItem) => {
    if (!selectedTheatre) {
      setError('Please select a theatre first');
      return;
    }

    if (transferEntries.some(e => e.itemId === item.id)) {
      setError('Item already added');
      return;
    }

    setTransferEntries([
      ...transferEntries,
      {
        itemId: item.id,
        itemName: item.name,
        theatreNumber: selectedTheatre,
        quantity: 1,
        unit: item.unit,
        currentStock: item.availableQuantity
      }
    ]);
    setSearchTerm('');
    setInventoryItems([]);
    setError('');
  };

  const updateQuantity = (index: number, quantity: number) => {
    const updated = [...transferEntries];
    updated[index].quantity = Math.max(1, Math.min(quantity, updated[index].currentStock));
    setTransferEntries(updated);
  };

  const removeEntry = (index: number) => {
    setTransferEntries(transferEntries.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!selectedTheatre) {
      setError('Please select a theatre');
      return;
    }
    if (transferEntries.length === 0) {
      setError('Please add at least one item to transfer');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/sub-stores/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theatreNumber: selectedTheatre,
          items: transferEntries.map(e => ({
            itemId: e.itemId,
            itemName: e.itemName,
            quantity: e.quantity,
            unit: e.unit
          })),
          notes
        })
      });

      if (response.ok) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/dashboard/sub-stores/transfers');
        }, 2000);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to create transfer request');
      }
    } catch (error) {
      console.error('Error creating transfer:', error);
      setError('Failed to create transfer request');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="p-6">
        <div className="max-w-2xl mx-auto bg-green-50 border border-green-200 rounded-lg p-8 text-center">
          <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-green-900 mb-2">Transfer Request Created!</h2>
          <p className="text-green-700">
            Your transfer request has been submitted for approval.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/sub-stores/transfers" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Truck className="w-8 h-8 text-primary-600" />
            New Stock Transfer
          </h1>
          <p className="text-gray-600 mt-1">
            Transfer consumables from main store to theatre sub-store
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-red-800">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Selection */}
        <div className="space-y-6">
          {/* Theatre Selection */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">1. Select Theatre</h2>
            <select
              value={selectedTheatre}
              onChange={(e) => setSelectedTheatre(e.target.value)}
              className="input-field"
            >
              <option value="">Select a theatre...</option>
              {theatres.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Item Search */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">2. Search & Add Items</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search consumables..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-10"
              />
            </div>

            {/* Search Results */}
            {loading && (
              <div className="mt-4 text-center text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
                Searching...
              </div>
            )}

            {inventoryItems.length > 0 && (
              <div className="mt-4 max-h-60 overflow-y-auto border rounded-lg divide-y">
                {inventoryItems.map(item => (
                  <div
                    key={item.id}
                    className="p-3 hover:bg-gray-50 flex items-center justify-between cursor-pointer"
                    onClick={() => addTransferEntry(item)}
                  >
                    <div>
                      <div className="font-medium text-gray-900">{item.name}</div>
                      <div className="text-sm text-gray-500">
                        {item.category} • Available: {item.availableQuantity} {item.unit}
                      </div>
                    </div>
                    <Plus className="w-5 h-5 text-primary-600" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">3. Transfer Notes (Optional)</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this transfer..."
              className="input-field"
              rows={3}
            />
          </div>
        </div>

        {/* Right Column - Transfer List */}
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Package className="w-5 h-5" />
            Transfer Items ({transferEntries.length})
          </h2>

          {transferEntries.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No items added yet</p>
              <p className="text-sm">Search and click items to add them</p>
            </div>
          ) : (
            <div className="space-y-3">
              {transferEntries.map((entry, index) => (
                <div key={entry.itemId} className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-medium text-gray-900">{entry.itemName}</div>
                      <div className="text-sm text-gray-500">
                        Available: {entry.currentStock} {entry.unit}
                      </div>
                    </div>
                    <button
                      onClick={() => removeEntry(index)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">Quantity:</label>
                    <input
                      type="number"
                      value={entry.quantity}
                      onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 1)}
                      min={1}
                      max={entry.currentStock}
                      className="input-field w-24"
                    />
                    <span className="text-sm text-gray-600">{entry.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Submit Button */}
          <div className="mt-6 pt-4 border-t">
            <button
              onClick={handleSubmit}
              disabled={submitting || transferEntries.length === 0 || !selectedTheatre}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating Transfer...
                </>
              ) : (
                <>
                  <Truck className="w-5 h-5" />
                  Submit Transfer Request
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
