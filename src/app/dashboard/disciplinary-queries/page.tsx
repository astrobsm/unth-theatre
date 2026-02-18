'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  FileWarning, RefreshCw, Clock, CheckCircle, AlertTriangle, XCircle,
  ArrowUpCircle, User, Building2, MessageSquare, Filter
} from 'lucide-react';

interface DisciplinaryQuery {
  id: string;
  referenceNumber: string;
  recipientId: string;
  recipientName: string;
  recipientRole: string;
  recipientUnit: string;
  queryType: string;
  subject: string;
  description: string;
  deadlineTime: string;
  deadlineType: string;
  evidence?: string;
  status: string;
  recipientResponse?: string;
  respondedAt?: string;
  escalatedTo?: string;
  escalatedAt?: string;
  escalationReason?: string;
  resolvedAt?: string;
  resolution?: string;
  issuedByName: string;
  issuedByTitle: string;
  createdAt: string;
  recipient?: { fullName: string; role: string; phoneNumber?: string };
  issuedBy?: { fullName: string; role: string };
}

const statusColors: Record<string, string> = {
  ISSUED: 'bg-red-100 text-red-800 border-red-300',
  ACKNOWLEDGED: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  RESPONDED: 'bg-blue-100 text-blue-800 border-blue-300',
  ESCALATED: 'bg-purple-100 text-purple-800 border-purple-300',
  RESOLVED: 'bg-green-100 text-green-800 border-green-300',
  DISMISSED: 'bg-gray-100 text-gray-600 border-gray-300',
};

const typeLabels: Record<string, string> = {
  READINESS_LATE: 'Readiness Late',
  THEATRE_SETUP_LATE: 'Theatre Setup Late',
  DUTY_ABANDONMENT: 'Duty Abandonment',
  PROTOCOL_VIOLATION: 'Protocol Violation',
  OTHER: 'Other',
};

export default function DisciplinaryQueriesPage() {
  const { data: session } = useSession();
  const [queries, setQueries] = useState<DisciplinaryQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [unitFilter, setUnitFilter] = useState<string>('');
  const [selectedQuery, setSelectedQuery] = useState<DisciplinaryQuery | null>(null);
  const [responseText, setResponseText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isAdmin = session?.user?.role && [
    'ADMIN', 'SYSTEM_ADMINISTRATOR', 'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC', 'THEATRE_MANAGER'
  ].includes(session.user.role);

  const fetchQueries = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter) params.set('status', filter);
      if (unitFilter) params.set('unit', unitFilter);
      const res = await fetch(`/api/disciplinary-queries?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setQueries(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error fetching queries:', error);
    } finally {
      setLoading(false);
    }
  }, [filter, unitFilter]);

  useEffect(() => {
    fetchQueries();
    const interval = setInterval(fetchQueries, 60000);
    return () => clearInterval(interval);
  }, [fetchQueries]);

  const handleAction = async (queryId: string, action: string) => {
    if (action === 'respond' && !responseText.trim()) {
      setMessage({ type: 'error', text: 'Please enter your response' });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/disciplinary-queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queryId, action, response: responseText }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: `Query ${action}d successfully` });
        setResponseText('');
        setSelectedQuery(null);
        await fetchQueries();
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.error || 'Action failed' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setSubmitting(false);
    }
  };

  const activeQueries = queries.filter(q => ['ISSUED', 'ACKNOWLEDGED', 'ESCALATED'].includes(q.status));
  const respondedQueries = queries.filter(q => q.status === 'RESPONDED');
  const closedQueries = queries.filter(q => ['RESOLVED', 'DISMISSED'].includes(q.status));

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading disciplinary queries...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileWarning className="h-7 w-7 text-red-600" />
            Disciplinary Queries
          </h1>
          <p className="text-gray-600 mt-1">
            {isAdmin ? 'Manage all disciplinary queries and responses' : 'View and respond to your disciplinary queries'}
          </p>
          <p className="text-xs text-gray-500 mt-1 italic">
            Issued by: Office of the Chief Medical Director, University of Nigeria Teaching Hospital, Ituku Ozalla
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchQueries(); }}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${
          message.type === 'success' ? 'bg-green-50 border border-green-300 text-green-800' : 'bg-red-50 border border-red-300 text-red-800'
        }`}>
          {message.type === 'success' ? <CheckCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          <span className="text-sm">{message.text}</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-1 text-sm text-gray-600"><Filter className="h-4 w-4" /> Status:</div>
        {['', 'ISSUED', 'RESPONDED', 'ESCALATED', 'RESOLVED', 'DISMISSED'].map(s => (
          <button
            key={s}
            onClick={() => { setFilter(s); setLoading(true); }}
            className={`px-3 py-1 rounded-full text-xs font-medium border ${
              filter === s ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>
      {isAdmin && (
        <div className="flex gap-2 mb-6 flex-wrap">
          <div className="flex items-center gap-1 text-sm text-gray-600"><Building2 className="h-4 w-4" /> Unit:</div>
          {['', 'CSSD', 'LAUNDRY', 'POWER_HOUSE', 'OXYGEN', 'THEATRE'].map(u => (
            <button
              key={u}
              onClick={() => { setUnitFilter(u); setLoading(true); }}
              className={`px-3 py-1 rounded-full text-xs font-medium border ${
                unitFilter === u ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {u ? u.replace(/_/g, ' ') : 'All'}
            </button>
          ))}
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-red-50 rounded-lg p-4 text-center border border-red-200">
          <p className="text-2xl font-bold text-red-700">{activeQueries.length}</p>
          <p className="text-xs text-red-600">Active / Pending</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-4 text-center border border-blue-200">
          <p className="text-2xl font-bold text-blue-700">{respondedQueries.length}</p>
          <p className="text-xs text-blue-600">Responded</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4 text-center border border-purple-200">
          <p className="text-2xl font-bold text-purple-700">{queries.filter(q => q.status === 'ESCALATED').length}</p>
          <p className="text-xs text-purple-600">Escalated to CMD</p>
        </div>
        <div className="bg-green-50 rounded-lg p-4 text-center border border-green-200">
          <p className="text-2xl font-bold text-green-700">{closedQueries.length}</p>
          <p className="text-xs text-green-600">Resolved / Dismissed</p>
        </div>
      </div>

      {/* Selected Query Detail Modal */}
      {selectedQuery && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Query: {selectedQuery.referenceNumber}</h2>
                  <span className={`inline-block px-2 py-1 rounded text-xs font-bold border mt-1 ${statusColors[selectedQuery.status] || ''}`}>
                    {selectedQuery.status}
                  </span>
                </div>
                <button onClick={() => { setSelectedQuery(null); setResponseText(''); }} className="text-gray-400 hover:text-gray-600">
                  <XCircle className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p><strong>To:</strong> {selectedQuery.recipientName} ({selectedQuery.recipientRole.replace(/_/g, ' ')})</p>
                  <p><strong>Unit:</strong> {selectedQuery.recipientUnit.replace(/_/g, ' ')}</p>
                  <p><strong>Type:</strong> {typeLabels[selectedQuery.queryType] || selectedQuery.queryType}</p>
                  <p><strong>Issued:</strong> {new Date(selectedQuery.createdAt).toLocaleString()}</p>
                </div>

                <div>
                  <p className="font-semibold text-gray-800 mb-1">Subject:</p>
                  <p className="text-gray-700">{selectedQuery.subject}</p>
                </div>

                <div>
                  <p className="font-semibold text-gray-800 mb-1">Description:</p>
                  <p className="text-gray-700 whitespace-pre-line">{selectedQuery.description}</p>
                </div>

                {selectedQuery.escalatedTo && (
                  <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                    <p className="font-semibold text-purple-800">Escalated to: {selectedQuery.escalatedTo.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-purple-600">
                      At: {selectedQuery.escalatedAt ? new Date(selectedQuery.escalatedAt).toLocaleString() : 'N/A'}
                    </p>
                    {selectedQuery.escalationReason && <p className="text-sm mt-1">{selectedQuery.escalationReason}</p>}
                  </div>
                )}

                {selectedQuery.recipientResponse && (
                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                    <p className="font-semibold text-blue-800">Recipient Response:</p>
                    <p className="text-sm mt-1">{selectedQuery.recipientResponse}</p>
                    <p className="text-xs text-blue-600 mt-1">
                      Responded: {selectedQuery.respondedAt ? new Date(selectedQuery.respondedAt).toLocaleString() : 'N/A'}
                    </p>
                  </div>
                )}

                {selectedQuery.resolution && (
                  <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                    <p className="font-semibold text-green-800">Resolution:</p>
                    <p className="text-sm mt-1">{selectedQuery.resolution}</p>
                    <p className="text-xs text-green-600 mt-1">
                      Resolved: {selectedQuery.resolvedAt ? new Date(selectedQuery.resolvedAt).toLocaleString() : 'N/A'}
                    </p>
                  </div>
                )}

                <div className="border-t pt-3 text-xs text-gray-500 italic">
                  <p>{selectedQuery.issuedByName}</p>
                  <p>{selectedQuery.issuedByTitle}</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 space-y-3">
                {/* Recipient can respond if ISSUED or ESCALATED */}
                {selectedQuery.recipientId === session?.user?.id &&
                  ['ISSUED', 'ESCALATED'].includes(selectedQuery.status) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Your Response:</label>
                    <textarea
                      value={responseText}
                      onChange={(e) => setResponseText(e.target.value)}
                      rows={4}
                      className="w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter your written explanation..."
                    />
                    <button
                      onClick={() => handleAction(selectedQuery.id, 'respond')}
                      disabled={submitting}
                      className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                      Submit Response
                    </button>
                  </div>
                )}

                {/* Admin actions */}
                {isAdmin && selectedQuery.status === 'RESPONDED' && (
                  <div className="flex gap-3 flex-wrap">
                    <button
                      onClick={() => handleAction(selectedQuery.id, 'resolve')}
                      disabled={submitting}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      <CheckCircle className="h-4 w-4" /> Resolve
                    </button>
                    <button
                      onClick={() => handleAction(selectedQuery.id, 'dismiss')}
                      disabled={submitting}
                      className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 flex items-center gap-2"
                    >
                      <XCircle className="h-4 w-4" /> Dismiss
                    </button>
                  </div>
                )}

                {isAdmin && selectedQuery.status === 'ISSUED' && (
                  <div className="flex gap-3 flex-wrap">
                    <button
                      onClick={() => handleAction(selectedQuery.id, 'escalate')}
                      disabled={submitting}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      <ArrowUpCircle className="h-4 w-4" /> Escalate to CMD
                    </button>
                    <button
                      onClick={() => handleAction(selectedQuery.id, 'dismiss')}
                      disabled={submitting}
                      className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 flex items-center gap-2"
                    >
                      <XCircle className="h-4 w-4" /> Dismiss
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Queries */}
      {activeQueries.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-red-700 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Active Queries ({activeQueries.length})
          </h2>
          <div className="space-y-3">
            {activeQueries.map((q) => (
              <div
                key={q.id}
                onClick={() => setSelectedQuery(q)}
                className="bg-white rounded-lg shadow border-l-4 border-l-red-500 p-4 cursor-pointer hover:shadow-md transition"
              >
                <div className="flex flex-col md:flex-row justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-gray-500">{q.referenceNumber}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold border ${statusColors[q.status] || ''}`}>
                        {q.status}
                      </span>
                      {q.escalatedTo && (
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-purple-600 text-white">
                          ESCALATED TO CMD
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900">{q.subject}</h3>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                      <span className="flex items-center gap-1"><User className="h-3 w-3" /> {q.recipientName}</span>
                      <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {q.recipientUnit.replace(/_/g, ' ')}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date(q.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {typeLabels[q.queryType] || q.queryType}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Responded Queries */}
      {respondedQueries.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-blue-700 mb-3 flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Awaiting Review ({respondedQueries.length})
          </h2>
          <div className="space-y-3">
            {respondedQueries.map((q) => (
              <div
                key={q.id}
                onClick={() => setSelectedQuery(q)}
                className="bg-white rounded-lg shadow border-l-4 border-l-blue-500 p-4 cursor-pointer hover:shadow-md transition"
              >
                <div className="flex flex-col md:flex-row justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-gray-500">{q.referenceNumber}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold border ${statusColors[q.status] || ''}`}>
                        RESPONDED
                      </span>
                    </div>
                    <h3 className="font-semibold text-gray-900">{q.subject}</h3>
                    <p className="text-sm text-gray-600 mt-1 truncate max-w-lg">{q.recipientResponse}</p>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                      <span>{q.recipientName}</span>
                      <span>{q.respondedAt ? new Date(q.respondedAt).toLocaleString() : ''}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Closed Queries */}
      {closedQueries.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Closed Queries ({closedQueries.length})</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white rounded-lg shadow">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ref</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recipient</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subject</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {closedQueries.map((q) => (
                  <tr key={q.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedQuery(q)}>
                    <td className="px-4 py-3 text-xs font-mono">{q.referenceNumber}</td>
                    <td className="px-4 py-3 text-sm">{q.recipientName}</td>
                    <td className="px-4 py-3 text-sm truncate max-w-xs">{q.subject}</td>
                    <td className="px-4 py-3 text-sm">{q.recipientUnit.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium border ${statusColors[q.status] || ''}`}>{q.status}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{new Date(q.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {queries.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <FileWarning className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">No disciplinary queries found</p>
          <p className="text-gray-400 text-sm mt-1">Queries are automatically generated when readiness deadlines are missed</p>
        </div>
      )}
    </div>
  );
}
