'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { 
  Pill, 
  Package, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Calendar,
  User,
  Eye,
  Check,
  AlertTriangle,
  XCircle,
  RefreshCw
} from 'lucide-react';

interface Medication {
  name: string;
  dose: string;
  route: string;
  frequency: string;
  timing: string;
}

interface MedicationPackingItem {
  drugName: string;
  isPacked: boolean;
  isOutOfStock: boolean;
  substituteAvailable: boolean;
  substituteDrugName: string;
  pharmacistNote: string;
}

interface Prescription {
  id: string;
  patientName: string;
  scheduledSurgeryDate: string;
  medications: string;
  fluids?: string;
  emergencyDrugs?: string;
  allergyAlerts?: string;
  specialInstructions?: string;
  urgency: 'ROUTINE' | 'URGENT' | 'EMERGENCY';
  status: string;
  isLateArrival?: boolean;
  lateArrivalFlaggedAt?: string;
  hasOutOfStockItems?: boolean;
  outOfStockItems?: string;
  medicationPackingStatus?: string;
  prescribedBy: { fullName: string };
  approvedBy?: { fullName: string };
  packedBy?: { fullName: string };
  packedAt?: string;
  surgery: {
    procedureName: string;
  };
}

export default function PrescriptionsPage() {
  const { data: session } = useSession();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'needsPacking' | 'all' | 'packed'>('needsPacking');
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null);
  const [showPackModal, setShowPackModal] = useState(false);
  const [packingNotes, setPackingNotes] = useState('');
  const [packing, setPacking] = useState(false);
  const [medicationItems, setMedicationItems] = useState<MedicationPackingItem[]>([]);

  useEffect(() => {
    fetchPrescriptions();
    // Auto-refresh every 30 seconds for cross-device sync
    const interval = setInterval(fetchPrescriptions, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const fetchPrescriptions = async () => {
    try {
      let url = '/api/prescriptions';
      
      if (filter === 'needsPacking') {
        url += '?needsPacking=true';
      } else if (filter === 'packed') {
        url += '?status=PACKED';
      }

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (filter === 'needsPacking') {
          setPrescriptions(data.filter((p: Prescription) => 
            ['APPROVED', 'PARTIALLY_PACKED', 'LATE_ARRIVAL'].includes(p.status) && 
            p.status !== 'PACKED'
          ));
        } else {
          setPrescriptions(data);
        }
      }
    } catch (error) {
      console.error('Error fetching prescriptions:', error);
    } finally {
      setLoading(false);
    }
  };

  const parseMedications = (medicationsJson: string): Medication[] => {
    try {
      return JSON.parse(medicationsJson);
    } catch {
      return [];
    }
  };

  const handlePackPrescription = async () => {
    if (!selectedPrescription) return;

    setPacking(true);
    try {
      const response = await fetch(`/api/prescriptions/${selectedPrescription.id}/pack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          packingNotes,
          medicationPackingStatus: medicationItems,
        }),
      });

      if (response.ok) {
        setShowPackModal(false);
        setPackingNotes('');
        setSelectedPrescription(null);
        setMedicationItems([]);
        fetchPrescriptions();
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to mark prescription as packed');
      }
    } catch (error) {
      console.error('Error packing prescription:', error);
      alert('An error occurred');
    } finally {
      setPacking(false);
    }
  };

  const openPackModal = (prescription: Prescription) => {
    setSelectedPrescription(prescription);
    // Initialize per-medication tracking from existing medications
    const meds = parseMedications(prescription.medications);
    const existing = prescription.medicationPackingStatus 
      ? (() => { try { return JSON.parse(prescription.medicationPackingStatus); } catch { return []; } })()
      : [];
    
    setMedicationItems(meds.map(med => {
      const ex = existing.find((e: MedicationPackingItem) => e.drugName === med.name);
      return {
        drugName: med.name,
        isPacked: ex?.isPacked || false,
        isOutOfStock: ex?.isOutOfStock || false,
        substituteAvailable: ex?.substituteAvailable || false,
        substituteDrugName: ex?.substituteDrugName || '',
        pharmacistNote: ex?.pharmacistNote || '',
      };
    }));
    setShowPackModal(true);
  };

  const toggleMedPacked = (index: number) => {
    setMedicationItems(prev => prev.map((item, i) => 
      i === index ? { ...item, isPacked: !item.isPacked, isOutOfStock: !item.isPacked ? false : item.isOutOfStock } : item
    ));
  };

  const toggleMedOutOfStock = (index: number) => {
    setMedicationItems(prev => prev.map((item, i) => 
      i === index ? { ...item, isOutOfStock: !item.isOutOfStock, isPacked: !item.isOutOfStock ? false : item.isPacked } : item
    ));
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'EMERGENCY':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'URGENT':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-300';
    }
  };

  const timeUntilSurgery = (date: string) => {
    const now = new Date();
    const surgery = new Date(date);
    const hours = Math.floor((surgery.getTime() - now.getTime()) / (1000 * 60 * 60));
    return hours;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <Pill className="h-8 w-8" />
          Anesthetic Prescriptions
        </h1>
        <p className="text-gray-600 mt-2">
          Pack and prepare medications for upcoming surgeries
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white rounded-lg shadow-sm mb-6">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setFilter('needsPacking')}
            className={`px-6 py-3 font-medium ${
              filter === 'needsPacking'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Needs Packing
              <span className="bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded-full">
                {prescriptions.filter(p => p.status === 'APPROVED' && !p.packedAt).length}
              </span>
            </div>
          </button>
          <button
            onClick={() => setFilter('packed')}
            className={`px-6 py-3 font-medium ${
              filter === 'packed'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Packed
            </div>
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-6 py-3 font-medium ${
              filter === 'all'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            All Prescriptions
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Needs Packing</p>
              <p className="text-2xl font-bold">
                {prescriptions.filter(p => p.status === 'APPROVED' && !p.packedAt).length}
              </p>
            </div>
            <Package className="h-8 w-8 text-orange-600" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Packed Today</p>
              <p className="text-2xl font-bold">
                {prescriptions.filter(p => p.packedAt && new Date(p.packedAt).toDateString() === new Date().toDateString()).length}
              </p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Emergency</p>
              <p className="text-2xl font-bold">
                {prescriptions.filter(p => p.urgency === 'EMERGENCY' && !p.packedAt).length}
              </p>
            </div>
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
        </div>
      </div>

      {/* Prescriptions List */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : prescriptions.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <Pill className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No prescriptions found</h3>
          <p className="text-gray-600">
            {filter === 'needsPacking' 
              ? 'All prescriptions have been packed!'
              : 'No prescriptions available'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {prescriptions.map((prescription) => {
            const medications = parseMedications(prescription.medications);
            const hoursUntilSurgery = timeUntilSurgery(prescription.scheduledSurgeryDate);

            return (
              <div key={prescription.id} className="bg-white rounded-lg shadow-sm overflow-hidden">
                <div className="p-6">
                  {/* Header */}
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {prescription.patientName}
                        </h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getUrgencyColor(prescription.urgency)}`}>
                          {prescription.urgency}
                        </span>
                        {prescription.isLateArrival && (
                          <span className="bg-yellow-100 text-yellow-800 border border-yellow-300 px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Late Arrival
                          </span>
                        )}
                        {prescription.hasOutOfStockItems && (
                          <span className="bg-red-100 text-red-800 border border-red-300 px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                            <XCircle className="h-3 w-3" />
                            Out of Stock
                          </span>
                        )}
                        {prescription.status === 'PARTIALLY_PACKED' && (
                          <span className="bg-amber-100 text-amber-800 border border-amber-300 px-2 py-1 rounded-full text-xs font-medium">
                            Partially Packed
                          </span>
                        )}
                        {prescription.packedAt && prescription.status === 'PACKED' && (
                          <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                            ✓ Packed
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span>Surgery: {new Date(prescription.scheduledSurgeryDate).toLocaleString()}</span>
                        </div>
                        {hoursUntilSurgery > 0 && hoursUntilSurgery < 24 && (
                          <div className="flex items-center gap-1 text-orange-600 font-medium">
                            <Clock className="h-4 w-4" />
                            <span>In {hoursUntilSurgery}h</span>
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {prescription.surgery.procedureName}
                      </p>
                    </div>
                    {(!prescription.packedAt || prescription.status === 'PARTIALLY_PACKED') && (
                      <button
                        onClick={() => openPackModal(prescription)}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
                      >
                        <Check className="h-5 w-5" />
                        {prescription.status === 'PARTIALLY_PACKED' ? 'Update Packing' : 'Pack Drugs'}
                      </button>
                    )}
                  </div>

                  {/* Allergy Alerts */}
                  {prescription.allergyAlerts && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-red-900">Allergy Alert</p>
                          <p className="text-sm text-red-800">{prescription.allergyAlerts}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Medications */}
                  <div className="mb-4">
                    <h4 className="font-medium text-gray-900 mb-2">Medications:</h4>
                    <div className="bg-gray-50 rounded-lg p-3">
                      {medications.length > 0 ? (
                        <div className="space-y-2">
                          {medications.map((med, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-sm">
                              <Pill className="h-4 w-4 text-gray-500 flex-shrink-0 mt-0.5" />
                              <div>
                                <span className="font-medium">{med.name}</span> - {med.dose} {med.route}
                                <span className="text-gray-600"> ({med.timing})</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-600">No medications specified</p>
                      )}
                    </div>
                  </div>

                  {/* Additional Info */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {prescription.fluids && (
                      <div>
                        <p className="font-medium text-gray-700">IV Fluids:</p>
                        <p className="text-gray-600">{prescription.fluids}</p>
                      </div>
                    )}
                    {prescription.emergencyDrugs && (
                      <div>
                        <p className="font-medium text-gray-700">Emergency Drugs:</p>
                        <p className="text-gray-600">{prescription.emergencyDrugs}</p>
                      </div>
                    )}
                  </div>

                  {prescription.specialInstructions && (
                    <div className="mt-4 bg-blue-50 rounded-lg p-3">
                      <p className="font-medium text-blue-900 text-sm">Special Instructions:</p>
                      <p className="text-sm text-blue-800">{prescription.specialInstructions}</p>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <User className="h-4 w-4" />
                      <span>Prescribed by: {prescription.prescribedBy?.fullName || 'Not assigned'}</span>
                    </div>
                    {prescription.packedBy && (
                      <div className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        <span>Packed by: {prescription.packedBy?.fullName || 'Not assigned'}</span>
                        {prescription.packedAt && (
                          <span className="text-gray-500">
                            on {new Date(prescription.packedAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pack Modal with Per-Medication Tracking */}
      {showPackModal && selectedPrescription && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-2">Pack Prescription</h3>
            <p className="text-gray-600 mb-4">
              Patient: <strong>{selectedPrescription.patientName}</strong> | 
              Surgery: {selectedPrescription.surgery?.procedureName}
            </p>

            {selectedPrescription.isLateArrival && (
              <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-600" />
                <span className="text-sm text-yellow-800 font-medium">
                  This prescription arrived LATE (after 6 PM deadline). Please prioritize packing.
                </span>
              </div>
            )}

            {/* Per-Medication Packing Checklist */}
            <div className="mb-4">
              <h4 className="font-medium text-gray-900 mb-3">Medication Checklist:</h4>
              <div className="space-y-3">
                {medicationItems.map((item, idx) => (
                  <div key={idx} className={`border rounded-lg p-3 ${
                    item.isOutOfStock ? 'border-red-300 bg-red-50' : 
                    item.isPacked ? 'border-green-300 bg-green-50' : 'border-gray-200'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900">{item.drugName}</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => toggleMedPacked(idx)}
                          className={`px-3 py-1 rounded text-xs font-medium ${
                            item.isPacked 
                              ? 'bg-green-600 text-white' 
                              : 'bg-gray-100 text-gray-600 hover:bg-green-100'
                          }`}
                        >
                          {item.isPacked ? '✓ Packed' : 'Mark Packed'}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleMedOutOfStock(idx)}
                          className={`px-3 py-1 rounded text-xs font-medium ${
                            item.isOutOfStock 
                              ? 'bg-red-600 text-white' 
                              : 'bg-gray-100 text-gray-600 hover:bg-red-100'
                          }`}
                        >
                          {item.isOutOfStock ? '✗ Out of Stock' : 'Out of Stock'}
                        </button>
                      </div>
                    </div>
                    {item.isOutOfStock && (
                      <div className="mt-2 space-y-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={item.substituteAvailable}
                            onChange={() => {
                              setMedicationItems(prev => prev.map((m, i) => 
                                i === idx ? { ...m, substituteAvailable: !m.substituteAvailable } : m
                              ));
                            }}
                            className="rounded"
                          />
                          Substitute available
                        </label>
                        {item.substituteAvailable && (
                          <input
                            type="text"
                            placeholder="Substitute drug name"
                            value={item.substituteDrugName}
                            onChange={(e) => {
                              setMedicationItems(prev => prev.map((m, i) => 
                                i === idx ? { ...m, substituteDrugName: e.target.value } : m
                              ));
                            }}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                          />
                        )}
                        <input
                          type="text"
                          placeholder="Pharmacist note for this drug..."
                          value={item.pharmacistNote}
                          onChange={(e) => {
                            setMedicationItems(prev => prev.map((m, i) => 
                              i === idx ? { ...m, pharmacistNote: e.target.value } : m
                            ));
                          }}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Out-of-stock summary */}
            {medicationItems.some(m => m.isOutOfStock) && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-sm font-medium text-red-900 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  Out-of-stock drugs will be flagged and the surgeon &amp; anesthetist will be notified automatically.
                </p>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Packing Notes (Optional)
              </label>
              <textarea
                value={packingNotes}
                onChange={(e) => setPackingNotes(e.target.value)}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="Add any notes..."
              />
            </div>

            {/* Progress indicator */}
            <div className="mb-4 bg-gray-50 rounded-lg p-3">
              <div className="flex justify-between text-sm mb-1">
                <span>Packing Progress</span>
                <span>{medicationItems.filter(m => m.isPacked || m.isOutOfStock).length} / {medicationItems.length}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{ width: `${medicationItems.length > 0 ? (medicationItems.filter(m => m.isPacked || m.isOutOfStock).length / medicationItems.length) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowPackModal(false);
                  setPackingNotes('');
                  setSelectedPrescription(null);
                  setMedicationItems([]);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={packing}
              >
                Cancel
              </button>
              <button
                onClick={handlePackPrescription}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
                disabled={packing || medicationItems.every(m => !m.isPacked && !m.isOutOfStock)}
              >
                {packing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-5 w-5" />
                    Confirm Packing
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
