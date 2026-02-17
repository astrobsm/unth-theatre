'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Shirt, AlertTriangle, CheckCircle, Clock, Package, TrendingUp, BarChart3 } from 'lucide-react';

export default function LaundrySupervisorDashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [readinessReports, setReadinessReports] = useState<any[]>([]);

  useEffect(() => {
    if (session?.user?.role && !['LAUNDRY_SUPERVISOR', 'ADMIN', 'THEATRE_MANAGER'].includes(session.user.role)) {
      router.push('/dashboard');
      return;
    }
    fetchData();
  }, [session, router]);

  const fetchData = async () => {
    try {
      const [statsRes, laundryRes] = await Promise.all([
        fetch('/api/dashboard/stats'),
        fetch('/api/laundry-readiness'),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (laundryRes.ok) {
        const data = await laundryRes.json();
        setReadinessReports(Array.isArray(data) ? data : []);
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

  const readyCount = readinessReports.filter((r: any) => r.status === 'READY' || r.isReady).length;
  const pendingCount = readinessReports.filter((r: any) => r.status === 'PENDING' || !r.isReady).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Laundry Supervisor Dashboard</h1>
          <p className="text-gray-600">Theatre linen and laundry management</p>
        </div>
        <button onClick={fetchData} className="btn-secondary text-sm">Refresh</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Reports</p>
              <p className="text-2xl font-bold">{readinessReports.length}</p>
            </div>
            <Shirt className="h-8 w-8 text-blue-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Ready</p>
              <p className="text-2xl font-bold">{readyCount}</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Pending</p>
              <p className="text-2xl font-bold">{pendingCount}</p>
            </div>
            <Clock className="h-8 w-8 text-orange-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Today&apos;s Surgeries</p>
              <p className="text-2xl font-bold">{stats?.todaySurgeries ?? 0}</p>
            </div>
            <BarChart3 className="h-8 w-8 text-purple-500" />
          </div>
        </div>
      </div>

      {/* Recent Readiness Reports */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Shirt className="h-5 w-5 text-blue-600" />
          Laundry Readiness Reports
        </h3>
        {readinessReports.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Theatre</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {readinessReports.slice(0, 20).map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">{r.theatreName || r.theatre?.name || 'N/A'}</td>
                    <td className="px-4 py-3">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        r.isReady || r.status === 'READY' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {r.isReady || r.status === 'READY' ? 'Ready' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{r.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No readiness reports. Linen status data will appear here.</p>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Quick Access</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: 'Theatre Readiness', href: '/dashboard/theatre-readiness', icon: CheckCircle },
            { label: 'Theatre Allocation', href: '/dashboard/theatres', icon: Package },
            { label: 'Reports', href: '/dashboard/reports', icon: TrendingUp },
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
