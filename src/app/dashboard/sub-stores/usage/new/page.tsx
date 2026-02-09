'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  ClipboardList, 
  Plus, 
  Package,
  User,
  Save,
  AlertCircle,
  CheckCircle,
  Search,
  X
} from 'lucide-react';

interface SubStoreItem {
  id: string;
  theatreNumber: string;
  itemName: string;
  itemDescription?: string;
  category: string;
  currentStock: number;
  unit: string;
}

interface Patient {
  id: string;
  folderNumber: string;
  firstName: string;
  lastName: string;
  surgeryName?: string;
}

interface UsageEntry {
  itemId: string;
  itemName: string;
  quantityUsed: number;
  quantityReturned: number;
  quantityWasted: number;
  wasteReason: string;
  usageNotes: string;
}

export default function NewUsageLogPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [selectedTheatre, setSelectedTheatre] = useState('');
  const [subStoreItems, setSubStoreItems] = useState<SubStoreItem[]>([]);
  const [usageEntries, setUsageEntries] = useState<UsageEntry[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [showPatientSearch, setShowPatientSearch] = useState(false);
  const [usageNotes, setUsageNotes] = useState('');

  const theatres = [
    'THEATRE_1', 'THEATRE_2', 'THEATRE_3', 'THEATRE_4', 'THEATRE_5',
    'THEATRE_6', 'THEATRE_7', 'THEATRE_8', 'THEATRE_9', 'THEATRE_10',
    'THEATRE_11', 'THEATRE_12', 'THEATRE_13'
  ];

  const categories = [
    'SUTURES',
    'SYRINGES_NEEDLES',
    'GLOVES',
    'GAUZE_DRESSINGS',
    'CATHETERS_TUBES',
    'SURGICAL_BLADES',
    'IV_SUPPLIES',
    'MEDICATIONS',
    'ANESTHESIA_SUPPLIES',
    'STERILIZATION',
    'INSTRUMENTS',
    'IMPLANTS',
    'DISPOSABLES',
    'OTHER'
  ];

  // Fetch sub-store items when theatre is selected
  useEffect(() => {
    if (selectedTheatre) {
      fetchSubStoreItems();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTheatre]);

  // Search patients
  useEffect(() => {
    if (patientSearch.length >= 2) {
      searchPatients();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientSearch]);

  const fetchSubStoreItems = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/sub-stores?theatre=${selectedTheatre}`);
      if (response.ok) {
        const data = await response.json();
        setSubStoreItems(data.subStores || []);
      }
    } catch (error) {
      console.error('Error fetching items:', error);
    } finally {
      setLoading(false);
    }
  };

  const searchPatients = async () => {
    try {
      const response = await fetch(`/api/patients?search=${patientSearch}&status=IN_SURGERY`);
      if (response.ok) {
        const data = await response.json();
        setPatients(data.patients || []);
      }
    } catch (error) {
      console.error('Error searching patients:', error);
    }
  };

  const addUsageEntry = (item: SubStoreItem) => {
    if (usageEntries.find(e => e.itemId === item.id)) {
      return; // Already added
    }
    setUsageEntries([...usageEntries, {
      itemId: item.id,
      itemName: item.itemName,
      quantityUsed: 0,
      quantityReturned: 0,
      quantityWasted: 0,
      wasteReason: '',
      usageNotes: ''
    }]);
  };

  const updateUsageEntry = (itemId: string, field: keyof UsageEntry, value: string | number) => {
    setUsageEntries(usageEntries.map(entry => 
      entry.itemId === itemId ? { ...entry, [field]: value } : entry
    ));
  };

  const removeUsageEntry = (itemId: string) => {
    setUsageEntries(usageEntries.filter(e => e.itemId !== itemId));
  };

  const handleSubmit = async () => {
    if (!selectedTheatre) {
      setError('Please select a theatre');
      return;
    }
    if (usageEntries.length === 0) {
      setError('Please add at least one item');
      return;
    }
    if (usageEntries.every(e => e.quantityUsed === 0)) {
      setError('Please enter quantity used for at least one item');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const response = await fetch('/api/sub-stores/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theatreNumber: selectedTheatre,
          patientId: selectedPatient?.id,
          entries: usageEntries.filter(e => e.quantityUsed > 0),
          notes: usageNotes
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to log usage');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/dashboard/sub-stores/usage');
      }, 2000);
    } catch (error: any) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/sub-stores/usage" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <ClipboardList className="w-8 h-8 text-primary-600" />
            Log Consumable Usage
          </h1>
          <p className="text-gray-600 mt-1">
            Record items used during surgery
          </p>
        </div>
      </div>

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-500" />
          <span className="text-green-800">Usage logged successfully! Redirecting...</span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-red-500" />
          <span className="text-red-800">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Theatre Selection */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Theatre Selection</h2>
            <select
              value={selectedTheatre}
              onChange={(e) => {
                setSelectedTheatre(e.target.value);
                setUsageEntries([]);
              }}
              className="input-field"
              title="Select theatre"
            >
              <option value="">Select Theatre</option>
              {theatres.map(t => (
                <option key={t} value={t}>{t.replace('_', ' ')}</option>
              ))}
            </select>
          </div>

          {/* Patient Link (Optional) */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Link to Patient (Optional)</h2>
            {selectedPatient ? (
              <div className="flex items-center justify-between p-3 bg-primary-50 rounded-lg">
                <div>
                  <p className="font-medium text-primary-900">
                    {selectedPatient.firstName} {selectedPatient.lastName}
                  </p>
                  <p className="text-sm text-primary-700">{selectedPatient.folderNumber}</p>
                </div>
                <button
                  onClick={() => setSelectedPatient(null)}
                  className="p-1 hover:bg-primary-100 rounded"
                  title="Clear patient selection"
                >
                  <X className="w-5 h-5 text-primary-600" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by patient name or folder number..."
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  onFocus={() => setShowPatientSearch(true)}
                  className="input-field pl-10"
                />
                {showPatientSearch && patients.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {patients.map(patient => (
                      <button
                        key={patient.id}
                        onClick={() => {
                          setSelectedPatient(patient);
                          setShowPatientSearch(false);
                          setPatientSearch('');
                        }}
                        className="w-full p-3 text-left hover:bg-gray-50 border-b last:border-b-0"
                      >
                        <p className="font-medium">{patient.firstName} {patient.lastName}</p>
                        <p className="text-sm text-gray-500">{patient.folderNumber}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Usage Entries */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Items Used</h2>
            
            {usageEntries.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <p>Select items from the list on the right to add them here</p>
              </div>
            ) : (
              <div className="space-y-4">
                {usageEntries.map((entry) => (
                  <div key={entry.itemId} className="p-4 border rounded-lg bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-medium text-gray-900">{entry.itemName}</h3>
                      <button
                        onClick={() => removeUsageEntry(entry.itemId)}
                        className="p-1 hover:bg-red-100 rounded text-red-500"
                        title="Remove item"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-sm text-gray-600">Qty Used</label>
                        <input
                          type="number"
                          min="0"
                          value={entry.quantityUsed}
                          onChange={(e) => updateUsageEntry(entry.itemId, 'quantityUsed', parseInt(e.target.value) || 0)}
                          className="input-field"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-gray-600">Qty Returned</label>
                        <input
                          type="number"
                          min="0"
                          value={entry.quantityReturned}
                          onChange={(e) => updateUsageEntry(entry.itemId, 'quantityReturned', parseInt(e.target.value) || 0)}
                          className="input-field"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-gray-600">Qty Wasted</label>
                        <input
                          type="number"
                          min="0"
                          value={entry.quantityWasted}
                          onChange={(e) => updateUsageEntry(entry.itemId, 'quantityWasted', parseInt(e.target.value) || 0)}
                          className="input-field"
                          placeholder="0"
                        />
                      </div>
                    </div>
                    {entry.quantityWasted > 0 && (
                      <div className="mt-3">
                        <label className="text-sm text-gray-600">Waste Reason</label>
                        <input
                          type="text"
                          placeholder="Reason for wastage..."
                          value={entry.wasteReason}
                          onChange={(e) => updateUsageEntry(entry.itemId, 'wasteReason', e.target.value)}
                          className="input-field"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* General Notes */}
            <div className="mt-6">
              <label className="text-sm font-medium text-gray-700">General Notes</label>
              <textarea
                value={usageNotes}
                onChange={(e) => setUsageNotes(e.target.value)}
                rows={3}
                className="input-field mt-1"
                placeholder="Any additional notes about this usage..."
              />
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={saving || usageEntries.length === 0}
            className="w-full btn-primary py-3 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>Saving...</>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Log Usage
              </>
            )}
          </button>
        </div>

        {/* Right Column - Available Items */}
        <div className="card p-6 h-fit sticky top-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Available Items</h2>
          
          {!selectedTheatre ? (
            <p className="text-gray-500 text-center py-8">
              Select a theatre to see available items
            </p>
          ) : loading ? (
            <p className="text-gray-500 text-center py-8">Loading items...</p>
          ) : subStoreItems.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No items in this theatre&apos;s sub-store
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {subStoreItems.map((item) => {
                const isAdded = usageEntries.some(e => e.itemId === item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => !isAdded && addUsageEntry(item)}
                    disabled={isAdded}
                    className={`w-full p-3 text-left rounded-lg border transition-colors ${
                      isAdded 
                        ? 'bg-primary-50 border-primary-200 cursor-default'
                        : 'hover:bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{item.itemName}</p>
                        <p className="text-xs text-gray-500">{item.category}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-700">{item.currentStock}</p>
                        <p className="text-xs text-gray-500">{item.unit}</p>
                      </div>
                    </div>
                    {isAdded && (
                      <span className="inline-flex items-center gap-1 mt-1 text-xs text-primary-600">
                        <CheckCircle className="w-3 h-3" /> Added
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
