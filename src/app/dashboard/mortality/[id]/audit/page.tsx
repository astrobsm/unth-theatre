'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Heart, User, FileText, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
const SmartTextInput = dynamic(() => import('@/components/SmartTextInput'), { ssr: false });

interface Mortality {
  id: string;
  timeOfDeath: string;
  location: string;
  causeOfDeath: string;
  contributingFactors: string | null;
  resuscitationAttempted: boolean;
  resuscitationDetails: string | null;
  patient: {
    name: string;
    folderNumber: string;
    age: number;
    gender: string;
  };
  surgery: {
    surgeryType: string;
    scheduledDate: string;
    surgeon: {
      fullName: string;
    };
  };
  audits: {
    id: string;
    findings: string;
    preventability: string;
    recommendations: string;
    actionsTaken: string | null;
    followUpRequired: boolean;
    reviewedBy: {
      fullName: string;
    };
    createdAt: string;
  }[];
}

export default function MortalityAuditPage() {
  const params = useParams();
  const router = useRouter();
  const mortalityId = params.id as string;

  const [mortality, setMortality] = useState<Mortality | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  
  // SmartTextInput state for dictation
  const [findings, setFindings] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [actionsTaken, setActionsTaken] = useState('');

  useEffect(() => {
    fetchMortality();
  }, [mortalityId]);

  const fetchMortality = async () => {
    try {
      const response = await fetch(`/api/mortality?id=${mortalityId}`);
      if (response.ok) {
        const data = await response.json();
        const mortalityData = Array.isArray(data) ? data.find((m: Mortality) => m.id === mortalityId) : data;
        setMortality(mortalityData);
        setShowForm(mortalityData?.audits.length === 0);
      }
    } catch (error) {
      console.error('Failed to fetch mortality:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const formData = new FormData(e.currentTarget);

    const data = {
      mortalityId,
      findings: findings,
      preventability: formData.get('preventability'),
      recommendations: recommendations,
      actionsTaken: actionsTaken || null,
      followUpRequired: formData.get('followUpRequired') === 'on',
    };

    try {
      const response = await fetch('/api/mortality/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        router.push('/dashboard/mortality');
      } else {
        const error = await response.json();
        setError(error.error || 'Failed to submit audit');
      }
    } catch (error) {
      setError('An error occurred while submitting audit');
    } finally {
      setSubmitting(false);
    }
  };

  const getLocationDisplay = (location: string) => {
    return location.replace(/_/g, ' ');
  };

  const getPreventabilityColor = (preventability: string) => {
    switch (preventability) {
      case 'PREVENTABLE':
        return 'bg-red-100 text-red-800';
      case 'POSSIBLY_PREVENTABLE':
        return 'bg-yellow-100 text-yellow-800';
      case 'NOT_PREVENTABLE':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!mortality) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-400" />
        <h2 className="text-2xl font-bold">Mortality record not found</h2>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/mortality"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Mortality Audit</h1>
          <p className="text-gray-600 mt-1">Review and audit mortality case</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-600 mr-3" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      {/* Mortality Case Details */}
      <div className="card bg-gradient-to-r from-red-50 to-orange-50">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow">
            <Heart className="w-8 h-8 text-red-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900">{mortality.patient.name}</h2>
            <p className="text-gray-700">
              {mortality.patient.folderNumber} | {mortality.patient.age} years | {mortality.patient.gender}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <p className="text-sm font-semibold text-gray-700">Procedure</p>
            <p className="text-gray-900">{mortality.surgery.surgeryType}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700">Surgeon</p>
            <p className="text-gray-900">{mortality.surgery.surgeon?.fullName || 'Not assigned'}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700">Time of Death</p>
            <p className="text-gray-900">{formatDateTime(mortality.timeOfDeath)}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700">Location</p>
            <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
              {getLocationDisplay(mortality.location)}
            </span>
          </div>
        </div>

        <div className="mt-4 p-4 bg-white rounded-lg">
          <p className="text-sm font-semibold text-gray-700 mb-2">Cause of Death</p>
          <p className="text-gray-900">{mortality.causeOfDeath}</p>
        </div>

        {mortality.contributingFactors && (
          <div className="mt-3 p-4 bg-white rounded-lg">
            <p className="text-sm font-semibold text-gray-700 mb-2">Contributing Factors</p>
            <p className="text-gray-900">{mortality.contributingFactors}</p>
          </div>
        )}

        {mortality.resuscitationAttempted && (
          <div className="mt-3 p-4 bg-white rounded-lg border-l-4 border-orange-400">
            <p className="text-sm font-semibold text-gray-700 mb-2">Resuscitation Details</p>
            <p className="text-gray-900">{mortality.resuscitationDetails || 'No details provided'}</p>
          </div>
        )}
      </div>

      {/* Existing Audits */}
      {mortality.audits.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Audit History</h2>
          <div className="space-y-4">
            {mortality.audits.map((audit) => (
              <div key={audit.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <User className="w-5 h-5 text-gray-600" />
                    <span className="font-semibold">{audit.reviewedBy?.fullName || 'Not assigned'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Clock className="w-4 h-4" />
                    {formatDateTime(audit.createdAt)}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">Preventability Assessment</p>
                    <span className={`inline-block mt-1 px-3 py-1 rounded-full text-sm font-medium ${getPreventabilityColor(audit.preventability)}`}>
                      {audit.preventability.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-gray-700">Findings</p>
                    <p className="text-gray-900 mt-1">{audit.findings}</p>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-gray-700">Recommendations</p>
                    <p className="text-gray-900 mt-1">{audit.recommendations}</p>
                  </div>

                  {audit.actionsTaken && (
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Actions Taken</p>
                      <p className="text-gray-900 mt-1">{audit.actionsTaken}</p>
                    </div>
                  )}

                  {audit.followUpRequired && (
                    <div className="p-3 bg-yellow-50 border-l-4 border-yellow-400">
                      <p className="text-sm font-semibold text-yellow-800">Follow-up Required</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 btn-secondary w-full"
            >
              Add New Audit Review
            </button>
          )}
        </div>
      )}

      {/* Audit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="w-6 h-6 text-primary-600" />
              <h2 className="text-xl font-semibold">Audit Assessment</h2>
            </div>

            <div className="space-y-6">
              <div>
                <label className="label">Preventability Assessment *</label>
                <select name="preventability" required className="input-field">
                  <option value="">Select Assessment</option>
                  <option value="PREVENTABLE">Preventable</option>
                  <option value="POSSIBLY_PREVENTABLE">Possibly Preventable</option>
                  <option value="NOT_PREVENTABLE">Not Preventable</option>
                </select>
                <p className="text-sm text-gray-600 mt-1">
                  Assess whether this mortality could have been prevented with different care or circumstances
                </p>
              </div>

              <SmartTextInput
                label="Audit Findings *"
                value={findings}
                onChange={setFindings}
                required={true}
                rows={5}
                placeholder="Document key findings from the case review, including any deviations from standard care, complications, or systemic issues... 🎤 Dictate"
                enableSpeech={true}
                enableOCR={true}
                medicalMode={true}
              />

              <SmartTextInput
                label="Recommendations *"
                value={recommendations}
                onChange={setRecommendations}
                required={true}
                rows={4}
                placeholder="Provide recommendations for preventing similar cases in the future, including changes to protocols, training, or resources... 🎤 Dictate"
                enableSpeech={true}
                enableOCR={true}
                medicalMode={true}
              />

              <SmartTextInput
                label="Actions Taken (if any)"
                value={actionsTaken}
                onChange={setActionsTaken}
                rows={3}
                placeholder="Document any immediate actions already taken in response to this case... 🎤 Dictate"
                enableSpeech={true}
                enableOCR={true}
                medicalMode={true}
              />

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="followUpRequired"
                  className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
                />
                <span className="font-medium">Follow-up required</span>
              </label>
            </div>
          </div>

          {/* Guidelines */}
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-semibold mb-2">Audit Guidelines</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Review all clinical documentation thoroughly</li>
                  <li>Assess adherence to clinical protocols and WHO checklist</li>
                  <li>Identify any systems issues or resource limitations</li>
                  <li>Focus on learning and improvement, not blame</li>
                  <li>Ensure recommendations are specific and actionable</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-4">
            <Link href="/dashboard/mortality" className="btn-secondary">
              Cancel
            </Link>
            <button type="submit" disabled={submitting} className="btn-primary px-8">
              {submitting ? 'Submitting...' : 'Submit Audit'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
