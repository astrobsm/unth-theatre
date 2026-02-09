'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Wifi,
  WifiOff,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  CloudOff,
  Cloud,
  X,
} from 'lucide-react';
import {
  registerServiceWorker,
  setupInstallPrompt,
  promptInstall,
  canInstall,
  setUpdateHandler,
  applyUpdate,
  isPWAInstalled,
  precacheUrls,
} from '@/lib/pwa';
import {
  getOfflineQueueCount,
  processOfflineQueue,
} from '@/lib/offlineStore';

// Dashboard routes to pre-cache for offline access
const DASHBOARD_ROUTES = [
  '/api/surgeries',
  '/api/patients',
  '/api/inventory',
  '/api/theatres',
  '/api/equipment',
  '/api/sub-stores',
  '/api/roster',
];

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);
  const [showBanner, setShowBanner] = useState(false);
  const [bannerType, setBannerType] = useState<'offline' | 'online' | 'install' | 'update' | 'synced'>('offline');
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [canInstallPWA, setCanInstallPWA] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced: number; failed: number } | null>(null);
  const [installed, setInstalled] = useState(false);

  // Monitor offline queue
  const checkPending = useCallback(async () => {
    try {
      const count = await getOfflineQueueCount();
      setPendingCount(count);
    } catch {
      // IndexedDB not available
    }
  }, []);

  // Sync pending items
  const handleSync = useCallback(async () => {
    if (isSyncing || !isOnline) return;
    setIsSyncing(true);
    try {
      const result = await processOfflineQueue();
      setSyncResult({ synced: result.synced, failed: result.failed });
      setPendingCount(result.remaining);
      if (result.synced > 0) {
        setBannerType('synced');
        setShowBanner(true);
        setTimeout(() => setShowBanner(false), 4000);
      }
    } catch {
      // sync failed
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, isOnline]);

  useEffect(() => {
    // Set initial state
    setIsOnline(navigator.onLine);
    setInstalled(isPWAInstalled());

    // Register service worker
    registerServiceWorker().then(() => {
      // Pre-cache dashboard API routes
      precacheUrls(DASHBOARD_ROUTES);
    });

    // Install prompt
    const cleanupInstall = setupInstallPrompt(() => {
      setCanInstallPWA(true);
    });

    // Update handler
    setUpdateHandler(() => {
      setUpdateAvailable(true);
      setBannerType('update');
      setShowBanner(true);
    });

    // Online/offline listeners
    const goOnline = () => {
      setIsOnline(true);
      setBannerType('online');
      setShowBanner(true);
      setTimeout(() => setShowBanner(false), 3000);
      // Auto-sync when back online
      checkPending().then(() => {
        if (pendingCount > 0) handleSync();
      });
    };

    const goOffline = () => {
      setIsOnline(false);
      setBannerType('offline');
      setShowBanner(true);
    };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    // Listen for sync complete from SW
    const onSyncComplete = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.synced > 0) {
        setSyncResult({ synced: detail.synced, failed: 0 });
        setBannerType('synced');
        setShowBanner(true);
        setTimeout(() => setShowBanner(false), 4000);
      }
      checkPending();
    };
    window.addEventListener('sw-sync-complete', onSyncComplete);

    // Check pending count periodically
    checkPending();
    const interval = setInterval(checkPending, 15000);

    return () => {
      cleanupInstall();
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('sw-sync-complete', onSyncComplete);
      clearInterval(interval);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInstall = async () => {
    const accepted = await promptInstall();
    if (accepted) {
      setCanInstallPWA(false);
      setInstalled(true);
    }
  };

  return (
    <>
      {/* Persistent status dot in header area */}
      <div className="flex items-center gap-2">
        {/* Online/Offline dot */}
        <div className="flex items-center gap-1.5" title={isOnline ? 'Online' : 'Offline'}>
          <span className={`w-2.5 h-2.5 rounded-full ${
            isOnline ? 'bg-green-500 shadow-green-400' : 'bg-red-500 animate-pulse'
          } shadow-sm`} />
          <span className="text-xs text-gray-500 hidden sm:inline">
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>

        {/* Pending sync count */}
        {pendingCount > 0 && (
          <button
            onClick={handleSync}
            disabled={isSyncing || !isOnline}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-amber-100 text-amber-800 rounded-full hover:bg-amber-200 transition-colors disabled:opacity-50"
            title={`${pendingCount} pending changes to sync`}
          >
            <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
            {pendingCount}
          </button>
        )}

        {/* Install button */}
        {canInstallPWA && !installed && (
          <button
            onClick={handleInstall}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-colors"
            title="Install app"
          >
            <Download className="w-3 h-3" />
            <span className="hidden sm:inline">Install</span>
          </button>
        )}

        {/* Update available */}
        {updateAvailable && (
          <button
            onClick={applyUpdate}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded-full hover:bg-purple-200 transition-colors animate-pulse"
            title="Update available"
          >
            <RefreshCw className="w-3 h-3" />
            <span className="hidden sm:inline">Update</span>
          </button>
        )}
      </div>

      {/* Slide-down banner */}
      {showBanner && (
        <div className={`fixed top-0 left-0 right-0 z-[60] transition-transform duration-300 ${
          showBanner ? 'translate-y-0' : '-translate-y-full'
        }`}>
          <div className={`flex items-center justify-between px-4 py-3 text-sm font-medium shadow-lg ${
            bannerType === 'offline' ? 'bg-red-600 text-white' :
            bannerType === 'online' ? 'bg-green-600 text-white' :
            bannerType === 'synced' ? 'bg-blue-600 text-white' :
            bannerType === 'update' ? 'bg-purple-600 text-white' :
            'bg-blue-600 text-white'
          }`}>
            <div className="flex items-center gap-2">
              {bannerType === 'offline' && (
                <>
                  <CloudOff className="w-4 h-4" />
                  <span>You&apos;re offline — changes will sync when reconnected</span>
                </>
              )}
              {bannerType === 'online' && (
                <>
                  <Cloud className="w-4 h-4" />
                  <span>Back online{pendingCount > 0 ? ` — syncing ${pendingCount} pending changes...` : ''}</span>
                </>
              )}
              {bannerType === 'synced' && (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{syncResult?.synced || 0} changes synced successfully{syncResult?.failed ? `, ${syncResult.failed} failed` : ''}</span>
                </>
              )}
              {bannerType === 'update' && (
                <>
                  <AlertCircle className="w-4 h-4" />
                  <span>A new version is available</span>
                  <button
                    onClick={applyUpdate}
                    className="ml-2 px-3 py-1 bg-white/20 rounded-full text-xs hover:bg-white/30 transition-colors"
                  >
                    Update now
                  </button>
                </>
              )}
            </div>
            <button onClick={() => setShowBanner(false)} className="p-1 hover:bg-white/20 rounded transition-colors" aria-label="Dismiss">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
