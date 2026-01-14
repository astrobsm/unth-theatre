'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import SmartTextInput from '@/components/SmartTextInput';

interface Alert {
  id: string;
  alertType: string;
  description: string;
  severity: string;
  triggeredAt: string;
  triggeredBy: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  resolved: boolean;
  resolvedAt?: string;
  resolutionAction?: string;
  assessment?: any;
  pacuAssessment?: any;
}

interface AlertsData {
  holdingAreaAlerts: Alert[];
  pacuAlerts: Alert[];
  totalActive: number;
}

export default function AlertsDashboardPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [alertsData, setAlertsData] = useState<AlertsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active'>('active');
  const [selectedAlert, setSelectedAlert] = useState<{ alert: Alert; type: string } | null>(null);
  const [resolutionAction, setResolutionAction] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');

  useEffect(() => {
    fetchAlerts();
    // Refresh every 30 seconds
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, [filter]);

  const fetchAlerts = async () => {
    try {
      const url = filter === 'active' 
        ? '/api/alerts?active=true'
        : '/api/alerts';
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (data && typeof data === 'object') {
          setAlertsData(data);
        } else {
          console.error('API returned invalid data:', data);
          setAlertsData(null);
        }
      }
    } catch (error) {
      console.error('Error fetching alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const acknowledgeAlert = async (alertId: string, type: string) => {
    try {
      const response = await fetch(`/api/alerts/${type}/${alertId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        fetchAlerts();
      }
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      alert('Failed to acknowledge alert');
    }
  };

  const resolveAlert = async () => {
    if (!selectedAlert || !resolutionAction) {
      alert('Please provide resolution action');
      return;
    }

    try {
      const response = await fetch(
        `/api/alerts/${selectedAlert.type}/${selectedAlert.alert.id}/resolve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resolutionAction, resolutionNotes })
        }
      );
      
      if (response.ok) {
        setSelectedAlert(null);
        setResolutionAction('');
        setResolutionNotes('');
        fetchAlerts();
      }
    } catch (error) {
      console.error('Error resolving alert:', error);
      alert('Failed to resolve alert');
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toUpperCase()) {
      case 'CRITICAL':
        return 'bg-red-600 text-white';
      case 'HIGH':
        return 'bg-red-500 text-white';
      case 'MEDIUM':
        return 'bg-yellow-500 text-white';
      case 'LOW':
        return 'bg-blue-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const getAlertTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      IDENTITY_MISMATCH: '👤',
      WRONG_SITE: '⚠️',
      CONSENT_ISSUE: '📋',
      ALLERGY_CONCERN: '🏥',
      FASTING_VIOLATION: '🍽️',
      ABNORMAL_VITALS: '💓',
      MISSING_RESULTS: '📊',
      MEDICATION_ERROR: '💊',
      COUNT_DISCREPANCY: '🔢',
      POSTOP_COMPLICATION: '🚑'
    };
    return icons[type] || '🚨';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading alerts...</div>
      </div>
    );
  }

  const allAlerts = [
    ...(alertsData?.holdingAreaAlerts.map(a => ({ ...a, source: 'holding', type: 'holding' })) || []),
    ...(alertsData?.pacuAlerts.map(a => ({ ...a, source: 'pacu', type: 'pacu' })) || [])
  ].sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime());

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Red Alerts Dashboard
        </h1>
        <p className="text-gray-600">
          Safety alerts and incident management
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-600 text-sm font-medium">Active Alerts</p>
              <p className="text-3xl font-bold text-red-700 mt-2">
                {alertsData?.totalActive || 0}
              </p>
            </div>
            <div className="text-4xl">🚨</div>
          </div>
        </div>

        <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-yellow-600 text-sm font-medium">Holding Area</p>
              <p className="text-3xl font-bold text-yellow-700 mt-2">
                {alertsData?.holdingAreaAlerts.filter(a => !a.resolved).length || 0}
              </p>
            </div>
            <div className="text-4xl">🏥</div>
          </div>
        </div>

        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-600 text-sm font-medium">PACU</p>
              <p className="text-3xl font-bold text-blue-700 mt-2">
                {alertsData?.pacuAlerts.filter(a => !a.resolved).length || 0}
              </p>
            </div>
            <div className="text-4xl">🛌</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex gap-4">
        <button
          onClick={() => setFilter('active')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'active'
              ? 'bg-red-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Active Alerts
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'all'
              ? 'bg-red-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          All Alerts
        </button>
      </div>

      {/* Alerts List */}
      {allAlerts.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500 text-lg">No alerts to display</p>
        </div>
      ) : (
        <div className="space-y-4">
          {allAlerts.map((alert: any) => {
            const patient = alert.source === 'holding' 
              ? alert.assessment?.patient 
              : alert.pacuAssessment?.patient;
            
            return (
              <div
                key={`${alert.source}-${alert.id}`}
                className={`bg-white rounded-lg shadow-md p-6 ${
                  alert.resolved ? 'opacity-60' : 'border-l-4 border-red-600'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-3xl">{getAlertTypeIcon(alert.alertType)}</span>
                      <div>
                        <h3 className="font-bold text-lg text-gray-900">
                          {alert.alertType.replace(/_/g, ' ')}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {patient?.name} • {patient?.folderNumber}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${getSeverityColor(alert.severity)}`}>
                        {alert.severity}
                      </span>
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                        {alert.source === 'holding' ? 'Holding Area' : 'PACU'}
                      </span>
                    </div>

                    <p className="text-gray-700 mb-3">{alert.description}</p>

                    <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                      <span>
                        Triggered: {new Date(alert.triggeredAt).toLocaleString()}
                      </span>
                      {alert.acknowledged && (
                        <span className="text-green-600">
                          ✓ Acknowledged
                        </span>
                      )}
                      {alert.resolved && (
                        <span className="text-blue-600">
                          ✓ Resolved: {alert.resolutionAction}
                        </span>
                      )}
                    </div>

                    {!alert.resolved && (
                      <div className="flex gap-2">
                        {!alert.acknowledged && (
                          <button
                            onClick={() => acknowledgeAlert(alert.id, alert.type)}
                            className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm font-medium"
                          >
                            Acknowledge
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedAlert({ alert, type: alert.type })}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
                        >
                          Resolve
                        </button>
                        <button
                          onClick={() => {
                            const url = alert.source === 'holding'
                              ? `/dashboard/holding-area/${alert.assessment?.id}`
                              : `/dashboard/pacu/${alert.pacuAssessment?.id}`;
                            router.push(url);
                          }}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                        >
                          View Details
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Resolve Dialog */}
      {selectedAlert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">Resolve Alert</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Resolution Action *</label>
                <input
                  type="text"
                  value={resolutionAction}
                  onChange={(e) => setResolutionAction(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g., Issue corrected and verified"
                />
              </div>
              <SmartTextInput
                label="Notes (Optional)"
                value={resolutionNotes}
                onChange={setResolutionNotes}
                rows={4}
                placeholder="Additional details about resolution... 🎤 Dictate or 📷 capture"
                enableSpeech={true}
                enableOCR={true}
                medicalMode={true}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setSelectedAlert(null);
                    setResolutionAction('');
                    setResolutionNotes('');
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={resolveAlert}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Resolve Alert
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
