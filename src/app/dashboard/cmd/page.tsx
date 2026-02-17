'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, Activity, Users, AlertTriangle, Calendar,
  TrendingUp, Clock, Building2, Heart, FileText, Shield
} from 'lucide-react';

interface CMDStats {
  totalSurgeries: number;
  completedSurgeries: number;
  emergencySurgeries: number;
  mortalityCount: number;
  activeFaults: number;
  pendingApprovals: number;
  totalStaff: number;
  theatreUtilization: number;
  cancelledSurgeries: number;
  activeEmergencyAlerts: number;
}

export default function CMDDashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<CMDStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentSurgeries, setRecentSurgeries] = useState<any[]>([]);
  const [recentIncidents, setRecentIncidents] = useState<any[]>([]);

  useEffect(() => {
    if (session?.user?.role && !['CHIEF_MEDICAL_DIRECTOR', 'ADMIN'].includes(session.user.role)) {
      router.push('/dashboard');
      return;
    }
    fetchStats();
  }, [session, router]);

  const fetchStats = async () => {
    try {
      const [statsRes, surgeriesRes, incidentsRes] = await Promise.all([
        fetch('/api/dashboard/stats'),
        fetch('/api/surgeries?limit=10'),
        fetch('/api/incidents?limit=5'),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats({
          totalSurgeries: data.totalSurgeries || 0,
          completedSurgeries: data.completedSurgeries || 0,
          emergencySurgeries: data.emergencySurgeries || 0,
          mortalityCount: data.mortalityCount || 0,
          activeFaults: data.activeFaults || 0,
          pendingApprovals: data.pendingUsers || 0,
          totalStaff: data.totalStaff || 0,
          theatreUtilization: data.theatreUtilization || 0,
          cancelledSurgeries: data.cancelledSurgeries || 0,
          activeEmergencyAlerts: data.activeEmergencyAlerts || 0,
        });
      }

      if (surgeriesRes.ok) {
        const data = await surgeriesRes.json();
        setRecentSurgeries(Array.isArray(data) ? data.slice(0, 10) : []);
      }

      if (incidentsRes.ok) {
        const data = await incidentsRes.json();
        setRecentIncidents(Array.isArray(data) ? data.slice(0, 5) : []);
      }
    } catch (error) {
      console.error('Error fetching CMD stats:', error);
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
          <h1 className="text-2xl font-bold text-gray-900">Chief Medical Director Dashboard</h1>
          <p className="text-gray-600">Executive overview of all theatre operations</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchStats} className="btn-secondary text-sm">Refresh</button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Surgeries</p>
              <p className="text-2xl font-bold">{stats?.totalSurgeries ?? 0}</p>
            </div>
            <Calendar className="h-8 w-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Completed</p>
              <p className="text-2xl font-bold">{stats?.completedSurgeries ?? 0}</p>
            </div>
            <Activity className="h-8 w-8 text-green-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Emergency</p>
              <p className="text-2xl font-bold">{stats?.emergencySurgeries ?? 0}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Mortality</p>
              <p className="text-2xl font-bold">{stats?.mortalityCount ?? 0}</p>
            </div>
            <Heart className="h-8 w-8 text-purple-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Active Alerts</p>
              <p className="text-2xl font-bold">{stats?.activeEmergencyAlerts ?? 0}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-orange-500" />
          </div>
        </div>
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-5 shadow">
          <div className="flex items-center gap-3 mb-2">
            <Users className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold">Total Staff</h3>
          </div>
          <p className="text-3xl font-bold">{stats?.totalStaff ?? 0}</p>
          <p className="text-sm text-gray-500 mt-1">{stats?.pendingApprovals ?? 0} pending approvals</p>
        </div>

        <div className="bg-white rounded-lg p-5 shadow">
          <div className="flex items-center gap-3 mb-2">
            <Building2 className="h-5 w-5 text-green-600" />
            <h3 className="font-semibold">Theatre Utilization</h3>
          </div>
          <p className="text-3xl font-bold">{stats?.theatreUtilization ?? 0}%</p>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div className="bg-green-600 h-2 rounded-full" style={{ width: `${stats?.theatreUtilization ?? 0}%` }}></div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-5 shadow">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="h-5 w-5 text-red-600" />
            <h3 className="font-semibold">Active Equipment Faults</h3>
          </div>
          <p className="text-3xl font-bold">{stats?.activeFaults ?? 0}</p>
          <p className="text-sm text-gray-500 mt-1">{stats?.cancelledSurgeries ?? 0} cancelled surgeries</p>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Recent Surgeries
          </h3>
          {recentSurgeries.length > 0 ? (
            <div className="space-y-3">
              {recentSurgeries.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between border-b pb-2">
                  <div>
                    <p className="font-medium text-sm">{s.procedureName || s.procedure}</p>
                    <p className="text-xs text-gray-500">{s.patient?.fullName || s.patientName}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    s.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                    s.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                    s.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No recent surgeries</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Recent Incidents
          </h3>
          {recentIncidents.length > 0 ? (
            <div className="space-y-3">
              {recentIncidents.map((inc: any) => (
                <div key={inc.id} className="flex items-center justify-between border-b pb-2">
                  <div>
                    <p className="font-medium text-sm">{inc.title || inc.type}</p>
                    <p className="text-xs text-gray-500">{new Date(inc.createdAt).toLocaleDateString()}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    inc.severity === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                    inc.severity === 'MAJOR' ? 'bg-orange-100 text-orange-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {inc.severity}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No recent incidents</p>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Quick Access</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Surgeries', href: '/dashboard/surgeries', icon: Calendar },
            { label: 'Mortality Registry', href: '/dashboard/mortality', icon: Heart },
            { label: 'Reports', href: '/dashboard/reports', icon: FileText },
            { label: 'Emergency Alerts', href: '/dashboard/emergency-alerts', icon: AlertTriangle },
            { label: 'User Management', href: '/dashboard/users', icon: Users },
            { label: 'Incidents', href: '/dashboard/incidents', icon: Shield },
            { label: 'Theatre Allocation', href: '/dashboard/theatres', icon: Building2 },
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
