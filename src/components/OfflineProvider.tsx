'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  prefetchAllOfflineData,
  registerPeriodicSync,
  cacheSessionForOffline,
  type OfflineDataStatus,
} from '@/lib/offlineDataManager';
import { registerServiceWorker } from '@/lib/pwa';
import { getOfflineQueueCount, processOfflineQueue, isIndexedDBAvailable } from '@/lib/offlineStore';
import { installFetchInterceptor, uninstallFetchInterceptor } from '@/lib/globalFetchInterceptor';
import { MODULES } from '@/lib/modules';

// Precache the app's module routes for full offline use, in small batches well
// after first paint so it never causes a request storm. Runs once per session.
async function warmUpOfflineRoutes() {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sw = reg.active || navigator.serviceWorker.controller;
    if (!sw) return;
    // Unique route list from the module catalog + the app shell.
    const routes = Array.from(
      new Set<string>(['/dashboard', ...MODULES.flatMap((m) => m.paths)])
    ).filter((p) => p.startsWith('/dashboard'));
    const BATCH = 4;
    for (let i = 0; i < routes.length; i += BATCH) {
      sw.postMessage({ type: 'PRECACHE_PAGES', urls: routes.slice(i, i + BATCH) });
      // Space the batches out so the network is never saturated.
      await new Promise((r) => setTimeout(r, 1500));
    }
  } catch {
    /* best-effort precache — never block the app */
  }
}

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
  const warmedUpRef = useRef(false);
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
            // Register periodic background sync only. We deliberately do NOT
            // crawl/precache every module page on load — that request storm
            // slowed the whole app. The SW caches pages as you actually visit
            // them, which keeps navigation fast and still works offline.
            setTimeout(() => {
              registerPeriodicSync();
            }, 5000);
            // One-time, heavily-deferred, batched warm-up so the installed app
            // has every module route available offline. Runs long after first
            // paint and only when online, so it never slows the initial load.
            if (!warmedUpRef.current && navigator.onLine) {
              warmedUpRef.current = true;
              setTimeout(() => {
                warmUpOfflineRoutes();
              }, 20000);
            }
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
      // Drain any mutations that were queued while offline. We do NOT re-prefetch
      // all data here — that storm made reconnects (e.g. flaky links) sluggish.
      syncPendingMutations();
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

  // COMPREHENSIVE WARM-UP — caches the session, all API data and every module
  // page so the entire app keeps working if the network drops after login.
  const runFullWarmUp = useCallback(async () => {
    if (warmedUpRef.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (!isIndexedDBAvailable()) return;
    // Only warm up for authenticated users (avoid 401 storms on login screen).
    try {
      const sessionRes = await fetch('/api/auth/session');
      const session = sessionRes.ok ? await sessionRes.json() : null;
      if (!session?.user) return; // not logged in yet
    } catch {
      return;
    }
    warmedUpRef.current = true;
    setIsPrefetching(true);
    try {
      // Lightweight warm-up only: cache the session so auth survives a brief
      // network drop. We intentionally skip prefetching every API endpoint and
      // crawling every page \u2014 that proactive storm degraded overall speed.
      await cacheSessionForOffline();
    } catch {
      warmedUpRef.current = false; // allow a later retry
    } finally {
      setIsPrefetching(false);
    }
  }, []);

  // Initial warm-up — deferred slightly so the page renders first. Also fires
  // immediately when the login flow dispatches 'orm:app-warmup'.
  useEffect(() => {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;

    const timer = setTimeout(() => {
      runFullWarmUp();
    }, 6000);

    const onWarmUpRequested = () => {
      warmedUpRef.current = false; // force a fresh, complete warm-up
      runFullWarmUp();
    };
    window.addEventListener('orm:app-warmup', onWarmUpRequested);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('orm:app-warmup', onWarmUpRequested);
    };
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

    // Update immediately whenever a mutation is queued offline by the interceptor
    const onQueued = () => { checkPending(); };
    window.addEventListener('orm:offline-queued', onQueued);

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      window.removeEventListener('orm:offline-queued', onQueued);
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
