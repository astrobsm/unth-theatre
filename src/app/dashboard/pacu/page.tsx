'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface PACUAssessment {
  id: string;
  surgeryId: string;
  admissionTime: string;
  dischargeReadiness: string;
  consciousnessLevel: string;
  airwayStatus: string;
  patient: {
    id: string;
    folderNumber: string;
    name: string;
    age: number;
    gender: string;
    ward: string;
  };
  surgery: {
    id: string;
    procedureName: string;
    surgeon: { name: string };
    anesthetist?: { name: string };
  };
  vitalSigns: any[];
  redAlerts: any[];
  redAlertTriggered: boolean;
  dischargeVitalsStable: boolean;
  dischargePainControlled: boolean;
  dischargeFullyConscious: boolean;
}

export default function PACUPage() {
  const router = useRouter();
  const [assessments, setAssessments] = useState<PACUAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active'>('active');

  useEffect(() => {
    fetchAssessments();
  }, [filter]);

  const fetchAssessments = async () => {
    try {
      const url = filter === 'active' 
        ? '/api/pacu?active=true'
        : '/api/pacu';
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setAssessments(data);
      }
    } catch (error) {
      console.error('Error fetching PACU assessments:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDischargeReadinessColor = (readiness: string) => {
    switch (readiness) {
      case 'NOT_READY':
        return 'bg-red-100 text-red-800';
      case 'READY_WITH_CONCERNS':
        return 'bg-yellow-100 text-yellow-800';
      case 'READY_FOR_WARD':
        return 'bg-green-100 text-green-800';
      case 'DISCHARGED_TO_WARD':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getConsciousnessColor = (level: string) => {
    switch (level) {
      case 'FULLY_AWAKE':
        return 'text-green-600';
      case 'DROWSY_BUT_ROUSABLE':
        return 'text-yellow-600';
      case 'SEDATED':
        return 'text-orange-600';
      case 'UNCONSCIOUS':
      case 'UNRESPONSIVE':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const formatTime = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMinutes = Math.floor((now.getTime() - time.getTime()) / 60000);
    
    if (diffMinutes < 60) {
      return `${diffMinutes} min ago`;
    } else {
      const hours = Math.floor(diffMinutes / 60);
      return `${hours}h ${diffMinutes % 60}m ago`;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading PACU patients...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Post-Operative Recovery (PACU)
        </h1>
        <p className="text-gray-600">
          Recovery room monitoring and discharge management
        </p>
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
        <button
          onClick={() => router.push('/dashboard/pacu/new')}
          className="ml-auto px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
        >
          + Admit Patient to PACU
        </button>
      </div>

      {/* Assessments Grid */}
      {assessments.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500 text-lg">No patients in PACU</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {assessments.map((assessment) => (
            <div
              key={assessment.id}
              className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => router.push(`/dashboard/pacu/${assessment.id}`)}
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

              {/* Discharge Readiness */}
              <div className="mb-4">
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getDischargeReadinessColor(assessment.dischargeReadiness)}`}>
                  {assessment.dischargeReadiness.replace(/_/g, ' ')}
                </span>
              </div>

              {/* Surgery Details */}
              <div className="mb-4 text-sm">
                <p className="font-medium text-gray-900">{assessment.surgery.procedureName}</p>
                <p className="text-gray-600">Surgeon: {assessment.surgery.surgeon.name}</p>
                {assessment.surgery.anesthetist && (
                  <p className="text-gray-600">Anesthetist: {assessment.surgery.anesthetist.name}</p>
                )}
              </div>

              {/* Time in PACU */}
              <div className="mb-4 text-sm">
                <p className="text-gray-600">
                  <span className="font-medium">Time in PACU:</span> {formatTime(assessment.admissionTime)}
                </p>
              </div>

              {/* Clinical Status */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Consciousness:</span>
                  <span className={`font-medium ${getConsciousnessColor(assessment.consciousnessLevel)}`}>
                    {assessment.consciousnessLevel.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Airway:</span>
                  <span className="font-medium text-gray-900">
                    {assessment.airwayStatus.replace(/_/g, ' ')}
                  </span>
                </div>
                {assessment.vitalSigns && assessment.vitalSigns.length > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Latest Vitals:</span>
                    <span className="font-medium text-gray-900">
                      {formatTime(assessment.vitalSigns[0].recordedAt)}
                    </span>
                  </div>
                )}
              </div>

              {/* Discharge Criteria */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs font-medium text-gray-700 mb-2">Discharge Criteria:</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1">
                    {assessment.dischargeVitalsStable ? (
                      <span className="text-green-600">✓</span>
                    ) : (
                      <span className="text-gray-400">○</span>
                    )}
                    <span className="text-gray-700">Vitals Stable</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {assessment.dischargePainControlled ? (
                      <span className="text-green-600">✓</span>
                    ) : (
                      <span className="text-gray-400">○</span>
                    )}
                    <span className="text-gray-700">Pain Controlled</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {assessment.dischargeFullyConscious ? (
                      <span className="text-green-600">✓</span>
                    ) : (
                      <span className="text-gray-400">○</span>
                    )}
                    <span className="text-gray-700">Fully Conscious</span>
                  </div>
                </div>
              </div>

              {/* Red Alerts */}
              {assessment.redAlerts && assessment.redAlerts.length > 0 && (
                <div className="mt-3 text-red-600 text-sm font-medium">
                  🚨 {assessment.redAlerts.length} Active Alert(s)
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
