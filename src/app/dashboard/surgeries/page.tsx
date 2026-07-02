'use client';

import { useEffect, useState, useCallback, Fragment } from 'react';
import { useSession } from 'next-auth/react';
import { Plus, Search, Calendar, ClipboardList, Package, AlertCircle, FileText, Activity, Calculator, Clock, Eye, RefreshCw, Wifi, WifiOff, Printer, Droplet, Zap as ZapIcon, Pencil, Pill, CheckCircle, FileSignature, Building2, X } from 'lucide-react';
import Link from 'next/link';
import { formatDate, formatCurrency } from '@/lib/utils';
import { SYNC_INTERVALS } from '@/lib/sync';
import { cacheFirstFetch } from '@/lib/offlineDataManager';
import { TableSkeleton } from '@/components/Skeleton';
import ContactName from '@/components/ContactName';

interface Surgery {
  id: string;
  patient: {
    id?: string;
    name: string;
    folderNumber: string;
    age?: number;
    gender?: string;
    ward?: string;
  };
  surgeon: {
    id?: string;
    fullName: string;
  } | null;
  surgeonName?: string | null;
  procedureName: string;
  indication?: string;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
  subspecialty: string;
  unit?: string;
  location?: string | null;
  theatreId?: string | null;
  theatreName?: string | null;
  theatre?: { id: string; name: string; location: string } | null;
  supervisingConsultantName?: string | null;
  needBloodTransfusion?: boolean;
  needDiathermy?: boolean;
  needStereo?: boolean;
  needStirups?: boolean;
  needMontrellMattress?: boolean;
  otherSpecialNeeds?: string | null;
  anesthesiaType?: string | null;
  holdingAreaAssessment?: {
    id: string;
    status: string;
    clearedForTheatre: boolean;
    transferredToTheatre: boolean;
  } | null;
}

export default function SurgeriesPage() {
  const { data: session } = useSession();
  const [surgeries, setSurgeries] = useState<Surgery[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  // Default to today's list so only the current day's cases load (lighter payload
  // for poor connections). An empty value means "all scheduled dates".
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().split('T')[0]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  // Role-based action visibility
  const userRole = session?.user?.role;
  const canAccessWHOChecklist = ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE'].includes(userRole || '');
  const canAccessAnesthesia = ['ADMIN', 'THEATRE_MANAGER', 'ANAESTHETIST'].includes(userRole || '');
  const canAccessSurgicalCount = ['ADMIN', 'THEATRE_MANAGER', 'SCRUB_NURSE'].includes(userRole || '');
  const canAccessTiming = ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE'].includes(userRole || '');
  const canAccessConsumables = ['ADMIN', 'THEATRE_MANAGER', 'SCRUB_NURSE', 'THEATRE_STORE_KEEPER', 'PROCUREMENT_OFFICER'].includes(userRole || '');
  const canAccessBOM = ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'].includes(userRole || '');
  // Consent can be completed by the surgical/anaesthetic team or theatre nurses caring for the patient.
  const canAccessConsent = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'SURGEON', 'HOUSE_OFFICER', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'ANAESTHETIC_TECHNICIAN', 'SCRUB_NURSE', 'CIRCULATING_NURSE', 'RECOVERY_ROOM_NURSE'].includes(userRole || '');
  // Surgeons (and admins / theatre managers) may close out a case so PACU can admit and the post-op note can be written.
  const canCompleteSurgery = ['SURGEON', 'ADMIN', 'THEATRE_MANAGER', 'SYSTEM_ADMINISTRATOR'].includes(userRole || '');
  // Perioperative nurses and admins can re-assign / change the theatre a booked case is allocated to.
  const canReassignTheatre = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE'].includes(userRole || '');
  const [completingId, setCompletingId] = useState<string | null>(null);
  // Quick "change theatre" modal state.
  const [theatres, setTheatres] = useState<{ id: string; name: string; location?: string }[]>([]);
  const [reassignSurgery, setReassignSurgery] = useState<Surgery | null>(null);
  const [reassignTheatreId, setReassignTheatreId] = useState<string>('');
  const [savingTheatre, setSavingTheatre] = useState(false);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, []);

  const fetchSurgeries = useCallback(async () => {
    setIsSyncing(true);
    try {
      // Only fetch the selected day's cases when a date is chosen so we transfer
      // a small payload. An empty dateFilter loads every scheduled date.
      const url = dateFilter ? `/api/surgeries?date=${dateFilter}` : '/api/surgeries';
      const cacheKey = `surgeries-day-${dateFilter || 'all'}`;
      // Cache-first: paint last-known cases instantly, then revalidate from network.
      const result = await cacheFirstFetch<Surgery[]>(url, cacheKey, {
        onCachedData: (cached) => {
          if (Array.isArray(cached)) {
            setSurgeries(cached);
            setLoading(false);
          }
        },
      });
      if (Array.isArray(result.data)) {
        setSurgeries(result.data);
        setLastSyncTime(Date.now());
      } else if (result.error && !result.isCached) {
        console.error('Failed to fetch surgeries:', result.error);
      }
    } catch (error) {
      console.error('Failed to fetch surgeries:', error);
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  }, [dateFilter]);

  useEffect(() => {
    fetchSurgeries();
    // Auto-refresh on a relaxed cadence for cross-device sync (manual Refresh available)
    const interval = setInterval(fetchSurgeries, SYNC_INTERVALS.SURGERIES);
    return () => clearInterval(interval);
  }, [fetchSurgeries]);
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchSurgeries();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchSurgeries]);

  const handleMarkCompleted = async (surgeryId: string) => {
    if (!window.confirm('Mark this surgery as completed? This lets PACU admit the patient and lets the surgeon write the post-operative note. Date, time and team records are preserved.')) {
      return;
    }
    setCompletingId(surgeryId);
    try {
      const response = await fetch(`/api/surgeries/${surgeryId}/complete`, { method: 'POST' });
      if (response.ok) {
        await fetchSurgeries();
      } else {
        const data = await response.json().catch(() => ({}));
        alert(data.error || 'Failed to mark surgery as completed');
      }
    } catch (error) {
      alert('A network error occurred while completing the surgery');
    } finally {
      setCompletingId(null);
    }
  };

  // Theatre staff confirm an en-route patient has physically arrived in the theatre.
  const canReceiveInTheatre = ['SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'ANAESTHETIC_TECHNICIAN', 'THEATRE_MANAGER', 'ADMIN', 'SYSTEM_ADMINISTRATOR'].includes(userRole || '');
  const [receivingId, setReceivingId] = useState<string | null>(null);

  const handleReceiveInTheatre = async (assessmentId: string) => {
    if (!window.confirm('Confirm the patient has arrived and is being received in the theatre?')) {
      return;
    }
    setReceivingId(assessmentId);
    try {
      const response = await fetch(`/api/holding-area/${assessmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transferredToTheatre: true }),
      });
      if (response.ok) {
        await fetchSurgeries();
      } else {
        const data = await response.json().catch(() => ({}));
        alert(data.error || 'Failed to receive patient in theatre');
      }
    } catch (error) {
      alert('A network error occurred while receiving the patient');
    } finally {
      setReceivingId(null);
    }
  };

  // Load the list of theatres once for the "change theatre" picker (periop nurse / admin only).
  useEffect(() => {
    if (!canReassignTheatre) return;
    let active = true;
    fetch('/api/theatres')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (active && Array.isArray(data)) {
          setTheatres(data.map((t: any) => ({ id: t.id, name: t.name, location: t.location })));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [canReassignTheatre]);

  const openReassign = (surgery: Surgery) => {
    setReassignSurgery(surgery);
    setReassignTheatreId(surgery.theatreId || surgery.theatre?.id || '');
  };

  const handleSaveTheatre = async () => {
    if (!reassignSurgery) return;
    setSavingTheatre(true);
    try {
      const selected = theatres.find((t) => t.id === reassignTheatreId);
      const response = await fetch(`/api/surgeries/${reassignSurgery.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theatreId: reassignTheatreId || null,
          location: selected?.name || null,
        }),
      });
      if (response.ok) {
        setReassignSurgery(null);
        await fetchSurgeries();
      } else {
        const data = await response.json().catch(() => ({}));
        alert(data.error || 'Failed to change theatre');
      }
    } catch (error) {
      alert('A network error occurred while changing the theatre');
    } finally {
      setSavingTheatre(false);
    }
  };

  const filteredSurgeries = Array.isArray(surgeries) ? surgeries.filter(surgery => {
    const patientName = surgery.patient?.name || '';
    const folderNumber = surgery.patient?.folderNumber || '';
    const matchesSearch = 
      patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      folderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      surgery.procedureName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || surgery.status === statusFilter;
    const matchesDate = !dateFilter || (
      surgery.scheduledDate && surgery.scheduledDate.slice(0, 10) === dateFilter
    );
    return matchesSearch && matchesStatus && matchesDate;
  }) : [];

  // Resolve a human-friendly theatre label for a case.
  const theatreOf = (s: Surgery) =>
    s.theatre?.name || s.theatreName || s.location || 'Unassigned theatre';

  // Group the filtered cases by day, then by theatre, so each day's schedule is
  // laid out theatre-by-theatre. Cases inside a theatre are ordered by start time;
  // "Unassigned theatre" always sinks to the bottom of each day.
  const groupedSchedule = (() => {
    const sorted = [...filteredSurgeries].sort((a, b) => {
      const dateA = (a.scheduledDate || '').slice(0, 10);
      const dateB = (b.scheduledDate || '').slice(0, 10);
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      const thA = theatreOf(a);
      const thB = theatreOf(b);
      const unA = thA.toLowerCase().startsWith('unassigned') ? 1 : 0;
      const unB = thB.toLowerCase().startsWith('unassigned') ? 1 : 0;
      if (unA !== unB) return unA - unB;
      if (thA.toLowerCase() !== thB.toLowerCase()) return thA.localeCompare(thB);
      return (a.scheduledTime || '').localeCompare(b.scheduledTime || '');
    });
    const groups: { key: string; dateLabel: string; theatre: string; rows: Surgery[] }[] = [];
    for (const s of sorted) {
      const dayKey = (s.scheduledDate || '').slice(0, 10);
      const theatre = theatreOf(s);
      const key = `${dayKey}__${theatre}`;
      const last = groups[groups.length - 1];
      if (!last || last.key !== key) {
        groups.push({
          key,
          theatre,
          dateLabel: s.scheduledDate
            ? new Date(s.scheduledDate).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
            : '',
          rows: [s],
        });
      } else {
        last.rows.push(s);
      }
    }
    return groups;
  })();

  const summariseSpecialNeeds = (s: Surgery): string[] => {
    const tags: string[] = [];
    if (s.needBloodTransfusion) tags.push('Blood Tx');
    if (s.needDiathermy) tags.push('Diathermy');
    if (s.needStirups || s.needStereo) tags.push('Stirrups');
    if (s.needMontrellMattress) tags.push('Montrell');
    if (s.otherSpecialNeeds && s.otherSpecialNeeds.trim()) tags.push(`Other: ${s.otherSpecialNeeds.trim()}`);
    return tags;
  };

  // Export the currently filtered list as a landscape PDF (via browser print).
  // Grouped by surgical UNIT (e.g. "PS Unit I", "GS Unit III"), then by scheduled time.
  const handleExportPdf = () => {
    const rows = [...filteredSurgeries].sort((a, b) => {
      const teamA = (a.unit || a.subspecialty || '').toLowerCase();
      const teamB = (b.unit || b.subspecialty || '').toLowerCase();
      if (teamA !== teamB) return teamA.localeCompare(teamB);
      return (a.scheduledTime || '').localeCompare(b.scheduledTime || '');
    });

    // Group by surgical UNIT for clearer printout (more granular than subspecialty).
    const groups = new Map<string, Surgery[]>();
    for (const r of rows) {
      const key = r.unit || r.subspecialty || 'Unassigned';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }

    const dateLabel = dateFilter
      ? new Date(dateFilter).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
      : 'All scheduled dates';

    const escape = (v: string) =>
      v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const formatAnaesthesia = (a?: string | null) => {
      if (!a) return '—';
      const map: Record<string, string> = {
        GENERAL: 'General (GA)',
        SPINAL: 'Spinal',
        EPIDURAL: 'Epidural',
        COMBINED_SPINAL_EPIDURAL: 'Combined Spinal-Epidural',
        REGIONAL: 'Regional',
        SEDATION: 'Sedation',
        LOCAL: 'Local',
      };
      return map[a] || a;
    };

    let body = '';
    let groupNo = 0;
    groups.forEach((items, team) => {
      groupNo++;
      body += `<h2 class="team">${groupNo}. ${escape(team)} <span class="count">(${items.length} case${items.length === 1 ? '' : 's'})</span></h2>`;
      body += `<table><thead><tr>
        <th style="width:3%">#</th>
        <th style="width:12%">Patient</th>
        <th style="width:6%">Folder</th>
        <th style="width:6%">Age / Sex</th>
        <th style="width:7%">Ward</th>
        <th style="width:16%">Procedure</th>
        <th style="width:11%">Diagnosis / Indication</th>
        <th style="width:9%">Surgeon</th>
        <th style="width:8%">Theatre</th>
        <th style="width:8%">Date &amp; Time</th>
        <th style="width:7%">Anaesthesia</th>
        <th style="width:5%">Special</th>
        <th style="width:5%">Status</th>
      </tr></thead><tbody>`;
      items.forEach((s, i) => {
        const needs = summariseSpecialNeeds(s);
        const ageSex = `${s.patient?.age ?? '?'}${s.patient?.gender ? ' / ' + s.patient.gender : ''}`;
        const theatreLabel = s.theatreName || s.theatre?.name || s.location || '';
        body += `<tr>
          <td>${i + 1}</td>
          <td>${escape(s.patient?.name || 'Unknown')}</td>
          <td>${escape(s.patient?.folderNumber || 'N/A')}</td>
          <td>${escape(ageSex)}</td>
          <td>${escape(s.patient?.ward || '—')}</td>
          <td>${escape(s.procedureName)}</td>
          <td>${escape(s.indication || '—')}</td>
          <td>${escape(s.surgeon?.fullName || s.surgeonName || 'Not assigned')}</td>
          <td>${escape(theatreLabel)}${s.supervisingConsultantName ? `<br/><span class="sub">Consultant: ${escape(s.supervisingConsultantName)}</span>` : ''}</td>
          <td>${escape(formatDate(s.scheduledDate))}<br/><span class="sub">${escape(s.scheduledTime || '')}</span></td>
          <td>${escape(formatAnaesthesia(s.anesthesiaType))}</td>
          <td>${needs.length === 0 ? '<span class="sub">—</span>' : needs.map(n => `<span class="badge">${escape(n)}</span>`).join(' ')}</td>
          <td><span class="status status-${s.status}">${escape(s.status)}</span></td>
        </tr>`;
      });
      body += '</tbody></table>';
    });

    if (rows.length === 0) {
      body = '<p style="text-align:center;padding:40px;color:#666">No surgeries match the current filters.</p>';
    }

    const win = window.open('', '_blank', 'width=1200,height=800');
    if (!win) {
      alert('Please allow pop-ups to export the surgery list as PDF.');
      return;
    }
    win.document.write(`<!doctype html><html><head>
      <title>Surgery Schedule — ${escape(dateLabel)}</title>
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        body { font-family: Arial, sans-serif; color: #111; margin: 0; padding: 6mm; font-size: 11px; }
        .head { display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #111; padding-bottom:6px; margin-bottom:10px; }
        .head h1 { margin:0; font-size:16px; }
        .head p { margin:0; font-size:10px; color:#555; }
        h2.team { font-size:13px; background:#f1f5f9; border-left:4px solid #4f46e5; padding:4px 8px; margin:14px 0 4px; }
        h2.team .count { font-weight:normal; color:#555; font-size:11px; }
        table { width:100%; border-collapse:collapse; margin-bottom:6px; }
        th, td { border:1px solid #cbd5e1; padding:4px 6px; vertical-align:top; text-align:left; }
        th { background:#e0e7ff; font-size:10px; text-transform:uppercase; }
        .sub { color:#64748b; font-size:10px; }
        .badge { display:inline-block; background:#fef3c7; border:1px solid #fbbf24; color:#92400e; padding:1px 5px; border-radius:8px; font-size:9px; margin:1px 2px 1px 0; white-space:nowrap; }
        .status { padding:2px 6px; border-radius:8px; font-weight:bold; font-size:9px; }
        .status-SCHEDULED { background:#dbeafe; color:#1e40af; }
        .status-IN_PROGRESS { background:#fef3c7; color:#92400e; }
        .status-COMPLETED { background:#dcfce7; color:#166534; }
        .status-CANCELLED { background:#fee2e2; color:#991b1b; }
        .footer { margin-top:14px; border-top:1px solid #cbd5e1; padding-top:4px; font-size:9px; color:#64748b; display:flex; justify-content:space-between; }
      </style>
    </head><body>
      <div class="head">
        <div>
          <h1>UNTH Theatre — Surgery Schedule</h1>
          <p>Date: ${escape(dateLabel)} · Sorted by Surgical Team · ${rows.length} case${rows.length === 1 ? '' : 's'}</p>
        </div>
        <div style="text-align:right">
          <p>Generated: ${new Date().toLocaleString('en-GB')}</p>
        </div>
      </div>
      ${body}
      <div class="footer">
        <span>University of Nigeria Teaching Hospital — Ituku Ozalla, Enugu State</span>
        <span>Use Ctrl+P (or ⌘P) and choose “Save as PDF”</span>
      </div>
      <script>window.onload = function () { setTimeout(function () { window.print(); }, 250); }</script>
    </body></html>`);
    win.document.close();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SCHEDULED':
        return 'bg-blue-100 text-blue-800';
      case 'IN_PROGRESS':
        return 'bg-yellow-100 text-yellow-800';
      case 'COMPLETED':
        return 'bg-green-100 text-green-800';
      case 'CANCELLED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Surgery Scheduling</h1>
          <p className="text-gray-600 mt-1">Manage surgical procedures and bookings</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          {/* Sync Status Indicator */}
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap ${
              !isOnline ? 'bg-gray-100 text-gray-600 border-gray-200' :
              isSyncing ? 'bg-blue-50 text-blue-600 border-blue-200' :
              'bg-green-50 text-green-600 border-green-200'
            }`}>
              {!isOnline ? (
                <>
                  <WifiOff className="w-4 h-4" />
                  <span>Offline</span>
                </>
              ) : isSyncing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Syncing...</span>
                </>
              ) : (
                <>
                  <Wifi className="w-4 h-4" />
                  <span>Synced</span>
                </>
              )}
            </div>
            <button
              onClick={fetchSurgeries}
              disabled={isSyncing || !isOnline}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Sync latest data now"
            >
              <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sync now</span>
            </button>
          </div>
          <Link href="/dashboard/surgeries/completed" className="btn-secondary flex items-center justify-center whitespace-nowrap flex-1 sm:flex-none">
            Completed Surgeries
          </Link>
          <Link href="/dashboard/surgeries/new" className="btn-primary flex items-center justify-center whitespace-nowrap flex-1 sm:flex-none">
            <Plus className="w-5 h-5 mr-2 shrink-0" />
            Book Surgery
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by patient name, folder number, or procedure..."
              className="input-field pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="input-field"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            title="Status filter"
          >
            <option value="ALL">All Status</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <input
            type="date"
            className="input-field"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            title="Filter by scheduled date"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-600">
            Showing <strong>{filteredSurgeries.length}</strong> case{filteredSurgeries.length === 1 ? '' : 's'}
            {dateFilter
              ? <> on <strong>{new Date(dateFilter).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></>
              : <> across <strong>all dates</strong></>}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDateFilter(new Date().toISOString().split('T')[0])}
              className="text-xs font-medium text-blue-600 hover:text-blue-800 underline"
            >
              Today
            </button>
            {dateFilter && (
              <button
                type="button"
                onClick={() => setDateFilter('')}
                className="text-xs text-gray-600 hover:text-gray-800 underline"
              >
                All dates
              </button>
            )}
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={filteredSurgeries.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
              title="Export the filtered list as a landscape PDF, sorted by surgical team"
            >
              <Printer className="w-4 h-4" />
              Export PDF (landscape, by team)
            </button>
          </div>
        </div>
      </div>

      {/* Surgeries Table */}
      <div className="card">
        {loading ? (
          <TableSkeleton rows={6} columns={8} />
        ) : filteredSurgeries.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p>No surgeries found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Patient
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Procedure / Indication
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unit / Theatre
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Surgeon
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date & Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Special Needs
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {groupedSchedule.map((group) => (
                  <Fragment key={group.key}>
                    <tr className="bg-indigo-50/70">
                      <td colSpan={8} className="px-6 py-2">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-800">
                          {!dateFilter && group.dateLabel && (
                            <span className="text-indigo-500">{group.dateLabel}</span>
                          )}
                          <span>{group.theatre}</span>
                          <span className="text-indigo-400 font-medium normal-case">
                            · {group.rows.length} case{group.rows.length === 1 ? '' : 's'}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {group.rows.map((surgery) => (
                  <tr key={surgery.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {surgery.patient?.name ? (
                          <ContactName type="patient" id={surgery.patient.id} name={surgery.patient.name} />
                        ) : (
                          'Unknown Patient'
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {surgery.patient?.folderNumber || 'N/A'}
                        {(surgery.patient?.age != null || surgery.patient?.gender) && (
                          <span className="ml-1 text-gray-400">
                            · {surgery.patient?.age ?? '?'}y {surgery.patient?.gender ?? ''}
                          </span>
                        )}
                      </div>
                      {surgery.patient?.ward && (
                        <div className="text-xs text-gray-500">Ward: {surgery.patient.ward}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{surgery.procedureName}</div>
                      <div className="text-xs text-gray-500">{surgery.subspecialty}</div>
                      {surgery.indication && (
                        <div className="text-xs text-gray-500">
                          <span className="font-medium text-gray-600">Indication:</span> {surgery.indication}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{surgery.unit || '—'}</div>
                      <div className="text-xs text-gray-500">
                        {surgery.theatreName || surgery.theatre?.name || (surgery.location || 'No theatre')}
                      </div>
                      {surgery.supervisingConsultantName && (
                        <div className="text-xs text-indigo-600 mt-0.5">
                          Consultant: {surgery.supervisingConsultantName}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {surgery.surgeon?.fullName ? (
                        <ContactName type="user" id={surgery.surgeon.id} name={surgery.surgeon.fullName} />
                      ) : surgery.surgeonName ? (
                        <ContactName type="user" name={surgery.surgeonName} />
                      ) : (
                        'Not assigned'
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {formatDate(surgery.scheduledDate)}
                      </div>
                      <div className="text-sm text-gray-500">{surgery.scheduledTime}</div>
                    </td>
                    <td className="px-6 py-4">
                      {(() => {
                        const tags = summariseSpecialNeeds(surgery);
                        if (tags.length === 0) {
                          return <span className="text-xs text-gray-400 italic">None</span>;
                        }
                        return (
                          <div className="flex flex-wrap gap-1">
                            {tags.map((t) => (
                              <span
                                key={t}
                                className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium border border-amber-200"
                              >
                                {t === 'Blood Tx' && <Droplet className="w-3 h-3 mr-1" />}
                                {t === 'Diathermy' && <ZapIcon className="w-3 h-3 mr-1" />}
                                {t}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(surgery.status)}`}>
                        {surgery.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        {/* View Details - Always visible */}
                        <Link
                          href={`/dashboard/surgeries/${surgery.id}`}
                          className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-900 font-semibold"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </Link>

                        {/* Edit (re-schedule, change theatre/anaesthesia) - tracked in audit log */}
                        {surgery.status !== 'COMPLETED' && surgery.status !== 'CANCELLED' && (
                          <Link
                            href={`/dashboard/surgeries/${surgery.id}/edit`}
                            className="inline-flex items-center gap-1 text-amber-600 hover:text-amber-800"
                            title="Edit case (date/time/location tracked)"
                          >
                            <Pencil className="w-4 h-4" />
                          </Link>
                        )}

                        {/* Change / assign theatre (perioperative nurse + admin) */}
                        {canReassignTheatre && surgery.status !== 'COMPLETED' && surgery.status !== 'CANCELLED' && (
                          <button
                            onClick={() => openReassign(surgery)}
                            className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-800"
                            title="Change / assign theatre"
                          >
                            <Building2 className="w-4 h-4" />
                          </button>
                        )}

                        {/* Mark Completed (surgeon closes the case → PACU can admit + post-op note) */}
                        {canCompleteSurgery && surgery.status !== 'COMPLETED' && surgery.status !== 'CANCELLED' && (
                          <button
                            onClick={() => handleMarkCompleted(surgery.id)}
                            disabled={completingId === surgery.id}
                            className="inline-flex items-center gap-1 text-green-600 hover:text-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Mark surgery as completed"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}

                        {/* Receive in Theatre (en-route patient has arrived) */}
                        {canReceiveInTheatre &&
                          surgery.holdingAreaAssessment?.status === 'ENROUTE_TO_THEATRE' && (
                            <button
                              onClick={() => handleReceiveInTheatre(surgery.holdingAreaAssessment!.id)}
                              disabled={receivingId === surgery.holdingAreaAssessment.id}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Receive this en-route patient in the theatre"
                            >
                              <CheckCircle className="w-4 h-4" />
                              {receivingId === surgery.holdingAreaAssessment.id ? 'Receiving…' : 'Receive in Theatre'}
                            </button>
                          )}

                        {/* Consent Form */}
                        {canAccessConsent && (
                          <Link
                            href={`/dashboard/surgeries/${surgery.id}/consent`}
                            className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-900"
                            title="Surgical Consent Form"
                          >
                            <FileSignature className="w-4 h-4" />
                          </Link>
                        )}

                        {/* WHO Checklist */}
                        {canAccessWHOChecklist && (
                          <Link
                            href={`/dashboard/checklists/${surgery.id}`}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-900"
                            title="WHO Checklist"
                          >
                            <ClipboardList className="w-4 h-4" />
                          </Link>
                        )}

                        {/* Anesthesia Monitoring */}
                        {canAccessAnesthesia && (
                          <Link
                            href={`/dashboard/surgeries/${surgery.id}/anesthesia`}
                            className="inline-flex items-center gap-1 text-red-600 hover:text-red-900"
                            title="Anesthesia Monitoring"
                          >
                            <Activity className="w-4 h-4" />
                          </Link>
                        )}

                        {/* Surgical Count */}
                        {canAccessSurgicalCount && (
                          <Link
                            href={`/dashboard/surgeries/${surgery.id}/count`}
                            className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-900"
                            title="Surgical Count"
                          >
                            <Calculator className="w-4 h-4" />
                          </Link>
                        )}

                        {/* Timing */}
                        {canAccessTiming && (
                          <Link
                            href={`/dashboard/surgeries/${surgery.id}/timing`}
                            className="inline-flex items-center gap-1 text-green-600 hover:text-green-900"
                            title="Surgical Timing"
                          >
                            <Clock className="w-4 h-4" />
                          </Link>
                        )}

                        {/* Consumables */}
                        {canAccessConsumables && (
                          <Link
                            href={`/dashboard/surgeries/${surgery.id}/consumables`}
                            className="inline-flex items-center gap-1 text-orange-600 hover:text-orange-900"
                            title="Track Consumables"
                          >
                            <Package className="w-4 h-4" />
                          </Link>
                        )}

                        {/* Post-Op Prescription (after surgery) */}
                        {(surgery.status === 'COMPLETED' || surgery.status === 'IN_RECOVERY' || surgery.status === 'RECOVERY_COMPLETE') && (
                          <Link
                            href={`/dashboard/surgeries/${surgery.id}/post-op-prescription`}
                            className="inline-flex items-center gap-1 text-pink-600 hover:text-pink-900"
                            title="Send post-op prescription to pharmacy"
                          >
                            <Pill className="w-4 h-4" />
                          </Link>
                        )}

                        {/* BOM */}
                        {canAccessBOM && (
                          <Link
                            href={`/dashboard/surgeries/${surgery.id}/bom`}
                            className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900"
                            title="Bill of Materials"
                          >
                            <FileText className="w-4 h-4" />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Change-theatre modal (periop nurse / admin) */}
      {reassignSurgery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-teal-600" />
                Change Theatre
              </h2>
              <button
                onClick={() => setReassignSurgery(null)}
                className="text-gray-400 hover:text-gray-600"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="text-sm text-gray-600">
                <div className="font-medium text-gray-900">{reassignSurgery.patient?.name}</div>
                <div>{reassignSurgery.procedureName}</div>
                <div className="text-xs text-gray-500 mt-1">
                  Currently:{' '}
                  {reassignSurgery.theatreName ||
                    reassignSurgery.theatre?.name ||
                    reassignSurgery.location ||
                    'Unassigned'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assign to theatre</label>
                <select
                  value={reassignTheatreId}
                  onChange={(e) => setReassignTheatreId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                >
                  <option value="">Unassigned</option>
                  {theatres.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.location ? ` — ${t.location}` : ''}
                    </option>
                  ))}
                </select>
                {theatres.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">No theatres available to choose from.</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <button
                onClick={() => setReassignSurgery(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTheatre}
                disabled={savingTheatre}
                className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {savingTheatre ? 'Saving…' : 'Save theatre'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
