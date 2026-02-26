'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { ArrowLeft, Edit, User, Calendar, Activity, Syringe, CheckCircle, XCircle, ThumbsUp, ThumbsDown, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface PreOpReview {
  id: string;
  surgeryId: string;
  patientName: string;
  folderNumber: string;
  scheduledSurgeryDate: string;
  status: string;
  currentMedications?: string;
  allergies?: string;
  comorbidities?: string;
  previousAnesthesia?: string;
  lastOralIntake?: string;
  fastingStatus?: string;
  weight?: number;
  height?: number;
  bmi?: number;
  bloodPressure?: string;
  heartRate?: number;
  respiratoryRate?: number;
  temperature?: number;
  airwayClass?: string;
  neckMovement?: string;
  dentition?: string;
  hemoglobin?: number;
  plateletCount?: number;
  ptInr?: number;
  creatinine?: number;
  sodium?: number;
  potassium?: number;
  bloodGlucose?: number;
  otherLabResults?: string;
  asaClass?: string;
  proposedAnesthesiaType?: string;
  anestheticPlan?: string;
  specialConsiderations?: string;
  riskLevel?: string;
  riskFactors?: string;
  reviewNotes?: string;
  recommendations?: string;
  anesthetist: { fullName: string };
  consultantAnesthetist?: { fullName: string };
  createdAt: string;
  surgery: {
    procedureName: string;
    surgeon: { fullName: string };
  };
}

export default function PreOpReviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [review, setReview] = useState<PreOpReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Dynamic prescription form state
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

  useEffect(() => {
    if (params.id) {
      fetchReview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const fetchReview = async () => {
    try {
      const response = await fetch(`/api/preop-reviews/${params.id}`);
      if (response.ok) {
        const data = await response.json();
        setReview(data);
      }
    } catch (error) {
      console.error('Error fetching review:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/preop-reviews/${params.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved: true,
          approvalNotes: approvalNotes || undefined,
        }),
      });

      if (response.ok) {
        toast.success('Review approved successfully! Prescriptions are now available for packing.');
        setShowApprovalModal(false);
        setApprovalNotes('');
        fetchReview();
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
    if (!rejectionReason.trim()) {
      toast.error('Please provide a reason for rejecting the review');
      return;
    }
    // Validate medications
    const validMeds = medications.filter(m => m.drugName.trim() && m.dosage.trim());
    if (validMeds.length === 0) {
      toast.error('Please add at least one medication with drug name and dosage');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/preop-reviews/${params.id}/approve`, {
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
        setMedications([{ drugName: '', dosage: '', route: 'IV', frequency: '', timing: 'PRE_OP', quantity: 1 }]);
        setFluids('');
        setEmergencyDrugs('');
        setSpecialInstructions('');
        setPrescriptionNotes('');
        fetchReview();
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'bg-green-100 text-green-800';
      case 'APPROVED': return 'bg-blue-100 text-blue-800';
      case 'IN_PROGRESS': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Roles that can approve reviews
  const canApprove = ['ADMIN', 'CONSULTANT_ANAESTHETIST', 'THEATRE_MANAGER'].includes(session?.user?.role || '');
  const canEdit = ['ADMIN', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'].includes(session?.user?.role || '');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading review...</p>
        </div>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600">Review not found</p>
          <Link href="/dashboard/preop-reviews" className="text-indigo-600 hover:underline mt-2 block">
            Back to Reviews
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/preop-reviews"
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Pre-Operative Review Details</h1>
            <p className="text-gray-600 mt-1">Complete anesthetic assessment</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(review.status)}`}>
            {review.status.replace('_', ' ')}
          </span>
          {canEdit && review.status !== 'APPROVED' && (
            <Link
              href={`/dashboard/preop-reviews/${review.id}/edit`}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              <Edit className="w-4 h-4" />
              Edit
            </Link>
          )}
        </div>
      </div>

      {/* Approval Action Bar - shown to consultants/admin when review is not yet approved */}
      {canApprove && review.status !== 'APPROVED' && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-amber-900 flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                Consultant Approval Required
              </h3>
              <p className="text-amber-700 text-sm mt-1">
                Review this pre-operative assessment and approve it to make prescriptions available for packing.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowRejectModal(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition"
              >
                <ThumbsDown className="w-4 h-4" />
                Send Back
              </button>
              <button
                onClick={() => setShowApprovalModal(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition"
              >
                <ThumbsUp className="w-4 h-4" />
                Approve Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approved banner */}
      {review.status === 'APPROVED' && (
        <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="text-green-800 font-semibold">
              This review has been approved.
            </span>
            {review.consultantAnesthetist && (
              <span className="text-green-700 text-sm">
                Approved by: {review.consultantAnesthetist.fullName}
              </span>
            )}
          </div>
          <p className="text-green-700 text-sm mt-1">
            Prescriptions from this review are now available for packing.
          </p>
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
                onClick={() => { setShowApprovalModal(false); setApprovalNotes(''); }}
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
              <ThumbsDown className="w-5 h-5 text-red-600" />
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
                onClick={() => { setShowRejectModal(false); setRejectionReason(''); }}
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

      {/* Patient & Surgery Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-5 h-5 text-indigo-600" />
            <h2 className="text-xl font-semibold">Patient Information</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-500">Name</label>
              <p className="text-gray-900 font-medium">{review.patientName}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Folder Number</label>
              <p className="text-gray-900">{review.folderNumber}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-indigo-600" />
            <h2 className="text-xl font-semibold">Surgery Information</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-500">Procedure</label>
              <p className="text-gray-900 font-medium">{review.surgery.procedureName}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Surgeon</label>
              <p className="text-gray-900">{review.surgery.surgeon?.fullName || 'Not assigned'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Scheduled Date</label>
              <p className="text-gray-900">{new Date(review.scheduledSurgeryDate).toLocaleDateString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Medical History */}
      {(review.currentMedications || review.allergies || review.comorbidities || review.previousAnesthesia) && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Medical History</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {review.currentMedications && (
              <div>
                <label className="text-sm font-medium text-gray-500">Current Medications</label>
                <p className="text-gray-900 mt-1">{review.currentMedications}</p>
              </div>
            )}
            {review.allergies && (
              <div>
                <label className="text-sm font-medium text-gray-500">Allergies</label>
                <p className="text-gray-900 mt-1">{review.allergies}</p>
              </div>
            )}
            {review.comorbidities && (
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-gray-500">Comorbidities</label>
                <p className="text-gray-900 mt-1">{review.comorbidities}</p>
              </div>
            )}
            {review.previousAnesthesia && (
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-gray-500">Previous Anesthesia History</label>
                <p className="text-gray-900 mt-1">{review.previousAnesthesia}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fasting Status */}
      {(review.lastOralIntake || review.fastingStatus) && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Fasting Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {review.lastOralIntake && (
              <div>
                <label className="text-sm font-medium text-gray-500">Last Oral Intake</label>
                <p className="text-gray-900 mt-1">{new Date(review.lastOralIntake).toLocaleString()}</p>
              </div>
            )}
            {review.fastingStatus && (
              <div>
                <label className="text-sm font-medium text-gray-500">Fasting Status</label>
                <p className="text-gray-900 mt-1">{review.fastingStatus}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Physical Examination */}
      {(review.weight || review.height || review.bmi || review.bloodPressure || review.heartRate || review.respiratoryRate || review.temperature) && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Physical Examination</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {review.weight && (
              <div>
                <label className="text-sm font-medium text-gray-500">Weight</label>
                <p className="text-gray-900 mt-1">{review.weight} kg</p>
              </div>
            )}
            {review.height && (
              <div>
                <label className="text-sm font-medium text-gray-500">Height</label>
                <p className="text-gray-900 mt-1">{review.height} cm</p>
              </div>
            )}
            {review.bmi && (
              <div>
                <label className="text-sm font-medium text-gray-500">BMI</label>
                <p className="text-gray-900 mt-1">{review.bmi}</p>
              </div>
            )}
            {review.bloodPressure && (
              <div>
                <label className="text-sm font-medium text-gray-500">Blood Pressure</label>
                <p className="text-gray-900 mt-1">{review.bloodPressure}</p>
              </div>
            )}
            {review.heartRate && (
              <div>
                <label className="text-sm font-medium text-gray-500">Heart Rate</label>
                <p className="text-gray-900 mt-1">{review.heartRate} bpm</p>
              </div>
            )}
            {review.respiratoryRate && (
              <div>
                <label className="text-sm font-medium text-gray-500">Respiratory Rate</label>
                <p className="text-gray-900 mt-1">{review.respiratoryRate} /min</p>
              </div>
            )}
            {review.temperature && (
              <div>
                <label className="text-sm font-medium text-gray-500">Temperature</label>
                <p className="text-gray-900 mt-1">{review.temperature}°C</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Airway Assessment */}
      {(review.airwayClass || review.neckMovement || review.dentition) && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Airway Assessment</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {review.airwayClass && (
              <div>
                <label className="text-sm font-medium text-gray-500">Airway Class</label>
                <p className="text-gray-900 mt-1">{review.airwayClass}</p>
              </div>
            )}
            {review.neckMovement && (
              <div>
                <label className="text-sm font-medium text-gray-500">Neck Movement</label>
                <p className="text-gray-900 mt-1">{review.neckMovement}</p>
              </div>
            )}
            {review.dentition && (
              <div>
                <label className="text-sm font-medium text-gray-500">Dentition</label>
                <p className="text-gray-900 mt-1">{review.dentition}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Laboratory Results */}
      {(review.hemoglobin || review.plateletCount || review.ptInr || review.creatinine || review.sodium || review.potassium || review.bloodGlucose || review.otherLabResults) && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Laboratory Results</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {review.hemoglobin && (
              <div>
                <label className="text-sm font-medium text-gray-500">Hemoglobin</label>
                <p className="text-gray-900 mt-1">{review.hemoglobin} g/dL</p>
              </div>
            )}
            {review.plateletCount && (
              <div>
                <label className="text-sm font-medium text-gray-500">Platelet Count</label>
                <p className="text-gray-900 mt-1">{review.plateletCount} ×10⁹/L</p>
              </div>
            )}
            {review.ptInr && (
              <div>
                <label className="text-sm font-medium text-gray-500">PT/INR</label>
                <p className="text-gray-900 mt-1">{review.ptInr}</p>
              </div>
            )}
            {review.creatinine && (
              <div>
                <label className="text-sm font-medium text-gray-500">Creatinine</label>
                <p className="text-gray-900 mt-1">{review.creatinine} mg/dL</p>
              </div>
            )}
            {review.sodium && (
              <div>
                <label className="text-sm font-medium text-gray-500">Sodium</label>
                <p className="text-gray-900 mt-1">{review.sodium} mmol/L</p>
              </div>
            )}
            {review.potassium && (
              <div>
                <label className="text-sm font-medium text-gray-500">Potassium</label>
                <p className="text-gray-900 mt-1">{review.potassium} mmol/L</p>
              </div>
            )}
            {review.bloodGlucose && (
              <div>
                <label className="text-sm font-medium text-gray-500">Blood Glucose</label>
                <p className="text-gray-900 mt-1">{review.bloodGlucose} mg/dL</p>
              </div>
            )}
          </div>
          {review.otherLabResults && (
            <div className="mt-4">
              <label className="text-sm font-medium text-gray-500">Other Lab Results</label>
              <p className="text-gray-900 mt-1">{review.otherLabResults}</p>
            </div>
          )}
        </div>
      )}

      {/* Anesthetic Plan */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center gap-2 mb-4">
          <Syringe className="w-5 h-5 text-indigo-600" />
          <h2 className="text-xl font-semibold">Anesthetic Plan</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {review.asaClass && (
            <div>
              <label className="text-sm font-medium text-gray-500">ASA Classification</label>
              <p className="text-gray-900 mt-1">{review.asaClass}</p>
            </div>
          )}
          {review.proposedAnesthesiaType && (
            <div>
              <label className="text-sm font-medium text-gray-500">Proposed Anesthesia Type</label>
              <p className="text-gray-900 mt-1">{review.proposedAnesthesiaType}</p>
            </div>
          )}
        </div>
        {review.anestheticPlan && (
          <div className="mt-4">
            <label className="text-sm font-medium text-gray-500">Anesthetic Plan Details</label>
            <p className="text-gray-900 mt-1 whitespace-pre-wrap">{review.anestheticPlan}</p>
          </div>
        )}
        {review.specialConsiderations && (
          <div className="mt-4">
            <label className="text-sm font-medium text-gray-500">Special Considerations</label>
            <p className="text-gray-900 mt-1 whitespace-pre-wrap">{review.specialConsiderations}</p>
          </div>
        )}
      </div>

      {/* Risk Assessment */}
      {(review.riskLevel || review.riskFactors) && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Risk Assessment</h2>
          {review.riskLevel && (
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-500">Risk Level</label>
              <p className="text-gray-900 mt-1 font-semibold">{review.riskLevel}</p>
            </div>
          )}
          {review.riskFactors && (
            <div>
              <label className="text-sm font-medium text-gray-500">Risk Factors</label>
              <p className="text-gray-900 mt-1 whitespace-pre-wrap">{review.riskFactors}</p>
            </div>
          )}
        </div>
      )}

      {/* Recommendations */}
      {(review.reviewNotes || review.recommendations) && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Review Notes & Recommendations</h2>
          {review.reviewNotes && (
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-500">Review Notes</label>
              <p className="text-gray-900 mt-1 whitespace-pre-wrap">{review.reviewNotes}</p>
            </div>
          )}
          {review.recommendations && (
            <div>
              <label className="text-sm font-medium text-gray-500">Recommendations</label>
              <p className="text-gray-900 mt-1 whitespace-pre-wrap">{review.recommendations}</p>
            </div>
          )}
        </div>
      )}

      {/* Review Information */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="w-5 h-5 text-indigo-600" />
          <h2 className="text-xl font-semibold">Review Information</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="text-sm font-medium text-gray-500">Reviewed By</label>
            <p className="text-gray-900 mt-1">{review.anesthetist?.fullName || 'Not assigned'}</p>
          </div>
          {review.consultantAnesthetist && (
            <div>
              <label className="text-sm font-medium text-gray-500">Consultant Anesthetist</label>
              <p className="text-gray-900 mt-1">{review.consultantAnesthetist?.fullName || 'Not assigned'}</p>
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-gray-500">Review Date</label>
            <p className="text-gray-900 mt-1">{new Date(review.createdAt).toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
