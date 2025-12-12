'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface AnesthesiaRecord {
  id: string;
  surgeryId: string;
  anesthesiaType: string;
  anesthesiaTechnique: string;
  asaClassification: string;
  
  // Spinal specific
  spinalLevel: string | null;
  localAnestheticUsed: string | null;
  localAnestheticDose: string | null;
  highestSensoryLevel: string | null;
  
  // General anesthesia specific
  inductionAgents: string | null;
  inductionTime: string | null;
  intubationMethod: string | null;
  ettSize: string | null;
  maintenanceAgents: string | null;
  
  // Baseline vitals
  baselineHR: number | null;
  baselineBP: string | null;
  baselineSpo2: number | null;
  
  // Monitoring
  ecgMonitored: boolean;
  nibpMonitored: boolean;
  spo2Monitored: boolean;
  etco2Monitored: boolean;
  
  // Complications
  hypotensionOccurred: boolean;
  desaturationOccurred: boolean;
  difficultAirway: boolean;
  
  // Fluid management
  crystalloidsGiven: number | null;
  bloodProductsGiven: string | null;
  estimatedBloodLoss: number | null;
  
  surgery: {
    procedureName: string;
    patient: {
      name: string;
      age: number;
      gender: string;
    };
  };
  
  vitalSignsRecords: VitalSigns[];
}

interface VitalSigns {
  id: string;
  recordedAt: string;
  minutesFromStart: number | null;
  heartRate: number | null;
  systolicBP: number | null;
  diastolicBP: number | null;
  spo2: number | null;
  etco2: number | null;
  temperature: number | null;
  alertTriggered: boolean;
  alertType: string | null;
}

export default function AnesthesiaMonitoringPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [record, setRecord] = useState<AnesthesiaRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showInitDialog, setShowInitDialog] = useState(false);
  const [showVitalsDialog, setShowVitalsDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'vitals' | 'fluids' | 'complications'>('overview');
  
  const [initData, setInitData] = useState({
    anesthesiaType: 'GENERAL',
    anesthesiaTechnique: '',
    asaClassification: 'II',
    baselineHR: 0,
    baselineBP: '',
    baselineSpo2: 0,
  });

  const [vitalData, setVitalData] = useState({
    heartRate: 0,
    systolicBP: 0,
    diastolicBP: 0,
    spo2: 0,
    etco2: 0,
    temperature: 0,
    eventPhase: 'MAINTENANCE',
  });

  useEffect(() => {
    fetchRecord();
  }, [params.id]);

  const fetchRecord = async () => {
    try {
      const response = await fetch(`/api/surgeries/${params.id}/anesthesia`);
      if (response.ok) {
        const data = await response.json();
        setRecord(data);
      } else if (response.status === 404) {
        setRecord(null);
      }
    } catch (error) {
      console.error('Error fetching anesthesia record:', error);
    } finally {
      setLoading(false);
    }
  };

  const initializeRecord = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/surgeries/${params.id}/anesthesia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(initData)
      });

      if (response.ok) {
        const data = await response.json();
        setRecord(data);
        setShowInitDialog(false);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to initialize record');
      }
    } catch (error) {
      console.error('Error initializing record:', error);
      alert('Failed to initialize record');
    } finally {
      setSaving(false);
    }
  };

  const updateRecord = async (updates: any) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/surgeries/${params.id}/anesthesia`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (response.ok) {
        const data = await response.json();
        setRecord(data);
      }
    } catch (error) {
      console.error('Error updating record:', error);
      alert('Failed to update record');
    } finally {
      setSaving(false);
    }
  };

  const recordVitals = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/surgeries/${params.id}/anesthesia/vitals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vitalData)
      });

      if (response.ok) {
        await fetchRecord();
        setShowVitalsDialog(false);
        // Reset vital data
        setVitalData({
          heartRate: 0,
          systolicBP: 0,
          diastolicBP: 0,
          spo2: 0,
          etco2: 0,
          temperature: 0,
          eventPhase: 'MAINTENANCE',
        });
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to record vitals');
      }
    } catch (error) {
      console.error('Error recording vitals:', error);
      alert('Failed to record vitals');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-6">
          <Link href={`/dashboard/surgeries/${params.id}`} className="text-blue-600 hover:underline">
            ← Back to Surgery
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-4">Anesthesia Monitoring Record</h1>
        </div>

        <div className="bg-blue-50 border-2 border-blue-400 rounded-lg p-8 text-center">
          <h2 className="text-2xl font-semibold text-blue-800 mb-4">
            Anesthesia Monitoring Not Started
          </h2>
          <p className="text-blue-700 mb-6">
            Initialize the anesthesia monitoring record to track vital signs and anesthesia parameters during surgery.
          </p>
          <button
            onClick={() => setShowInitDialog(true)}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold"
          >
            Initialize Anesthesia Record
          </button>
        </div>

        {showInitDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-bold mb-4">Initialize Anesthesia Monitoring</h3>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Anesthesia Type *
                    </label>
                    <select
                      value={initData.anesthesiaType}
                      onChange={(e) => setInitData({...initData, anesthesiaType: e.target.value})}
                      className="w-full border rounded-lg px-3 py-2"
                    >
                      <option value="GENERAL">General Anesthesia</option>
                      <option value="SPINAL">Spinal Anesthesia</option>
                      <option value="EPIDURAL">Epidural Anesthesia</option>
                      <option value="REGIONAL">Regional Anesthesia</option>
                      <option value="LOCAL">Local Anesthesia</option>
                      <option value="SEDATION">Sedation</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ASA Classification *
                    </label>
                    <select
                      value={initData.asaClassification}
                      onChange={(e) => setInitData({...initData, asaClassification: e.target.value})}
                      className="w-full border rounded-lg px-3 py-2"
                    >
                      <option value="I">ASA I</option>
                      <option value="II">ASA II</option>
                      <option value="III">ASA III</option>
                      <option value="IV">ASA IV</option>
                      <option value="V">ASA V</option>
                      <option value="E">ASA E (Emergency)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Technique
                    </label>
                    <input
                      type="text"
                      value={initData.anesthesiaTechnique}
                      onChange={(e) => setInitData({...initData, anesthesiaTechnique: e.target.value})}
                      placeholder="e.g., ETT, LMA, Spinal L3-L4"
                      className="w-full border rounded-lg px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Baseline HR (bpm)
                    </label>
                    <input
                      type="number"
                      value={initData.baselineHR}
                      onChange={(e) => setInitData({...initData, baselineHR: parseInt(e.target.value) || 0})}
                      className="w-full border rounded-lg px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Baseline BP
                    </label>
                    <input
                      type="text"
                      value={initData.baselineBP}
                      onChange={(e) => setInitData({...initData, baselineBP: e.target.value})}
                      placeholder="120/80"
                      className="w-full border rounded-lg px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Baseline SpO2 (%)
                    </label>
                    <input
                      type="number"
                      value={initData.baselineSpo2}
                      onChange={(e) => setInitData({...initData, baselineSpo2: parseInt(e.target.value) || 0})}
                      className="w-full border rounded-lg px-3 py-2"
                      min="0"
                      max="100"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={initializeRecord}
                  disabled={saving}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Initializing...' : 'Initialize Record'}
                </button>
                <button
                  onClick={() => setShowInitDialog(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <Link href={`/dashboard/surgeries/${params.id}`} className="text-blue-600 hover:underline">
          ← Back to Surgery
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mt-4">WHO Anesthesia Monitoring Record</h1>
        <p className="text-gray-600 mt-2">
          {record.surgery.procedureName} - {record.surgery.patient.name} ({record.surgery.patient.age}y, {record.surgery.patient.gender})
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-sm text-blue-600 font-medium">Anesthesia Type</div>
          <div className="text-xl font-bold text-blue-900">{record.anesthesiaType}</div>
          <div className="text-sm text-blue-700">{record.anesthesiaTechnique}</div>
        </div>
        
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="text-sm text-purple-600 font-medium">ASA Class</div>
          <div className="text-2xl font-bold text-purple-900">ASA {record.asaClassification}</div>
        </div>

        <div className={`border rounded-lg p-4 ${record.hypotensionOccurred || record.desaturationOccurred ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
          <div className={`text-sm font-medium ${record.hypotensionOccurred || record.desaturationOccurred ? 'text-red-600' : 'text-green-600'}`}>
            Complications
          </div>
          <div className={`text-2xl font-bold ${record.hypotensionOccurred || record.desaturationOccurred ? 'text-red-900' : 'text-green-900'}`}>
            {record.hypotensionOccurred || record.desaturationOccurred ? 'Events Recorded' : 'None'}
          </div>
        </div>

        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
          <div className="text-sm text-indigo-600 font-medium">Vital Signs Records</div>
          <div className="text-2xl font-bold text-indigo-900">{record.vitalSignsRecords.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b mb-6">
        <div className="flex space-x-8">
          {['overview', 'vitals', 'fluids', 'complications'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-3 font-medium capitalize ${
                activeTab === tab
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="bg-white border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Anesthesia Details</h3>
            <div className="grid grid-cols-2 gap-4">
              {record.anesthesiaType === 'SPINAL' && (
                <>
                  <div>
                    <label className="text-sm text-gray-600">Spinal Level</label>
                    <input
                      type="text"
                      value={record.spinalLevel || ''}
                      onChange={(e) => updateRecord({ spinalLevel: e.target.value })}
                      placeholder="e.g., L3-L4"
                      className="w-full mt-1 border rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Local Anesthetic</label>
                    <input
                      type="text"
                      value={record.localAnestheticUsed || ''}
                      onChange={(e) => updateRecord({ localAnestheticUsed: e.target.value })}
                      placeholder="e.g., Bupivacaine 0.5%"
                      className="w-full mt-1 border rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Dose</label>
                    <input
                      type="text"
                      value={record.localAnestheticDose || ''}
                      onChange={(e) => updateRecord({ localAnestheticDose: e.target.value })}
                      placeholder="e.g., 15mg (3ml)"
                      className="w-full mt-1 border rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Highest Sensory Level</label>
                    <input
                      type="text"
                      value={record.highestSensoryLevel || ''}
                      onChange={(e) => updateRecord({ highestSensoryLevel: e.target.value })}
                      placeholder="e.g., T6"
                      className="w-full mt-1 border rounded px-3 py-2"
                    />
                  </div>
                </>
              )}
              
              {record.anesthesiaType === 'GENERAL' && (
                <>
                  <div>
                    <label className="text-sm text-gray-600">Intubation Method</label>
                    <select
                      value={record.intubationMethod || ''}
                      onChange={(e) => updateRecord({ intubationMethod: e.target.value })}
                      className="w-full mt-1 border rounded px-3 py-2"
                    >
                      <option value="">Select...</option>
                      <option value="ETT">ETT</option>
                      <option value="LMA">LMA</option>
                      <option value="Mask">Mask</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">ETT Size</label>
                    <input
                      type="text"
                      value={record.ettSize || ''}
                      onChange={(e) => updateRecord({ ettSize: e.target.value })}
                      placeholder="e.g., 7.5mm"
                      className="w-full mt-1 border rounded px-3 py-2"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="mt-4">
              <h4 className="font-medium mb-2">Monitoring Equipment</h4>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { key: 'ecgMonitored', label: 'ECG' },
                  { key: 'nibpMonitored', label: 'NIBP' },
                  { key: 'spo2Monitored', label: 'SpO2' },
                  { key: 'etco2Monitored', label: 'EtCO2' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={(record as any)[key]}
                      onChange={(e) => updateRecord({ [key]: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'vitals' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Vital Signs Monitoring</h3>
            <button
              onClick={() => setShowVitalsDialog(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              Record Vitals
            </button>
          </div>

          <div className="bg-white border rounded-lg overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium">Time</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Min</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">HR</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">BP</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">SpO2</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">EtCO2</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Temp</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Alert</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {record.vitalSignsRecords.map((vital) => (
                  <tr key={vital.id} className={vital.alertTriggered ? 'bg-red-50' : ''}>
                    <td className="px-4 py-3 text-sm">
                      {new Date(vital.recordedAt).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-3 text-sm">{vital.minutesFromStart || '-'}</td>
                    <td className="px-4 py-3 text-sm font-medium">{vital.heartRate || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      {vital.systolicBP && vital.diastolicBP ? `${vital.systolicBP}/${vital.diastolicBP}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">{vital.spo2 ? `${vital.spo2}%` : '-'}</td>
                    <td className="px-4 py-3 text-sm">{vital.etco2 || '-'}</td>
                    <td className="px-4 py-3 text-sm">{vital.temperature || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      {vital.alertTriggered && (
                        <span className="text-red-600 font-medium">{vital.alertType}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'fluids' && (
        <div className="bg-white border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Fluid Management</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Crystalloids (mL)</label>
              <input
                type="number"
                value={record.crystalloidsGiven || 0}
                onChange={(e) => updateRecord({ crystalloidsGiven: parseInt(e.target.value) || 0 })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">EBL (mL)</label>
              <input
                type="number"
                value={record.estimatedBloodLoss || 0}
                onChange={(e) => updateRecord({ estimatedBloodLoss: parseInt(e.target.value) || 0 })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Blood Products</label>
              <input
                type="text"
                value={record.bloodProductsGiven || ''}
                onChange={(e) => updateRecord({ bloodProductsGiven: e.target.value })}
                placeholder="e.g., PRBC 2 units"
                className="w-full border rounded px-3 py-2"
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'complications' && (
        <div className="bg-white border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Anesthesia Events & Complications</h3>
          <div className="space-y-4">
            {[
              { key: 'hypotensionOccurred', label: 'Hypotension', mgmtKey: 'hypotensionManagement' },
              { key: 'desaturationOccurred', label: 'Desaturation', mgmtKey: 'desaturationManagement' },
              { key: 'difficultAirway', label: 'Difficult Airway', mgmtKey: 'difficultAirwayDetails' },
            ].map(({ key, label, mgmtKey }) => (
              <div key={key} className="border rounded-lg p-4">
                <label className="flex items-center space-x-3 mb-2">
                  <input
                    type="checkbox"
                    checked={(record as any)[key]}
                    onChange={(e) => updateRecord({ [key]: e.target.checked })}
                    className="w-5 h-5"
                  />
                  <span className="font-medium">{label}</span>
                </label>
                {(record as any)[key] && (
                  <textarea
                    value={(record as any)[mgmtKey] || ''}
                    onChange={(e) => updateRecord({ [mgmtKey]: e.target.value })}
                    placeholder="Management details..."
                    className="w-full border rounded px-3 py-2 mt-2"
                    rows={2}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Record Vitals Dialog */}
      {showVitalsDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full">
            <h3 className="text-xl font-bold mb-4">Record Vital Signs</h3>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">HR (bpm)</label>
                <input
                  type="number"
                  value={vitalData.heartRate}
                  onChange={(e) => setVitalData({...vitalData, heartRate: parseInt(e.target.value) || 0})}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Systolic BP</label>
                <input
                  type="number"
                  value={vitalData.systolicBP}
                  onChange={(e) => setVitalData({...vitalData, systolicBP: parseInt(e.target.value) || 0})}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Diastolic BP</label>
                <input
                  type="number"
                  value={vitalData.diastolicBP}
                  onChange={(e) => setVitalData({...vitalData, diastolicBP: parseInt(e.target.value) || 0})}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">SpO2 (%)</label>
                <input
                  type="number"
                  value={vitalData.spo2}
                  onChange={(e) => setVitalData({...vitalData, spo2: parseInt(e.target.value) || 0})}
                  className="w-full border rounded px-3 py-2"
                  max="100"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">EtCO2 (mmHg)</label>
                <input
                  type="number"
                  value={vitalData.etco2}
                  onChange={(e) => setVitalData({...vitalData, etco2: parseInt(e.target.value) || 0})}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Temp (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={vitalData.temperature}
                  onChange={(e) => setVitalData({...vitalData, temperature: parseFloat(e.target.value) || 0})}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={recordVitals}
                disabled={saving}
                className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? 'Recording...' : 'Record Vitals'}
              </button>
              <button
                onClick={() => setShowVitalsDialog(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
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
