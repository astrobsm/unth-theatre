'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface Surgery {
  id: string;
  procedureName: string;
  scheduledDate: string;
  pacuAssessment?: { id: string } | null;
  patient: {
    id: string;
    name: string;
    folderNumber: string;
    age: number;
    gender: string;
  };
}

export default function NewPACUAssessment() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [surgeries, setSurgeries] = useState<Surgery[]>([]);
  const [selectedSurgeryId, setSelectedSurgeryId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  // Form fields
  const [formData, setFormData] = useState({
    consciousnessLevel: 'DROWSY_BUT_ROUSABLE',
    airwayStatus: 'PATENT',
    handoverFrom: '',
    breathingPattern: 'Spontaneous',
    oxygenTherapy: false,
    oxygenFlowRate: '',
    heartRateOnAdmission: '',
    bloodPressureOnAdmission: '',
    painScoreOnAdmission: '',
    temperatureOnAdmission: '',
    surgicalSiteCondition: 'Clean and dry',
    dressingIntact: true,
    drainsPresent: false,
    ivFluidsRunning: false,
    catheterInSitu: false,
    nauseaPresent: false,
    vomitingOccurred: false
  });

  // Intra-operative handover summary — auto-filled from the selected surgery,
  // editable by the recovery nurse before admission.
  const [intraOp, setIntraOp] = useState({
    diagnosis: '',
    procedureDone: '',
    scrubNurse: '',
    anaesthetist: '',
    anaesthesiaType: '',
    knifeOnSkin: '',
    endOfSurgery: '',
    estimatedBloodLoss: '',
    patientAge: '',
    patientGender: '',
    specialConditions: '',
  });
  const [scrubNurses, setScrubNurses] = useState<{ id: string; fullName: string }[]>([]);

  // Convert an ISO timestamp to the value a <input type="datetime-local"> expects.
  const toLocalInput = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
  };

  useEffect(() => {
    fetchCompletedSurgeries();
    const presetSurgeryId = searchParams.get('surgeryId');
    if (presetSurgeryId) {
      setSelectedSurgeryId(presetSurgeryId);
    }
  }, [searchParams]);

  // Load approved scrub nurses for the handover dropdown.
  useEffect(() => {
    fetch('/api/users?role=SCRUB_NURSE&status=APPROVED')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setScrubNurses(Array.isArray(data) ? data.map((u: any) => ({ id: u.id, fullName: u.fullName })) : []))
      .catch(() => {});
  }, []);

  // Auto-fill the intra-operative summary from the selected surgery's record.
  useEffect(() => {
    if (!selectedSurgeryId) return;
    let cancelled = false;
    fetch(`/api/surgeries/${selectedSurgeryId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (cancelled || !s) return;
        setIntraOp((prev) => ({
          ...prev,
          diagnosis: s.indication || prev.diagnosis,
          procedureDone: s.procedureName || prev.procedureDone,
          anaesthetist: s.anesthetist?.fullName || prev.anaesthetist,
          anaesthesiaType: s.anesthesiaType || prev.anaesthesiaType,
          knifeOnSkin: toLocalInput(s.knifeOnSkinTime) || prev.knifeOnSkin,
          endOfSurgery: toLocalInput(s.surgeryEndTime) || prev.endOfSurgery,
          estimatedBloodLoss:
            s.intraOperativeRecord?.estimatedBloodLoss != null
              ? String(s.intraOperativeRecord.estimatedBloodLoss)
              : prev.estimatedBloodLoss,
          patientAge: s.patient?.age != null ? String(s.patient.age) : prev.patientAge,
          patientGender: s.patient?.gender || prev.patientGender,
        }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedSurgeryId]);

  const fetchCompletedSurgeries = async () => {
    try {
      const response = await fetch('/api/surgeries?status=COMPLETED');
      if (response.ok) {
        const data = await response.json();
        const list = Array.isArray(data) ? data : [];
        setSurgeries(list.filter((s: Surgery) => !s.pacuAssessment));
      }
    } catch (error) {
      console.error('Error fetching surgeries:', error);
      setError('Failed to load completed surgeries');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedSurgeryId) {
      setError('Please select a surgery');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const selectedSurgery = surgeries.find(s => s.id === selectedSurgeryId);
      
      const response = await fetch('/api/pacu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surgeryId: selectedSurgeryId,
          patientId: selectedSurgery?.patient.id,
          consciousnessLevel: formData.consciousnessLevel,
          airwayStatus: formData.airwayStatus,
          handoverFrom: formData.handoverFrom || undefined,
          breathingPattern: formData.breathingPattern,
          oxygenTherapy: formData.oxygenTherapy,
          oxygenFlowRate: formData.oxygenTherapy && formData.oxygenFlowRate ? parseFloat(formData.oxygenFlowRate) : undefined,
          heartRateOnAdmission: formData.heartRateOnAdmission ? parseInt(formData.heartRateOnAdmission) : undefined,
          bloodPressureOnAdmission: formData.bloodPressureOnAdmission || undefined,
          painScoreOnAdmission: formData.painScoreOnAdmission ? parseInt(formData.painScoreOnAdmission) : undefined,
          temperatureOnAdmission: formData.temperatureOnAdmission ? parseFloat(formData.temperatureOnAdmission) : undefined,
          surgicalSiteCondition: formData.surgicalSiteCondition,
          dressingIntact: formData.dressingIntact,
          drainsPresent: formData.drainsPresent,
          ivFluidsRunning: formData.ivFluidsRunning,
          catheterInSitu: formData.catheterInSitu,
          nauseaPresent: formData.nauseaPresent,
          vomitingOccurred: formData.vomitingOccurred,
          intraOpSummary: JSON.stringify(intraOp),
        })
      });

      if (response.ok) {
        const assessment = await response.json();
        router.push(`/dashboard/pacu/${assessment.id}`);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to admit patient to PACU');
      }
    } catch (error) {
      setError('An error occurred while admitting patient to PACU');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Admit Patient to PACU</h1>
        <p className="text-gray-600 mt-2">
          Post-Anesthesia Care Unit - Recovery monitoring and discharge planning
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Completed Surgery *
          </label>
          <select
            value={selectedSurgeryId}
            onChange={(e) => setSelectedSurgeryId(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            title="Select completed surgery"
            aria-label="Select completed surgery"
            required
          >
            <option value="">-- Select a surgery --</option>
            {surgeries.map((surgery) => (
              <option key={surgery.id} value={surgery.id}>
                {surgery.patient?.name || 'Unknown Patient'} ({surgery.patient?.folderNumber || 'N/A'}) - {surgery.procedureName} -{' '}
                {new Date(surgery.scheduledDate).toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>

        {selectedSurgeryId && (
          <>
            <div className="border-t pt-6">
              <h3 className="text-lg font-bold text-gray-900 mb-1">Intra-operative Handover Summary</h3>
              <p className="text-sm text-gray-500 mb-4">
                Auto-filled from the surgery record where available — review and complete before admission.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Diagnosis</label>
                  <input
                    type="text"
                    value={intraOp.diagnosis}
                    onChange={(e) => setIntraOp({ ...intraOp, diagnosis: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="Clinical diagnosis"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Surgery done</label>
                  <input
                    type="text"
                    value={intraOp.procedureDone}
                    onChange={(e) => setIntraOp({ ...intraOp, procedureDone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="Procedure performed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Scrub nurse</label>
                  <input
                    list="pacu-scrub-nurses"
                    value={intraOp.scrubNurse}
                    onChange={(e) => setIntraOp({ ...intraOp, scrubNurse: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="Select or type the scrub nurse"
                  />
                  <datalist id="pacu-scrub-nurses">
                    {scrubNurses.map((n) => <option key={n.id} value={n.fullName} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Anaesthetist</label>
                  <input
                    type="text"
                    value={intraOp.anaesthetist}
                    onChange={(e) => setIntraOp({ ...intraOp, anaesthetist: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="Anaesthetist name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Anaesthesia type</label>
                  <select
                    value={intraOp.anaesthesiaType}
                    onChange={(e) => setIntraOp({ ...intraOp, anaesthesiaType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    aria-label="Anaesthesia type"
                  >
                    <option value="">Select…</option>
                    <option value="GENERAL">General</option>
                    <option value="SPINAL">Spinal</option>
                    <option value="EPIDURAL">Epidural</option>
                    <option value="COMBINED_SPINAL_EPIDURAL">Combined spinal-epidural</option>
                    <option value="REGIONAL">Regional</option>
                    <option value="LOCAL">Local</option>
                    <option value="SEDATION">Sedation</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estimated blood loss (mL)</label>
                  <input
                    type="number"
                    min="0"
                    value={intraOp.estimatedBloodLoss}
                    onChange={(e) => setIntraOp({ ...intraOp, estimatedBloodLoss: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="e.g. 250"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Knife on skin</label>
                  <input
                    type="datetime-local"
                    value={intraOp.knifeOnSkin}
                    onChange={(e) => setIntraOp({ ...intraOp, knifeOnSkin: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    aria-label="Knife on skin time"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End of surgery</label>
                  <input
                    type="datetime-local"
                    value={intraOp.endOfSurgery}
                    onChange={(e) => setIntraOp({ ...intraOp, endOfSurgery: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    aria-label="End of surgery time"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Patient age</label>
                  <input
                    type="number"
                    min="0"
                    value={intraOp.patientAge}
                    onChange={(e) => setIntraOp({ ...intraOp, patientAge: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="Age"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Patient gender</label>
                  <select
                    value={intraOp.patientGender}
                    onChange={(e) => setIntraOp({ ...intraOp, patientGender: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    aria-label="Patient gender"
                  >
                    <option value="">Select…</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Any other special condition</label>
                <textarea
                  value={intraOp.specialConditions}
                  onChange={(e) => setIntraOp({ ...intraOp, specialConditions: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="Allergies, difficult airway, implants, isolation precautions, etc."
                />
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Initial Assessment on Arrival</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Consciousness Level *
                  </label>
                  <select
                    value={formData.consciousnessLevel}
                    onChange={(e) => setFormData({...formData, consciousnessLevel: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    title="Consciousness level"
                    aria-label="Consciousness level"
                    required
                  >
                    <option value="FULLY_AWAKE">Fully Awake</option>
                    <option value="DROWSY_BUT_ROUSABLE">Drowsy but Rousable</option>
                    <option value="SEDATED">Sedated</option>
                    <option value="UNCONSCIOUS">Unconscious</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Airway Status *
                  </label>
                  <select
                    value={formData.airwayStatus}
                    onChange={(e) => setFormData({...formData, airwayStatus: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    title="Airway status"
                    aria-label="Airway status"
                    required
                  >
                    <option value="PATENT">Patent (Clear)</option>
                    <option value="MAINTAINED_WITH_ADJUNCT">Maintained with Adjunct</option>
                    <option value="COMPROMISED">Compromised</option>
                    <option value="OBSTRUCTED">Obstructed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Handover From
                  </label>
                  <input
                    type="text"
                    value={formData.handoverFrom}
                    onChange={(e) => setFormData({...formData, handoverFrom: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="Theatre nurse/anesthetist name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Breathing Pattern
                  </label>
                  <select
                    value={formData.breathingPattern}
                    onChange={(e) => setFormData({...formData, breathingPattern: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    title="Breathing pattern"
                    aria-label="Breathing pattern"
                  >
                    <option value="Spontaneous">Spontaneous</option>
                    <option value="Assisted">Assisted</option>
                    <option value="Ventilated">Ventilated</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 flex items-center">
                <input
                  type="checkbox"
                  checked={formData.oxygenTherapy}
                  onChange={(e) => setFormData({...formData, oxygenTherapy: e.target.checked})}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded"
                  title="Oxygen therapy required"
                  aria-label="Oxygen therapy required"
                />
                <label className="ml-2 text-sm text-gray-700">Oxygen Therapy Required</label>
              </div>

              {formData.oxygenTherapy && (
                <div className="mt-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Oxygen Flow Rate (L/min)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.oxygenFlowRate}
                    onChange={(e) => setFormData({...formData, oxygenFlowRate: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="2.0"
                  />
                </div>
              )}
            </div>

            <div className="border-t pt-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Vital Signs on Admission</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Heart Rate (bpm)
                  </label>
                  <input
                    type="number"
                    value={formData.heartRateOnAdmission}
                    onChange={(e) => setFormData({...formData, heartRateOnAdmission: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="75"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Blood Pressure (e.g., 120/80)
                  </label>
                  <input
                    type="text"
                    value={formData.bloodPressureOnAdmission}
                    onChange={(e) => setFormData({...formData, bloodPressureOnAdmission: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="120/80"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Temperature (°C)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.temperatureOnAdmission}
                    onChange={(e) => setFormData({...formData, temperatureOnAdmission: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="36.5"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pain Score (0-10)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={formData.painScoreOnAdmission}
                    onChange={(e) => setFormData({...formData, painScoreOnAdmission: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Clinical Status</h3>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Surgical Site Condition
                  </label>
                  <select
                    value={formData.surgicalSiteCondition}
                    onChange={(e) => setFormData({...formData, surgicalSiteCondition: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    title="Surgical site condition"
                    aria-label="Surgical site condition"
                  >
                    <option value="Clean and dry">Clean and dry</option>
                    <option value="Oozing">Oozing</option>
                    <option value="Bleeding">Bleeding</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <label className="flex items-center cursor-pointer p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={formData.dressingIntact}
                      onChange={(e) => setFormData({...formData, dressingIntact: e.target.checked})}
                      className="w-4 h-4 text-primary-600"
                    />
                    <span className="ml-2 text-sm">Dressing Intact</span>
                  </label>

                  <label className="flex items-center cursor-pointer p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={formData.drainsPresent}
                      onChange={(e) => setFormData({...formData, drainsPresent: e.target.checked})}
                      className="w-4 h-4 text-primary-600"
                    />
                    <span className="ml-2 text-sm">Drains Present</span>
                  </label>

                  <label className="flex items-center cursor-pointer p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={formData.ivFluidsRunning}
                      onChange={(e) => setFormData({...formData, ivFluidsRunning: e.target.checked})}
                      className="w-4 h-4 text-primary-600"
                    />
                    <span className="ml-2 text-sm">IV Fluids Running</span>
                  </label>

                  <label className="flex items-center cursor-pointer p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={formData.catheterInSitu}
                      onChange={(e) => setFormData({...formData, catheterInSitu: e.target.checked})}
                      className="w-4 h-4 text-primary-600"
                    />
                    <span className="ml-2 text-sm">Catheter In Situ</span>
                  </label>

                  <label className="flex items-center cursor-pointer p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={formData.nauseaPresent}
                      onChange={(e) => setFormData({...formData, nauseaPresent: e.target.checked})}
                      className="w-4 h-4 text-primary-600"
                    />
                    <span className="ml-2 text-sm">Nausea Present</span>
                  </label>

                  <label className="flex items-center cursor-pointer p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={formData.vomitingOccurred}
                      onChange={(e) => setFormData({...formData, vomitingOccurred: e.target.checked})}
                      className="w-4 h-4 text-primary-600"
                    />
                    <span className="ml-2 text-sm">Vomiting Occurred</span>
                  </label>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            disabled={submitting || !selectedSurgeryId}
            className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 transition-colors"
          >
            {submitting ? 'Admitting to PACU...' : 'Admit to PACU'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>

      {surgeries.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-yellow-800">
            No completed surgeries available. Surgery must be completed before PACU admission.
          </p>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
        <h3 className="font-medium text-blue-900 mb-2">What happens next?</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Patient will be admitted to Post-Anesthesia Care Unit</li>
          <li>• Recovery monitoring will begin immediately</li>
          <li>• Vital signs tracking every 15 minutes</li>
          <li>• Pain and nausea assessment</li>
          <li>• Discharge readiness evaluation (Aldrete Score)</li>
          <li>• Red alerts can be triggered for complications</li>
        </ul>
      </div>
    </div>
  );
}
