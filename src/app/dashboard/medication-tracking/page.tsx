'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  Pill,
  Package,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Clock,
  ArrowLeftRight,
  FileText,
  Radio,
  Plus,
  Minus,
  RefreshCw,
  Send,
  Eye,
  XCircle,
  RotateCcw,
  Activity,
  Shield,
} from 'lucide-react';

// ===== TYPES =====
interface UsageRecord {
  id: string;
  prescriptionId: string;
  surgeryId: string;
  drugName: string;
  dosage: string;
  route: string;
  quantityDispensed: number;
  quantityAdministered: number;
  quantityWasted: number;
  quantityRemaining: number;
  administrationLog: string | null;
  isFullyUsed: boolean;
  isReturnRequired: boolean;
  isReturned: boolean;
  returnedAt: string | null;
  returnedQuantity: number | null;
  createdAt: string;
}

interface Reconciliation {
  id: string;
  prescriptionId: string;
  surgeryId: string;
  reconciledByName: string;
  reconciledAt: string;
  totalDrugsDispensed: number;
  totalDrugsUsed: number;
  totalDrugsToReturn: number;
  totalDrugsReturned: number;
  totalDrugsWasted: number;
  reconciliationItems: string;
  status: string;
  returnDeadline: string | null;
  queryIssuedAt: string | null;
  queryReason: string | null;
  notes: string | null;
  prescription?: { patientName: string; surgeryId: string; prescribedByName: string };
  surgery?: { procedureName: string; scheduledDate: string };
}

interface AdditionalRequest {
  id: string;
  prescriptionId: string;
  surgeryId: string;
  requestedByName: string;
  requestedAt: string;
  medicationsRequested: string;
  urgency: string;
  reason: string;
  status: string;
  acknowledgedByName: string | null;
  acknowledgedAt: string | null;
  packedByName: string | null;
  packedAt: string | null;
  collectedAt: string | null;
  walkieTalkieNotified: boolean;
  notes: string | null;
  pharmacistNotes: string | null;
  surgery?: { procedureName: string; scheduledDate: string };
  prescription?: { patientName: string };
}

interface NonReturnQuery {
  id: string;
  reconciliationId: string;
  prescriptionId: string;
  surgeryId: string;
  queriedUserName: string;
  issuedByName: string;
  issuedAt: string;
  unreturvedItems: string;
  responseDeadline: string;
  status: string;
  responseText: string | null;
  respondedAt: string | null;
  resolution: string | null;
  isEscalated: boolean;
  prescription?: { patientName: string; prescribedByName: string };
  surgery?: { procedureName: string; scheduledDate: string };
}

interface Prescription {
  id: string;
  patientName: string;
  surgeryId: string;
  status: string;
  scheduledSurgeryDate: string;
  urgency: string;
  medications: string;
  prescribedByName: string;
  surgery?: { procedureName: string; scheduledDate: string; id: string };
}

// ===== TAB DEFINITIONS =====
type TabKey = 'active' | 'reconciliation' | 'returns' | 'additional' | 'queries';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'active', label: 'Active Surgery Tracking', icon: <Activity className="w-4 h-4" /> },
  { key: 'reconciliation', label: 'Reconciliation', icon: <ArrowLeftRight className="w-4 h-4" /> },
  { key: 'returns', label: 'Pharmacy Returns', icon: <RotateCcw className="w-4 h-4" /> },
  { key: 'additional', label: 'Emergency Requests', icon: <Radio className="w-4 h-4" /> },
  { key: 'queries', label: 'Non-Return Queries', icon: <Shield className="w-4 h-4" /> },
];

export default function MedicationTrackingPage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<TabKey>('active');
  const [loading, setLoading] = useState(false);

  // Active surgery tracking state
  const [activePrescriptions, setActivePrescriptions] = useState<Prescription[]>([]);
  const [selectedPrescription, setSelectedPrescription] = useState<string | null>(null);
  const [usageRecords, setUsageRecords] = useState<UsageRecord[]>([]);
  const [administerModal, setAdministerModal] = useState<{ record: UsageRecord } | null>(null);
  const [adminQty, setAdminQty] = useState(1);
  const [adminNotes, setAdminNotes] = useState('');

  // Reconciliation state
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);

  // Additional requests state
  const [additionalRequests, setAdditionalRequests] = useState<AdditionalRequest[]>([]);
  const [showAdditionalModal, setShowAdditionalModal] = useState(false);
  const [additionalMeds, setAdditionalMeds] = useState([{ drugName: '', dosage: '', route: 'IV', quantity: 1, reason: '' }]);
  const [additionalReason, setAdditionalReason] = useState('');
  const [additionalUrgency, setAdditionalUrgency] = useState<'EMERGENCY' | 'URGENT' | 'ROUTINE'>('EMERGENCY');

  // Non-return queries state
  const [queries, setQueries] = useState<NonReturnQuery[]>([]);
  const [respondModal, setRespondModal] = useState<{ query: NonReturnQuery } | null>(null);
  const [responseText, setResponseText] = useState('');

  // Return modal state
  const [returnModal, setReturnModal] = useState<{ reconciliation: Reconciliation } | null>(null);
  const [returnItems, setReturnItems] = useState<{ drugName: string; quantityReturned: number; condition: string; pharmacistNotes: string }[]>([]);
  const [pharmacistId, setPharmacistId] = useState('');
  const [pharmacistName, setPharmacistName] = useState('');

  const user = session?.user as any;

  // ===== DATA FETCHING =====
  const fetchActivePrescriptions = useCallback(async () => {
    try {
      const res = await fetch('/api/prescriptions?status=COLLECTED,IN_USE');
      if (res.ok) {
        const data = await res.json();
        setActivePrescriptions(Array.isArray(data) ? data : data.prescriptions || []);
      }
    } catch (err) {
      console.error('Error fetching active prescriptions:', err);
    }
  }, []);

  const fetchUsageRecords = useCallback(async (prescriptionId: string) => {
    try {
      const res = await fetch(`/api/medication-tracking/usage?prescriptionId=${prescriptionId}`);
      if (res.ok) {
        const data = await res.json();
        setUsageRecords(data.usageRecords || []);
      }
    } catch (err) {
      console.error('Error fetching usage records:', err);
    }
  }, []);

  const fetchReconciliations = useCallback(async () => {
    try {
      const res = await fetch('/api/medication-tracking/reconcile');
      if (res.ok) {
        const data = await res.json();
        setReconciliations(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching reconciliations:', err);
    }
  }, []);

  const fetchAdditionalRequests = useCallback(async () => {
    try {
      const res = await fetch('/api/medication-tracking/additional-request');
      if (res.ok) {
        const data = await res.json();
        setAdditionalRequests(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching additional requests:', err);
    }
  }, []);

  const fetchQueries = useCallback(async () => {
    try {
      const res = await fetch('/api/medication-tracking/query');
      if (res.ok) {
        const data = await res.json();
        setQueries(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching queries:', err);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'active') {
      fetchActivePrescriptions();
    } else if (activeTab === 'reconciliation' || activeTab === 'returns') {
      fetchReconciliations();
    } else if (activeTab === 'additional') {
      fetchAdditionalRequests();
    } else if (activeTab === 'queries') {
      fetchQueries();
    }
  }, [activeTab, fetchActivePrescriptions, fetchReconciliations, fetchAdditionalRequests, fetchQueries]);

  useEffect(() => {
    if (selectedPrescription) {
      fetchUsageRecords(selectedPrescription);
    }
  }, [selectedPrescription, fetchUsageRecords]);

  // ===== HANDLERS =====
  const handleAdminister = async () => {
    if (!administerModal) return;
    setLoading(true);
    try {
      const res = await fetch('/api/medication-tracking/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usageRecordId: administerModal.record.id,
          quantityUsed: adminQty,
          administeredByName: user?.fullName || user?.name || 'Unknown',
          notes: adminNotes,
        }),
      });

      if (res.ok) {
        setAdministerModal(null);
        setAdminQty(1);
        setAdminNotes('');
        if (selectedPrescription) fetchUsageRecords(selectedPrescription);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to record administration');
      }
    } catch (err) {
      alert('Error recording administration');
    } finally {
      setLoading(false);
    }
  };

  const handleReconcile = async (prescriptionId: string, surgeryId: string) => {
    if (!confirm('Create end-of-surgery reconciliation? This will calculate all drug balances.')) return;
    setLoading(true);
    try {
      const res = await fetch('/api/medication-tracking/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prescriptionId, surgeryId }),
      });

      if (res.ok) {
        alert('Reconciliation created successfully');
        fetchReconciliations();
        fetchActivePrescriptions();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to create reconciliation');
      }
    } catch (err) {
      alert('Error creating reconciliation');
    } finally {
      setLoading(false);
    }
  };

  const handleReturn = async () => {
    if (!returnModal) return;
    setLoading(true);
    try {
      const res = await fetch('/api/medication-tracking/return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reconciliationId: returnModal.reconciliation.id,
          prescriptionId: returnModal.reconciliation.prescriptionId,
          surgeryId: returnModal.reconciliation.surgeryId,
          receivedById: pharmacistId || user?.id,
          receivedByName: pharmacistName || user?.fullName || user?.name || 'Pharmacist',
          itemsReturned: returnItems,
          pharmacistNotes: '',
        }),
      });

      const data = await res.json();
      if (res.ok) {
        alert(data.hasDiscrepancy
          ? '⚠️ Return recorded with discrepancy. A non-return query has been generated.'
          : '✅ All medications returned successfully.');
        setReturnModal(null);
        fetchReconciliations();
      } else {
        alert(data.error || 'Failed to record return');
      }
    } catch (err) {
      alert('Error recording return');
    } finally {
      setLoading(false);
    }
  };

  const handleAdditionalRequest = async () => {
    if (!selectedPrescription) return;
    const prescription = activePrescriptions.find(p => p.id === selectedPrescription);
    if (!prescription) return;
    setLoading(true);
    try {
      const res = await fetch('/api/medication-tracking/additional-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prescriptionId: selectedPrescription,
          surgeryId: prescription.surgeryId,
          medicationsRequested: additionalMeds.filter(m => m.drugName),
          urgency: additionalUrgency,
          reason: additionalReason,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        alert(`🚨 Emergency alert sent to ${data.alertsSent} pharmacist(s)! Walkie-talkie notification triggered.`);
        setShowAdditionalModal(false);
        setAdditionalMeds([{ drugName: '', dosage: '', route: 'IV', quantity: 1, reason: '' }]);
        setAdditionalReason('');
        fetchAdditionalRequests();
      } else {
        alert(data.error || 'Failed to create request');
      }
    } catch (err) {
      alert('Error creating additional request');
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledgeRequest = async (requestId: string, action: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/medication-tracking/additional-request', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action }),
      });

      if (res.ok) {
        fetchAdditionalRequests();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to update request');
      }
    } catch (err) {
      alert('Error updating request');
    } finally {
      setLoading(false);
    }
  };

  const handleRespondToQuery = async () => {
    if (!respondModal) return;
    setLoading(true);
    try {
      const res = await fetch('/api/medication-tracking/query', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'RESPOND',
          queryId: respondModal.query.id,
          responseText,
        }),
      });

      if (res.ok) {
        setRespondModal(null);
        setResponseText('');
        fetchQueries();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to respond');
      }
    } catch (err) {
      alert('Error responding to query');
    } finally {
      setLoading(false);
    }
  };

  const handleResolveQuery = async (queryId: string, resolution: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/medication-tracking/query', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RESOLVE', queryId, resolution }),
      });

      if (res.ok) {
        fetchQueries();
      }
    } catch (err) {
      alert('Error resolving query');
    } finally {
      setLoading(false);
    }
  };

  // ===== RENDER HELPERS =====
  const statusColor = (status: string) => {
    const colors: Record<string, string> = {
      COLLECTED: 'bg-blue-100 text-blue-800',
      IN_USE: 'bg-yellow-100 text-yellow-800',
      RECONCILED: 'bg-purple-100 text-purple-800',
      RETURNED: 'bg-green-100 text-green-800',
      QUERY_ISSUED: 'bg-red-100 text-red-800',
      PENDING: 'bg-gray-100 text-gray-800',
      PENDING_RETURN: 'bg-orange-100 text-orange-800',
      PARTIALLY_RETURNED: 'bg-yellow-100 text-yellow-800',
      FULLY_RETURNED: 'bg-green-100 text-green-800',
      ACKNOWLEDGED: 'bg-blue-100 text-blue-800',
      PACKING: 'bg-indigo-100 text-indigo-800',
      PACKED: 'bg-teal-100 text-teal-800',
      RESPONDED: 'bg-blue-100 text-blue-800',
      RESOLVED: 'bg-green-100 text-green-800',
      ESCALATED: 'bg-red-100 text-red-800',
      CLOSED: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const parseJSON = (str: string | null) => {
    if (!str) return [];
    try { return JSON.parse(str); } catch { return []; }
  };

  // ===== TAB: ACTIVE SURGERY TRACKING =====
  const renderActiveTab = () => (
    <div className="space-y-4">
      {/* Prescription Selector */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Pill className="w-5 h-5 text-blue-600" />
          Select Active Prescription
        </h3>
        {activePrescriptions.length === 0 ? (
          <p className="text-gray-500 text-sm">No active prescriptions in surgery. Prescriptions appear here after collection from pharmacy.</p>
        ) : (
          <div className="space-y-2">
            {activePrescriptions.map((rx) => (
              <button
                key={rx.id}
                onClick={() => setSelectedPrescription(rx.id)}
                className={`w-full text-left p-3 rounded-lg border transition ${
                  selectedPrescription === rx.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-medium">{rx.patientName}</span>
                    <span className="text-sm text-gray-500 ml-2">
                      {rx.surgery?.procedureName || 'Surgery'}
                    </span>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor(rx.status)}`}>
                    {rx.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Usage Records / Drug Administration Chart */}
      {selectedPrescription && (
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
              <Activity className="w-5 h-5 text-green-600" />
              Drug Administration Chart
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAdditionalModal(true)}
                className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-red-700"
              >
                <Radio className="w-4 h-4" /> Request Additional Meds
              </button>
              <button
                onClick={() => {
                  const rx = activePrescriptions.find(p => p.id === selectedPrescription);
                  if (rx) handleReconcile(rx.id, rx.surgeryId);
                }}
                className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-purple-700"
              >
                <ArrowLeftRight className="w-4 h-4" /> End Surgery Reconciliation
              </button>
            </div>
          </div>

          {usageRecords.length === 0 ? (
            <p className="text-gray-500 text-sm">No medication records yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Drug</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Dosage</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Route</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-600">Dispensed</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-600">Used</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-600">Wasted</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-600">Remaining</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-600">Status</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {usageRecords.map((record) => (
                    <tr key={record.id} className={record.isFullyUsed ? 'bg-green-50' : ''}>
                      <td className="px-3 py-2 font-medium">{record.drugName}</td>
                      <td className="px-3 py-2">{record.dosage}</td>
                      <td className="px-3 py-2">{record.route}</td>
                      <td className="px-3 py-2 text-center font-semibold">{record.quantityDispensed}</td>
                      <td className="px-3 py-2 text-center font-semibold text-blue-600">{record.quantityAdministered}</td>
                      <td className="px-3 py-2 text-center font-semibold text-red-600">{record.quantityWasted}</td>
                      <td className="px-3 py-2 text-center font-semibold text-orange-600">{record.quantityRemaining}</td>
                      <td className="px-3 py-2 text-center">
                        {record.isFullyUsed ? (
                          <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs">Fully Used</span>
                        ) : record.isReturned ? (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs">Returned</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full text-xs">In Use</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {!record.isFullyUsed && !record.isReturned && (
                          <button
                            onClick={() => {
                              setAdministerModal({ record });
                              setAdminQty(1);
                              setAdminNotes('');
                            }}
                            className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                          >
                            Administer
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold">
                  <tr>
                    <td className="px-3 py-2" colSpan={3}>TOTALS</td>
                    <td className="px-3 py-2 text-center">{usageRecords.reduce((s, r) => s + r.quantityDispensed, 0)}</td>
                    <td className="px-3 py-2 text-center text-blue-600">{usageRecords.reduce((s, r) => s + r.quantityAdministered, 0)}</td>
                    <td className="px-3 py-2 text-center text-red-600">{usageRecords.reduce((s, r) => s + r.quantityWasted, 0)}</td>
                    <td className="px-3 py-2 text-center text-orange-600">{usageRecords.reduce((s, r) => s + r.quantityRemaining, 0)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Administration Log */}
          {usageRecords.some(r => r.administrationLog) && (
            <div className="mt-4 border-t pt-4">
              <h4 className="font-medium text-gray-600 mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Administration Timeline
              </h4>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {usageRecords
                  .flatMap((r) =>
                    parseJSON(r.administrationLog).map((log: any) => ({
                      ...log,
                      drugName: r.drugName,
                    }))
                  )
                  .sort((a: any, b: any) => new Date(b.time).getTime() - new Date(a.time).getTime())
                  .map((log: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 text-xs text-gray-600 py-1 px-2 bg-gray-50 rounded">
                      <Clock className="w-3 h-3 text-gray-400" />
                      <span className="font-medium">{new Date(log.time).toLocaleTimeString()}</span>
                      <span className="text-blue-600 font-medium">{log.drugName}</span>
                      <span>× {log.amount}</span>
                      <span className="text-gray-500">by {log.administeredBy}</span>
                      {log.notes && <span className="italic text-gray-400">({log.notes})</span>}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ===== TAB: RECONCILIATION =====
  const renderReconciliationTab = () => (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <ArrowLeftRight className="w-5 h-5 text-purple-600" />
          End-of-Surgery Reconciliation Reports
        </h3>
        {reconciliations.length === 0 ? (
          <p className="text-gray-500 text-sm">No reconciliation reports yet. Create one from the Active Surgery Tracking tab after surgery completion.</p>
        ) : (
          <div className="space-y-3">
            {reconciliations.map((rec) => {
              const items = parseJSON(rec.reconciliationItems);
              return (
                <div key={rec.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-semibold">{rec.prescription?.patientName || 'Patient'}</h4>
                      <p className="text-sm text-gray-500">
                        {rec.surgery?.procedureName || 'Procedure'} — Reconciled by {rec.reconciledByName}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(rec.reconciledAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor(rec.status)}`}>
                        {rec.status.replace(/_/g, ' ')}
                      </span>
                      {(rec.status === 'PENDING_RETURN' || rec.status === 'PARTIALLY_RETURNED') && (
                        <button
                          onClick={() => {
                            setReturnItems(
                              items
                                .filter((i: any) => i.status === 'PENDING_RETURN' || (i.remaining > 0 && i.status !== 'FULLY_USED'))
                                .map((i: any) => ({
                                  drugName: i.drugName,
                                  quantityReturned: i.remaining,
                                  condition: 'GOOD',
                                  pharmacistNotes: '',
                                }))
                            );
                            setReturnModal({ reconciliation: rec });
                          }}
                          className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700 flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" /> Record Return
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Summary Stats */}
                  <div className="grid grid-cols-5 gap-2 mb-3">
                    <div className="bg-blue-50 rounded p-2 text-center">
                      <p className="text-xs text-blue-600">Dispensed</p>
                      <p className="font-bold text-blue-800">{rec.totalDrugsDispensed}</p>
                    </div>
                    <div className="bg-green-50 rounded p-2 text-center">
                      <p className="text-xs text-green-600">Used</p>
                      <p className="font-bold text-green-800">{rec.totalDrugsUsed}</p>
                    </div>
                    <div className="bg-red-50 rounded p-2 text-center">
                      <p className="text-xs text-red-600">Wasted</p>
                      <p className="font-bold text-red-800">{rec.totalDrugsWasted}</p>
                    </div>
                    <div className="bg-orange-50 rounded p-2 text-center">
                      <p className="text-xs text-orange-600">To Return</p>
                      <p className="font-bold text-orange-800">{rec.totalDrugsToReturn}</p>
                    </div>
                    <div className="bg-purple-50 rounded p-2 text-center">
                      <p className="text-xs text-purple-600">Returned</p>
                      <p className="font-bold text-purple-800">{rec.totalDrugsReturned}</p>
                    </div>
                  </div>

                  {/* Detailed Items */}
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-1 text-left">Drug</th>
                        <th className="px-2 py-1 text-center">Dispensed</th>
                        <th className="px-2 py-1 text-center">Used</th>
                        <th className="px-2 py-1 text-center">Wasted</th>
                        <th className="px-2 py-1 text-center">Remaining</th>
                        <th className="px-2 py-1 text-center">Returned</th>
                        <th className="px-2 py-1 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {items.map((item: any, idx: number) => (
                        <tr key={idx}>
                          <td className="px-2 py-1 font-medium">{item.drugName}</td>
                          <td className="px-2 py-1 text-center">{item.dispensed}</td>
                          <td className="px-2 py-1 text-center text-blue-600">{item.used}</td>
                          <td className="px-2 py-1 text-center text-red-600">{item.wasted}</td>
                          <td className="px-2 py-1 text-center text-orange-600">{item.remaining}</td>
                          <td className="px-2 py-1 text-center text-green-600">{item.returned}</td>
                          <td className="px-2 py-1 text-center">
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${statusColor(item.status)}`}>
                              {(item.status || '').replace(/_/g, ' ')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Return Deadline Warning */}
                  {rec.returnDeadline && (rec.status === 'PENDING_RETURN' || rec.status === 'PARTIALLY_RETURNED') && (
                    <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded flex items-center gap-2 text-xs text-yellow-800">
                      <AlertTriangle className="w-4 h-4" />
                      Return deadline: {new Date(rec.returnDeadline).toLocaleString()}
                      {new Date(rec.returnDeadline) < new Date() && (
                        <span className="text-red-600 font-bold ml-2">OVERDUE!</span>
                      )}
                    </div>
                  )}

                  {/* Query Info */}
                  {rec.queryReason && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
                      <strong>Query Issued:</strong> {rec.queryReason}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  // ===== TAB: ADDITIONAL REQUESTS =====
  const renderAdditionalTab = () => (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <Radio className="w-5 h-5 text-red-600" />
          Emergency Medication Requests
          {additionalRequests.filter(r => r.status === 'PENDING').length > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-red-600 text-white rounded-full text-xs animate-pulse">
              {additionalRequests.filter(r => r.status === 'PENDING').length} PENDING
            </span>
          )}
        </h3>
        {additionalRequests.length === 0 ? (
          <p className="text-gray-500 text-sm">No additional medication requests.</p>
        ) : (
          <div className="space-y-3">
            {additionalRequests.map((req) => {
              const meds = parseJSON(req.medicationsRequested);
              return (
                <div key={req.id} className={`border rounded-lg p-4 ${req.status === 'PENDING' ? 'border-red-300 bg-red-50' : ''}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-semibold flex items-center gap-2">
                        {req.urgency === 'EMERGENCY' && <AlertCircle className="w-4 h-4 text-red-600" />}
                        {req.prescription?.patientName || 'Patient'} — {req.surgery?.procedureName || 'Surgery'}
                      </h4>
                      <p className="text-sm text-gray-500">Requested by {req.requestedByName} at {new Date(req.requestedAt).toLocaleString()}</p>
                      <p className="text-sm text-gray-700 mt-1"><strong>Reason:</strong> {req.reason}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        req.urgency === 'EMERGENCY' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {req.urgency}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor(req.status)}`}>
                        {req.status}
                      </span>
                    </div>
                  </div>

                  {/* Medications requested */}
                  <div className="bg-white rounded p-2 mb-2">
                    <p className="text-xs font-medium text-gray-600 mb-1">Medications Requested:</p>
                    {meds.map((m: any, idx: number) => (
                      <div key={idx} className="text-sm">
                        <Pill className="w-3 h-3 inline mr-1 text-blue-500" />
                        {m.drugName} — {m.dosage} ({m.route}) × {m.quantity}
                        {m.reason && <span className="text-gray-500 ml-1">({m.reason})</span>}
                      </div>
                    ))}
                  </div>

                  {/* Walkie-talkie notification */}
                  {req.walkieTalkieNotified && (
                    <div className="text-xs text-green-700 bg-green-50 rounded px-2 py-1 mb-2 flex items-center gap-1">
                      <Radio className="w-3 h-3" /> Walkie-talkie notification sent
                    </div>
                  )}

                  {/* Pharmacist Actions */}
                  {req.status === 'PENDING' && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleAcknowledgeRequest(req.id, 'ACKNOWLEDGE')}
                        disabled={loading}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                      >
                        Acknowledge
                      </button>
                      <button
                        onClick={() => handleAcknowledgeRequest(req.id, 'CANCEL')}
                        disabled={loading}
                        className="px-3 py-1.5 bg-gray-600 text-white rounded text-xs hover:bg-gray-700 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  {req.status === 'ACKNOWLEDGED' && (
                    <button
                      onClick={() => handleAcknowledgeRequest(req.id, 'PACKED')}
                      disabled={loading}
                      className="px-3 py-1.5 bg-teal-600 text-white rounded text-xs hover:bg-teal-700 disabled:opacity-50 mt-2"
                    >
                      Mark as Packed
                    </button>
                  )}
                  {req.status === 'PACKED' && (
                    <button
                      onClick={() => handleAcknowledgeRequest(req.id, 'COLLECTED')}
                      disabled={loading}
                      className="px-3 py-1.5 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50 mt-2"
                    >
                      Mark as Collected
                    </button>
                  )}

                  {/* Timeline */}
                  <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                    {req.acknowledgedAt && <p>✓ Acknowledged by {req.acknowledgedByName} at {new Date(req.acknowledgedAt).toLocaleString()}</p>}
                    {req.packedAt && <p>✓ Packed by {req.packedByName} at {new Date(req.packedAt).toLocaleString()}</p>}
                    {req.collectedAt && <p>✓ Collected at {new Date(req.collectedAt).toLocaleString()}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  // ===== TAB: NON-RETURN QUERIES =====
  const renderQueriesTab = () => (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-red-600" />
          Medication Non-Return Queries
          {queries.filter(q => q.status === 'PENDING').length > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-red-600 text-white rounded-full text-xs">
              {queries.filter(q => q.status === 'PENDING').length} pending
            </span>
          )}
        </h3>
        {queries.length === 0 ? (
          <p className="text-gray-500 text-sm">No non-return queries.</p>
        ) : (
          <div className="space-y-3">
            {queries.map((q) => {
              const items = parseJSON(q.unreturvedItems);
              const isOverdue = new Date(q.responseDeadline) < new Date();
              return (
                <div key={q.id} className={`border rounded-lg p-4 ${q.status === 'PENDING' && isOverdue ? 'border-red-400 bg-red-50' : ''}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-semibold">Query for: {q.queriedUserName}</h4>
                      <p className="text-sm text-gray-500">
                        {q.prescription?.patientName} — {q.surgery?.procedureName}
                      </p>
                      <p className="text-xs text-gray-400">
                        Issued by {q.issuedByName} on {new Date(q.issuedAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor(q.status)}`}>
                        {q.status}
                      </span>
                      {q.isEscalated && (
                        <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">
                          ESCALATED
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Unreturned items */}
                  <div className="bg-yellow-50 rounded p-2 mb-2">
                    <p className="text-xs font-medium text-yellow-800 mb-1">Unreturned Medications:</p>
                    {items.map((item: any, idx: number) => (
                      <div key={idx} className="text-sm text-yellow-900">
                        <AlertTriangle className="w-3 h-3 inline mr-1" />
                        {item.drugName}: Expected {item.quantityExpected}, Returned {item.quantityReturned}, 
                        <strong className="text-red-600 ml-1">Deficit: {item.deficit}</strong>
                      </div>
                    ))}
                  </div>

                  {/* Deadline */}
                  <div className={`text-xs mb-2 ${isOverdue ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                    Response deadline: {new Date(q.responseDeadline).toLocaleString()}
                    {isOverdue && ' — OVERDUE!'}
                  </div>

                  {/* Response */}
                  {q.responseText && (
                    <div className="bg-blue-50 rounded p-2 mb-2 text-sm">
                      <p className="font-medium text-blue-800">Response:</p>
                      <p className="text-blue-700">{q.responseText}</p>
                      <p className="text-xs text-blue-500 mt-1">
                        Responded at: {q.respondedAt ? new Date(q.respondedAt).toLocaleString() : 'N/A'}
                      </p>
                    </div>
                  )}

                  {/* Resolution */}
                  {q.resolution && (
                    <div className="bg-green-50 rounded p-2 mb-2 text-sm">
                      <p className="font-medium text-green-800">Resolution: {q.resolution}</p>
                    </div>
                  )}

                  {/* Actions */}
                  {q.status === 'PENDING' && user?.id === q.queriedUserName && (
                    <button
                      onClick={() => { setRespondModal({ query: q }); setResponseText(''); }}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 mt-2"
                    >
                      Respond to Query
                    </button>
                  )}

                  {(q.status === 'RESPONDED' || q.status === 'PENDING') && (
                    <div className="flex gap-2 mt-2">
                      {q.status === 'PENDING' && (
                        <button
                          onClick={() => { setRespondModal({ query: q }); setResponseText(''); }}
                          className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                        >
                          Respond
                        </button>
                      )}
                      {q.status === 'RESPONDED' && (
                        <>
                          <button
                            onClick={() => handleResolveQuery(q.id, 'JUSTIFIED_USAGE')}
                            disabled={loading}
                            className="px-3 py-1.5 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
                          >
                            Accept Justification
                          </button>
                          <button
                            onClick={() => handleResolveQuery(q.id, 'ESCALATED')}
                            disabled={loading}
                            className="px-3 py-1.5 bg-red-600 text-white rounded text-xs hover:bg-red-700 disabled:opacity-50"
                          >
                            Escalate
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  // ===== MAIN RENDER =====
  return (
    <div className="p-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <Pill className="w-7 h-7 text-blue-600" />
          Medication Tracking & Reconciliation
        </h1>
        <p className="text-gray-500 mt-1">
          Track medication usage during surgery, reconcile at end of procedure, manage returns and queries
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto border-b">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'active' && renderActiveTab()}
      {(activeTab === 'reconciliation' || activeTab === 'returns') && renderReconciliationTab()}
      {activeTab === 'additional' && renderAdditionalTab()}
      {activeTab === 'queries' && renderQueriesTab()}

      {/* ===== MODALS ===== */}

      {/* Administer Modal */}
      {administerModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Pill className="w-5 h-5 text-blue-600" />
              Administer Medication
            </h3>
            <div className="bg-blue-50 rounded p-3 mb-4">
              <p className="font-semibold">{administerModal.record.drugName}</p>
              <p className="text-sm text-gray-600">{administerModal.record.dosage} — {administerModal.record.route}</p>
              <p className="text-sm mt-1">
                Remaining: <span className="font-bold text-orange-600">{administerModal.record.quantityRemaining}</span>
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Quantity to Administer</label>
                <div className="flex items-center gap-2 mt-1">
                  <button
                    onClick={() => setAdminQty(Math.max(1, adminQty - 1))}
                    className="p-1 border rounded hover:bg-gray-100"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    value={adminQty}
                    onChange={(e) => setAdminQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 text-center border rounded p-2"
                    min={1}
                    max={administerModal.record.quantityRemaining}
                  />
                  <button
                    onClick={() => setAdminQty(Math.min(administerModal.record.quantityRemaining, adminQty + 1))}
                    className="p-1 border rounded hover:bg-gray-100"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Notes (optional)</label>
                <input
                  type="text"
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  className="w-full border rounded p-2 mt-1"
                  placeholder="e.g., Given during induction"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={handleAdminister}
                disabled={loading}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2 font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Recording...' : 'Confirm Administration'}
              </button>
              <button
                onClick={() => setAdministerModal(null)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Additional Medication Request Modal */}
      {showAdditionalModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-red-600">
              <Radio className="w-5 h-5" />
              🚨 Emergency Additional Medication Request
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              This will send an emergency alert to all pharmacists and trigger a walkie-talkie notification.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Urgency</label>
                <select
                  value={additionalUrgency}
                  onChange={(e) => setAdditionalUrgency(e.target.value as any)}
                  className="w-full border rounded p-2 mt-1"
                >
                  <option value="EMERGENCY">🚨 EMERGENCY</option>
                  <option value="URGENT">⚠️ URGENT</option>
                  <option value="ROUTINE">ROUTINE</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Clinical Reason</label>
                <textarea
                  value={additionalReason}
                  onChange={(e) => setAdditionalReason(e.target.value)}
                  className="w-full border rounded p-2 mt-1"
                  rows={2}
                  placeholder="Why are additional medications needed?"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Medications Needed</label>
                {additionalMeds.map((med, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-1 mt-1">
                    <input
                      className="col-span-3 border rounded p-1.5 text-sm"
                      placeholder="Drug Name"
                      value={med.drugName}
                      onChange={(e) => {
                        const next = [...additionalMeds];
                        next[idx].drugName = e.target.value;
                        setAdditionalMeds(next);
                      }}
                    />
                    <input
                      className="col-span-2 border rounded p-1.5 text-sm"
                      placeholder="Dosage"
                      value={med.dosage}
                      onChange={(e) => {
                        const next = [...additionalMeds];
                        next[idx].dosage = e.target.value;
                        setAdditionalMeds(next);
                      }}
                    />
                    <select
                      className="col-span-2 border rounded p-1.5 text-sm"
                      value={med.route}
                      onChange={(e) => {
                        const next = [...additionalMeds];
                        next[idx].route = e.target.value;
                        setAdditionalMeds(next);
                      }}
                    >
                      <option value="IV">IV</option>
                      <option value="IM">IM</option>
                      <option value="PO">PO</option>
                      <option value="SC">SC</option>
                      <option value="PR">PR</option>
                      <option value="ETT">ETT</option>
                      <option value="TOPICAL">Topical</option>
                    </select>
                    <input
                      className="col-span-2 border rounded p-1.5 text-sm"
                      type="number"
                      placeholder="Qty"
                      value={med.quantity}
                      onChange={(e) => {
                        const next = [...additionalMeds];
                        next[idx].quantity = parseInt(e.target.value) || 1;
                        setAdditionalMeds(next);
                      }}
                      min={1}
                    />
                    <input
                      className="col-span-2 border rounded p-1.5 text-sm"
                      placeholder="Reason"
                      value={med.reason}
                      onChange={(e) => {
                        const next = [...additionalMeds];
                        next[idx].reason = e.target.value;
                        setAdditionalMeds(next);
                      }}
                    />
                    <button
                      onClick={() => setAdditionalMeds(additionalMeds.filter((_, i) => i !== idx))}
                      className="col-span-1 text-red-500 hover:text-red-700 text-center"
                      disabled={additionalMeds.length <= 1}
                    >
                      <XCircle className="w-4 h-4 mx-auto" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setAdditionalMeds([...additionalMeds, { drugName: '', dosage: '', route: 'IV', quantity: 1, reason: '' }])}
                  className="text-sm text-blue-600 hover:text-blue-800 mt-1 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add medication
                </button>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={handleAdditionalRequest}
                disabled={loading || !additionalReason || !additionalMeds.some(m => m.drugName)}
                className="flex-1 bg-red-600 text-white rounded-lg py-2 font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                {loading ? 'Sending Alert...' : '🚨 Send Emergency Request'}
              </button>
              <button
                onClick={() => setShowAdditionalModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return Modal */}
      {returnModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-green-600" />
              Record Medication Return to Pharmacy
            </h3>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Receiving Pharmacist ID</label>
                  <input
                    type="text"
                    value={pharmacistId}
                    onChange={(e) => setPharmacistId(e.target.value)}
                    className="w-full border rounded p-2 mt-1"
                    placeholder="Pharmacist user ID"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Pharmacist Name</label>
                  <input
                    type="text"
                    value={pharmacistName}
                    onChange={(e) => setPharmacistName(e.target.value)}
                    className="w-full border rounded p-2 mt-1"
                    placeholder="Pharmacist name"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Medications Being Returned</label>
                {returnItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-1 mt-1 items-center">
                    <span className="col-span-4 text-sm font-medium">{item.drugName}</span>
                    <input
                      className="col-span-2 border rounded p-1.5 text-sm"
                      type="number"
                      value={item.quantityReturned}
                      onChange={(e) => {
                        const next = [...returnItems];
                        next[idx].quantityReturned = parseInt(e.target.value) || 0;
                        setReturnItems(next);
                      }}
                      min={0}
                    />
                    <select
                      className="col-span-3 border rounded p-1.5 text-sm"
                      value={item.condition}
                      onChange={(e) => {
                        const next = [...returnItems];
                        next[idx].condition = e.target.value;
                        setReturnItems(next);
                      }}
                    >
                      <option value="GOOD">Good</option>
                      <option value="DAMAGED">Damaged</option>
                      <option value="EXPIRED">Expired</option>
                      <option value="CONTAMINATED">Contaminated</option>
                    </select>
                    <input
                      className="col-span-3 border rounded p-1.5 text-sm"
                      placeholder="Notes"
                      value={item.pharmacistNotes}
                      onChange={(e) => {
                        const next = [...returnItems];
                        next[idx].pharmacistNotes = e.target.value;
                        setReturnItems(next);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={handleReturn}
                disabled={loading}
                className="flex-1 bg-green-600 text-white rounded-lg py-2 font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? 'Recording...' : 'Confirm Return & Verify'}
              </button>
              <button
                onClick={() => setReturnModal(null)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Respond to Query Modal */}
      {respondModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-orange-600" />
              Respond to Non-Return Query
            </h3>
            <div className="bg-yellow-50 rounded p-3 mb-4">
              <p className="text-sm font-medium">Unreturned Medications:</p>
              {parseJSON(respondModal.query.unreturvedItems).map((item: any, idx: number) => (
                <p key={idx} className="text-sm">
                  {item.drugName}: <strong className="text-red-600">Deficit of {item.deficit}</strong>
                </p>
              ))}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Your Explanation</label>
              <textarea
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                className="w-full border rounded p-2 mt-1"
                rows={4}
                placeholder="Provide explanation for the unreturned medications..."
                required
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleRespondToQuery}
                disabled={loading || !responseText}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2 font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Submitting...' : 'Submit Response'}
              </button>
              <button
                onClick={() => setRespondModal(null)}
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
