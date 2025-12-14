'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Patient {
  id: string;
  folderNumber: string;
  name: string;
  age: number;
  gender: string;
  ward: string;
}

interface Surgery {
  id: string;
  procedureName: string;
  scheduledDate: string;
  scheduledTime: string;
  surgeon: {
    name: string;
  };
}

interface HoldingAreaAssessment {
  id: string;
  surgeryId: string;
  patientId: string;
  arrivalTime: string;
  status: string;
  patient: Patient;
  surgery: Surgery;
  patientIdentityConfirmed: boolean;
  surgicalSiteConfirmed: boolean;
  consentFormSigned: boolean;
  allergyStatusChecked: boolean;
  fastingCompliant: boolean;
  vitalSignsNormal: boolean;
  allDocumentationComplete: boolean;
  clearedForTheatre: boolean;
  redAlertTriggered: boolean;
  redAlerts: any[];
}

export default function HoldingAreaPage() {
  const router = useRouter();
  const [assessments, setAssessments] = useState<HoldingAreaAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active'>('active');

  useEffect(() => {
    fetchAssessments();
  }, [filter]);

  const fetchAssessments = async () => {
    try {
      const url = filter === 'active' 
        ? '/api/holding-area?active=true'
        : '/api/holding-area';
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setAssessments(data);
        } else {
          console.error('API returned non-array data:', data);
          setAssessments([]);
        }
      }
    } catch (error) {
      console.error('Error fetching assessments:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ARRIVED':
        return 'bg-blue-100 text-blue-800';
      case 'VERIFICATION_IN_PROGRESS':
        return 'bg-yellow-100 text-yellow-800';
      case 'DISCREPANCY_FOUND':
        return 'bg-orange-100 text-orange-800';
      case 'RED_ALERT_ACTIVE':
        return 'bg-red-100 text-red-800 font-bold';
      case 'CLEARED_FOR_THEATRE':
        return 'bg-green-100 text-green-800';
      case 'TRANSFERRED_TO_THEATRE':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading holding area assessments...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Pre-Operative Holding Area
          </h1>
          <p className="text-gray-600">
            Patient safety verification and theatre clearance
          </p>
        </div>
        <button
          onClick={() => router.push('/dashboard/holding-area/new')}
          className="bg-primary-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-primary-700 transition-colors"
        >
          + New Assessment
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex gap-4">
        <button
          onClick={() => setFilter('active')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'active'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Active Patients
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          All Patients
        </button>
      </div>

      {/* Assessments Grid */}
      {assessments.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500 text-lg">No patients in holding area</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {assessments.map((assessment) => (
            <div
              key={assessment.id}
              className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => router.push(`/dashboard/holding-area/${assessment.id}`)}
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-lg text-gray-900">
                    {assessment.patient.name}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {assessment.patient.folderNumber} • {assessment.patient.age}y • {assessment.patient.gender}
                  </p>
                </div>
                {assessment.redAlertTriggered && (
                  <div className="bg-red-600 text-white px-2 py-1 rounded text-xs font-bold">
                    🚨 ALERT
                  </div>
                )}
              </div>

              {/* Status Badge */}
              <div className="mb-4">
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(assessment.status)}`}>
                  {formatStatus(assessment.status)}
                </span>
              </div>

              {/* Surgery Details */}
              <div className="mb-4 text-sm">
                <p className="font-medium text-gray-900">{assessment.surgery.procedureName}</p>
                <p className="text-gray-600">Surgeon: {assessment.surgery.surgeon.name}</p>
                <p className="text-gray-600">
                  Scheduled: {new Date(assessment.surgery.scheduledDate).toLocaleDateString()} at {assessment.surgery.scheduledTime}
                </p>
              </div>

              {/* Safety Checks Progress */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-700 mb-2">Safety Verification:</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1">
                    {assessment.patientIdentityConfirmed ? (
                      <span className="text-green-600">✓</span>
                    ) : (
                      <span className="text-gray-400">○</span>
                    )}
                    <span className="text-gray-700">Identity</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {assessment.surgicalSiteConfirmed ? (
                      <span className="text-green-600">✓</span>
                    ) : (
                      <span className="text-gray-400">○</span>
                    )}
                    <span className="text-gray-700">Site</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {assessment.consentFormSigned ? (
                      <span className="text-green-600">✓</span>
                    ) : (
                      <span className="text-gray-400">○</span>
                    )}
                    <span className="text-gray-700">Consent</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {assessment.fastingCompliant ? (
                      <span className="text-green-600">✓</span>
                    ) : (
                      <span className="text-gray-400">○</span>
                    )}
                    <span className="text-gray-700">Fasting</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {assessment.vitalSignsNormal ? (
                      <span className="text-green-600">✓</span>
                    ) : (
                      <span className="text-gray-400">○</span>
                    )}
                    <span className="text-gray-700">Vitals</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {assessment.allDocumentationComplete ? (
                      <span className="text-green-600">✓</span>
                    ) : (
                      <span className="text-gray-400">○</span>
                    )}
                    <span className="text-gray-700">Documents</span>
                  </div>
                </div>
              </div>

              {/* Action Status */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                {assessment.clearedForTheatre ? (
                  <div className="text-green-600 text-sm font-medium">
                    ✓ Cleared for Theatre
                  </div>
                ) : assessment.redAlertTriggered ? (
                  <div className="text-red-600 text-sm font-medium">
                    🚨 Red Alert Active ({assessment.redAlerts.length})
                  </div>
                ) : (
                  <div className="text-yellow-600 text-sm font-medium">
                    ⏳ Verification in Progress
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
