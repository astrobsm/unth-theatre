'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  Droplet,
  Wrench,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Plus,
  RefreshCw,
  Gauge,
  ThermometerSun,
  ArrowUp,
  ArrowDown,
  Clock,
  Eye,
  Play,
  Send,
  Filter,
  Waves,
  ShowerHead,
  ClipboardList,
  MapPin,
  MessageCircle,
} from 'lucide-react';
import {
  buildWaterAreas, groupAreasByLocation, readWaterAreas, summariseAreas,
  faultLocations, missingExplanations, AREA_STATUS_LABEL,
  type TheatreRow, type WaterArea,
} from '@/lib/water/waterAreas';
import { openForLabel, reassessmentNotice } from '@/lib/water/issues';
import { readinessAreas } from '@/lib/water/readiness';
import { requestFix } from '@/lib/geo/requestFix';
import { whatsappLink } from '@/lib/whatsapp';

// ===== INTERFACES =====

interface PlumbingFault {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  location: string;
  floor: string | null;
  building: string | null;
  reportedBy: { fullName: string; role: string };
  reportedByName: string;
  reportedAt: string;
  assignedTo: { fullName: string; role: string } | null;
  assignedToName: string | null;
  assignedAt: string | null;
  acknowledgedBy: { fullName: string } | null;
  acknowledgedAt: string | null;
  resolvedBy: { fullName: string } | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  partsUsed: string | null;
  affectsTheatreOps: boolean;
  theatresAffected: string | null;
  isEscalated: boolean;
  estimatedCost: number | null;
  actualCost: number | null;
  notes: string | null;
  photoUrl: string | null;
}

interface WaterStatus {
  id: string;
  statusDate: string;
  shiftType: string;
  municipalWaterAvailable: boolean;
  boreholeOperational: boolean;
  overheadTankLevel: number;
  groundTankLevel: number;
  mainPumpOperational: boolean;
  backupPumpOperational: boolean;
  boosterPumpOperational: boolean;
  mainLinePressure: string;
  theatreLinePressure: string;
  hotWaterAvailable: boolean;
  hotWaterTemperature: string | null;
  boilerOperational: boolean;
  /** JSON array of every room this shift covered. Null on rows logged before it existed. */
  areaStatuses: string | null;
  theatre1Status: string;
  theatre2Status: string;
  theatre3Status: string;
  theatre4Status: string;
  scrubAreaStatus: string;
  recoveryAreaStatus: string;
  sterilizationAreaStatus: string;
  drainageFlowing: boolean;
  drainageIssues: string | null;
  overallStatus: string;
  /** How the theatres get water while whatever is wrong stays wrong. */
  contingencyPlan: string | null;
  /** Where the person was when they logged it. Null where nothing arrived. */
  loggedFixVerdict: string | null;
  loggedDistanceM: number | null;
  loggedLocationUnavailableReason: string | null;
  loggedBy: { fullName: string; role: string };
  loggedByName: string;
  actionRequired: string | null;
  actionTaken: string | null;
  notes: string | null;
}

/**
 * A water fault that is waiting to be re-assessed.
 *
 * It outlives the report that opened it. Closed by one thing only: a later
 * report that looked at the same area and found it OK.
 */
interface WaterIssue {
  id: string;
  source: string;
  sourceId: string;
  areaKey: string;
  areaName: string;
  location: string | null;
  status: string;
  problem: string | null;
  actionTaken: string | null;
  contingencyPlan: string | null;
  openedAt: string;
  openedByName: string | null;
  lastSeenAt: string;
  sightings: number;
  chaseCount: number;
  resolvedAt: string | null;
  resolvedByName?: string | null;
}

/** A chase the person filing the report can press, there and then. */
interface Handoff {
  name: string;
  kind: string;
  number: string;
  text: string;
}

interface Escalation {
  opened: { areaKey: string; areaName: string; status: string }[];
  closed: { areaKey: string; areaName: string; openedAt: string }[];
  openCount: number;
  handoffs: Handoff[];
  whatsappQueued: number;
  whatsappSkipped: string[];
}

interface Stats {
  totalFaults: number;
  openFaults: number;
  criticalFaults: number;
  resolvedToday: number;
}

interface WaterReadiness {
  id: string;
  readinessDate: string;
  forDate: string;
  overheadTankLevel: number;
  groundTankLevel: number;
  restroomsWaterReady: boolean;
  scrubbingWaterReady: boolean;
  theatreActivitiesWaterReady: boolean;
  noShortageConfirmed: boolean;
  overallReadiness: string;
  riskDetails: string | null;
  actionTaken: string | null;
  contingencyPlan: string | null;
  loggedFixVerdict: string | null;
  notes: string | null;
  submittedAt: string;
  isLate: boolean;
  disciplinaryQueryIssued: boolean;
  loggedBy: { fullName: string; role: string };
  loggedByName: string;
}

interface ReadinessCompliance {
  loggedToday: boolean;
  pastDeadline: boolean;
  deadlineHourWat: number;
}

// ===== CONSTANTS =====

const FAULT_STATUS_COLORS: Record<string, string> = {
  REPORTED: 'bg-yellow-100 text-yellow-800',
  ACKNOWLEDGED: 'bg-blue-100 text-blue-800',
  IN_PROGRESS: 'bg-orange-100 text-orange-800',
  RESOLVED: 'bg-green-100 text-green-800',
  CLOSED: 'bg-gray-100 text-gray-800',
};

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-600 text-white',
  HIGH: 'bg-orange-500 text-white',
  MEDIUM: 'bg-yellow-500 text-white',
  LOW: 'bg-blue-500 text-white',
};

const OVERALL_STATUS_COLORS: Record<string, string> = {
  OPERATIONAL: 'text-green-600 bg-green-50 border-green-200',
  DEGRADED: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  CRITICAL: 'text-red-700 bg-red-50 border-red-200',
  OFFLINE: 'text-gray-700 bg-gray-100 border-gray-300',
};

const AREA_STATUS_EMOJI: Record<string, string> = {
  OK: '✅',
  LOW_PRESSURE: '⚠️',
  NO_WATER: '🚫',
  LEAK: '💧',
};

const FAULT_CATEGORIES = [
  { value: 'LEAK', label: 'Leak' },
  { value: 'BLOCKAGE', label: 'Blockage' },
  { value: 'BURST_PIPE', label: 'Burst Pipe' },
  { value: 'LOW_PRESSURE', label: 'Low Water Pressure' },
  { value: 'NO_WATER', label: 'No Water Supply' },
  { value: 'HOT_WATER_ISSUE', label: 'Hot Water Problem' },
  { value: 'DRAINAGE', label: 'Drainage Issue' },
  { value: 'SEWAGE', label: 'Sewage Issue' },
  { value: 'FIXTURE_DAMAGE', label: 'Fixture Damage' },
  { value: 'VALVE_ISSUE', label: 'Valve Issue' },
  { value: 'TANK_ISSUE', label: 'Tank Issue' },
  { value: 'PUMP_FAILURE', label: 'Pump Failure' },
  { value: 'OTHER', label: 'Other' },
];

// ===== COMPONENT =====

export default function PlumbingWaterSupplyPage() {
  const { data: session } = useSession();
  const [department, setDepartment] = useState<'water' | 'plumbing'>('water');
  const [activeTab, setActiveTab] = useState<'status' | 'readiness' | 'faults' | 'log'>('status');
  const [faults, setFaults] = useState<PlumbingFault[]>([]);
  const [waterStatuses, setWaterStatuses] = useState<WaterStatus[]>([]);
  const [latestStatus, setLatestStatus] = useState<WaterStatus | null>(null);
  const [stats, setStats] = useState<Stats>({ totalFaults: 0, openFaults: 0, criticalFaults: 0, resolvedToday: 0 });
  const [loading, setLoading] = useState(true);

  // Water-supply daily readiness
  const [readinessReports, setReadinessReports] = useState<WaterReadiness[]>([]);
  const [compliance, setCompliance] = useState<ReadinessCompliance>({ loggedToday: false, pastDeadline: false, deadlineHourWat: 17 });

  // Modals
  const [showFaultForm, setShowFaultForm] = useState(false);
  const [showStatusForm, setShowStatusForm] = useState(false);
  const [showReadinessForm, setShowReadinessForm] = useState(false);
  const [showResolveForm, setShowResolveForm] = useState<string | null>(null);
  const [showActionForm, setShowActionForm] = useState<string | null>(null);

  // Log-action (progress note) form
  const [actionText, setActionText] = useState('');

  // Filters
  const [faultStatusFilter, setFaultStatusFilter] = useState('');
  const [faultPriorityFilter, setFaultPriorityFilter] = useState('');

  // New fault form
  const [faultData, setFaultData] = useState({
    title: '', description: '', category: 'LEAK', priority: 'MEDIUM',
    location: '', floor: '', building: 'Main Theatre Complex',
    affectsTheatreOps: false, theatresAffected: [] as string[], notes: '',
  });

  // New water status form
  const [statusData, setStatusData] = useState({
    shiftType: 'MORNING',
    municipalWaterAvailable: true, boreholeOperational: true,
    overheadTankLevel: 50, groundTankLevel: 50,
    mainPumpOperational: true, backupPumpOperational: true, boosterPumpOperational: true,
    mainLinePressure: 'NORMAL', theatreLinePressure: 'NORMAL',
    hotWaterAvailable: true, hotWaterTemperature: '', boilerOperational: true,
    drainageFlowing: true, drainageIssues: '',
    overallStatus: 'OPERATIONAL', actionRequired: '', actionTaken: '', notes: '',
    // Asked for only when something is not OK, and then insisted on. The
    // theatre's question is never "is it broken" but "are we operating
    // today", and this is the field that answers it.
    contingencyPlan: '',
  });

  // Resolve form
  const [resolveData, setResolveData] = useState({
    resolutionNotes: '', partsUsed: '', actualCost: '',
  });

  // Daily water-supply readiness form (logged before 5 PM for next day's surgery)
  const [readinessData, setReadinessData] = useState({
    forDate: '',
    overheadTankLevel: 50,
    groundTankLevel: 50,
    restroomsWaterReady: true,
    scrubbingWaterReady: true,
    theatreActivitiesWaterReady: true,
    noShortageConfirmed: true,
    overallReadiness: 'READY',
    riskDetails: '',
    actionTaken: '',
    contingencyPlan: '',
    notes: '',
  });

  // Plumber list for assignment
  const [plumbers, setPlumbers] = useState<{ id: string; fullName: string }[]>([]);

  // Every theatre in the database, which is what the report has to cover.
  // Held in state rather than listed in this file: a room added next month
  // must appear on the form by itself, because nobody filling in a form can
  // see that a room is missing from it.
  const [theatres, setTheatres] = useState<TheatreRow[]>([]);
  const [statusAreas, setStatusAreas] = useState<WaterArea[]>([]);

  // The faults still waiting for somebody to go back and look again.
  const [openIssues, setOpenIssues] = useState<WaterIssue[]>([]);
  // Both forms take a position before they post, which takes a few seconds
  // on a handset indoors. Without this the person presses Submit twice and
  // the theatre gets two faults for one leak.
  const [submitting, setSubmitting] = useState(false);
  // What the submission did, shown straight afterwards: the queue is not a
  // delivery, so the wa.me buttons are what actually reach the two men who
  // have to fix it.
  const [chase, setChase] = useState<Escalation | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [res, readinessRes] = await Promise.all([
        fetch('/api/plumbing-water-supply?type=all'),
        fetch('/api/water-supply-readiness'),
      ]);
      if (res.ok) {
        const data = await res.json();
        setWaterStatuses(data.waterStatuses || []);
        setLatestStatus(data.latestStatus || null);
        setFaults(data.faults || []);
        setStats(data.stats || { totalFaults: 0, openFaults: 0, criticalFaults: 0, resolvedToday: 0 });
        setOpenIssues(data.openIssues || []);
      }
      if (readinessRes.ok) {
        const rdata = await readinessRes.json();
        setReadinessReports(rdata.reports || []);
        if (rdata.compliance) setCompliance(rdata.compliance);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPlumbers = useCallback(async () => {
    try {
      const res = await fetch('/api/users?role=PLUMBER');
      if (res.ok) {
        const data = await res.json();
        setPlumbers(Array.isArray(data) ? data : data.users || []);
      }
    } catch {}
  }, []);

  const fetchTheatres = useCallback(async () => {
    try {
      const res = await fetch('/api/theatres');
      if (res.ok) {
        const data = await res.json();
        setTheatres(Array.isArray(data) ? data : []);
      }
    } catch {}
  }, []);

  // The form is seeded from the theatre list and keeps whatever the user has
  // already picked, so a theatre arriving late over a slow link cannot wipe
  // a half-filled form.
  useEffect(() => {
    setStatusAreas(prev => buildWaterAreas(theatres, prev));
  }, [theatres]);

  useEffect(() => {
    fetchData();
    fetchPlumbers();
    fetchTheatres();
    const interval = setInterval(fetchData, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData, fetchPlumbers, fetchTheatres]);

  const handleReportFault = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/plumbing-water-supply/faults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(faultData),
      });
      if (res.ok) {
        setShowFaultForm(false);
        setFaultData({
          title: '', description: '', category: 'LEAK', priority: 'MEDIUM',
          location: '', floor: '', building: 'Main Theatre Complex',
          affectsTheatreOps: false, theatresAffected: [], notes: '',
        });
        fetchData();
      } else {
        const err = await res.json().catch(() => ({ error: 'Server error' }));
        alert(err.error || 'Failed to report fault. Please try again.');
      }
    } catch (error) {
      console.error('Error reporting fault:', error);
      alert('Network error. Please check your connection and try again.');
    }
  };

  const handleLogStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // The same check the server runs. Stopped here so the person is told
    // which box is empty while they are still looking at it, rather than
    // being handed a validation error after a ten-second position lookup.
    const missing = missingExplanations(statusAreas, statusData.contingencyPlan);
    if (missing.length > 0) {
      alert(missing.join('\n'));
      return;
    }

    setSubmitting(true);
    try {
      // WHERE THIS IS BEING LOGGED FROM. Awaited, but it cannot refuse the
      // submit and it cannot hang it: requestFix always resolves inside its
      // own timeout with either a position or the reason there is none, and
      // both are recorded.
      const fix = await requestFix();

      const res = await fetch('/api/plumbing-water-supply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...statusData, areaStatuses: statusAreas, fix }),
      });
      if (res.ok) {
        const saved = await res.json().catch(() => null);
        setShowStatusForm(false);
        setStatusAreas(buildWaterAreas(theatres));
        setStatusData(p => ({ ...p, contingencyPlan: '' }));
        if (saved?.escalation) setChase(saved.escalation as Escalation);
        fetchData();
      } else {
        const err = await res.json().catch(() => ({ error: 'Server error' }));
        alert(err.error || 'Failed to log the water status. Please try again.');
      }
    } catch (error) {
      console.error('Error logging status:', error);
      alert('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Go back and look at the open faults again.
   *
   * Opens the status form with the open faults' own statuses and notes
   * already in it, and everything else at OK. That is the shape of a
   * re-assessment: the person changes the ones that are now fixed and
   * leaves the rest, instead of retyping sixteen rooms from a blank form
   * and silently closing a fault by forgetting it.
   */
  const startReassessment = () => {
    setStatusAreas(prev => prev.map(area => {
      const issue = openIssues.find(i => i.areaKey === area.key);
      if (!issue) return { key: area.key, name: area.name, location: area.location, status: 'OK' };
      return {
        ...area,
        status: issue.status,
        problem: issue.problem ?? '',
        actionTaken: issue.actionTaken ?? '',
      };
    }));
    const plan = openIssues.map(i => i.contingencyPlan).find(Boolean);
    if (plan) setStatusData(p => ({ ...p, contingencyPlan: plan }));
    setShowStatusForm(true);
  };

  const handleFaultAction = async (faultId: string, action: string, extraData?: any) => {
    try {
      const res = await fetch(`/api/plumbing-water-supply/faults/${faultId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extraData }),
      });
      if (res.ok) {
        fetchData();
        if (action === 'RESOLVE') setShowResolveForm(null);
      }
    } catch (error) {
      console.error('Error performing action:', error);
    }
  };

  const handleLogAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showActionForm || actionText.trim().length < 3) {
      alert('Please describe the action you have taken.');
      return;
    }
    try {
      const res = await fetch(`/api/plumbing-water-supply/faults/${showActionForm}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'LOG_ACTION', action_taken: actionText.trim() }),
      });
      if (res.ok) {
        setShowActionForm(null);
        setActionText('');
        fetchData();
      } else {
        const err = await res.json().catch(() => ({ error: 'Server error' }));
        alert(err.error || 'Failed to log action.');
      }
    } catch (error) {
      console.error('Error logging action:', error);
      alert('Network error. Please try again.');
    }
  };

  const handleLogReadiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const missing = missingExplanations(
      readinessAreas(readinessData), readinessData.contingencyPlan,
    );
    if (missing.length > 0) {
      alert([
        'This readiness report cannot be filed yet:',
        ...missing.map(m => m
          .replace(/^Say what is wrong in .*$/, 'Say what the problem is.')
          .replace(/^Say what has been done about .*$/, 'Say what has been done about it so far.'))
          .filter((m, i, all) => all.indexOf(m) === i),
      ].join('\n'));
      return;
    }

    setSubmitting(true);
    try {
      const fix = await requestFix();
      const res = await fetch('/api/water-supply-readiness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...readinessData, fix }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.isLate) {
          alert('⚠️ This readiness report was logged AFTER the 5 PM deadline. A disciplinary query has been raised to management.');
        }
        setShowReadinessForm(false);
        setReadinessData({
          forDate: '',
          overheadTankLevel: 50,
          groundTankLevel: 50,
          restroomsWaterReady: true,
          scrubbingWaterReady: true,
          theatreActivitiesWaterReady: true,
          noShortageConfirmed: true,
          overallReadiness: 'READY',
          riskDetails: '',
          actionTaken: '',
          contingencyPlan: '',
          notes: '',
        });
        if (result?.escalation) setChase(result.escalation as Escalation);
        fetchData();
      } else {
        const err = await res.json().catch(() => ({ error: 'Server error' }));
        alert(err.error || 'Failed to log readiness. Please try again.');
      }
    } catch (error) {
      console.error('Error logging readiness:', error);
      alert('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // What the form is still missing, recomputed as it is filled in. Used to
  // keep the submit button honest rather than to scold: the reasons are
  // listed beside it, so nobody is left pressing a dead button.
  const statusMissing = missingExplanations(statusAreas, statusData.contingencyPlan);
  const readinessMissing = missingExplanations(
    readinessAreas(readinessData), readinessData.contingencyPlan,
  );
  const statusAreasNotOk = statusAreas.filter(a => a.status !== 'OK');
  const readinessNotOk = readinessAreas(readinessData).filter(a => a.status !== 'OK');

  const isWaterSupplyStaff = ['WATER_SUPPLY_SUPERVISOR', 'WORKS_SUPERVISOR', 'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER'].includes(session?.user?.role || '');
  const isPlumber = ['PLUMBER', 'PLUMBING_SUPERVISOR', 'WORKS_SUPERVISOR'].includes(session?.user?.role || '');
  const isManager = ['THEATRE_MANAGER', 'ADMIN', 'SYSTEM_ADMINISTRATOR', 'CHIEF_MEDICAL_DIRECTOR', 'WORKS_SUPERVISOR'].includes(session?.user?.role || '');

  const filteredFaults = faults.filter(f => {
    if (faultStatusFilter && f.status !== faultStatusFilter) return false;
    if (faultPriorityFilter && f.priority !== faultPriorityFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            {department === 'water' ? (
              <><Droplet className="w-8 h-8 text-blue-600" /> Water Supply</>
            ) : (
              <><Wrench className="w-8 h-8 text-orange-600" /> Plumbing</>
            )}
          </h1>
          <p className="text-gray-600 mt-1">
            {department === 'water'
              ? 'Daily water-supply readiness for theatre use, tank levels, and supply status'
              : 'Report plumbing faults, assign work, and log the action taken on each fault'}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          {department === 'plumbing' && (
            <button
              onClick={() => setShowFaultForm(true)}
              className="px-5 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 flex items-center gap-2 font-semibold shadow-lg"
            >
              <AlertTriangle className="w-5 h-5" /> Report Fault
            </button>
          )}
          {department === 'water' && isWaterSupplyStaff && (
            <>
              <button
                onClick={() => setShowReadinessForm(true)}
                className="px-5 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 flex items-center gap-2 font-semibold shadow-lg"
              >
                <CheckCircle className="w-5 h-5" /> Log Daily Readiness
              </button>
              <button
                onClick={() => setShowStatusForm(true)}
                className="px-5 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center gap-2 font-semibold shadow-lg"
              >
                <Plus className="w-5 h-5" /> Log Water Status
              </button>
            </>
          )}
        </div>
      </div>

      {/* Department selector — Water Supply and Plumbing are separate departments */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 max-w-md">
        <button
          onClick={() => { setDepartment('water'); setActiveTab('status'); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            department === 'water' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Droplet className="w-4 h-4" /> Water Supply
        </button>
        <button
          onClick={() => { setDepartment('plumbing'); setActiveTab('faults'); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            department === 'plumbing' ? 'bg-white shadow text-orange-700' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Wrench className="w-4 h-4" /> Plumbing
        </button>
      </div>

      {/* Daily readiness compliance banner (Water Supply department) */}
      {department === 'water' && (
        <div className={`rounded-xl border-2 p-4 flex items-center gap-3 ${
          compliance.loggedToday
            ? 'bg-green-50 border-green-200 text-green-800'
            : compliance.pastDeadline
            ? 'bg-red-50 border-red-300 text-red-800'
            : 'bg-yellow-50 border-yellow-200 text-yellow-800'
        }`}>
          <Clock className="w-6 h-6 flex-shrink-0" />
          <div className="text-sm">
            {compliance.loggedToday ? (
              <span><strong>Today&apos;s water-supply readiness has been logged.</strong> Next-day theatre water supply is on record.</span>
            ) : compliance.pastDeadline ? (
              <span><strong>OVERDUE:</strong> The daily water-supply readiness was not logged before the {compliance.deadlineHourWat % 12 || 12} PM deadline. Logging now will raise a disciplinary query.</span>
            ) : (
              <span><strong>Action required:</strong> Log today&apos;s water-supply readiness before {compliance.deadlineHourWat % 12 || 12} PM to confirm there will be no water shortage for tomorrow&apos;s surgery.</span>
            )}
          </div>
        </div>
      )}

      {/* Water faults still open — nothing closes these but a re-assessment */}
      {department === 'water' && openIssues.length > 0 && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-800">
                {reassessmentNotice(openIssues)}
              </p>
              <ul className="mt-3 space-y-2">
                {openIssues.slice(0, 8).map(issue => (
                  <li
                    key={issue.id}
                    className="text-sm text-red-900 bg-white/70 border border-red-200 rounded-lg p-3"
                  >
                    <p className="font-semibold">
                      {issue.areaName}{issue.location ? ` — ${issue.location}` : ''}:{' '}
                      {AREA_STATUS_LABEL[issue.status]
                        || issue.status.replace(/_/g, ' ').toLowerCase()}
                    </p>
                    {issue.problem && <p className="mt-1">Problem: {issue.problem}</p>}
                    {issue.actionTaken && <p>Done so far: {issue.actionTaken}</p>}
                    {issue.contingencyPlan && <p>Plan B: {issue.contingencyPlan}</p>}
                    <p className="text-xs text-red-700 mt-1">
                      Open {openForLabel(issue.openedAt)}
                      {issue.openedByName ? ` · reported by ${issue.openedByName}` : ''}
                      {issue.sightings > 1 ? ` · found broken ${issue.sightings} times` : ''}
                      {issue.chaseCount > 0 ? ` · chased ${issue.chaseCount}×` : ''}
                    </p>
                    {/* A fault is closed by the form that asks about it, and
                        by no other. Saying which one saves somebody filling
                        in the wrong report and finding it still open. */}
                    <p className="text-xs text-red-600 mt-0.5">
                      {issue.areaKey.startsWith('readiness:')
                        ? 'Closes when a daily readiness report gives this promise again.'
                        : 'Closes when a water status report finds this area OK again.'}
                    </p>
                  </li>
                ))}
              </ul>
              {openIssues.length > 8 && (
                <p className="text-xs text-red-700 mt-2">
                  and {openIssues.length - 8} more.
                </p>
              )}
              {isWaterSupplyStaff && openIssues.some(i => !i.areaKey.startsWith('readiness:')) && (
                <button
                  onClick={startReassessment}
                  className="mt-3 px-5 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 flex items-center gap-2 font-semibold"
                >
                  <RefreshCw className="w-4 h-4" /> Re-assess and correct the status
                </button>
              )}
              {isWaterSupplyStaff && openIssues.some(i => i.areaKey.startsWith('readiness:')) && (
                <button
                  onClick={() => setShowReadinessForm(true)}
                  className="mt-3 ml-0 md:ml-3 px-5 py-2 bg-emerald-700 text-white rounded-xl hover:bg-emerald-800 inline-flex items-center gap-2 font-semibold"
                >
                  <RefreshCw className="w-4 h-4" /> Re-assess the daily readiness
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Current Water Status */}
        <div className={`rounded-xl shadow-sm border-2 p-4 col-span-1 ${
          latestStatus ? OVERALL_STATUS_COLORS[latestStatus.overallStatus] || 'bg-white border-gray-200' : 'bg-white border-gray-200'
        }`}>
          <div className="flex items-center gap-3">
            <Waves className="w-8 h-8" />
            <div>
              <p className="text-2xl font-bold">{latestStatus?.overallStatus || 'N/A'}</p>
              <p className="text-xs">Water Supply</p>
            </div>
          </div>
        </div>
        {/* Tank Levels */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <ArrowUp className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{latestStatus?.overheadTankLevel ?? '--'}%</p>
              <p className="text-xs text-gray-500">Overhead Tank</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cyan-100 rounded-lg flex items-center justify-center">
              <ArrowDown className="w-5 h-5 text-cyan-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{latestStatus?.groundTankLevel ?? '--'}%</p>
              <p className="text-xs text-gray-500">Ground Tank</p>
            </div>
          </div>
        </div>
        {/* Open Faults */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <Wrench className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.openFaults}</p>
              <p className="text-xs text-gray-500">Open Faults</p>
            </div>
          </div>
        </div>
        {/* Critical */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.criticalFaults}</p>
              <p className="text-xs text-gray-500">Critical Faults</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {(department === 'water'
          ? [
              { key: 'status', label: 'Water Status', icon: Droplet },
              { key: 'readiness', label: 'Daily Readiness', icon: CheckCircle },
              { key: 'log', label: 'Status History', icon: Clock },
            ]
          : [
              { key: 'faults', label: 'Plumbing Faults', icon: Wrench },
            ]
        ).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all ${
              activeTab === tab.key ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* ===== WATER STATUS TAB ===== */}
          {activeTab === 'status' && (
            <div className="space-y-6">
              {!latestStatus ? (
                <div className="text-center py-20 bg-white rounded-xl shadow-sm border">
                  <Droplet className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-500">No Water Status Logged</h3>
                  <p className="text-gray-400">Plumbing staff can log the current water supply status</p>
                </div>
              ) : (
                <>
                  {/* Main Supply Status */}
                  <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <Waves className="w-5 h-5 text-blue-600" /> Main Water Supply
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <StatusCard
                        label="Municipal Water"
                        value={latestStatus.municipalWaterAvailable ? 'Available' : 'Unavailable'}
                        ok={latestStatus.municipalWaterAvailable}
                      />
                      <StatusCard
                        label="Borehole"
                        value={latestStatus.boreholeOperational ? 'Operational' : 'Down'}
                        ok={latestStatus.boreholeOperational}
                      />
                      <StatusCard
                        label="Main Line Pressure"
                        value={latestStatus.mainLinePressure}
                        ok={latestStatus.mainLinePressure === 'NORMAL'}
                      />
                      <StatusCard
                        label="Theatre Line Pressure"
                        value={latestStatus.theatreLinePressure}
                        ok={latestStatus.theatreLinePressure === 'NORMAL'}
                      />
                    </div>
                  </div>

                  {/* Tank Levels */}
                  <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <Gauge className="w-5 h-5 text-blue-600" /> Tank Levels & Pumps
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                      <TankGauge label="Overhead Tank" level={latestStatus.overheadTankLevel} />
                      <TankGauge label="Ground Tank" level={latestStatus.groundTankLevel} />
                      <div className="space-y-3">
                        <PumpStatus label="Main Pump" ok={latestStatus.mainPumpOperational} />
                        <PumpStatus label="Backup Pump" ok={latestStatus.backupPumpOperational} />
                        <PumpStatus label="Booster Pump" ok={latestStatus.boosterPumpOperational} />
                      </div>
                    </div>
                  </div>

                  {/* Hot Water */}
                  <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <ThermometerSun className="w-5 h-5 text-orange-600" /> Hot Water System
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <StatusCard label="Hot Water" value={latestStatus.hotWaterAvailable ? 'Available' : 'Unavailable'} ok={latestStatus.hotWaterAvailable} />
                      <StatusCard label="Boiler" value={latestStatus.boilerOperational ? 'Operational' : 'Down'} ok={latestStatus.boilerOperational} />
                      {latestStatus.hotWaterTemperature && (
                        <StatusCard label="Temperature" value={`${latestStatus.hotWaterTemperature}°C`} ok={true} />
                      )}
                    </div>
                  </div>

                  {/* Theatre-Level Status */}
                  <div className="bg-white rounded-xl shadow-sm border p-6">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                      <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <ShowerHead className="w-5 h-5 text-blue-600" /> Theatre Water Status
                      </h3>
                      <p className="text-sm text-gray-600">{summariseAreas(readWaterAreas(latestStatus), 4)}</p>
                    </div>
                    {/* Grouped by location: somebody at the Eye Theatre reads
                        one heading rather than hunting a flat list of sixteen
                        rooms for the one that is theirs. */}
                    {groupAreasByLocation(readWaterAreas(latestStatus)).map(group => (
                      <div key={group.location} className="mb-5 last:mb-0">
                        <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">
                          {group.location}
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {group.areas.map(area => (
                            <div key={area.key} className={`p-4 rounded-lg border-2 ${
                              area.status === 'OK' ? 'border-green-200 bg-green-50' :
                              area.status === 'LOW_PRESSURE' ? 'border-yellow-200 bg-yellow-50' :
                              area.status === 'NO_WATER' ? 'border-red-200 bg-red-50' :
                              'border-orange-200 bg-orange-50'
                            }`}>
                              <p className="text-sm font-bold text-gray-800">{area.name}</p>
                              <p className="text-lg mt-1">
                                {AREA_STATUS_EMOJI[area.status] || '❓'} {AREA_STATUS_LABEL[area.status] || area.status}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {/* A theatre created since this shift was logged is not in
                        the record, and saying so beats leaving a gap that
                        reads like a clean bill of health. */}
                    {theatres.filter(t => t.isOperatingRoom !== false).length
                      > readWaterAreas(latestStatus).filter(a => a.key.startsWith('theatre:')).length && (
                      <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        Theatres have been added since this status was logged. The next log will cover
                        all {theatres.filter(t => t.isOperatingRoom !== false).length} of them.
                      </p>
                    )}
                  </div>

                  {/* Drainage */}
                  <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">🚿 Drainage System</h3>
                    <StatusCard
                      label="Drainage"
                      value={latestStatus.drainageFlowing ? 'Flowing Normally' : 'Issues Detected'}
                      ok={latestStatus.drainageFlowing}
                    />
                    {latestStatus.drainageIssues && (
                      <p className="mt-3 text-sm text-red-700 bg-red-50 p-3 rounded-lg">
                        ⚠️ {latestStatus.drainageIssues}
                      </p>
                    )}
                  </div>

                  {/* Plan B, where there was one. The theatre's actual
                      question is whether today's list can run. */}
                  {latestStatus.contingencyPlan && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <p className="text-sm font-semibold text-amber-900">Plan B for water today</p>
                      <p className="text-sm text-amber-800 mt-1">{latestStatus.contingencyPlan}</p>
                    </div>
                  )}

                  {/* Meta Info */}
                  <div className="text-sm text-gray-500 text-right">
                    Last updated: {new Date(latestStatus.statusDate).toLocaleString()} by {latestStatus.loggedBy.fullName} ({latestStatus.shiftType} shift)
                    {/* Said as a fact about the handset, never as a doubt
                        about the person: a theatre basement gives no
                        position however diligent the round was. */}
                    {latestStatus.loggedFixVerdict === 'ON_SITE' ? (
                      <span className="block text-xs">
                        Logged from inside the hospital site
                        {typeof latestStatus.loggedDistanceM === 'number'
                          ? `, about ${latestStatus.loggedDistanceM} m from the centre of the campus`
                          : ''}.
                      </span>
                    ) : latestStatus.loggedFixVerdict === 'OFF_SITE' ? (
                      <span className="block text-xs">
                        Logged from outside the site boundary
                        {typeof latestStatus.loggedDistanceM === 'number'
                          ? `, about ${latestStatus.loggedDistanceM} m from the centre of the campus`
                          : ''}. A handset left behind reads the same way.
                      </span>
                    ) : latestStatus.loggedFixVerdict === 'IMPRECISE' ? (
                      <span className="block text-xs">
                        Logged with a position too vague to place.
                      </span>
                    ) : latestStatus.loggedLocationUnavailableReason ? (
                      <span className="block text-xs">
                        Logged without a position: {latestStatus.loggedLocationUnavailableReason}.
                      </span>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ===== DAILY READINESS TAB ===== */}
          {activeTab === 'readiness' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
                Water-supply staff must log readiness <strong>before 5 PM daily</strong>, confirming there will be no water
                shortage for the next day&apos;s surgery — covering <strong>toilets &amp; all rest rooms</strong>,
                <strong> surgical scrubbing during surgery</strong>, and <strong>all theatre activities</strong>.
                Late or missing logs raise a disciplinary query.
              </div>

              {readinessReports.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-xl shadow-sm border">
                  <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-500">No Readiness Logs</h3>
                  <p className="text-gray-400">Daily water-supply readiness reports will appear here</p>
                </div>
              ) : (
                <div className="overflow-x-auto bg-white rounded-xl shadow-sm border">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left p-4 font-semibold">Logged</th>
                        <th className="text-left p-4 font-semibold">For Surgery Day</th>
                        <th className="text-left p-4 font-semibold">Readiness</th>
                        <th className="text-left p-4 font-semibold">Restrooms</th>
                        <th className="text-left p-4 font-semibold">Scrubbing</th>
                        <th className="text-left p-4 font-semibold">Theatre Activities</th>
                        <th className="text-left p-4 font-semibold">On Time</th>
                        <th className="text-left p-4 font-semibold">Logged By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {readinessReports.map(r => (
                        <tr key={r.id} className="border-t hover:bg-gray-50">
                          <td className="p-4">{new Date(r.submittedAt || r.readinessDate).toLocaleString()}</td>
                          <td className="p-4">{new Date(r.forDate).toLocaleDateString()}</td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                              r.overallReadiness === 'READY' ? 'bg-green-100 text-green-800' :
                              r.overallReadiness === 'AT_RISK' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {r.overallReadiness.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="p-4">{r.restroomsWaterReady ? '✅' : '❌'}</td>
                          <td className="p-4">{r.scrubbingWaterReady ? '✅' : '❌'}</td>
                          <td className="p-4">{r.theatreActivitiesWaterReady ? '✅' : '❌'}</td>
                          <td className="p-4">
                            {r.isLate ? (
                              <span className="px-2 py-1 rounded text-xs font-bold bg-red-600 text-white">⚠️ LATE — QUERY</span>
                            ) : (
                              <span className="px-2 py-1 rounded text-xs font-semibold bg-green-100 text-green-700">On time</span>
                            )}
                          </td>
                          <td className="p-4">{r.loggedBy?.fullName || r.loggedByName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ===== PLUMBING FAULTS TAB ===== */}
          {activeTab === 'faults' && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="flex gap-4 bg-white rounded-xl shadow-sm border p-4">
                <select value={faultStatusFilter} onChange={e => setFaultStatusFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
                  <option value="">All Statuses</option>
                  <option value="REPORTED">Reported</option>
                  <option value="ACKNOWLEDGED">Acknowledged</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="RESOLVED">Resolved</option>
                </select>
                <select value={faultPriorityFilter} onChange={e => setFaultPriorityFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
                  <option value="">All Priorities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>

              {filteredFaults.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-xl shadow-sm border">
                  <Wrench className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-500">No Plumbing Faults</h3>
                  <p className="text-gray-400">Reported plumbing and water faults will appear here</p>
                </div>
              ) : (
                filteredFaults.map(fault => (
                  <div
                    key={fault.id}
                    className={`bg-white rounded-xl shadow-sm border-2 p-6 ${
                      fault.priority === 'CRITICAL' ? 'border-red-400' :
                      fault.priority === 'HIGH' ? 'border-orange-400' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${PRIORITY_COLORS[fault.priority]}`}>
                          {fault.priority}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${FAULT_STATUS_COLORS[fault.status] || 'bg-gray-100'}`}>
                          {fault.status.replace(/_/g, ' ')}
                        </span>
                        {fault.affectsTheatreOps && (
                          <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold animate-pulse">
                            ⚠️ AFFECTS THEATRE OPS
                          </span>
                        )}
                        {fault.isEscalated && (
                          <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">
                            📢 ESCALATED
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-gray-500">
                        {new Date(fault.reportedAt).toLocaleString()}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-gray-900">{fault.title}</h3>
                    <p className="text-gray-600 mt-1">{fault.description}</p>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 p-3 bg-gray-50 rounded-lg text-sm">
                      <div><span className="text-gray-500">Category:</span> {fault.category.replace(/_/g, ' ')}</div>
                      <div><span className="text-gray-500">Location:</span> {fault.location}</div>
                      <div><span className="text-gray-500">Reported By:</span> {fault.reportedBy.fullName}</div>
                      <div><span className="text-gray-500">Assigned To:</span> {fault.assignedTo?.fullName || 'Unassigned'}</div>
                    </div>

                    {fault.resolutionNotes && (
                      <div className="mt-3 p-3 bg-green-50 rounded-lg text-sm">
                        <span className="font-semibold text-green-800">Resolution:</span> {fault.resolutionNotes}
                        {fault.resolvedBy && <span className="text-green-600 ml-2">— {fault.resolvedBy.fullName}</span>}
                      </div>
                    )}

                    {/* Action log — chronological record of actions taken by plumbers */}
                    {fault.notes && (
                      <div className="mt-3 p-3 bg-blue-50 rounded-lg text-sm">
                        <p className="font-semibold text-blue-800 mb-1">Action Log</p>
                        <ul className="space-y-1 text-gray-700">
                          {fault.notes.split('\n').filter(Boolean).map((line, i) => (
                            <li key={i} className="border-l-2 border-blue-300 pl-2">{line}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 mt-4">
                      {fault.status === 'REPORTED' && (isPlumber || isManager) && (
                        <button
                          onClick={() => handleFaultAction(fault.id, 'ACKNOWLEDGE')}
                          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" /> Acknowledge
                        </button>
                      )}
                      {/* Plumber claims an unassigned fault to take ownership */}
                      {fault.status !== 'RESOLVED' && fault.status !== 'CLOSED' && !fault.assignedTo && isPlumber && (
                        <button
                          onClick={() => handleFaultAction(fault.id, 'CLAIM')}
                          className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 flex items-center gap-1"
                        >
                          <Wrench className="w-3 h-3" /> Claim &amp; Start
                        </button>
                      )}
                      {(fault.status === 'REPORTED' || fault.status === 'ACKNOWLEDGED') && isManager && (
                        <div className="flex items-center gap-2">
                          <select
                            onChange={e => {
                              if (e.target.value) handleFaultAction(fault.id, 'ASSIGN', { assignedToId: e.target.value });
                            }}
                            className="px-2 py-1.5 border rounded-lg text-sm"
                            defaultValue=""
                            aria-label="Assign plumber"
                          >
                            <option value="" disabled>Assign to...</option>
                            {plumbers.map(p => (
                              <option key={p.id} value={p.id}>{p.fullName}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {fault.status === 'ACKNOWLEDGED' && isPlumber && (
                        <button
                          onClick={() => handleFaultAction(fault.id, 'START_WORK')}
                          className="px-3 py-1.5 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700 flex items-center gap-1"
                        >
                          <Play className="w-3 h-3" /> Start Work
                        </button>
                      )}
                      {/* Plumbers log the action they have taken at any open stage */}
                      {fault.status !== 'RESOLVED' && fault.status !== 'CLOSED' && (isPlumber || isManager) && (
                        <button
                          onClick={() => { setShowActionForm(fault.id); setActionText(''); }}
                          className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-1"
                        >
                          <ClipboardList className="w-3 h-3" /> Log Action Taken
                        </button>
                      )}
                      {/* Plumbers/managers can directly update the fault status */}
                      {fault.status !== 'CLOSED' && (isPlumber || isManager) && (
                        <select
                          value={fault.status}
                          onChange={e => {
                            const next = e.target.value;
                            if (next === fault.status) return;
                            if (next === 'RESOLVED') { setShowResolveForm(fault.id); return; }
                            handleFaultAction(fault.id, 'UPDATE_STATUS', { status: next });
                          }}
                          className="px-2 py-1.5 border rounded-lg text-sm"
                          aria-label="Update fault status"
                        >
                          <option value="REPORTED">Reported</option>
                          <option value="ACKNOWLEDGED">Acknowledged</option>
                          <option value="ASSIGNED">Assigned</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="PARTS_ORDERED">Parts Ordered</option>
                          <option value="RESOLVED">Resolved</option>
                          <option value="CLOSED">Closed</option>
                        </select>
                      )}
                      {fault.status === 'IN_PROGRESS' && isPlumber && (
                        <button
                          onClick={() => setShowResolveForm(fault.id)}
                          className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 flex items-center gap-1"
                        >
                          <CheckCircle className="w-3 h-3" /> Mark Resolved
                        </button>
                      )}
                      {fault.status !== 'RESOLVED' && !fault.isEscalated && (isPlumber || isManager) && (
                        <button
                          onClick={() => handleFaultAction(fault.id, 'ESCALATE')}
                          className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700"
                        >
                          📢 Escalate
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ===== STATUS HISTORY TAB ===== */}
          {activeTab === 'log' && (
            <div className="space-y-4">
              {waterStatuses.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-xl shadow-sm border">
                  <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-500">No Status History</h3>
                  <p className="text-gray-400">Water status logs will appear here</p>
                </div>
              ) : (
                <div className="overflow-x-auto bg-white rounded-xl shadow-sm border">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left p-4 font-semibold">Date/Time</th>
                        <th className="text-left p-4 font-semibold">Shift</th>
                        <th className="text-left p-4 font-semibold">Overall</th>
                        <th className="text-left p-4 font-semibold">Municipal</th>
                        <th className="text-left p-4 font-semibold">Borehole</th>
                        <th className="text-left p-4 font-semibold">OH Tank</th>
                        <th className="text-left p-4 font-semibold">GND Tank</th>
                        <th className="text-left p-4 font-semibold">Pressure</th>
                        <th className="text-left p-4 font-semibold">Theatres &amp; areas</th>
                        <th className="text-left p-4 font-semibold">Logged By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {waterStatuses.map(ws => (
                        <tr key={ws.id} className="border-t hover:bg-gray-50">
                          <td className="p-4">{new Date(ws.statusDate).toLocaleString()}</td>
                          <td className="p-4">{ws.shiftType}</td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                              ws.overallStatus === 'OPERATIONAL' ? 'bg-green-100 text-green-800' :
                              ws.overallStatus === 'DEGRADED' ? 'bg-yellow-100 text-yellow-800' :
                              ws.overallStatus === 'CRITICAL' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {ws.overallStatus}
                            </span>
                          </td>
                          <td className="p-4">{ws.municipalWaterAvailable ? '✅' : '❌'}</td>
                          <td className="p-4">{ws.boreholeOperational ? '✅' : '❌'}</td>
                          <td className="p-4">
                            <span className={ws.overheadTankLevel < 20 ? 'text-red-600 font-bold' : ''}>
                              {ws.overheadTankLevel}%
                            </span>
                          </td>
                          <td className="p-4">
                            <span className={ws.groundTankLevel < 20 ? 'text-red-600 font-bold' : ''}>
                              {ws.groundTankLevel}%
                            </span>
                          </td>
                          <td className="p-4">{ws.mainLinePressure}</td>
                          {/* Named, not counted. "3 areas affected" sends a
                              theatre manager to open the record; "Eye Theatre
                              (No water)" tells them whether a list can run. */}
                          <td className="p-4">
                            {(() => {
                              const areas = readWaterAreas(ws);
                              const bad = areas.filter(a => a.status !== 'OK');
                              return (
                                <span className={bad.length > 0 ? 'text-red-700 font-semibold' : 'text-gray-600'}>
                                  {summariseAreas(areas, 2)}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="p-4">{ws.loggedBy.fullName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ===== REPORT FAULT MODAL ===== */}
      {showFaultForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                <AlertTriangle className="w-7 h-7 text-red-600" />
                Report Plumbing Fault
              </h2>
              <button onClick={() => setShowFaultForm(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleReportFault} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Fault Title *</label>
                  <input
                    type="text" required
                    value={faultData.title}
                    onChange={e => setFaultData(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="e.g., Leaking pipe in Theatre 2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Category *</label>
                  <select
                    value={faultData.category}
                    onChange={e => setFaultData(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    {FAULT_CATEGORIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Description *</label>
                <textarea
                  required
                  value={faultData.description}
                  onChange={e => setFaultData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={3}
                  placeholder="Describe the fault in detail..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Location *</label>
                  <select
                    value={faultData.location}
                    onChange={e => setFaultData(prev => ({ ...prev, location: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">Select location...</option>
                    {faultLocations(theatres).map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Priority *</label>
                  <select
                    value={faultData.priority}
                    onChange={e => setFaultData(prev => ({ ...prev, priority: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="CRITICAL">🚨 CRITICAL</option>
                    <option value="HIGH">⚠️ HIGH</option>
                    <option value="MEDIUM">📋 MEDIUM</option>
                    <option value="LOW">ℹ️ LOW</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Building</label>
                  <input
                    type="text"
                    value={faultData.building}
                    onChange={e => setFaultData(prev => ({ ...prev, building: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={faultData.affectsTheatreOps}
                    onChange={e => setFaultData(prev => ({ ...prev, affectsTheatreOps: e.target.checked }))}
                    className="w-4 h-4 text-red-600"
                  />
                  <span className="text-sm font-medium text-red-700">⚠️ Affects Theatre Operations</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Notes</label>
                <textarea
                  value={faultData.notes}
                  onChange={e => setFaultData(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={2}
                />
              </div>

              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowFaultForm(false)} className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300">
                  Cancel
                </button>
                <button type="submit" className="px-6 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 flex items-center gap-2 font-semibold">
                  <Send className="w-5 h-5" /> Report Fault
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== LOG WATER STATUS MODAL ===== */}
      {showStatusForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                <Droplet className="w-7 h-7 text-blue-600" />
                Log Water Supply Status
              </h2>
              <button onClick={() => setShowStatusForm(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleLogStatus} className="space-y-6">
              {/* Shift */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Shift *</label>
                <select
                  value={statusData.shiftType}
                  onChange={e => setStatusData(prev => ({ ...prev, shiftType: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="MORNING">Morning (7am - 2pm)</option>
                  <option value="AFTERNOON">Afternoon (2pm - 10pm)</option>
                  <option value="NIGHT">Night (10pm - 7am)</option>
                </select>
              </div>

              {/* Main supply */}
              <div className="p-4 bg-blue-50 rounded-xl">
                <h4 className="font-semibold text-blue-800 mb-3">Main Water Supply</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <ToggleField label="Municipal Water" checked={statusData.municipalWaterAvailable} onChange={v => setStatusData(p => ({ ...p, municipalWaterAvailable: v }))} />
                  <ToggleField label="Borehole" checked={statusData.boreholeOperational} onChange={v => setStatusData(p => ({ ...p, boreholeOperational: v }))} />
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Main Line Pressure</label>
                    <select value={statusData.mainLinePressure} onChange={e => setStatusData(p => ({ ...p, mainLinePressure: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm">
                      <option value="LOW">Low</option>
                      <option value="NORMAL">Normal</option>
                      <option value="HIGH">High</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Theatre Line Pressure</label>
                    <select value={statusData.theatreLinePressure} onChange={e => setStatusData(p => ({ ...p, theatreLinePressure: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm">
                      <option value="LOW">Low</option>
                      <option value="NORMAL">Normal</option>
                      <option value="HIGH">High</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Tanks */}
              <div className="p-4 bg-cyan-50 rounded-xl">
                <h4 className="font-semibold text-cyan-800 mb-3">Tank Levels</h4>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Overhead Tank: {statusData.overheadTankLevel}%
                    </label>
                    <input type="range" min="0" max="100" value={statusData.overheadTankLevel}
                      onChange={e => setStatusData(p => ({ ...p, overheadTankLevel: parseInt(e.target.value) }))}
                      className="w-full" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ground Tank: {statusData.groundTankLevel}%
                    </label>
                    <input type="range" min="0" max="100" value={statusData.groundTankLevel}
                      onChange={e => setStatusData(p => ({ ...p, groundTankLevel: parseInt(e.target.value) }))}
                      className="w-full" />
                  </div>
                </div>
              </div>

              {/* Pumps */}
              <div className="p-4 bg-green-50 rounded-xl">
                <h4 className="font-semibold text-green-800 mb-3">Pump Status</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <ToggleField label="Main Pump" checked={statusData.mainPumpOperational} onChange={v => setStatusData(p => ({ ...p, mainPumpOperational: v }))} />
                  <ToggleField label="Backup Pump" checked={statusData.backupPumpOperational} onChange={v => setStatusData(p => ({ ...p, backupPumpOperational: v }))} />
                  <ToggleField label="Booster Pump" checked={statusData.boosterPumpOperational} onChange={v => setStatusData(p => ({ ...p, boosterPumpOperational: v }))} />
                </div>
              </div>

              {/* Hot water */}
              <div className="p-4 bg-orange-50 rounded-xl">
                <h4 className="font-semibold text-orange-800 mb-3">Hot Water System</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <ToggleField label="Hot Water Available" checked={statusData.hotWaterAvailable} onChange={v => setStatusData(p => ({ ...p, hotWaterAvailable: v }))} />
                  <ToggleField label="Boiler Operational" checked={statusData.boilerOperational} onChange={v => setStatusData(p => ({ ...p, boilerOperational: v }))} />
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Temperature (°C)</label>
                    <input type="text" value={statusData.hotWaterTemperature}
                      onChange={e => setStatusData(p => ({ ...p, hotWaterTemperature: e.target.value }))}
                      className="w-full px-2 py-1.5 border rounded text-sm" placeholder="e.g., 60" />
                  </div>
                </div>
              </div>

              {/* Theatre-level status, every room in the database */}
              <div className="p-4 bg-purple-50 rounded-xl">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h4 className="font-semibold text-purple-800">Theatre Water Status</h4>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-purple-700">
                      {statusAreas.length} area{statusAreas.length === 1 ? '' : 's'}
                    </span>
                    {/* Sixteen dropdowns is a lot to leave at OK one at a time
                        on a morning when nothing is wrong, and a form that is
                        tedious to fill in honestly gets filled in carelessly. */}
                    <button
                      type="button"
                      onClick={() => setStatusAreas(prev => prev.map(a => ({ ...a, status: 'OK' })))}
                      className="text-xs px-2 py-1 rounded border border-purple-300 text-purple-800 hover:bg-purple-100"
                    >
                      Mark all OK
                    </button>
                  </div>
                </div>

                {statusAreas.length === 0 ? (
                  <p className="text-sm text-purple-900">Loading the theatre list…</p>
                ) : (
                  groupAreasByLocation(statusAreas).map(group => (
                    <div key={group.location} className="mb-4 last:mb-0">
                      <p className="text-xs font-bold uppercase tracking-wide text-purple-700 mb-2">
                        {group.location}
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {group.areas.map(area => (
                          <div key={area.key}>
                            <label className="block text-xs text-gray-600 mb-1">{area.name}</label>
                            <select
                              value={area.status}
                              onChange={e => setStatusAreas(prev => prev.map(a => {
                                if (a.key !== area.key) return a;
                                // Back to OK drops the description with it. A
                                // room marked fixed that still carries "the
                                // riser valve is shut" is how a closed fault
                                // gets chased for another week.
                                return e.target.value === 'OK'
                                  ? { key: a.key, name: a.name, location: a.location, status: 'OK' }
                                  : { ...a, status: e.target.value };
                              }))}
                              className={`w-full px-2 py-1.5 border rounded text-sm ${
                                area.status === 'OK' ? '' : 'border-red-400 bg-red-50'
                              }`}
                            >
                              <option value="OK">✅ OK</option>
                              <option value="LOW_PRESSURE">⚠️ Low Pressure</option>
                              <option value="NO_WATER">🚫 No Water</option>
                              <option value="LEAK">💧 Leak</option>
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* What is wrong, what has been done, and what we do meanwhile.
                  Appears only when something is not OK, and then it is
                  compulsory: a fault with no description is a summons with
                  no information in it, and the head of works arrives at a
                  theatre with the wrong tools. */}
              {statusAreasNotOk.length > 0 && (
                <div className="p-4 bg-red-50 border-2 border-red-200 rounded-xl space-y-4">
                  <div>
                    <h4 className="font-semibold text-red-800">
                      {statusAreasNotOk.length} area{statusAreasNotOk.length === 1 ? ' is' : 's are'} not OK
                    </h4>
                    <p className="text-xs text-red-700 mt-1">
                      This raises a WhatsApp chase to the Head of Water Supply and the Head of
                      Works, and opens a fault that stays open until somebody goes back, looks
                      again and logs it as OK.
                    </p>
                  </div>

                  {statusAreasNotOk.map(area => (
                    <div key={area.key} className="bg-white border border-red-200 rounded-lg p-3">
                      <p className="text-sm font-bold text-gray-800">
                        {area.name}{area.location ? ` — ${area.location}` : ''}
                        <span className="ml-2 text-red-700">
                          {AREA_STATUS_LABEL[area.status] || area.status}
                        </span>
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            What is the problem? *
                          </label>
                          <textarea
                            value={area.problem ?? ''}
                            onChange={e => setStatusAreas(prev => prev.map(a => (
                              a.key === area.key ? { ...a, problem: e.target.value } : a
                            )))}
                            className="w-full px-2 py-1.5 border rounded text-sm"
                            rows={2}
                            placeholder="e.g. the riser valve on the second floor is shut and the key is missing"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Action taken so far *
                          </label>
                          <textarea
                            value={area.actionTaken ?? ''}
                            onChange={e => setStatusAreas(prev => prev.map(a => (
                              a.key === area.key ? { ...a, actionTaken: e.target.value } : a
                            )))}
                            className="w-full px-2 py-1.5 border rounded text-sm"
                            rows={2}
                            placeholder="e.g. called the works office, borehole switched to this line"
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  <div>
                    <label className="block text-sm font-semibold text-red-800 mb-1">
                      Plan B for water today *
                    </label>
                    <textarea
                      value={statusData.contingencyPlan}
                      onChange={e => setStatusData(p => ({ ...p, contingencyPlan: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg"
                      rows={2}
                      placeholder="How do the theatres get water until this is fixed? e.g. 2,000L tanker at 10am, scrub water drawn from Suite 1, CSSD moved to A&E"
                    />
                    <p className="text-xs text-red-700 mt-1">
                      The theatres will ask whether today&apos;s list can run. This is the answer
                      they get, and it goes out with the chase.
                    </p>
                  </div>
                </div>
              )}

              {/* Drainage */}
              <div className="p-4 bg-gray-50 rounded-xl">
                <h4 className="font-semibold text-gray-800 mb-3">Drainage</h4>
                <div className="grid grid-cols-2 gap-4">
                  <ToggleField label="Drainage Flowing" checked={statusData.drainageFlowing} onChange={v => setStatusData(p => ({ ...p, drainageFlowing: v }))} />
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Drainage Issues</label>
                    <input type="text" value={statusData.drainageIssues}
                      onChange={e => setStatusData(p => ({ ...p, drainageIssues: e.target.value }))}
                      className="w-full px-2 py-1.5 border rounded text-sm" />
                  </div>
                </div>
              </div>

              {/* Overall */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Overall Status *</label>
                  <select
                    value={statusData.overallStatus}
                    onChange={e => setStatusData(p => ({ ...p, overallStatus: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="OPERATIONAL">✅ OPERATIONAL</option>
                    <option value="DEGRADED">⚠️ DEGRADED</option>
                    <option value="CRITICAL">🚨 CRITICAL</option>
                    <option value="OFFLINE">❌ OFFLINE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Action Required</label>
                  <input type="text" value={statusData.actionRequired}
                    onChange={e => setStatusData(p => ({ ...p, actionRequired: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg" placeholder="Any immediate action needed?" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Notes</label>
                <textarea value={statusData.notes}
                  onChange={e => setStatusData(p => ({ ...p, notes: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg" rows={2} />
              </div>

              {/* Said plainly, before the button and not after it. Staff
                  are entitled to know that filing this records where they
                  were standing. */}
              <p className="text-xs text-gray-500 flex items-start gap-2">
                <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                Your location is recorded with this report, so a round that was
                walked can be shown to have been walked. It is never a condition of
                filing: if the handset gives no position, the reason is recorded instead
                and the report is saved exactly the same.
              </p>

              {statusMissing.length > 0 && (
                <ul className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
                  {statusMissing.map(m => <li key={m}>• {m}</li>)}
                </ul>
              )}

              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowStatusForm(false)} className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || statusMissing.length > 0}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center gap-2 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-5 h-5" />
                  {submitting ? 'Taking your location…' : 'Log Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== DAILY WATER READINESS MODAL ===== */}
      {showReadinessForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-8">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                <CheckCircle className="w-7 h-7 text-emerald-600" />
                Log Daily Water-Supply Readiness
              </h2>
              <button onClick={() => setShowReadinessForm(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              Confirm that water supply is assured for the next day&apos;s surgery. Must be logged before 5 PM daily —
              late logs raise a disciplinary query.
            </p>

            <form onSubmit={handleLogReadiness} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">For Surgery Day</label>
                  <input
                    type="date"
                    aria-label="For surgery day"
                    value={readinessData.forDate}
                    onChange={e => setReadinessData(prev => ({ ...prev, forDate: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                  <p className="text-xs text-gray-400 mt-1">Defaults to tomorrow when left blank.</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Overall Readiness *</label>
                  <select
                    aria-label="Overall readiness"
                    value={readinessData.overallReadiness}
                    onChange={e => setReadinessData(prev => ({ ...prev, overallReadiness: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="READY">✅ READY — no shortage expected</option>
                    <option value="AT_RISK">⚠️ AT RISK — possible shortage</option>
                    <option value="NOT_READY">🚫 NOT READY — shortage expected</option>
                  </select>
                </div>
              </div>

              {/* Tank levels */}
              <div className="p-4 bg-cyan-50 rounded-xl grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Overhead Tank: {readinessData.overheadTankLevel}%
                  </label>
                  <input type="range" min="0" max="100" aria-label="Overhead tank level"
                    value={readinessData.overheadTankLevel}
                    onChange={e => setReadinessData(p => ({ ...p, overheadTankLevel: parseInt(e.target.value) }))}
                    className="w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ground Tank: {readinessData.groundTankLevel}%
                  </label>
                  <input type="range" min="0" max="100" aria-label="Ground tank level"
                    value={readinessData.groundTankLevel}
                    onChange={e => setReadinessData(p => ({ ...p, groundTankLevel: parseInt(e.target.value) }))}
                    className="w-full" />
                </div>
              </div>

              {/* Readiness confirmations */}
              <div className="p-4 bg-emerald-50 rounded-xl">
                <h4 className="font-semibold text-emerald-800 mb-3">Water Availability Confirmation (Next Day)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ToggleField label="Toilets & all rest rooms" checked={readinessData.restroomsWaterReady} onChange={v => setReadinessData(p => ({ ...p, restroomsWaterReady: v }))} />
                  <ToggleField label="Surgical scrubbing during surgery" checked={readinessData.scrubbingWaterReady} onChange={v => setReadinessData(p => ({ ...p, scrubbingWaterReady: v }))} />
                  <ToggleField label="All theatre activities" checked={readinessData.theatreActivitiesWaterReady} onChange={v => setReadinessData(p => ({ ...p, theatreActivitiesWaterReady: v }))} />
                  <ToggleField label="No water shortage confirmed" checked={readinessData.noShortageConfirmed} onChange={v => setReadinessData(p => ({ ...p, noShortageConfirmed: v }))} />
                </div>
              </div>

              {/* Appears the moment a promise cannot be given, or the
                  overall verdict is anything but READY. The same three
                  questions the shift report asks, for the same reason. */}
              {readinessNotOk.length > 0 && (
                <div className="p-4 bg-red-50 border-2 border-red-200 rounded-xl space-y-4">
                  <div>
                    <h4 className="font-semibold text-red-800">
                      Water for the next surgery day is not assured
                    </h4>
                    <p className="text-xs text-red-700 mt-1">
                      Not assured: {readinessNotOk.map(a => a.name).join(', ')}. Filing this
                      raises a WhatsApp chase to the Head of Water Supply and the Head of Works,
                      and opens a fault that stays open until somebody re-assesses it.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-red-800 mb-1">
                      What is the problem? *
                    </label>
                    <textarea
                      value={readinessData.riskDetails}
                      onChange={e => setReadinessData(prev => ({ ...prev, riskDetails: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg"
                      rows={2}
                      placeholder="e.g. the borehole pump is down and the overhead tank will not last the morning list"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-red-800 mb-1">
                      Action taken so far *
                    </label>
                    <textarea
                      value={readinessData.actionTaken}
                      onChange={e => setReadinessData(prev => ({ ...prev, actionTaken: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg"
                      rows={2}
                      placeholder="e.g. tanker ordered for 6am, works office informed, pump taken for repair"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-red-800 mb-1">
                      Plan B for water that day *
                    </label>
                    <textarea
                      value={readinessData.contingencyPlan}
                      onChange={e => setReadinessData(prev => ({ ...prev, contingencyPlan: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg"
                      rows={2}
                      placeholder="How do the theatres get water that day? e.g. 2 tankers from 05:30, scrub water stored overnight in Suite 1, CSSD run at A&E"
                    />
                    <p className="text-xs text-red-700 mt-1">
                      The theatre manager will ask whether tomorrow&apos;s list can run. This is
                      the answer, and it goes out with the chase.
                    </p>
                  </div>
                </div>
              )}

              {readinessNotOk.length === 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Notes on the supply (optional)</label>
                    <textarea
                      value={readinessData.riskDetails}
                      onChange={e => setReadinessData(prev => ({ ...prev, riskDetails: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg"
                      rows={2}
                      placeholder="Anything worth recording even though water is assured..."
                    />
                  </div>
                  {/* Kept on a good day too. Running the pumps and filling
                      the tanks is why tomorrow is assured, and a supervisor
                      who did it should be able to say so. */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Action taken (optional)</label>
                    <textarea
                      value={readinessData.actionTaken}
                      onChange={e => setReadinessData(prev => ({ ...prev, actionTaken: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg"
                      rows={2}
                      placeholder="e.g. tanks topped up overnight, booster pump serviced"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Notes</label>
                <textarea
                  value={readinessData.notes}
                  onChange={e => setReadinessData(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={2}
                />
              </div>

              <p className="text-xs text-gray-500 flex items-start gap-2">
                <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                Your location is recorded with this report. If the handset gives no
                position, the reason is recorded instead and the report is saved exactly
                the same.
              </p>

              {readinessMissing.length > 0 && (
                <ul className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
                  {readinessMissing
                    .map(m => m
                      .replace(/^Say what is wrong in .*$/, 'Say what the problem is.')
                      .replace(/^Say what has been done about .*$/, 'Say what has been done about it so far.'))
                    .filter((m, i, all) => all.indexOf(m) === i)
                    .map(m => <li key={m}>• {m}</li>)}
                </ul>
              )}

              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowReadinessForm(false)} className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || readinessMissing.length > 0}
                  className="px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 flex items-center gap-2 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-5 h-5" />
                  {submitting ? 'Taking your location…' : 'Submit Readiness'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== RESOLVE FAULT MODAL ===== */}
      {showResolveForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <CheckCircle className="w-6 h-6 text-green-600" />
              Resolve Plumbing Fault
            </h2>
            <form
              onSubmit={e => {
                e.preventDefault();
                handleFaultAction(showResolveForm, 'RESOLVE', resolveData);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Resolution Notes *</label>
                <textarea
                  required
                  value={resolveData.resolutionNotes}
                  onChange={e => setResolveData(prev => ({ ...prev, resolutionNotes: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={3}
                  placeholder="Describe what was done to fix the issue..."
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Parts Used</label>
                <input
                  type="text"
                  value={resolveData.partsUsed}
                  onChange={e => setResolveData(prev => ({ ...prev, partsUsed: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="e.g., 2x PVC elbow joints, 1x gate valve"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Actual Cost (₦)</label>
                <input
                  type="number"
                  value={resolveData.actualCost}
                  onChange={e => setResolveData(prev => ({ ...prev, actualCost: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Cost of repair"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowResolveForm(null)} className="px-4 py-2 bg-gray-200 rounded-lg">
                  Cancel
                </button>
                <button type="submit" className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold">
                  Confirm Resolution
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== LOG ACTION TAKEN MODAL ===== */}
      {showActionForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-indigo-600" />
              Log Action Taken
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Record the work you have done on this fault. Each entry is added to the
              fault&apos;s action log with your name and the time. Logging an action moves
              the fault to <span className="font-semibold">In Progress</span>.
            </p>
            <form onSubmit={handleLogAction} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Action Taken *</label>
                <textarea
                  required
                  value={actionText}
                  onChange={e => setActionText(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={4}
                  placeholder="e.g., Isolated the supply line, replaced the leaking gate valve, awaiting replacement washer..."
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => { setShowActionForm(null); setActionText(''); }} className="px-4 py-2 bg-gray-200 rounded-lg">
                  Cancel
                </button>
                <button type="submit" className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold flex items-center gap-2">
                  <ClipboardList className="w-4 h-4" /> Save Action
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== WHAT THE REPORT JUST DID =====
          Shown straight after a submission, because this is the only moment
          the person is still holding their phone with the theatre in front
          of them. The queue is not a delivery -- a queued WhatsApp row waits
          on a provider the theatre server does not have -- so the buttons
          here are what actually reaches the two men who have to fix it. */}
      {chase && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-8">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                {chase.handoffs.length > 0 || chase.opened.length > 0 ? (
                  <><AlertTriangle className="w-6 h-6 text-red-600" /> Chase the water fault</>
                ) : (
                  <><CheckCircle className="w-6 h-6 text-green-600" /> Report filed</>
                )}
              </h2>
              <button
                onClick={() => setChase(null)}
                aria-label="Close"
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {chase.closed.length > 0 && (
              <div className="mb-4 text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="font-semibold">
                  {chase.closed.length} fault{chase.closed.length === 1 ? '' : 's'} closed by this
                  re-assessment:
                </p>
                <ul className="mt-1 space-y-0.5">
                  {chase.closed.map(c => (
                    <li key={c.areaKey}>
                      • {c.areaName} — was open {openForLabel(c.openedAt)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {chase.opened.length > 0 && (
              <div className="mb-4 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="font-semibold">
                  {chase.opened.length} fault{chase.opened.length === 1 ? '' : 's'} opened:
                </p>
                <ul className="mt-1 space-y-0.5">
                  {chase.opened.map(o => (
                    <li key={o.areaKey}>
                      • {o.areaName} — {AREA_STATUS_LABEL[o.status] || o.status}
                    </li>
                  ))}
                </ul>
                <p className="mt-2">
                  {chase.opened.length === 1 ? 'It stays' : 'They stay'} open until somebody goes
                  back, looks again and logs the area as OK.
                </p>
              </div>
            )}

            {chase.handoffs.length > 0 && (
              <>
                <p className="text-sm text-gray-700 mb-3">
                  Press each one and send. The message is already written — what is wrong,
                  what has been done, and the plan B for water today.
                </p>
                <div className="space-y-2">
                  {chase.handoffs.map(h => {
                    const href = whatsappLink(h.number, h.text);
                    return href ? (
                      <a
                        key={`${h.number}-${h.kind}`}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 font-semibold"
                      >
                        <MessageCircle className="w-5 h-5" />
                        <span className="flex-1">
                          Send to {h.name}
                          <span className="block text-xs font-normal opacity-90">{h.kind}</span>
                        </span>
                      </a>
                    ) : null;
                  })}
                </div>
              </>
            )}

            {chase.whatsappSkipped.length > 0 && (
              <ul className="mt-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                {chase.whatsappSkipped.map(m => <li key={m}>• {m}</li>)}
              </ul>
            )}

            {chase.handoffs.length === 0 && chase.opened.length === 0
              && chase.closed.length === 0 && (
              <p className="text-sm text-gray-700">
                Everything was reported OK. Nothing was chased.
              </p>
            )}

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setChase(null)}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== SUB-COMPONENTS =====

function StatusCard({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className={`p-3 rounded-lg border ${ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-sm font-bold mt-1 ${ok ? 'text-green-700' : 'text-red-700'}`}>
        {ok ? '✅' : '❌'} {value}
      </p>
    </div>
  );
}

function TankGauge({ label, level }: { label: string; level: number }) {
  const color = level > 60 ? 'bg-green-500' : level > 30 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="text-center">
      <p className="font-semibold text-gray-800 mb-2">{label}</p>
      <div className="w-24 h-32 mx-auto bg-gray-200 rounded-lg overflow-hidden relative border-2 border-gray-300">
        <div
          className={`absolute bottom-0 w-full ${color} transition-all duration-500`}
          style={{ height: `${level}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-white drop-shadow-lg">{level}%</span>
        </div>
      </div>
      <p className={`mt-2 text-sm font-medium ${level < 20 ? 'text-red-600' : level < 40 ? 'text-yellow-600' : 'text-green-600'}`}>
        {level < 20 ? '⚠️ LOW' : level < 40 ? '⚡ MODERATE' : '✅ GOOD'}
      </p>
    </div>
  );
}

function PumpStatus({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
      <div className={`w-3 h-3 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'} ${!ok ? 'animate-pulse' : ''}`} />
      <span className="text-sm font-medium">{label}</span>
      <span className={`ml-auto text-sm font-bold ${ok ? 'text-green-700' : 'text-red-700'}`}>
        {ok ? 'RUNNING' : 'DOWN'}
      </span>
    </div>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition-colors ${checked ? 'bg-green-500' : 'bg-red-400'}`}
      >
        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4.5 left-0.5' : 'left-0.5'}`}
          style={{ transform: checked ? 'translateX(18px)' : 'translateX(0)' }}
        />
      </div>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </label>
  );
}
