'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface CountChecklist {
  id: string;
  surgeryId: string;
  surgery: {
    procedureName: string;
    patient: {
      name: string;
      folderNumber: string;
    };
  };
  surgeonName: string;
  scrubNurseName: string;
  circulatingNurseName: string;
  
  // Pre-count
  preCountInstruments: number;
  preCountSmallSwabs: number;
  preCountMediumSwabs: number;
  preCountLargeSwabs: number;
  preCountRollSwabs: number;
  preCountTapeLaparotomy: number;
  preCountAbdominalPack: number;
  preCountBlades: number;
  preCountNeedles: number;
  preCountSutures: number;
  preCountTrocars: number;
  
  // Added items
  addedInstruments: number;
  addedSmallSwabs: number;
  addedMediumSwabs: number;
  addedLargeSwabs: number;
  addedRollSwabs: number;
  addedTapeLaparotomy: number;
  addedAbdominalPack: number;
  addedBlades: number;
  addedNeedles: number;
  addedSutures: number;
  addedTrocars: number;
  
  // First count
  firstCountInstruments: number;
  firstCountSmallSwabs: number;
  firstCountMediumSwabs: number;
  firstCountLargeSwabs: number;
  firstCountRollSwabs: number;
  firstCountTapeLaparotomy: number;
  firstCountAbdominalPack: number;
  firstCountBlades: number;
  firstCountNeedles: number;
  firstCountSutures: number;
  firstCountTrocars: number;
  firstCountCorrect: boolean | null;
  firstCountDiscrepancy: string | null;
  
  // Second count
  secondCountInstruments: number;
  secondCountSmallSwabs: number;
  secondCountMediumSwabs: number;
  secondCountLargeSwabs: number;
  secondCountRollSwabs: number;
  secondCountTapeLaparotomy: number;
  secondCountAbdominalPack: number;
  secondCountBlades: number;
  secondCountNeedles: number;
  secondCountSutures: number;
  secondCountTrocars: number;
  secondCountCorrect: boolean | null;
  
  allCountsCorrect: boolean;
  discrepancyOccurred: boolean;
  xRayOrdered: boolean;
  incidentReportFiled: boolean;
  countEvents: any[];
}

export default function SurgicalCountPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [count, setCount] = useState<CountChecklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showInitDialog, setShowInitDialog] = useState(false);
  const [initData, setInitData] = useState({
    scrubNurseName: '',
    circulatingNurseName: '',
    preCountInstruments: 0,
    preCountSmallSwabs: 0,
    preCountMediumSwabs: 0,
    preCountLargeSwabs: 0,
    preCountBlades: 0,
    preCountNeedles: 0,
  });

  useEffect(() => {
    fetchCount();
  }, [params.id]);

  const fetchCount = async () => {
    try {
      const response = await fetch(`/api/surgeries/${params.id}/count`);
      if (response.ok) {
        const data = await response.json();
        setCount(data);
      } else if (response.status === 404) {
        // Count checklist doesn't exist yet
        setCount(null);
      }
    } catch (error) {
      console.error('Error fetching count:', error);
    } finally {
      setLoading(false);
    }
  };

  const initializeCount = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/surgeries/${params.id}/count`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(initData)
      });

      if (response.ok) {
        const data = await response.json();
        setCount(data);
        setShowInitDialog(false);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to initialize count');
      }
    } catch (error) {
      console.error('Error initializing count:', error);
      alert('Failed to initialize count');
    } finally {
      setSaving(false);
    }
  };

  const updateCount = async (updates: any) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/surgeries/${params.id}/count`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (response.ok) {
        const data = await response.json();
        setCount(data);
      }
    } catch (error) {
      console.error('Error updating count:', error);
      alert('Failed to update count');
    } finally {
      setSaving(false);
    }
  };

  const calculateExpectedCount = (type: 'instruments' | 'swabs') => {
    if (!count) return 0;
    
    if (type === 'instruments') {
      return count.preCountInstruments + count.addedInstruments;
    } else {
      return count.preCountSmallSwabs + count.preCountMediumSwabs + 
             count.preCountLargeSwabs + count.addedSmallSwabs + 
             count.addedMediumSwabs + count.addedLargeSwabs;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!count) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-6">
          <Link href={`/dashboard/surgeries/${params.id}`} className="text-blue-600 hover:underline">
            ← Back to Surgery
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-4">Surgical Count Checklist</h1>
        </div>

        <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-8 text-center">
          <h2 className="text-2xl font-semibold text-yellow-800 mb-4">
            Count Checklist Not Started
          </h2>
          <p className="text-yellow-700 mb-6">
            Initialize the surgical count checklist to begin tracking instruments, swabs, and sharps.
          </p>
          <button
            onClick={() => setShowInitDialog(true)}
            className="bg-yellow-600 text-white px-6 py-3 rounded-lg hover:bg-yellow-700 font-semibold"
          >
            Initialize Count Checklist
          </button>
        </div>

        {showInitDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-bold mb-4">Initialize Surgical Count</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Scrub Nurse Name *
                  </label>
                  <input
                    type="text"
                    value={initData.scrubNurseName}
                    onChange={(e) => setInitData({...initData, scrubNurseName: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Circulating Nurse Name
                  </label>
                  <input
                    type="text"
                    value={initData.circulatingNurseName}
                    onChange={(e) => setInitData({...initData, circulatingNurseName: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-semibold mb-3">Pre-Surgery Count</h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-700 mb-1">Instruments</label>
                      <input
                        type="number"
                        value={initData.preCountInstruments}
                        onChange={(e) => setInitData({...initData, preCountInstruments: parseInt(e.target.value) || 0})}
                        className="w-full border rounded px-3 py-2"
                        min="0"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-gray-700 mb-1">Small Swabs</label>
                      <input
                        type="number"
                        value={initData.preCountSmallSwabs}
                        onChange={(e) => setInitData({...initData, preCountSmallSwabs: parseInt(e.target.value) || 0})}
                        className="w-full border rounded px-3 py-2"
                        min="0"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-gray-700 mb-1">Medium Swabs</label>
                      <input
                        type="number"
                        value={initData.preCountMediumSwabs}
                        onChange={(e) => setInitData({...initData, preCountMediumSwabs: parseInt(e.target.value) || 0})}
                        className="w-full border rounded px-3 py-2"
                        min="0"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-gray-700 mb-1">Large Swabs</label>
                      <input
                        type="number"
                        value={initData.preCountLargeSwabs}
                        onChange={(e) => setInitData({...initData, preCountLargeSwabs: parseInt(e.target.value) || 0})}
                        className="w-full border rounded px-3 py-2"
                        min="0"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-gray-700 mb-1">Blades</label>
                      <input
                        type="number"
                        value={initData.preCountBlades}
                        onChange={(e) => setInitData({...initData, preCountBlades: parseInt(e.target.value) || 0})}
                        className="w-full border rounded px-3 py-2"
                        min="0"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-gray-700 mb-1">Needles</label>
                      <input
                        type="number"
                        value={initData.preCountNeedles}
                        onChange={(e) => setInitData({...initData, preCountNeedles: parseInt(e.target.value) || 0})}
                        className="w-full border rounded px-3 py-2"
                        min="0"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={initializeCount}
                  disabled={saving || !initData.scrubNurseName}
                  className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {saving ? 'Initializing...' : 'Initialize Count'}
                </button>
                <button
                  onClick={() => setShowInitDialog(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <Link href={`/dashboard/surgeries/${params.id}`} className="text-blue-600 hover:underline">
          ← Back to Surgery
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mt-4">Surgical Count Checklist</h1>
        <p className="text-gray-600 mt-2">{count.surgery.procedureName} - {count.surgery.patient.name}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-sm text-blue-600 font-medium">Expected Instruments</div>
          <div className="text-2xl font-bold text-blue-900">{calculateExpectedCount('instruments')}</div>
        </div>
        
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="text-sm text-purple-600 font-medium">Expected Swabs</div>
          <div className="text-2xl font-bold text-purple-900">{calculateExpectedCount('swabs')}</div>
        </div>

        <div className={`border rounded-lg p-4 ${count.firstCountCorrect ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
          <div className={`text-sm font-medium ${count.firstCountCorrect ? 'text-green-600' : 'text-yellow-600'}`}>
            First Count
          </div>
          <div className={`text-2xl font-bold ${count.firstCountCorrect ? 'text-green-900' : 'text-yellow-900'}`}>
            {count.firstCountCorrect === null ? 'Pending' : count.firstCountCorrect ? 'Correct' : 'Discrepancy'}
          </div>
        </div>

        <div className={`border rounded-lg p-4 ${count.allCountsCorrect ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
          <div className={`text-sm font-medium ${count.allCountsCorrect ? 'text-green-600' : 'text-gray-600'}`}>
            Final Status
          </div>
          <div className={`text-2xl font-bold ${count.allCountsCorrect ? 'text-green-900' : 'text-gray-900'}`}>
            {count.allCountsCorrect ? 'Complete' : 'In Progress'}
          </div>
        </div>
      </div>

      {/* Count Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Instruments Table */}
        <div className="bg-white border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Instruments Count</h3>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Phase</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-gray-700">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="px-4 py-3">Pre-count</td>
                <td className="px-4 py-3 text-right font-semibold">{count.preCountInstruments}</td>
              </tr>
              <tr>
                <td className="px-4 py-3">Added</td>
                <td className="px-4 py-3 text-right">
                  <input
                    type="number"
                    value={count.addedInstruments}
                    onChange={(e) => updateCount({ addedInstruments: parseInt(e.target.value) || 0 })}
                    className="w-20 border rounded px-2 py-1 text-right"
                    min="0"
                  />
                </td>
              </tr>
              <tr className="bg-blue-50">
                <td className="px-4 py-3 font-medium">Expected Total</td>
                <td className="px-4 py-3 text-right font-bold">{calculateExpectedCount('instruments')}</td>
              </tr>
              <tr>
                <td className="px-4 py-3">First Count</td>
                <td className="px-4 py-3 text-right">
                  <input
                    type="number"
                    value={count.firstCountInstruments}
                    onChange={(e) => updateCount({ firstCountInstruments: parseInt(e.target.value) || 0 })}
                    className="w-20 border rounded px-2 py-1 text-right"
                    min="0"
                  />
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3">Second Count</td>
                <td className="px-4 py-3 text-right">
                  <input
                    type="number"
                    value={count.secondCountInstruments}
                    onChange={(e) => updateCount({ secondCountInstruments: parseInt(e.target.value) || 0 })}
                    className="w-20 border rounded px-2 py-1 text-right"
                    min="0"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Swabs Table */}
        <div className="bg-white border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Swabs Count</h3>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Type</th>
                <th className="px-3 py-2 text-right font-medium text-gray-700">Pre</th>
                <th className="px-3 py-2 text-right font-medium text-gray-700">Added</th>
                <th className="px-3 py-2 text-right font-medium text-gray-700">1st</th>
                <th className="px-3 py-2 text-right font-medium text-gray-700">2nd</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="px-3 py-2">Small</td>
                <td className="px-3 py-2 text-right">{count.preCountSmallSwabs}</td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    value={count.addedSmallSwabs}
                    onChange={(e) => updateCount({ addedSmallSwabs: parseInt(e.target.value) || 0 })}
                    className="w-16 border rounded px-2 py-1 text-right"
                    min="0"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    value={count.firstCountSmallSwabs}
                    onChange={(e) => updateCount({ firstCountSmallSwabs: parseInt(e.target.value) || 0 })}
                    className="w-16 border rounded px-2 py-1 text-right"
                    min="0"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    value={count.secondCountSmallSwabs}
                    onChange={(e) => updateCount({ secondCountSmallSwabs: parseInt(e.target.value) || 0 })}
                    className="w-16 border rounded px-2 py-1 text-right"
                    min="0"
                  />
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2">Medium</td>
                <td className="px-3 py-2 text-right">{count.preCountMediumSwabs}</td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    value={count.addedMediumSwabs}
                    onChange={(e) => updateCount({ addedMediumSwabs: parseInt(e.target.value) || 0 })}
                    className="w-16 border rounded px-2 py-1 text-right"
                    min="0"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    value={count.firstCountMediumSwabs}
                    onChange={(e) => updateCount({ firstCountMediumSwabs: parseInt(e.target.value) || 0 })}
                    className="w-16 border rounded px-2 py-1 text-right"
                    min="0"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    value={count.secondCountMediumSwabs}
                    onChange={(e) => updateCount({ secondCountMediumSwabs: parseInt(e.target.value) || 0 })}
                    className="w-16 border rounded px-2 py-1 text-right"
                    min="0"
                  />
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2">Large</td>
                <td className="px-3 py-2 text-right">{count.preCountLargeSwabs}</td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    value={count.addedLargeSwabs}
                    onChange={(e) => updateCount({ addedLargeSwabs: parseInt(e.target.value) || 0 })}
                    className="w-16 border rounded px-2 py-1 text-right"
                    min="0"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    value={count.firstCountLargeSwabs}
                    onChange={(e) => updateCount({ firstCountLargeSwabs: parseInt(e.target.value) || 0 })}
                    className="w-16 border rounded px-2 py-1 text-right"
                    min="0"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    value={count.secondCountLargeSwabs}
                    onChange={(e) => updateCount({ secondCountLargeSwabs: parseInt(e.target.value) || 0 })}
                    className="w-16 border rounded px-2 py-1 text-right"
                    min="0"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Count Verification */}
      <div className="mt-6 bg-white border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Count Verification</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="flex items-center space-x-3 mb-4">
              <input
                type="checkbox"
                checked={count.firstCountCorrect || false}
                onChange={(e) => updateCount({ firstCountCorrect: e.target.checked })}
                className="w-5 h-5 text-green-600"
              />
              <span className="font-medium">First Count Correct</span>
            </label>

            {count.firstCountCorrect === false && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Count Discrepancy
                </label>
                <textarea
                  value={count.firstCountDiscrepancy || ''}
                  onChange={(e) => updateCount({ firstCountDiscrepancy: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  rows={2}
                  placeholder="Describe the discrepancy..."
                />
              </div>
            )}
          </div>

          <div>
            <label className="flex items-center space-x-3 mb-4">
              <input
                type="checkbox"
                checked={count.secondCountCorrect || false}
                onChange={(e) => updateCount({ secondCountCorrect: e.target.checked })}
                className="w-5 h-5 text-green-600"
              />
              <span className="font-medium">Second Count Correct</span>
            </label>

            <label className="flex items-center space-x-3 mb-4">
              <input
                type="checkbox"
                checked={count.allCountsCorrect}
                onChange={(e) => updateCount({ allCountsCorrect: e.target.checked })}
                className="w-5 h-5 text-green-600"
              />
              <span className="font-medium text-green-700">All Counts Verified & Correct</span>
            </label>
          </div>
        </div>

        {count.discrepancyOccurred && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <h4 className="font-semibold text-red-800 mb-2">⚠️ Discrepancy Management</h4>
            <label className="flex items-center space-x-3 mb-2">
              <input
                type="checkbox"
                checked={count.xRayOrdered}
                onChange={(e) => updateCount({ xRayOrdered: e.target.checked })}
                className="w-5 h-5"
              />
              <span>X-Ray Ordered</span>
            </label>
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={count.incidentReportFiled}
                onChange={(e) => updateCount({ incidentReportFiled: e.target.checked })}
                className="w-5 h-5"
              />
              <span>Incident Report Filed</span>
            </label>
          </div>
        )}
      </div>

      {saving && (
        <div className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg">
          Saving...
        </div>
      )}
    </div>
  );
}
