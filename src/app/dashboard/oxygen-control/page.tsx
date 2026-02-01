'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  Wind,
  Gauge,
  AlertOctagon,
  Bell,
  TrendingUp,
  TrendingDown,
  Droplets,
  Shield
} from 'lucide-react';

interface OxygenReadiness {
  id: string;
  reportDate: string;
  shiftType: string;
  centralOxygenPressure: number;
  centralOxygenStatus: string;
  cylinderBankLevel: number;
  overallReadiness: string;
  predictedShortage: boolean;
  criticalIssues?: string;
  reportedBy: {
    fullName: string;
  };
}

interface OxygenAlert {
  id: string;
  alertDate: string;
  alertType: string;
  severity: string;
  status: string;
  location: string;
  immediateRisk: boolean;
  triggeredBy: {
    fullName: string;
    role: string;
  };
}

export default function OxygenControlPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [latestReport, setLatestReport] = useState<OxygenReadiness | null>(null);
  const [activeAlerts, setActiveAlerts] = useState<OxygenAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {
    fetchData();
    // Refresh every 30 seconds for real-time monitoring
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      // Fetch latest readiness report
      const readinessRes = await fetch('/api/oxygen/readiness');
      if (readinessRes.ok) {
        const reports = await readinessRes.json();
        if (Array.isArray(reports) && reports.length > 0) {
          setLatestReport(reports[0]);
        }
      }

      // Fetch active alerts
      const alertsRes = await fetch('/api/oxygen/alerts?status=ACTIVE');
      if (alertsRes.ok) {
        const alerts = await alertsRes.json();
        setActiveAlerts(Array.isArray(alerts) ? alerts : []);
      }
    } catch (error) {
      console.error('Error fetching oxygen data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'EXCELLENT':
        return 'text-green-600 bg-green-50';
      case 'GOOD':
        return 'text-blue-600 bg-blue-50';
      case 'ADEQUATE':
        return 'text-yellow-600 bg-yellow-50';
      case 'LOW':
        return 'text-orange-600 bg-orange-50';
      case 'CRITICAL':
      case 'DEPLETED':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getReadinessColor = (readiness: string) => {
    switch (readiness) {
      case 'READY':
        return 'bg-green-500';
      case 'PARTIALLY_READY':
        return 'bg-yellow-500';
      case 'NOT_READY':
        return 'bg-orange-500';
      case 'CRITICAL':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getSeverityBadge = (severity: string) => {
    const colors = {
      WARNING: 'bg-yellow-100 text-yellow-800',
      URGENT: 'bg-orange-100 text-orange-800',
      CRITICAL: 'bg-red-100 text-red-800',
      EMERGENCY: 'bg-red-600 text-white animate-pulse',
    };
    return colors[severity as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <Wind className="w-8 h-8 text-blue-600" />
          Oxygen Control Room
        </h1>
        <p className="text-gray-600 mt-1">
          Real-time oxygen supply monitoring and alert system
        </p>
      </div>

      {/* Active Red Alerts - Prominent Display */}
      {activeAlerts.length > 0 && (
        <div className="mb-6 bg-red-50 border-2 border-red-500 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertOctagon className="w-8 h-8 text-red-600 animate-pulse" />
            <h2 className="text-2xl font-bold text-red-900">
              {activeAlerts.length} ACTIVE OXYGEN ALERT{activeAlerts.length > 1 ? 'S' : ''}
            </h2>
            <Bell className="w-6 h-6 text-red-600 animate-bounce" />
          </div>
          <div className="space-y-3">
            {activeAlerts.map((alert) => (
              <div key={alert.id} className="bg-white rounded-lg p-4 border-l-4 border-red-600">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getSeverityBadge(alert.severity)}`}>
                        {alert.severity}
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        {alert.alertType.replace(/_/g, ' ')}
                      </span>
                      {alert.immediateRisk && (
                        <span className="px-2 py-1 bg-red-600 text-white text-xs font-bold rounded">
                          SURGERY AT RISK
                        </span>
                      )}
                    </div>
                    <p className="text-gray-700 font-medium">{alert.location}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Triggered by {alert.triggeredBy?.fullName || 'Not assigned'} ({alert.triggeredBy.role})
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(alert.alertDate).toLocaleString()}
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/oxygen-control/alerts/${alert.id}`}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                  >
                    Respond
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Link
          href="/dashboard/oxygen-control/readiness/new"
          className="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-lg flex items-center gap-3 transition"
        >
          <Gauge className="w-6 h-6" />
          <span className="font-medium">Log Readiness Report</span>
        </Link>
        <Link
          href="/dashboard/oxygen-control/alerts/new"
          className="bg-red-600 hover:bg-red-700 text-white p-4 rounded-lg flex items-center gap-3 transition"
        >
          <AlertOctagon className="w-6 h-6" />
          <span className="font-medium">Trigger Red Alert</span>
        </Link>
        <Link
          href="/dashboard/oxygen-control/history"
          className="bg-gray-600 hover:bg-gray-700 text-white p-4 rounded-lg flex items-center gap-3 transition"
        >
          <Activity className="w-6 h-6" />
          <span className="font-medium">View History</span>
        </Link>
      </div>

      {/* Current Status Dashboard */}
      {latestReport ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Overall Status Card */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              Overall System Status
            </h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">Readiness Level</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold text-white ${getReadinessColor(latestReport.overallReadiness)}`}>
                    {latestReport.overallReadiness.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">Central Oxygen Status</span>
                  <span className={`px-3 py-1 rounded-lg text-sm font-semibold ${getStatusColor(latestReport.centralOxygenStatus)}`}>
                    {latestReport.centralOxygenStatus}
                  </span>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">Central Pressure</span>
                  <span className="text-2xl font-bold text-gray-900">
                    {latestReport.centralOxygenPressure} <span className="text-sm text-gray-600">PSI</span>
                  </span>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">Cylinder Bank Level</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-4 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${latestReport.cylinderBankLevel > 50 ? 'bg-green-500' : latestReport.cylinderBankLevel > 25 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${latestReport.cylinderBankLevel}%` }}
                      />
                    </div>
                    <span className="font-semibold">{latestReport.cylinderBankLevel}%</span>
                  </div>
                </div>
              </div>
              {latestReport.predictedShortage && (
                <div className="bg-orange-50 border border-orange-300 rounded-lg p-3 flex items-start gap-2">
                  <TrendingDown className="w-5 h-5 text-orange-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-orange-900">Shortage Predicted</p>
                    <p className="text-xs text-orange-700 mt-1">Immediate attention required</p>
                  </div>
                </div>
              )}
              {latestReport.criticalIssues && (
                <div className="bg-red-50 border border-red-300 rounded-lg p-3">
                  <p className="text-sm font-semibold text-red-900 mb-1">Critical Issues:</p>
                  <p className="text-sm text-red-700">{latestReport.criticalIssues}</p>
                </div>
              )}
            </div>
          </div>

          {/* Report Details */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600" />
              Latest Report Details
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Report Date:</span>
                <span className="font-medium">{new Date(latestReport.reportDate).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Shift:</span>
                <span className="font-medium">{latestReport.shiftType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Reported By:</span>
                <span className="font-medium">{latestReport.reportedBy?.fullName || 'Not assigned'}</span>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t">
              <Link
                href={`/dashboard/oxygen-control/readiness/${latestReport.id}`}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1"
              >
                View Full Report →
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-6 mb-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-yellow-600" />
            <div>
              <p className="font-semibold text-yellow-900">No Recent Readiness Report</p>
              <p className="text-sm text-yellow-700 mt-1">
                Please log today&apos;s oxygen readiness status
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Info Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-3 flex items-center gap-2">
          <Droplets className="w-5 h-5" />
          Oxygen Control Room Guidelines
        </h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>Log readiness reports at the start of each shift (Morning, Afternoon, Night)</span>
          </li>
          <li className="flex items-start gap-2">
            <AlertOctagon className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>Trigger RED ALERT immediately if oxygen pressure drops or depletion is detected</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>Monitor cylinder bank levels - reorder when below 30%</span>
          </li>
          <li className="flex items-start gap-2">
            <AlertOctagon className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>Anaesthetists and Theatre Technicians can trigger alerts during surgery</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>Report predicted shortages early to prevent surgery cancellations</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
