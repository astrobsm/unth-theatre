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
import { getOfflineQueueCount, processOfflineQueue, isIndexedDBAvailable } from '@/lib/offlineStore';
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
  const prefetchingRef = useRef(false);
  const syncingRef = useRef(false);
  const syncIntervalRef = useRef<NodeJS.Timeout>();

  // Register service worker and install global fetch interceptor AFTER first paint
  useEffect(() => {
    // Defer heavy offline setup so the page renders instantly
    const raf = requestAnimationFrame(() => {
      const timer = setTimeout(() => {
        // Install global fetch interceptor so ALL API calls get offline fallback
        installFetchInterceptor();

        registerServiceWorker().then((reg) => {
          if (reg) {
            setSwRegistered(true);
            // Pre-cache app shell pages — run after a further delay
            setTimeout(() => {
              precacheAppShell();
              registerPeriodicSync();
            }, 5000);
          }
        }).catch(() => {
          // SW registration failed — silently continue without offline support
        });
      }, 2000); // 2s delay to let the main UI become interactive first

      return () => clearTimeout(timer);
    });

    return () => {
      cancelAnimationFrame(raf);
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
    // Use ref for guard to avoid re-render dependency
    if (prefetchingRef.current) return;
    if (!isIndexedDBAvailable()) return;
    prefetchingRef.current = true;
    setIsPrefetching(true);

    try {
      // Cache session for offline auth
      await cacheSessionForOffline();

      // Prefetch all API data
      const status = await prefetchAllOfflineData();
      setPrefetchStatus(status);
      setIsFullyCached(status.isFullyCached);
    } catch (err) {
      // Log once, don't spam console
      console.warn('[OfflineProvider] Prefetch error:', (err as Error)?.message || err);
    } finally {
      prefetchingRef.current = false;
      setIsPrefetching(false);
    }
  }, []);

  // Sync pending mutations
  const syncPendingMutations = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    if (!isIndexedDBAvailable()) return;
    syncingRef.current = true;
    setIsSyncing(true);
    try {
      const result = await processOfflineQueue();
      setPendingSyncCount(result.remaining);
    } catch {
      // Sync failed — silently continue
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, []);

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

  // Poll pending sync count (only if IndexedDB is available)
  useEffect(() => {
    if (!isIndexedDBAvailable()) return;

    const checkPending = async () => {
      try {
        const count = await getOfflineQueueCount();
        setPendingSyncCount(count);
      } catch {
        // IndexedDB unavailable — stop polling
      }
    };

    checkPending();
    syncIntervalRef.current = setInterval(checkPending, 10000);

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, []);

  // Listen for SW sync-complete messages
  useEffect(() => {
    if (!isIndexedDBAvailable()) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_COMPLETE') {
        getOfflineQueueCount().then(setPendingSyncCount).catch(() => {});
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
