'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { 
  AlertTriangle, 
  Calendar, 
  User, 
  Clock, 
  Eye,
  CheckCircle,
  Tv,
  AlertCircle
} from 'lucide-react';
import Link from 'next/link';

interface EmergencyAlert {
  id: string;
  patientName: string;
  age: number;
  gender: string;
  procedureName: string;
  surgeonName: string;
  diagnosis: string;
  priority: 'CRITICAL' | 'URGENT' | 'EMERGENCY';
  estimatedDuration: string;
  bloodType?: string;
  specialRequirements?: string;
  allergies?: string;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'IN_THEATRE' | 'RESOLVED' | 'CANCELLED';
  createdBy: { fullName: string };
  acknowledgedBy?: { fullName: string };
  acknowledgedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export default function EmergencyAlertsPage() {
  const { data: session } = useSession();
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [selectedAlert, setSelectedAlert] = useState<EmergencyAlert | null>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState<EmergencyAlert['status']>('ACKNOWLEDGED');
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchAlerts();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const fetchAlerts = async () => {
    try {
      let url = '/api/emergency-alerts';
      
      if (filter === 'active') {
        url += '?status=ACTIVE,ACKNOWLEDGED,IN_THEATRE';
      }

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setAlerts(data);
      }
    } catch (error) {
      console.error('Error fetching emergency alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!selectedAlert) return;

    setUpdating(true);
    try {
      const response = await fetch(`/api/emergency-alerts/${selectedAlert.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        setShowStatusModal(false);
        setSelectedAlert(null);
        fetchAlerts();
      } else {
        alert('Failed to update status');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      alert('An error occurred');
    } finally {
      setUpdating(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'CRITICAL':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'URGENT':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      default:
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'IN_THEATRE':
        return 'bg-green-100 text-green-800';
      case 'ACKNOWLEDGED':
        return 'bg-blue-100 text-blue-800';
      case 'RESOLVED':
        return 'bg-gray-100 text-gray-800';
      case 'CANCELLED':
        return 'bg-gray-100 text-gray-600';
      default:
        return 'bg-red-100 text-red-800 animate-pulse';
    }
  };

  const getTimeSince = (date: string) => {
    const now = new Date();
    const created = new Date(date);
    const diffMinutes = Math.floor((now.getTime() - created.getTime()) / (1000 * 60));
    
    if (diffMinutes < 60) {
      return `${diffMinutes} minutes ago`;
    } else {
      const hours = Math.floor(diffMinutes / 60);
      const minutes = diffMinutes % 60;
      return `${hours}h ${minutes}m ago`;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="h-8 w-8 text-red-600" />
              Emergency Surgery Alerts
            </h1>
            <p className="text-gray-600 mt-2">
              Manage and monitor emergency surgical cases
            </p>
          </div>
          <Link
            href="/dashboard/emergency-alerts/display"
            target="_blank"
            className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 flex items-center gap-2"
          >
            <Tv className="h-5 w-5" />
            Open TV Display
          </Link>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white rounded-lg shadow-sm mb-6">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setFilter('active')}
            className={`px-6 py-3 font-medium ${
              filter === 'active'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Active Alerts
              <span className="bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded-full">
                {alerts.filter(a => ['ACTIVE', 'ACKNOWLEDGED', 'IN_THEATRE'].includes(a.status)).length}
              </span>
            </div>
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-6 py-3 font-medium ${
              filter === 'all'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            All Alerts
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active</p>
              <p className="text-2xl font-bold text-red-600">
                {alerts.filter(a => a.status === 'ACTIVE').length}
              </p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-600 animate-pulse" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Acknowledged</p>
              <p className="text-2xl font-bold text-blue-600">
                {alerts.filter(a => a.status === 'ACKNOWLEDGED').length}
              </p>
            </div>
            <Eye className="h-8 w-8 text-blue-600" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">In Theatre</p>
              <p className="text-2xl font-bold text-green-600">
                {alerts.filter(a => a.status === 'IN_THEATRE').length}
              </p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Critical</p>
              <p className="text-2xl font-bold text-red-700">
                {alerts.filter(a => a.priority === 'CRITICAL').length}
              </p>
            </div>
            <AlertCircle className="h-8 w-8 text-red-700" />
          </div>
        </div>
      </div>

      {/* Alerts List */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : alerts.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <AlertTriangle className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No emergency alerts</h3>
          <p className="text-gray-600">
            {filter === 'active' 
              ? 'No active emergency alerts at this time'
              : 'No emergency alerts found'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div 
              key={alert.id} 
              className={`bg-white rounded-lg shadow-sm overflow-hidden border-l-4 ${
                alert.priority === 'CRITICAL' ? 'border-l-red-600' :
                alert.priority === 'URGENT' ? 'border-l-orange-600' :
                'border-l-yellow-600'
              }`}
            >
              <div className="p-6">
                {/* Header */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {alert.patientName}
                      </h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getPriorityColor(alert.priority)}`}>
                        {alert.priority}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(alert.status)}`}>
                        {alert.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span>{alert.age} years • {alert.gender}</span>
                      {alert.bloodType && (
                        <span className="text-red-600 font-medium">Blood Type: {alert.bloodType}</span>
                      )}
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        <span>{getTimeSince(alert.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedAlert(alert);
                      setNewStatus(alert.status);
                      setShowStatusModal(true);
                    }}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                  >
                    Update Status
                  </button>
                </div>

                {/* Procedure & Surgeon */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-sm text-gray-600">Procedure</p>
                    <p className="font-medium text-gray-900">{alert.procedureName}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3">
                    <p className="text-sm text-gray-600 flex items-center gap-1">
                      <User className="h-4 w-4" />
                      Surgeon
                    </p>
                    <p className="font-medium text-gray-900">{alert.surgeonName}</p>
                  </div>
                </div>

                {/* Diagnosis */}
                <div className="bg-yellow-50 rounded-lg p-3 mb-4">
                  <p className="text-sm text-gray-600 font-medium">Diagnosis</p>
                  <p className="text-gray-900">{alert.diagnosis}</p>
                </div>

                {/* Allergies Alert */}
                {alert.allergies && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-red-900">Allergy Alert</p>
                        <p className="text-sm text-red-800">{alert.allergies}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Special Requirements */}
                {alert.specialRequirements && (
                  <div className="bg-purple-50 rounded-lg p-3 mb-4">
                    <p className="text-sm text-gray-600 font-medium">Special Requirements</p>
                    <p className="text-gray-900">{alert.specialRequirements}</p>
                  </div>
                )}

                {/* Footer */}
                <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between text-sm text-gray-600">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <User className="h-4 w-4" />
                      <span>Created by: {alert.createdBy.fullName}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      <span>Duration: {alert.estimatedDuration}</span>
                    </div>
                  </div>
                  {alert.acknowledgedBy && (
                    <div className="text-blue-600">
                      Acknowledged by {alert.acknowledgedBy.fullName}
                      {alert.acknowledgedAt && ` at ${new Date(alert.acknowledgedAt).toLocaleTimeString()}`}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Status Update Modal */}
      {showStatusModal && selectedAlert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Update Alert Status</h3>
            <p className="text-gray-600 mb-4">
              Update status for {selectedAlert.patientName}&apos;s emergency alert
            </p>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Status
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as EmergencyAlert['status'])}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="ACTIVE">Active</option>
                <option value="ACKNOWLEDGED">Acknowledged</option>
                <option value="IN_THEATRE">In Theatre</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowStatusModal(false);
                  setSelectedAlert(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={updating}
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateStatus}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
                disabled={updating}
              >
                {updating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Updating...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-5 w-5" />
                    Update Status
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
