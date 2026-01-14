'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, AlertCircle, Syringe, Activity, Save } from 'lucide-react';
import Link from 'next/link';
import SmartTextInput from '@/components/SmartTextInput';

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
  surgery: {
    procedureName: string;
    patient: {
      name: string;
      age: number;
      gender: string;
    };
    surgeon: { fullName: string };
  };
}

export default function EditPreOpReviewPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const [review, setReview] = useState<PreOpReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
      } else {
        setError('Failed to load review');
      }
    } catch (error) {
      console.error('Error fetching review:', error);
      setError('Failed to load review');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!review) {
      setError('Review data not loaded');
      return;
    }

    setSubmitting(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    
    const payload = {
      currentMedications: formData.get('currentMedications'),
      allergies: formData.get('allergies'),
      comorbidities: formData.get('comorbidities'),
      previousAnesthesia: formData.get('previousAnesthesia'),
      lastOralIntake: formData.get('lastOralIntake') || undefined,
      fastingStatus: formData.get('fastingStatus'),
      weight: formData.get('weight') ? parseFloat(formData.get('weight') as string) : undefined,
      height: formData.get('height') ? parseFloat(formData.get('height') as string) : undefined,
      bmi: formData.get('bmi') ? parseFloat(formData.get('bmi') as string) : undefined,
      bloodPressure: formData.get('bloodPressure'),
      heartRate: formData.get('heartRate') ? parseInt(formData.get('heartRate') as string) : undefined,
      respiratoryRate: formData.get('respiratoryRate') ? parseInt(formData.get('respiratoryRate') as string) : undefined,
      temperature: formData.get('temperature') ? parseFloat(formData.get('temperature') as string) : undefined,
      airwayClass: formData.get('airwayClass'),
      neckMovement: formData.get('neckMovement'),
      dentition: formData.get('dentition'),
      hemoglobin: formData.get('hemoglobin') ? parseFloat(formData.get('hemoglobin') as string) : undefined,
      plateletCount: formData.get('plateletCount') ? parseFloat(formData.get('plateletCount') as string) : undefined,
      ptInr: formData.get('ptInr') ? parseFloat(formData.get('ptInr') as string) : undefined,
      creatinine: formData.get('creatinine') ? parseFloat(formData.get('creatinine') as string) : undefined,
      sodium: formData.get('sodium') ? parseFloat(formData.get('sodium') as string) : undefined,
      potassium: formData.get('potassium') ? parseFloat(formData.get('potassium') as string) : undefined,
      bloodGlucose: formData.get('bloodGlucose') ? parseFloat(formData.get('bloodGlucose') as string) : undefined,
      otherLabResults: formData.get('otherLabResults'),
      asaClass: formData.get('asaClass'),
      proposedAnesthesiaType: formData.get('proposedAnesthesiaType'),
      anestheticPlan: formData.get('anestheticPlan'),
      specialConsiderations: formData.get('specialConsiderations'),
      riskLevel: formData.get('riskLevel'),
      riskFactors: formData.get('riskFactors'),
      reviewNotes: formData.get('reviewNotes'),
      recommendations: formData.get('recommendations'),
      status: formData.get('status'),
    };

    try {
      const response = await fetch(`/api/preop-reviews/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        router.push(`/dashboard/preop-reviews/${params.id}`);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to update pre-operative review');
      }
    } catch (error) {
      console.error('Error updating review:', error);
      setError('Failed to update pre-operative review');
    } finally {
      setSubmitting(false);
    }
  };

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
          <p className="text-gray-600">{error || 'Review not found'}</p>
          <Link href="/dashboard/preop-reviews" className="text-indigo-600 hover:underline mt-2 block">
            Back to Reviews
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center gap-4">
        <Link
          href={`/dashboard/preop-reviews/${params.id}`}
          className="p-2 hover:bg-gray-100 rounded-lg transition"
        >
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Edit Pre-Operative Review</h1>
          <p className="text-gray-600 mt-2">
            Update anesthetic assessment for {review.patientName}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Patient & Surgery Info (Read-only) */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <Activity className="w-6 h-6 text-indigo-600" />
            <h2 className="text-xl font-semibold">Surgery Information</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Patient:</span> {review.surgery.patient.name}
            </div>
            <div>
              <span className="font-medium">Folder:</span> {review.folderNumber}
            </div>
            <div>
              <span className="font-medium">Age/Gender:</span> {review.surgery.patient.age}y, {review.surgery.patient.gender}
            </div>
            <div>
              <span className="font-medium">Surgeon:</span> {review.surgery.surgeon.fullName}
            </div>
            <div className="col-span-2">
              <span className="font-medium">Procedure:</span> {review.surgery.procedureName}
            </div>
          </div>
        </div>

        {/* Medical History */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Medical History</h2>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current Medications
              </label>
              <textarea
                name="currentMedications"
                rows={3}
                defaultValue={review.currentMedications || ''}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="List all current medications with dosages"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Allergies
              </label>
              <input
                type="text"
                name="allergies"
                defaultValue={review.allergies || ''}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="Drug allergies, food allergies, etc."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Comorbidities
              </label>
              <textarea
                name="comorbidities"
                rows={3}
                defaultValue={review.comorbidities || ''}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="Diabetes, Hypertension, Cardiac disease, etc."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Previous Anesthesia History
              </label>
              <textarea
                name="previousAnesthesia"
                rows={2}
                defaultValue={review.previousAnesthesia || ''}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="Any complications or issues with previous anesthesia"
              />
            </div>
          </div>
        </div>

        {/* Fasting Status */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Fasting Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last Oral Intake
              </label>
              <input
                type="datetime-local"
                name="lastOralIntake"
                defaultValue={review.lastOralIntake ? new Date(review.lastOralIntake).toISOString().slice(0, 16) : ''}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fasting Status
              </label>
              <select
                name="fastingStatus"
                defaultValue={review.fastingStatus || ''}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select status</option>
                <option value="ADEQUATE">Adequate (6+ hours)</option>
                <option value="BORDERLINE">Borderline (4-6 hours)</option>
                <option value="INADEQUATE">Inadequate (&lt;4 hours)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Physical Examination */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Physical Examination</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Weight (kg)
              </label>
              <input
                type="number"
                step="0.1"
                name="weight"
                defaultValue={review.weight || ''}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Height (cm)
              </label>
              <input
                type="number"
                step="0.1"
                name="height"
                defaultValue={review.height || ''}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                BMI
              </label>
              <input
                type="number"
                step="0.1"
                name="bmi"
                defaultValue={review.bmi || ''}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Blood Pressure
              </label>
              <input
                type="text"
                name="bloodPressure"
                defaultValue={review.bloodPressure || ''}
                placeholder="e.g., 120/80"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Heart Rate (bpm)
              </label>
              <input
                type="number"
                name="heartRate"
                defaultValue={review.heartRate || ''}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Respiratory Rate
              </label>
              <input
                type="number"
                name="respiratoryRate"
                defaultValue={review.respiratoryRate || ''}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Temperature (°C)
              </label>
              <input
                type="number"
                step="0.1"
                name="temperature"
                defaultValue={review.temperature || ''}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Airway Assessment */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Airway Assessment</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Airway Class (Mallampati)
              </label>
              <select
                name="airwayClass"
                defaultValue={review.airwayClass || ''}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select class</option>
                <option value="CLASS_I">Class I</option>
                <option value="CLASS_II">Class II</option>
                <option value="CLASS_III">Class III</option>
                <option value="CLASS_IV">Class IV</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Neck Movement
              </label>
              <select
                name="neckMovement"
                defaultValue={review.neckMovement || ''}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select status</option>
                <option value="NORMAL">Normal</option>
                <option value="LIMITED">Limited</option>
                <option value="SEVERELY_LIMITED">Severely Limited</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dentition
              </label>
              <input
                type="text"
                name="dentition"
                defaultValue={review.dentition || ''}
                placeholder="e.g., Good, Missing teeth, Dentures"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Laboratory Results */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Laboratory Results</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hemoglobin (g/dL)
              </label>
              <input
                type="number"
                step="0.1"
                name="hemoglobin"
                defaultValue={review.hemoglobin || ''}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Platelet Count (×10⁹/L)
              </label>
              <input
                type="number"
                step="0.1"
                name="plateletCount"
                defaultValue={review.plateletCount || ''}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                PT/INR
              </label>
              <input
                type="number"
                step="0.1"
                name="ptInr"
                defaultValue={review.ptInr || ''}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Creatinine (mg/dL)
              </label>
              <input
                type="number"
                step="0.1"
                name="creatinine"
                defaultValue={review.creatinine || ''}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sodium (mmol/L)
              </label>
              <input
                type="number"
                step="0.1"
                name="sodium"
                defaultValue={review.sodium || ''}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Potassium (mmol/L)
              </label>
              <input
                type="number"
                step="0.1"
                name="potassium"
                defaultValue={review.potassium || ''}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Blood Glucose (mg/dL)
              </label>
              <input
                type="number"
                step="0.1"
                name="bloodGlucose"
                defaultValue={review.bloodGlucose || ''}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Other Lab Results
            </label>
            <textarea
              name="otherLabResults"
              rows={2}
              defaultValue={review.otherLabResults || ''}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              placeholder="Additional laboratory findings"
            />
          </div>
        </div>

        {/* Anesthetic Plan */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <Syringe className="w-6 h-6 text-indigo-600" />
            <h2 className="text-xl font-semibold">Anesthetic Plan</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ASA Classification
              </label>
              <select
                name="asaClass"
                defaultValue={review.asaClass || ''}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select ASA class</option>
                <option value="ASA_I">ASA I - Normal healthy patient</option>
                <option value="ASA_II">ASA II - Mild systemic disease</option>
                <option value="ASA_III">ASA III - Severe systemic disease</option>
                <option value="ASA_IV">ASA IV - Severe disease, constant threat to life</option>
                <option value="ASA_V">ASA V - Moribund patient</option>
                <option value="ASA_VI">ASA VI - Brain-dead organ donor</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Proposed Anesthesia Type
              </label>
              <select
                name="proposedAnesthesiaType"
                defaultValue={review.proposedAnesthesiaType || ''}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select type</option>
                <option value="GENERAL">General Anesthesia</option>
                <option value="SPINAL">Spinal Anesthesia</option>
                <option value="LOCAL">Local Anesthesia</option>
                <option value="REGIONAL">Regional Anesthesia</option>
                <option value="SEDATION">Sedation</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Anesthetic Plan Details
            </label>
            <textarea
              name="anestheticPlan"
              rows={4}
              defaultValue={review.anestheticPlan || ''}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              placeholder="Detailed anesthetic plan, drug choices, monitoring requirements, etc."
            />
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Special Considerations
            </label>
            <textarea
              name="specialConsiderations"
              rows={3}
              defaultValue={review.specialConsiderations || ''}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              placeholder="Difficult airway, risk of aspiration, special positioning, etc."
            />
          </div>
        </div>

        {/* Risk Assessment */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Risk Assessment</h2>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Risk Level
            </label>
            <select
              name="riskLevel"
              defaultValue={review.riskLevel || ''}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select risk level</option>
              <option value="LOW">Low Risk</option>
              <option value="MODERATE">Moderate Risk</option>
              <option value="HIGH">High Risk</option>
              <option value="VERY_HIGH">Very High Risk</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Risk Factors
            </label>
            <textarea
              name="riskFactors"
              rows={3}
              defaultValue={review.riskFactors || ''}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              placeholder="Specific risk factors identified"
            />
          </div>
        </div>

        {/* Recommendations */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Review Notes & Recommendations</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Review Notes
              </label>
              <textarea
                name="reviewNotes"
                rows={4}
                defaultValue={review.reviewNotes || ''}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="Overall assessment notes"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Recommendations
              </label>
              <textarea
                name="recommendations"
                rows={4}
                defaultValue={review.recommendations || ''}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="Recommendations for optimization, further investigations, or precautions"
              />
            </div>
          </div>
        </div>

        {/* Status Update */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Review Status</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              name="status"
              defaultValue={review.status}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="PENDING">Pending</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              {['CONSULTANT_ANAESTHETIST', 'ADMIN'].includes(session?.user?.role || '') && (
                <option value="APPROVED">Approved</option>
              )}
            </select>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 bg-indigo-600 text-white py-3 px-6 rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
          >
            <Save className="w-5 h-5" />
            {submitting ? 'Saving Changes...' : 'Save Changes'}
          </button>
          <Link
            href={`/dashboard/preop-reviews/${params.id}`}
            className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
