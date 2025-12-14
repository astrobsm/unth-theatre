'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Package, TrendingDown, AlertCircle, Loader } from 'lucide-react';
import { THEATRES } from '@/lib/constants';

interface TheatreSetup {
  id: string;
  setupDate: string;
  theatre: {
    name: string;
  };
  spiritQuantity: number;
  savlonQuantity: number;
  povidoneQuantity: number;
  faceMaskQuantity: number;
  nursesCapQuantity: number;
  cssdGauzeQuantity: number;
  cssdCottonQuantity: number;
  surgicalBladesQuantity: number;
  suctionTubbingsQuantity: number;
  disposablesQuantity: number;
}

export default function ReturnsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [setups, setSetups] = useState<TheatreSetup[]>([]);
  const [selectedSetup, setSelectedSetup] = useState<TheatreSetup | null>(null);

  const [returnData, setReturnData] = useState({
    spiritReturned: 0,
    savlonReturned: 0,
    povidoneReturned: 0,
    faceMaskReturned: 0,
    nursesCapReturned: 0,
    cssdGauzeReturned: 0,
    cssdCottonReturned: 0,
    surgicalBladesReturned: 0,
    suctionTubbingsReturned: 0,
    disposablesReturned: 0,
    returnReason: '',
    notes: '',
  });

  useEffect(() => {
    fetchActiveSetups();
  }, []);

  const fetchActiveSetups = async () => {
    try {
      const response = await fetch('/api/theatre-setup?status=COLLECTED');
      if (response.ok) {
        const data = await response.json();
        setSetups(data);
      }
    } catch (error) {
      console.error('Failed to fetch setups:', error);
    }
  };

  const handleSelectSetup = (setup: TheatreSetup) => {
    setSelectedSetup(setup);
    // Reset return data when selecting a new setup
    setReturnData({
      spiritReturned: 0,
      savlonReturned: 0,
      povidoneReturned: 0,
      faceMaskReturned: 0,
      nursesCapReturned: 0,
      cssdGauzeReturned: 0,
      cssdCottonReturned: 0,
      surgicalBladesReturned: 0,
      suctionTubbingsReturned: 0,
      disposablesReturned: 0,
      returnReason: '',
      notes: '',
    });
  };

  const handleQuantityChange = (field: string, value: number) => {
    if (!selectedSetup) return;

    const maxValues: Record<string, number> = {
      spiritReturned: selectedSetup.spiritQuantity,
      savlonReturned: selectedSetup.savlonQuantity,
      povidoneReturned: selectedSetup.povidoneQuantity,
      faceMaskReturned: selectedSetup.faceMaskQuantity,
      nursesCapReturned: selectedSetup.nursesCapQuantity,
      cssdGauzeReturned: selectedSetup.cssdGauzeQuantity,
      cssdCottonReturned: selectedSetup.cssdCottonQuantity,
      surgicalBladesReturned: selectedSetup.surgicalBladesQuantity,
      suctionTubbingsReturned: selectedSetup.suctionTubbingsQuantity,
      disposablesReturned: selectedSetup.disposablesQuantity,
    };

    const max = maxValues[field] || 0;
    const validValue = Math.max(0, Math.min(value, max));

    setReturnData((prev) => ({ ...prev, [field]: validValue }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedSetup) {
      alert('Please select a setup');
      return;
    }

    if (!returnData.returnReason.trim()) {
      alert('Please provide a reason for return');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/theatre-setup/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setupId: selectedSetup.id,
          ...returnData,
        }),
      });

      if (response.ok) {
        alert('Materials returned successfully');
        router.push('/dashboard/theatre-setup');
      } else {
        const error = await response.json();
        alert(`Failed to return materials: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to submit return:', error);
      alert('Failed to return materials');
    } finally {
      setLoading(false);
    }
  };

  const totalReturned = Object.entries(returnData)
    .filter(([key]) => key.includes('Returned'))
    .reduce((sum, [, value]) => sum + (value as number), 0);

  const returnItems = [
    { field: 'spiritReturned', label: 'Spirit', max: selectedSetup?.spiritQuantity || 0 },
    { field: 'savlonReturned', label: 'Savlon', max: selectedSetup?.savlonQuantity || 0 },
    { field: 'povidoneReturned', label: 'Povidone Iodine', max: selectedSetup?.povidoneQuantity || 0 },
    { field: 'faceMaskReturned', label: 'Face Masks', max: selectedSetup?.faceMaskQuantity || 0 },
    { field: 'nursesCapReturned', label: 'Nurses Caps', max: selectedSetup?.nursesCapQuantity || 0 },
    { field: 'cssdGauzeReturned', label: 'CSSD Gauze', max: selectedSetup?.cssdGauzeQuantity || 0 },
    { field: 'cssdCottonReturned', label: 'CSSD Cotton', max: selectedSetup?.cssdCottonQuantity || 0 },
    { field: 'surgicalBladesReturned', label: 'Surgical Blades', max: selectedSetup?.surgicalBladesQuantity || 0 },
    { field: 'suctionTubbingsReturned', label: 'Suction Tubbings', max: selectedSetup?.suctionTubbingsQuantity || 0 },
    { field: 'disposablesReturned', label: 'Disposables', max: selectedSetup?.disposablesQuantity || 0 },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Return Theatre Materials</h1>
        <p className="text-gray-600 mt-1">Record unused materials returned at end of day</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Setup Selection */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Select Theatre Setup</h2>

          {setups.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p>No active theatre setups found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {setups.map((setup) => (
                <div
                  key={setup.id}
                  onClick={() => handleSelectSetup(setup)}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    selectedSetup?.id === setup.id
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-primary-300'
                  }`}
                >
                  <h3 className="font-semibold text-gray-900">{setup.theatre.name}</h3>
                  <p className="text-sm text-gray-600">
                    Date: {new Date(setup.setupDate).toLocaleDateString('en-GB')}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    Total Collected: {
                      setup.spiritQuantity +
                      setup.savlonQuantity +
                      setup.povidoneQuantity +
                      setup.faceMaskQuantity +
                      setup.nursesCapQuantity +
                      setup.cssdGauzeQuantity +
                      setup.cssdCottonQuantity +
                      setup.surgicalBladesQuantity +
                      setup.suctionTubbingsQuantity +
                      setup.disposablesQuantity
                    } items
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedSetup && (
          <>
            {/* Return Items */}
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Return Quantities</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {returnItems.map((item) => {
                  const quantity = returnData[item.field as keyof typeof returnData] as number;
                  return (
                    <div key={item.field} className="p-4 bg-gray-50 rounded-lg">
                      <label className="font-medium text-gray-900 block mb-2">
                        {item.label}
                        <span className="text-sm text-gray-500 ml-2">(Max: {item.max})</span>
                      </label>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(item.field, quantity - 1)}
                          className="w-8 h-8 bg-white border border-gray-300 rounded flex items-center justify-center hover:bg-gray-50"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0"
                          max={item.max}
                          value={quantity}
                          onChange={(e) =>
                            handleQuantityChange(item.field, parseInt(e.target.value) || 0)
                          }
                          className="flex-1 input-field text-center"
                        />
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(item.field, quantity + 1)}
                          className="w-8 h-8 bg-white border border-gray-300 rounded flex items-center justify-center hover:bg-gray-50"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Return Reason */}
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Return Details</h2>

              <div className="space-y-4">
                <div>
                  <label className="label">Reason for Return *</label>
                  <select
                    required
                    value={returnData.returnReason}
                    onChange={(e) =>
                      setReturnData({ ...returnData, returnReason: e.target.value })
                    }
                    className="input-field"
                  >
                    <option value="">Select a reason</option>
                    <option value="SURGERY_CANCELLED">Surgery Cancelled</option>
                    <option value="EXCESS_COLLECTION">Excess Collection</option>
                    <option value="PROCEDURE_CHANGED">Procedure Changed</option>
                    <option value="NOT_REQUIRED">Not Required</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div>
                  <label className="label">Additional Notes</label>
                  <textarea
                    rows={4}
                    placeholder="Provide additional details about the return..."
                    value={returnData.notes}
                    onChange={(e) => setReturnData({ ...returnData, notes: e.target.value })}
                    className="input-field"
                  />
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="card bg-gradient-to-br from-green-50 to-green-100">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Return Summary</h2>
              <div className="text-center">
                <p className="text-4xl font-bold text-green-600">{totalReturned}</p>
                <p className="text-sm text-gray-600 mt-1">Total Items Being Returned</p>
              </div>
            </div>

            {/* Warning */}
            {totalReturned === 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  <p className="font-semibold">No items selected for return</p>
                  <p>Please select at least one item to return.</p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => router.back()}
                className="btn-secondary"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary flex items-center gap-2"
                disabled={loading || totalReturned === 0 || !returnData.returnReason}
              >
                {loading ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <TrendingDown className="w-5 h-5" />
                    Return Materials
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
