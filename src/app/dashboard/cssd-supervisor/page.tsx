'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Shield, AlertTriangle, CheckCircle, Clock, Package, Activity, BarChart3 } from 'lucide-react';

export default function CSSDSupervisorDashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<any[]>([]);
  const [sterilization, setSterilization] = useState<any[]>([]);
  const [readiness, setReadiness] = useState<any[]>([]);

  useEffect(() => {
    if (session?.user?.role && !['CSSD_SUPERVISOR', 'ADMIN', 'THEATRE_MANAGER', 'CSSD_STAFF'].includes(session.user.role)) {
      router.push('/dashboard');
      return;
    }
    fetchData();
  }, [session, router]);

  const fetchData = async () => {
    try {
      const [invRes, sterRes, readyRes] = await Promise.all([
        fetch('/api/cssd-inventory'),
        fetch('/api/cssd-sterilization'),
        fetch('/api/cssd-readiness'),
      ]);
      if (invRes.ok) {
        const data = await invRes.json();
        setInventory(Array.isArray(data) ? data : []);
      }
      if (sterRes.ok) {
        const data = await sterRes.json();
        setSterilization(Array.isArray(data) ? data : []);
      }
      if (readyRes.ok) {
        const data = await readyRes.json();
        setReadiness(Array.isArray(data) ? data : []);
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

  const lowStockItems = inventory.filter((i: any) => i.quantity <= (i.reorderLevel || 5));
  const inSterilization = sterilization.filter((s: any) => s.status === 'IN_PROGRESS');
  const readyReports = readiness.filter((r: any) => r.isReady || r.status === 'APPROVED');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CSSD Supervisor Dashboard</h1>
          <p className="text-gray-600">Central Sterile Supply Department oversight</p>
        </div>
        <button onClick={fetchData} className="btn-secondary text-sm">Refresh</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Inventory Items</p>
              <p className="text-2xl font-bold">{inventory.length}</p>
            </div>
            <Package className="h-8 w-8 text-blue-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Low Stock Items</p>
              <p className="text-2xl font-bold">{lowStockItems.length}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">In Sterilization</p>
              <p className="text-2xl font-bold">{inSterilization.length}</p>
            </div>
            <Activity className="h-8 w-8 text-orange-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg p-5 shadow border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Readiness Reports</p>
              <p className="text-2xl font-bold">{readyReports.length}</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-500" />
          </div>
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Low Stock Alert
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {lowStockItems.slice(0, 6).map((item: any) => (
              <div key={item.id} className="bg-white p-2 rounded border border-red-100 text-sm">
                <span className="font-medium">{item.name}</span>
                <span className="text-red-600 ml-2">Qty: {item.quantity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">CSSD Quick Access</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: 'CSSD Inventory', href: '/dashboard/cssd/inventory', icon: Package },
            { label: 'Sterilization', href: '/dashboard/cssd/sterilization', icon: Activity },
            { label: 'CSSD Readiness', href: '/dashboard/cssd/readiness', icon: CheckCircle },
            { label: 'Theatre Readiness', href: '/dashboard/theatre-readiness', icon: Shield },
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
