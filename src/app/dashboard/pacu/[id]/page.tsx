'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import { generatePatientDischargePDF } from '@/lib/pdfGenerator';

interface VitalSigns {
  id: string;
  recordedAt: string;
  systolicBP: number;
  diastolicBP: number;
  heartRate: number;
  respiratoryRate: number;
  oxygenSaturation: number;
  temperature: number;
  painScore: number;
  nauseaScore: number;
  recordedBy: string;
}

interface PACUAssessment {
  id: string;
  surgeryId: string;
  patientId: string;
  admissionTime: string;
  dischargeTime?: string;
  consciousnessLevel: string;
  airwayStatus: string;
  breathingSpontaneous: boolean;
  respiratoryEffort: string;
  oxygenSupport: boolean;
  oxygenLitersPerMinute?: number;
  
  // Aldrete Score Components
  aldreteActivity: number;
  aldreteRespiration: number;
  aldreteCirculation: number;
  aldreteConsciousness: number;
  aldreteOxygenSaturation: number;
  aldreteTotalScore: number;
  
  // Discharge Criteria
  dischargeReadiness: string;
  dischargeVitalsStable: boolean;
  dischargePainControlled: boolean;
  dischargeNauseaControlled: boolean;
  dischargeFullyConscious: boolean;
  dischargeAbleToMobilize: boolean;
  dischargeNoActiveBleedingOrOozing: boolean;
  
  // Red Alert
  redAlertTriggered: boolean;
  redAlertType?: string;
  redAlertDescription?: string;
  
  patient: {
    id: string;
    name: string;
    folderNumber: string;
    age: number;
    gender: string;
    ward: string;
  };
  
  surgery: {
    id: string;
    procedureName: string;
    scheduledDate: string;
    surgeon: { fullName: string };
    anesthetist?: { fullName: string };
  };
  
  vitalSigns: VitalSigns[];
  redAlerts: any[];
}

export default function PACUAssessmentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [assessment, setAssessment] = useState<PACUAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'vitals' | 'aldrete' | 'discharge'>('overview');
  
  // Vital Signs Form
  const [vitalForm, setVitalForm] = useState({
    systolicBP: '',
    diastolicBP: '',
    heartRate: '',
    respiratoryRate: '',
    oxygenSaturation: '',
    temperature: '',
    painScore: '',
    nauseaScore: ''
  });
  
  // Aldrete Score Form
  const [aldreteForm, setAldreteForm] = useState({
    activity: 0,
    respiration: 0,
    circulation: 0,
    consciousness: 0,
    oxygenSaturation: 0
  });
  
  // General Assessment Form
  const [generalForm, setGeneralForm] = useState({
    consciousnessLevel: '',
    airwayStatus: '',
    breathingSpontaneous: false,
    respiratoryEffort: '',
    oxygenSupport: false,
    oxygenLitersPerMinute: ''
  });
  
  // Discharge Form
  const [dischargeForm, setDischargeForm] = useState({
    vitalsStable: false,
    painControlled: false,
    nauseaControlled: false,
    fullyConscious: false,
    ableToMobilize: false,
    noActiveBleedingOrOozing: false,
    dischargedTo: '',
    dischargeInstructions: '',
    wardNurseHandover: ''
  });
  
  const [submitting, setSubmitting] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);

  useEffect(() => {
    fetchAssessment();
    // Auto-refresh every 30 seconds for vital signs
    const interval = setInterval(fetchAssessment, 30000);
    return () => clearInterval(interval);
  }, [params.id]);

  const fetchAssessment = async () => {
    try {
      const response = await fetch(`/api/pacu/${params.id}`);
      if (response.ok) {
        const data = await response.json();
        setAssessment(data);
        
        // Populate forms with current data
        setGeneralForm({
          consciousnessLevel: data.consciousnessLevel || '',
          airwayStatus: data.airwayStatus || '',
          breathingSpontaneous: data.breathingSpontaneous || false,
          respiratoryEffort: data.respiratoryEffort || '',
          oxygenSupport: data.oxygenSupport || false,
          oxygenLitersPerMinute: data.oxygenLitersPerMinute?.toString() || ''
        });
        
        setAldreteForm({
          activity: data.aldreteActivity || 0,
          respiration: data.aldreteRespiration || 0,
          circulation: data.aldreteCirculation || 0,
          consciousness: data.aldreteConsciousness || 0,
          oxygenSaturation: data.aldreteOxygenSaturation || 0
        });
        
        setDischargeForm({
          vitalsStable: data.dischargeVitalsStable || false,
          painControlled: data.dischargePainControlled || false,
          nauseaControlled: data.dischargeNauseaControlled || false,
          fullyConscious: data.dischargeFullyConscious || false,
          ableToMobilize: data.dischargeAbleToMobilize || false,
          noActiveBleedingOrOozing: data.dischargeNoActiveBleedingOrOozing || false,
          dischargedTo: '',
          dischargeInstructions: '',
          wardNurseHandover: ''
        });
      }
    } catch (error) {
      console.error('Error fetching assessment:', error);
    } finally {
      setLoading(false);
    }
  };

  const recordVitalSigns = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch(`/api/pacu/${params.id}/vitals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systolicBP: parseInt(vitalForm.systolicBP),
          diastolicBP: parseInt(vitalForm.diastolicBP),
          heartRate: parseInt(vitalForm.heartRate),
          respiratoryRate: parseInt(vitalForm.respiratoryRate),
          oxygenSaturation: parseInt(vitalForm.oxygenSaturation),
          temperature: parseFloat(vitalForm.temperature),
          painScore: parseInt(vitalForm.painScore),
          nauseaScore: parseInt(vitalForm.nauseaScore)
        })
      });

      if (response.ok) {
        // Clear form
        setVitalForm({
          systolicBP: '',
          diastolicBP: '',
          heartRate: '',
          respiratoryRate: '',
          oxygenSaturation: '',
          temperature: '',
          painScore: '',
          nauseaScore: ''
        });
        fetchAssessment();
        alert('Vital signs recorded successfully');
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to record vital signs');
      }
    } catch (error) {
      alert('Error recording vital signs');
    } finally {
      setSubmitting(false);
    }
  };

  const updateGeneralAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch(`/api/pacu/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consciousnessLevel: generalForm.consciousnessLevel,
          airwayStatus: generalForm.airwayStatus,
          breathingSpontaneous: generalForm.breathingSpontaneous,
          respiratoryEffort: generalForm.respiratoryEffort,
          oxygenSupport: generalForm.oxygenSupport,
          oxygenLitersPerMinute: generalForm.oxygenSupport ? parseInt(generalForm.oxygenLitersPerMinute) : null
        })
      });

      if (response.ok) {
        fetchAssessment();
        alert('Assessment updated successfully');
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to update assessment');
      }
    } catch (error) {
      alert('Error updating assessment');
    } finally {
      setSubmitting(false);
    }
  };

  const updateAldreteScore = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const totalScore = Object.values(aldreteForm).reduce((sum, val) => sum + val, 0);

    try {
      const response = await fetch(`/api/pacu/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aldreteActivity: aldreteForm.activity,
          aldreteRespiration: aldreteForm.respiration,
          aldreteCirculation: aldreteForm.circulation,
          aldreteConsciousness: aldreteForm.consciousness,
          aldreteOxygenSaturation: aldreteForm.oxygenSaturation,
          aldreteTotalScore: totalScore
        })
      });

      if (response.ok) {
        fetchAssessment();
        alert(`Aldrete Score updated: ${totalScore}/10`);
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to update Aldrete Score');
      }
    } catch (error) {
      alert('Error updating Aldrete Score');
    } finally {
      setSubmitting(false);
    }
  };

  const dischargePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!dischargeForm.vitalsStable || !dischargeForm.painControlled || !dischargeForm.nauseaControlled) {
      if (!confirm('Not all discharge criteria are met. Continue with discharge?')) {
        return;
      }
    }
    
    setSubmitting(true);

    try {
      const response = await fetch(`/api/pacu/${params.id}/discharge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dischargeVitalsStable: dischargeForm.vitalsStable,
          dischargePainControlled: dischargeForm.painControlled,
          dischargeNauseaControlled: dischargeForm.nauseaControlled,
          dischargeFullyConscious: dischargeForm.fullyConscious,
          dischargeAbleToMobilize: dischargeForm.ableToMobilize,
          dischargeNoActiveBleedingOrOozing: dischargeForm.noActiveBleedingOrOozing,
          dischargedTo: dischargeForm.dischargedTo,
          dischargeInstructions: dischargeForm.dischargeInstructions,
          wardNurseHandover: dischargeForm.wardNurseHandover
        })
      });

      if (response.ok) {
        alert('Patient discharged from PACU successfully');
        router.push('/dashboard/pacu');
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to discharge patient');
      }
    } catch (error) {
      alert('Error discharging patient');
    } finally {
      setSubmitting(false);
    }
  };

  const triggerRedAlert = async () => {
    const alertType = prompt('Enter alert type (e.g., RESPIRATORY_DISTRESS, HYPOTENSION, SEVERE_PAIN):');
    const description = prompt('Describe the complication:');
    
    if (!alertType || !description) return;
    
    try {
      const response = await fetch(`/api/pacu/${params.id}/alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alertType,
          description,
          severity: 'HIGH'
        })
      });

      if (response.ok) {
        fetchAssessment();
        alert('Red alert triggered! Notifications sent to medical team.');
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to trigger alert');
      }
    } catch (error) {
      alert('Error triggering alert');
    }
  };

  const exportDischargePDF = async () => {
    setGeneratingPDF(true);
    try {
      const response = await fetch(`/api/pacu/${params.id}/discharge-pdf`);
      if (response.ok) {
        const data = await response.json();
        const pdf = generatePatientDischargePDF(data);
        pdf.save(`Discharge_${assessment?.patient.folderNumber}_${new Date().toISOString().split('T')[0]}.pdf`);
      } else {
        alert('Failed to generate discharge document');
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF');
    } finally {
      setGeneratingPDF(false);
    }
  };

  if (loading || !assessment) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading assessment...</div>
      </div>
    );
  }

  const aldreteTotal = aldreteForm.activity + aldreteForm.respiration + aldreteForm.circulation + 
                       aldreteForm.consciousness + aldreteForm.oxygenSaturation;
  
  const latestVitals = assessment.vitalSigns[0];
  const timeInPACU = Math.floor((new Date().getTime() - new Date(assessment.admissionTime).getTime()) / 60000);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <button
            onClick={() => router.back()}
            className="text-primary-600 hover:text-primary-700 mb-2"
          >
            ← Back to PACU List
          </button>
          <h1 className="text-3xl font-bold text-gray-900">
            PACU Recovery Monitoring
          </h1>
          <p className="text-gray-600 mt-1">
            {assessment.patient.name} - {assessment.patient.folderNumber}
          </p>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={exportDischargePDF}
            disabled={generatingPDF}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 font-medium"
          >
            {generatingPDF ? (
              <>
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export Discharge PDF
              </>
            )}
          </button>
          
          <button
            onClick={() => window.print()}
            className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 flex items-center gap-2 font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print
          </button>
        </div>
      </div>

      {/* Patient Info */}
      <div className="bg-white border rounded-lg p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Procedure:</span>
            <p className="font-medium">{assessment.surgery.procedureName}</p>
          </div>
          <div>
            <span className="text-gray-600">Surgeon:</span>
            <p className="font-medium">{assessment.surgery.surgeon.fullName}</p>
          </div>
          <div>
            <span className="text-gray-600">Age/Gender:</span>
            <p className="font-medium">{assessment.patient.age}y / {assessment.patient.gender}</p>
          </div>
          <div>
            <span className="text-gray-600">Ward:</span>
            <p className="font-medium">{assessment.patient.ward}</p>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {assessment.redAlertTriggered && assessment.redAlerts.length > 0 && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
          <div className="flex items-start">
            <svg className="w-6 h-6 text-red-600 mr-3 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <h3 className="text-red-800 font-medium">Red Alert Active</h3>
              <p className="text-red-700 text-sm mt-1">{assessment.redAlertDescription}</p>
            </div>
          </div>
        </div>
      )}

      {/* Trigger Red Alert Button */}
      {/* TODO: Implement red alert functionality
      {!assessment.redAlertTriggered && (
        <div className="mb-6">
          <button
            onClick={handleTriggerRedAlert}
            className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 font-medium"
          >
            🚨 Trigger Red Alert
          </button>
        </div>
      )}
      */}

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-600 font-medium">Time in PACU</p>
          <p className="text-2xl font-bold text-blue-900">{Math.floor(timeInPACU / 60)}h {timeInPACU % 60}m</p>
        </div>
        
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-600 font-medium">Aldrete Score</p>
          <p className="text-2xl font-bold text-green-900">{assessment.aldreteTotalScore || 0}/10</p>
        </div>
        
        <div className={`border rounded-lg p-4 ${
          assessment.redAlertTriggered ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
        }`}>
          <p className={`text-sm font-medium ${
            assessment.redAlertTriggered ? 'text-red-600' : 'text-gray-600'
          }`}>
            Alert Status
          </p>
          <p className={`text-2xl font-bold ${
            assessment.redAlertTriggered ? 'text-red-900' : 'text-gray-900'
          }`}>
            {assessment.redAlertTriggered ? `🚨 Active (${assessment.redAlerts.length})` : '✓ Normal'}
          </p>
        </div>
        
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-600 font-medium">Discharge Readiness</p>
          <p className="text-lg font-bold text-yellow-900">
            {assessment.dischargeReadiness?.replace(/_/g, ' ') || 'Not Assessed'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex space-x-8">
          {(['overview', 'vitals', 'aldrete', 'discharge'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-4 px-2 font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Patient Information */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Patient Information</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Name:</span>
                <span className="font-medium">{assessment.patient.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Folder Number:</span>
                <span className="font-medium">{assessment.patient.folderNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Age/Gender:</span>
                <span className="font-medium">{assessment.patient.age}y / {assessment.patient.gender}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Ward:</span>
                <span className="font-medium">{assessment.patient.ward}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Procedure:</span>
                <span className="font-medium">{assessment.surgery.procedureName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Surgeon:</span>
                <span className="font-medium">{assessment.surgery.surgeon.fullName}</span>
              </div>
              {assessment.surgery.anesthetist && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Anesthetist:</span>
                  <span className="font-medium">{assessment.surgery.anesthetist.fullName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Admission Time:</span>
                <span className="font-medium">
                  {new Date(assessment.admissionTime).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* General Assessment Form */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">General Assessment</h2>
            <form onSubmit={updateGeneralAssessment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Consciousness Level *
                </label>
                <select
                  value={generalForm.consciousnessLevel}
                  onChange={(e) => setGeneralForm({...generalForm, consciousnessLevel: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  required
                >
                  <option value="">Select...</option>
                  <option value="FULLY_AWAKE">Fully Awake</option>
                  <option value="DROWSY_BUT_ROUSABLE">Drowsy but Rousable</option>
                  <option value="SEDATED">Sedated</option>
                  <option value="UNCONSCIOUS">Unconscious</option>
                  <option value="UNRESPONSIVE">Unresponsive</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Airway Status *
                </label>
                <select
                  value={generalForm.airwayStatus}
                  onChange={(e) => setGeneralForm({...generalForm, airwayStatus: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  required
                >
                  <option value="">Select...</option>
                  <option value="PATENT">Patent (Clear)</option>
                  <option value="MAINTAINED_WITH_ADJUNCT">Maintained with Adjunct</option>
                  <option value="COMPROMISED">Compromised</option>
                  <option value="OBSTRUCTED">Obstructed</option>
                </select>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={generalForm.breathingSpontaneous}
                  onChange={(e) => setGeneralForm({...generalForm, breathingSpontaneous: e.target.checked})}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <label className="ml-2 text-sm text-gray-700">
                  Breathing Spontaneously
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Respiratory Effort
                </label>
                <select
                  value={generalForm.respiratoryEffort}
                  onChange={(e) => setGeneralForm({...generalForm, respiratoryEffort: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Select...</option>
                  <option value="NORMAL">Normal</option>
                  <option value="LABORED">Labored</option>
                  <option value="SHALLOW">Shallow</option>
                  <option value="IRREGULAR">Irregular</option>
                </select>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={generalForm.oxygenSupport}
                  onChange={(e) => setGeneralForm({...generalForm, oxygenSupport: e.target.checked})}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <label className="ml-2 text-sm text-gray-700">
                  Oxygen Support Required
                </label>
              </div>

              {generalForm.oxygenSupport && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Oxygen Flow Rate (L/min)
                  </label>
                  <input
                    type="number"
                    value={generalForm.oxygenLitersPerMinute}
                    onChange={(e) => setGeneralForm({...generalForm, oxygenLitersPerMinute: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    min="0"
                    max="15"
                    step="0.5"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-primary-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-700 disabled:bg-gray-300 transition-colors"
              >
                {submitting ? 'Updating...' : 'Update Assessment'}
              </button>
            </form>
          </div>

          {/* Latest Vital Signs */}
          {latestVitals && (
            <div className="bg-white rounded-lg shadow-md p-6 lg:col-span-2">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Latest Vital Signs</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="border-l-4 border-blue-500 pl-3">
                  <p className="text-sm text-gray-600">Blood Pressure</p>
                  <p className="text-lg font-bold">{latestVitals.systolicBP}/{latestVitals.diastolicBP} mmHg</p>
                </div>
                <div className="border-l-4 border-red-500 pl-3">
                  <p className="text-sm text-gray-600">Heart Rate</p>
                  <p className="text-lg font-bold">{latestVitals.heartRate} bpm</p>
                </div>
                <div className="border-l-4 border-green-500 pl-3">
                  <p className="text-sm text-gray-600">SpO2</p>
                  <p className="text-lg font-bold">{latestVitals.oxygenSaturation}%</p>
                </div>
                <div className="border-l-4 border-yellow-500 pl-3">
                  <p className="text-sm text-gray-600">Temperature</p>
                  <p className="text-lg font-bold">{latestVitals.temperature}°C</p>
                </div>
                <div className="border-l-4 border-purple-500 pl-3">
                  <p className="text-sm text-gray-600">Resp. Rate</p>
                  <p className="text-lg font-bold">{latestVitals.respiratoryRate} /min</p>
                </div>
                <div className="border-l-4 border-orange-500 pl-3">
                  <p className="text-sm text-gray-600">Pain Score</p>
                  <p className="text-lg font-bold">{latestVitals.painScore}/10</p>
                </div>
                <div className="border-l-4 border-pink-500 pl-3">
                  <p className="text-sm text-gray-600">Nausea</p>
                  <p className="text-lg font-bold">{latestVitals.nauseaScore}/10</p>
                </div>
                <div className="pl-3">
                  <p className="text-sm text-gray-600">Recorded</p>
                  <p className="text-sm font-medium">
                    {new Date(latestVitals.recordedAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'vitals' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Record New Vital Signs */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Record Vital Signs</h2>
            <form onSubmit={recordVitalSigns} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Systolic BP *
                  </label>
                  <input
                    type="number"
                    value={vitalForm.systolicBP}
                    onChange={(e) => setVitalForm({...vitalForm, systolicBP: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="120"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Diastolic BP *
                  </label>
                  <input
                    type="number"
                    value={vitalForm.diastolicBP}
                    onChange={(e) => setVitalForm({...vitalForm, diastolicBP: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="80"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Heart Rate (bpm) *
                </label>
                <input
                  type="number"
                  value={vitalForm.heartRate}
                  onChange={(e) => setVitalForm({...vitalForm, heartRate: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="75"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Respiratory Rate (/min) *
                </label>
                <input
                  type="number"
                  value={vitalForm.respiratoryRate}
                  onChange={(e) => setVitalForm({...vitalForm, respiratoryRate: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="16"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Oxygen Saturation (%) *
                </label>
                <input
                  type="number"
                  value={vitalForm.oxygenSaturation}
                  onChange={(e) => setVitalForm({...vitalForm, oxygenSaturation: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="98"
                  min="0"
                  max="100"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Temperature (°C) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={vitalForm.temperature}
                  onChange={(e) => setVitalForm({...vitalForm, temperature: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="36.5"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pain Score (0-10) *
                </label>
                <input
                  type="number"
                  value={vitalForm.painScore}
                  onChange={(e) => setVitalForm({...vitalForm, painScore: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  min="0"
                  max="10"
                  placeholder="0"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">0 = No pain, 10 = Worst pain</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nausea Score (0-10) *
                </label>
                <input
                  type="number"
                  value={vitalForm.nauseaScore}
                  onChange={(e) => setVitalForm({...vitalForm, nauseaScore: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  min="0"
                  max="10"
                  placeholder="0"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">0 = No nausea, 10 = Severe nausea</p>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 transition-colors"
              >
                {submitting ? 'Recording...' : 'Record Vitals'}
              </button>
            </form>
          </div>

          {/* Vital Signs History */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Vital Signs History</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">BP</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">HR</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">RR</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">SpO2</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Temp</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Pain</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nausea</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {assessment.vitalSigns.map((vital) => (
                    <tr key={vital.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap text-sm">
                        {new Date(vital.recordedAt).toLocaleTimeString()}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm font-medium">
                        {vital.systolicBP}/{vital.diastolicBP}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm">{vital.heartRate}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm">{vital.respiratoryRate}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm">{vital.oxygenSaturation}%</td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm">{vital.temperature}°C</td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 rounded ${
                          vital.painScore > 7 ? 'bg-red-100 text-red-800' :
                          vital.painScore > 4 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {vital.painScore}/10
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 rounded ${
                          vital.nauseaScore > 7 ? 'bg-red-100 text-red-800' :
                          vital.nauseaScore > 4 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {vital.nauseaScore}/10
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {assessment.vitalSigns.length === 0 && (
                <p className="text-center text-gray-500 py-8">No vital signs recorded yet</p>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'aldrete' && (
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Aldrete Scoring System</h2>
              <p className="text-gray-600 mt-2">
                Modified Aldrete Score for Post-Anesthetic Recovery Assessment
              </p>
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-900">
                  <strong>Score ≥ 9:</strong> Patient is ready for discharge from PACU<br />
                  <strong>Score &lt; 9:</strong> Continued monitoring required
                </p>
              </div>
            </div>

            <form onSubmit={updateAldreteScore} className="space-y-6">
              {/* Activity */}
              <div className="border-b border-gray-200 pb-4">
                <h3 className="font-bold text-gray-900 mb-3">1. Activity (Motor Function)</h3>
                <div className="space-y-2">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="activity"
                      value="2"
                      checked={aldreteForm.activity === 2}
                      onChange={() => setAldreteForm({...aldreteForm, activity: 2})}
                      className="w-4 h-4 text-primary-600"
                    />
                    <span className="ml-3">
                      <strong>2 points:</strong> Moves all extremities voluntarily or on command
                    </span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="activity"
                      value="1"
                      checked={aldreteForm.activity === 1}
                      onChange={() => setAldreteForm({...aldreteForm, activity: 1})}
                      className="w-4 h-4 text-primary-600"
                    />
                    <span className="ml-3">
                      <strong>1 point:</strong> Moves 2 extremities voluntarily or on command
                    </span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="activity"
                      value="0"
                      checked={aldreteForm.activity === 0}
                      onChange={() => setAldreteForm({...aldreteForm, activity: 0})}
                      className="w-4 h-4 text-primary-600"
                    />
                    <span className="ml-3">
                      <strong>0 points:</strong> Unable to move extremities
                    </span>
                  </label>
                </div>
              </div>

              {/* Respiration */}
              <div className="border-b border-gray-200 pb-4">
                <h3 className="font-bold text-gray-900 mb-3">2. Respiration</h3>
                <div className="space-y-2">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="respiration"
                      value="2"
                      checked={aldreteForm.respiration === 2}
                      onChange={() => setAldreteForm({...aldreteForm, respiration: 2})}
                      className="w-4 h-4 text-primary-600"
                    />
                    <span className="ml-3">
                      <strong>2 points:</strong> Breathes deeply and coughs freely
                    </span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="respiration"
                      value="1"
                      checked={aldreteForm.respiration === 1}
                      onChange={() => setAldreteForm({...aldreteForm, respiration: 1})}
                      className="w-4 h-4 text-primary-600"
                    />
                    <span className="ml-3">
                      <strong>1 point:</strong> Dyspnea or limited breathing
                    </span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="respiration"
                      value="0"
                      checked={aldreteForm.respiration === 0}
                      onChange={() => setAldreteForm({...aldreteForm, respiration: 0})}
                      className="w-4 h-4 text-primary-600"
                    />
                    <span className="ml-3">
                      <strong>0 points:</strong> Apneic or on mechanical ventilation
                    </span>
                  </label>
                </div>
              </div>

              {/* Circulation */}
              <div className="border-b border-gray-200 pb-4">
                <h3 className="font-bold text-gray-900 mb-3">3. Circulation (Blood Pressure)</h3>
                <div className="space-y-2">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="circulation"
                      value="2"
                      checked={aldreteForm.circulation === 2}
                      onChange={() => setAldreteForm({...aldreteForm, circulation: 2})}
                      className="w-4 h-4 text-primary-600"
                    />
                    <span className="ml-3">
                      <strong>2 points:</strong> BP ± 20% of pre-anesthetic level
                    </span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="circulation"
                      value="1"
                      checked={aldreteForm.circulation === 1}
                      onChange={() => setAldreteForm({...aldreteForm, circulation: 1})}
                      className="w-4 h-4 text-primary-600"
                    />
                    <span className="ml-3">
                      <strong>1 point:</strong> BP ± 20-49% of pre-anesthetic level
                    </span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="circulation"
                      value="0"
                      checked={aldreteForm.circulation === 0}
                      onChange={() => setAldreteForm({...aldreteForm, circulation: 0})}
                      className="w-4 h-4 text-primary-600"
                    />
                    <span className="ml-3">
                      <strong>0 points:</strong> BP ± 50% or more of pre-anesthetic level
                    </span>
                  </label>
                </div>
              </div>

              {/* Consciousness */}
              <div className="border-b border-gray-200 pb-4">
                <h3 className="font-bold text-gray-900 mb-3">4. Consciousness</h3>
                <div className="space-y-2">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="consciousness"
                      value="2"
                      checked={aldreteForm.consciousness === 2}
                      onChange={() => setAldreteForm({...aldreteForm, consciousness: 2})}
                      className="w-4 h-4 text-primary-600"
                    />
                    <span className="ml-3">
                      <strong>2 points:</strong> Fully awake and oriented
                    </span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="consciousness"
                      value="1"
                      checked={aldreteForm.consciousness === 1}
                      onChange={() => setAldreteForm({...aldreteForm, consciousness: 1})}
                      className="w-4 h-4 text-primary-600"
                    />
                    <span className="ml-3">
                      <strong>1 point:</strong> Arousable on calling
                    </span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="consciousness"
                      value="0"
                      checked={aldreteForm.consciousness === 0}
                      onChange={() => setAldreteForm({...aldreteForm, consciousness: 0})}
                      className="w-4 h-4 text-primary-600"
                    />
                    <span className="ml-3">
                      <strong>0 points:</strong> Not responding
                    </span>
                  </label>
                </div>
              </div>

              {/* Oxygen Saturation */}
              <div className="pb-4">
                <h3 className="font-bold text-gray-900 mb-3">5. Oxygen Saturation (SpO2)</h3>
                <div className="space-y-2">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="oxygenSaturation"
                      value="2"
                      checked={aldreteForm.oxygenSaturation === 2}
                      onChange={() => setAldreteForm({...aldreteForm, oxygenSaturation: 2})}
                      className="w-4 h-4 text-primary-600"
                    />
                    <span className="ml-3">
                      <strong>2 points:</strong> SpO2 &gt; 92% on room air
                    </span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="oxygenSaturation"
                      value="1"
                      checked={aldreteForm.oxygenSaturation === 1}
                      onChange={() => setAldreteForm({...aldreteForm, oxygenSaturation: 1})}
                      className="w-4 h-4 text-primary-600"
                    />
                    <span className="ml-3">
                      <strong>1 point:</strong> Needs O2 to maintain SpO2 &gt; 90%
                    </span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="oxygenSaturation"
                      value="0"
                      checked={aldreteForm.oxygenSaturation === 0}
                      onChange={() => setAldreteForm({...aldreteForm, oxygenSaturation: 0})}
                      className="w-4 h-4 text-primary-600"
                    />
                    <span className="ml-3">
                      <strong>0 points:</strong> SpO2 &lt; 90% even with O2
                    </span>
                  </label>
                </div>
              </div>

              {/* Total Score Display */}
              <div className={`p-6 rounded-lg border-2 ${
                aldreteTotal >= 9 ? 'bg-green-50 border-green-500' : 'bg-yellow-50 border-yellow-500'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Total Aldrete Score</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {aldreteTotal >= 9 
                        ? '✓ Patient meets discharge criteria' 
                        : '⚠ Continued monitoring required'}
                    </p>
                  </div>
                  <div className={`text-5xl font-bold ${
                    aldreteTotal >= 9 ? 'text-green-600' : 'text-yellow-600'
                  }`}>
                    {aldreteTotal}/10
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-primary-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-primary-700 disabled:bg-gray-300 transition-colors"
              >
                {submitting ? 'Updating Score...' : 'Save Aldrete Score'}
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'discharge' && (
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Discharge from PACU</h2>
            
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h3 className="font-bold text-yellow-900 mb-2">Discharge Criteria</h3>
              <p className="text-sm text-yellow-800">
                Ensure all criteria are met before discharging patient to ward. Aldrete Score should be ≥ 9.
              </p>
            </div>

            <form onSubmit={dischargePatient} className="space-y-6">
              {/* Discharge Checklist */}
              <div className="space-y-3">
                <h3 className="font-bold text-gray-900">Discharge Checklist</h3>
                
                <label className="flex items-center cursor-pointer p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={dischargeForm.vitalsStable}
                    onChange={(e) => setDischargeForm({...dischargeForm, vitalsStable: e.target.checked})}
                    className="w-5 h-5 text-primary-600"
                  />
                  <span className="ml-3 text-sm font-medium">
                    Vital signs stable for at least 30 minutes
                  </span>
                </label>

                <label className="flex items-center cursor-pointer p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={dischargeForm.painControlled}
                    onChange={(e) => setDischargeForm({...dischargeForm, painControlled: e.target.checked})}
                    className="w-5 h-5 text-primary-600"
                  />
                  <span className="ml-3 text-sm font-medium">
                    Pain adequately controlled (score ≤ 4)
                  </span>
                </label>

                <label className="flex items-center cursor-pointer p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={dischargeForm.nauseaControlled}
                    onChange={(e) => setDischargeForm({...dischargeForm, nauseaControlled: e.target.checked})}
                    className="w-5 h-5 text-primary-600"
                  />
                  <span className="ml-3 text-sm font-medium">
                    Nausea/vomiting controlled
                  </span>
                </label>

                <label className="flex items-center cursor-pointer p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={dischargeForm.fullyConscious}
                    onChange={(e) => setDischargeForm({...dischargeForm, fullyConscious: e.target.checked})}
                    className="w-5 h-5 text-primary-600"
                  />
                  <span className="ml-3 text-sm font-medium">
                    Patient fully conscious and oriented
                  </span>
                </label>

                <label className="flex items-center cursor-pointer p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={dischargeForm.ableToMobilize}
                    onChange={(e) => setDischargeForm({...dischargeForm, ableToMobilize: e.target.checked})}
                    className="w-5 h-5 text-primary-600"
                  />
                  <span className="ml-3 text-sm font-medium">
                    Able to mobilize (or baseline mobility restored)
                  </span>
                </label>

                <label className="flex items-center cursor-pointer p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={dischargeForm.noActiveBleedingOrOozing}
                    onChange={(e) => setDischargeForm({...dischargeForm, noActiveBleedingOrOozing: e.target.checked})}
                    className="w-5 h-5 text-primary-600"
                  />
                  <span className="ml-3 text-sm font-medium">
                    No active bleeding or excessive oozing from surgical site
                  </span>
                </label>
              </div>

              {/* Discharge Details */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Discharge Destination *
                </label>
                <select
                  value={dischargeForm.dischargedTo}
                  onChange={(e) => setDischargeForm({...dischargeForm, dischargedTo: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  required
                >
                  <option value="">Select...</option>
                  <option value="WARD">General Ward</option>
                  <option value="ICU">Intensive Care Unit</option>
                  <option value="HDU">High Dependency Unit</option>
                  <option value="HOME">Home (Day Case)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Discharge Instructions
                </label>
                <textarea
                  value={dischargeForm.dischargeInstructions}
                  onChange={(e) => setDischargeForm({...dischargeForm, dischargeInstructions: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  rows={4}
                  placeholder="Post-operative care instructions, medications, follow-up..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ward Nurse Handover Notes
                </label>
                <textarea
                  value={dischargeForm.wardNurseHandover}
                  onChange={(e) => setDischargeForm({...dischargeForm, wardNurseHandover: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  rows={3}
                  placeholder="Special observations, concerns, care requirements..."
                />
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={submitting || !dischargeForm.dischargedTo}
                  className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 transition-colors"
                >
                  {submitting ? 'Processing Discharge...' : 'Discharge Patient'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('overview')}
                  className="px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
