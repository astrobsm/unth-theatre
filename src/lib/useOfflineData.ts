'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { offlineAwareFetch } from '@/lib/offlineDataManager';
import { addToOfflineQueue } from '@/lib/offlineStore';

// ============================================================
// useOfflineData - Drop-in offline-aware data fetching hook
// Replaces bare fetch() calls for automatic offline support
// ============================================================

interface UseOfflineDataOptions<T> {
  /** IndexedDB cache key (required for offline storage) */
  cacheKey: string;
  /** Cache TTL in milliseconds (default 30 min) */
  cacheTtl?: number;
  /** Whether to auto-fetch on mount (default true) */
  enabled?: boolean;
  /** Fallback data when offline and no cache exists */
  fallback?: T;
  /** Transform raw response data */
  transform?: (data: unknown) => T;
  /** Auto-refetch interval in ms (0 = disabled) */
  refetchInterval?: number;
  /** Dependencies that trigger a refetch */
  deps?: unknown[];
}

interface UseOfflineDataResult<T> {
  /** The fetched/cached data */
  data: T | null;
  /** Whether data is loading */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Whether the data was served from cache */
  isCached: boolean;
  /** Whether the cached data is stale */
  isStale: boolean;
  /** Whether the app is offline */
  isOffline: boolean;
  /** Manually refetch */
  refetch: () => Promise<void>;
}

export function useOfflineData<T = unknown>(
  url: string,
  options: UseOfflineDataOptions<T>
): UseOfflineDataResult<T> {
  const {
    cacheKey,
    cacheTtl = 30 * 60 * 1000,
    enabled = true,
    fallback,
    transform,
    refetchInterval = 0,
    deps = [],
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout>();
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);

    try {
      const result = await offlineAwareFetch<T>(url, cacheKey, {
        cacheTtl,
        fallback: fallback as T,
        transform,
      });

      if (!mountedRef.current) return;

      if (result.data !== null && result.data !== undefined) {
        setData(result.data);
      } else if (fallback !== undefined) {
        setData(fallback);
      }

      setIsCached(result.isCached);
      setIsStale(result.isStale);
      setIsOffline(result.isOffline);
      setError(result.error);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, cacheKey, cacheTtl, enabled, ...deps]);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchData]);

  // Refetch interval
  useEffect(() => {
    if (refetchInterval > 0 && enabled) {
      intervalRef.current = setInterval(fetchData, refetchInterval);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
  }, [refetchInterval, enabled, fetchData]);

  // Listen for online/offline changes
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      fetchData(); // Refetch fresh data when back online
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchData]);

  return { data, loading, error, isCached, isStale, isOffline, refetch: fetchData };
}

// ============================================================
// useOfflineSubmit - Submit data that queues offline
// ============================================================

interface UseOfflineSubmitOptions {
  /** Description shown in sync queue UI */
  description?: string;
  /** Entity type for grouping (e.g. 'surgery', 'inventory') */
  entityType?: string;
  /** Called on successful submission */
  onSuccess?: (data: unknown) => void;
  /** Called when request fails */
  onError?: (error: string) => void;
  /** Called when request is queued for offline sync */
  onQueued?: () => void;
  /** Cache keys to invalidate after success */
  invalidateKeys?: string[];
}

interface SubmitResult {
  success: boolean;
  queued: boolean;
  data?: unknown;
  error?: string;
}

export function useOfflineSubmit(options: UseOfflineSubmitOptions = {}) {
  const {
    description = '',
    entityType = 'unknown',
    onSuccess,
    onError,
    onQueued,
    invalidateKeys = [],
  } = options;

  const [loading, setLoading] = useState(false);
  const [isQueued, setIsQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (
    url: string,
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST',
    body?: unknown
  ): Promise<SubmitResult> => {
    setLoading(true);
    setError(null);
    setIsQueued(false);

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (response.ok) {
        const data = await response.json().catch(() => null);
        onSuccess?.(data);

        // Invalidate cached data
        if (invalidateKeys.length > 0) {
          const { removeCachedData } = await import('@/lib/offlineStore');
          for (const key of invalidateKeys) {
            await removeCachedData(key);
          }
        }

        setLoading(false);
        return { success: true, queued: false, data };
      } else {
        const errData = await response.json().catch(() => ({ error: 'Request failed' }));
        const errMsg = errData.error || `Request failed (${response.status})`;
        setError(errMsg);
        onError?.(errMsg);
        setLoading(false);
        return { success: false, queued: false, error: errMsg };
      }
    } catch {
      // Network error — queue for offline sync
      await addToOfflineQueue({
        url,
        method,
        headers: { 'Content-Type': 'application/json' },
        body,
        description: description || `${method} ${url}`,
        entityType,
      });

      // Request background sync
      if ('serviceWorker' in navigator && 'SyncManager' in window) {
        try {
          const reg = await navigator.serviceWorker.ready;
          await (reg as any).sync.register('orm-offline-sync');
        } catch {}
      }

      setIsQueued(true);
      onQueued?.();
      setLoading(false);
      return { success: true, queued: true };
    }
  }, [description, entityType, onSuccess, onError, onQueued, invalidateKeys]);

  return { submit, loading, isQueued, error };
}
