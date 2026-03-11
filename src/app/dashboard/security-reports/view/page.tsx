'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle,
  Clock,
  Search,
  Filter,
  MessageSquare,
  RefreshCw,
  Shield,
  Siren,
} from 'lucide-react';

interface Report {
  id: string;
  category: string;
  priority: string;
  status: string;
  location: string;
  dateObserved: string;
  description: string;
  suspectDescription: string | null;
  personsInvolved: string | null;
  evidenceDescription: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  mediaLocation: string | null;
  isOngoing: boolean;
  immediateRiskToLife: boolean;
  adminNotes: string | null;
  actionTaken: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-700',
  UNDER_REVIEW: 'bg-yellow-100 text-yellow-700',
  INVESTIGATING: 'bg-orange-100 text-orange-700',
  ACTION_TAKEN: 'bg-purple-100 text-purple-700',
  RESOLVED: 'bg-green-100 text-green-700',
  DISMISSED: 'bg-gray-100 text-gray-700',
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
};

const CATEGORY_LABELS: Record<string, string> = {
  THEFT: '🔓 Theft',
  SUSPICIOUS_ACTIVITY: '👁️ Suspicious Activity',
  UNAUTHORIZED_ACCESS: '🚪 Unauthorized Access',
  VANDALISM: '💥 Vandalism',
  THREATENING_BEHAVIOR: '😡 Threatening Behavior',
  MISSING_EQUIPMENT: '🔍 Missing Equipment',
  DRUG_DIVERSION: '💊 Drug Diversion',
  TRESPASSING: '🚷 Trespassing',
  OTHER: '📝 Other',
};

export default function SecurityReportsViewPage() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [updating, setUpdating] = useState(false);

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/security-reports');
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setError('Access denied. Admin privileges required.');
          return;
        }
        throw new Error('Failed to fetch');
      }
      const data = await res.json();
      setReports(data);
    } catch {
      setError('Failed to load security reports.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleUpdate = async () => {
    if (!selectedReport) return;
    setUpdating(true);
    try {
      const res = await fetch('/api/security-reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedReport.id,
          status: newStatus || selectedReport.status,
          adminNotes,
          actionTaken,
        }),
      });
      if (res.ok) {
        setSelectedReport(null);
        fetchReports();
      }
    } catch {
      // silent fail
    } finally {
      setUpdating(false);
    }
  };

  const filtered = reports.filter((r) => {
    if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;
    if (filterCategory !== 'ALL' && r.category !== filterCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return r.description.toLowerCase().includes(q) || r.location.toLowerCase().includes(q);
    }
    return true;
  });

  const stats = {
    total: reports.length,
    new: reports.filter(r => r.status === 'NEW').length,
    investigating: reports.filter(r => ['UNDER_REVIEW', 'INVESTIGATING'].includes(r.status)).length,
    resolved: reports.filter(r => r.status === 'RESOLVED').length,
    urgent: reports.filter(r => r.isOngoing || r.immediateRiskToLife).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading security reports...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <Shield className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Access Restricted</h2>
        <p className="text-gray-600">{error}</p>
        <button onClick={() => router.push('/dashboard')} className="btn-primary mt-4">Back to Dashboard</button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Security Reports Review</h1>
          <p className="text-sm text-gray-500">Review and manage anonymous security reports</p>
        </div>
        <button onClick={fetchReports} className="btn-secondary flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Privacy Note */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2">
        <EyeOff className="w-4 h-4 text-amber-600" />
        <span className="text-sm text-amber-700">These reports are anonymous. No reporter identity information is stored or available.</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
        <div className="bg-white border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-xs text-gray-500">Total</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{stats.new}</p>
          <p className="text-xs text-blue-600">New</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-orange-600">{stats.investigating}</p>
          <p className="text-xs text-orange-600">Under Review</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{stats.urgent}</p>
          <p className="text-xs text-red-600">Urgent</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{stats.resolved}</p>
          <p className="text-xs text-green-600">Resolved</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search reports..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field w-full pl-10"
          />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input-field">
          <option value="ALL">All Statuses</option>
          <option value="NEW">New</option>
          <option value="UNDER_REVIEW">Under Review</option>
          <option value="INVESTIGATING">Investigating</option>
          <option value="ACTION_TAKEN">Action Taken</option>
          <option value="RESOLVED">Resolved</option>
          <option value="DISMISSED">Dismissed</option>
        </select>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="input-field">
          <option value="ALL">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Reports List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Filter className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No reports found matching your filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((report) => (
            <div
              key={report.id}
              className={`bg-white border rounded-xl p-5 hover:shadow-md transition-shadow cursor-pointer ${report.immediateRiskToLife ? 'border-red-400 ring-2 ring-red-200' : report.isOngoing ? 'border-orange-300' : ''}`}
              onClick={() => {
                setSelectedReport(report);
                setAdminNotes(report.adminNotes || '');
                setActionTaken(report.actionTaken || '');
                setNewStatus(report.status);
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-sm font-semibold">{CATEGORY_LABELS[report.category] || report.category}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[report.priority]}`}>{report.priority}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[report.status]}`}>{report.status.replace(/_/g, ' ')}</span>
                    {report.isOngoing && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500 text-white animate-pulse">ONGOING</span>}
                    {report.immediateRiskToLife && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-600 text-white animate-pulse">⚠️ DANGER</span>}
                    {report.mediaUrl && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">{report.mediaType === 'image' ? '📷' : '🎥'} Media</span>}
                  </div>
                  <p className="text-sm text-gray-700 line-clamp-2">{report.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    <span>📍 {report.location}</span>
                    <span>🕐 {new Date(report.dateObserved).toLocaleString()}</span>
                  </div>
                </div>
                <Eye className="w-5 h-5 text-gray-400 flex-shrink-0" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedReport(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Security Report Details</h2>
              <button onClick={() => setSelectedReport(null)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">✕</button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">{CATEGORY_LABELS[selectedReport.category]}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[selectedReport.priority]}`}>{selectedReport.priority}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[selectedReport.status]}`}>{selectedReport.status.replace(/_/g, ' ')}</span>
              {selectedReport.isOngoing && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500 text-white">ONGOING</span>}
              {selectedReport.immediateRiskToLife && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-600 text-white">⚠️ DANGER</span>}
            </div>

            {selectedReport.immediateRiskToLife && (
              <div className="bg-red-100 border border-red-300 rounded-lg p-3 flex items-center gap-2">
                <Siren className="w-5 h-5 text-red-600" />
                <span className="text-sm text-red-800 font-semibold">This report indicates immediate risk to life. Urgent action required.</span>
              </div>
            )}

            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div><span className="text-xs font-semibold text-gray-500">Location:</span> <span className="text-sm">{selectedReport.location}</span></div>
              <div><span className="text-xs font-semibold text-gray-500">Observed:</span> <span className="text-sm">{new Date(selectedReport.dateObserved).toLocaleString()}</span></div>
              <div><span className="text-xs font-semibold text-gray-500">Submitted:</span> <span className="text-sm">{new Date(selectedReport.createdAt).toLocaleString()}</span></div>
              <div><span className="text-xs font-semibold text-gray-500">Ongoing:</span> <span className="text-sm">{selectedReport.isOngoing ? 'Yes' : 'No'}</span></div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Description</h3>
              <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg whitespace-pre-wrap">{selectedReport.description}</p>
            </div>

            {selectedReport.suspectDescription && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Suspect Description</h3>
                <p className="text-sm text-gray-700 bg-yellow-50 p-3 rounded-lg">{selectedReport.suspectDescription}</p>
              </div>
            )}

            {selectedReport.personsInvolved && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Persons Involved</h3>
                <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">{selectedReport.personsInvolved}</p>
              </div>
            )}

            {selectedReport.evidenceDescription && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Evidence Description</h3>
                <p className="text-sm text-gray-700 bg-blue-50 p-3 rounded-lg">{selectedReport.evidenceDescription}</p>
              </div>
            )}

            {/* Media Evidence */}
            {selectedReport.mediaUrl && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  {selectedReport.mediaType === 'image' ? '📷' : '🎥'} Attached Evidence
                </h3>
                <div className="border rounded-xl overflow-hidden bg-gray-50">
                  {selectedReport.mediaType === 'image' ? (
                    <img src={selectedReport.mediaUrl} alt="Report evidence" className="w-full max-h-80 object-contain" />
                  ) : (
                    <video src={selectedReport.mediaUrl} controls className="w-full max-h-80" />
                  )}
                  {selectedReport.mediaLocation && (
                    <div className="p-3 bg-gray-100 border-t">
                      <span className="text-xs text-gray-500 font-semibold">📍 Location of media:</span>
                      <span className="text-sm text-gray-700 ml-1">{selectedReport.mediaLocation}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <hr />

            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Admin Response
            </h3>

            <div>
              <label className="text-xs font-semibold text-gray-500">Update Status</label>
              <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="input-field w-full mt-1">
                <option value="NEW">New</option>
                <option value="UNDER_REVIEW">Under Review</option>
                <option value="INVESTIGATING">Investigating</option>
                <option value="ACTION_TAKEN">Action Taken</option>
                <option value="RESOLVED">Resolved</option>
                <option value="DISMISSED">Dismissed</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500">Admin Notes</label>
              <textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} className="input-field w-full h-20 mt-1" placeholder="Internal notes about this report..." />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500">Action Taken</label>
              <textarea value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} className="input-field w-full h-20 mt-1" placeholder="Describe actions taken in response to this report..." />
            </div>

            <div className="flex gap-3">
              <button onClick={handleUpdate} disabled={updating} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {updating ? <Clock className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {updating ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setSelectedReport(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
