'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, Activity, Users, AlertTriangle, Calendar,
  TrendingUp, Building2, Heart, FileText, Shield, Stethoscope, Clock
} from 'lucide-react';

export default function CMACDashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [recentSurgeries, setRecentSurgeries] = useState<any[]>([]);
  const [emergencyAlerts, setEmergencyAlerts] = useState<any[]>([]);

  useEffect(() => {
    if (session?.user?.role && !['CMAC', 'ADMIN', 'CHIEF_MEDICAL_DIRECTOR'].includes(session.user.role)) {
      router.push('/dashboard');
      return;
    }
    fetchData();
  }, [session, router]);

  const fetchData = async () => {
    try {
      const [statsRes, surgeriesRes, alertsRes] = await Promise.all([
        fetch('/api/dashboard/stats'),
        fetch('/api/surgeries?limit=15'),
        fetch('/api/emergency-alerts?activeOnly=true'),
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (surgeriesRes.ok) {
        const data = await surgeriesRes.json();
        setRecentSurgeries(Array.isArray(data) ? data.slice(0, 15) : []);
      }
      if (alertsRes.ok) {
        const data = await alertsRes.json();
        setEmergencyAlerts(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error fetching CMAC stats:', error);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">C-MAC Dashboard</h1>
          <p className="text-gray-600">Chairman, Medical Advisory Committee - Clinical Oversight</p>
        </div>
        <button onClick={fetchData} className="btn-secondary text-sm">Refresh</button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-blue-500">
          <p className="text-sm text-gray-500">Total Surgeries</p>
          <p className="text-2xl font-bold">{stats?.totalSurgeries ?? 0}</p>
        </div>
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-green-500">
          <p className="text-sm text-gray-500">Completed</p>
          <p className="text-2xl font-bold">{stats?.completedSurgeries ?? 0}</p>
        </div>
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-red-500">
          <p className="text-sm text-gray-500">Active Emergency Alerts</p>
          <p className="text-2xl font-bold">{emergencyAlerts.length}</p>
        </div>
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-purple-500">
          <p className="text-sm text-gray-500">Mortality</p>
          <p className="text-2xl font-bold">{stats?.mortalityCount ?? 0}</p>
        </div>
      </div>

      {/* Emergency Alerts */}
      {emergencyAlerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-red-800 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Active Emergency Alerts
          </h3>
          <div className="space-y-2">
            {emergencyAlerts.map((alert: any) => (
              <div key={alert.id} className="bg-white rounded p-3 border border-red-200">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{alert.procedureName}</p>
                    <p className="text-sm text-gray-600">{alert.patientName} - {alert.surgicalUnit}</p>
                  </div>
                  <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700 font-medium">
                    {alert.priority}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clinical Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Recent Surgical Activity
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {recentSurgeries.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between border-b pb-2 text-sm">
                <div>
                  <p className="font-medium">{s.procedureName || s.procedure}</p>
                  <p className="text-xs text-gray-500">{s.patient?.fullName} | {s.surgeonName}</p>
                </div>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  s.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                  s.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                  s.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-700'
                }`}>{s.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Quick Access</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'All Surgeries', href: '/dashboard/surgeries', icon: Calendar },
              { label: 'Mortality Registry', href: '/dashboard/mortality', icon: Heart },
              { label: 'Reports & Analytics', href: '/dashboard/reports', icon: FileText },
              { label: 'Emergency Alerts', href: '/dashboard/emergency-alerts', icon: AlertTriangle },
              { label: 'Emergency Booking', href: '/dashboard/emergency-booking', icon: Stethoscope },
              { label: 'Staff Effectiveness', href: '/dashboard/reports/staff-effectiveness', icon: TrendingUp },
              { label: 'Incidents', href: '/dashboard/incidents', icon: Shield },
              { label: 'Cancellations', href: '/dashboard/cancellations', icon: Activity },
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
    </div>
  );
}
