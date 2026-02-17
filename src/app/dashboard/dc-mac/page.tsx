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
  const [loading, setLoading] = useState(true);
  const [emergencyAlerts, setEmergencyAlerts] = useState<any[]>([]);

  useEffect(() => {
    if (session?.user?.role && !['DC_MAC', 'CMAC', 'ADMIN', 'CHIEF_MEDICAL_DIRECTOR'].includes(session.user.role)) {
      router.push('/dashboard');
      return;
    }
    fetchData();
  }, [session, router]);

  const fetchData = async () => {
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
          <h1 className="text-2xl font-bold text-gray-900">DC-MAC Dashboard</h1>
          <p className="text-gray-600">Deputy Chairman, Medical Advisory Committee</p>
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
          <p className="text-sm text-gray-500">Emergencies</p>
          <p className="text-2xl font-bold">{stats?.emergencySurgeries ?? 0}</p>
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
