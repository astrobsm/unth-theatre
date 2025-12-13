'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, User, AlertCircle, Activity, Pill, Heart, Shield, ClipboardCheck } from 'lucide-react';
import Link from 'next/link';

export default function NewPatientPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dDimerTestDone, setDDimerTestDone] = useState(false);
  const [onAnticoagulants, setOnAnticoagulants] = useState(false);
  const [onAntiplatelets, setOnAntiplatelets] = useState(false);
  const [onACEInhibitors, setOnACEInhibitors] = useState(false);
  const [onARBs, setOnARBs] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    
    const data = {
      // Basic Information
      name: formData.get('name'),
      folderNumber: formData.get('folderNumber'),
      ptNumber: formData.get('ptNumber'),
      age: parseInt(formData.get('age') as string),
      gender: formData.get('gender'),
      ward: formData.get('ward'),
      
      // DVT Risk Assessment
      dvtRiskScore: formData.get('dvtRiskScore') ? parseFloat(formData.get('dvtRiskScore') as string) : 0,
      hasDVTHistory: formData.get('hasDVTHistory') === 'true',
      hasMobilityIssues: formData.get('hasMobilityIssues') === 'true',
      hasActiveCancer: formData.get('hasActiveCancer') === 'true',
      hasPriorDVT: formData.get('hasPriorDVT') === 'true',
      dDimerTestDone: dDimerTestDone,
      dDimerResult: dDimerTestDone ? formData.get('dDimerResult') : null,
      dDimerValue: dDimerTestDone && formData.get('dDimerValue') ? parseFloat(formData.get('dDimerValue') as string) : null,
      
      // Bleeding Risk Assessment
      bleedingRiskScore: formData.get('bleedingRiskScore') ? parseFloat(formData.get('bleedingRiskScore') as string) : 0,
      hasBleedingDisorder: formData.get('hasBleedingDisorder') === 'true',
      hasLiverDisease: formData.get('hasLiverDisease') === 'true',
      hasRenalImpairment: formData.get('hasRenalImpairment') === 'true',
      recentBleeding: formData.get('recentBleeding') === 'true',
      
      // Pressure Sore Risk
      pressureSoreRisk: formData.get('pressureSoreRisk') ? parseFloat(formData.get('pressureSoreRisk') as string) : 0,
      hasPressureSores: formData.get('hasPressureSores') === 'true',
      mobilityStatus: formData.get('mobilityStatus'),
      nutritionalStatus: formData.get('nutritionalStatus'),
      
      // Medications Affecting Surgery
      onAnticoagulants: onAnticoagulants,
      anticoagulantName: onAnticoagulants ? formData.get('anticoagulantName') : null,
      anticoagulantLastDose: onAnticoagulants ? formData.get('anticoagulantLastDose') : null,
      onAntiplatelets: onAntiplatelets,
      antiplateletName: onAntiplatelets ? formData.get('antiplateletName') : null,
      antiplateletLastDose: onAntiplatelets ? formData.get('antiplateletLastDose') : null,
      onACEInhibitors: onACEInhibitors,
      aceInhibitorName: onACEInhibitors ? formData.get('aceInhibitorName') : null,
      aceInhibitorLastDose: onACEInhibitors ? formData.get('aceInhibitorLastDose') : null,
      onARBs: onARBs,
      arbName: onARBs ? formData.get('arbName') : null,
      arbLastDose: onARBs ? formData.get('arbLastDose') : null,
      otherMedications: formData.get('otherMedications'),
      
      // WHO Operative Fitness Risk Assessment
      whoRiskClass: formData.get('whoRiskClass') ? parseInt(formData.get('whoRiskClass') as string) : null,
      asaScore: formData.get('asaScore') ? parseInt(formData.get('asaScore') as string) : null,
      comorbidities: formData.get('comorbidities'),
      cardiovascularStatus: formData.get('cardiovascularStatus'),
      respiratoryStatus: formData.get('respiratoryStatus'),
      metabolicStatus: formData.get('metabolicStatus'),
      
      // Final Assessment
      finalRiskScore: formData.get('finalRiskScore') ? parseFloat(formData.get('finalRiskScore') as string) : 0,
      fitnessForSurgery: formData.get('fitnessForSurgery'),
      assessmentNotes: formData.get('assessmentNotes'),
      assessedBy: formData.get('assessedBy'),
      assessmentDate: formData.get('assessmentDate') ? new Date(formData.get('assessmentDate') as string) : new Date(),
    };

    try {
      const response = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        router.push('/dashboard/patients');
      } else {
        const error = await response.json();
        setError(error.error || 'Failed to register patient');
      }
    } catch (error) {
      setError('An error occurred while registering the patient');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/patients"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Register Patient</h1>
          <p className="text-gray-600 mt-1">Add a new patient to the system</p>
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

      <div className="card">
        <div className="flex items-center gap-3 mb-6">
          <User className="w-6 h-6 text-primary-600" />
          <h2 className="text-xl font-semibold">Patient Information</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Patient Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="label">Full Name *</label>
              <input
                type="text"
                name="name"
                required
                className="input-field"
                placeholder="e.g., John Doe"
              />
            </div>

            <div>
              <label className="label">Folder Number *</label>
              <input
                type="text"
                name="folderNumber"
                required
                className="input-field"
                placeholder="e.g., UNTH/2024/001"
              />
              <p className="text-xs text-gray-500 mt-1">Unique hospital folder number</p>
            </div>

            <div>
              <label className="label">PT Number</label>
              <input
                type="text"
                name="ptNumber"
                className="input-field"
                placeholder="e.g., PT001234"
              />
              <p className="text-xs text-gray-500 mt-1">Patient tracking number (optional)</p>
            </div>

            <div>
              <label className="label">Age *</label>
              <input
                type="number"
                name="age"
                required
                min="0"
                max="150"
                className="input-field"
                placeholder="Age in years"
              />
            </div>

            <div>
              <label className="label">Gender *</label>
              <select name="gender" required className="input-field">
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="label">Ward *</label>
              <select name="ward" required className="input-field">
                <option value="">Select Ward</option>
                <option value="Ward 1">Ward 1</option>
                <option value="Ward 2">Ward 2</option>
                <option value="Ward 3">Ward 3</option>
                <option value="Ward 4">Ward 4</option>
                <option value="Ward 5">Ward 5</option>
                <option value="Ward 6A">Ward 6A</option>
                <option value="Ward 6B">Ward 6B</option>
                <option value="Ward 8">Ward 8</option>
                <option value="Ward 9">Ward 9</option>
                <option value="Ward 10">Ward 10</option>
                <option value="Neurosurgical Ward">Neurosurgical Ward</option>
                <option value="Surgical Emergency Ward">Surgical Emergency Ward</option>
                <option value="Medical Emergency Ward">Medical Emergency Ward</option>
                <option value="ICU">ICU</option>
                <option value="Post Natal Ward">Post Natal Ward</option>
                <option value="Oncology Ward">Oncology Ward</option>
                <option value="Male Medical Ward">Male Medical Ward</option>
                <option value="Female Medical Ward">Female Medical Ward</option>
                <option value="Male Medical Ward Extension">Male Medical Ward Extension</option>
                <option value="Psychiatric Ward">Psychiatric Ward</option>
                <option value="Eye Ward">Eye Ward</option>
                <option value="White Room (Private)">White Room (Private)</option>
                <option value="Pink Room (Private)">Pink Room (Private)</option>
                <option value="Blue Room (Private)">Blue Room (Private)</option>
                <option value="Others">Others (Specify in Notes)</option>
              </select>
            </div>
          </div>

          {/* DVT Risk Assessment */}
          <div className="border-t pt-6">
            <div className="flex items-center gap-3 mb-4">
              <Activity className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900">DVT Risk Assessment</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="label">DVT Risk Score *</label>
                <input
                  type="number"
                  name="dvtRiskScore"
                  required
                  step="0.1"
                  min="0"
                  className="input-field"
                  placeholder="0.0"
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="hasDVTHistory" value="true" className="w-4 h-4" />
                  <span className="text-sm">History of DVT</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="hasMobilityIssues" value="true" className="w-4 h-4" />
                  <span className="text-sm">Mobility Issues</span>
                </label>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="hasActiveCancer" value="true" className="w-4 h-4" />
                  <span className="text-sm">Active Cancer</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="hasPriorDVT" value="true" className="w-4 h-4" />
                  <span className="text-sm">Prior DVT</span>
                </label>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer mb-3">
                  <input 
                    type="checkbox" 
                    checked={dDimerTestDone}
                    onChange={(e) => setDDimerTestDone(e.target.checked)}
                    className="w-4 h-4" 
                  />
                  <span className="text-sm font-medium">D-Dimer Test Done</span>
                </label>
                
                {dDimerTestDone && (
                  <div className="space-y-3 ml-6">
                    <div>
                      <label className="label text-sm">D-Dimer Result</label>
                      <select name="dDimerResult" className="input-field">
                        <option value="">Select Result</option>
                        <option value="POSITIVE">Positive</option>
                        <option value="NEGATIVE">Negative</option>
                      </select>
                    </div>
                    <div>
                      <label className="label text-sm">D-Dimer Value (mg/L)</label>
                      <input
                        type="number"
                        name="dDimerValue"
                        step="0.01"
                        className="input-field"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bleeding Risk Assessment */}
          <div className="border-t pt-6">
            <div className="flex items-center gap-3 mb-4">
              <Heart className="w-5 h-5 text-red-600" />
              <h3 className="text-lg font-semibold text-gray-900">Bleeding Risk Assessment</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="label">Bleeding Risk Score *</label>
                <input
                  type="number"
                  name="bleedingRiskScore"
                  required
                  step="0.1"
                  min="0"
                  className="input-field"
                  placeholder="0.0"
                />
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="hasBleedingDisorder" value="true" className="w-4 h-4" />
                  <span className="text-sm">Bleeding Disorder</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="hasLiverDisease" value="true" className="w-4 h-4" />
                  <span className="text-sm">Liver Disease</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="hasRenalImpairment" value="true" className="w-4 h-4" />
                  <span className="text-sm">Renal Impairment</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="recentBleeding" value="true" className="w-4 h-4" />
                  <span className="text-sm">Recent Bleeding</span>
                </label>
              </div>
            </div>
          </div>

          {/* Pressure Sore Risk */}
          <div className="border-t pt-6">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-5 h-5 text-purple-600" />
              <h3 className="text-lg font-semibold text-gray-900">Pressure Sore Risk Assessment</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="label">Pressure Sore Risk Score *</label>
                <input
                  type="number"
                  name="pressureSoreRisk"
                  required
                  step="0.1"
                  min="0"
                  className="input-field"
                  placeholder="0.0"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="hasPressureSores" value="true" className="w-4 h-4" />
                  <span className="text-sm">Has Existing Pressure Sores</span>
                </label>
              </div>

              <div>
                <label className="label">Mobility Status *</label>
                <select name="mobilityStatus" required className="input-field">
                  <option value="">Select Status</option>
                  <option value="FULLY_MOBILE">Fully Mobile</option>
                  <option value="SLIGHTLY_LIMITED">Slightly Limited</option>
                  <option value="VERY_LIMITED">Very Limited</option>
                  <option value="IMMOBILE">Immobile</option>
                </select>
              </div>

              <div>
                <label className="label">Nutritional Status *</label>
                <select name="nutritionalStatus" required className="input-field">
                  <option value="">Select Status</option>
                  <option value="WELL_NOURISHED">Well Nourished</option>
                  <option value="ADEQUATE">Adequate</option>
                  <option value="POOR">Poor</option>
                  <option value="VERY_POOR">Very Poor</option>
                </select>
              </div>
            </div>
          </div>

          {/* Medications Affecting Surgery */}
          <div className="border-t pt-6">
            <div className="flex items-center gap-3 mb-4">
              <Pill className="w-5 h-5 text-green-600" />
              <h3 className="text-lg font-semibold text-gray-900">Medications Affecting Surgery</h3>
            </div>
            
            {/* Anticoagulants */}
            <div className="mb-6">
              <label className="flex items-center gap-2 cursor-pointer mb-3">
                <input 
                  type="checkbox" 
                  checked={onAnticoagulants}
                  onChange={(e) => setOnAnticoagulants(e.target.checked)}
                  className="w-4 h-4" 
                />
                <span className="text-sm font-medium">On Anticoagulants</span>
              </label>
              
              {onAnticoagulants && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-6">
                  <div>
                    <label className="label text-sm">Anticoagulant Name</label>
                    <input
                      type="text"
                      name="anticoagulantName"
                      className="input-field"
                      placeholder="e.g., Warfarin, Rivaroxaban"
                    />
                  </div>
                  <div>
                    <label className="label text-sm">Last Dose</label>
                    <input
                      type="datetime-local"
                      name="anticoagulantLastDose"
                      className="input-field"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Antiplatelets */}
            <div className="mb-6">
              <label className="flex items-center gap-2 cursor-pointer mb-3">
                <input 
                  type="checkbox" 
                  checked={onAntiplatelets}
                  onChange={(e) => setOnAntiplatelets(e.target.checked)}
                  className="w-4 h-4" 
                />
                <span className="text-sm font-medium">On Antiplatelets</span>
              </label>
              
              {onAntiplatelets && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-6">
                  <div>
                    <label className="label text-sm">Antiplatelet Name</label>
                    <input
                      type="text"
                      name="antiplateletName"
                      className="input-field"
                      placeholder="e.g., Aspirin, Clopidogrel"
                    />
                  </div>
                  <div>
                    <label className="label text-sm">Last Dose</label>
                    <input
                      type="datetime-local"
                      name="antiplateletLastDose"
                      className="input-field"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ACE Inhibitors */}
            <div className="mb-6">
              <label className="flex items-center gap-2 cursor-pointer mb-3">
                <input 
                  type="checkbox" 
                  checked={onACEInhibitors}
                  onChange={(e) => setOnACEInhibitors(e.target.checked)}
                  className="w-4 h-4" 
                />
                <span className="text-sm font-medium">On ACE Inhibitors</span>
              </label>
              
              {onACEInhibitors && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-6">
                  <div>
                    <label className="label text-sm">ACE Inhibitor Name</label>
                    <input
                      type="text"
                      name="aceInhibitorName"
                      className="input-field"
                      placeholder="e.g., Lisinopril, Enalapril"
                    />
                  </div>
                  <div>
                    <label className="label text-sm">Last Dose</label>
                    <input
                      type="datetime-local"
                      name="aceInhibitorLastDose"
                      className="input-field"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ARBs */}
            <div className="mb-6">
              <label className="flex items-center gap-2 cursor-pointer mb-3">
                <input 
                  type="checkbox" 
                  checked={onARBs}
                  onChange={(e) => setOnARBs(e.target.checked)}
                  className="w-4 h-4" 
                />
                <span className="text-sm font-medium">On ARBs (Angiotensin Receptor Blockers)</span>
              </label>
              
              {onARBs && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-6">
                  <div>
                    <label className="label text-sm">ARB Name</label>
                    <input
                      type="text"
                      name="arbName"
                      className="input-field"
                      placeholder="e.g., Losartan, Valsartan"
                    />
                  </div>
                  <div>
                    <label className="label text-sm">Last Dose</label>
                    <input
                      type="datetime-local"
                      name="arbLastDose"
                      className="input-field"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Other Medications */}
            <div>
              <label className="label">Other Medications</label>
              <textarea
                name="otherMedications"
                rows={3}
                className="input-field"
                placeholder="List any other medications that may affect surgery..."
              />
            </div>
          </div>

          {/* WHO Operative Fitness Risk Assessment */}
          <div className="border-t pt-6">
            <div className="flex items-center gap-3 mb-4">
              <ClipboardCheck className="w-5 h-5 text-indigo-600" />
              <h3 className="text-lg font-semibold text-gray-900">WHO Operative Fitness Risk Assessment</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="label">WHO Risk Class *</label>
                <select name="whoRiskClass" required className="input-field">
                  <option value="">Select Risk Class</option>
                  <option value="1">Class 1 - Minimal Risk</option>
                  <option value="2">Class 2 - Low Risk</option>
                  <option value="3">Class 3 - Moderate Risk</option>
                  <option value="4">Class 4 - High Risk</option>
                  <option value="5">Class 5 - Very High Risk</option>
                </select>
              </div>

              <div>
                <label className="label">ASA Score *</label>
                <select name="asaScore" required className="input-field">
                  <option value="">Select ASA Score</option>
                  <option value="1">ASA I - Healthy</option>
                  <option value="2">ASA II - Mild Systemic Disease</option>
                  <option value="3">ASA III - Severe Systemic Disease</option>
                  <option value="4">ASA IV - Life-Threatening Disease</option>
                  <option value="5">ASA V - Moribund</option>
                  <option value="6">ASA VI - Brain Dead</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="label">Comorbidities</label>
                <textarea
                  name="comorbidities"
                  rows={2}
                  className="input-field"
                  placeholder="List comorbid conditions..."
                />
              </div>

              <div>
                <label className="label">Cardiovascular Status</label>
                <select name="cardiovascularStatus" className="input-field">
                  <option value="">Select Status</option>
                  <option value="NORMAL">Normal</option>
                  <option value="CONTROLLED">Controlled</option>
                  <option value="UNSTABLE">Unstable</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>

              <div>
                <label className="label">Respiratory Status</label>
                <select name="respiratoryStatus" className="input-field">
                  <option value="">Select Status</option>
                  <option value="NORMAL">Normal</option>
                  <option value="CONTROLLED">Controlled</option>
                  <option value="UNSTABLE">Unstable</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="label">Metabolic Status</label>
                <textarea
                  name="metabolicStatus"
                  rows={2}
                  className="input-field"
                  placeholder="Diabetes, thyroid disorders, etc..."
                />
              </div>
            </div>
          </div>

          {/* Final Assessment */}
          <div className="border-t pt-6">
            <div className="flex items-center gap-3 mb-4">
              <User className="w-5 h-5 text-orange-600" />
              <h3 className="text-lg font-semibold text-gray-900">Final Assessment</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="label">Final Risk Score *</label>
                <input
                  type="number"
                  name="finalRiskScore"
                  required
                  step="0.1"
                  min="0"
                  className="input-field"
                  placeholder="0.0"
                />
              </div>

              <div>
                <label className="label">Fitness for Surgery *</label>
                <select name="fitnessForSurgery" required className="input-field">
                  <option value="">Select Fitness</option>
                  <option value="FIT">Fit for Surgery</option>
                  <option value="FIT_WITH_OPTIMIZATION">Fit with Optimization</option>
                  <option value="UNFIT">Unfit for Surgery</option>
                  <option value="REQUIRES_FURTHER_ASSESSMENT">Requires Further Assessment</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="label">Assessment Notes</label>
                <textarea
                  name="assessmentNotes"
                  rows={4}
                  className="input-field"
                  placeholder="Additional notes regarding the patient's fitness for surgery..."
                />
              </div>

              <div>
                <label className="label">Assessed By *</label>
                <input
                  type="text"
                  name="assessedBy"
                  required
                  className="input-field"
                  placeholder="Name of assessing physician"
                />
              </div>

              <div>
                <label className="label">Assessment Date *</label>
                <input
                  type="datetime-local"
                  name="assessmentDate"
                  required
                  className="input-field"
                  defaultValue={new Date().toISOString().slice(0, 16)}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-4 pt-4 border-t">
            <Link href="/dashboard/patients" className="btn-secondary">
              Cancel
            </Link>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Registering...' : 'Register Patient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
