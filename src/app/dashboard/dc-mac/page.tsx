'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Activity, AlertTriangle, Calendar, TrendingUp, Building2,
  Heart, FileText, Shield, Stethoscope, Users
} from 'lucide-react';

export default function DCMACDashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [emergencyAlerts, setEmergencyAlerts] = useState<any[]>([]);

  useEffect(() => {
    if (session?.user?.role && !['DC_MAC', 'CMAC', 'ADMIN', 'CHIEF_MEDICAL_DIRECTOR'].includes(session.user.role)) {
      router.push('/dashboard');
      return;
    }
    /* figures load when asked for — see the button */
  }, [session, router]);


  // ── Figures load on request, not on arrival ───────────────────────────────
  // This page opened by counting the hospital and then blocked on the result
  // behind a spinner. An executive dashboard is read occasionally and
  // deliberately; it does not need to count every surgery before it will draw a
  // heading.
  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, alertsRes] = await Promise.all([
        fetch('/api/dashboard/stats'),
        fetch('/api/emergency-alerts?activeOnly=true'),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (alertsRes.ok) {
        const data = await alertsRes.json();
        setEmergencyAlerts(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error fetching DC-MAC stats:', error);
    } finally {
      setLoadedAt(new Date());
      setLoading(false);
    }
  };

  // An uncounted figure is not zero — a dash says "not counted yet" instead of
  // making a false claim about the hospital.
  const fig = (v?: number) => (stats === null ? '—' : (v ?? 0));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">DC-MAC Dashboard</h1>
          <p className="text-gray-600">Deputy Chairman, Medical Advisory Committee</p>
        </div>
        {loadedAt && (
          <span className="self-center text-xs text-gray-500">
            as at {loadedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        <button onClick={fetchData} disabled={loading} className="btn-primary text-sm disabled:opacity-60">
          {loading ? 'Counting…' : stats ? 'Refresh figures' : 'Show figures'}
        </button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-blue-500">
          <p className="text-sm text-gray-500">Total Surgeries</p>
          <p className="text-2xl font-bold">{fig(stats?.totalSurgeries)}</p>
        </div>
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-green-500">
          <p className="text-sm text-gray-500">Completed</p>
          <p className="text-2xl font-bold">{fig(stats?.completedSurgeries)}</p>
        </div>
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-red-500">
          <p className="text-sm text-gray-500">Emergencies</p>
          <p className="text-2xl font-bold">{fig(stats?.emergencySurgeries)}</p>
        </div>
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-orange-500">
          <p className="text-sm text-gray-500">Active Alerts</p>
          <p className="text-2xl font-bold">{emergencyAlerts.length}</p>
        </div>
      </div>

      {emergencyAlerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-red-800 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> Active Emergency Alerts
          </h3>
          <div className="space-y-2">
            {emergencyAlerts.map((alert: any) => (
              <div key={alert.id} className="bg-white rounded p-3 border border-red-200 flex justify-between">
                <div>
                  <p className="font-medium text-sm">{alert.procedureName}</p>
                  <p className="text-xs text-gray-600">{alert.patientName}</p>
                </div>
                <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700">{alert.priority}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Quick Access</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Surgeries', href: '/dashboard/surgeries', icon: Calendar },
            { label: 'Mortality', href: '/dashboard/mortality', icon: Heart },
            { label: 'Reports', href: '/dashboard/reports', icon: FileText },
            { label: 'Emergency Alerts', href: '/dashboard/emergency-alerts', icon: AlertTriangle },
            { label: 'Emergency Booking', href: '/dashboard/emergency-booking', icon: Stethoscope },
            { label: 'Cancellations', href: '/dashboard/cancellations', icon: Activity },
            { label: 'Incidents', href: '/dashboard/incidents', icon: Shield },
            { label: 'Staff Effectiveness', href: '/dashboard/reports/staff-effectiveness', icon: TrendingUp },
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
