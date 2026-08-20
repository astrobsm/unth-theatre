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
  ClipboardList,
} from 'lucide-react';
import { useState } from 'react';
import { useOfflineContext } from '@/components/OfflineProvider';
import MyTheatreTeam from '@/components/MyTheatreTeam';
import PersonalBoard from '@/components/PersonalBoard';
import PerioperativeTracker from '@/components/PerioperativeTracker';

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

  // ── The figures are fetched ONLY when somebody asks for them ─────────────
  //
  // This page used to open with `useOfflineData('/api/dashboard/stats')` and
  // then `if (loading) return <spinner>`. So the whole dashboard — the personal
  // board, the patient tracker, the emergency links — was held behind five
  // COUNT queries over every surgery, patient and transfer in the hospital. On
  // a poor link that is the difference between a usable screen and a spinner,
  // and it was re-polled every two minutes for the rest of the session.
  //
  // Nobody opens the dashboard to read "Total Surgeries: 606". They open it to
  // find their list, book a case, or answer an emergency. The figures are
  // genuinely useful and genuinely occasional, which is exactly what a button
  // is for.
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsState, setStatsState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [statsAt, setStatsAt] = useState<Date | null>(null);

  const loadStats = async () => {
    setStatsState('loading');
    try {
      const res = await fetch('/api/dashboard/stats');
      if (!res.ok) { setStatsState('error'); return; }
      const data = await res.json();
      if (data && typeof data.totalSurgeries === 'number') {
        setStats(data as DashboardStats);
        setStatsAt(new Date());
        setStatsState('idle');
      } else {
        setStatsState('error');
      }
    } catch {
      setStatsState('error');
    }
  };

  const statCards = [
    {
      title: 'Total Surgeries',
      value: stats?.totalSurgeries,
      icon: Calendar,
      color: 'bg-gradient-to-br from-primary-500 to-primary-600',
      link: '/dashboard/surgeries',
    },
    {
      title: 'Scheduled Today',
      value: stats?.todaySurgeries,
      icon: Activity,
      color: 'bg-gradient-to-br from-secondary-500 to-secondary-600',
      link: '/dashboard/surgeries',
    },
    {
      title: 'Total Patients',
      value: stats?.totalPatients,
      icon: Users,
      color: 'bg-gradient-to-br from-accent-500 to-accent-600',
      link: '/dashboard/patients',
    },
    {
      title: 'Low Stock Items',
      value: stats?.lowStockItems,
      icon: AlertCircle,
      color: 'bg-gradient-to-br from-red-500 to-red-600',
      link: '/dashboard/inventory',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex items-center gap-3">
          <WifiOff className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">You are viewing offline data</p>
            <p className="text-xs text-amber-600">Data shown below is from your last successful sync. Changes will sync when you reconnect.</p>
          </div>
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

      {/* What this person must do today, above everything else. A query with a
          deadline and a compulsory duty are worth more of the fold than a
          navigation card. */}
      <PersonalBoard />

      {/* Where this surgeon's patients actually are. Renders nothing for
          anybody with no cases of their own, so it costs the rest of the
          hospital no space at all. */}
      <PerioperativeTracker />

      {/* Compact emergency access — the two most critical links only. The large
          multi-button quick-access grid and charts were removed for speed. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        <Link
          href="/dashboard/case-readiness"
          className="flex items-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-500 text-white rounded-xl p-4 shadow hover:opacity-95 transition"
        >
          <ClipboardList className="w-6 h-6 flex-shrink-0" />
          <span className="font-semibold">Case Pack Readiness</span>
        </Link>
      </div>

      {/* ── Figures, on request ──────────────────────────────────────────────
          The cards are always here and always navigate — they are how people
          reach the surgery list and the patient register, and that must not
          depend on a network call. Only the NUMBERS wait to be asked for.

          Counting every surgery, patient and transfer in the hospital is a real
          query, and it was being run on every dashboard open, blocking the
          page, and repeated every two minutes thereafter — to render four
          figures that change slowly and that nobody opened the dashboard to
          read. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Hospital figures</h2>
        <div className="flex items-center gap-3">
          {statsAt && (
            <span className="text-xs text-gray-500">
              as at {statsAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => void loadStats()}
            disabled={statsState === 'loading' || !isOnline}
            className="inline-flex items-center gap-2 rounded-xl bg-primary-600 text-white font-semibold px-4 py-2.5 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
            title={!isOnline ? 'These figures are counted on the server, so they need a connection' : undefined}
          >
            {statsState === 'loading' ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Counting…</>
            ) : !isOnline ? (
              <><CloudOff className="w-4 h-4" /> Offline</>
            ) : stats ? (
              <><RefreshCw className="w-4 h-4" /> Refresh figures</>
            ) : (
              <><Activity className="w-4 h-4" /> Show figures</>
            )}
          </button>
        </div>
      </div>

      {statsState === 'error' && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          The figures could not be counted just now. Everything else on this page is unaffected — try again in a moment.
        </p>
      )}

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
                {/* An em dash rather than 0. A zero is a claim — "there are no
                    patients" — and it is a false one; this simply has not been
                    counted yet. */}
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {stat.value === undefined ? <span className="text-gray-300">—</span> : stat.value}
                </p>
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
