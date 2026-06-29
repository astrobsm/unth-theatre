'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { SYNC_INTERVALS } from '@/lib/sync';
import { cacheFirstFetch } from '@/lib/offlineDataManager';
import { TableSkeleton } from '@/components/Skeleton';
import ContactName from '@/components/ContactName';

interface Patient {
  id: string;
  folderNumber: string;
  name: string;
  age: number;
  gender: string;
  ward: string;
}

interface Surgery {
  id: string;
  procedureName: string;
  scheduledDate: string;
  scheduledTime: string;
  status?: string;
  surgeon: {
    fullName: string;
  };
}

interface HoldingAreaAssessment {
  id: string;
  surgeryId: string;
  patientId: string;
  arrivalTime: string;
  status: string;
  patient: Patient;
  surgery: Surgery;
  patientIdentityConfirmed: boolean;
  surgicalSiteConfirmed: boolean;
  consentFormSigned: boolean;
  allergyStatusChecked: boolean;
  fastingCompliant: boolean;
  vitalSignsNormal: boolean;
  allDocumentationComplete: boolean;
  clearedForTheatre: boolean;
  redAlertTriggered: boolean;
  redAlerts: any[];
  transportPorterIds?: string | null;
  transportPorterNames?: string | null;
  transportRecordedAt?: string | null;
}

export default function HoldingAreaPage() {
  const router = useRouter();
  const [assessments, setAssessments] = useState<HoldingAreaAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active'>('active');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  // Porter transport tracking (who carried the patient to the holding area).
  const [porters, setPorters] = useState<{ id: string; fullName: string }[]>([]);
  const [porterSel, setPorterSel] = useState<Record<string, string[]>>({});

  // Fetch porters once for the transport selector.
  useEffect(() => {
    fetch('/api/users?role=PORTER')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setPorters(
            data.map((u: any) => ({ id: u.id, fullName: u.fullName })),
          );
        }
      })
      .catch(() => setPorters([]));
  }, []);

  const parsePorterList = (s?: string | null): string[] => {
    if (!s) return [];
    try {
      const v = JSON.parse(s);
      return Array.isArray(v) ? v.filter(Boolean) : [];
    } catch {
      return [];
    }
  };

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

  const fetchAssessments = useCallback(async () => {
    
    setIsSyncing(true);
    try {
      const params = new URLSearchParams();
      if (filter === 'active') params.set('active', 'true');
      if (selectedDate) params.set('date', selectedDate);
      const url = `/api/holding-area?${params.toString()}`;
      const cacheKey = `holding-area-${filter}-${selectedDate || 'all'}`;
      // Cache-first: paint last-known assessments instantly, then revalidate.
      const result = await cacheFirstFetch<HoldingAreaAssessment[]>(url, cacheKey, {
        onCachedData: (cached) => {
          if (Array.isArray(cached)) {
            setAssessments(cached);
            setLoading(false);
          }
        },
      });
      if (Array.isArray(result.data)) {
        setAssessments(result.data);
        setLastSyncTime(Date.now());
      } else if (result.error && !result.isCached) {
        console.error('Error fetching assessments:', result.error);
      }
    } catch (error) {
      console.error('Error fetching assessments:', error);
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  }, [filter, selectedDate]);

  useEffect(() => {
    fetchAssessments();
    // Auto-refresh every 15 seconds for critical patient safety monitoring
    const interval = setInterval(fetchAssessments, SYNC_INTERVALS.HOLDING_AREA);
    return () => clearInterval(interval);
  }, [fetchAssessments]);

  // Refetch when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchAssessments();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchAssessments]);

  // Track which assessment is mid-action so its button can show a busy state.
  const [actionId, setActionId] = useState<string | null>(null);

  // Request transfer of a cleared patient to theatre → status becomes ENROUTE.
  const requestTransferToTheatre = async (assessment: HoldingAreaAssessment) => {
    if (!confirm(`Request transfer of ${assessment.patient?.name || 'this patient'} to the operating theatre? The theatre team will be alerted to receive the patient.`)) {
      return;
    }
    setActionId(assessment.id);
    try {
      const res = await fetch(`/api/holding-area/${assessment.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestTransferToTheatre: true }),
      });
      if (res.ok) {
        printTransferSlip(assessment);
        await fetchAssessments();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to request transfer to theatre');
      }
    } catch {
      alert('A network error occurred while requesting transfer');
    } finally {
      setActionId(null);
    }
  };

  // Cancelled-in-holding patient → request transfer back to the ward.
  const transferBackToWard = async (assessment: HoldingAreaAssessment) => {
    const reason = prompt('Reason for returning this patient to the ward:');
    if (!reason || reason.trim().length < 5) {
      alert('A reason (minimum 5 characters) is required to return the patient to the ward.');
      return;
    }
    setActionId(assessment.id);
    try {
      const res = await fetch(`/api/holding-area/${assessment.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnToWardCancelled: true, cancellationReason: reason.trim() }),
      });
      if (res.ok) {
        printWardReturnSlip(assessment, reason.trim());
        await fetchAssessments();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to return patient to ward');
      }
    } catch {
      alert('A network error occurred while returning the patient to the ward');
    } finally {
      setActionId(null);
    }
  };

  // Record the porter(s) who transported the patient to the holding area.
  const recordTransportPorters = async (assessment: HoldingAreaAssessment) => {
    const ids = porterSel[assessment.id] || [];
    if (ids.length === 0) {
      alert('Select at least one porter who transported the patient.');
      return;
    }
    const names = porters
      .filter((p) => ids.includes(p.id))
      .map((p) => p.fullName);
    setActionId(assessment.id);
    try {
      const res = await fetch(`/api/holding-area/${assessment.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordTransportPorters: true,
          transportPorterIds: ids,
          transportPorterNames: names,
        }),
      });
      if (res.ok) {
        await fetchAssessments();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to record transport porters');
      }
    } catch {
      alert('A network error occurred while recording transport porters');
    } finally {
      setActionId(null);
    }
  };
  const printSlip = (title: string, badge: string, bodyHtml: string) => {
    const win = window.open('', '_blank', 'width=302,height=600');
    if (!win) {
      alert('Please allow pop-ups to print the slip.');
      return;
    }
    win.document.write(`<!doctype html><html><head><title>${title}</title>
      <style>
        @page { size: 80mm auto; margin: 2mm; }
        body { font-family: 'Courier New', monospace; width: 76mm; margin: 0 auto; padding: 2mm; font-size: 11px; color: #000; }
        .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 4px; margin-bottom: 6px; }
        .hospital-name { font-size: 13px; font-weight: bold; text-transform: uppercase; margin: 2px 0; }
        .subtitle { font-size: 10px; font-weight: bold; border: 1px solid #000; padding: 2px 6px; display: inline-block; margin: 4px 0; }
        .field { margin: 3px 0; display: flex; }
        .field-label { font-weight: bold; min-width: 26mm; }
        .field-value { flex: 1; }
        .divider { border-top: 1px dashed #000; margin: 6px 0; }
        .instruction { font-size: 11px; margin: 6px 0; font-weight: bold; text-align: center; }
        .timestamp { text-align: center; font-size: 10px; margin-top: 6px; }
        .sign { margin-top: 10px; font-size: 10px; }
        .sign-line { border-top: 1px solid #000; margin-top: 16px; padding-top: 2px; }
        .footer { text-align: center; font-size: 9px; margin-top: 8px; border-top: 2px dashed #000; padding-top: 4px; }
      </style></head>
      <body>
        <div class="header">
          <div class="hospital-name">UNTH Ituku-Ozalla</div>
          <div class="subtitle">${badge}</div>
        </div>
        ${bodyHtml}
        <script>window.onload = function() { window.print(); window.close(); }</script>
      </body></html>`);
    win.document.close();
  };

  const printTransferSlip = (a: HoldingAreaAssessment) => {
    const now = new Date().toLocaleString('en-GB');
    printSlip(
      'Transfer to Theatre',
      'TRANSFER TO THEATRE',
      `
        <div class="field"><span class="field-label">Patient:</span><span class="field-value">${a.patient?.name || ''}</span></div>
        <div class="field"><span class="field-label">Folder No:</span><span class="field-value">${a.patient?.folderNumber || ''}</span></div>
        <div class="field"><span class="field-label">Age/Sex:</span><span class="field-value">${a.patient?.age ?? ''}yrs / ${a.patient?.gender || ''}</span></div>
        <div class="field"><span class="field-label">Ward:</span><span class="field-value">${a.patient?.ward || 'N/A'}</span></div>
        <div class="divider"></div>
        <div class="field"><span class="field-label">Procedure:</span><span class="field-value">${a.surgery?.procedureName || ''}</span></div>
        <div class="field"><span class="field-label">Surgeon:</span><span class="field-value">${a.surgery?.surgeon?.fullName || 'N/A'}</span></div>
        <div class="divider"></div>
        <div class="instruction">Patient is EN ROUTE to theatre. Theatre team, please receive.</div>
        <div class="timestamp">Dispatched: ${now}</div>
        <div class="sign"><div class="sign-line">Holding-area nurse signature</div></div>
        <div class="sign"><div class="sign-line">Theatre nurse (received by)</div></div>
        <div class="footer">Operative Resource Manager</div>
      `
    );
  };

  const printWardReturnSlip = (a: HoldingAreaAssessment, reason: string) => {
    const now = new Date().toLocaleString('en-GB');
    printSlip(
      'Return to Ward',
      'RETURN TO WARD',
      `
        <div class="field"><span class="field-label">Patient:</span><span class="field-value">${a.patient?.name || ''}</span></div>
        <div class="field"><span class="field-label">Folder No:</span><span class="field-value">${a.patient?.folderNumber || ''}</span></div>
        <div class="field"><span class="field-label">Age/Sex:</span><span class="field-value">${a.patient?.age ?? ''}yrs / ${a.patient?.gender || ''}</span></div>
        <div class="field"><span class="field-label">Ward:</span><span class="field-value">${a.patient?.ward || 'N/A'}</span></div>
        <div class="divider"></div>
        <div class="field"><span class="field-label">Procedure:</span><span class="field-value">${a.surgery?.procedureName || ''}</span></div>
        <div class="field"><span class="field-label">Reason:</span><span class="field-value">${reason}</span></div>
        <div class="divider"></div>
        <div class="instruction">Case CANCELLED in holding area. Ward nurse, please come and receive the patient back to the ward.</div>
        <div class="timestamp">Issued: ${now}</div>
        <div class="sign"><div class="sign-line">Holding-area nurse signature</div></div>
        <div class="sign"><div class="sign-line">Ward nurse (received by)</div></div>
        <div class="footer">Operative Resource Manager</div>
      `
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ARRIVED':
        return 'bg-blue-100 text-blue-800';
      case 'VERIFICATION_IN_PROGRESS':
        return 'bg-yellow-100 text-yellow-800';
      case 'DISCREPANCY_FOUND':
        return 'bg-orange-100 text-orange-800';
      case 'RED_ALERT_ACTIVE':
        return 'bg-red-100 text-red-800 font-bold';
      case 'CLEARED_FOR_THEATRE':
        return 'bg-green-100 text-green-800';
      case 'ENROUTE_TO_THEATRE':
        return 'bg-teal-100 text-teal-800 font-semibold';
      case 'TRANSFERRED_TO_THEATRE':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ');
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <TableSkeleton rows={6} columns={6} />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Pre-Operative Holding Area
          </h1>
          <p className="text-gray-600">
            Patient safety verification and theatre clearance
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Sync Status Indicator */}
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
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
              onClick={fetchAssessments}
              disabled={isSyncing || !isOnline}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Sync latest data now"
            >
              <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sync now</span>
            </button>
          </div>
          <button
            onClick={() => router.push('/dashboard/holding-area/ward-entries')}
            className="bg-indigo-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
            title="Transcribe handwritten porter times & ward-nurse signature from the Call-for-Patient printout"
          >
            Ward Escort Log
          </button>
          <button
            onClick={() => router.push('/dashboard/holding-area/new')}
            className="bg-primary-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-primary-700 transition-colors"
          >
            + New Assessment
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3 sm:gap-4">
        <button
          onClick={() => setFilter('active')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'active'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Active Patients
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          All Patients
        </button>
        <div className="flex items-center gap-2 ml-auto">
          <label htmlFor="ha-date" className="text-sm text-gray-600">Date</label>
          <input
            id="ha-date"
            type="date"
            value={selectedDate}
            max={new Date().toISOString().split('T')[0]}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            title="Holding area date"
          />
          <button
            onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
          >
            Today
          </button>
        </div>
      </div>

      {/* Assessments Grid */}
      {assessments.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500 text-lg">No patients in holding area</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {assessments.map((assessment) => (
            <div
              key={assessment.id}
              className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => router.push(`/dashboard/holding-area/${assessment.id}`)}
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-lg text-gray-900">
                    {assessment.patient?.name ? (
                      <ContactName type="patient" id={assessment.patient.id} name={assessment.patient.name} />
                    ) : (
                      'Unknown Patient'
                    )}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {assessment.patient?.folderNumber || 'N/A'} • {assessment.patient?.age || 'N/A'}y • {assessment.patient?.gender || 'N/A'}
                  </p>
                </div>
                {assessment.redAlertTriggered && (
                  <div className="bg-red-600 text-white px-2 py-1 rounded text-xs font-bold">
                    🚨 ALERT
                  </div>
                )}
              </div>

              {/* Status Badge */}
              <div className="mb-4">
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(assessment.status)}`}>
                  {formatStatus(assessment.status)}
                </span>
              </div>

              {/* Surgery Details */}
              <div className="mb-4 text-sm">
                <p className="font-medium text-gray-900">{assessment.surgery?.procedureName}</p>
                <p className="text-gray-600">Surgeon: {assessment.surgery?.surgeon?.fullName ? (
                  <ContactName type="user" name={assessment.surgery.surgeon.fullName} />
                ) : 'N/A'}</p>
                <p className="text-gray-600">
                  Scheduled: {new Date(assessment.surgery.scheduledDate).toLocaleDateString()} at {assessment.surgery.scheduledTime}
                </p>
              </div>

              {/* Safety Checks Progress */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-700 mb-2">Safety Verification:</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1">
                    {assessment.patientIdentityConfirmed ? (
                      <span className="text-green-600">✓</span>
                    ) : (
                      <span className="text-gray-400">○</span>
                    )}
                    <span className="text-gray-700">Identity</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {assessment.surgicalSiteConfirmed ? (
                      <span className="text-green-600">✓</span>
                    ) : (
                      <span className="text-gray-400">○</span>
                    )}
                    <span className="text-gray-700">Site</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {assessment.consentFormSigned ? (
                      <span className="text-green-600">✓</span>
                    ) : (
                      <span className="text-gray-400">○</span>
                    )}
                    <span className="text-gray-700">Consent</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {assessment.fastingCompliant ? (
                      <span className="text-green-600">✓</span>
                    ) : (
                      <span className="text-gray-400">○</span>
                    )}
                    <span className="text-gray-700">Fasting</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {assessment.vitalSignsNormal ? (
                      <span className="text-green-600">✓</span>
                    ) : (
                      <span className="text-gray-400">○</span>
                    )}
                    <span className="text-gray-700">Vitals</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {assessment.allDocumentationComplete ? (
                      <span className="text-green-600">✓</span>
                    ) : (
                      <span className="text-gray-400">○</span>
                    )}
                    <span className="text-gray-700">Documents</span>
                  </div>
                </div>
              </div>

              {/* Action Status */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                {assessment.surgery?.status === 'CANCELLED' ? (
                  <div className="text-red-600 text-sm font-medium">
                    ✕ Case Cancelled in Holding Area
                  </div>
                ) : assessment.status === 'ENROUTE_TO_THEATRE' ? (
                  <div className="text-teal-600 text-sm font-medium">
                    🚶 En route to Theatre — awaiting receiving team
                  </div>
                ) : assessment.clearedForTheatre ? (
                  <div className="text-green-600 text-sm font-medium">
                    ✓ Cleared for Theatre
                  </div>
                ) : assessment.redAlertTriggered ? (
                  <div className="text-red-600 text-sm font-medium">
                    🚨 Red Alert Active ({assessment.redAlerts.length})
                  </div>
                ) : (
                  <div className="text-yellow-600 text-sm font-medium">
                    ⏳ Verification in Progress
                  </div>
                )}

                {/* Patient transport — porter(s) who brought the patient */}
                <div
                  className="mt-3 pt-3 border-t border-dashed border-gray-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  {parsePorterList(assessment.transportPorterNames).length > 0 ? (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-700">
                      <span>🧑‍🦽</span>
                      <span className="font-medium">Transported by:</span>
                      <span>
                        {parsePorterList(assessment.transportPorterNames).join(', ')}
                      </span>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-medium text-gray-700 mb-1.5">
                        Porter(s) who transported the patient:
                      </p>
                      {porters.length === 0 ? (
                        <span className="text-xs text-gray-400">
                          No porters found
                        </span>
                      ) : (
                        <div className="flex flex-col gap-2 mb-2">
                          {[0, 1].map((slot) => {
                            const sel = porterSel[assessment.id] || [];
                            const value = sel[slot] || '';
                            const otherSlot = slot === 0 ? 1 : 0;
                            const otherId = sel[otherSlot] || '';
                            return (
                              <select
                                key={slot}
                                value={value}
                                aria-label={`Porter ${slot + 1}`}
                                onChange={(e) => {
                                  const next = [...(porterSel[assessment.id] || [])];
                                  if (e.target.value) next[slot] = e.target.value;
                                  else delete next[slot];
                                  // Remove empties and duplicates while preserving order.
                                  const cleaned = next
                                    .filter(Boolean)
                                    .filter((v, i, a) => a.indexOf(v) === i);
                                  setPorterSel({
                                    ...porterSel,
                                    [assessment.id]: cleaned,
                                  });
                                }}
                                className="text-xs px-2 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 focus:border-emerald-400 focus:outline-none"
                              >
                                <option value="">
                                  {slot === 0
                                    ? '— Select porter —'
                                    : '— Select 2nd porter (optional) —'}
                                </option>
                                {porters
                                  .filter(
                                    (p) => p.id === value || p.id !== otherId,
                                  )
                                  .map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.fullName}
                                    </option>
                                  ))}
                              </select>
                            );
                          })}
                        </div>
                      )}
                      <button
                        onClick={() => recordTransportPorters(assessment)}
                        disabled={actionId === assessment.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                        title="Record the porter(s) who carried the patient — credits them for a cafeteria meal task"
                      >
                        {actionId === assessment.id
                          ? 'Saving…'
                          : 'Record Transport Porters'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Dynamic workflow actions */}
                <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                  {/* Cleared → request transfer to theatre */}
                  {assessment.surgery?.status !== 'CANCELLED' &&
                    assessment.status === 'CLEARED_FOR_THEATRE' && (
                      <button
                        onClick={() => requestTransferToTheatre(assessment)}
                        disabled={actionId === assessment.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50"
                        title="Request transfer of this patient to the operating theatre"
                      >
                        {actionId === assessment.id ? 'Requesting…' : 'Request Transfer to Theatre'}
                      </button>
                    )}

                  {/* En route → reprint transfer slip */}
                  {assessment.status === 'ENROUTE_TO_THEATRE' && (
                    <button
                      onClick={() => printTransferSlip(assessment)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-100 text-teal-800 text-xs font-semibold rounded-lg hover:bg-teal-200 border border-teal-300"
                      title="Reprint the theatre transfer slip"
                    >
                      Reprint Transfer Slip
                    </button>
                  )}

                  {/* Cancelled in holding → transfer back to ward + slip */}
                  {assessment.surgery?.status === 'CANCELLED' && (
                    <button
                      onClick={() => transferBackToWard(assessment)}
                      disabled={actionId === assessment.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50"
                      title="Request the patient be transferred back to the ward and print the ward return slip"
                    >
                      {actionId === assessment.id ? 'Processing…' : 'Transfer Back to Ward'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
