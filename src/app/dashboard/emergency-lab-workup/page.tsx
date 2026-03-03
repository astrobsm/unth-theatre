'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  FlaskConical,
  Bell,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  Plus,
  Volume2,
  Eye,
  Beaker,
  TestTube,
  Send,
  RefreshCw,
} from 'lucide-react';

interface LabTest {
  id: string;
  testName: string;
  testCategory: string;
  sampleCollected: boolean;
  sampleCollectedAt: string | null;
  sampleCollectedBy: { fullName: string } | null;
  receivedAtLabAt: string | null;
  receivedByLab: { fullName: string } | null;
  processingStartedAt: string | null;
  resultValue: string | null;
  resultUnit: string | null;
  referenceRange: string | null;
  abnormalResult: boolean;
  criticalResult: boolean;
  resultNotes: string | null;
  resultEnteredBy: { fullName: string } | null;
  resultEnteredAt: string | null;
  resultVerifiedBy: { fullName: string } | null;
  viewedBySurgeon: boolean;
  viewedByAnaesthetist: boolean;
  status: string;
  turnaroundMinutes: number | null;
}

interface LabRequest {
  id: string;
  patientName: string;
  folderNumber: string;
  age: number | null;
  gender: string | null;
  ward: string | null;
  diagnosis: string | null;
  priority: string;
  clinicalIndication: string;
  status: string;
  requestedByName: string;
  requestedAt: string;
  voiceNotificationSent: boolean;
  emergencyBooking: { procedureName: string; priority: string } | null;
  surgery: { procedureName: string; status: string } | null;
  labTests: LabTest[];
  requestedBy: { fullName: string; role: string };
}

interface VoiceNotification {
  id: string;
  isVoiceNotification: boolean;
  voiceMessage: string;
  pushTitle: string;
  pushMessage: string;
  notificationType: string;
  acknowledged: boolean;
  voicePlayed: boolean;
  emergencyLabRequest: {
    id: string;
    patientName: string;
    folderNumber: string;
    priority: string;
  };
}

const TEST_CATEGORIES = [
  { value: 'HEMATOLOGY', label: 'Hematology', tests: ['FBC', 'ESR', 'Blood Film', 'Reticulocyte Count', 'HbSS Genotype'] },
  { value: 'BIOCHEMISTRY', label: 'Biochemistry', tests: ['U&E', 'LFT', 'Glucose', 'Lipid Profile', 'Serum Amylase', 'Cardiac Enzymes', 'TFT', 'Serum Proteins'] },
  { value: 'COAGULATION', label: 'Coagulation', tests: ['PT/INR', 'aPTT', 'Bleeding Time', 'Clotting Time', 'D-Dimer', 'Fibrinogen'] },
  { value: 'BLOOD_GAS', label: 'Blood Gas', tests: ['ABG', 'VBG', 'Lactate'] },
  { value: 'CROSS_MATCH', label: 'Cross Match', tests: ['Group & Cross-match', 'Blood Grouping', 'Antibody Screen'] },
  { value: 'URINALYSIS', label: 'Urinalysis', tests: ['Urinalysis', 'Urine MCS', 'Urine Pregnancy Test'] },
  { value: 'MICROBIOLOGY', label: 'Microbiology', tests: ['Blood Culture', 'Wound Swab MCS', 'Sputum MCS'] },
  { value: 'SEROLOGY', label: 'Serology', tests: ['HIV Screening', 'HBsAg', 'HCV', 'VDRL'] },
  { value: 'RADIOLOGY', label: 'Radiology', tests: ['Chest X-ray', 'Abdominal X-ray', 'CT Scan', 'Ultrasound'] },
  { value: 'ECG', label: 'ECG', tests: ['12-Lead ECG', 'Rhythm Strip'] },
  { value: 'OTHER', label: 'Other', tests: [] },
];

const STATUS_COLORS: Record<string, string> = {
  REQUESTED: 'bg-yellow-100 text-yellow-800',
  NOTIFIED: 'bg-blue-100 text-blue-800',
  SAMPLE_COLLECTION_DISPATCHED: 'bg-indigo-100 text-indigo-800',
  SAMPLE_COLLECTED: 'bg-purple-100 text-purple-800',
  SAMPLE_RECEIVED_AT_LAB: 'bg-cyan-100 text-cyan-800',
  PROCESSING: 'bg-orange-100 text-orange-800',
  RESULTS_READY: 'bg-green-100 text-green-800',
  RESULTS_VERIFIED: 'bg-emerald-100 text-emerald-800',
  RESULTS_VIEWED: 'bg-gray-100 text-gray-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-600 text-white animate-pulse',
  URGENT: 'bg-orange-500 text-white',
  ROUTINE: 'bg-blue-500 text-white',
};

export default function EmergencyLabWorkupPage() {
  const { data: session } = useSession();
  const [requests, setRequests] = useState<LabRequest[]>([]);
  const [notifications, setNotifications] = useState<VoiceNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showResultsForm, setShowResultsForm] = useState<{ requestId: string; testId: string } | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<LabRequest | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    patientName: '',
    folderNumber: '',
    age: '',
    gender: '',
    ward: '',
    diagnosis: '',
    priority: 'CRITICAL',
    clinicalIndication: '',
    specialInstructions: '',
    selectedTests: [] as { testName: string; testCategory: string; sampleType: string }[],
  });

  // Result entry form
  const [resultData, setResultData] = useState({
    resultValue: '',
    resultUnit: '',
    referenceRange: '',
    abnormalResult: false,
    criticalResult: false,
    resultNotes: '',
  });

  const fetchRequests = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterPriority) params.set('priority', filterPriority);

      const res = await fetch(`/api/emergency-lab-workup?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRequests(data);
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterPriority]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/emergency-lab-workup/notifications?unacknowledged=true&voice=true');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
        // Auto-play voice for new notifications
        data.forEach((n: VoiceNotification) => {
          if (n.isVoiceNotification && !n.voicePlayed && n.voiceMessage) {
            playVoiceAlert(n);
          }
        });
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
    fetchNotifications();
    // Poll every 15 seconds for new notifications
    const interval = setInterval(() => {
      fetchRequests();
      fetchNotifications();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchRequests, fetchNotifications]);

  const playVoiceAlert = async (notification: VoiceNotification) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(notification.voiceMessage);
      utterance.rate = 1.0;
      utterance.pitch = 1.2;
      utterance.volume = 1;
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);

      // Mark as played
      await fetch('/api/emergency-lab-workup/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: notification.id, action: 'VOICE_PLAYED' }),
      });
    }
  };

  const acknowledgeNotification = async (notificationId: string) => {
    await fetch('/api/emergency-lab-workup/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId, action: 'ACKNOWLEDGE' }),
    });
    fetchNotifications();
  };

  const handleAddTest = (testName: string, testCategory: string) => {
    if (!formData.selectedTests.find(t => t.testName === testName)) {
      setFormData(prev => ({
        ...prev,
        selectedTests: [...prev.selectedTests, { testName, testCategory, sampleType: 'Blood' }],
      }));
    }
  };

  const handleRemoveTest = (testName: string) => {
    setFormData(prev => ({
      ...prev,
      selectedTests: prev.selectedTests.filter(t => t.testName !== testName),
    }));
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/emergency-lab-workup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          age: formData.age ? parseInt(formData.age) : undefined,
          tests: formData.selectedTests,
        }),
      });

      if (res.ok) {
        setShowCreateForm(false);
        setFormData({
          patientName: '', folderNumber: '', age: '', gender: '', ward: '',
          diagnosis: '', priority: 'CRITICAL', clinicalIndication: '', specialInstructions: '',
          selectedTests: [],
        });
        fetchRequests();
      }
    } catch (error) {
      console.error('Error creating request:', error);
    }
  };

  const handleAction = async (requestId: string, testId: string, action: string, extraData?: any) => {
    try {
      const res = await fetch(`/api/emergency-lab-workup/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, testId, ...extraData }),
      });
      if (res.ok) {
        fetchRequests();
      }
    } catch (error) {
      console.error('Error performing action:', error);
    }
  };

  const handleSubmitResults = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showResultsForm) return;
    await handleAction(showResultsForm.requestId, showResultsForm.testId, 'ENTER_RESULTS', resultData);
    setShowResultsForm(null);
    setResultData({ resultValue: '', resultUnit: '', referenceRange: '', abnormalResult: false, criticalResult: false, resultNotes: '' });
  };

  const isLabStaff = session?.user?.role === 'LABORATORY_STAFF';
  const isClinician = ['SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'].includes(session?.user?.role || '');

  return (
    <div className="space-y-6">
      {/* Voice Notification Banner */}
      {notifications.length > 0 && (
        <div className="bg-red-50 border-2 border-red-500 rounded-xl p-4 animate-pulse">
          <div className="flex items-center gap-3 mb-3">
            <Volume2 className="w-8 h-8 text-red-600 animate-bounce" />
            <h3 className="text-lg font-bold text-red-800">
              🔊 EMERGENCY LAB ALERTS ({notifications.length})
            </h3>
          </div>
          {notifications.map(n => (
            <div key={n.id} className="flex items-center justify-between bg-white rounded-lg p-3 mb-2 border border-red-200">
              <div>
                <p className="font-bold text-red-800">{n.pushTitle}</p>
                <p className="text-sm text-red-600">{n.pushMessage}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => playVoiceAlert(n)}
                  className="px-3 py-1 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 flex items-center gap-1"
                >
                  <Volume2 className="w-4 h-4" /> Play
                </button>
                <button
                  onClick={() => acknowledgeNotification(n.id)}
                  className="px-3 py-1 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                >
                  Acknowledge
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <FlaskConical className="w-8 h-8 text-purple-600" />
            Emergency Lab Workup
          </h1>
          <p className="text-gray-600 mt-1">
            Priority lab investigations for emergency surgeries with voice notifications
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { fetchRequests(); fetchNotifications(); }}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          {!isLabStaff && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 flex items-center gap-2 font-semibold shadow-lg"
            >
              <Plus className="w-5 h-5" /> Request Emergency Lab Workup
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{requests.filter(r => r.status === 'REQUESTED' || r.status === 'NOTIFIED').length}</p>
              <p className="text-xs text-gray-500">Pending</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <TestTube className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{requests.filter(r => r.status === 'SAMPLE_COLLECTED' || r.status === 'SAMPLE_RECEIVED_AT_LAB').length}</p>
              <p className="text-xs text-gray-500">In Lab</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <Beaker className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{requests.filter(r => r.status === 'PROCESSING').length}</p>
              <p className="text-xs text-gray-500">Processing</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{requests.filter(r => r.status === 'RESULTS_READY' || r.status === 'RESULTS_VIEWED').length}</p>
              <p className="text-xs text-gray-500">Results Ready</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{requests.filter(r => r.priority === 'CRITICAL').length}</p>
              <p className="text-xs text-gray-500">Critical</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 bg-white rounded-xl shadow-sm border p-4">
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm"
        >
          <option value="">All Statuses</option>
          <option value="REQUESTED">Requested</option>
          <option value="NOTIFIED">Notified</option>
          <option value="SAMPLE_COLLECTED">Sample Collected</option>
          <option value="SAMPLE_RECEIVED_AT_LAB">In Lab</option>
          <option value="PROCESSING">Processing</option>
          <option value="RESULTS_READY">Results Ready</option>
          <option value="RESULTS_VIEWED">Results Viewed</option>
        </select>
        <select
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm"
        >
          <option value="">All Priorities</option>
          <option value="CRITICAL">Critical</option>
          <option value="URGENT">Urgent</option>
          <option value="ROUTINE">Routine</option>
        </select>
      </div>

      {/* Request List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl shadow-sm border">
          <FlaskConical className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-500">No Emergency Lab Requests</h3>
          <p className="text-gray-400">Emergency lab workup requests will appear here</p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map(req => (
            <div
              key={req.id}
              className={`bg-white rounded-xl shadow-sm border-2 p-6 ${
                req.priority === 'CRITICAL' ? 'border-red-400' : 
                req.priority === 'URGENT' ? 'border-orange-400' : 'border-gray-200'
              }`}
            >
              {/* Request Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${PRIORITY_COLORS[req.priority]}`}>
                    {req.priority}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[req.status] || 'bg-gray-100'}`}>
                    {req.status.replace(/_/g, ' ')}
                  </span>
                  <h3 className="text-lg font-bold text-gray-900">{req.patientName}</h3>
                  <span className="text-sm text-gray-500">({req.folderNumber})</span>
                </div>
                <div className="text-right text-sm text-gray-500">
                  <p>Requested by: {req.requestedBy.fullName}</p>
                  <p>{new Date(req.requestedAt).toLocaleString()}</p>
                </div>
              </div>

              {/* Patient Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 p-3 bg-gray-50 rounded-lg text-sm">
                {req.age && <div><span className="text-gray-500">Age:</span> {req.age}</div>}
                {req.gender && <div><span className="text-gray-500">Gender:</span> {req.gender}</div>}
                {req.ward && <div><span className="text-gray-500">Ward:</span> {req.ward}</div>}
                {req.diagnosis && <div><span className="text-gray-500">Diagnosis:</span> {req.diagnosis}</div>}
                <div className="col-span-2"><span className="text-gray-500">Indication:</span> {req.clinicalIndication}</div>
              </div>

              {/* Tests Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-3 font-semibold">Test</th>
                      <th className="text-left p-3 font-semibold">Category</th>
                      <th className="text-left p-3 font-semibold">Status</th>
                      <th className="text-left p-3 font-semibold">Result</th>
                      <th className="text-left p-3 font-semibold">Reference</th>
                      <th className="text-left p-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {req.labTests.map(test => (
                      <tr key={test.id} className={`border-t ${test.criticalResult ? 'bg-red-50' : test.abnormalResult ? 'bg-yellow-50' : ''}`}>
                        <td className="p-3 font-medium">{test.testName}</td>
                        <td className="p-3 text-gray-600">{test.testCategory.replace(/_/g, ' ')}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLORS[test.status] || 'bg-gray-100'}`}>
                            {test.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="p-3">
                          {test.resultValue ? (
                            <span className={`font-bold ${test.criticalResult ? 'text-red-700' : test.abnormalResult ? 'text-orange-700' : 'text-green-700'}`}>
                              {test.resultValue} {test.resultUnit || ''}
                              {test.criticalResult && ' 🚨'}
                              {test.abnormalResult && !test.criticalResult && ' ⚠️'}
                            </span>
                          ) : (
                            <span className="text-gray-400">Pending</span>
                          )}
                        </td>
                        <td className="p-3 text-gray-500">{test.referenceRange || '-'}</td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            {/* Lab Staff Actions */}
                            {isLabStaff && !test.sampleCollected && (
                              <button
                                onClick={() => handleAction(req.id, test.id, 'COLLECT_SAMPLE')}
                                className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                              >
                                Collect Sample
                              </button>
                            )}
                            {isLabStaff && test.sampleCollected && !test.receivedAtLabAt && (
                              <button
                                onClick={() => handleAction(req.id, test.id, 'RECEIVE_SAMPLE')}
                                className="px-2 py-1 bg-cyan-600 text-white rounded text-xs hover:bg-cyan-700"
                              >
                                Receive at Lab
                              </button>
                            )}
                            {isLabStaff && test.receivedAtLabAt && !test.resultValue && (
                              <>
                                {!test.processingStartedAt && (
                                  <button
                                    onClick={() => handleAction(req.id, test.id, 'START_PROCESSING')}
                                    className="px-2 py-1 bg-orange-600 text-white rounded text-xs hover:bg-orange-700"
                                  >
                                    Start Processing
                                  </button>
                                )}
                                <button
                                  onClick={() => setShowResultsForm({ requestId: req.id, testId: test.id })}
                                  className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                                >
                                  Enter Results
                                </button>
                              </>
                            )}
                            {/* Clinician Actions */}
                            {isClinician && test.resultValue && (
                              <button
                                onClick={() => handleAction(req.id, test.id, 'VIEW_RESULTS')}
                                className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 flex items-center gap-1"
                              >
                                <Eye className="w-3 h-3" /> View
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Turnaround Time */}
              {req.labTests.some(t => t.turnaroundMinutes) && (
                <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
                  <Clock className="w-4 h-4" />
                  Avg turnaround: {Math.round(
                    req.labTests.filter(t => t.turnaroundMinutes).reduce((a, t) => a + (t.turnaroundMinutes || 0), 0) /
                    req.labTests.filter(t => t.turnaroundMinutes).length
                  )} min
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Request Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                <FlaskConical className="w-7 h-7 text-purple-600" />
                Request Emergency Lab Workup
              </h2>
              <button onClick={() => setShowCreateForm(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="space-y-6">
              {/* Patient Info */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Patient Name *</label>
                  <input
                    type="text" required
                    value={formData.patientName}
                    onChange={e => setFormData(prev => ({ ...prev, patientName: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Folder Number *</label>
                  <input
                    type="text" required
                    value={formData.folderNumber}
                    onChange={e => setFormData(prev => ({ ...prev, folderNumber: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Age</label>
                  <input
                    type="number"
                    value={formData.age}
                    onChange={e => setFormData(prev => ({ ...prev, age: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Gender</label>
                  <select
                    value={formData.gender}
                    onChange={e => setFormData(prev => ({ ...prev, gender: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Ward</label>
                  <input
                    type="text"
                    value={formData.ward}
                    onChange={e => setFormData(prev => ({ ...prev, ward: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Diagnosis</label>
                  <input
                    type="text"
                    value={formData.diagnosis}
                    onChange={e => setFormData(prev => ({ ...prev, diagnosis: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              {/* Priority & Indication */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Priority *</label>
                  <select
                    value={formData.priority}
                    onChange={e => setFormData(prev => ({ ...prev, priority: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="CRITICAL">🚨 CRITICAL</option>
                    <option value="URGENT">⚠️ URGENT</option>
                    <option value="ROUTINE">📋 ROUTINE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Clinical Indication *</label>
                  <input
                    type="text" required
                    value={formData.clinicalIndication}
                    onChange={e => setFormData(prev => ({ ...prev, clinicalIndication: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="e.g., Emergency appendectomy - rule out infection"
                  />
                </div>
              </div>

              {/* Test Selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">Select Investigations *</label>
                <div className="space-y-3">
                  {TEST_CATEGORIES.map(cat => (
                    <div key={cat.value} className="border rounded-lg p-3">
                      <p className="font-semibold text-sm text-gray-800 mb-2">{cat.label}</p>
                      <div className="flex flex-wrap gap-2">
                        {cat.tests.map(test => {
                          const isSelected = formData.selectedTests.some(t => t.testName === test);
                          return (
                            <button
                              key={test}
                              type="button"
                              onClick={() => isSelected ? handleRemoveTest(test) : handleAddTest(test, cat.value)}
                              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                                isSelected
                                  ? 'bg-purple-600 text-white'
                                  : 'bg-gray-100 text-gray-700 hover:bg-purple-100'
                              }`}
                            >
                              {isSelected ? '✓ ' : ''}{test}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {formData.selectedTests.length > 0 && (
                  <div className="mt-3 p-3 bg-purple-50 rounded-lg">
                    <p className="text-sm font-semibold text-purple-800">
                      Selected Tests ({formData.selectedTests.length}):
                    </p>
                    <p className="text-sm text-purple-600">
                      {formData.selectedTests.map(t => t.testName).join(', ')}
                    </p>
                  </div>
                )}
              </div>

              {/* Special Instructions */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Special Instructions</label>
                <textarea
                  value={formData.specialInstructions}
                  onChange={e => setFormData(prev => ({ ...prev, specialInstructions: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={2}
                  placeholder="Any special instructions for the lab..."
                />
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formData.selectedTests.length === 0}
                  className="px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 flex items-center gap-2 font-semibold disabled:opacity-50"
                >
                  <Send className="w-5 h-5" /> Submit & Notify Lab
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Results Entry Modal */}
      {showResultsForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Beaker className="w-6 h-6 text-green-600" />
              Enter Investigation Results
            </h2>
            <form onSubmit={handleSubmitResults} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Result Value *</label>
                <input
                  type="text" required
                  value={resultData.resultValue}
                  onChange={e => setResultData(prev => ({ ...prev, resultValue: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="e.g., 12.5"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Unit</label>
                  <input
                    type="text"
                    value={resultData.resultUnit}
                    onChange={e => setResultData(prev => ({ ...prev, resultUnit: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="e.g., g/dL, mmol/L"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Reference Range</label>
                  <input
                    type="text"
                    value={resultData.referenceRange}
                    onChange={e => setResultData(prev => ({ ...prev, referenceRange: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="e.g., 11.5-16.0"
                  />
                </div>
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={resultData.abnormalResult}
                    onChange={e => setResultData(prev => ({ ...prev, abnormalResult: e.target.checked }))}
                    className="w-4 h-4 text-orange-600"
                  />
                  <span className="text-sm font-medium text-orange-700">⚠️ Abnormal</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={resultData.criticalResult}
                    onChange={e => setResultData(prev => ({ ...prev, criticalResult: e.target.checked }))}
                    className="w-4 h-4 text-red-600"
                  />
                  <span className="text-sm font-medium text-red-700">🚨 Critical</span>
                </label>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Lab Scientist Notes</label>
                <textarea
                  value={resultData.resultNotes}
                  onChange={e => setResultData(prev => ({ ...prev, resultNotes: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={2}
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowResultsForm(null)} className="px-4 py-2 bg-gray-200 rounded-lg">
                  Cancel
                </button>
                <button type="submit" className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold">
                  Submit Results
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
