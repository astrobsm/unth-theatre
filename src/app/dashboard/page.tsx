'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Package, 
  Calendar, 
  Users, 
  AlertCircle,
  TrendingUp,
  Activity,
  Building2,
  ArrowLeftRight,
  Heart,
  ClipboardList,
  FileText,
  Gauge,
  BriefcaseMedical,
  ClipboardCheck,
  Sparkles,
} from 'lucide-react';

interface DashboardStats {
  totalSurgeries: number;
  scheduledSurgeries: number;
  totalPatients: number;
  lowStockItems: number;
  pendingTransfers: number;
  todaySurgeries: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({
    totalSurgeries: 0,
    scheduledSurgeries: 0,
    totalPatients: 0,
    lowStockItems: 0,
    pendingTransfers: 0,
    todaySurgeries: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const response = await fetch('/api/dashboard/stats');
      if (response.ok) {
        const data = await response.json();
        // Validate that we got a proper stats object, not an error
        if (data && typeof data === 'object' && !data.error && typeof data.totalSurgeries === 'number') {
          setStats(data);
        } else {
          console.error('Invalid dashboard stats response:', data);
          // Keep default stats (zeros) if response is invalid
        }
      } else {
        console.error('Failed to fetch dashboard stats, status:', response.status);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Total Surgeries',
      value: stats.totalSurgeries,
      icon: Calendar,
      color: 'bg-gradient-to-br from-primary-500 to-primary-600',
      link: '/dashboard/surgeries',
    },
    {
      title: 'Scheduled Today',
      value: stats.todaySurgeries,
      icon: Activity,
      color: 'bg-gradient-to-br from-secondary-500 to-secondary-600',
      link: '/dashboard/surgeries',
    },
    {
      title: 'Total Patients',
      value: stats.totalPatients,
      icon: Users,
      color: 'bg-gradient-to-br from-accent-500 to-accent-600',
      link: '/dashboard/patients',
    },
    {
      title: 'Low Stock Items',
      value: stats.lowStockItems,
      icon: AlertCircle,
      color: 'bg-gradient-to-br from-red-500 to-red-600',
      link: '/dashboard/inventory',
    },
    {
      title: 'Scheduled Surgeries',
      value: stats.scheduledSurgeries,
      icon: TrendingUp,
      color: 'bg-gradient-to-br from-blue-500 to-blue-600',
      link: '/dashboard/surgeries',
    },
    {
      title: 'Theatre Suites',
      value: '-',
      icon: Building2,
      color: 'bg-gradient-to-br from-purple-500 to-purple-600',
      link: '/dashboard/theatres',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-xl">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-primary-600 to-secondary-600 rounded-2xl p-8 text-white shadow-xl">
        <h1 className="text-4xl font-bold">Dashboard Overview</h1>
        <p className="text-primary-100 mt-2 text-lg">
          Theatre management system for University of Nigeria Teaching Hospital Ituku Ozalla
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((stat) => (
          <div 
            key={stat.title} 
            onClick={() => router.push(stat.link)}
            className="card hover:scale-105 transition-transform duration-200 cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                <p className="text-4xl font-bold mt-2 bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent">
                  {stat.value}
                </p>
              </div>
              <div className={`${stat.color} p-4 rounded-xl shadow-lg`}>
                <stat.icon className="w-8 h-8 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="card">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button 
            onClick={() => router.push('/dashboard/surgeries/new')}
            className="btn-primary flex items-center justify-center space-x-2"
          >
            <Calendar className="w-5 h-5" />
            <span>Schedule Surgery</span>
          </button>
          <button 
            onClick={() => router.push('/dashboard/patients/new')}
            className="btn-primary flex items-center justify-center space-x-2"
          >
            <Users className="w-5 h-5" />
            <span>Add Patient</span>
          </button>
          <button 
            onClick={() => router.push('/dashboard/transfers/new')}
            className="btn-primary flex items-center justify-center space-x-2"
          >
            <ArrowLeftRight className="w-5 h-5" />
            <span>Record Transfer</span>
          </button>
          <button 
            onClick={() => router.push('/dashboard/inventory/new')}
            className="btn-primary flex items-center justify-center space-x-2"
          >
            <Package className="w-5 h-5" />
            <span>Add Inventory</span>
          </button>
          <button 
            onClick={() => router.push('/dashboard/theatres')}
            className="btn-secondary flex items-center justify-center space-x-2"
          >
            <Building2 className="w-5 h-5" />
            <span>Theatre Allocation</span>
          </button>
          <button 
            onClick={() => router.push('/dashboard/theatre-readiness')}
            className="btn-secondary flex items-center justify-center space-x-2 relative"
          >
            <Gauge className="w-5 h-5" />
            <span>Theatre Readiness</span>
            <span className="absolute -top-1 -right-1 bg-accent-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">NEW</span>
          </button>
          <button 
            onClick={() => router.push('/dashboard/anesthesia-setup')}
            className="btn-secondary flex items-center justify-center space-x-2 relative"
          >
            <BriefcaseMedical className="w-5 h-5" />
            <span>Anesthesia Setup</span>
            <span className="absolute -top-1 -right-1 bg-accent-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">NEW</span>
          </button>
          <button 
            onClick={() => router.push('/dashboard/reports/staff-effectiveness')}
            className="btn-secondary flex items-center justify-center space-x-2 relative"
          >
            <TrendingUp className="w-5 h-5" />
            <span>Staff Analytics</span>
            <span className="absolute -top-1 -right-1 bg-accent-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">NEW</span>
          </button>
        </div>
      </div>

      {/* Quick Duty Logging for Cleaners & Porters */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <ClipboardCheck className="w-6 h-6 text-blue-600" />
              Quick Duty Logging
            </h3>
            <span className="badge badge-primary">Cleaners & Porters</span>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Staff can quickly log their cleaning, transport, and other duties using their staff codes
          </p>
          <Link href="/auth/login" className="btn-primary inline-flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Go to Quick Logging
          </Link>
        </div>

        <div className="card bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Activity className="w-6 h-6 text-purple-600" />
              Staff Effectiveness
            </h3>
            <span className="badge badge-secondary">Analytics</span>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            View performance metrics, work logs, and productivity analytics for cleaning and porter staff
          </p>
          <Link href="/dashboard/reports/staff-effectiveness" className="btn-secondary inline-flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            View Analytics
          </Link>
        </div>
      </div>

      {/* Module Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-green-600 p-3 rounded-lg">
              <Gauge className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-lg font-bold text-gray-800">Theatre Readiness</h3>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Real-time status of all theatres with setup completion, location tracking, and equipment readiness
          </p>
          <Link href="/dashboard/theatre-readiness" className="text-green-600 hover:text-green-700 font-semibold text-sm flex items-center gap-1">
            View Status Dashboard →
          </Link>
        </div>

        <div className="card bg-gradient-to-br from-orange-50 to-amber-50 border-2 border-orange-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-orange-600 p-3 rounded-lg">
              <BriefcaseMedical className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-lg font-bold text-gray-800">Anesthesia Setup</h3>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Daily equipment checks, setup logging with geolocation, and malfunction alerts for technicians
          </p>
          <Link href="/dashboard/anesthesia-setup" className="text-orange-600 hover:text-orange-700 font-semibold text-sm flex items-center gap-1">
            Start Setup Logging →
          </Link>
        </div>

        <div className="card bg-gradient-to-br from-cyan-50 to-sky-50 border-2 border-cyan-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-cyan-600 p-3 rounded-lg">
              <ClipboardCheck className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-lg font-bold text-gray-800">Staff Duty Tracking</h3>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Track cleaning sessions, patient transports, and other duties with timestamps and performance metrics
          </p>
          <Link href="/dashboard/reports/staff-effectiveness" className="text-cyan-600 hover:text-cyan-700 font-semibold text-sm flex items-center gap-1">
            View Work Logs →
          </Link>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
        <p className="text-gray-500">No recent activity to display</p>
      </div>
    </div>
  );
}
