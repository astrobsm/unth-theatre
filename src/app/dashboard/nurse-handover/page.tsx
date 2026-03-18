'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  ClipboardPlus, Clock, CheckCircle, AlertTriangle, Users, Activity,
  ChevronDown, ChevronUp, Search, Filter, RefreshCw, Plus, Eye,
  UserCheck, ArrowRight, FileText, Shield, Stethoscope, ThermometerSun,
  Droplets, Syringe, Pill, Heart, AlertOctagon, MessageSquare, X,
  BarChart3, Bell, Camera, Mic, History, Zap, Gauge, ListChecks
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

interface Handover {
  id: string;
  handoverPhase: string;
  status: string;
  theatreName: string | null;
  patientName: string | null;
  patientFolderNumber: string | null;
  patientAge: number | null;
  patientGender: string | null;
  patientWard: string | null;
  procedurePerformed: string | null;
  surgeonName: string | null;
  anesthetistName: string | null;
  anesthesiaType: string | null;
  surgeryStartTime: string | null;
  surgeryEndTime: string | null;
  diagnosis: string | null;
  relevantHistory: string | null;
  allergies: string | null;
  preOpInvestigations: string | null;
  asaGrade: string | null;
  estimatedBloodLoss: string | null;
  fluidGiven: string | null;
  bloodProductsGiven: string | null;
  urineOutput: string | null;
  lastBP: string | null;
  lastHR: string | null;
  lastSpO2: string | null;
  lastTemp: string | null;
  painScore: number | null;
  consciousnessLevel: string | null;
  airwayStatus: string | null;
  intraOpComplications: string | null;
  unexpectedEvents: string | null;
  implantsUsed: string | null;
  instrumentCountCorrect: boolean | null;
  spongeCountCorrect: boolean | null;
  needleCountCorrect: boolean | null;
  sharpsCountCorrect: boolean | null;
  countDiscrepancy: string | null;
  specimenCollected: boolean | null;
  specimenLabel: string | null;
  specimenSentToLab: boolean | null;
  equipmentProblems: boolean | null;
  equipmentProblemDetails: string | null;
  drainsInSitu: boolean;
  drainDetails: string | null;
  catheterInSitu: boolean;
  catheterDetails: string | null;
  ivLinesInSitu: boolean;
  ivLineDetails: string | null;
  ngTubeInSitu: boolean;
  ngTubeDetails: string | null;
  woundDressing: string | null;
  postOpOrders: string | null;
  oxygenRequirement: string | null;
  ivFluidOrders: string | null;
  painManagementPlan: string | null;
  antibioticPlan: string | null;
  dvtProphylaxis: string | null;
  dietaryInstructions: string | null;
  mobilityInstructions: string | null;
  monitoringFrequency: string | null;
  investigationsOrdered: string | null;
  followUpPlan: string | null;
  escalationCriteria: string | null;
  pendingTasks: string | null;
  outstandingOrders: string | null;
  upcomingSurgeries: string | null;
  staffingConcerns: string | null;
  equipmentIssues: string | null;
  theatreCleanliness: string | null;
  handingOverNurseName: string;
  receivingNurseName: string | null;
  witnessNurseName: string | null;
  handoverStartedAt: string;
  handoverCompletedAt: string | null;
  acknowledgedAt: string | null;
  receiverNotes: string | null;
  issuesRaised: boolean;
  issueDetails: string | null;
  createdAt: string;
  handingOverNurse: { id: string; fullName: string; role: string };
  receivingNurse: { id: string; fullName: string; role: string } | null;
  witnessNurse: { id: string; fullName: string; role: string } | null;
  surgery: { id: string; procedureName: string; scheduledDate: string; status: string } | null;
  patient: { id: string; name: string; folderNumber: string; ward: string } | null;
  // Theatre Preparation
  theatreAssigned: boolean | null;
  instrumentSetPrepared: boolean | null;
  sterilityConfirmed: boolean | null;
  equipmentChecked: boolean | null;
  implantsAvailable: boolean | null;
  // Anaesthesia & Safety
  consentObtained: boolean | null;
  preOpChecklistCompleted: boolean | null;
  bloodAvailability: string | null;
  fastingStatus: string | null;
  fastingDetails: string | null;
  // Nursing Tasks
  ivLineSecured: boolean | null;
  medicationsAdministered: boolean | null;
  medicationDetails: string | null;
  skinPreparation: boolean | null;
  skinPrepDetails: string | null;
  documentationComplete: boolean | null;
  documentationNotes: string | null;
  // Special Alerts
  infectionRisk: boolean | null;
  infectionRiskDetails: string | null;
  highRiskPatient: boolean | null;
  highRiskDetails: string | null;
  specialPositioning: boolean | null;
  positioningDetails: string | null;
  equipmentConcerns: boolean | null;
  equipmentConcernDetails: string | null;
  specialAlerts: string | null;
  woundImages: string[];
  voiceNoteUrl: string | null;
  checklistItems: Array<{ id: string; category: string; itemLabel: string; isChecked: boolean; notes: string | null }>;
  _count: { auditTrail: number };
}

interface DashboardData {
  surgeryReadiness: Array<{
    surgeryId: string;
    patientName: string;
    patientFolderNumber: string;
    patientWard: string;
    procedure: string;
    surgeon: string;
    anesthetist: string;
    scheduledTime: string;
    surgeryStatus: string;
    readinessStatus: 'READY' | 'PENDING' | 'NOT_READY';
    missingItems: string[];
    hasHandover: boolean;
    handoverStatus: string | null;
    infectionRisk: boolean;
    highRiskPatient: boolean;
    handoverNurse: string | null;
  }>;
  stats: {
    totalSurgeries: number;
    ready: number;
    pending: number;
    notReady: number;
    handoversByStatus: Record<string, number>;
  };
  alerts: Array<{
    type: string;
    message: string;
    severity: 'critical' | 'warning' | 'info';
    surgeryId?: string;
  }>;
  performance: {
    avgHandoverDuration: number;
    completedLast7Days: number;
    delaysLast7Days: number;
  };
}

const PHASE_CONFIG: Record<string, { label: string; color: string; icon: any; description: string }> = {
  SHIFT_HANDOVER: { label: 'Shift Handover', color: 'bg-blue-100 text-blue-800', icon: Users, description: 'Nurse-to-nurse shift change' },
  INTRA_OP_HANDOVER: { label: 'Intra-Op Handover', color: 'bg-purple-100 text-purple-800', icon: Activity, description: 'During surgery team change' },
  POST_OP_HANDOVER: { label: 'Post-Op Handover', color: 'bg-orange-100 text-orange-800', icon: ArrowRight, description: 'Theatre → PACU/Recovery' },
  THEATRE_TO_WARD: { label: 'Theatre → Ward', color: 'bg-green-100 text-green-800', icon: ArrowRight, description: 'Recovery → Ward transfer' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-700' },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-800' },
  PENDING_ACKNOWLEDGEMENT: { label: 'Pending Ack.', color: 'bg-orange-100 text-orange-800' },
  ACKNOWLEDGED: { label: 'Acknowledged', color: 'bg-blue-100 text-blue-800' },
  COMPLETED: { label: 'Completed', color: 'bg-green-100 text-green-800' },
  DISPUTED: { label: 'Disputed', color: 'bg-red-100 text-red-800' },
};

const WHO_CHECKLIST_TEMPLATE: Record<string, Array<{ category: string; itemLabel: string }>> = {
  POST_OP_HANDOVER: [
    { category: 'PATIENT_ID', itemLabel: 'Patient identity confirmed (name, folder number, wristband)' },
    { category: 'PROCEDURE', itemLabel: 'Procedure performed confirmed with operating surgeon' },
    { category: 'COUNTS', itemLabel: 'Instrument count correct and documented' },
    { category: 'COUNTS', itemLabel: 'Sponge/swab count correct and documented' },
    { category: 'COUNTS', itemLabel: 'Needle count correct and documented' },
    { category: 'COUNTS', itemLabel: 'Sharps count correct and documented' },
    { category: 'SPECIMEN', itemLabel: 'Specimens labelled correctly and sent to lab' },
    { category: 'DRAINS', itemLabel: 'All drains, catheters, and lines documented with output' },
    { category: 'MEDS', itemLabel: 'Post-operative medication orders received and confirmed' },
    { category: 'SAFETY', itemLabel: 'Key concerns for recovery communicated (airway, bleeding, pain)' },
    { category: 'SAFETY', itemLabel: 'Equipment problems addressed or reported' },
    { category: 'VITALS', itemLabel: 'Last set of vital signs recorded and handed over' },
  ],
  SHIFT_HANDOVER: [
    { category: 'PATIENT_ID', itemLabel: 'All current patients identified with status' },
    { category: 'PENDING', itemLabel: 'Pending tasks reviewed and transferred' },
    { category: 'PENDING', itemLabel: 'Outstanding orders communicated' },
    { category: 'SAFETY', itemLabel: 'Equipment issues flagged and documented' },
    { category: 'SAFETY', itemLabel: 'Staffing concerns addressed' },
    { category: 'SCHEDULE', itemLabel: 'Upcoming cases reviewed with OR schedule' },
    { category: 'CLEANLINESS', itemLabel: 'Theatre cleanliness status confirmed' },
  ],
  INTRA_OP_HANDOVER: [
    { category: 'PATIENT_ID', itemLabel: 'Patient identity re-confirmed' },
    { category: 'PROCEDURE', itemLabel: 'Current surgical stage and plan communicated' },
    { category: 'COUNTS', itemLabel: 'Running counts verified and handed over' },
    { category: 'MEDS', itemLabel: 'Medications given and allergies confirmed' },
    { category: 'SAFETY', itemLabel: 'Intra-operative concerns communicated (blood loss, complications)' },
    { category: 'VITALS', itemLabel: 'Current vital signs and anesthesia status reviewed' },
  ],
  THEATRE_TO_WARD: [
    { category: 'PATIENT_ID', itemLabel: 'Patient identity confirmed with ward nurse' },
    { category: 'PROCEDURE', itemLabel: 'Procedure performed and findings communicated' },
    { category: 'MEDS', itemLabel: 'Post-op medication plan handed over including pain management' },
    { category: 'DRAINS', itemLabel: 'All drains, lines, catheters described with expected output' },
    { category: 'SAFETY', itemLabel: 'Escalation criteria and warning signs explained' },
    { category: 'SAFETY', itemLabel: 'Follow-up plan and surgeon review schedule communicated' },
    { category: 'VITALS', itemLabel: 'Monitoring frequency and observation chart handed over' },
    { category: 'DIET', itemLabel: 'Dietary and mobility instructions communicated' },
    { category: 'DVT', itemLabel: 'DVT prophylaxis plan confirmed' },
  ],
};

export default function NurseHandoverPage() {
  const { data: session } = useSession();
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPhase, setFilterPhase] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMy, setFilterMy] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [viewHandover, setViewHandover] = useState<Handover | null>(null);
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<'list' | 'dashboard'>('list');
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  // Form state
  const [form, setForm] = useState({
    handoverPhase: 'POST_OP_HANDOVER',
    theatreName: '',
    patientName: '',
    patientFolderNumber: '',
    patientAge: '',
    patientGender: '',
    patientWard: '',
    procedurePerformed: '',
    surgeonName: '',
    anesthetistName: '',
    anesthesiaType: '',
    surgeryStartTime: '',
    surgeryEndTime: '',
    diagnosis: '',
    relevantHistory: '',
    allergies: '',
    preOpInvestigations: '',
    asaGrade: '',
    estimatedBloodLoss: '',
    fluidGiven: '',
    bloodProductsGiven: '',
    urineOutput: '',
    lastBP: '',
    lastHR: '',
    lastSpO2: '',
    lastTemp: '',
    painScore: '',
    consciousnessLevel: '',
    airwayStatus: '',
    intraOpComplications: '',
    unexpectedEvents: '',
    implantsUsed: '',
    instrumentCountCorrect: false,
    spongeCountCorrect: false,
    needleCountCorrect: false,
    sharpsCountCorrect: false,
    countDiscrepancy: '',
    specimenCollected: false,
    specimenLabel: '',
    specimenSentToLab: false,
    equipmentProblems: false,
    equipmentProblemDetails: '',
    drainsInSitu: false,
    drainDetails: '',
    catheterInSitu: false,
    catheterDetails: '',
    ivLinesInSitu: false,
    ivLineDetails: '',
    ngTubeInSitu: false,
    ngTubeDetails: '',
    woundDressing: '',
    postOpOrders: '',
    oxygenRequirement: '',
    ivFluidOrders: '',
    painManagementPlan: '',
    antibioticPlan: '',
    dvtProphylaxis: '',
    dietaryInstructions: '',
    mobilityInstructions: '',
    monitoringFrequency: '',
    investigationsOrdered: '',
    followUpPlan: '',
    escalationCriteria: '',
    pendingTasks: '',
    outstandingOrders: '',
    upcomingSurgeries: '',
    staffingConcerns: '',
    equipmentIssues: '',
    theatreCleanliness: '',
    receivingNurseName: '',
    // Theatre Preparation
    theatreAssigned: false,
    instrumentSetPrepared: false,
    sterilityConfirmed: false,
    equipmentChecked: false,
    implantsAvailable: false,
    // Anaesthesia & Safety
    consentObtained: false,
    preOpChecklistCompleted: false,
    bloodAvailability: '',
    fastingStatus: '',
    fastingDetails: '',
    // Nursing Tasks
    ivLineSecured: false,
    medicationsAdministered: false,
    medicationDetails: '',
    skinPreparation: false,
    skinPrepDetails: '',
    documentationComplete: false,
    documentationNotes: '',
    // Special Notes / Alerts
    infectionRisk: false,
    infectionRiskDetails: '',
    highRiskPatient: false,
    highRiskDetails: '',
    specialPositioning: false,
    positioningDetails: '',
    equipmentConcerns: false,
    equipmentConcernDetails: '',
    specialAlerts: '',
    // Photo & Voice
    woundImages: [] as string[],
    voiceNoteUrl: '',
    // Surgery linkage
    surgeryId: '',
  });

  // Stepper state for SBAR form
  const [formStep, setFormStep] = useState(0);

  const fetchHandovers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterPhase) params.set('phase', filterPhase);
      if (filterStatus) params.set('status', filterStatus);
      if (filterMy) params.set('my', filterMy);
      const res = await fetch(`/api/nurse-handover?${params.toString()}`);
      const data = await res.json();
      setHandovers(data.handovers || []);
    } catch {
      setHandovers([]);
    } finally {
      setLoading(false);
    }
  }, [filterPhase, filterStatus, filterMy]);

  useEffect(() => { fetchHandovers(); }, [fetchHandovers]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(fetchHandovers, 30000);
    return () => clearInterval(interval);
  }, [fetchHandovers]);

  const fetchDashboard = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const res = await fetch('/api/nurse-handover/dashboard');
      if (res.ok) {
        const data = await res.json();
        setDashboardData(data);
      }
    } catch {
      // silently fail
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'dashboard') fetchDashboard();
  }, [activeTab, fetchDashboard]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const checklistItems = (WHO_CHECKLIST_TEMPLATE[form.handoverPhase] || []).map(item => ({
        category: item.category,
        itemLabel: item.itemLabel,
        isChecked: false,
      }));

      const payload = {
        ...form,
        patientAge: form.patientAge ? parseInt(form.patientAge) : null,
        painScore: form.painScore ? parseInt(form.painScore) : null,
        checklistItems,
      };

      const res = await fetch('/api/nurse-handover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to create handover');
        return;
      }

      setShowCreate(false);
      resetForm();
      fetchHandovers();
    } catch {
      alert('Network error creating handover');
    } finally {
      setCreating(false);
    }
  };

  const handleAction = async (id: string, action: string, notes?: string) => {
    try {
      const res = await fetch(`/api/nurse-handover/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, receiverNotes: notes }),
      });
      if (res.ok) {
        fetchHandovers();
        if (viewHandover?.id === id) {
          const data = await res.json();
          setViewHandover(data.handover);
        }
      }
    } catch {
      alert('Failed to perform action');
    }
  };

  const resetForm = () => {
    setForm({
      handoverPhase: 'POST_OP_HANDOVER', theatreName: '', patientName: '', patientFolderNumber: '',
      patientAge: '', patientGender: '', patientWard: '', procedurePerformed: '', surgeonName: '',
      anesthetistName: '', anesthesiaType: '', surgeryStartTime: '', surgeryEndTime: '',
      diagnosis: '', relevantHistory: '', allergies: '', preOpInvestigations: '', asaGrade: '',
      estimatedBloodLoss: '', fluidGiven: '', bloodProductsGiven: '', urineOutput: '',
      lastBP: '', lastHR: '', lastSpO2: '', lastTemp: '', painScore: '', consciousnessLevel: '',
      airwayStatus: '', intraOpComplications: '', unexpectedEvents: '', implantsUsed: '',
      instrumentCountCorrect: false, spongeCountCorrect: false, needleCountCorrect: false,
      sharpsCountCorrect: false, countDiscrepancy: '', specimenCollected: false, specimenLabel: '',
      specimenSentToLab: false, equipmentProblems: false, equipmentProblemDetails: '',
      drainsInSitu: false, drainDetails: '', catheterInSitu: false, catheterDetails: '',
      ivLinesInSitu: false, ivLineDetails: '', ngTubeInSitu: false, ngTubeDetails: '',
      woundDressing: '', postOpOrders: '', oxygenRequirement: '', ivFluidOrders: '',
      painManagementPlan: '', antibioticPlan: '', dvtProphylaxis: '', dietaryInstructions: '',
      mobilityInstructions: '', monitoringFrequency: '', investigationsOrdered: '', followUpPlan: '',
      escalationCriteria: '', pendingTasks: '', outstandingOrders: '', upcomingSurgeries: '',
      staffingConcerns: '', equipmentIssues: '', theatreCleanliness: '', receivingNurseName: '',
      theatreAssigned: false, instrumentSetPrepared: false, sterilityConfirmed: false,
      equipmentChecked: false, implantsAvailable: false,
      consentObtained: false, preOpChecklistCompleted: false, bloodAvailability: '', fastingStatus: '',
      fastingDetails: '',
      ivLineSecured: false, medicationsAdministered: false, medicationDetails: '',
      skinPreparation: false, skinPrepDetails: '', documentationComplete: false, documentationNotes: '',
      infectionRisk: false, infectionRiskDetails: '', highRiskPatient: false, highRiskDetails: '',
      specialPositioning: false, positioningDetails: '', equipmentConcerns: false,
      equipmentConcernDetails: '', specialAlerts: '', woundImages: [], voiceNoteUrl: '', surgeryId: '',
    });
    setFormStep(0);
  };

  const filtered = handovers.filter(h => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      h.patientName?.toLowerCase().includes(term) ||
      h.patientFolderNumber?.toLowerCase().includes(term) ||
      h.procedurePerformed?.toLowerCase().includes(term) ||
      h.handingOverNurseName?.toLowerCase().includes(term) ||
      h.receivingNurseName?.toLowerCase().includes(term) ||
      h.theatreName?.toLowerCase().includes(term)
    );
  });

  const stats = {
    total: handovers.length,
    pending: handovers.filter(h => h.status === 'PENDING_ACKNOWLEDGEMENT').length,
    disputed: handovers.filter(h => h.status === 'DISPUTED').length,
    completedToday: handovers.filter(h => h.status === 'COMPLETED' && new Date(h.createdAt).toDateString() === new Date().toDateString()).length,
  };

  // SBAR Step definitions
  const getSteps = () => {
    const isShift = form.handoverPhase === 'SHIFT_HANDOVER';
    if (isShift) {
      return [
        { title: 'Phase & Theatre', key: 'phase' },
        { title: 'Pending Tasks', key: 'pending' },
        { title: 'Schedule & Staffing', key: 'schedule' },
        { title: 'Equipment & Cleanliness', key: 'equipment' },
        { title: 'Receiver', key: 'receiver' },
      ];
    }
    return [
      { title: 'Phase & Patient', key: 'phase' },
      { title: 'S - Situation', key: 'situation' },
      { title: 'B - Background', key: 'background' },
      { title: 'A - Assessment', key: 'assessment' },
      { title: 'Theatre Prep', key: 'theatrePrep' },
      { title: 'Anaesthesia & Safety', key: 'anaesthesiaSafety' },
      { title: 'Nursing Tasks', key: 'nursingTasks' },
      { title: 'WHO Safety Counts', key: 'counts' },
      { title: 'Drains & Lines', key: 'drains' },
      { title: 'R - Recommendation', key: 'recommendation' },
      { title: 'Special Alerts', key: 'specialAlerts' },
      { title: 'Receiver', key: 'receiver' },
    ];
  };

  const steps = getSteps();

  const formatTime = (dt: string | null) => {
    if (!dt) return '—';
    return new Date(dt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" />
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ClipboardPlus className="h-7 w-7 text-teal-600" />
              Theatre Nurses Structured Handover
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              WHO / SBAR International Standard &mdash; Comprehensive Digital Handover Protocol
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchHandovers} className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100">
              <RefreshCw className="h-5 w-5" />
            </button>
            <button
              onClick={() => { resetForm(); setShowCreate(true); }}
              className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 font-medium"
            >
              <Plus className="h-5 w-5" /> New Handover
            </button>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex items-center gap-1 mt-4">
          <button
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${activeTab === 'list' ? 'bg-teal-50 text-teal-700 border-b-2 border-teal-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
          >
            <span className="flex items-center gap-2"><ListChecks className="h-4 w-4" /> Handovers</span>
          </button>
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${activeTab === 'dashboard' ? 'bg-teal-50 text-teal-700 border-b-2 border-teal-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
          >
            <span className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Dashboard & Readiness</span>
          </button>
        </div>
      </div>

      {/* === DASHBOARD TAB === */}
      {activeTab === 'dashboard' && (
        <div className="px-6 py-4 space-y-6">
          {dashboardLoading ? (
            <div className="text-center py-16 text-gray-400">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" /> Loading dashboard...
            </div>
          ) : dashboardData ? (
            <>
              {/* Dashboard Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-white rounded-xl shadow-sm border p-4">
                  <p className="text-xs text-gray-500">Today&apos;s Surgeries</p>
                  <p className="text-2xl font-bold text-gray-900">{dashboardData.stats.totalSurgeries}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                  <p className="text-xs text-gray-500">Ready</p>
                  <p className="text-2xl font-bold text-green-600">{dashboardData.stats.ready}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                  <p className="text-xs text-gray-500">Pending</p>
                  <p className="text-2xl font-bold text-yellow-600">{dashboardData.stats.pending}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                  <p className="text-xs text-gray-500">Not Ready</p>
                  <p className="text-2xl font-bold text-red-600">{dashboardData.stats.notReady}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                  <p className="text-xs text-gray-500">Avg Duration (7d)</p>
                  <p className="text-2xl font-bold text-blue-600">{dashboardData.performance.avgHandoverDuration}m</p>
                </div>
              </div>

              {/* Alerts */}
              {dashboardData.alerts.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border">
                  <div className="px-4 py-3 border-b flex items-center gap-2">
                    <Bell className="h-5 w-5 text-red-500" />
                    <h3 className="font-semibold text-gray-900">Active Alerts ({dashboardData.alerts.length})</h3>
                  </div>
                  <div className="p-4 space-y-2">
                    {dashboardData.alerts.map((alert, i) => (
                      <div key={i} className={`flex items-center gap-3 p-3 rounded-lg ${
                        alert.severity === 'critical' ? 'bg-red-50 border border-red-200' :
                        alert.severity === 'warning' ? 'bg-amber-50 border border-amber-200' :
                        'bg-blue-50 border border-blue-200'
                      }`}>
                        {alert.severity === 'critical' ? <AlertOctagon className="h-5 w-5 text-red-600 flex-shrink-0" /> :
                         alert.severity === 'warning' ? <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" /> :
                         <Bell className="h-5 w-5 text-blue-600 flex-shrink-0" />}
                        <div>
                          <p className={`text-sm font-medium ${
                            alert.severity === 'critical' ? 'text-red-800' :
                            alert.severity === 'warning' ? 'text-amber-800' : 'text-blue-800'
                          }`}>{alert.message}</p>
                          <p className="text-xs text-gray-500">{alert.type.replace(/_/g, ' ')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Surgery Readiness Board */}
              <div className="bg-white rounded-xl shadow-sm border">
                <div className="px-4 py-3 border-b flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Gauge className="h-5 w-5 text-teal-600" /> Surgery Readiness Board
                  </h3>
                  <button onClick={fetchDashboard} className="text-sm text-teal-600 hover:text-teal-700 flex items-center gap-1">
                    <RefreshCw className="h-3.5 w-3.5" /> Refresh
                  </button>
                </div>
                {dashboardData.surgeryReadiness.length === 0 ? (
                  <div className="p-8 text-center text-gray-400">No surgeries scheduled today</div>
                ) : (
                  <div className="divide-y">
                    {dashboardData.surgeryReadiness.map(sr => (
                      <div key={sr.surgeryId} className="p-4 flex items-center justify-between hover:bg-gray-50">
                        <div className="flex items-center gap-4">
                          <div className={`h-3 w-3 rounded-full ${
                            sr.readinessStatus === 'READY' ? 'bg-green-500' :
                            sr.readinessStatus === 'PENDING' ? 'bg-yellow-500' : 'bg-red-500'
                          }`} />
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-gray-900">{sr.patientName}</p>
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{sr.patientFolderNumber}</span>
                              {sr.infectionRisk && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Infection Risk</span>}
                              {sr.highRiskPatient && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">High Risk</span>}
                            </div>
                            <p className="text-sm text-gray-600">{sr.procedure}</p>
                            <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                              <span>Surgeon: {sr.surgeon}</span>
                              <span>Ward: {sr.patientWard}</span>
                              <span>{new Date(sr.scheduledTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                            sr.readinessStatus === 'READY' ? 'bg-green-100 text-green-800' :
                            sr.readinessStatus === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {sr.readinessStatus === 'READY' ? '✓ Ready' : sr.readinessStatus === 'PENDING' ? '⏳ Pending' : '✗ Not Ready'}
                          </span>
                          {sr.missingItems.length > 0 && (
                            <p className="text-xs text-red-500 mt-1">Missing: {sr.missingItems.join(', ')}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Performance Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl shadow-sm border p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-blue-100 rounded-lg"><Clock className="h-5 w-5 text-blue-600" /></div>
                    <div>
                      <p className="text-xs text-gray-500">Avg Handover Duration</p>
                      <p className="text-xl font-bold text-gray-900">{dashboardData.performance.avgHandoverDuration} min</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-green-100 rounded-lg"><CheckCircle className="h-5 w-5 text-green-600" /></div>
                    <div>
                      <p className="text-xs text-gray-500">Completed (7 Days)</p>
                      <p className="text-xl font-bold text-gray-900">{dashboardData.performance.completedLast7Days}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-amber-100 rounded-lg"><AlertTriangle className="h-5 w-5 text-amber-600" /></div>
                    <div>
                      <p className="text-xs text-gray-500">Delays (7 Days)</p>
                      <p className="text-xl font-bold text-gray-900">{dashboardData.performance.delaysLast7Days}</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-16 text-gray-400">Failed to load dashboard data</div>
          )}
        </div>
      )}

      {/* === LIST TAB === */}
      {activeTab === 'list' && (<>
      {/* Stats */}
      <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Handovers</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <ClipboardPlus className="h-8 w-8 text-teal-500" />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Pending Acknowledgement</p>
              <p className="text-2xl font-bold text-orange-600">{stats.pending}</p>
            </div>
            <Clock className="h-8 w-8 text-orange-500" />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Disputed</p>
              <p className="text-2xl font-bold text-red-600">{stats.disputed}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Completed Today</p>
              <p className="text-2xl font-bold text-green-600">{stats.completedToday}</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-500" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 pb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search patient, nurse, procedure..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          />
        </div>
        <select
          value={filterPhase}
          onChange={e => setFilterPhase(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500"
        >
          <option value="">All Phases</option>
          {Object.entries(PHASE_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500"
        >
          <option value="">All Status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          value={filterMy}
          onChange={e => setFilterMy(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500"
        >
          <option value="">All Handovers</option>
          <option value="given">My Handovers (Given)</option>
          <option value="received">My Handovers (Received)</option>
        </select>
      </div>

      {/* Handover List */}
      <div className="px-6 pb-6">
        {loading ? (
          <div className="text-center py-16 text-gray-400">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
            Loading handovers...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border">
            <ClipboardPlus className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No handovers found</p>
            <p className="text-sm text-gray-400 mt-1">Create a new handover to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(h => {
              const phase = PHASE_CONFIG[h.handoverPhase] || { label: h.handoverPhase, color: 'bg-gray-100 text-gray-700', icon: FileText };
              const statusCfg = STATUS_CONFIG[h.status] || { label: h.status, color: 'bg-gray-100 text-gray-700' };
              const PhaseIcon = phase.icon;
              return (
                <div
                  key={h.id}
                  className="bg-white rounded-xl shadow-sm border hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setViewHandover(h)}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${phase.color}`}>
                          <PhaseIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-900">{h.patientName || 'No Patient'}</span>
                            {h.patientFolderNumber && (
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{h.patientFolderNumber}</span>
                            )}
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg.color}`}>{statusCfg.label}</span>
                          </div>
                          <p className="text-sm text-gray-600 mt-0.5">
                            {h.procedurePerformed || phase.description}
                          </p>
                          <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
                            <span className={`px-2 py-0.5 rounded ${phase.color} text-xs`}>{phase.label}</span>
                            {h.theatreName && <span>Theatre: {h.theatreName}</span>}
                            <span>By: {h.handingOverNurseName}</span>
                            {h.receivingNurseName && <span>To: {h.receivingNurseName}</span>}
                            <span>{formatTime(h.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {h.issuesRaised && (
                          <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">Issues Raised</span>
                        )}
                        {h.status === 'PENDING_ACKNOWLEDGEMENT' && h.receivingNurse?.id !== session?.user?.id && h.handingOverNurse?.id !== session?.user?.id && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAction(h.id, 'acknowledge'); }}
                            className="text-xs bg-teal-600 text-white px-3 py-1 rounded-lg hover:bg-teal-700"
                          >
                            Acknowledge
                          </button>
                        )}
                        <Eye className="h-4 w-4 text-gray-400" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>)}

      {/* View Handover Detail Modal */}
      {viewHandover && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center overflow-y-auto p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl my-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10 rounded-t-2xl">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {PHASE_CONFIG[viewHandover.handoverPhase]?.label || viewHandover.handoverPhase} — {viewHandover.patientName || 'No Patient'}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[viewHandover.status]?.color || 'bg-gray-100'}`}>
                    {STATUS_CONFIG[viewHandover.status]?.label || viewHandover.status}
                  </span>
                  <span className="text-xs text-gray-400">{formatTime(viewHandover.createdAt)}</span>
                </div>
              </div>
              <button onClick={() => setViewHandover(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* S - SITUATION */}
              <section>
                <h3 className="text-sm font-bold text-teal-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Stethoscope className="h-4 w-4" /> S — Situation
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <InfoField label="Patient" value={viewHandover.patientName} />
                  <InfoField label="Folder No." value={viewHandover.patientFolderNumber} />
                  <InfoField label="Age / Gender" value={`${viewHandover.patientAge || '—'} / ${viewHandover.patientGender || '—'}`} />
                  <InfoField label="Ward" value={viewHandover.patientWard} />
                  <InfoField label="Procedure" value={viewHandover.procedurePerformed} />
                  <InfoField label="Surgeon" value={viewHandover.surgeonName} />
                  <InfoField label="Anaesthetist" value={viewHandover.anesthetistName} />
                  <InfoField label="Anaesthesia Type" value={viewHandover.anesthesiaType} />
                  <InfoField label="Theatre" value={viewHandover.theatreName} />
                  <InfoField label="Surgery Start" value={formatTime(viewHandover.surgeryStartTime)} />
                  <InfoField label="Surgery End" value={formatTime(viewHandover.surgeryEndTime)} />
                </div>
              </section>

              {/* B - BACKGROUND */}
              <section>
                <h3 className="text-sm font-bold text-blue-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4" /> B — Background
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <InfoField label="Diagnosis" value={viewHandover.diagnosis} />
                  <InfoField label="Relevant History" value={viewHandover.relevantHistory} />
                  <InfoField label="Allergies" value={viewHandover.allergies} highlight />
                  <InfoField label="Pre-Op Investigations" value={viewHandover.preOpInvestigations} />
                  <InfoField label="ASA Grade" value={viewHandover.asaGrade} />
                </div>
              </section>

              {/* A - ASSESSMENT */}
              <section>
                <h3 className="text-sm font-bold text-purple-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Activity className="h-4 w-4" /> A — Assessment (Intra-Operative)
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <InfoField label="Est. Blood Loss" value={viewHandover.estimatedBloodLoss} />
                  <InfoField label="Fluids Given" value={viewHandover.fluidGiven} />
                  <InfoField label="Blood Products" value={viewHandover.bloodProductsGiven} />
                  <InfoField label="Urine Output" value={viewHandover.urineOutput} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-3">
                  <VitalField label="BP" value={viewHandover.lastBP} icon={<Heart className="h-3 w-3" />} />
                  <VitalField label="HR" value={viewHandover.lastHR} icon={<Activity className="h-3 w-3" />} />
                  <VitalField label="SpO2" value={viewHandover.lastSpO2} icon={<Droplets className="h-3 w-3" />} />
                  <VitalField label="Temp" value={viewHandover.lastTemp} icon={<ThermometerSun className="h-3 w-3" />} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mt-3">
                  <InfoField label="Pain Score" value={viewHandover.painScore !== null ? `${viewHandover.painScore}/10` : null} />
                  <InfoField label="Consciousness" value={viewHandover.consciousnessLevel} />
                  <InfoField label="Airway" value={viewHandover.airwayStatus} />
                  <InfoField label="Complications" value={viewHandover.intraOpComplications} highlight />
                  <InfoField label="Unexpected Events" value={viewHandover.unexpectedEvents} highlight />
                  <InfoField label="Implants Used" value={viewHandover.implantsUsed} />
                </div>
              </section>

              {/* WHO Surgical Safety Counts */}
              <section>
                <h3 className="text-sm font-bold text-orange-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Shield className="h-4 w-4" /> WHO Surgical Safety — Sign Out Counts
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <CountBadge label="Instruments" correct={viewHandover.instrumentCountCorrect} />
                  <CountBadge label="Sponges" correct={viewHandover.spongeCountCorrect} />
                  <CountBadge label="Needles" correct={viewHandover.needleCountCorrect} />
                  <CountBadge label="Sharps" correct={viewHandover.sharpsCountCorrect} />
                </div>
                {viewHandover.countDiscrepancy && (
                  <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                    <strong>Count Discrepancy:</strong> {viewHandover.countDiscrepancy}
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mt-3">
                  <InfoField label="Specimen Collected" value={viewHandover.specimenCollected ? 'Yes' : 'No'} />
                  <InfoField label="Specimen Label" value={viewHandover.specimenLabel} />
                  <InfoField label="Sent to Lab" value={viewHandover.specimenSentToLab ? 'Yes' : 'No'} />
                  <InfoField label="Equipment Problems" value={viewHandover.equipmentProblems ? 'Yes' : 'No'} highlight={!!viewHandover.equipmentProblems} />
                  <InfoField label="Equipment Details" value={viewHandover.equipmentProblemDetails} />
                </div>
              </section>

              {/* Drains & Lines */}
              <section>
                <h3 className="text-sm font-bold text-cyan-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Syringe className="h-4 w-4" /> Drains, Lines & Devices
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <DeviceField label="Drains" inSitu={viewHandover.drainsInSitu} details={viewHandover.drainDetails} />
                  <DeviceField label="Catheter" inSitu={viewHandover.catheterInSitu} details={viewHandover.catheterDetails} />
                  <DeviceField label="IV Lines" inSitu={viewHandover.ivLinesInSitu} details={viewHandover.ivLineDetails} />
                  <DeviceField label="NG Tube" inSitu={viewHandover.ngTubeInSitu} details={viewHandover.ngTubeDetails} />
                  <InfoField label="Wound Dressing" value={viewHandover.woundDressing} />
                </div>
              </section>

              {/* R - RECOMMENDATION */}
              <section>
                <h3 className="text-sm font-bold text-green-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Pill className="h-4 w-4" /> R — Recommendation
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <InfoField label="Post-Op Orders" value={viewHandover.postOpOrders} />
                  <InfoField label="O₂ Requirement" value={viewHandover.oxygenRequirement} />
                  <InfoField label="IV Fluid Orders" value={viewHandover.ivFluidOrders} />
                  <InfoField label="Pain Management" value={viewHandover.painManagementPlan} />
                  <InfoField label="Antibiotic Plan" value={viewHandover.antibioticPlan} />
                  <InfoField label="DVT Prophylaxis" value={viewHandover.dvtProphylaxis} />
                  <InfoField label="Dietary Instructions" value={viewHandover.dietaryInstructions} />
                  <InfoField label="Mobility Instructions" value={viewHandover.mobilityInstructions} />
                  <InfoField label="Monitoring Frequency" value={viewHandover.monitoringFrequency} />
                  <InfoField label="Investigations Ordered" value={viewHandover.investigationsOrdered} />
                  <InfoField label="Follow-Up Plan" value={viewHandover.followUpPlan} />
                  <InfoField label="Escalation Criteria" value={viewHandover.escalationCriteria} highlight />
                </div>
              </section>

              {/* Theatre Preparation Status */}
              <section>
                <h3 className="text-sm font-bold text-indigo-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <ListChecks className="h-4 w-4" /> Theatre Preparation Status
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <ReadinessBadge label="Theatre Assigned" checked={viewHandover.theatreAssigned} />
                  <ReadinessBadge label="Instruments Prepared" checked={viewHandover.instrumentSetPrepared} />
                  <ReadinessBadge label="Sterility Confirmed" checked={viewHandover.sterilityConfirmed} />
                  <ReadinessBadge label="Equipment Checked" checked={viewHandover.equipmentChecked} />
                  <ReadinessBadge label="Implants Available" checked={viewHandover.implantsAvailable} />
                </div>
              </section>

              {/* Anaesthesia & Safety */}
              <section>
                <h3 className="text-sm font-bold text-red-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Anaesthesia & Safety Verification
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <ReadinessBadge label="Consent Obtained" checked={viewHandover.consentObtained} />
                  <ReadinessBadge label="Pre-Op Checklist" checked={viewHandover.preOpChecklistCompleted} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm mt-3">
                  <InfoField label="Blood Availability" value={viewHandover.bloodAvailability} />
                  <InfoField label="Fasting Status" value={viewHandover.fastingStatus} />
                  {viewHandover.fastingDetails && <InfoField label="Fasting Details" value={viewHandover.fastingDetails} />}
                </div>
              </section>

              {/* Nursing Tasks */}
              <section>
                <h3 className="text-sm font-bold text-cyan-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Stethoscope className="h-4 w-4" /> Nursing Tasks
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <ReadinessBadge label="IV Line Secured" checked={viewHandover.ivLineSecured} />
                  <ReadinessBadge label="Meds Administered" checked={viewHandover.medicationsAdministered} />
                  <ReadinessBadge label="Skin Preparation" checked={viewHandover.skinPreparation} />
                  <ReadinessBadge label="Documentation" checked={viewHandover.documentationComplete} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mt-3">
                  {viewHandover.medicationDetails && <InfoField label="Medication Details" value={viewHandover.medicationDetails} />}
                  {viewHandover.skinPrepDetails && <InfoField label="Skin Prep Details" value={viewHandover.skinPrepDetails} />}
                  {viewHandover.documentationNotes && <InfoField label="Documentation Notes" value={viewHandover.documentationNotes} />}
                </div>
              </section>

              {/* Special Alerts */}
              {(viewHandover.infectionRisk || viewHandover.highRiskPatient || viewHandover.specialPositioning || viewHandover.equipmentConcerns || viewHandover.specialAlerts) && (
                <section>
                  <h3 className="text-sm font-bold text-red-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <AlertOctagon className="h-4 w-4" /> Special Alerts & Notes
                  </h3>
                  <div className="space-y-2">
                    {viewHandover.infectionRisk && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-red-700 uppercase">⚠ Infection Risk</p>
                        <p className="text-sm text-red-800 mt-1">{viewHandover.infectionRiskDetails || 'Flagged — no details provided'}</p>
                      </div>
                    )}
                    {viewHandover.highRiskPatient && (
                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-orange-700 uppercase">⚠ High-Risk Patient</p>
                        <p className="text-sm text-orange-800 mt-1">{viewHandover.highRiskDetails || 'Flagged — no details provided'}</p>
                      </div>
                    )}
                    {viewHandover.specialPositioning && (
                      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-purple-700 uppercase">Special Positioning</p>
                        <p className="text-sm text-purple-800 mt-1">{viewHandover.positioningDetails || 'Flagged — no details provided'}</p>
                      </div>
                    )}
                    {viewHandover.equipmentConcerns && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-amber-700 uppercase">Equipment Concerns</p>
                        <p className="text-sm text-amber-800 mt-1">{viewHandover.equipmentConcernDetails || 'Flagged — no details provided'}</p>
                      </div>
                    )}
                    {viewHandover.specialAlerts && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-700 uppercase">Additional Notes</p>
                        <p className="text-sm text-gray-800 mt-1">{viewHandover.specialAlerts}</p>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Photos & Voice Notes */}
              {((viewHandover.woundImages && viewHandover.woundImages.length > 0) || viewHandover.voiceNoteUrl) && (
                <section>
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Camera className="h-4 w-4" /> Attachments
                  </h3>
                  {viewHandover.woundImages && viewHandover.woundImages.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 mb-2">Wound / Site Photos ({viewHandover.woundImages.length})</p>
                      <div className="flex flex-wrap gap-2">
                        {viewHandover.woundImages.map((img, i) => (
                          <img key={i} src={img} alt={`Wound photo ${i + 1}`} className="h-24 w-24 object-cover rounded-lg border cursor-pointer hover:shadow-lg transition-shadow" onClick={() => window.open(img, '_blank')} />
                        ))}
                      </div>
                    </div>
                  )}
                  {viewHandover.voiceNoteUrl && (
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Voice Note</p>
                      <audio controls src={viewHandover.voiceNoteUrl} className="w-full" />
                    </div>
                  )}
                </section>
              )}

              {/* WHO Checklist Items */}
              {viewHandover.checklistItems.length > 0 && (
                <section>
                  <h3 className="text-sm font-bold text-indigo-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" /> WHO Handover Checklist
                  </h3>
                  <div className="space-y-2">
                    {viewHandover.checklistItems.map(item => (
                      <div key={item.id} className={`flex items-start gap-3 p-2 rounded-lg ${item.isChecked ? 'bg-green-50' : 'bg-gray-50'}`}>
                        <div className={`mt-0.5 h-5 w-5 rounded border-2 flex items-center justify-center ${item.isChecked ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>
                          {item.isChecked && <CheckCircle className="h-3 w-3" />}
                        </div>
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase">{item.category}</span>
                          <p className="text-sm text-gray-800">{item.itemLabel}</p>
                          {item.notes && <p className="text-xs text-gray-500 mt-0.5">Note: {item.notes}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Nurse Details */}
              <section>
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4" /> Handover Staff
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-xs text-blue-600 font-medium">Handing Over</p>
                    <p className="font-semibold text-blue-900">{viewHandover.handingOverNurse?.fullName || viewHandover.handingOverNurseName}</p>
                    <p className="text-xs text-blue-600">{formatTime(viewHandover.handoverStartedAt)}</p>
                  </div>
                  <div className="bg-teal-50 rounded-lg p-3">
                    <p className="text-xs text-teal-600 font-medium">Receiving Nurse</p>
                    <p className="font-semibold text-teal-900">{viewHandover.receivingNurse?.fullName || viewHandover.receivingNurseName || '—'}</p>
                    {viewHandover.acknowledgedAt && <p className="text-xs text-teal-600">Ack: {formatTime(viewHandover.acknowledgedAt)}</p>}
                  </div>
                  {viewHandover.witnessNurse && (
                    <div className="bg-purple-50 rounded-lg p-3">
                      <p className="text-xs text-purple-600 font-medium">Witness</p>
                      <p className="font-semibold text-purple-900">{viewHandover.witnessNurse.fullName}</p>
                    </div>
                  )}
                </div>
                {viewHandover.receiverNotes && (
                  <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm">
                    <strong>Receiver Notes:</strong> {viewHandover.receiverNotes}
                  </div>
                )}
                {viewHandover.issuesRaised && viewHandover.issueDetails && (
                  <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                    <strong>Disputed — Issues:</strong> {viewHandover.issueDetails}
                  </div>
                )}
              </section>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-4 border-t">
                {viewHandover.status === 'PENDING_ACKNOWLEDGEMENT' && (
                  <>
                    <button
                      onClick={() => handleAction(viewHandover.id, 'acknowledge')}
                      className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 font-medium flex items-center gap-2"
                    >
                      <UserCheck className="h-4 w-4" /> Acknowledge Handover
                    </button>
                    <button
                      onClick={() => {
                        const reason = prompt('Describe the issue with this handover:');
                        if (reason) handleAction(viewHandover.id, 'dispute', reason);
                      }}
                      className="bg-red-50 text-red-700 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-100 font-medium flex items-center gap-2"
                    >
                      <AlertOctagon className="h-4 w-4" /> Dispute
                    </button>
                  </>
                )}
                {viewHandover.status === 'ACKNOWLEDGED' && (
                  <button
                    onClick={() => handleAction(viewHandover.id, 'complete')}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium flex items-center gap-2"
                  >
                    <CheckCircle className="h-4 w-4" /> Mark Complete
                  </button>
                )}
                {viewHandover.status === 'DRAFT' && (
                  <button
                    onClick={() => handleAction(viewHandover.id, 'submit')}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
                  >
                    <ArrowRight className="h-4 w-4" /> Submit for Acknowledgement
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Handover Modal — SBAR Stepper */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center overflow-y-auto p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl my-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10 rounded-t-2xl">
              <div>
                <h2 className="text-lg font-bold text-gray-900">New Structured Handover</h2>
                <p className="text-xs text-gray-500">Step {formStep + 1} of {steps.length}: {steps[formStep]?.title}</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Step Progress */}
            <div className="px-6 pt-4">
              <div className="flex items-center gap-1">
                {steps.map((s, i) => (
                  <div key={i} className="flex-1">
                    <div
                      className={`h-2 rounded-full cursor-pointer transition-colors ${i <= formStep ? 'bg-teal-500' : 'bg-gray-200'}`}
                      onClick={() => setFormStep(i)}
                    />
                    <p className={`text-[10px] mt-1 text-center truncate ${i === formStep ? 'text-teal-700 font-semibold' : 'text-gray-400'}`}>{s.title}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6">
              {/* Step: Phase & Patient */}
              {steps[formStep]?.key === 'phase' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Handover Phase *</label>
                    <select
                      value={form.handoverPhase}
                      onChange={e => setForm({ ...form, handoverPhase: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500"
                    >
                      {Object.entries(PHASE_CONFIG).map(([k, v]) => (
                        <option key={k} value={k}>{v.label} — {v.description}</option>
                      ))}
                    </select>
                  </div>
                  <FormInput label="Theatre" value={form.theatreName} onChange={v => setForm({ ...form, theatreName: v })} placeholder="e.g. Theatre 1" />
                  <div className="grid grid-cols-2 gap-4">
                    <FormInput label="Patient Name" value={form.patientName} onChange={v => setForm({ ...form, patientName: v })} />
                    <FormInput label="Folder Number" value={form.patientFolderNumber} onChange={v => setForm({ ...form, patientFolderNumber: v })} />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <FormInput label="Age" value={form.patientAge} onChange={v => setForm({ ...form, patientAge: v })} type="number" />
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                      <select value={form.patientGender} onChange={e => setForm({ ...form, patientGender: e.target.value })} className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500">
                        <option value="">Select</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>
                    <FormInput label="Ward" value={form.patientWard} onChange={v => setForm({ ...form, patientWard: v })} />
                  </div>
                </div>
              )}

              {/* Step: S - Situation */}
              {steps[formStep]?.key === 'situation' && (
                <div className="space-y-4">
                  <SectionHeader icon={<Stethoscope className="h-4 w-4" />} title="S — Situation" color="text-teal-700" />
                  <FormInput label="Procedure Performed" value={form.procedurePerformed} onChange={v => setForm({ ...form, procedurePerformed: v })} />
                  <div className="grid grid-cols-2 gap-4">
                    <FormInput label="Surgeon" value={form.surgeonName} onChange={v => setForm({ ...form, surgeonName: v })} />
                    <FormInput label="Anaesthetist" value={form.anesthetistName} onChange={v => setForm({ ...form, anesthetistName: v })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Anaesthesia Type</label>
                    <select value={form.anesthesiaType} onChange={e => setForm({ ...form, anesthesiaType: e.target.value })} className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500">
                      <option value="">Select type</option>
                      <option value="General Anaesthesia">General Anaesthesia (GA)</option>
                      <option value="Spinal">Spinal</option>
                      <option value="Epidural">Epidural</option>
                      <option value="Regional Block">Regional Block</option>
                      <option value="Local Anaesthesia">Local Anaesthesia</option>
                      <option value="Sedation">Sedation</option>
                      <option value="Combined GA + Regional">Combined GA + Regional</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormInput label="Surgery Start Time" value={form.surgeryStartTime} onChange={v => setForm({ ...form, surgeryStartTime: v })} type="datetime-local" />
                    <FormInput label="Surgery End Time" value={form.surgeryEndTime} onChange={v => setForm({ ...form, surgeryEndTime: v })} type="datetime-local" />
                  </div>
                </div>
              )}

              {/* Step: B - Background */}
              {steps[formStep]?.key === 'background' && (
                <div className="space-y-4">
                  <SectionHeader icon={<FileText className="h-4 w-4" />} title="B — Background" color="text-blue-700" />
                  <FormTextarea label="Diagnosis" value={form.diagnosis} onChange={v => setForm({ ...form, diagnosis: v })} />
                  <FormTextarea label="Relevant History (Comorbidities, Medications)" value={form.relevantHistory} onChange={v => setForm({ ...form, relevantHistory: v })} />
                  <FormTextarea label="Allergies" value={form.allergies} onChange={v => setForm({ ...form, allergies: v })} placeholder="List all known allergies — CRITICAL" />
                  <FormTextarea label="Pre-Op Investigations (key results)" value={form.preOpInvestigations} onChange={v => setForm({ ...form, preOpInvestigations: v })} />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ASA Grade</label>
                    <select value={form.asaGrade} onChange={e => setForm({ ...form, asaGrade: e.target.value })} className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500">
                      <option value="">Select ASA Grade</option>
                      <option value="ASA I">ASA I — Normal healthy patient</option>
                      <option value="ASA II">ASA II — Mild systemic disease</option>
                      <option value="ASA III">ASA III — Severe systemic disease</option>
                      <option value="ASA IV">ASA IV — Life-threatening disease</option>
                      <option value="ASA V">ASA V — Moribund patient</option>
                      <option value="ASA VI">ASA VI — Brain-dead organ donor</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Step: A - Assessment */}
              {steps[formStep]?.key === 'assessment' && (
                <div className="space-y-4">
                  <SectionHeader icon={<Activity className="h-4 w-4" />} title="A — Assessment (Intra-Operative)" color="text-purple-700" />
                  <div className="grid grid-cols-2 gap-4">
                    <FormInput label="Estimated Blood Loss (ml)" value={form.estimatedBloodLoss} onChange={v => setForm({ ...form, estimatedBloodLoss: v })} />
                    <FormInput label="Fluids Given (type & volume)" value={form.fluidGiven} onChange={v => setForm({ ...form, fluidGiven: v })} />
                    <FormInput label="Blood Products Given" value={form.bloodProductsGiven} onChange={v => setForm({ ...form, bloodProductsGiven: v })} />
                    <FormInput label="Urine Output (ml)" value={form.urineOutput} onChange={v => setForm({ ...form, urineOutput: v })} />
                  </div>

                  <p className="text-sm font-medium text-purple-700 mt-4">Last Vital Signs at Handover</p>
                  <div className="grid grid-cols-4 gap-3">
                    <FormInput label="BP" value={form.lastBP} onChange={v => setForm({ ...form, lastBP: v })} placeholder="120/80" />
                    <FormInput label="HR (bpm)" value={form.lastHR} onChange={v => setForm({ ...form, lastHR: v })} placeholder="72" />
                    <FormInput label="SpO2 (%)" value={form.lastSpO2} onChange={v => setForm({ ...form, lastSpO2: v })} placeholder="98" />
                    <FormInput label="Temp (°C)" value={form.lastTemp} onChange={v => setForm({ ...form, lastTemp: v })} placeholder="36.8" />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <FormInput label="Pain Score (0-10)" value={form.painScore} onChange={v => setForm({ ...form, painScore: v })} type="number" />
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Consciousness</label>
                      <select value={form.consciousnessLevel} onChange={e => setForm({ ...form, consciousnessLevel: e.target.value })} className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500">
                        <option value="">Select</option>
                        <option value="FULLY_AWAKE">Fully Awake</option>
                        <option value="DROWSY">Drowsy</option>
                        <option value="SEDATED">Sedated</option>
                        <option value="RESPONSIVE_TO_VOICE">Responsive to Voice</option>
                        <option value="RESPONSIVE_TO_PAIN">Responsive to Pain</option>
                        <option value="UNRESPONSIVE">Unresponsive</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Airway Status</label>
                      <select value={form.airwayStatus} onChange={e => setForm({ ...form, airwayStatus: e.target.value })} className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500">
                        <option value="">Select</option>
                        <option value="PATENT">Patent (self-maintaining)</option>
                        <option value="OPA_IN_SITU">Oropharyngeal airway in-situ</option>
                        <option value="LMA">Laryngeal Mask Airway</option>
                        <option value="ETT_INTUBATED">Endotracheal Tube (intubated)</option>
                        <option value="TRACHEOSTOMY">Tracheostomy</option>
                      </select>
                    </div>
                  </div>
                  <FormTextarea label="Intra-Op Complications" value={form.intraOpComplications} onChange={v => setForm({ ...form, intraOpComplications: v })} placeholder="Describe any complications" />
                  <FormTextarea label="Unexpected Events" value={form.unexpectedEvents} onChange={v => setForm({ ...form, unexpectedEvents: v })} />
                  <FormInput label="Implants Used" value={form.implantsUsed} onChange={v => setForm({ ...form, implantsUsed: v })} />
                </div>
              )}

              {/* Step: Theatre Preparation */}
              {steps[formStep]?.key === 'theatrePrep' && (
                <div className="space-y-4">
                  <SectionHeader icon={<ListChecks className="h-4 w-4" />} title="Theatre Preparation Status" color="text-indigo-700" />
                  <p className="text-sm text-gray-500">Confirm theatre readiness items</p>
                  <div className="grid grid-cols-2 gap-4">
                    <CheckField label="Theatre Assigned & Available" checked={form.theatreAssigned} onChange={v => setForm({ ...form, theatreAssigned: v })} />
                    <CheckField label="Instrument Set Prepared" checked={form.instrumentSetPrepared} onChange={v => setForm({ ...form, instrumentSetPrepared: v })} />
                    <CheckField label="Sterility Confirmed" checked={form.sterilityConfirmed} onChange={v => setForm({ ...form, sterilityConfirmed: v })} />
                    <CheckField label="Equipment Checked & Functional" checked={form.equipmentChecked} onChange={v => setForm({ ...form, equipmentChecked: v })} />
                    <CheckField label="Implants Available (if needed)" checked={form.implantsAvailable} onChange={v => setForm({ ...form, implantsAvailable: v })} />
                  </div>
                </div>
              )}

              {/* Step: Anaesthesia & Safety */}
              {steps[formStep]?.key === 'anaesthesiaSafety' && (
                <div className="space-y-4">
                  <SectionHeader icon={<Shield className="h-4 w-4" />} title="Anaesthesia & Safety Verification" color="text-red-700" />
                  <div className="grid grid-cols-2 gap-4">
                    <CheckField label="Consent Obtained" checked={form.consentObtained} onChange={v => setForm({ ...form, consentObtained: v })} />
                    <CheckField label="Pre-Op Checklist Completed" checked={form.preOpChecklistCompleted} onChange={v => setForm({ ...form, preOpChecklistCompleted: v })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Blood Availability</label>
                    <select value={form.bloodAvailability} onChange={e => setForm({ ...form, bloodAvailability: e.target.value })} className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500">
                      <option value="">Select</option>
                      <option value="Group & Save Only">Group & Save Only</option>
                      <option value="Crossmatched - Available">Crossmatched - Available</option>
                      <option value="Crossmatched - Not Ready">Crossmatched - Not Ready</option>
                      <option value="Not Required">Not Required</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fasting Status</label>
                    <select value={form.fastingStatus} onChange={e => setForm({ ...form, fastingStatus: e.target.value })} className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500">
                      <option value="">Select</option>
                      <option value="NBM > 6hrs (Compliant)">NBM &gt; 6hrs (Compliant)</option>
                      <option value="NBM 4-6hrs">NBM 4-6hrs</option>
                      <option value="NBM 2-4hrs">NBM 2-4hrs</option>
                      <option value="NBM < 2hrs (Non-compliant)">NBM &lt; 2hrs (Non-compliant)</option>
                      <option value="Emergency - Not Fasted">Emergency - Not Fasted</option>
                    </select>
                  </div>
                  <FormTextarea label="Fasting Details / Notes" value={form.fastingDetails} onChange={v => setForm({ ...form, fastingDetails: v })} placeholder="Last oral intake time, details..." />
                </div>
              )}

              {/* Step: Nursing Tasks */}
              {steps[formStep]?.key === 'nursingTasks' && (
                <div className="space-y-4">
                  <SectionHeader icon={<Stethoscope className="h-4 w-4" />} title="Nursing Tasks Completed" color="text-cyan-700" />
                  <div className="grid grid-cols-2 gap-4">
                    <CheckField label="IV Line Secured" checked={form.ivLineSecured} onChange={v => setForm({ ...form, ivLineSecured: v })} />
                    <CheckField label="Medications Administered" checked={form.medicationsAdministered} onChange={v => setForm({ ...form, medicationsAdministered: v })} />
                  </div>
                  {form.medicationsAdministered && (
                    <FormTextarea label="Medication Details" value={form.medicationDetails} onChange={v => setForm({ ...form, medicationDetails: v })} placeholder="Drug, dose, route, time given..." />
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <CheckField label="Skin Preparation Done" checked={form.skinPreparation} onChange={v => setForm({ ...form, skinPreparation: v })} />
                    <CheckField label="Documentation Complete" checked={form.documentationComplete} onChange={v => setForm({ ...form, documentationComplete: v })} />
                  </div>
                  {form.skinPreparation && (
                    <FormInput label="Skin Prep Details" value={form.skinPrepDetails} onChange={v => setForm({ ...form, skinPrepDetails: v })} placeholder="Povidone-iodine / Chlorhexidine / Shaved..." />
                  )}
                  {form.documentationComplete && (
                    <FormTextarea label="Documentation Notes" value={form.documentationNotes} onChange={v => setForm({ ...form, documentationNotes: v })} placeholder="Nursing notes, OR register, count sheets..." />
                  )}
                </div>
              )}

              {/* Step: WHO Safety Counts */}
              {steps[formStep]?.key === 'counts' && (
                <div className="space-y-4">
                  <SectionHeader icon={<Shield className="h-4 w-4" />} title="WHO Surgical Safety — Sign Out" color="text-orange-700" />
                  <p className="text-sm text-gray-500">Confirm all counts before completing handover</p>
                  <div className="grid grid-cols-2 gap-4">
                    <CheckField label="Instrument Count Correct" checked={form.instrumentCountCorrect} onChange={v => setForm({ ...form, instrumentCountCorrect: v })} />
                    <CheckField label="Sponge/Swab Count Correct" checked={form.spongeCountCorrect} onChange={v => setForm({ ...form, spongeCountCorrect: v })} />
                    <CheckField label="Needle Count Correct" checked={form.needleCountCorrect} onChange={v => setForm({ ...form, needleCountCorrect: v })} />
                    <CheckField label="Sharps Count Correct" checked={form.sharpsCountCorrect} onChange={v => setForm({ ...form, sharpsCountCorrect: v })} />
                  </div>
                  <FormTextarea label="Count Discrepancy Details (if any)" value={form.countDiscrepancy} onChange={v => setForm({ ...form, countDiscrepancy: v })} />
                  <div className="grid grid-cols-3 gap-4">
                    <CheckField label="Specimen Collected" checked={form.specimenCollected} onChange={v => setForm({ ...form, specimenCollected: v })} />
                    <FormInput label="Specimen Label" value={form.specimenLabel} onChange={v => setForm({ ...form, specimenLabel: v })} />
                    <CheckField label="Sent to Lab" checked={form.specimenSentToLab} onChange={v => setForm({ ...form, specimenSentToLab: v })} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <CheckField label="Equipment Problems" checked={form.equipmentProblems} onChange={v => setForm({ ...form, equipmentProblems: v })} />
                    {form.equipmentProblems && (
                      <FormTextarea label="Equipment Problem Details" value={form.equipmentProblemDetails} onChange={v => setForm({ ...form, equipmentProblemDetails: v })} />
                    )}
                  </div>
                </div>
              )}

              {/* Step: Drains & Lines */}
              {steps[formStep]?.key === 'drains' && (
                <div className="space-y-4">
                  <SectionHeader icon={<Syringe className="h-4 w-4" />} title="Drains, Lines & Devices" color="text-cyan-700" />
                  <DeviceInput label="Drains" inSitu={form.drainsInSitu} details={form.drainDetails}
                    onToggle={v => setForm({ ...form, drainsInSitu: v })}
                    onDetails={v => setForm({ ...form, drainDetails: v })}
                    placeholder="Type, location, output volume"
                  />
                  <DeviceInput label="Urinary Catheter" inSitu={form.catheterInSitu} details={form.catheterDetails}
                    onToggle={v => setForm({ ...form, catheterInSitu: v })}
                    onDetails={v => setForm({ ...form, catheterDetails: v })}
                    placeholder="Type (Foley), output, bag attached"
                  />
                  <DeviceInput label="IV Lines" inSitu={form.ivLinesInSitu} details={form.ivLineDetails}
                    onToggle={v => setForm({ ...form, ivLinesInSitu: v })}
                    onDetails={v => setForm({ ...form, ivLineDetails: v })}
                    placeholder="Peripheral/Central, site, fluid running"
                  />
                  <DeviceInput label="NG Tube" inSitu={form.ngTubeInSitu} details={form.ngTubeDetails}
                    onToggle={v => setForm({ ...form, ngTubeInSitu: v })}
                    onDetails={v => setForm({ ...form, ngTubeDetails: v })}
                    placeholder="On free drainage / clamped / aspirate color"
                  />
                  <FormInput label="Wound Dressing" value={form.woundDressing} onChange={v => setForm({ ...form, woundDressing: v })} placeholder="Dry/Intact/Gauze/Opsite" />
                </div>
              )}

              {/* Step: R - Recommendation */}
              {steps[formStep]?.key === 'recommendation' && (
                <div className="space-y-4">
                  <SectionHeader icon={<Pill className="h-4 w-4" />} title="R — Recommendation" color="text-green-700" />
                  <FormTextarea label="Post-Op Orders" value={form.postOpOrders} onChange={v => setForm({ ...form, postOpOrders: v })} />
                  <div className="grid grid-cols-2 gap-4">
                    <FormInput label="O₂ Requirement" value={form.oxygenRequirement} onChange={v => setForm({ ...form, oxygenRequirement: v })} placeholder="e.g. 2L nasal prongs" />
                    <FormInput label="IV Fluid Orders" value={form.ivFluidOrders} onChange={v => setForm({ ...form, ivFluidOrders: v })} placeholder="e.g. NS 1L over 8hrs" />
                  </div>
                  <FormTextarea label="Pain Management Plan" value={form.painManagementPlan} onChange={v => setForm({ ...form, painManagementPlan: v })} />
                  <FormTextarea label="Antibiotic Plan" value={form.antibioticPlan} onChange={v => setForm({ ...form, antibioticPlan: v })} />
                  <FormInput label="DVT Prophylaxis" value={form.dvtProphylaxis} onChange={v => setForm({ ...form, dvtProphylaxis: v })} placeholder="Enoxaparin 40mg SC OD / TED stockings" />
                  <div className="grid grid-cols-2 gap-4">
                    <FormInput label="Dietary Instructions" value={form.dietaryInstructions} onChange={v => setForm({ ...form, dietaryInstructions: v })} placeholder="NBM / Sips of water / Light diet" />
                    <FormInput label="Mobility Instructions" value={form.mobilityInstructions} onChange={v => setForm({ ...form, mobilityInstructions: v })} placeholder="Bed rest / Mobilise with assistance" />
                  </div>
                  <FormInput label="Monitoring Frequency" value={form.monitoringFrequency} onChange={v => setForm({ ...form, monitoringFrequency: v })} placeholder="q15min x 1hr, then q30min x 2hr" />
                  <FormTextarea label="Investigations Ordered" value={form.investigationsOrdered} onChange={v => setForm({ ...form, investigationsOrdered: v })} placeholder="Post-op FBC, U&E at 6hrs..." />
                  <FormTextarea label="Follow-Up Plan" value={form.followUpPlan} onChange={v => setForm({ ...form, followUpPlan: v })} />
                  <FormTextarea label="Escalation Criteria (RED FLAGS)" value={form.escalationCriteria} onChange={v => setForm({ ...form, escalationCriteria: v })} placeholder="Call surgeon if: BP <90, HR >120, bleeding >..." />
                </div>
              )}

              {/* Step: Shift Handover — Pending Tasks */}
              {steps[formStep]?.key === 'pending' && (
                <div className="space-y-4">
                  <SectionHeader icon={<FileText className="h-4 w-4" />} title="Pending Tasks & Orders" color="text-blue-700" />
                  <FormTextarea label="Pending Tasks" value={form.pendingTasks} onChange={v => setForm({ ...form, pendingTasks: v })} placeholder="Tasks not yet completed this shift..." />
                  <FormTextarea label="Outstanding Orders" value={form.outstandingOrders} onChange={v => setForm({ ...form, outstandingOrders: v })} placeholder="Pending doctor orders, lab results..." />
                </div>
              )}

              {/* Step: Shift Handover — Schedule & Staffing */}
              {steps[formStep]?.key === 'schedule' && (
                <div className="space-y-4">
                  <SectionHeader icon={<Users className="h-4 w-4" />} title="Schedule & Staffing" color="text-purple-700" />
                  <FormTextarea label="Upcoming Surgeries" value={form.upcomingSurgeries} onChange={v => setForm({ ...form, upcomingSurgeries: v })} placeholder="Remaining cases on the list..." />
                  <FormTextarea label="Staffing Concerns" value={form.staffingConcerns} onChange={v => setForm({ ...form, staffingConcerns: v })} placeholder="Staff shortages, breaks needed..." />
                </div>
              )}

              {/* Step: Shift Handover — Equipment & Cleanliness */}
              {steps[formStep]?.key === 'equipment' && (
                <div className="space-y-4">
                  <SectionHeader icon={<Shield className="h-4 w-4" />} title="Equipment & Cleanliness" color="text-orange-700" />
                  <FormTextarea label="Equipment Issues" value={form.equipmentIssues} onChange={v => setForm({ ...form, equipmentIssues: v })} placeholder="Faulty/missing equipment..." />
                  <FormTextarea label="Theatre Cleanliness Status" value={form.theatreCleanliness} onChange={v => setForm({ ...form, theatreCleanliness: v })} placeholder="Cleaning done/pending, bio-hazard status..." />
                </div>
              )}

              {/* Step: Special Alerts */}
              {steps[formStep]?.key === 'specialAlerts' && (
                <div className="space-y-4">
                  <SectionHeader icon={<AlertOctagon className="h-4 w-4" />} title="Special Notes & Alerts" color="text-red-700" />
                  <p className="text-sm text-gray-500">Flag critical safety alerts for the incoming team</p>
                  <div className="grid grid-cols-2 gap-4">
                    <CheckField label="Infection Risk" checked={form.infectionRisk} onChange={v => setForm({ ...form, infectionRisk: v })} />
                    <CheckField label="High-Risk Patient" checked={form.highRiskPatient} onChange={v => setForm({ ...form, highRiskPatient: v })} />
                    <CheckField label="Special Positioning Required" checked={form.specialPositioning} onChange={v => setForm({ ...form, specialPositioning: v })} />
                    <CheckField label="Equipment Concerns" checked={form.equipmentConcerns} onChange={v => setForm({ ...form, equipmentConcerns: v })} />
                  </div>
                  {form.infectionRisk && (
                    <FormTextarea label="Infection Risk Details" value={form.infectionRiskDetails} onChange={v => setForm({ ...form, infectionRiskDetails: v })} placeholder="MRSA, TB, Hepatitis, HIV — describe precautions..." />
                  )}
                  {form.highRiskPatient && (
                    <FormTextarea label="High Risk Details" value={form.highRiskDetails} onChange={v => setForm({ ...form, highRiskDetails: v })} placeholder="Cardiac history, coagulopathy, difficult airway..." />
                  )}
                  {form.specialPositioning && (
                    <FormTextarea label="Positioning Details" value={form.positioningDetails} onChange={v => setForm({ ...form, positioningDetails: v })} placeholder="Lateral decubitus, prone, lithotomy, pressure points..." />
                  )}
                  {form.equipmentConcerns && (
                    <FormTextarea label="Equipment Concern Details" value={form.equipmentConcernDetails} onChange={v => setForm({ ...form, equipmentConcernDetails: v })} placeholder="Faulty suction, unavailable diathermy, backup needed..." />
                  )}
                  <FormTextarea label="Additional Special Alerts / Notes" value={form.specialAlerts} onChange={v => setForm({ ...form, specialAlerts: v })} placeholder="Any other critical information for handover team..." />

                  {/* Photo Upload */}
                  <div className="mt-4 border-t pt-4">
                    <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2"><Camera className="h-4 w-4" /> Wound / Site Photos</p>
                    <p className="text-xs text-gray-500 mb-2">Attach photos of wound site, dressings, or relevant clinical images</p>
                    <PhotoUploadField
                      photos={form.woundImages || []}
                      onChange={(photos) => setForm({ ...form, woundImages: photos })}
                    />
                  </div>

                  {/* Voice Notes */}
                  <div className="mt-4 border-t pt-4">
                    <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2"><Mic className="h-4 w-4" /> Voice Note</p>
                    <p className="text-xs text-gray-500 mb-2">Record a brief verbal handover summary</p>
                    <VoiceNoteField
                      voiceUrl={form.voiceNoteUrl || ''}
                      onChange={(url) => setForm({ ...form, voiceNoteUrl: url })}
                    />
                  </div>
                </div>
              )}

              {/* Step: Receiver */}
              {steps[formStep]?.key === 'receiver' && (
                <div className="space-y-4">
                  <SectionHeader icon={<UserCheck className="h-4 w-4" />} title="Receiving Nurse" color="text-teal-700" />
                  <FormInput label="Receiving Nurse Name" value={form.receivingNurseName} onChange={v => setForm({ ...form, receivingNurseName: v })} placeholder="Name of the nurse receiving handover" />
                  <p className="text-xs text-gray-400">The receiving nurse will need to acknowledge this handover digitally</p>
                </div>
              )}

              {/* Navigation */}
              <div className="flex items-center justify-between mt-8 pt-4 border-t">
                <button
                  disabled={formStep === 0}
                  onClick={() => setFormStep(s => s - 1)}
                  className="flex items-center gap-1 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronUp className="h-4 w-4 rotate-[-90deg]" /> Previous
                </button>
                <span className="text-xs text-gray-400">{formStep + 1} / {steps.length}</span>
                {formStep < steps.length - 1 ? (
                  <button
                    onClick={() => setFormStep(s => s + 1)}
                    className="flex items-center gap-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium"
                  >
                    Next <ChevronDown className="h-4 w-4 rotate-[-90deg]" />
                  </button>
                ) : (
                  <button
                    onClick={handleCreate}
                    disabled={creating}
                    className="flex items-center gap-2 px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium disabled:opacity-50"
                  >
                    {creating ? (
                      <><RefreshCw className="h-4 w-4 animate-spin" /> Submitting...</>
                    ) : (
                      <><CheckCircle className="h-4 w-4" /> Submit Handover</>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// === Helper Components ===

function FormInput({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
    </div>
  );
}

function FormTextarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3}
        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
    </div>
  );
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        className="h-5 w-5 text-teal-600 rounded focus:ring-teal-500" />
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </label>
  );
}

function DeviceInput({ label, inSitu, details, onToggle, onDetails, placeholder }: {
  label: string; inSitu: boolean; details: string;
  onToggle: (v: boolean) => void; onDetails: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="border rounded-lg p-3">
      <label className="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" checked={inSitu} onChange={e => onToggle(e.target.checked)}
          className="h-5 w-5 text-teal-600 rounded focus:ring-teal-500" />
        <span className="text-sm font-medium text-gray-700">{label} In-Situ</span>
      </label>
      {inSitu && (
        <textarea value={details} onChange={e => onDetails(e.target.value)} placeholder={placeholder} rows={2}
          className="w-full border rounded-lg px-3 py-2 text-sm mt-2 focus:ring-2 focus:ring-teal-500" />
      )}
    </div>
  );
}

function InfoField({ label, value, highlight }: { label: string; value: string | null | undefined; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-2 ${highlight && value ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-sm font-medium ${highlight && value ? 'text-red-800' : 'text-gray-900'}`}>{value || '—'}</p>
    </div>
  );
}

function VitalField({ label, value, icon }: { label: string; value: string | null; icon: React.ReactNode }) {
  return (
    <div className="bg-blue-50 rounded-lg p-2 flex items-center gap-2">
      <div className="text-blue-500">{icon}</div>
      <div>
        <p className="text-xs text-blue-600">{label}</p>
        <p className="text-sm font-bold text-blue-900">{value || '—'}</p>
      </div>
    </div>
  );
}

function CountBadge({ label, correct }: { label: string; correct: boolean | null }) {
  const color = correct === true ? 'bg-green-100 text-green-800 border-green-200' : correct === false ? 'bg-red-100 text-red-800 border-red-200' : 'bg-gray-100 text-gray-600 border-gray-200';
  const icon = correct === true ? <CheckCircle className="h-4 w-4" /> : correct === false ? <AlertTriangle className="h-4 w-4" /> : null;
  return (
    <div className={`flex items-center gap-2 p-3 rounded-lg border ${color}`}>
      {icon}
      <div>
        <p className="text-xs font-medium">{label}</p>
        <p className="text-sm font-bold">{correct === true ? 'Correct' : correct === false ? 'DISCREPANCY' : 'Not checked'}</p>
      </div>
    </div>
  );
}

function DeviceField({ label, inSitu, details }: { label: string; inSitu: boolean; details: string | null }) {
  return (
    <div className={`rounded-lg p-2 ${inSitu ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-sm font-medium ${inSitu ? 'text-amber-800' : 'text-gray-500'}`}>
        {inSitu ? `IN SITU — ${details || 'No details'}` : 'Not in-situ'}
      </p>
    </div>
  );
}

function SectionHeader({ icon, title, color }: { icon: React.ReactNode; title: string; color: string }) {
  return (
    <h3 className={`text-sm font-bold uppercase tracking-wider ${color} flex items-center gap-2 pb-2 border-b`}>
      {icon} {title}
    </h3>
  );
}

function ReadinessBadge({ label, checked }: { label: string; checked: boolean | null }) {
  const isReady = checked === true;
  return (
    <div className={`flex items-center gap-2 p-3 rounded-lg border ${
      isReady ? 'bg-green-50 border-green-200 text-green-800' : 'bg-gray-50 border-gray-200 text-gray-500'
    }`}>
      {isReady ? <CheckCircle className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-gray-400" />}
      <div>
        <p className="text-xs font-medium">{label}</p>
        <p className="text-sm font-bold">{isReady ? '✓ Done' : 'Pending'}</p>
      </div>
    </div>
  );
}

function PhotoUploadField({ photos, onChange }: { photos: string[]; onChange: (p: string[]) => void }) {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image must be under 5MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        onChange([...photos, base64]);
      };
      reader.readAsDataURL(file);
    });
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {photos.map((p, i) => (
          <div key={i} className="relative group">
            <img src={p} alt={`Photo ${i + 1}`} className="h-20 w-20 object-cover rounded-lg border" />
            <button
              type="button"
              onClick={() => onChange(photos.filter((_, idx) => idx !== i))}
              className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full h-5 w-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
            >&times;</button>
          </div>
        ))}
      </div>
      <label className="inline-flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-teal-500 hover:bg-teal-50 text-sm text-gray-600">
        <Camera className="h-4 w-4" /> Add Photo
        <input type="file" accept="image/*" capture="environment" multiple onChange={handleFileChange} className="hidden" />
      </label>
    </div>
  );
}

function VoiceNoteField({ voiceUrl, onChange }: { voiceUrl: string; onChange: (url: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => onChange(reader.result as string);
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      setMediaRecorder(recorder);
      setRecording(true);
    } catch {
      toast.error('Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setRecording(false);
    }
  };

  return (
    <div className="space-y-2">
      {voiceUrl ? (
        <div className="flex items-center gap-3">
          <audio controls src={voiceUrl} className="flex-1 h-10" />
          <button type="button" onClick={() => onChange('')} className="text-xs text-red-600 hover:text-red-700">Remove</button>
        </div>
      ) : (
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            recording ? 'bg-red-600 text-white animate-pulse' : 'border-2 border-dashed border-gray-300 text-gray-600 hover:border-teal-500 hover:bg-teal-50'
          }`}
        >
          <Mic className="h-4 w-4" />
          {recording ? 'Stop Recording...' : 'Record Voice Note'}
        </button>
      )}
    </div>
  );
}
