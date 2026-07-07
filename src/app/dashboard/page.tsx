'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Calendar,
  Users,
  AlertCircle,
  Activity,
  RefreshCw,
  WifiOff,
  Siren,
  Phone,
  DownloadCloud,
  CheckCircle2,
  CloudOff,
} from 'lucide-react';
import { useState } from 'react';
import { useOfflineData } from '@/lib/useOfflineData';
import { useOfflineContext } from '@/components/OfflineProvider';
import MyTheatreTeam from '@/components/MyTheatreTeam';

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
  const { isOnline, downloadAppShellNow, isDownloadingShell, isFullyCached } = useOfflineContext();
  // Local feedback shown briefly after a manual full download completes.
  const [downloadDone, setDownloadDone] = useState(false);

  const handleDownloadShell = async () => {
    setDownloadDone(false);
    await downloadAppShellNow();
    setDownloadDone(true);
    setTimeout(() => setDownloadDone(false), 6000);
  };

  // Offline-aware stats fetch. The heavy analytics/charts were removed so the
  // dashboard renders instantly from a single lightweight stats call.
  const {
    data: stats,
    loading,
    isCached: statsCached,
    isOffline: statsOffline,
  } = useOfflineData<DashboardStats>('/api/dashboard/stats', {
    cacheKey: 'dashboard-stats',
    cacheTtl: 60 * 60 * 1000, // 1 hour
    fallback: {
      totalSurgeries: 0,
      scheduledSurgeries: 0,
      totalPatients: 0,
      lowStockItems: 0,
      pendingTransfers: 0,
      todaySurgeries: 0,
    },
    transform: (data: unknown) => {
      const d = data as Record<string, unknown>;
      if (d && typeof d === 'object' && !d.error && typeof d.totalSurgeries === 'number') {
        return d as unknown as DashboardStats;
      }
      return {
        totalSurgeries: 0,
        scheduledSurgeries: 0,
        totalPatients: 0,
        lowStockItems: 0,
        pendingTransfers: 0,
        todaySurgeries: 0,
      };
    },
    refetchInterval: 120000,
  });

  const statCards = [
    {
      title: 'Total Surgeries',
      value: stats?.totalSurgeries ?? 0,
      icon: Calendar,
      color: 'bg-gradient-to-br from-primary-500 to-primary-600',
      link: '/dashboard/surgeries',
    },
    {
      title: 'Scheduled Today',
      value: stats?.todaySurgeries ?? 0,
      icon: Activity,
      color: 'bg-gradient-to-br from-secondary-500 to-secondary-600',
      link: '/dashboard/surgeries',
    },
    {
      title: 'Total Patients',
      value: stats?.totalPatients ?? 0,
      icon: Users,
      color: 'bg-gradient-to-br from-accent-500 to-accent-600',
      link: '/dashboard/patients',
    },
    {
      title: 'Low Stock Items',
      value: stats?.lowStockItems ?? 0,
      icon: AlertCircle,
      color: 'bg-gradient-to-br from-red-500 to-red-600',
      link: '/dashboard/inventory',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Offline Banner */}
      {(statsOffline || !isOnline) && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex items-center gap-3">
          <WifiOff className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">You are viewing offline data</p>
            <p className="text-xs text-amber-600">Data shown below is from your last successful sync. Changes will sync when you reconnect.</p>
          </div>
        </div>
      )}

      {/* Cached data indicator */}
      {statsCached && isOnline && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 flex items-center gap-2 text-xs text-blue-700">
          <RefreshCw className="w-3 h-3" />
          <span>Showing cached data — refreshing in background</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-secondary-600 rounded-2xl p-8 text-white shadow-xl">
        <h1 className="text-4xl font-bold">Dashboard Overview</h1>
        <p className="text-primary-100 mt-2 text-lg">
          Theatre management system for University of Nigeria Teaching Hospital Ituku Ozalla
        </p>
      </div>

      {/* Manual full download — precache every module & form for instant, offline
          loading on this device, and sync any pending changes to the cloud. */}
      <div className="bg-white border-2 border-indigo-200 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="bg-indigo-600 p-3 rounded-xl flex-shrink-0">
            <DownloadCloud className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-gray-900">Download app for offline use</h2>
            <p className="text-sm text-gray-600">
              Cache all modules &amp; forms on this phone for fast loading, then sync new data with the cloud.
            </p>
            {downloadDone && (
              <p className="text-xs text-green-700 font-medium mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Download complete — all modules are ready offline.
              </p>
            )}
            {isFullyCached && !downloadDone && !isDownloadingShell && (
              <p className="text-xs text-gray-500 mt-1">Data is cached for offline use. Tap to refresh &amp; cache all forms.</p>
            )}
          </div>
        </div>
        <button
          onClick={handleDownloadShell}
          disabled={isDownloadingShell || !isOnline}
          className="inline-flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold px-5 py-3 rounded-xl hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition whitespace-nowrap"
          title={!isOnline ? 'Connect to the internet to download' : 'Download all modules and forms for offline use'}
        >
          {isDownloadingShell ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" /> Downloading…
            </>
          ) : !isOnline ? (
            <>
              <CloudOff className="w-5 h-5" /> Offline
            </>
          ) : (
            <>
              <DownloadCloud className="w-5 h-5" /> Download all
            </>
          )}
        </button>
      </div>

      {/* Compact emergency access — the two most critical links only. The large
          multi-button quick-access grid and charts were removed for speed. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/dashboard/emergency-booking"
          className="flex items-center gap-3 bg-gradient-to-r from-red-600 to-orange-500 text-white rounded-xl p-4 shadow hover:opacity-95 transition"
        >
          <Siren className="w-6 h-6 flex-shrink-0" />
          <span className="font-semibold">Emergency Booking</span>
        </Link>
        <Link
          href="/dashboard/call-for-patient"
          className="flex items-center gap-3 bg-gradient-to-r from-teal-600 to-cyan-500 text-white rounded-xl p-4 shadow hover:opacity-95 transition"
        >
          <Phone className="w-6 h-6 flex-shrink-0" />
          <span className="font-semibold">Call for Patient</span>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => (
          <div
            key={stat.title}
            onClick={() => router.push(stat.link)}
            className="card hover:scale-105 transition-transform duration-200 cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
              </div>
              <div className={`${stat.color} p-4 rounded-xl`}>
                <stat.icon className="w-8 h-8 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* My Theatre Team — surgeon unit + date lookup */}
      <MyTheatreTeam />
    </div>
  );
}
