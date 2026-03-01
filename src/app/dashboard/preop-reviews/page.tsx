'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { 
  ClipboardList, 
  UserCheck, 
  Clock, 
  CheckCircle, 
  XCircle,
  AlertCircle,
  Plus,
  Eye,
  Edit,
  Filter,
  ThumbsUp,
  Syringe,
  Trash2
} from 'lucide-react';

interface PreOpReview {
  id: string;
  surgeryId: string;
  patientName: string;
  folderNumber: string;
  scheduledSurgeryDate: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'APPROVED';
  asaClass?: string;
  riskLevel?: string;
  proposedAnesthesiaType?: string;
  anesthetist: { fullName: string };
  consultantAnesthetist?: { fullName: string };
  createdAt: string;
  surgery: {
    procedureName: string;
    surgeonName?: string;
  };
}

export default function PreOpReviewsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [reviews, setReviews] = useState<PreOpReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<string>('');

  useEffect(() => {
    fetchReviews();
    // Auto-refresh every 30 seconds for cross-device sync
    const interval = setInterval(fetchReviews, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, dateFilter]);

  const fetchReviews = async () => {
    try {
      let url = '/api/preop-reviews';
      const params = new URLSearchParams();
      
      if (statusFilter !== 'ALL') {
        params.append('status', statusFilter);
      }
      if (dateFilter) {
        params.append('date', dateFilter);
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setReviews(data);
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return 'bg-green-100 text-green-800';
      case 'COMPLETED':
        return 'bg-blue-100 text-blue-800';
      case 'IN_PROGRESS':
        return 'bg-yellow-100 text-yellow-800';
      case 'PENDING':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getRiskColor = (riskLevel?: string) => {
    switch (riskLevel) {
      case 'HIGH':
        return 'text-red-600 font-semibold';
      case 'MODERATE':
        return 'text-orange-600';
      case 'LOW':
        return 'text-green-600';
      default:
        return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'COMPLETED':
        return <Clock className="h-5 w-5 text-blue-600" />;
      case 'IN_PROGRESS':
        return <Edit className="h-5 w-5 text-yellow-600" />;
      case 'PENDING':
        return <AlertCircle className="h-5 w-5 text-gray-600" />;
      default:
        return null;
    }
  };

  const canApprove = ['ADMIN', 'CONSULTANT_ANAESTHETIST', 'THEATRE_MANAGER', 'ANAESTHETIST', 'SYSTEM_ADMINISTRATOR'].includes(session?.user?.role || '');

  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Dynamic prescription form state for rejection
  const [medications, setMedications] = useState<Array<{
    drugName: string; dosage: string; route: string; frequency: string; timing: string; quantity: number;
  }>>([{ drugName: '', dosage: '', route: 'IV', frequency: '', timing: 'PRE_OP', quantity: 1 }]);
  const [fluids, setFluids] = useState('');
  const [emergencyDrugs, setEmergencyDrugs] = useState('');
  const [rxUrgency, setRxUrgency] = useState<'ROUTINE' | 'URGENT' | 'EMERGENCY'>('ROUTINE');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [prescriptionNotes, setPrescriptionNotes] = useState('');

  const addMedication = () => {
    setMedications([...medications, { drugName: '', dosage: '', route: 'IV', frequency: '', timing: 'PRE_OP', quantity: 1 }]);
  };

  const removeMedication = (index: number) => {
    if (medications.length > 1) {
      setMedications(medications.filter((_, i) => i !== index));
    }
  };

  const updateMedication = (index: number, field: string, value: string | number) => {
    const updated = [...medications];
    (updated[index] as any)[field] = value;
    setMedications(updated);
  };

  const handleApprove = async () => {
    if (!approvingId) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/preop-reviews/${approvingId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved: true,
          approvalNotes: approvalNotes || undefined,
        }),
      });
      if (response.ok) {
        toast.success('Review approved! Prescriptions are now available for packing.');
        setShowApprovalModal(false);
        setApprovalNotes('');
        setApprovingId(null);
        fetchReviews();
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to approve review');
      }
    } catch (error) {
      toast.error('Failed to approve review');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!approvingId) return;
    if (!rejectionReason.trim()) {
      toast.error('Please provide a reason for rejecting the review');
      return;
    }
    const validMeds = medications.filter(m => m.drugName.trim() && m.dosage.trim());
    if (validMeds.length === 0) {
      toast.error('Please add at least one medication with drug name and dosage');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/preop-reviews/${approvingId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved: false,
          rejectionReason: rejectionReason,
          correctedPrescription: {
            medications: validMeds,
            fluids: fluids || undefined,
            emergencyDrugs: emergencyDrugs || undefined,
            urgency: rxUrgency,
            specialInstructions: specialInstructions || undefined,
            prescriptionNotes: prescriptionNotes || undefined,
          },
        }),
      });
      if (response.ok) {
        toast.success('Corrected prescription submitted! It is now available for pharmacist packing.');
        setShowRejectModal(false);
        setRejectionReason('');
        setApprovingId(null);
        setMedications([{ drugName: '', dosage: '', route: 'IV', frequency: '', timing: 'PRE_OP', quantity: 1 }]);
        setFluids('');
        setEmergencyDrugs('');
        setSpecialInstructions('');
        setPrescriptionNotes('');
        fetchReviews();
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to submit corrected prescription');
      }
    } catch (error) {
      toast.error('Failed to submit corrected prescription');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <ClipboardList className="h-8 w-8" />
              Pre-Operative Anesthetic Reviews
            </h1>
            <p className="text-gray-600 mt-2">
              Manage pre-operative assessments and anesthetic plans
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard/preop-reviews/new')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="h-5 w-5" />
            New Review
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
        <div className="flex items-center gap-4">
          <Filter className="h-5 w-5 text-gray-500" />
          <div className="flex gap-4 flex-1">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2"
                title="Filter by status"
              >
                <option value="ALL">All Status</option>
                <option value="PENDING">Pending</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="APPROVED">Approved</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Surgery Date
              </label>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2"
                title="Filter by surgery date"
              />
            </div>
          </div>
          {(statusFilter !== 'ALL' || dateFilter) && (
            <button
              onClick={() => {
                setStatusFilter('ALL');
                setDateFilter('');
              }}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Reviews</p>
              <p className="text-2xl font-bold">{reviews.length}</p>
            </div>
            <ClipboardList className="h-8 w-8 text-blue-600" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">In Progress</p>
              <p className="text-2xl font-bold">
                {reviews.filter(r => r.status === 'IN_PROGRESS').length}
              </p>
            </div>
            <Clock className="h-8 w-8 text-yellow-600" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Awaiting Approval</p>
              <p className="text-2xl font-bold">
                {reviews.filter(r => r.status === 'COMPLETED').length}
              </p>
            </div>
            <UserCheck className="h-8 w-8 text-orange-600" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Approved</p>
              <p className="text-2xl font-bold">
                {reviews.filter(r => r.status === 'APPROVED').length}
              </p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
        </div>
      </div>

      {/* Reviews List */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : reviews.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <ClipboardList className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No reviews found</h3>
          <p className="text-gray-600 mb-4">
            {statusFilter !== 'ALL' || dateFilter
              ? 'Try adjusting your filters'
              : 'Start by creating a new pre-operative review'}
          </p>
          <button
            onClick={() => router.push('/dashboard/preop-reviews/new')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 inline-flex items-center gap-2"
          >
            <Plus className="h-5 w-5" />
            Create First Review
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Patient
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Procedure
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Surgery Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ASA / Risk
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Anesthetic Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reviewed By
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {reviews.map((review) => (
                <tr key={review.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {review.patientName}
                      </div>
                      <div className="text-sm text-gray-500">
                        {review.folderNumber}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {review.surgery.procedureName}
                    </div>
                    {review.surgery.surgeonName && (
                      <div className="text-sm text-gray-500">
                        Dr. {review.surgery.surgeonName}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(review.scheduledSurgeryDate).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm">
                      <span className="font-medium">
                        {review.asaClass || 'N/A'}
                      </span>
                      {review.riskLevel && (
                        <div className={`text-xs ${getRiskColor(review.riskLevel)}`}>
                          {review.riskLevel} Risk
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {review.proposedAnesthesiaType || 'Not specified'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(review.status)}`}>
                      {getStatusIcon(review.status)}
                      {review.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="text-gray-900">{review.anesthetist?.fullName || 'Not assigned'}</div>
                    {review.consultantAnesthetist && (
                      <div className="text-xs text-gray-500">
                        Approved by: {review.consultantAnesthetist?.fullName || 'Not assigned'}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => router.push(`/dashboard/preop-reviews/${review.id}`)}
                        className="text-blue-600 hover:text-blue-900"
                        title="View Details"
                      >
                        <Eye className="h-5 w-5" />
                      </button>
                      {review.status !== 'APPROVED' && (
                        <button
                          onClick={() => router.push(`/dashboard/preop-reviews/${review.id}/edit`)}
                          className="text-gray-600 hover:text-gray-900"
                          title="Edit Review"
                        >
                          <Edit className="h-5 w-5" />
                        </button>
                      )}
                      {canApprove && review.status !== 'APPROVED' && (
                        <>
                          <button
                            onClick={() => { setApprovingId(review.id); setShowApprovalModal(true); }}
                            className="text-green-600 hover:text-green-900 bg-green-50 hover:bg-green-100 px-2 py-1 rounded flex items-center gap-1"
                            title="Approve Review"
                          >
                            <ThumbsUp className="h-4 w-4" />
                            <span className="text-xs font-medium">Approve</span>
                          </button>
                          <button
                            onClick={() => { setApprovingId(review.id); setShowRejectModal(true); }}
                            className="text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 px-2 py-1 rounded flex items-center gap-1"
                            title="Send Back for Revision"
                          >
                            <XCircle className="h-4 w-4" />
                            <span className="text-xs font-medium">Reject</span>
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Approve Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <ThumbsUp className="w-5 h-5 text-green-600" />
              Approve Pre-Operative Review
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Approving this review will mark the associated prescriptions as ready for packing.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Approval Notes (optional)
              </label>
              <textarea
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                rows={3}
                placeholder="Add any notes for the approval..."
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowApprovalModal(false); setApprovalNotes(''); setApprovingId(null); }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center gap-2"
                disabled={submitting}
              >
                {submitting ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <ThumbsUp className="w-4 h-4" />
                )}
                Confirm Approval
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal with Corrected Prescription Form */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 overflow-y-auto py-4">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-3xl mx-4 my-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-600" />
              Reject &amp; Provide Corrected Prescription
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Reject the original review and write the correct prescription below. Once submitted, this prescription will be <strong>automatically approved</strong> and visible to pharmacists for packing.
            </p>

            {/* Rejection Reason */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason for Rejection <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                rows={2}
                placeholder="Why is the original prescription being rejected..."
                required
              />
            </div>

            {/* Corrected Medications */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-gray-900 flex items-center gap-1">
                  <Syringe className="w-4 h-4 text-indigo-600" />
                  Corrected Medications <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={addMedication}
                  className="flex items-center gap-1 text-sm bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700"
                >
                  <Plus className="w-3 h-3" />
                  Add Drug
                </button>
              </div>

              <div className="space-y-3">
                {medications.map((med, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-500">Medication #{index + 1}</span>
                      {medications.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeMedication(index)}
                          className="text-red-500 hover:text-red-700 p-1"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Drug Name *</label>
                        <input
                          type="text"
                          value={med.drugName}
                          onChange={(e) => updateMedication(index, 'drugName', e.target.value)}
                          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                          placeholder="e.g. Propofol"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Dosage *</label>
                        <input
                          type="text"
                          value={med.dosage}
                          onChange={(e) => updateMedication(index, 'dosage', e.target.value)}
                          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                          placeholder="e.g. 200mg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Route *</label>
                        <select
                          value={med.route}
                          onChange={(e) => updateMedication(index, 'route', e.target.value)}
                          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                          title="Medication route"
                        >
                          <option value="IV">IV (Intravenous)</option>
                          <option value="IM">IM (Intramuscular)</option>
                          <option value="PO">PO (Oral)</option>
                          <option value="SC">SC (Subcutaneous)</option>
                          <option value="PR">PR (Rectal)</option>
                          <option value="SL">SL (Sublingual)</option>
                          <option value="INH">INH (Inhalation)</option>
                          <option value="TOP">TOP (Topical)</option>
                          <option value="ETT">ETT (Endotracheal)</option>
                          <option value="EPIDURAL">Epidural</option>
                          <option value="SPINAL">Spinal</option>
                          <option value="NERVE_BLOCK">Nerve Block</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Frequency</label>
                        <input
                          type="text"
                          value={med.frequency}
                          onChange={(e) => updateMedication(index, 'frequency', e.target.value)}
                          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                          placeholder="e.g. Once, Q6H, PRN"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Timing</label>
                        <select
                          value={med.timing}
                          onChange={(e) => updateMedication(index, 'timing', e.target.value)}
                          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                          title="Medication timing"
                        >
                          <option value="PRE_OP">Pre-Operative</option>
                          <option value="INTRA_OP">Intra-Operative</option>
                          <option value="POST_OP">Post-Operative</option>
                          <option value="INDUCTION">At Induction</option>
                          <option value="MAINTENANCE">Maintenance</option>
                          <option value="EMERGENCE">Emergence</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Quantity</label>
                        <input
                          type="number"
                          min={1}
                          value={med.quantity}
                          onChange={(e) => updateMedication(index, 'quantity', parseInt(e.target.value) || 1)}
                          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                          title="Medication quantity"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Additional Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">IV Fluids</label>
                <input
                  type="text"
                  value={fluids}
                  onChange={(e) => setFluids(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="e.g. Normal Saline 1L, Ringer's Lactate 500ml"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Drugs</label>
                <input
                  type="text"
                  value={emergencyDrugs}
                  onChange={(e) => setEmergencyDrugs(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="e.g. Atropine 0.5mg, Adrenaline 1mg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Urgency</label>
                <select
                  value={rxUrgency}
                  onChange={(e) => setRxUrgency(e.target.value as any)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  title="Prescription urgency"
                >
                  <option value="ROUTINE">Routine</option>
                  <option value="URGENT">Urgent</option>
                  <option value="EMERGENCY">Emergency</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Special Instructions</label>
                <input
                  type="text"
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="Any special instructions for the pharmacist..."
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Prescription Notes</label>
              <textarea
                value={prescriptionNotes}
                onChange={(e) => setPrescriptionNotes(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                rows={2}
                placeholder="Additional notes about this prescription..."
              />
            </div>

            <div className="flex justify-end gap-3 border-t pt-4">
              <button
                onClick={() => { setShowRejectModal(false); setRejectionReason(''); setApprovingId(null); }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium flex items-center gap-2"
                disabled={submitting}
              >
                {submitting ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <Syringe className="w-4 h-4" />
                )}
                Reject &amp; Submit Corrected Prescription
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
