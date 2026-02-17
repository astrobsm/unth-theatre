'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Wrench, AlertTriangle, CheckCircle, Zap, Activity, BarChart3, Settings, Clock } from 'lucide-react';

export default function WorksSupervisorDashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [powerStatus, setPowerStatus] = useState<any[]>([]);
  const [maintenance, setMaintenance] = useState<any[]>([]);
  const [faults, setFaults] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});

  useEffect(() => {
    if (session?.user?.role && !['WORKS_SUPERVISOR', 'ADMIN', 'THEATRE_MANAGER'].includes(session.user.role)) {
      router.push('/dashboard');
      return;
    }
    fetchData();
  }, [session, router]);

  const fetchData = async () => {
    try {
      const [powerRes, maintRes, faultRes, statsRes] = await Promise.all([
        fetch('/api/power-status'),
        fetch('/api/power-maintenance'),
        fetch('/api/fault-alerts'),
        fetch('/api/dashboard/stats'),
      ]);
      if (powerRes.ok) {
        const data = await powerRes.json();
        setPowerStatus(Array.isArray(data) ? data : []);
      }
      if (maintRes.ok) {
        const data = await maintRes.json();
        setMaintenance(Array.isArray(data) ? data : []);
      }
      if (faultRes.ok) {
        const data = await faultRes.json();
        setFaults(Array.isArray(data) ? data : []);
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

  const activeFaults = faults.filter((f: any) => f.status === 'ACTIVE' || f.status === 'REPORTED' || !f.resolved);
  const pendingMaintenance = maintenance.filter((m: any) => m.status === 'PENDING' || m.status === 'SCHEDULED');
  const onlineTheatres = powerStatus.filter((p: any) => p.isPowered || p.status === 'ON');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Works Supervisor Dashboard</h1>
          <p className="text-gray-600">Facility infrastructure, power, and maintenance management</p>
        </div>
        <button onClick={fetchData} className="btn-secondary text-sm">Refresh</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Theatres Online</p>
              <p className="text-2xl font-bold">{onlineTheatres.length} / {powerStatus.length || '—'}</p>
            </div>
            <Zap className="h-8 w-8 text-green-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Active Faults</p>
              <p className="text-2xl font-bold">{activeFaults.length}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Pending Maintenance</p>
              <p className="text-2xl font-bold">{pendingMaintenance.length}</p>
            </div>
            <Clock className="h-8 w-8 text-orange-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Today&apos;s Surgeries</p>
              <p className="text-2xl font-bold">{stats.todaySurgeries || 0}</p>
            </div>
            <Activity className="h-8 w-8 text-blue-500" />
          </div>
        </div>
      </div>

      {/* Active Faults */}
      {activeFaults.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Active Equipment/Facility Faults
          </h3>
          <div className="space-y-2">
            {activeFaults.slice(0, 5).map((fault: any) => (
              <div key={fault.id} className="bg-white p-3 rounded border border-red-100 text-sm flex items-center justify-between">
                <div>
                  <span className="font-medium">{fault.equipmentName || fault.location || 'Facility'}</span>
                  <span className="text-gray-500 ml-2">{fault.description || fault.faultType}</span>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded ${
                  fault.severity === 'CRITICAL' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {fault.severity || 'REPORTED'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Power Status */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-500" /> Power Status Overview
        </h3>
        {powerStatus.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {powerStatus.map((theatre: any) => (
              <div key={theatre.id} className="border rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{theatre.theatreName || theatre.name || `Theatre ${theatre.theatreNumber}`}</p>
                  <p className="text-xs text-gray-500">
                    Source: {theatre.powerSource || 'Mains'}
                  </p>
                </div>
                <div className={`px-2 py-1 rounded text-xs font-medium ${
                  (theatre.isPowered || theatre.status === 'ON') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {(theatre.isPowered || theatre.status === 'ON') ? 'Online' : 'Offline'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No power status data available</p>
        )}
      </div>

      {/* Quick Access */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Quick Access</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: 'Power Status', href: '/dashboard/power', icon: Zap },
            { label: 'Fault Alerts', href: '/dashboard/fault-alerts', icon: AlertTriangle },
            { label: 'Maintenance', href: '/dashboard/maintenance', icon: Wrench },
            { label: 'Equipment', href: '/dashboard/equipment', icon: Settings },
            { label: 'Theatre Readiness', href: '/dashboard/theatre-readiness', icon: CheckCircle },
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
