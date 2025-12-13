'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, Package, DollarSign, AlertCircle, ShoppingCart, FileText } from 'lucide-react';
import Link from 'next/link';

interface Surgery {
  id: string;
  surgeryType: string;
  scheduledDate: string;
  patient: {
    name: string;
    folderNumber: string;
  };
  surgeon: {
    fullName: string;
  };
}

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  unitCostPrice: number;
  quantityAvailable: number;
}

interface TheatreSetupItem {
  inventoryItemId: string;
  quantityTaken: number;
  inventoryItem: {
    id: string;
    name: string;
    category: string;
    unitCostPrice: number;
  };
}

interface ConsumableItem {
  inventoryItemId: string;
  quantity: number;
  name?: string;
  unitCost?: number;
  subtotal?: number;
}

interface ExistingConsumable {
  id: string;
  quantity: number;
  inventoryItem: {
    id: string;
    name: string;
    unitCostPrice: number;
  };
}

export default function SurgeryConsumablesPage() {
  const params = useParams();
  const router = useRouter();
  const surgeryId = params.id as string;

  const [surgery, setSurgery] = useState<Surgery | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [theatreSetupItems, setTheatreSetupItems] = useState<TheatreSetupItem[]>([]);
  const [consumables, setConsumables] = useState<ConsumableItem[]>([]);
  const [existingConsumables, setExistingConsumables] = useState<ExistingConsumable[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchSurgery();
    fetchExistingConsumables();
  }, [surgeryId]);

  const fetchSurgery = async () => {
    try {
      const response = await fetch(`/api/surgeries?id=${surgeryId}`);
      if (response.ok) {
        const data = await response.json();
        const surgeryData = Array.isArray(data) ? data.find((s: Surgery) => s.id === surgeryId) : data;
        setSurgery(surgeryData);
        
        // Fetch theatre setup items for the surgery date
        if (surgeryData?.scheduledDate) {
          fetchTheatreSetupItems(surgeryData.scheduledDate);
        }
      }
    } catch (error) {
      console.error('Failed to fetch surgery:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTheatreSetupItems = async (surgeryDate: string) => {
    try {
      const date = new Date(surgeryDate).toISOString().split('T')[0];
      const response = await fetch(`/api/theatre-setup?date=${date}`);
      if (response.ok) {
        const data = await response.json();
        
        // Extract all items from theatre setups for the day
        const allItems: TheatreSetupItem[] = [];
        data.forEach((setup: any) => {
          if (setup.items && setup.items.length > 0) {
            allItems.push(...setup.items);
          }
        });
        
        setTheatreSetupItems(allItems);
        
        // Convert to inventory format for the dropdown
        const inventoryFromSetup = allItems.map((item: TheatreSetupItem) => ({
          id: item.inventoryItem.id,
          name: item.inventoryItem.name,
          category: item.inventoryItem.category,
          unitCostPrice: item.inventoryItem.unitCostPrice,
          quantityAvailable: item.quantityTaken,
        }));
        
        // Remove duplicates and sum quantities
        const mergedInventory = inventoryFromSetup.reduce((acc: InventoryItem[], curr) => {
          const existing = acc.find(item => item.id === curr.id);
          if (existing) {
            existing.quantityAvailable += curr.quantityAvailable;
          } else {
            acc.push(curr);
          }
          return acc;
        }, []);
        
        setInventory(mergedInventory);
      }
    } catch (error) {
      console.error('Failed to fetch theatre setup items:', error);
    }
  };

  const fetchInventory = async () => {
    // This function is now replaced by fetchTheatreSetupItems
    // Keeping it for potential fallback
    try {
      const response = await fetch('/api/inventory');
      if (response.ok) {
        const data = await response.json();
        const items = data.items || data;
        setInventory(items.filter((item: InventoryItem) => item.quantityAvailable > 0));
      }
    } catch (error) {
      console.error('Failed to fetch inventory:', error);
    }
  };

  const fetchExistingConsumables = async () => {
    try {
      const response = await fetch(`/api/surgeries/${surgeryId}/consumables`);
      if (response.ok) {
        const data = await response.json();
        setExistingConsumables(data);
      }
    } catch (error) {
      console.error('Failed to fetch consumables:', error);
    }
  };

  const addConsumable = () => {
    setConsumables([...consumables, { inventoryItemId: '', quantity: 1 }]);
  };

  const removeConsumable = (index: number) => {
    setConsumables(consumables.filter((_, i) => i !== index));
  };

  const updateConsumable = (index: number, field: keyof ConsumableItem, value: string | number) => {
    const updated = [...consumables];
    
    if (field === 'inventoryItemId') {
      const item = inventory.find((inv) => inv.id === value);
      if (item) {
        updated[index] = {
          ...updated[index],
          inventoryItemId: value as string,
          name: item.name,
          unitCost: item.unitCostPrice,
          subtotal: item.unitCostPrice * updated[index].quantity,
        };
      }
    } else if (field === 'quantity') {
      updated[index].quantity = Number(value);
      if (updated[index].unitCost) {
        updated[index].subtotal = updated[index].unitCost! * Number(value);
      }
    }
    
    setConsumables(updated);
  };

  const handleSubmit = async () => {
    if (consumables.length === 0) {
      setError('Please add at least one consumable item');
      return;
    }

    const invalid = consumables.find((c) => !c.inventoryItemId || c.quantity <= 0);
    if (invalid) {
      setError('Please complete all consumable items with valid quantities');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch(`/api/surgeries/${surgeryId}/consumables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consumables }),
      });

      if (response.ok) {
        router.push('/dashboard/surgeries');
      } else {
        const error = await response.json();
        setError(error.error || 'Failed to save consumables');
      }
    } catch (error) {
      setError('An error occurred while saving consumables');
    } finally {
      setSubmitting(false);
    }
  };

  const calculateTotal = () => {
    const existingTotal = existingConsumables.reduce(
      (sum, item) => sum + item.inventoryItem.unitCostPrice * item.quantity,
      0
    );
    const newTotal = consumables.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    const subtotal = existingTotal + newTotal;
    const markup = subtotal * 0.1; // 10% markup
    return { subtotal, markup, total: subtotal + markup };
  };

  const filteredInventory = inventory.filter((item) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totals = calculateTotal();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!surgery) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-400" />
        <h2 className="text-2xl font-bold">Surgery not found</h2>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/surgeries"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900">Surgery Consumables Tracking</h1>
          <p className="text-gray-600 mt-1">Record items used during surgical procedure</p>
        </div>
        {existingConsumables.length > 0 && (
          <Link
            href={`/dashboard/surgeries/${surgeryId}/bom`}
            className="btn-secondary flex items-center gap-2"
          >
            <FileText className="w-5 h-5" />
            View BOM Report
          </Link>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-600 mr-3" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      {/* Surgery Info */}
      <div className="card bg-gradient-to-r from-primary-50 to-secondary-50">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow">
            <Package className="w-8 h-8 text-primary-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900">{surgery.patient.name}</h2>
            <p className="text-gray-700">Folder: {surgery.patient.folderNumber}</p>
            <p className="text-gray-700 mt-1">
              <span className="font-semibold">Procedure:</span> {surgery.surgeryType} | 
              <span className="font-semibold"> Surgeon:</span> {surgery.surgeon.fullName}
            </p>
          </div>
        </div>
      </div>

      {/* Existing Consumables */}
      {existingConsumables.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Previously Recorded Consumables</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="pb-3 text-gray-700 font-semibold">Item</th>
                  <th className="pb-3 text-gray-700 font-semibold">Quantity</th>
                  <th className="pb-3 text-gray-700 font-semibold text-right">Unit Cost</th>
                  <th className="pb-3 text-gray-700 font-semibold text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {existingConsumables.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="py-3">{item.inventoryItem.name}</td>
                    <td className="py-3">{item.quantity}</td>
                    <td className="py-3 text-right">₦{item.inventoryItem.unitCostPrice.toLocaleString()}</td>
                    <td className="py-3 text-right font-semibold">
                      ₦{(item.inventoryItem.unitCostPrice * item.quantity).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add New Consumables */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold">Add Consumables</h2>
            {inventory.length > 0 && (
              <p className="text-sm text-gray-600 mt-1">
                Showing items collected by scrub nurse for this theatre on {new Date(surgery.scheduledDate).toLocaleDateString()}
              </p>
            )}
            {inventory.length === 0 && (
              <p className="text-sm text-yellow-600 mt-1">
                ⚠️ No items found in theatre setup for this date. Please ensure materials have been collected.
              </p>
            )}
          </div>
          <button onClick={addConsumable} className="btn-primary flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add Item
          </button>
        </div>

        {consumables.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <ShoppingCart className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p>No items added yet. Click &quot;Add Item&quot; to start recording consumables.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {consumables.map((consumable, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-6">
                    <label className="label">
                      Inventory Item (from Theatre Setup) *
                    </label>
                    <input
                      type="text"
                      placeholder="Search collected items..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="input-field mb-2"
                    />
                    <select
                      value={consumable.inventoryItemId}
                      onChange={(e) => updateConsumable(index, 'inventoryItemId', e.target.value)}
                      className="input-field"
                      required
                    >
                      <option value="">Select Item</option>
                      {filteredInventory.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} - ₦{item.unitCostPrice.toLocaleString()} ({item.quantityAvailable} collected)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="label">Quantity *</label>
                    <input
                      type="number"
                      min="1"
                      value={consumable.quantity}
                      onChange={(e) => updateConsumable(index, 'quantity', e.target.value)}
                      className="input-field"
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="label">Unit Cost</label>
                    <div className="input-field bg-gray-50 text-gray-700">
                      ₦{consumable.unitCost?.toLocaleString() || '0'}
                    </div>
                  </div>

                  <div className="md:col-span-2 flex items-end gap-2">
                    <div className="flex-1">
                      <label className="label">Subtotal</label>
                      <div className="input-field bg-gray-50 text-gray-900 font-semibold">
                        ₦{consumable.subtotal?.toLocaleString() || '0'}
                      </div>
                    </div>
                    <button
                      onClick={() => removeConsumable(index)}
                      className="p-3 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cost Summary */}
      <div className="card bg-gradient-to-br from-accent-50 to-primary-50">
        <div className="flex items-center gap-3 mb-4">
          <DollarSign className="w-8 h-8 text-primary-600" />
          <h2 className="text-xl font-semibold">Cost Summary</h2>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between text-lg">
            <span className="text-gray-700">Subtotal:</span>
            <span className="font-semibold">₦{totals.subtotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-lg">
            <span className="text-gray-700">Markup (10%):</span>
            <span className="font-semibold text-accent-600">₦{totals.markup.toLocaleString()}</span>
          </div>
          <div className="pt-3 border-t-2 border-primary-200">
            <div className="flex justify-between text-2xl">
              <span className="font-bold text-gray-900">Total Cost:</span>
              <span className="font-bold text-primary-600">₦{totals.total.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-4">
        <Link href="/dashboard/surgeries" className="btn-secondary">
          Cancel
        </Link>
        <button onClick={handleSubmit} disabled={submitting || consumables.length === 0} className="btn-primary px-8">
          {submitting ? 'Saving...' : 'Save Consumables'}
        </button>
      </div>
    </div>
  );
}
