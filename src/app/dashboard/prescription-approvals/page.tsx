'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  User,
  Calendar,
  Pill,
  FileText,
  RefreshCw,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Syringe,
  AlertOctagon,
  Shield,
} from 'lucide-react';

interface Medication {
  id?: string;
  name: string;
  dose: string;
  unit?: string;
  route: string;
  timing?: string;
  frequency?: string;
  category?: string;
  notes?: string;
}

interface Prescription {
  id: string;
  patientName: string;
  patientId: string;
  surgeryId: string;
  preOpReviewId: string;
  scheduledSurgeryDate: string;
  medications: string;
  fluids?: string;
  emergencyDrugs?: string;
  allergyAlerts?: string;
  specialInstructions?: string;
  urgency: 'ROUTINE' | 'URGENT' | 'EMERGENCY';
  status: string;
  isLateArrival?: boolean;
  prescriptionNotes?: string;
  rejectionReason?: string;
  createdAt: string;
  prescribedBy: { id: string; fullName: string; role: string };
  approvedBy?: { id: string; fullName: string; role: string } | null;
  approvedAt?: string;
  surgery: {
    procedureName: string;
    patient?: { fullName: string; folderNumber?: string };
  };
  preOpReview?: {
    asaClass?: string;
    proposedAnesthesiaType?: string;
    allergies?: string;
    comorbidities?: string;
    riskLevel?: string;
  };
}

export default function PrescriptionApprovalsPage() {
  const { data: session } = useSession();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchPrescriptions = useCallback(async () => {
    try {
      let url = '/api/prescriptions';
      if (filter === 'pending') {
        url += '?status=PENDING_APPROVAL';
      } else if (filter === 'approved') {
        url += '?status=APPROVED';
      } else if (filter === 'rejected') {
        url += '?status=REJECTED';
      }

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setPrescriptions(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error fetching prescriptions:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchPrescriptions();
    const interval = setInterval(fetchPrescriptions, 30000);
    return () => clearInterval(interval);
  }, [fetchPrescriptions]);

  const handleApprove = async (prescriptionId: string) => {
    setApproving(prescriptionId);
    try {
      const res = await fetch(`/api/prescriptions/${prescriptionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved: true,
          approvalNotes: approvalNotes || undefined,
        }),
      });

      if (res.ok) {
        setApprovalNotes('');
        await fetchPrescriptions();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to approve prescription');
      }
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setApproving(null);
    }
  };

  const handleReject = async (prescriptionId: string) => {
    if (!rejectionReason.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }

    setApproving(prescriptionId);
    try {
      const res = await fetch(`/api/prescriptions/${prescriptionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved: false,
          rejectionReason: rejectionReason.trim(),
        }),
      });

      if (res.ok) {
        setRejectionReason('');
        setShowRejectModal(null);
        await fetchPrescriptions();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to reject prescription');
      }
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setApproving(null);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPrescriptions();
  };

  const parseMedications = (medsJson: string): Medication[] => {
    try {
      return JSON.parse(medsJson);
    } catch {
      return [];
    }
  };

  const filteredPrescriptions = prescriptions.filter((p) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      p.patientName.toLowerCase().includes(term) ||
      p.prescribedBy.fullName.toLowerCase().includes(term) ||
      p.surgery?.procedureName?.toLowerCase().includes(term)
    );
  });

  const pendingCount = prescriptions.filter((p) => p.status === 'PENDING_APPROVAL').length;

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case 'EMERGENCY':
        return <span className="px-2 py-0.5 text-xs font-bold bg-red-100 text-red-700 rounded-full">EMERGENCY</span>;
      case 'URGENT':
        return <span className="px-2 py-0.5 text-xs font-bold bg-orange-100 text-orange-700 rounded-full">URGENT</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-bold bg-blue-100 text-blue-700 rounded-full">ROUTINE</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING_APPROVAL':
        return <span className="px-2 py-0.5 text-xs font-semibold bg-yellow-100 text-yellow-800 rounded-full flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</span>;
      case 'APPROVED':
        return <span className="px-2 py-0.5 text-xs font-semibold bg-green-100 text-green-800 rounded-full flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Approved</span>;
      case 'REJECTED':
        return <span className="px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-800 rounded-full flex items-center gap-1"><XCircle className="w-3 h-3" /> Rejected</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-semibold bg-gray-100 text-gray-700 rounded-full">{status}</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-gray-600">Loading prescriptions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-7 h-7 text-blue-600" />
            Prescription Approvals
          </h1>
          <p className="text-gray-500 mt-1">
            Review and approve anaesthetic prescriptions before pharmacy packing
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-700">{pendingCount}</p>
              <p className="text-xs text-yellow-600">Pending Approval</p>
            </div>
          </div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-700">
                {filter === 'approved' ? prescriptions.length : '—'}
              </p>
              <p className="text-xs text-green-600">Approved</p>
            </div>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-700">
                {filter === 'rejected' ? prescriptions.length : '—'}
              </p>
              <p className="text-xs text-red-600">Rejected</p>
            </div>
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-700">
                {filter === 'all' ? prescriptions.length : '—'}
              </p>
              <p className="text-xs text-blue-600">Total</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => { setFilter(tab); setLoading(true); }}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                filter === tab
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              {tab === 'pending' ? `Pending (${pendingCount})` : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search patient, prescriber, procedure..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Prescriptions List */}
      {filteredPrescriptions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-700">No prescriptions found</h3>
          <p className="text-gray-500 mt-1">
            {filter === 'pending'
              ? 'No prescriptions are awaiting approval right now.'
              : `No ${filter === 'all' ? '' : filter} prescriptions found.`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPrescriptions.map((rx) => {
            const meds = parseMedications(rx.medications);
            const isExpanded = expandedId === rx.id;
            const fluids = rx.fluids ? parseMedications(rx.fluids) : [];
            const emergencyDrugs = rx.emergencyDrugs ? parseMedications(rx.emergencyDrugs) : [];
            const surgeryDate = new Date(rx.scheduledSurgeryDate);
            const isToday = new Date().toDateString() === surgeryDate.toDateString();
            const isTomorrow = (() => {
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              return tomorrow.toDateString() === surgeryDate.toDateString();
            })();

            return (
              <div
                key={rx.id}
                className={`bg-white rounded-xl border ${
                  rx.urgency === 'EMERGENCY'
                    ? 'border-red-300 shadow-red-100'
                    : rx.urgency === 'URGENT'
                    ? 'border-orange-300 shadow-orange-100'
                    : 'border-gray-200'
                } shadow-sm overflow-hidden`}
              >
                {/* Card Header */}
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : rx.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 text-lg">{rx.patientName}</h3>
                        {getUrgencyBadge(rx.urgency)}
                        {getStatusBadge(rx.status)}
                        {rx.isLateArrival && (
                          <span className="px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-700 rounded-full flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> LATE
                          </span>
                        )}
                        {isToday && (
                          <span className="px-2 py-0.5 text-xs font-bold bg-purple-100 text-purple-700 rounded-full">TODAY</span>
                        )}
                        {isTomorrow && (
                          <span className="px-2 py-0.5 text-xs font-bold bg-indigo-100 text-indigo-700 rounded-full">TOMORROW</span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-4 text-sm text-gray-500 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Syringe className="w-3.5 h-3.5" />
                          {rx.surgery?.procedureName || 'Unknown procedure'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {surgeryDate.toLocaleDateString('en-GB', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />
                          Prescribed by: {rx.prescribedBy.fullName}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Pill className="w-3.5 h-3.5" />
                          {meds.length} medication{meds.length !== 1 ? 's' : ''}
                          {fluids.length > 0 && ` + ${fluids.length} fluid(s)`}
                          {emergencyDrugs.length > 0 && ` + ${emergencyDrugs.length} emergency drug(s)`}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {rx.status === 'PENDING_APPROVAL' && (
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleApprove(rx.id);
                            }}
                            disabled={approving === rx.id}
                            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                          >
                            <CheckCircle className="w-4 h-4" />
                            {approving === rx.id ? 'Processing...' : 'Approve'}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowRejectModal(rx.id);
                            }}
                            disabled={approving === rx.id}
                            className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
                          >
                            <XCircle className="w-4 h-4" />
                            Reject
                          </button>
                        </div>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-gray-200 p-4 bg-gray-50 space-y-4">
                    {/* Allergy Alert */}
                    {rx.allergyAlerts && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                        <AlertOctagon className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-red-700">Allergy Alerts</p>
                          <p className="text-sm text-red-600">{rx.allergyAlerts}</p>
                        </div>
                      </div>
                    )}

                    {/* Pre-Op Review Summary */}
                    {rx.preOpReview && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-sm font-semibold text-blue-700 mb-2">Pre-Op Review Summary</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                          {rx.preOpReview.asaClass && (
                            <div>
                              <p className="text-gray-500">ASA Class</p>
                              <p className="font-medium text-gray-800">{rx.preOpReview.asaClass}</p>
                            </div>
                          )}
                          {rx.preOpReview.proposedAnesthesiaType && (
                            <div>
                              <p className="text-gray-500">Anaesthesia Type</p>
                              <p className="font-medium text-gray-800">{rx.preOpReview.proposedAnesthesiaType}</p>
                            </div>
                          )}
                          {rx.preOpReview.riskLevel && (
                            <div>
                              <p className="text-gray-500">Risk Level</p>
                              <p className="font-medium text-gray-800">{rx.preOpReview.riskLevel}</p>
                            </div>
                          )}
                          {rx.preOpReview.comorbidities && (
                            <div>
                              <p className="text-gray-500">Comorbidities</p>
                              <p className="font-medium text-gray-800">{rx.preOpReview.comorbidities}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Medications Table */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                        <Pill className="w-4 h-4" /> Medications ({meds.length})
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">#</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Drug</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Dose</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Route</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Timing</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Category</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {meds.map((med, idx) => (
                              <tr key={idx} className="border-t border-gray-100 hover:bg-gray-50">
                                <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                                <td className="px-3 py-2 font-medium text-gray-900">{med.name}</td>
                                <td className="px-3 py-2 text-gray-700">
                                  {med.dose}{med.unit ? ` ${med.unit}` : ''}
                                </td>
                                <td className="px-3 py-2 text-gray-700">{med.route}</td>
                                <td className="px-3 py-2 text-gray-700">{med.timing || med.frequency || '—'}</td>
                                <td className="px-3 py-2 text-gray-500">{med.category || '—'}</td>
                                <td className="px-3 py-2 text-gray-500">{med.notes || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Fluids */}
                    {fluids.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">IV Fluids ({fluids.length})</h4>
                        <div className="space-y-1">
                          {fluids.map((f, idx) => (
                            <div key={idx} className="text-sm bg-white border rounded-lg px-3 py-2">
                              <span className="font-medium">{f.name}</span> — {f.dose} via {f.route}
                              {f.timing && <span className="text-gray-500"> ({f.timing})</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Emergency Drugs */}
                    {emergencyDrugs.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-red-700 mb-2">Emergency Drugs ({emergencyDrugs.length})</h4>
                        <div className="space-y-1">
                          {emergencyDrugs.map((d, idx) => (
                            <div key={idx} className="text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                              <span className="font-medium">{d.name}</span> — {d.dose} via {d.route}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Special Instructions */}
                    {rx.specialInstructions && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-sm font-semibold text-amber-700">Special Instructions</p>
                        <p className="text-sm text-amber-800 mt-1">{rx.specialInstructions}</p>
                      </div>
                    )}

                    {/* Prescription Notes */}
                    {rx.prescriptionNotes && (
                      <div className="bg-gray-100 rounded-lg p-3">
                        <p className="text-sm font-semibold text-gray-700">Prescription Notes</p>
                        <p className="text-sm text-gray-600 mt-1">{rx.prescriptionNotes}</p>
                      </div>
                    )}

                    {/* Rejection Reason */}
                    {rx.status === 'REJECTED' && rx.rejectionReason && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-sm font-semibold text-red-700">Rejection Reason</p>
                        <p className="text-sm text-red-600 mt-1">{rx.rejectionReason}</p>
                      </div>
                    )}

                    {/* Approval Info */}
                    {rx.status === 'APPROVED' && rx.approvedBy && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                        <p className="font-semibold text-green-700">Approved by {rx.approvedBy.fullName}</p>
                        {rx.approvedAt && (
                          <p className="text-green-600">
                            on {new Date(rx.approvedAt).toLocaleString('en-GB')}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Approval Notes Input (for pending prescriptions) */}
                    {rx.status === 'PENDING_APPROVAL' && (
                      <div className="border-t border-gray-200 pt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Approval Notes (optional)
                        </label>
                        <textarea
                          placeholder="Add any notes for the pharmacist..."
                          value={approvalNotes}
                          onChange={(e) => setApprovalNotes(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          rows={2}
                        />
                        <div className="mt-3 flex gap-3">
                          <button
                            onClick={() => handleApprove(rx.id)}
                            disabled={approving === rx.id}
                            className="flex-1 px-4 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            <CheckCircle className="w-4 h-4" />
                            {approving === rx.id ? 'Approving...' : 'Approve Prescription'}
                          </button>
                          <button
                            onClick={() => setShowRejectModal(rx.id)}
                            disabled={approving === rx.id}
                            className="flex-1 px-4 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            <XCircle className="w-4 h-4" />
                            Reject Prescription
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Rejection Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-600" />
              Reject Prescription
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Please provide a reason for rejecting this prescription. The prescribing anaesthetist will be notified.
            </p>
            <textarea
              placeholder="Reason for rejection (required)..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full mt-4 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500"
              rows={4}
              autoFocus
            />
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => {
                  setShowRejectModal(null);
                  setRejectionReason('');
                }}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReject(showRejectModal)}
                disabled={!rejectionReason.trim() || approving === showRejectModal}
                className="flex-1 px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {approving === showRejectModal ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
