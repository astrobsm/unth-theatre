'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { syncManager, SyncEventType, SYNC_INTERVALS } from './sync';

/**
 * Custom hook for bidirectional data sync
 * 
 * Features:
 * - Automatic data fetching on mount
 * - Configurable refresh intervals
 * - Push mutations with automatic refetch
 * - Cross-device sync via event system
 * - Visibility-aware polling (pauses when hidden)
 * - Loading and error states
 */

export interface UseSyncOptions<T> {
  /** Refresh interval in milliseconds (0 to disable) */
  refreshInterval?: number;
  /** Sync event type for cross-component updates */
  syncEvent?: SyncEventType;
  /** Initial data before first fetch */
  initialData?: T | null;
  /** Callback when data changes */
  onDataChange?: (data: T) => void;
  /** Enable/disable the hook */
  enabled?: boolean;
  /** Auto-refetch when browser tab becomes visible */
  refetchOnFocus?: boolean;
  /** Dependencies that trigger refetch when changed */
  dependencies?: any[];
}

export interface UseSyncResult<T> {
  /** Current data */
  data: T | null;
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: Error | null;
  /** Manually trigger data refetch */
  refetch: () => Promise<void>;
  /** Push mutation to server (POST, PUT, PATCH, DELETE) */
  mutate: (
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    body?: any,
    customEndpoint?: string
  ) => Promise<{ success: boolean; data?: any; error?: string }>;
  /** Last successful sync timestamp */
  lastSyncTime: number | null;
  /** Check if currently syncing */
  isSyncing: boolean;
}

export function useSync<T = any>(
  endpoint: string,
  options: UseSyncOptions<T> = {}
): UseSyncResult<T> {
  const {
    refreshInterval = 30000,
    syncEvent,
    initialData = null,
    onDataChange,
    enabled = true,
    refetchOnFocus = true,
    dependencies = [],
  } = options;

  const [data, setData] = useState<T | null>(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  // PULL: Fetch data from server
  const refetch = useCallback(async () => {
    if (!enabled || !mountedRef.current) return;

    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setIsSyncing(true);

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: abortControllerRef.current.signal,
      });

      if (!mountedRef.current) return;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch: ${response.status}`);
      }

      const newData = await response.json();
      
      if (mountedRef.current) {
        setData(newData);
        setError(null);
        setLastSyncTime(Date.now());
        setLoading(false);
        setIsSyncing(false);
        onDataChange?.(newData);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      
      if (mountedRef.current) {
        setError(err);
        setLoading(false);
        setIsSyncing(false);
        console.error(`Sync error for ${endpoint}:`, err);
      }
    }
  }, [endpoint, enabled, onDataChange]);

  // PUSH: Send mutation to server and refetch
  const mutate = useCallback(async (
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    body?: any,
    customEndpoint?: string
  ): Promise<{ success: boolean; data?: any; error?: string }> => {
    const targetEndpoint = customEndpoint || endpoint;
    setIsSyncing(true);

    try {
      const response = await fetch(targetEndpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const responseData = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(responseData.error || `Mutation failed: ${response.status}`);
      }

      // Emit sync event if specified
      if (syncEvent) {
        syncManager.emit({
          type: syncEvent,
          entityId: body?.id || responseData?.id,
          timestamp: Date.now(),
          source: 'local',
        });
      }

      // Immediately refetch to sync local state with server
      await refetch();

      return { success: true, data: responseData };
    } catch (err: any) {
      setIsSyncing(false);
      console.error(`Mutation error for ${targetEndpoint}:`, err);
      return { success: false, error: err.message };
    }
  }, [endpoint, syncEvent, refetch]);

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true;
    
    if (enabled) {
      refetch();
    }

    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [enabled, ...dependencies]);

  // Setup auto-refresh interval
  useEffect(() => {
    if (!enabled || refreshInterval <= 0) return;

    intervalRef.current = setInterval(() => {
      // Only refetch if document is visible
      if (document.visibilityState === 'visible') {
        refetch();
      }
    }, refreshInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, refreshInterval, refetch]);

  // Refetch on visibility change
  useEffect(() => {
    if (!enabled || !refetchOnFocus) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refetch();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, refetchOnFocus, refetch]);

  // Subscribe to sync events from other components
  useEffect(() => {
    if (!syncEvent || !enabled) return;

    const unsubscribe = syncManager.subscribe(syncEvent, (event) => {
      // Only refetch if event came from another source (avoid double fetching)
      if (event.source === 'local') {
        refetch();
      }
    });

    return unsubscribe;
  }, [syncEvent, enabled, refetch]);

  return {
    data,
    loading,
    error,
    refetch,
    mutate,
    lastSyncTime,
    isSyncing,
  };
}

/**
 * Hook for managing individual entity sync (for detail pages)
 */
export function useSyncEntity<T = any>(
  baseEndpoint: string,
  entityId: string | null,
  options: UseSyncOptions<T> = {}
): UseSyncResult<T> & { update: (body: any) => Promise<any>; remove: () => Promise<any> } {
  const endpoint = entityId ? `${baseEndpoint}/${entityId}` : '';
  
  const syncResult = useSync<T>(endpoint, {
    ...options,
    enabled: !!entityId && (options.enabled !== false),
  });

  const update = useCallback(async (body: any) => {
    return syncResult.mutate('PUT', body);
  }, [syncResult.mutate]);

  const remove = useCallback(async () => {
    return syncResult.mutate('DELETE');
  }, [syncResult.mutate]);

  return {
    ...syncResult,
    update,
    remove,
  };
}

/**
 * Hook for list data with create capability
 */
export function useSyncList<T = any>(
  endpoint: string,
  options: UseSyncOptions<T[]> = {}
): UseSyncResult<T[]> & { create: (body: any) => Promise<any> } {
  const syncResult = useSync<T[]>(endpoint, options);

  const create = useCallback(async (body: any) => {
    return syncResult.mutate('POST', body);
  }, [syncResult.mutate]);

  return {
    ...syncResult,
    data: syncResult.data || [],
    create,
  };
}

// Export sync intervals for consistency
export { SYNC_INTERVALS };

export default useSync;
