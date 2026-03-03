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
} from 'lucide-react';

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
  loggedBy: { fullName: string; role: string };
  loggedByName: string;
  actionRequired: string | null;
  actionTaken: string | null;
  notes: string | null;
}

interface Stats {
  totalFaults: number;
  openFaults: number;
  criticalFaults: number;
  resolvedToday: number;
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

const THEATRE_LOCATIONS = [
  'Theatre 1', 'Theatre 2', 'Theatre 3', 'Theatre 4',
  'Scrub Area', 'Recovery Area (PACU)', 'Sterilization Area (CSSD)',
  'Holding Area', 'Storage Room', 'Corridor', 'Restroom', 'Staff Room', 'Other',
];

// ===== COMPONENT =====

export default function PlumbingWaterSupplyPage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<'status' | 'faults' | 'log'>('status');
  const [faults, setFaults] = useState<PlumbingFault[]>([]);
  const [waterStatuses, setWaterStatuses] = useState<WaterStatus[]>([]);
  const [latestStatus, setLatestStatus] = useState<WaterStatus | null>(null);
  const [stats, setStats] = useState<Stats>({ totalFaults: 0, openFaults: 0, criticalFaults: 0, resolvedToday: 0 });
  const [loading, setLoading] = useState(true);

  // Modals
  const [showFaultForm, setShowFaultForm] = useState(false);
  const [showStatusForm, setShowStatusForm] = useState(false);
  const [showResolveForm, setShowResolveForm] = useState<string | null>(null);

  // Filters
  const [faultStatusFilter, setFaultStatusFilter] = useState('');
  const [faultPriorityFilter, setFaultPriorityFilter] = useState('');

  // New fault form
  const [faultData, setFaultData] = useState({
    title: '', description: '', category: 'LEAKING_PIPE', priority: 'MEDIUM',
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
    theatre1Status: 'OK', theatre2Status: 'OK', theatre3Status: 'OK', theatre4Status: 'OK',
    scrubAreaStatus: 'OK', recoveryAreaStatus: 'OK', sterilizationAreaStatus: 'OK',
    drainageFlowing: true, drainageIssues: '',
    overallStatus: 'OPERATIONAL', actionRequired: '', actionTaken: '', notes: '',
  });

  // Resolve form
  const [resolveData, setResolveData] = useState({
    resolutionNotes: '', partsUsed: '', actualCost: '',
  });

  // Plumber list for assignment
  const [plumbers, setPlumbers] = useState<{ id: string; fullName: string }[]>([]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/plumbing-water-supply?type=all');
      if (res.ok) {
        const data = await res.json();
        setWaterStatuses(data.waterStatuses || []);
        setLatestStatus(data.latestStatus || null);
        setFaults(data.faults || []);
        setStats(data.stats || { totalFaults: 0, openFaults: 0, criticalFaults: 0, resolvedToday: 0 });
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

  useEffect(() => {
    fetchData();
    fetchPlumbers();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData, fetchPlumbers]);

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
      }
    } catch (error) {
      console.error('Error reporting fault:', error);
    }
  };

  const handleLogStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/plumbing-water-supply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(statusData),
      });
      if (res.ok) {
        setShowStatusForm(false);
        fetchData();
      }
    } catch (error) {
      console.error('Error logging status:', error);
    }
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

  const isPlumber = session?.user?.role === 'PLUMBER' || session?.user?.role === 'WORKS_SUPERVISOR';
  const isManager = ['THEATRE_MANAGER', 'ADMIN', 'SYSTEM_ADMINISTRATOR', 'CHIEF_MEDICAL_DIRECTOR', 'WORKS_SUPERVISOR'].includes(session?.user?.role || '');

  const filteredFaults = faults.filter(f => {
    if (faultStatusFilter && f.status !== faultStatusFilter) return false;
    if (faultPriorityFilter && f.priority !== faultPriorityFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Droplet className="w-8 h-8 text-blue-600" />
            Plumbing & Water Supply
          </h1>
          <p className="text-gray-600 mt-1">
            Monitor water supply status, manage plumbing faults, and track maintenance
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button
            onClick={() => setShowFaultForm(true)}
            className="px-5 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 flex items-center gap-2 font-semibold shadow-lg"
          >
            <AlertTriangle className="w-5 h-5" /> Report Fault
          </button>
          {isPlumber && (
            <button
              onClick={() => setShowStatusForm(true)}
              className="px-5 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center gap-2 font-semibold shadow-lg"
            >
              <Plus className="w-5 h-5" /> Log Water Status
            </button>
          )}
        </div>
      </div>

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
        {[
          { key: 'status', label: 'Water Status', icon: Droplet },
          { key: 'faults', label: 'Plumbing Faults', icon: Wrench },
          { key: 'log', label: 'Status History', icon: Clock },
        ].map(tab => (
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
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <ShowerHead className="w-5 h-5 text-blue-600" /> Theatre Water Status
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { key: 'theatre1Status', label: 'Theatre 1' },
                        { key: 'theatre2Status', label: 'Theatre 2' },
                        { key: 'theatre3Status', label: 'Theatre 3' },
                        { key: 'theatre4Status', label: 'Theatre 4' },
                        { key: 'scrubAreaStatus', label: 'Scrub Area' },
                        { key: 'recoveryAreaStatus', label: 'Recovery Area' },
                        { key: 'sterilizationAreaStatus', label: 'Sterilization' },
                      ].map(area => {
                        const val = (latestStatus as any)[area.key] as string;
                        return (
                          <div key={area.key} className={`p-4 rounded-lg border-2 ${
                            val === 'OK' ? 'border-green-200 bg-green-50' :
                            val === 'LOW_PRESSURE' ? 'border-yellow-200 bg-yellow-50' :
                            val === 'NO_WATER' ? 'border-red-200 bg-red-50' :
                            'border-orange-200 bg-orange-50'
                          }`}>
                            <p className="text-sm font-bold text-gray-800">{area.label}</p>
                            <p className="text-lg mt-1">
                              {AREA_STATUS_EMOJI[val] || '❓'} {val.replace(/_/g, ' ')}
                            </p>
                          </div>
                        );
                      })}
                    </div>
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

                  {/* Meta Info */}
                  <div className="text-sm text-gray-500 text-right">
                    Last updated: {new Date(latestStatus.statusDate).toLocaleString()} by {latestStatus.loggedBy.fullName} ({latestStatus.shiftType} shift)
                  </div>
                </>
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
                      {(fault.status === 'REPORTED' || fault.status === 'ACKNOWLEDGED') && isManager && (
                        <div className="flex items-center gap-2">
                          <select
                            onChange={e => {
                              if (e.target.value) handleFaultAction(fault.id, 'ASSIGN', { assignedToId: e.target.value });
                            }}
                            className="px-2 py-1.5 border rounded-lg text-sm"
                            defaultValue=""
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
                    {THEATRE_LOCATIONS.map(loc => (
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
                <div className="grid grid-cols-3 gap-4">
                  <ToggleField label="Main Pump" checked={statusData.mainPumpOperational} onChange={v => setStatusData(p => ({ ...p, mainPumpOperational: v }))} />
                  <ToggleField label="Backup Pump" checked={statusData.backupPumpOperational} onChange={v => setStatusData(p => ({ ...p, backupPumpOperational: v }))} />
                  <ToggleField label="Booster Pump" checked={statusData.boosterPumpOperational} onChange={v => setStatusData(p => ({ ...p, boosterPumpOperational: v }))} />
                </div>
              </div>

              {/* Hot water */}
              <div className="p-4 bg-orange-50 rounded-xl">
                <h4 className="font-semibold text-orange-800 mb-3">Hot Water System</h4>
                <div className="grid grid-cols-3 gap-4">
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

              {/* Theatre-level status */}
              <div className="p-4 bg-purple-50 rounded-xl">
                <h4 className="font-semibold text-purple-800 mb-3">Theatre Water Status</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { key: 'theatre1Status', label: 'Theatre 1' },
                    { key: 'theatre2Status', label: 'Theatre 2' },
                    { key: 'theatre3Status', label: 'Theatre 3' },
                    { key: 'theatre4Status', label: 'Theatre 4' },
                    { key: 'scrubAreaStatus', label: 'Scrub Area' },
                    { key: 'recoveryAreaStatus', label: 'Recovery' },
                    { key: 'sterilizationAreaStatus', label: 'Sterilization' },
                  ].map(area => (
                    <div key={area.key}>
                      <label className="block text-xs text-gray-600 mb-1">{area.label}</label>
                      <select
                        value={(statusData as any)[area.key]}
                        onChange={e => setStatusData(p => ({ ...p, [area.key]: e.target.value }))}
                        className="w-full px-2 py-1.5 border rounded text-sm"
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

              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowStatusForm(false)} className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300">
                  Cancel
                </button>
                <button type="submit" className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center gap-2 font-semibold">
                  <Send className="w-5 h-5" /> Log Status
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
