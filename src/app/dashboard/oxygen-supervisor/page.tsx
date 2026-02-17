'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Wind, AlertTriangle, CheckCircle, Gauge, Activity, BarChart3 } from 'lucide-react';

export default function OxygenSupervisorDashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [oxygenReadiness, setOxygenReadiness] = useState<any[]>([]);
  const [oxygenAlerts, setOxygenAlerts] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});

  useEffect(() => {
    if (session?.user?.role && !['OXYGEN_UNIT_SUPERVISOR', 'ADMIN', 'THEATRE_MANAGER'].includes(session.user.role)) {
      router.push('/dashboard');
      return;
    }
    fetchData();
  }, [session, router]);

  const fetchData = async () => {
    try {
      const [readyRes, alertRes, statsRes] = await Promise.all([
        fetch('/api/oxygen/readiness'),
        fetch('/api/oxygen/alerts'),
        fetch('/api/dashboard/stats'),
      ]);
      if (readyRes.ok) {
        const data = await readyRes.json();
        setOxygenReadiness(Array.isArray(data) ? data : []);
      }
      if (alertRes.ok) {
        const data = await alertRes.json();
        setOxygenAlerts(Array.isArray(data) ? data : []);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const activeAlerts = oxygenAlerts.filter((a: any) => a.status === 'ACTIVE' || !a.resolved);
  const readyCount = oxygenReadiness.filter((r: any) => r.isReady || r.status === 'READY').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Oxygen Unit Supervisor Dashboard</h1>
          <p className="text-gray-600">Oxygen supply monitoring and management</p>
        </div>
        <button onClick={fetchData} className="btn-secondary text-sm">Refresh</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Readiness Reports</p>
              <p className="text-2xl font-bold">{oxygenReadiness.length}</p>
            </div>
            <Gauge className="h-8 w-8 text-blue-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Theatres Ready</p>
              <p className="text-2xl font-bold">{readyCount}</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Active Alerts</p>
              <p className="text-2xl font-bold">{activeAlerts.length}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Today&apos;s Surgeries</p>
              <p className="text-2xl font-bold">{stats.todaySurgeries || 0}</p>
            </div>
            <Activity className="h-8 w-8 text-purple-500" />
          </div>
        </div>
      </div>

      {/* Active Alerts */}
      {activeAlerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Active Oxygen Alerts
          </h3>
          <div className="space-y-2">
            {activeAlerts.map((alert: any) => (
              <div key={alert.id} className="bg-white p-3 rounded border border-red-100 text-sm flex items-center justify-between">
                <div>
                  <span className="font-medium">{alert.theatreName || alert.location || 'Theatre'}</span>
                  <span className="text-gray-500 ml-2">{alert.description || alert.message}</span>
                </div>
                <span className="text-xs text-red-600 font-medium">
                  {alert.severity || 'ALERT'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Readiness Overview */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Oxygen Readiness Overview</h3>
        {oxygenReadiness.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {oxygenReadiness.map((report: any) => (
              <div key={report.id} className="border rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{report.theatreName || report.name || `Theatre ${report.theatreNumber}`}</p>
                  <p className="text-xs text-gray-500">
                    Level: {report.oxygenLevel || report.level || 'N/A'}%
                  </p>
                </div>
                <div className={`px-2 py-1 rounded text-xs font-medium ${
                  (report.isReady || report.status === 'READY') ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {report.isReady || report.status === 'READY' ? 'Ready' : 'Not Ready'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No readiness reports available</p>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Quick Access</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: 'Oxygen Control', href: '/dashboard/oxygen', icon: Wind },
            { label: 'Theatre Readiness', href: '/dashboard/theatre-readiness', icon: CheckCircle },
            { label: 'Alerts', href: '/dashboard/alerts', icon: AlertTriangle },
            { label: 'Reports', href: '/dashboard/reports', icon: BarChart3 },
          ].map((link) => (
            <button
              key={link.href}
              onClick={() => router.push(link.href)}
              className="flex items-center gap-2 p-3 border rounded-lg hover:bg-blue-50 hover:border-blue-300 transition text-sm"
            >
              <link.icon className="h-4 w-4 text-blue-600" />
              {link.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
