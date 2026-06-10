'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
const SmartTextInput = dynamic(() => import('@/components/SmartTextInput'), { ssr: false });

interface Assessment {
  id: string;
  surgeryId: string;
  status: string;
  patient: {
    name: string;
    folderNumber: string;
    age: number;
    gender: string;
    ward: string;
  };
  surgery: {
    procedureName: string;
    scheduledDate: string;
    scheduledTime: string;
    surgeon: { id: string; fullName: string; email: string };
    anesthetist?: { id: string; fullName: string; email: string };
  };
  // Identity Verification
  patientIdentityConfirmed: boolean;
  identityVerificationMethod?: string;
  identityNotes?: string;
  // Surgical Site
  surgicalSiteMarked: boolean;
  surgicalSiteConfirmed: boolean;
  procedureConfirmed: boolean;
  lateralityConfirmed?: boolean;
  siteVerificationNotes?: string;
  // Consent
  consentFormPresent: boolean;
  consentFormSigned: boolean;
  consentUnderstandingConfirmed: boolean;
  consentNotes?: string;
  // Allergy
  allergyStatusChecked: boolean;
  hasAllergies: boolean;
  allergyDetails?: string;
  allergyBandPresent?: boolean;
  // Fasting
  fastingStatusChecked: boolean;
  fastingCompliant: boolean;
  lastOralIntakeTime?: string;
  lastOralIntakeType?: string;
  fastingNotes?: string;
  // Vital Signs
  temperature?: number;
  heartRate?: number;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  respiratoryRate?: number;
  oxygenSaturation?: number;
  bloodGlucose?: number;
  vitalSignsNormal: boolean;
  vitalSignsConcerns?: string;
  // Documentation
  preOpAssessmentPresent: boolean;
  labResultsPresent: boolean;
  imagingPresent?: boolean;
  ecgPresent?: boolean;
  crossMatchPresent?: boolean;
  anesthesiaAssessmentPresent: boolean;
  medicationChartPresent: boolean;
  allDocumentationComplete: boolean;
  missingDocumentation?: string;
  // Pre-meds
  preMedicationGiven: boolean;
  preMedicationDetails?: string;
  ivAccessEstablished: boolean;
  ivSiteLocation?: string;
  // Status
  discrepancyDetected: boolean;
  redAlertTriggered: boolean;
  clearedForTheatre: boolean;
  transferredToTheatre?: boolean;
  redAlerts: any[];
}

export default function HoldingAreaAssessmentPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAlertDialog, setShowAlertDialog] = useState(false);
  const [alertType, setAlertType] = useState('');
  const [alertDescription, setAlertDescription] = useState('');
  const [consentFileAvailable, setConsentFileAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    fetchAssessment();
    // Re-fetch only when route id changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    if (!assessment?.surgeryId) return;
    let cancelled = false;
    fetch(`/api/surgeries/${assessment.surgeryId}/consent`, { method: 'HEAD' })
      .then((r) => { if (!cancelled) setConsentFileAvailable(r.ok); })
      .catch(() => { if (!cancelled) setConsentFileAvailable(false); });
    return () => { cancelled = true; };
  }, [assessment?.surgeryId]);

  const fetchAssessment = async () => {
    try {
      const response = await fetch(`/api/holding-area/${params.id}`);
      if (response.ok) {
        const data = await response.json();
        setAssessment(data);
      }
    } catch (error) {
      console.error('Error fetching assessment:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateAssessment = async (updates: Partial<Assessment>) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/holding-area/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (response.ok) {
        const data = await response.json();
        setAssessment(data);
      }
    } catch (error) {
      console.error('Error updating assessment:', error);
      alert('Failed to update assessment');
    } finally {
      setSaving(false);
    }
  };

  const triggerRedAlert = async () => {
    if (!alertType || !alertDescription) {
      alert('Please select alert type and provide description');
      return;
    }

    try {
      const response = await fetch(`/api/holding-area/${params.id}/alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alertType,
          description: alertDescription,
          severity: 'HIGH'
        })
      });
      
      if (response.ok) {
        alert('Red alert triggered successfully!');
        setShowAlertDialog(false);
        setAlertType('');
        setAlertDescription('');
        fetchAssessment();
      }
    } catch (error) {
      console.error('Error triggering alert:', error);
      alert('Failed to trigger red alert');
    }
  };

  const clearForTheatre = async () => {
    if (!confirm('Clear this patient for theatre? All safety checks must be complete.')) {
      return;
    }

    try {
      const response = await fetch(`/api/holding-area/${params.id}/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clearanceNotes: 'All safety checks complete'
        })
      });
      
      if (response.ok) {
        alert('Patient cleared for theatre!');
        fetchAssessment();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to clear patient');
      }
    } catch (error) {
      console.error('Error clearing patient:', error);
      alert('Failed to clear patient');
    }
  };

  const transferToOperatingTheatre = async () => {
    if (!confirm('Transfer this patient from holding area to operating theatre now?')) {
      return;
    }

    try {
      const response = await fetch(`/api/holding-area/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transferredToTheatre: true,
        })
      });

      if (response.ok) {
        alert('Patient transferred to operating theatre successfully.');
        fetchAssessment();
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to transfer patient to operating theatre');
      }
    } catch (error) {
      console.error('Error transferring patient:', error);
      alert('Failed to transfer patient');
    }
  };

  const returnToWardIfCancelled = async () => {
    const reason = prompt('Enter cancellation reason to return patient to ward:');
    if (!reason || reason.trim().length < 5) {
      alert('Cancellation reason (minimum 5 characters) is required.');
      return;
    }

    try {
      const response = await fetch(`/api/holding-area/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          returnToWardCancelled: true,
          cancellationReason: reason.trim(),
        })
      });

      if (response.ok) {
        alert('Case cancelled and patient returned to ward.');
        router.push('/dashboard/holding-area');
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to return patient to ward');
      }
    } catch (error) {
      console.error('Error returning patient to ward:', error);
      alert('Failed to process cancellation');
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>;
  }

  if (!assessment) {
    return <div className="flex justify-center items-center min-h-screen">Assessment not found</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.back()}
          className="text-blue-600 hover:text-blue-800 mb-4"
        >
          ← Back to Holding Area
        </button>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Holding Area Assessment
            </h1>
            <p className="text-gray-600">
              {assessment.patient?.name || 'Unknown Patient'} • {assessment.patient?.folderNumber || 'N/A'}
            </p>
          </div>
          <div className="flex gap-2">
            {!assessment.clearedForTheatre && !assessment.redAlertTriggered && (
              <>
                <button
                  onClick={() => setShowAlertDialog(true)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  🚨 Trigger Red Alert
                </button>
                <button
                  onClick={clearForTheatre}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  ✓ Clear for Theatre
                </button>
              </>
            )}
            {assessment.clearedForTheatre && !assessment.transferredToTheatre && (
              <button
                onClick={transferToOperatingTheatre}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Transfer to Operating Theatre
              </button>
            )}
            {!assessment.transferredToTheatre && (
              <button
                onClick={returnToWardIfCancelled}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
              >
                Return to Ward (Cancel Case)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Patient & Surgery Info */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Patient Information</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-600">Age</p>
            <p className="font-medium">{assessment.patient.age} years</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Gender</p>
            <p className="font-medium">{assessment.patient.gender}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Ward</p>
            <p className="font-medium">{assessment.patient.ward}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Procedure</p>
            <p className="font-medium">{assessment.surgery.procedureName}</p>
          </div>
        </div>
      </div>

      {/* Safety Verification Checklist */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Safety Verification Checklist</h2>
        
        {/* Identity Verification */}
        <div className="mb-6">
          <h3 className="font-semibold text-lg mb-3">1. Patient Identity Verification</h3>
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={assessment.patientIdentityConfirmed}
                onChange={(e) => updateAssessment({ patientIdentityConfirmed: e.target.checked })}
                className="w-5 h-5"
              />
              <span>Patient identity confirmed</span>
            </label>
            <input
              type="text"
              placeholder="Verification method (ID Band, Photo ID, etc.)"
              value={assessment.identityVerificationMethod || ''}
              onChange={(e) => updateAssessment({ identityVerificationMethod: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        {/* Surgical Site Verification */}
        <div className="mb-6">
          <h3 className="font-semibold text-lg mb-3">2. Surgical Site & Procedure Verification</h3>
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={assessment.surgicalSiteMarked}
                onChange={(e) => updateAssessment({ surgicalSiteMarked: e.target.checked })}
                className="w-5 h-5"
              />
              <span>Surgical site marked</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={assessment.surgicalSiteConfirmed}
                onChange={(e) => updateAssessment({ surgicalSiteConfirmed: e.target.checked })}
                className="w-5 h-5"
              />
              <span>Surgical site confirmed</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={assessment.procedureConfirmed}
                onChange={(e) => updateAssessment({ procedureConfirmed: e.target.checked })}
                className="w-5 h-5"
              />
              <span>Procedure confirmed</span>
            </label>
          </div>
        </div>

        {/* Consent */}
        <div className="mb-6">
          <h3 className="font-semibold text-lg mb-3">3. Consent Validation</h3>

          {/* Uploaded consent file (from booking form) */}
          <div className="mb-4 p-3 border border-blue-200 bg-blue-50 rounded">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">Uploaded Informed Consent Document</span>
              {consentFileAvailable && (
                <a
                  href={`/api/surgeries/${assessment.surgeryId}/consent`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-700 underline text-xs"
                >
                  Open in new tab
                </a>
              )}
            </div>
            {consentFileAvailable === null && (
              <p className="text-xs text-gray-500 mt-2">Checking for uploaded consent…</p>
            )}
            {consentFileAvailable === true && (
              <iframe
                src={`/api/surgeries/${assessment.surgeryId}/consent`}
                title="Informed consent document"
                className="w-full h-64 mt-2 border rounded bg-white"
              />
            )}
            {consentFileAvailable === false && (
              <p className="text-xs text-amber-700 mt-2">
                No consent file has been uploaded for this surgery yet. The surgeon can upload it from the booking form.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={assessment.consentFormPresent}
                onChange={(e) => updateAssessment({ consentFormPresent: e.target.checked })}
                className="w-5 h-5"
              />
              <span>Consent form present</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={assessment.consentFormSigned}
                onChange={(e) => updateAssessment({ consentFormSigned: e.target.checked })}
                className="w-5 h-5"
              />
              <span>Consent form signed</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={assessment.consentUnderstandingConfirmed}
                onChange={(e) => updateAssessment({ consentUnderstandingConfirmed: e.target.checked })}
                className="w-5 h-5"
              />
              <span>Patient understanding confirmed</span>
            </label>
          </div>
        </div>

        {/* Allergy Status */}
        <div className="mb-6">
          <h3 className="font-semibold text-lg mb-3">4. Allergy Status</h3>
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={assessment.allergyStatusChecked}
                onChange={(e) => updateAssessment({ allergyStatusChecked: e.target.checked })}
                className="w-5 h-5"
              />
              <span>Allergy status checked</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={assessment.hasAllergies}
                onChange={(e) => updateAssessment({ hasAllergies: e.target.checked })}
                className="w-5 h-5"
              />
              <span>Patient has known allergies</span>
            </label>
            {assessment.hasAllergies && (
              <SmartTextInput
                placeholder="List allergies... 🎤 Dictate or 📷 capture"
                value={assessment.allergyDetails || ''}
                onChange={(val) => updateAssessment({ allergyDetails: val })}
                rows={2}
                enableSpeech={true}
                enableOCR={true}
                medicalMode={true}
              />
            )}
          </div>
        </div>

        {/* Fasting Status */}
        <div className="mb-6">
          <h3 className="font-semibold text-lg mb-3">5. Fasting Status</h3>
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={assessment.fastingStatusChecked}
                onChange={(e) => updateAssessment({ fastingStatusChecked: e.target.checked })}
                className="w-5 h-5"
              />
              <span>Fasting status checked</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={assessment.fastingCompliant}
                onChange={(e) => updateAssessment({ fastingCompliant: e.target.checked })}
                className="w-5 h-5"
              />
              <span>Fasting compliant (NPO)</span>
            </label>
          </div>
        </div>

        {/* Vital Signs */}
        <div className="mb-6">
          <h3 className="font-semibold text-lg mb-3">6. Vital Signs</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
            <div>
              <label htmlFor="vs-temperature" className="block text-sm text-gray-600 mb-1">Temperature (°C)</label>
              <input
                id="vs-temperature"
                type="number"
                step="0.1"
                placeholder="e.g. 36.8"
                value={assessment.temperature || ''}
                onChange={(e) => updateAssessment({ temperature: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="vs-heart-rate" className="block text-sm text-gray-600 mb-1">Heart Rate (bpm)</label>
              <input
                id="vs-heart-rate"
                type="number"
                placeholder="e.g. 78"
                value={assessment.heartRate || ''}
                onChange={(e) => updateAssessment({ heartRate: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="vs-bp-systolic" className="block text-sm text-gray-600 mb-1">BP Systolic</label>
              <input
                id="vs-bp-systolic"
                type="number"
                placeholder="mmHg"
                value={assessment.bloodPressureSystolic || ''}
                onChange={(e) => updateAssessment({ bloodPressureSystolic: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="vs-bp-diastolic" className="block text-sm text-gray-600 mb-1">BP Diastolic</label>
              <input
                id="vs-bp-diastolic"
                type="number"
                placeholder="mmHg"
                value={assessment.bloodPressureDiastolic || ''}
                onChange={(e) => updateAssessment({ bloodPressureDiastolic: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="vs-respiratory-rate" className="block text-sm text-gray-600 mb-1">Respiratory Rate</label>
              <input
                id="vs-respiratory-rate"
                type="number"
                placeholder="breaths/min"
                value={assessment.respiratoryRate || ''}
                onChange={(e) => updateAssessment({ respiratoryRate: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="vs-spo2" className="block text-sm text-gray-600 mb-1">SpO2 (%)</label>
              <input
                id="vs-spo2"
                type="number"
                placeholder="%"
                value={assessment.oxygenSaturation || ''}
                onChange={(e) => updateAssessment({ oxygenSaturation: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={assessment.vitalSignsNormal}
              onChange={(e) => updateAssessment({ vitalSignsNormal: e.target.checked })}
              className="w-5 h-5"
            />
            <span>Vital signs within normal limits</span>
          </label>
        </div>

        {/* Documentation */}
        <div className="mb-6">
          <h3 className="font-semibold text-lg mb-3">7. Documentation Completeness</h3>
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={assessment.preOpAssessmentPresent}
                onChange={(e) => updateAssessment({ preOpAssessmentPresent: e.target.checked })}
                className="w-5 h-5"
              />
              <span>Pre-operative assessment</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={assessment.labResultsPresent}
                onChange={(e) => updateAssessment({ labResultsPresent: e.target.checked })}
                className="w-5 h-5"
              />
              <span>Lab results</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={assessment.anesthesiaAssessmentPresent}
                onChange={(e) => updateAssessment({ anesthesiaAssessmentPresent: e.target.checked })}
                className="w-5 h-5"
              />
              <span>Anesthesia assessment</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={assessment.medicationChartPresent}
                onChange={(e) => updateAssessment({ medicationChartPresent: e.target.checked })}
                className="w-5 h-5"
              />
              <span>Medication chart</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={assessment.allDocumentationComplete}
                onChange={(e) => updateAssessment({ allDocumentationComplete: e.target.checked })}
                className="w-5 h-5"
              />
              <span className="font-semibold">All documentation complete</span>
            </label>
          </div>
        </div>

        {/* IV Access */}
        <div className="mb-6">
          <h3 className="font-semibold text-lg mb-3">8. IV Access & Pre-medications</h3>
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={assessment.ivAccessEstablished}
                onChange={(e) => updateAssessment({ ivAccessEstablished: e.target.checked })}
                className="w-5 h-5"
              />
              <span>IV access established</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={assessment.preMedicationGiven}
                onChange={(e) => updateAssessment({ preMedicationGiven: e.target.checked })}
                className="w-5 h-5"
              />
              <span>Pre-medication given</span>
            </label>
          </div>
        </div>
      </div>

      {/* Red Alerts */}
      {assessment.redAlerts && assessment.redAlerts.length > 0 && (
        <div className="bg-red-50 border-2 border-red-600 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-red-900 mb-4">🚨 Active Red Alerts</h2>
          {assessment.redAlerts.map((alert: any) => (
            <div key={alert.id} className="bg-white rounded p-4 mb-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold">{alert.alertType}</p>
                  <p className="text-sm text-gray-700">{alert.description}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(alert.triggeredAt).toLocaleString()}
                  </p>
                </div>
                <span className="px-2 py-1 bg-red-600 text-white text-xs rounded">
                  {alert.severity}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Red Alert Dialog */}
      {showAlertDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">Trigger Red Alert</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="alert-type" className="block text-sm font-medium mb-2">Alert Type</label>
                <select
                  id="alert-type"
                  aria-label="Alert type"
                  value={alertType}
                  onChange={(e) => setAlertType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">Select type...</option>
                  <option value="IDENTITY_MISMATCH">Identity Mismatch</option>
                  <option value="WRONG_SITE">Wrong Site</option>
                  <option value="CONSENT_ISSUE">Consent Issue</option>
                  <option value="ALLERGY_CONCERN">Allergy Concern</option>
                  <option value="FASTING_VIOLATION">Fasting Violation</option>
                  <option value="ABNORMAL_VITALS">Abnormal Vitals</option>
                  <option value="MISSING_RESULTS">Missing Results</option>
                </select>
              </div>
              <SmartTextInput
                label="Description"
                value={alertDescription}
                onChange={setAlertDescription}
                rows={4}
                placeholder="Describe the issue... 🎤 Dictate or 📷 capture"
                enableSpeech={true}
                enableOCR={true}
                medicalMode={true}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowAlertDialog(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={triggerRedAlert}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Trigger Alert
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {saving && (
        <div className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg">
          Saving...
        </div>
      )}
    </div>
  );
}
