'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
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
  FileCheck,
  ClipboardCheck,
  Microscope,
  Upload,
  CheckCheck,
  Loader2,
  Activity,
  ArrowRight,
  Clipboard,
  Download,
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
  acknowledgedAt: string | null;
  acknowledgedBy: { fullName: string; role: string } | null;
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
  ACKNOWLEDGED: 'bg-teal-100 text-teal-800',
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

  // Bulk result entry
  const [showBulkResultsForm, setShowBulkResultsForm] = useState<string | null>(null);
  const [bulkResults, setBulkResults] = useState<Record<string, {
    resultValue: string;
    resultUnit: string;
    referenceRange: string;
    abnormalResult: boolean;
    criticalResult: boolean;
    resultNotes: string;
  }>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'in-lab' | 'processing' | 'results'>('all');

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
    const actionKey = `${requestId}-${testId}-${action}`;
    setActionLoading(actionKey);
    try {
      const res = await fetch(`/api/emergency-lab-workup/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, testId, ...extraData }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.message || 'Action completed successfully');
        fetchRequests();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Action failed');
      }
    } catch (error) {
      console.error('Error performing action:', error);
      toast.error('Network error - please try again');
    } finally {
      setActionLoading(null);
    }
  };

  // Bulk action handler (no testId needed)
  const handleBulkAction = async (requestId: string, action: string, extraData?: any) => {
    const actionKey = `${requestId}-bulk-${action}`;
    setActionLoading(actionKey);
    try {
      const res = await fetch(`/api/emergency-lab-workup/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extraData }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.message || 'Bulk action completed');
        fetchRequests();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Bulk action failed');
      }
    } catch (error) {
      console.error('Error performing bulk action:', error);
      toast.error('Network error');
    } finally {
      setActionLoading(null);
    }
  };

  // Initialize bulk results form for a request
  const initBulkResults = (req: LabRequest) => {
    const initial: Record<string, any> = {};
    req.labTests
      .filter(t => !t.resultValue && (t.receivedAtLabAt || t.processingStartedAt))
      .forEach(t => {
        initial[t.id] = {
          resultValue: '',
          resultUnit: '',
          referenceRange: '',
          abnormalResult: false,
          criticalResult: false,
          resultNotes: '',
        };
      });
    setBulkResults(initial);
    setShowBulkResultsForm(req.id);
  };

  // Submit bulk results
  const handleSubmitBulkResults = async () => {
    if (!showBulkResultsForm) return;
    const results = Object.entries(bulkResults)
      .filter(([, v]) => v.resultValue.trim())
      .map(([testId, v]) => ({ testId, ...v }));
    if (results.length === 0) {
      toast.error('Please enter at least one result value');
      return;
    }
    await handleBulkAction(showBulkResultsForm, 'BULK_ENTER_RESULTS', { results });
    setShowBulkResultsForm(null);
    setBulkResults({});
  };

  const handleSubmitResults = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showResultsForm) return;
    await handleAction(showResultsForm.requestId, showResultsForm.testId, 'ENTER_RESULTS', resultData);
    setShowResultsForm(null);
    setResultData({ resultValue: '', resultUnit: '', referenceRange: '', abnormalResult: false, criticalResult: false, resultNotes: '' });
  };

  const isLabStaff = session?.user?.role === 'LABORATORY_STAFF';
  const isAdmin = session?.user?.role === 'ADMIN' || session?.user?.role === 'THEATRE_MANAGER';
  const isClinician = ['SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'].includes(session?.user?.role || '');

  // Filter requests by active tab
  const filteredByTab = requests.filter(req => {
    switch (activeTab) {
      case 'pending': return ['REQUESTED', 'NOTIFIED', 'ACKNOWLEDGED'].includes(req.status);
      case 'in-lab': return ['SAMPLE_COLLECTED', 'SAMPLE_RECEIVED_AT_LAB', 'SAMPLE_COLLECTION_DISPATCHED'].includes(req.status);
      case 'processing': return req.status === 'PROCESSING';
      case 'results': return ['RESULTS_READY', 'RESULTS_VERIFIED', 'RESULTS_VIEWED'].includes(req.status);
      default: return true;
    }
  });

  // Get workflow step for a request
  const getWorkflowStep = (req: LabRequest) => {
    const steps = [
      { key: 'REQUESTED', label: 'Requested', icon: Clipboard },
      { key: 'ACKNOWLEDGED', label: 'Acknowledged', icon: ClipboardCheck },
      { key: 'SAMPLE_COLLECTED', label: 'Sample Collected', icon: TestTube },
      { key: 'SAMPLE_RECEIVED_AT_LAB', label: 'Received at Lab', icon: FlaskConical },
      { key: 'PROCESSING', label: 'Processing', icon: Microscope },
      { key: 'RESULTS_READY', label: 'Results Ready', icon: FileCheck },
      { key: 'RESULTS_VERIFIED', label: 'Verified', icon: CheckCheck },
    ];
    const statusOrder = steps.map(s => s.key);
    const currentIdx = statusOrder.indexOf(req.status);
    return { steps, currentIdx };
  };

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
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
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
            <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{requests.filter(r => r.status === 'ACKNOWLEDGED').length}</p>
              <p className="text-xs text-gray-500">Acknowledged</p>
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
              <Microscope className="w-5 h-5 text-orange-600" />
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
              <p className="text-2xl font-bold">{requests.filter(r => r.status === 'RESULTS_READY' || r.status === 'RESULTS_VERIFIED' || r.status === 'RESULTS_VIEWED').length}</p>
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

      {/* Lab Scientist Workflow Tabs */}
      {(isLabStaff || isAdmin) && (
        <div className="bg-white rounded-xl shadow-sm border p-2">
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: 'All Requests', count: requests.length, color: 'gray' },
              { key: 'pending', label: '🔔 Awaiting Acknowledgement', count: requests.filter(r => ['REQUESTED', 'NOTIFIED', 'ACKNOWLEDGED'].includes(r.status)).length, color: 'yellow' },
              { key: 'in-lab', label: '🧪 Samples In Lab', count: requests.filter(r => ['SAMPLE_COLLECTED', 'SAMPLE_RECEIVED_AT_LAB', 'SAMPLE_COLLECTION_DISPATCHED'].includes(r.status)).length, color: 'blue' },
              { key: 'processing', label: '🔬 Processing', count: requests.filter(r => r.status === 'PROCESSING').length, color: 'orange' },
              { key: 'results', label: '✅ Results', count: requests.filter(r => ['RESULTS_READY', 'RESULTS_VERIFIED', 'RESULTS_VIEWED'].includes(r.status)).length, color: 'green' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  activeTab === tab.key
                    ? `bg-${tab.color}-600 text-white shadow-md`
                    : `bg-${tab.color}-50 text-${tab.color}-700 hover:bg-${tab.color}-100`
                }`}
              >
                {tab.label}
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  activeTab === tab.key ? 'bg-white/20' : `bg-${tab.color}-200`
                }`}>{tab.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

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
          <option value="ACKNOWLEDGED">Acknowledged</option>
          <option value="SAMPLE_COLLECTED">Sample Collected</option>
          <option value="SAMPLE_RECEIVED_AT_LAB">In Lab</option>
          <option value="PROCESSING">Processing</option>
          <option value="RESULTS_READY">Results Ready</option>
          <option value="RESULTS_VERIFIED">Results Verified</option>
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
      ) : filteredByTab.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl shadow-sm border">
          <FlaskConical className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-500">
            {activeTab === 'all' ? 'No Emergency Lab Requests' : `No ${activeTab} requests`}
          </h3>
          <p className="text-gray-400">
            {activeTab === 'all' ? 'Emergency lab workup requests will appear here' : 'No requests in this category'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredByTab.map(req => {
            const { steps, currentIdx } = getWorkflowStep(req);
            const pendingTests = req.labTests.filter(t => !t.resultValue);
            const completedTests = req.labTests.filter(t => t.resultValue);
            const allSamplesCollected = req.labTests.every(t => t.sampleCollected);
            const allReceived = req.labTests.every(t => t.receivedAtLabAt);
            const allProcessing = req.labTests.every(t => t.processingStartedAt);
            const needsAcknowledge = ['REQUESTED', 'NOTIFIED'].includes(req.status);
            const canReceiveAll = req.labTests.some(t => t.sampleCollected && !t.receivedAtLabAt);
            const canProcessAll = req.labTests.some(t => t.receivedAtLabAt && !t.processingStartedAt && !t.resultValue);
            const canBulkEnterResults = req.labTests.some(t => (t.receivedAtLabAt || t.processingStartedAt) && !t.resultValue);

            return (
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
                  {req.acknowledgedBy && (
                    <p className="text-teal-700 font-medium">
                      ✅ Acknowledged by: {req.acknowledgedBy.fullName}
                      {req.acknowledgedAt && ` at ${new Date(req.acknowledgedAt).toLocaleTimeString()}`}
                    </p>
                  )}
                </div>
              </div>

              {/* Workflow Progress Bar (Lab Staff & Admin) */}
              {(isLabStaff || isAdmin) && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    {steps.map((step, idx) => {
                      const StepIcon = step.icon;
                      const isCompleted = idx <= currentIdx;
                      const isCurrent = idx === currentIdx;
                      return (
                        <div key={step.key} className="flex items-center flex-1">
                          <div className={`flex flex-col items-center ${isCurrent ? 'scale-110' : ''}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                              isCompleted
                                ? isCurrent ? 'bg-purple-600 text-white ring-4 ring-purple-200' : 'bg-green-500 text-white'
                                : 'bg-gray-200 text-gray-500'
                            }`}>
                              {isCompleted && !isCurrent ? <CheckCircle className="w-4 h-4" /> : <StepIcon className="w-4 h-4" />}
                            </div>
                            <span className={`text-[10px] mt-1 text-center leading-tight ${
                              isCurrent ? 'font-bold text-purple-700' : isCompleted ? 'text-green-700' : 'text-gray-400'
                            }`}>{step.label}</span>
                          </div>
                          {idx < steps.length - 1 && (
                            <div className={`flex-1 h-0.5 mx-1 ${idx < currentIdx ? 'bg-green-400' : 'bg-gray-200'}`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Patient Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 p-3 bg-gray-50 rounded-lg text-sm">
                {req.age && <div><span className="text-gray-500">Age:</span> {req.age}</div>}
                {req.gender && <div><span className="text-gray-500">Gender:</span> {req.gender}</div>}
                {req.ward && <div><span className="text-gray-500">Ward:</span> {req.ward}</div>}
                {req.diagnosis && <div><span className="text-gray-500">Diagnosis:</span> {req.diagnosis}</div>}
                <div className="col-span-2"><span className="text-gray-500">Indication:</span> {req.clinicalIndication}</div>
              </div>

              {/* Lab Scientist Bulk Actions */}
              {(isLabStaff || isAdmin) && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {needsAcknowledge && (
                    <button
                      onClick={() => handleBulkAction(req.id, 'ACKNOWLEDGE')}
                      disabled={actionLoading === `${req.id}-bulk-ACKNOWLEDGE`}
                      className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 flex items-center gap-2 shadow-sm disabled:opacity-50 transition-all"
                    >
                      {actionLoading === `${req.id}-bulk-ACKNOWLEDGE` ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ClipboardCheck className="w-4 h-4" />
                      )}
                      Acknowledge Request
                    </button>
                  )}
                  {needsAcknowledge && (
                    <button
                      onClick={() => handleBulkAction(req.id, 'ACKNOWLEDGE_AND_COLLECT_ALL')}
                      disabled={actionLoading === `${req.id}-bulk-ACKNOWLEDGE_AND_COLLECT_ALL`}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 flex items-center gap-2 shadow-sm disabled:opacity-50 transition-all"
                    >
                      {actionLoading === `${req.id}-bulk-ACKNOWLEDGE_AND_COLLECT_ALL` ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <TestTube className="w-4 h-4" />
                      )}
                      Acknowledge & Collect All Samples
                    </button>
                  )}
                  {canReceiveAll && (
                    <button
                      onClick={() => handleBulkAction(req.id, 'RECEIVE_ALL_SAMPLES')}
                      disabled={actionLoading === `${req.id}-bulk-RECEIVE_ALL_SAMPLES`}
                      className="px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-semibold hover:bg-cyan-700 flex items-center gap-2 shadow-sm disabled:opacity-50 transition-all"
                    >
                      {actionLoading === `${req.id}-bulk-RECEIVE_ALL_SAMPLES` ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      Receive All Samples at Lab
                    </button>
                  )}
                  {canProcessAll && (
                    <button
                      onClick={() => handleBulkAction(req.id, 'START_PROCESSING_ALL')}
                      disabled={actionLoading === `${req.id}-bulk-START_PROCESSING_ALL`}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700 flex items-center gap-2 shadow-sm disabled:opacity-50 transition-all"
                    >
                      {actionLoading === `${req.id}-bulk-START_PROCESSING_ALL` ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Microscope className="w-4 h-4" />
                      )}
                      Start Processing All
                    </button>
                  )}
                  {canBulkEnterResults && (
                    <button
                      onClick={() => initBulkResults(req)}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 flex items-center gap-2 shadow-sm transition-all"
                    >
                      <Upload className="w-4 h-4" />
                      Upload All Results
                    </button>
                  )}
                </div>
              )}

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
                      <th className="text-left p-3 font-semibold">Lab Info</th>
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
                            <span className="text-gray-400 italic">Pending</span>
                          )}
                        </td>
                        <td className="p-3 text-gray-500">{test.referenceRange || '-'}</td>
                        <td className="p-3 text-xs text-gray-500">
                          {test.sampleCollectedBy && (
                            <div>Collected: {test.sampleCollectedBy.fullName}</div>
                          )}
                          {test.receivedByLab && (
                            <div>Received: {test.receivedByLab.fullName}</div>
                          )}
                          {test.resultEnteredBy && (
                            <div>Result by: {test.resultEnteredBy.fullName}</div>
                          )}
                          {test.resultVerifiedBy && (
                            <div className="text-green-700 font-semibold">Verified: {test.resultVerifiedBy.fullName}</div>
                          )}
                          {test.turnaroundMinutes && (
                            <div className="text-purple-600">TAT: {test.turnaroundMinutes}min</div>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {/* Lab Staff Individual Actions */}
                            {(isLabStaff || isAdmin) && !test.sampleCollected && (
                              <button
                                onClick={() => handleAction(req.id, test.id, 'COLLECT_SAMPLE')}
                                disabled={actionLoading === `${req.id}-${test.id}-COLLECT_SAMPLE`}
                                className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 flex items-center gap-1 disabled:opacity-50"
                              >
                                {actionLoading === `${req.id}-${test.id}-COLLECT_SAMPLE` ? <Loader2 className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />}
                                Collect
                              </button>
                            )}
                            {(isLabStaff || isAdmin) && test.sampleCollected && !test.receivedAtLabAt && (
                              <button
                                onClick={() => handleAction(req.id, test.id, 'RECEIVE_SAMPLE')}
                                disabled={actionLoading === `${req.id}-${test.id}-RECEIVE_SAMPLE`}
                                className="px-2 py-1 bg-cyan-600 text-white rounded text-xs hover:bg-cyan-700 flex items-center gap-1 disabled:opacity-50"
                              >
                                {actionLoading === `${req.id}-${test.id}-RECEIVE_SAMPLE` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                                Receive
                              </button>
                            )}
                            {(isLabStaff || isAdmin) && test.receivedAtLabAt && !test.processingStartedAt && !test.resultValue && (
                              <button
                                onClick={() => handleAction(req.id, test.id, 'START_PROCESSING')}
                                disabled={actionLoading === `${req.id}-${test.id}-START_PROCESSING`}
                                className="px-2 py-1 bg-orange-600 text-white rounded text-xs hover:bg-orange-700 flex items-center gap-1 disabled:opacity-50"
                              >
                                {actionLoading === `${req.id}-${test.id}-START_PROCESSING` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Microscope className="w-3 h-3" />}
                                Process
                              </button>
                            )}
                            {(isLabStaff || isAdmin) && (test.receivedAtLabAt || test.processingStartedAt) && !test.resultValue && (
                              <button
                                onClick={() => setShowResultsForm({ requestId: req.id, testId: test.id })}
                                className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 flex items-center gap-1"
                              >
                                <Upload className="w-3 h-3" /> Enter Result
                              </button>
                            )}
                            {(isLabStaff || isAdmin) && test.resultValue && !test.resultVerifiedBy && (
                              <button
                                onClick={() => handleAction(req.id, test.id, 'VERIFY_RESULTS')}
                                disabled={actionLoading === `${req.id}-${test.id}-VERIFY_RESULTS`}
                                className="px-2 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700 flex items-center gap-1 disabled:opacity-50"
                              >
                                {actionLoading === `${req.id}-${test.id}-VERIFY_RESULTS` ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
                                Verify
                              </button>
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

              {/* Progress Summary */}
              <div className="mt-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-4">
                  <span className="text-gray-500">
                    <Activity className="w-4 h-4 inline mr-1" />
                    {completedTests.length}/{req.labTests.length} results uploaded
                  </span>
                  {req.labTests.some(t => t.turnaroundMinutes) && (
                    <span className="flex items-center gap-1 text-gray-500">
                      <Clock className="w-4 h-4" />
                      Avg TAT: {Math.round(
                        req.labTests.filter(t => t.turnaroundMinutes).reduce((a, t) => a + (t.turnaroundMinutes || 0), 0) /
                        req.labTests.filter(t => t.turnaroundMinutes).length
                      )} min
                    </span>
                  )}
                </div>
                {/* Progress bar */}
                <div className="flex items-center gap-2">
                  <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        completedTests.length === req.labTests.length ? 'bg-green-500' : 'bg-purple-500'
                      }`}
                      style={{ width: `${(completedTests.length / req.labTests.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500">
                    {Math.round((completedTests.length / req.labTests.length) * 100)}%
                  </span>
                </div>
              </div>
            </div>
            );
          })}
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
      {showResultsForm && (() => {
        const reqForResult = requests.find(r => r.id === showResultsForm.requestId);
        const testForResult = reqForResult?.labTests.find(t => t.id === showResultsForm.testId);
        return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
              <Beaker className="w-6 h-6 text-green-600" />
              Enter Investigation Results
            </h2>
            {testForResult && (
              <div className="mb-4 p-3 bg-purple-50 rounded-lg">
                <p className="font-semibold text-purple-800">{testForResult.testName}</p>
                <p className="text-sm text-purple-600">{testForResult.testCategory.replace(/_/g, ' ')} &bull; {reqForResult?.patientName} ({reqForResult?.folderNumber})</p>
              </div>
            )}
            <form onSubmit={handleSubmitResults} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Result Value *</label>
                <input
                  type="text" required
                  value={resultData.resultValue}
                  onChange={e => setResultData(prev => ({ ...prev, resultValue: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="e.g., 12.5, Positive, Reactive, A+"
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
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={resultData.abnormalResult}
                    onChange={e => setResultData(prev => ({ ...prev, abnormalResult: e.target.checked }))}
                    className="w-4 h-4 text-orange-600 rounded"
                  />
                  <span className="text-sm font-medium text-orange-700">⚠️ Abnormal</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={resultData.criticalResult}
                    onChange={e => setResultData(prev => ({ ...prev, criticalResult: e.target.checked }))}
                    className="w-4 h-4 text-red-600 rounded"
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
                  placeholder="Additional comments on the result..."
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowResultsForm(null)} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">
                  Cancel
                </button>
                <button type="submit" className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold flex items-center gap-2">
                  <Upload className="w-4 h-4" /> Submit Results
                </button>
              </div>
            </form>
          </div>
        </div>
        );
      })()}

      {/* Bulk Results Entry Modal */}
      {showBulkResultsForm && (() => {
        const reqForBulk = requests.find(r => r.id === showBulkResultsForm);
        const testsToFill = reqForBulk?.labTests.filter(t => !t.resultValue && (t.receivedAtLabAt || t.processingStartedAt)) || [];
        return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                <Upload className="w-7 h-7 text-green-600" />
                Upload All Investigation Results
              </h2>
              <button onClick={() => { setShowBulkResultsForm(null); setBulkResults({}); }} className="text-gray-400 hover:text-gray-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {reqForBulk && (
              <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-lg text-purple-900">{reqForBulk.patientName} ({reqForBulk.folderNumber})</p>
                    <p className="text-sm text-purple-700">{reqForBulk.diagnosis} &bull; {reqForBulk.ward}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${PRIORITY_COLORS[reqForBulk.priority]}`}>
                    {reqForBulk.priority}
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {testsToFill.map(test => (
                <div key={test.id} className="border rounded-xl p-4 bg-gray-50">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-bold">{test.testCategory.replace(/_/g, ' ')}</span>
                    <h4 className="font-bold text-gray-900">{test.testName}</h4>
                    {test.processingStartedAt && (
                      <span className="text-xs text-orange-600 flex items-center gap-1">
                        <Microscope className="w-3 h-3" /> Processing since {new Date(test.processingStartedAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Result *</label>
                      <input
                        type="text"
                        value={bulkResults[test.id]?.resultValue || ''}
                        onChange={e => setBulkResults(prev => ({
                          ...prev,
                          [test.id]: { ...prev[test.id], resultValue: e.target.value },
                        }))}
                        className="w-full px-2 py-1.5 border rounded-lg text-sm"
                        placeholder="Value"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Unit</label>
                      <input
                        type="text"
                        value={bulkResults[test.id]?.resultUnit || ''}
                        onChange={e => setBulkResults(prev => ({
                          ...prev,
                          [test.id]: { ...prev[test.id], resultUnit: e.target.value },
                        }))}
                        className="w-full px-2 py-1.5 border rounded-lg text-sm"
                        placeholder="g/dL"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Reference</label>
                      <input
                        type="text"
                        value={bulkResults[test.id]?.referenceRange || ''}
                        onChange={e => setBulkResults(prev => ({
                          ...prev,
                          [test.id]: { ...prev[test.id], referenceRange: e.target.value },
                        }))}
                        className="w-full px-2 py-1.5 border rounded-lg text-sm"
                        placeholder="11.5-16.0"
                      />
                    </div>
                    <div className="flex items-end gap-3">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={bulkResults[test.id]?.abnormalResult || false}
                          onChange={e => setBulkResults(prev => ({
                            ...prev,
                            [test.id]: { ...prev[test.id], abnormalResult: e.target.checked },
                          }))}
                          className="w-3.5 h-3.5 text-orange-600 rounded"
                        />
                        <span className="text-xs text-orange-700">⚠️ Abn</span>
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={bulkResults[test.id]?.criticalResult || false}
                          onChange={e => setBulkResults(prev => ({
                            ...prev,
                            [test.id]: { ...prev[test.id], criticalResult: e.target.checked },
                          }))}
                          className="w-3.5 h-3.5 text-red-600 rounded"
                        />
                        <span className="text-xs text-red-700">🚨 Crit</span>
                      </label>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
                      <input
                        type="text"
                        value={bulkResults[test.id]?.resultNotes || ''}
                        onChange={e => setBulkResults(prev => ({
                          ...prev,
                          [test.id]: { ...prev[test.id], resultNotes: e.target.value },
                        }))}
                        className="w-full px-2 py-1.5 border rounded-lg text-sm"
                        placeholder="Optional notes"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex gap-3 justify-between items-center">
              <p className="text-sm text-gray-500">
                {Object.values(bulkResults).filter(v => v.resultValue.trim()).length} of {testsToFill.length} results filled
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowBulkResultsForm(null); setBulkResults({}); }}
                  className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitBulkResults}
                  disabled={!Object.values(bulkResults).some(v => v.resultValue.trim())}
                  className="px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 flex items-center gap-2 font-semibold disabled:opacity-50 shadow-lg"
                >
                  <Send className="w-5 h-5" /> Submit All Results & Notify Clinical Team
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
