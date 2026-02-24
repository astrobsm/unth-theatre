'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Phone,
  XCircle,
  Printer,
  RefreshCw,
  Clock,
  Search,
  CheckCircle2,
  AlertTriangle,
  User,
  Building2,
} from 'lucide-react';

interface CaseData {
  surgeryId: string;
  patientName: string;
  folderNumber: string;
  age: number;
  gender: string;
  ward: string;
  diagnosis: string;
  procedureName: string;
  surgicalUnit: string;
  scheduledTime: string;
  surgeonName: string;
  theatreName: string;
  theatreId: string | null;
  nurseName: string | null;
  nurseId: string | null;
  porterName: string | null;
  porterId: string | null;
  status: string;
  existingCallUp: {
    id: string;
    status: string;
    invitedAt: string | null;
    invitedByName: string;
    rejectedAt: string | null;
    rejectionReason: string | null;
    callUpNoteNumber: string | null;
  } | null;
}

interface TheatreGroup {
  theatreName: string;
  theatreId: string | null;
  cases: CaseData[];
}

interface ApiResponse {
  theatreGroups: TheatreGroup[];
  unassigned: CaseData[];
  date: string;
  totalCases: number;
}

export default function CallForPatientPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [printData, setPrintData] = useState<any | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const fetchCases = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/call-for-patient');
      if (!res.ok) throw new Error('Failed to fetch cases');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCases();
    const interval = setInterval(fetchCases, 30000);
    return () => clearInterval(interval);
  }, [fetchCases]);

  const handleInvite = async (caseItem: CaseData) => {
    setActionLoading(caseItem.surgeryId);
    try {
      const res = await fetch('/api/call-for-patient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surgeryId: caseItem.surgeryId,
          action: 'invite',
          theatreName: caseItem.theatreName,
          theatreId: caseItem.theatreId,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to invite patient');
      }
      const callUp = await res.json();
      setSuccessMsg(`Patient ${caseItem.patientName} has been invited!`);
      setTimeout(() => setSuccessMsg(null), 4000);

      // Auto-generate call-up note for printing
      setPrintData({
        ...callUp,
        scheduledTime: caseItem.scheduledTime,
        diagnosis: caseItem.diagnosis,
        procedureName: caseItem.procedureName,
        surgicalUnit: caseItem.surgicalUnit,
        age: caseItem.age,
        gender: caseItem.gender,
      });

      // Auto-trigger print after a short delay
      setTimeout(() => {
        handlePrint();
      }, 500);

      fetchCases();
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(null), 4000);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (caseItem: CaseData) => {
    if (!rejectionReason.trim()) {
      setError('Please provide a reason for rejection');
      setTimeout(() => setError(null), 3000);
      return;
    }
    setActionLoading(caseItem.surgeryId);
    try {
      const res = await fetch('/api/call-for-patient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surgeryId: caseItem.surgeryId,
          action: 'reject',
          rejectionReason: rejectionReason.trim(),
          theatreName: caseItem.theatreName,
          theatreId: caseItem.theatreId,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to reject patient');
      }
      setSuccessMsg(`Patient ${caseItem.patientName} has been rejected.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      setRejectingId(null);
      setRejectionReason('');
      fetchCases();
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(null), 4000);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=302,height=600');
    if (!printWindow || !printRef.current) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Call-Up Note</title>
          <style>
            @page { size: 80mm auto; margin: 2mm; }
            body { font-family: 'Courier New', monospace; width: 76mm; margin: 0 auto; padding: 2mm; font-size: 11px; color: #000; }
            .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 4px; margin-bottom: 6px; }
            .logo { width: 40mm; height: auto; margin: 0 auto; display: block; }
            .hospital-name { font-size: 13px; font-weight: bold; text-transform: uppercase; margin: 4px 0 2px; }
            .subtitle { font-size: 10px; font-weight: bold; border: 1px solid #000; padding: 2px 6px; display: inline-block; margin: 4px 0; }
            .field { margin: 3px 0; display: flex; }
            .field-label { font-weight: bold; min-width: 28mm; }
            .field-value { flex: 1; }
            .divider { border-top: 1px dashed #000; margin: 6px 0; }
            .timestamp { text-align: center; font-size: 10px; margin-top: 6px; }
            .note-num { text-align: center; font-size: 9px; color: #666; margin-top: 4px; }
            .footer { text-align: center; font-size: 9px; margin-top: 8px; border-top: 2px dashed #000; padding-top: 4px; }
          </style>
        </head>
        <body>${printRef.current.innerHTML}</body>
        <script>window.onload = function() { window.print(); window.close(); }</script>
      </html>
    `);
    printWindow.document.close();
  };

  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return 'N/A';
    try {
      return new Date(timeStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return timeStr;
    }
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (callUp: CaseData['existingCallUp']) => {
    if (!callUp) return null;
    const statusConfig: Record<string, { color: string; label: string }> = {
      INVITED: { color: 'bg-green-100 text-green-800', label: 'Invited' },
      REJECTED: { color: 'bg-red-100 text-red-800', label: 'Rejected' },
      PATIENT_EN_ROUTE: { color: 'bg-blue-100 text-blue-800', label: 'En Route' },
      PATIENT_ARRIVED: { color: 'bg-emerald-100 text-emerald-800', label: 'Arrived' },
      CANCELLED: { color: 'bg-gray-100 text-gray-800', label: 'Cancelled' },
    };
    const cfg = statusConfig[callUp.status] || { color: 'bg-gray-100 text-gray-600', label: callUp.status };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
        {cfg.label}
      </span>
    );
  };

  // Filter cases by search term
  const filterCases = (cases: CaseData[]) => {
    if (!searchTerm.trim()) return cases;
    const term = searchTerm.toLowerCase();
    return cases.filter(c =>
      c.patientName.toLowerCase().includes(term) ||
      c.folderNumber?.toLowerCase().includes(term) ||
      c.procedureName?.toLowerCase().includes(term) ||
      c.ward?.toLowerCase().includes(term)
    );
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-gray-600">Loading today&apos;s cases...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Phone className="w-8 h-8 text-blue-600" />
              Call for Patient
            </h1>
            <p className="text-gray-600 mt-1">
              Today&apos;s booked cases — {data?.totalCases || 0} total |{' '}
              {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <button
            onClick={fetchCases}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Search */}
        <div className="mt-4 relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search patient name, folder number, procedure..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}
      {successMsg && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Theatre Groups */}
      {data?.theatreGroups.map((group) => {
        const filtered = filterCases(group.cases);
        if (filtered.length === 0 && searchTerm) return null;
        return (
          <div key={group.theatreName} className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-5 h-5 text-indigo-600" />
              <h2 className="text-xl font-bold text-gray-800">{group.theatreName}</h2>
              <span className="text-sm text-gray-500">({filtered.length} cases)</span>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">S/N</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Folder No.</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ward</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Procedure</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Surgeon</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((caseItem, idx) => (
                      <tr key={caseItem.surgeryId} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-600">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">{caseItem.patientName}</div>
                          <div className="text-xs text-gray-500">{caseItem.age}yrs / {caseItem.gender}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{caseItem.folderNumber}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{caseItem.ward || 'N/A'}</td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-900">{caseItem.procedureName}</div>
                          <div className="text-xs text-gray-500">{caseItem.diagnosis}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{caseItem.scheduledTime || 'TBD'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{caseItem.surgeonName}</td>
                        <td className="px-4 py-3">
                          {caseItem.existingCallUp ? (
                            <div>
                              {getStatusBadge(caseItem.existingCallUp)}
                              {caseItem.existingCallUp.invitedAt && (
                                <div className="text-xs text-gray-500 mt-1">
                                  {formatDateTime(caseItem.existingCallUp.invitedAt)}
                                </div>
                              )}
                              {caseItem.existingCallUp.rejectionReason && (
                                <div className="text-xs text-red-500 mt-1">
                                  {caseItem.existingCallUp.rejectionReason}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">Pending</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {/* Invite Button */}
                            {(!caseItem.existingCallUp || caseItem.existingCallUp.status === 'REJECTED') && (
                              <button
                                onClick={() => handleInvite(caseItem)}
                                disabled={actionLoading === caseItem.surgeryId}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
                              >
                                {actionLoading === caseItem.surgeryId ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Phone className="w-3 h-3" />
                                )}
                                Invite
                              </button>
                            )}

                            {/* Reject Button */}
                            {(!caseItem.existingCallUp || caseItem.existingCallUp.status === 'INVITED') && (
                              <>
                                {rejectingId === caseItem.surgeryId ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      placeholder="Reason for rejection..."
                                      value={rejectionReason}
                                      onChange={(e) => setRejectionReason(e.target.value)}
                                      className="w-40 px-2 py-1 text-xs border border-red-300 rounded focus:ring-1 focus:ring-red-500"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleReject(caseItem);
                                        if (e.key === 'Escape') { setRejectingId(null); setRejectionReason(''); }
                                      }}
                                    />
                                    <button
                                      onClick={() => handleReject(caseItem)}
                                      disabled={actionLoading === caseItem.surgeryId}
                                      className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 disabled:opacity-50"
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      onClick={() => { setRejectingId(null); setRejectionReason(''); }}
                                      className="px-2 py-1 bg-gray-300 text-gray-700 text-xs rounded hover:bg-gray-400"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setRejectingId(caseItem.surgeryId);
                                      setRejectionReason('');
                                    }}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 text-xs font-medium rounded-lg hover:bg-red-200 transition"
                                  >
                                    <XCircle className="w-3 h-3" />
                                    Reject
                                  </button>
                                )}
                              </>
                            )}

                            {/* Re-print call-up note */}
                            {caseItem.existingCallUp?.status === 'INVITED' && (
                              <button
                                onClick={() => {
                                  setPrintData({
                                    ...caseItem.existingCallUp,
                                    patientName: caseItem.patientName,
                                    folderNumber: caseItem.folderNumber,
                                    ward: caseItem.ward,
                                    age: caseItem.age,
                                    gender: caseItem.gender,
                                    theatreName: caseItem.theatreName,
                                    assignedNurseName: caseItem.nurseName,
                                    assignedPorterName: caseItem.porterName,
                                    surgeonName: caseItem.surgeonName,
                                    procedureName: caseItem.procedureName,
                                    diagnosis: caseItem.diagnosis,
                                    surgicalUnit: caseItem.surgicalUnit,
                                    scheduledTime: caseItem.scheduledTime,
                                  });
                                  setTimeout(() => handlePrint(), 300);
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-200 transition"
                              >
                                <Printer className="w-3 h-3" />
                                Print
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })}

      {/* Unassigned Theatre Cases */}
      {data?.unassigned && filterCases(data.unassigned).length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h2 className="text-xl font-bold text-gray-800">Unassigned Theatre</h2>
            <span className="text-sm text-gray-500">
              ({filterCases(data.unassigned).length} cases)
            </span>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-amber-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-amber-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">S/N</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Folder No.</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ward</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Procedure</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Surgeon</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filterCases(data.unassigned).map((caseItem, idx) => (
                    <tr key={caseItem.surgeryId} className="hover:bg-amber-50/50">
                      <td className="px-4 py-3 text-sm text-gray-600">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{caseItem.patientName}</div>
                        <div className="text-xs text-gray-500">{caseItem.age}yrs / {caseItem.gender}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{caseItem.folderNumber}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{caseItem.ward || 'N/A'}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900">{caseItem.procedureName}</div>
                        <div className="text-xs text-gray-500">{caseItem.diagnosis}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{caseItem.scheduledTime || 'TBD'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{caseItem.surgeonName}</td>
                      <td className="px-4 py-3">
                        {caseItem.existingCallUp ? getStatusBadge(caseItem.existingCallUp) : (
                          <span className="text-xs text-gray-400">Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {(!caseItem.existingCallUp || caseItem.existingCallUp.status === 'REJECTED') && (
                            <button
                              onClick={() => handleInvite(caseItem)}
                              disabled={actionLoading === caseItem.surgeryId}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
                            >
                              <Phone className="w-3 h-3" /> Invite
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {data && data.totalCases === 0 && (
        <div className="text-center py-16 bg-white rounded-xl shadow-sm border border-gray-200">
          <User className="w-16 h-16 text-gray-300 mx-auto" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No Cases Today</h3>
          <p className="mt-2 text-sm text-gray-500">No surgeries are scheduled for today.</p>
        </div>
      )}

      {/* Hidden Thermal Print Template (80mm width) */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        <div ref={printRef}>
          {printData && (
            <div>
              <div className="header">
                <img src="/logo.png" alt="UNTH Logo" className="logo" />
                <div className="hospital-name">University of Nigeria Teaching Hospital</div>
                <div style={{ fontSize: '10px', color: '#333' }}>Ituku Ozalla, Enugu State</div>
                <div className="subtitle">PATIENT CALL-UP NOTE</div>
              </div>

              <div className="divider" />

              <div className="field">
                <span className="field-label">Patient:</span>
                <span className="field-value">{printData.patientName}</span>
              </div>
              <div className="field">
                <span className="field-label">Folder No:</span>
                <span className="field-value">{printData.folderNumber}</span>
              </div>
              <div className="field">
                <span className="field-label">Age/Gender:</span>
                <span className="field-value">{printData.age}yrs / {printData.gender}</span>
              </div>
              <div className="field">
                <span className="field-label">Ward:</span>
                <span className="field-value">{printData.ward || 'N/A'}</span>
              </div>

              <div className="divider" />

              <div className="field">
                <span className="field-label">Procedure:</span>
                <span className="field-value">{printData.procedureName}</span>
              </div>
              <div className="field">
                <span className="field-label">Diagnosis:</span>
                <span className="field-value">{printData.diagnosis || 'N/A'}</span>
              </div>
              <div className="field">
                <span className="field-label">Unit:</span>
                <span className="field-value">{printData.surgicalUnit || 'N/A'}</span>
              </div>
              <div className="field">
                <span className="field-label">Surgeon:</span>
                <span className="field-value">{printData.surgeonName}</span>
              </div>
              <div className="field">
                <span className="field-label">Sched. Time:</span>
                <span className="field-value">{printData.scheduledTime || 'TBD'}</span>
              </div>

              <div className="divider" />

              <div className="field">
                <span className="field-label">Theatre:</span>
                <span className="field-value" style={{ fontWeight: 'bold' }}>{printData.theatreName}</span>
              </div>
              <div className="field">
                <span className="field-label">Nurse:</span>
                <span className="field-value">{printData.assignedNurseName || 'TBD'}</span>
              </div>
              <div className="field">
                <span className="field-label">Porter:</span>
                <span className="field-value">{printData.assignedPorterName || 'TBD'}</span>
              </div>

              <div className="divider" />

              <div className="field">
                <span className="field-label">Invited At:</span>
                <span className="field-value" style={{ fontWeight: 'bold' }}>
                  {formatDateTime(printData.invitedAt)}
                </span>
              </div>
              <div className="field">
                <span className="field-label">Invited By:</span>
                <span className="field-value">{printData.invitedByName}</span>
              </div>

              {printData.callUpNoteNumber && (
                <div className="note-num">Ref: {printData.callUpNoteNumber}</div>
              )}

              <div className="footer">
                <div>Please present this note at the Theatre Reception</div>
                <div style={{ marginTop: '2px' }}>
                  Printed: {new Date().toLocaleString('en-GB')}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
