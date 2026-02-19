'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  prefetchAllOfflineData,
  precacheAppShell,
  registerPeriodicSync,
  cacheSessionForOffline,
  type OfflineDataStatus,
} from '@/lib/offlineDataManager';
import { registerServiceWorker } from '@/lib/pwa';
import { getOfflineQueueCount, processOfflineQueue } from '@/lib/offlineStore';
import { installFetchInterceptor, uninstallFetchInterceptor } from '@/lib/globalFetchInterceptor';

// ============================================================
// Offline Context
// ============================================================
interface OfflineContextValue {
  /** Whether the browser is online */
  isOnline: boolean;
  /** Whether all critical data has been cached for offline use */
  isFullyCached: boolean;
  /** Number of pending offline mutations */
  pendingSyncCount: number;
  /** Whether data is currently being prefetched */
  isPrefetching: boolean;
  /** Last prefetch status */
  prefetchStatus: OfflineDataStatus | null;
  /** Whether service worker is registered */
  swRegistered: boolean;
  /** Manually trigger a full data prefetch */
  prefetchNow: () => Promise<void>;
  /** Manually sync pending offline mutations */
  syncNow: () => Promise<void>;
  /** Whether currently syncing */
  isSyncing: boolean;
}

const OfflineContext = createContext<OfflineContextValue>({
  isOnline: true,
  isFullyCached: false,
  pendingSyncCount: 0,
  isPrefetching: false,
  prefetchStatus: null,
  swRegistered: false,
  prefetchNow: async () => {},
  syncNow: async () => {},
  isSyncing: false,
});

export function useOfflineContext() {
  return useContext(OfflineContext);
}

// ============================================================
// OfflineProvider Component
// ============================================================
export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [isFullyCached, setIsFullyCached] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isPrefetching, setIsPrefetching] = useState(false);
  const [prefetchStatus, setPrefetchStatus] = useState<OfflineDataStatus | null>(null);
  const [swRegistered, setSwRegistered] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const prefetchedRef = useRef(false);
  const syncIntervalRef = useRef<NodeJS.Timeout>();

  // Register service worker and install global fetch interceptor on mount
  useEffect(() => {
    // Install global fetch interceptor so ALL API calls get offline fallback
    installFetchInterceptor();

    registerServiceWorker().then((reg) => {
      if (reg) {
        setSwRegistered(true);
        // Pre-cache app shell pages
        precacheAppShell();
      }
    });

    // Register periodic background sync
    registerPeriodicSync();

    return () => {
      uninstallFetchInterceptor();
    };
  }, []);

  // Track online status
  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      // Auto-sync when back online
      syncPendingMutations();
      // Refresh cached data
      runPrefetch();
    };

    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prefetch all data once when component mounts and user is authenticated
  const runPrefetch = useCallback(async () => {
    if (isPrefetching) return;
    setIsPrefetching(true);

    try {
      // Cache session for offline auth
      await cacheSessionForOffline();

      // Prefetch all API data
      const status = await prefetchAllOfflineData();
      setPrefetchStatus(status);
      setIsFullyCached(status.isFullyCached);
    } catch (err) {
      console.error('[OfflineProvider] Prefetch error:', err);
    } finally {
      setIsPrefetching(false);
    }
  }, [isPrefetching]);

  // Sync pending mutations
  const syncPendingMutations = useCallback(async () => {
    if (isSyncing || !navigator.onLine) return;
    setIsSyncing(true);
    try {
      const result = await processOfflineQueue();
      setPendingSyncCount(result.remaining);
    } catch {
      // Sync failed
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  // Initial prefetch — deferred to avoid blocking initial render
  useEffect(() => {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;

    // Wait 10 seconds so the page renders and becomes interactive first
    const timer = setTimeout(() => {
      runPrefetch();
    }, 10000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll pending sync count
  useEffect(() => {
    const checkPending = async () => {
      try {
        const count = await getOfflineQueueCount();
        setPendingSyncCount(count);
      } catch {}
    };

    checkPending();
    syncIntervalRef.current = setInterval(checkPending, 10000);

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, []);

  // Listen for SW sync-complete messages
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_COMPLETE') {
        getOfflineQueueCount().then(setPendingSyncCount);
      }
    };

    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, []);

  // Periodic data refresh (every 30 minutes while online)
  useEffect(() => {
    if (!isOnline) return;

    const interval = setInterval(() => {
      runPrefetch();
    }, 30 * 60 * 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  const value: OfflineContextValue = {
    isOnline,
    isFullyCached,
    pendingSyncCount,
    isPrefetching,
    prefetchStatus,
    swRegistered,
    prefetchNow: runPrefetch,
    syncNow: syncPendingMutations,
    isSyncing,
  };

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
}
