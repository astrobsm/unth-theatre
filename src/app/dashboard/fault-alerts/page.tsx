'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, CheckCircle, Clock, Filter, Search, X, MessageSquare, User
} from 'lucide-react';
import SmartTextInput from '@/components/SmartTextInput';

interface FaultAlert {
  id: string;
  itemName: string;
  faultDescription: string;
  severity: string;
  priority: string;
  status: string;
  reportedBy: string;
  reportedById: string;
  checkoutId: string;
  theatreId?: string;
  shift?: string;
  managerNotified: boolean;
  chairmanNotified: boolean;
  escalatedToChairman: boolean;
  requiresImmediateAction: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNotes?: string;
  createdAt: string;
  checkout?: {
    theatreId: string;
    shift: string;
    date: string;
  };
}

export default function FaultAlertsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  
  const [alerts, setAlerts] = useState<FaultAlert[]>([]);
  const [filteredAlerts, setFilteredAlerts] = useState<FaultAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  
  const [selectedAlert, setSelectedAlert] = useState<FaultAlert | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (session?.user.role !== 'THEATRE_MANAGER' && session?.user.role !== 'THEATRE_CHAIRMAN' && session?.user.role !== 'ADMIN') {
      router.push('/dashboard');
      return;
    }
    fetchAlerts();
    // Auto-refresh every 30 seconds for equipment fault monitoring
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    applyFilters();
  }, [alerts, statusFilter, severityFilter, searchTerm]);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/fault-alerts');
      if (response.ok) {
        const data = await response.json();
        setAlerts(data.alerts);
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
      setMessage('✗ Failed to load fault alerts');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...alerts];

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(alert => alert.status === statusFilter);
    }

    // Severity filter
    if (severityFilter !== 'all') {
      filtered = filtered.filter(alert => alert.severity === severityFilter);
    }

    // Search
    if (searchTerm) {
      filtered = filtered.filter(alert =>
        alert.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        alert.faultDescription.toLowerCase().includes(searchTerm.toLowerCase()) ||
        alert.reportedBy.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredAlerts(filtered);
  };

  const handleAcknowledge = async (alertId: string) => {
    setActionLoading(true);
    setMessage('');

    try {
      const response = await fetch(`/api/fault-alerts/${alertId}/acknowledge`, {
        method: 'POST',
      });

      if (response.ok) {
        setMessage('✓ Alert acknowledged successfully');
        fetchAlerts();
        setSelectedAlert(null);
      } else {
        const data = await response.json();
        setMessage(`✗ ${data.error}`);
      }
    } catch (error) {
      setMessage('✗ Failed to acknowledge alert');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAlert) return;

    setActionLoading(true);
    setMessage('');

    try {
      const response = await fetch(`/api/fault-alerts/${selectedAlert.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutionNotes }),
      });

      if (response.ok) {
        setMessage('✓ Alert resolved successfully');
        fetchAlerts();
        setSelectedAlert(null);
        setResolutionNotes('');
      } else {
        const data = await response.json();
        setMessage(`✗ ${data.error}`);
      }
    } catch (error) {
      setMessage('✗ Failed to resolve alert');
    } finally {
      setActionLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'bg-red-100 text-red-800 border-red-300';
      case 'HIGH': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'LOW': return 'bg-blue-100 text-blue-800 border-blue-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'bg-red-100 text-red-800';
      case 'ACKNOWLEDGED': return 'bg-yellow-100 text-yellow-800';
      case 'IN_PROGRESS': return 'bg-blue-100 text-blue-800';
      case 'RESOLVED': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const pendingAlerts = alerts.filter(a => a.status === 'REPORTED').length;
  const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL' && a.status !== 'RESOLVED').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Equipment Fault Alerts</h1>
          <p className="text-gray-600 mt-1">Monitor and manage faulty equipment reports</p>
        </div>
        <div className="flex gap-4">
          {criticalAlerts > 0 && (
            <div className="flex items-center gap-2 bg-red-50 border-2 border-red-300 px-4 py-2 rounded-lg animate-pulse">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span className="text-sm font-bold text-red-900">
                {criticalAlerts} CRITICAL
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 bg-yellow-50 px-4 py-2 rounded-lg">
            <Clock className="w-5 h-5 text-yellow-600" />
            <span className="text-sm font-medium text-yellow-900">
              {pendingAlerts} Pending
            </span>
          </div>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${message.includes('✓') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message}
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search alerts..."
              className="input-field pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-field"
          >
            <option value="all">All Statuses</option>
            <option value="REPORTED">Reported</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="input-field"
          >
            <option value="all">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          <button
            onClick={() => {
              setStatusFilter('all');
              setSeverityFilter('all');
              setSearchTerm('');
            }}
            className="btn-secondary flex items-center justify-center gap-2"
          >
            <X className="w-4 h-4" />
            Clear Filters
          </button>
        </div>
      </div>

      {/* Alerts List */}
      {loading ? (
        <div className="card text-center py-12">
          <p className="text-gray-600">Loading fault alerts...</p>
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="card text-center py-12">
          <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
          <p className="text-gray-600">
            {alerts.length === 0 ? 'No fault alerts reported' : 'No alerts match your filters'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAlerts.map(alert => (
            <div
              key={alert.id}
              className={`card border-l-4 ${
                alert.severity === 'CRITICAL' ? 'border-red-500 bg-red-50' :
                alert.severity === 'HIGH' ? 'border-orange-500' :
                alert.severity === 'MEDIUM' ? 'border-yellow-500' :
                'border-blue-500'
              }`}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {alert.requiresImmediateAction && (
                      <span className="bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold animate-pulse">
                        🚨 RED ALERT
                      </span>
                    )}
                    <h3 className="text-xl font-bold text-gray-900">{alert.itemName}</h3>
                  </div>
                  
                  <p className="text-gray-700 mb-3">{alert.faultDescription}</p>

                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getSeverityColor(alert.severity)}`}>
                      {alert.severity} Severity
                    </span>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(alert.status)}`}>
                      {alert.status}
                    </span>
                    <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
                      {alert.priority} Priority
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Reported by:</span>
                      <p className="font-medium">{alert.reportedBy}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Reported:</span>
                      <p className="font-medium">{new Date(alert.createdAt).toLocaleString()}</p>
                    </div>
                    {alert.checkout && (
                      <>
                        <div>
                          <span className="text-gray-600">Theatre:</span>
                          <p className="font-medium">{alert.checkout.theatreId}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Shift:</span>
                          <p className="font-medium">{alert.checkout.shift}</p>
                        </div>
                      </>
                    )}
                  </div>

                  {alert.acknowledgedAt && (
                    <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                      <p className="text-sm text-yellow-900">
                        <strong>Acknowledged:</strong> {new Date(alert.acknowledgedAt).toLocaleString()}
                        {alert.acknowledgedBy && ` by ${alert.acknowledgedBy}`}
                      </p>
                    </div>
                  )}

                  {alert.resolvedAt && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded">
                      <p className="text-sm text-green-900">
                        <strong>Resolved:</strong> {new Date(alert.resolvedAt).toLocaleString()}
                        {alert.resolvedBy && ` by ${alert.resolvedBy}`}
                      </p>
                      {alert.resolutionNotes && (
                        <p className="text-sm text-green-800 mt-2">
                          <strong>Notes:</strong> {alert.resolutionNotes}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 ml-4">
                  {alert.status === 'REPORTED' && (
                    <button
                      onClick={() => handleAcknowledge(alert.id)}
                      disabled={actionLoading}
                      className="btn-secondary whitespace-nowrap"
                    >
                      Acknowledge
                    </button>
                  )}
                  {alert.status !== 'RESOLVED' && (
                    <button
                      onClick={() => setSelectedAlert(alert)}
                      className="btn-primary whitespace-nowrap"
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </div>

              {alert.managerNotified && alert.chairmanNotified && (
                <div className="flex gap-2 text-xs text-gray-600 border-t pt-3 mt-3">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>Manager and Chairman notified</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Resolution Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold">Resolve Fault Alert</h2>
                  <p className="text-gray-600 mt-1">{selectedAlert.itemName}</p>
                </div>
                <button
                  onClick={() => setSelectedAlert(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <p className="text-sm text-gray-600 mb-2"><strong>Fault Description:</strong></p>
                <p className="text-gray-900">{selectedAlert.faultDescription}</p>
                
                <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                  <div>
                    <span className="text-gray-600">Severity:</span>
                    <p className="font-medium">{selectedAlert.severity}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Reported by:</span>
                    <p className="font-medium">{selectedAlert.reportedBy}</p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleResolve} className="space-y-4">
                <SmartTextInput
                  label="Resolution Notes *"
                  required={true}
                  value={resolutionNotes}
                  onChange={setResolutionNotes}
                  rows={5}
                  placeholder="Describe how the fault was resolved, what actions were taken, etc... 🎤 Dictate"
                  enableSpeech={true}
                  enableOCR={true}
                  medicalMode={true}
                />
                <p className="text-sm text-gray-600 -mt-2">
                  Provide detailed information about the resolution for audit purposes.
                </p>

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="btn-primary flex-1"
                  >
                    {actionLoading ? 'Resolving...' : 'Mark as Resolved'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedAlert(null)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
