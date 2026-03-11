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
} from 'lucide-react';

interface Tip {
  id: string;
  category: string;
  priority: string;
  status: string;
  location: string;
  dateObserved: string;
  description: string;
  frequencyOfOccurrence: string | null;
  suggestedAction: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  mediaLocation: string | null;
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
  MISCONDUCT: '🚫 Misconduct',
  DAMAGE: '🔨 Damage',
  LIGHTS_AC_LEFT_ON: '💡 Lights/AC Left On',
  WASTE_OF_RESOURCES: '♻️ Waste of Resources',
  POLICY_VIOLATION: '📋 Policy Violation',
  UNSAFE_PRACTICE: '⚠️ Unsafe Practice',
  HARASSMENT: '🛑 Harassment',
  NEGLIGENCE: '😤 Negligence',
  OTHER: '📝 Other',
};

export default function AnonymousTipsViewPage() {
  const router = useRouter();
  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTip, setSelectedTip] = useState<Tip | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [updating, setUpdating] = useState(false);

  const fetchTips = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/anonymous-tips');
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setError('Access denied. Admin privileges required.');
          return;
        }
        throw new Error('Failed to fetch');
      }
      const data = await res.json();
      setTips(data);
    } catch {
      setError('Failed to load reports.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTips(); }, [fetchTips]);

  const handleUpdate = async () => {
    if (!selectedTip) return;
    setUpdating(true);
    try {
      const res = await fetch('/api/anonymous-tips', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedTip.id,
          status: newStatus || selectedTip.status,
          adminNotes,
          actionTaken,
        }),
      });
      if (res.ok) {
        setSelectedTip(null);
        fetchTips();
      }
    } catch {
      // silent fail
    } finally {
      setUpdating(false);
    }
  };

  const filtered = tips.filter((t) => {
    if (filterStatus !== 'ALL' && t.status !== filterStatus) return false;
    if (filterCategory !== 'ALL' && t.category !== filterCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return t.description.toLowerCase().includes(q) || t.location.toLowerCase().includes(q);
    }
    return true;
  });

  const stats = {
    total: tips.length,
    new: tips.filter(t => t.status === 'NEW').length,
    investigating: tips.filter(t => ['UNDER_REVIEW', 'INVESTIGATING'].includes(t.status)).length,
    resolved: tips.filter(t => t.status === 'RESOLVED').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading anonymous reports...</p>
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
          <h1 className="text-2xl font-bold text-gray-900">Anonymous Incident Reports</h1>
          <p className="text-sm text-gray-500">Review and manage anonymous reports from staff</p>
        </div>
        <button onClick={fetchTips} className="btn-secondary flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Privacy Note */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2">
        <EyeOff className="w-4 h-4 text-amber-600" />
        <span className="text-sm text-amber-700">These reports are anonymous. No reporter identity information is stored or available.</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-xs text-gray-500">Total Reports</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{stats.new}</p>
          <p className="text-xs text-blue-600">New</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-orange-600">{stats.investigating}</p>
          <p className="text-xs text-orange-600">Under Review</p>
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
          {filtered.map((tip) => (
            <div
              key={tip.id}
              className="bg-white border rounded-xl p-5 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => {
                setSelectedTip(tip);
                setAdminNotes(tip.adminNotes || '');
                setActionTaken(tip.actionTaken || '');
                setNewStatus(tip.status);
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-sm font-semibold">{CATEGORY_LABELS[tip.category] || tip.category}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[tip.priority]}`}>{tip.priority}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[tip.status]}`}>{tip.status.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="text-sm text-gray-700 line-clamp-2">{tip.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    <span>📍 {tip.location}</span>
                    <span>🕐 {new Date(tip.dateObserved).toLocaleString()}</span>
                    {tip.frequencyOfOccurrence && <span>🔄 {tip.frequencyOfOccurrence}</span>}
                    {tip.mediaUrl && <span>{tip.mediaType === 'image' ? '📷' : '🎥'} Media attached</span>}
                  </div>
                </div>
                <Eye className="w-5 h-5 text-gray-400 flex-shrink-0" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedTip && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedTip(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Report Details</h2>
              <button onClick={() => setSelectedTip(null)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">✕</button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">{CATEGORY_LABELS[selectedTip.category]}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[selectedTip.priority]}`}>{selectedTip.priority}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[selectedTip.status]}`}>{selectedTip.status.replace(/_/g, ' ')}</span>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div><span className="text-xs font-semibold text-gray-500">Location:</span> <span className="text-sm">{selectedTip.location}</span></div>
              <div><span className="text-xs font-semibold text-gray-500">Observed:</span> <span className="text-sm">{new Date(selectedTip.dateObserved).toLocaleString()}</span></div>
              <div><span className="text-xs font-semibold text-gray-500">Submitted:</span> <span className="text-sm">{new Date(selectedTip.createdAt).toLocaleString()}</span></div>
              {selectedTip.frequencyOfOccurrence && (
                <div><span className="text-xs font-semibold text-gray-500">Frequency:</span> <span className="text-sm">{selectedTip.frequencyOfOccurrence}</span></div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Description</h3>
              <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg whitespace-pre-wrap">{selectedTip.description}</p>
            </div>

            {selectedTip.suggestedAction && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Reporter&apos;s Suggested Action</h3>
                <p className="text-sm text-gray-700 bg-blue-50 p-3 rounded-lg">{selectedTip.suggestedAction}</p>
              </div>
            )}

            {/* Media Evidence */}
            {selectedTip.mediaUrl && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  {selectedTip.mediaType === 'image' ? '📷' : '🎥'} Attached Evidence
                </h3>
                <div className="border rounded-xl overflow-hidden bg-gray-50">
                  {selectedTip.mediaType === 'image' ? (
                    <img src={selectedTip.mediaUrl} alt="Report evidence" className="w-full max-h-80 object-contain" />
                  ) : (
                    <video src={selectedTip.mediaUrl} controls className="w-full max-h-80" />
                  )}
                  {selectedTip.mediaLocation && (
                    <div className="p-3 bg-gray-100 border-t">
                      <span className="text-xs text-gray-500 font-semibold">📍 Location of media:</span>
                      <span className="text-sm text-gray-700 ml-1">{selectedTip.mediaLocation}</span>
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
              <button onClick={() => setSelectedTip(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
