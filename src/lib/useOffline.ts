'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  offlineFetch,
  getOfflineQueueCount,
  processOfflineQueue,
  getOfflineQueue,
  type OfflineQueueItem,
} from './offlineStore';

// ============================================================
// useOnlineStatus - Track connection state
// ============================================================
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Set initial state
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

// ============================================================
// useOfflineQuery - Fetch with offline cache fallback
// ============================================================
interface OfflineQueryOptions<T> {
  /** Cache key in IndexedDB */
  cacheKey: string;
  /** Cache TTL in milliseconds (default 30 min) */
  cacheTtl?: number;
  /** Whether to fetch immediately */
  enabled?: boolean;
  /** Transform response data */
  transform?: (data: unknown) => T;
  /** Refetch interval in ms (0 = disabled) */
  refetchInterval?: number;
}

interface OfflineQueryResult<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  isFromCache: boolean;
  isStale: boolean;
  refetch: () => Promise<void>;
  lastFetched: number | null;
}

export function useOfflineQuery<T = unknown>(
  url: string,
  options: OfflineQueryOptions<T>
): OfflineQueryResult<T> {
  const { cacheKey, cacheTtl = 30 * 60 * 1000, enabled = true, transform, refetchInterval = 0 } = options;
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [lastFetched, setLastFetched] = useState<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout>();

  const fetchData = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);

    try {
      const response = await offlineFetch(url, {
        cacheKey,
        cacheTtl,
      });

      const fromCache = response.headers.get('X-ORM-Cache') === 'true';
      const stale = response.headers.get('X-ORM-Stale') === 'true';

      if (response.ok || response.status === 200) {
        const json = await response.json();
        const result = transform ? transform(json) : json;
        setData(result as T);
        setIsFromCache(fromCache);
        setIsStale(stale);
        setLastFetched(Date.now());
      } else if (response.status === 503) {
        // Offline with no cache
        setError('You are offline');
        setIsFromCache(false);
      } else {
        setError('Failed to load data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [url, cacheKey, cacheTtl, enabled, transform]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refetch interval
  useEffect(() => {
    if (refetchInterval > 0 && enabled) {
      intervalRef.current = setInterval(fetchData, refetchInterval);
      return () => clearInterval(intervalRef.current);
    }
  }, [refetchInterval, enabled, fetchData]);

  return { data, isLoading, error, isFromCache, isStale, refetch: fetchData, lastFetched };
}

// ============================================================
// useOfflineMutation - Mutations that queue when offline
// ============================================================
interface OfflineMutationOptions {
  /** Description for the sync queue UI */
  description?: string;
  /** Entity type for grouping in queue */
  entityType?: string;
  /** Called on successful response (not when queued) */
  onSuccess?: (data: unknown) => void;
  /** Called when mutation fails */
  onError?: (error: string) => void;
  /** Called when mutation is queued offline */
  onQueued?: () => void;
  /** Invalidate these cache keys after success */
  invalidateKeys?: string[];
}

interface OfflineMutationResult {
  mutate: (url: string, options?: RequestInit) => Promise<{ success: boolean; queued: boolean; data?: unknown }>;
  isLoading: boolean;
  isQueued: boolean;
  error: string | null;
}

export function useOfflineMutation(options: OfflineMutationOptions = {}): OfflineMutationResult {
  const { description = '', entityType = 'unknown', onSuccess, onError, onQueued, invalidateKeys } = options;
  const [isLoading, setIsLoading] = useState(false);
  const [isQueued, setIsQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(async (
    url: string,
    fetchOptions: RequestInit = {}
  ): Promise<{ success: boolean; queued: boolean; data?: unknown }> => {
    setIsLoading(true);
    setError(null);
    setIsQueued(false);

    try {
      const response = await offlineFetch(url, {
        ...fetchOptions,
        entityType,
        description,
      });

      const queued = response.headers.get('X-ORM-Queued') === 'true';

      if (queued) {
        setIsQueued(true);
        onQueued?.();
        setIsLoading(false);
        return { success: true, queued: true };
      }

      if (response.ok) {
        const data = await response.json().catch(() => null);
        onSuccess?.(data);

        // Invalidate cache keys
        if (invalidateKeys) {
          const { removeCachedData } = await import('./offlineStore');
          for (const key of invalidateKeys) {
            await removeCachedData(key);
          }
        }

        setIsLoading(false);
        return { success: true, queued: false, data };
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
        const errorMsg = errorData.error || 'Request failed';
        setError(errorMsg);
        onError?.(errorMsg);
        setIsLoading(false);
        return { success: false, queued: false };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      onError?.(errorMsg);
      setIsLoading(false);
      return { success: false, queued: false };
    }
  }, [description, entityType, onSuccess, onError, onQueued, invalidateKeys]);

  return { mutate, isLoading, isQueued, error };
}

// ============================================================
// useSyncStatus - Monitor the offline queue & sync progress
// ============================================================
interface SyncStatus {
  pendingCount: number;
  pendingItems: OfflineQueueItem[];
  isSyncing: boolean;
  lastSyncResult: { synced: number; failed: number; remaining: number } | null;
  syncNow: () => Promise<void>;
}

export function useSyncStatus(): SyncStatus {
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingItems, setPendingItems] = useState<OfflineQueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<{ synced: number; failed: number; remaining: number } | null>(null);
  const isOnline = useOnlineStatus();

  // Poll queue count
  useEffect(() => {
    const checkQueue = async () => {
      const count = await getOfflineQueueCount();
      setPendingCount(count);
      if (count > 0) {
        const items = await getOfflineQueue();
        setPendingItems(items);
      } else {
        setPendingItems([]);
      }
    };

    checkQueue();
    const interval = setInterval(checkQueue, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-sync when back online
  useEffect(() => {
    if (isOnline && pendingCount > 0 && !isSyncing) {
      syncNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // Listen for SW sync messages
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_COMPLETE') {
        setLastSyncResult({
          synced: event.data.synced,
          failed: event.data.pending,
          remaining: event.data.pending,
        });
        setIsSyncing(false);
        // Refresh count
        getOfflineQueueCount().then(setPendingCount);
      }
    };

    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, []);

  const syncNow = useCallback(async () => {
    if (isSyncing || !isOnline) return;
    setIsSyncing(true);
    try {
      const result = await processOfflineQueue();
      setLastSyncResult(result);
      setPendingCount(result.remaining);
      if (result.remaining > 0) {
        const items = await getOfflineQueue();
        setPendingItems(items);
      } else {
        setPendingItems([]);
      }
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, isOnline]);

  return { pendingCount, pendingItems, isSyncing, lastSyncResult, syncNow };
}

// ============================================================
// useServiceWorker - SW registration & update management
// ============================================================
export function useServiceWorker() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        setRegistration(reg);

        // Check for updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setUpdateAvailable(true);
              }
            });
          }
        });
      })
      .catch((err) => console.error('[SW] Registration failed:', err));

    // Listen for controller change (SW updated)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // New SW activated — optionally reload
    });
  }, []);

  const applyUpdate = useCallback(() => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      setUpdateAvailable(false);
      window.location.reload();
    }
  }, [registration]);

  return { registration, updateAvailable, applyUpdate };
}
