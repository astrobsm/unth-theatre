'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  Settings, RefreshCw, Download, Wifi, WifiOff, Database,
  Bell, Clock, Shield, CheckCircle, AlertTriangle, Smartphone,
  Trash2, HardDrive
} from 'lucide-react';

interface CacheStatus {
  staticAssets: number;
  cachedApiRoutes: number;
  cachedPages: number;
  version: string;
}

interface SyncStatus {
  pendingMutations: number;
  lastSync: string | null;
  offlineDataCached: boolean;
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const [isOnline, setIsOnline] = useState(true);
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    pendingMutations: 0,
    lastSync: null,
    offlineDataCached: false,
  });
  const [syncing, setSyncing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [prefetching, setPrefetching] = useState(false);
  const [deadlineCheckResult, setDeadlineCheckResult] = useState<any>(null);
  const [checkingDeadlines, setCheckingDeadlines] = useState(false);
  const [swRegistered, setSwRegistered] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Check SW registration and cache status
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(() => setSwRegistered(true)).catch(() => {});

      // Request cache status from SW
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'CACHE_STATUS') {
          setCacheStatus(event.data.payload);
        }
        if (event.data?.type === 'CACHES_CLEARED') {
          setMessage({ type: 'success', text: 'All caches cleared successfully' });
          setClearingCache(false);
          // Re-fetch cache status
          requestCacheStatus();
        }
      });

      requestCacheStatus();
    }

    // Check IndexedDB for pending queue count
    checkSyncStatus();
  }, []);

  const requestCacheStatus = () => {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'GET_CACHE_STATUS' });
    }
  };

  const checkSyncStatus = async () => {
    try {
      const { getOfflineQueueCount, getCachedData } = await import('@/lib/offlineStore');
      const count = await getOfflineQueueCount();
      const syncMeta = await getCachedData<{ timestamp: number }>('offline-sync-status');
      setSyncStatus({
        pendingMutations: count,
        lastSync: syncMeta?.data ? new Date((syncMeta.data as any).lastFullSync || syncMeta.cachedAt).toLocaleString() : null,
        offlineDataCached: !!syncMeta,
      });
    } catch (e) {
      console.error('Error checking sync status:', e);
    }
  };

  // Manual Sync: Push pending offline changes to server
  const handleManualSync = async () => {
    if (!isOnline) {
      setMessage({ type: 'error', text: 'Cannot sync while offline. Please connect to the internet first.' });
      return;
    }
    setSyncing(true);
    setMessage(null);
    try {
      const { processOfflineQueue } = await import('@/lib/offlineStore');
      const result = await processOfflineQueue();
      setMessage({
        type: 'success',
        text: `Sync complete: ${result.synced} changes synced, ${result.failed} failed, ${result.remaining} remaining`,
      });
      await checkSyncStatus();
    } catch (e) {
      setMessage({ type: 'error', text: 'Sync failed. Please try again.' });
    } finally {
      setSyncing(false);
    }
  };

  // Manual Data Prefetch: Pull latest data from server to device
  const handlePrefetchData = async () => {
    if (!isOnline) {
      setMessage({ type: 'error', text: 'Cannot fetch data while offline.' });
      return;
    }
    setPrefetching(true);
    setMessage(null);
    try {
      const { prefetchAllOfflineData, precacheAppShell, cacheSessionForOffline } = await import('@/lib/offlineDataManager');
      await cacheSessionForOffline();
      const status = await prefetchAllOfflineData();
      precacheAppShell();
      setMessage({
        type: 'success',
        text: `Data cached: ${status.cachedEndpoints}/${status.totalEndpoints} endpoints. ${status.failedEndpoints.length > 0 ? `Failed: ${status.failedEndpoints.join(', ')}` : 'All data cached successfully!'}`,
      });
      await checkSyncStatus();
      requestCacheStatus();
    } catch (e) {
      setMessage({ type: 'error', text: 'Data prefetch failed. Please try again.' });
    } finally {
      setPrefetching(false);
    }
  };

  // Check for App Updates
  const handleCheckUpdate = async () => {
    setUpdating(true);
    setMessage(null);
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        await reg.update();
        // Check if there's a waiting worker
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          setMessage({ type: 'success', text: 'App update found and installing! The page will reload shortly...' });
          setTimeout(() => window.location.reload(), 2000);
        } else {
          setMessage({ type: 'info', text: 'App is up to date. No new version available.' });
        }
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Failed to check for updates.' });
    } finally {
      setUpdating(false);
    }
  };

  // Clear all caches
  const handleClearCache = async () => {
    setClearingCache(true);
    setMessage(null);
    try {
      // Clear IndexedDB cached data
      const { clearExpiredCache } = await import('@/lib/offlineStore');
      await clearExpiredCache();

      // Tell SW to clear caches
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHES' });
      }
      setMessage({ type: 'success', text: 'Caches cleared. Re-caching fresh data...' });
      // Re-prefetch after clearing
      setTimeout(() => handlePrefetchData(), 1500);
    } catch (e) {
      setMessage({ type: 'error', text: 'Failed to clear caches.' });
      setClearingCache(false);
    }
  };

  // Run Deadline Check (admin only)
  const handleDeadlineCheck = async () => {
    setCheckingDeadlines(true);
    setMessage(null);
    try {
      const res = await fetch('/api/deadline-checker?action=check-all');
      if (res.ok) {
        const data = await res.json();
        setDeadlineCheckResult(data);
        setMessage({
          type: 'success',
          text: `Deadline check complete: ${data.reminders?.length || 0} reminders sent, ${data.queries?.length || 0} queries issued`,
        });
      } else {
        setMessage({ type: 'error', text: 'Deadline check failed' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Failed to run deadline check' });
    } finally {
      setCheckingDeadlines(false);
    }
  };

  const isAdmin = session?.user?.role && ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC', 'THEATRE_MANAGER'].includes(session.user.role);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="h-7 w-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 text-sm">App updates, data sync, and system management</p>
        </div>
      </div>

      {/* Status Message */}
      {message && (
        <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
          message.type === 'success' ? 'bg-green-50 border border-green-300 text-green-800' :
          message.type === 'error' ? 'bg-red-50 border border-red-300 text-red-800' :
          'bg-blue-50 border border-blue-300 text-blue-800'
        }`}>
          {message.type === 'success' ? <CheckCircle className="h-5 w-5" /> :
           message.type === 'error' ? <AlertTriangle className="h-5 w-5" /> :
           <Bell className="h-5 w-5" />}
          <span className="text-sm">{message.text}</span>
        </div>
      )}

      {/* Connection Status */}
      <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${isOnline ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
        {isOnline ? <Wifi className="h-6 w-6 text-green-600" /> : <WifiOff className="h-6 w-6 text-red-600" />}
        <div>
          <p className="font-semibold">{isOnline ? 'Online' : 'Offline'}</p>
          <p className="text-sm text-gray-600">{isOnline ? 'Connected to server. All features available.' : 'Working offline. Changes will sync when reconnected.'}</p>
        </div>
      </div>

      <div className="grid gap-6">
        {/* App Update Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Download className="h-5 w-5 text-blue-600" />
            App Updates
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Check for the latest version of the app. Updates include bug fixes, new features, and security patches.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleCheckUpdate}
              disabled={updating}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 font-medium"
            >
              {updating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {updating ? 'Checking...' : 'Check for Updates'}
            </button>
          </div>
          {cacheStatus && (
            <div className="mt-4 text-sm text-gray-500">
              Service Worker Version: <strong>{cacheStatus.version}</strong> | 
              SW Registered: <strong>{swRegistered ? 'Yes' : 'No'}</strong>
            </div>
          )}
        </div>

        {/* Data Sync Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Database className="h-5 w-5 text-green-600" />
            Data Sync
          </h2>
          <p className="text-sm text-gray-600 mb-2">
            Synchronize data between this device and the server database.
          </p>

          {/* Sync Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-orange-600">{syncStatus.pendingMutations}</p>
              <p className="text-xs text-gray-600">Pending Changes</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-600">{cacheStatus?.cachedApiRoutes || 0}</p>
              <p className="text-xs text-gray-600">Cached API Routes</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{cacheStatus?.cachedPages || 0}</p>
              <p className="text-xs text-gray-600">Cached Pages</p>
            </div>
          </div>

          {syncStatus.lastSync && (
            <p className="text-xs text-gray-500 mb-4">Last sync: {syncStatus.lastSync}</p>
          )}

          <div className="flex flex-wrap gap-3">
            {/* Push: Sync pending offline changes to server */}
            <button
              onClick={handleManualSync}
              disabled={syncing || !isOnline}
              className="px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 font-medium"
            >
              {syncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {syncing ? 'Syncing...' : 'Sync to Server (Push)'}
            </button>

            {/* Pull: Fetch latest data from server to device */}
            <button
              onClick={handlePrefetchData}
              disabled={prefetching || !isOnline}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 font-medium"
            >
              {prefetching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
              {prefetching ? 'Caching Data...' : 'Sync from Server (Pull)'}
            </button>

            {/* Clear & Re-sync */}
            <button
              onClick={handleClearCache}
              disabled={clearingCache}
              className="px-4 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2 font-medium"
            >
              {clearingCache ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {clearingCache ? 'Clearing...' : 'Clear Cache & Re-sync'}
            </button>
          </div>
        </div>

        {/* Device Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-purple-600" />
            Device Information
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="flex justify-between bg-gray-50 p-3 rounded">
              <span className="text-gray-600">User Agent</span>
              <span className="font-mono text-xs truncate ml-2 max-w-[200px]">{typeof navigator !== 'undefined' ? navigator.userAgent.split(' ').pop() : 'N/A'}</span>
            </div>
            <div className="flex justify-between bg-gray-50 p-3 rounded">
              <span className="text-gray-600">Online Status</span>
              <span className={`font-semibold ${isOnline ? 'text-green-600' : 'text-red-600'}`}>{isOnline ? 'Connected' : 'Offline'}</span>
            </div>
            <div className="flex justify-between bg-gray-50 p-3 rounded">
              <span className="text-gray-600">Service Worker</span>
              <span className={`font-semibold ${swRegistered ? 'text-green-600' : 'text-yellow-600'}`}>{swRegistered ? 'Active' : 'Not Registered'}</span>
            </div>
            <div className="flex justify-between bg-gray-50 p-3 rounded">
              <span className="text-gray-600">SW Version</span>
              <span className="font-semibold">{cacheStatus?.version || 'Unknown'}</span>
            </div>
            <div className="flex justify-between bg-gray-50 p-3 rounded">
              <span className="text-gray-600">Logged In As</span>
              <span className="font-semibold">{session?.user?.name || 'N/A'}</span>
            </div>
            <div className="flex justify-between bg-gray-50 p-3 rounded">
              <span className="text-gray-600">Role</span>
              <span className="font-semibold">{session?.user?.role?.replace(/_/g, ' ') || 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Admin Only: Deadline Checker */}
        {isAdmin && (
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-red-600" />
              Readiness Deadline Monitor (Admin)
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Manually trigger the deadline check system. This checks if CSSD, Laundry, Power House, Oxygen, and Theatre Technicians have submitted their reports on time.
            </p>
            <div className="bg-yellow-50 p-3 rounded-lg text-sm text-yellow-800 mb-4">
              <strong>Schedules:</strong><br />
              • CSSD, Laundry, Power, Oxygen: Reminders from 4:45 PM, deadline 5:00 PM, query at 6:00 PM<br />
              • Theatre Technicians: Reminder at 7:45 AM, deadline 8:00 AM, query at 8:15 AM (auto-escalates to CMD)
            </div>
            <button
              onClick={handleDeadlineCheck}
              disabled={checkingDeadlines || !isOnline}
              className="px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2 font-medium"
            >
              {checkingDeadlines ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
              {checkingDeadlines ? 'Checking...' : 'Run Deadline Check Now'}
            </button>

            {deadlineCheckResult && (
              <div className="mt-4 bg-gray-50 rounded-lg p-4 text-sm">
                <p className="font-semibold mb-2">Results:</p>
                <p>Reminders sent: <strong>{deadlineCheckResult.reminders?.length || 0}</strong></p>
                <p>Queries issued: <strong>{deadlineCheckResult.queries?.length || 0}</strong></p>
                {deadlineCheckResult.queries?.length > 0 && (
                  <div className="mt-2">
                    <p className="font-semibold text-red-700">Queries Issued:</p>
                    {deadlineCheckResult.queries.map((q: any, i: number) => (
                      <div key={i} className="ml-2 mt-1 text-xs">
                        • {q.name} ({q.unit}) — Ref: {q.queryRef}
                        {q.escalated && <span className="text-red-600 font-bold ml-1">[ESCALATED TO CMD]</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
