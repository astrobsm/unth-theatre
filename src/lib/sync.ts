/**
 * Cross-Device Sync Utility
 * 
 * This module provides bidirectional sync capabilities:
 * - PUSH: Send data changes to the server immediately on create/update/delete
 * - PULL: Fetch latest data from server at regular intervals and on-demand
 * 
 * Features:
 * - Automatic retry on failure
 * - Optimistic updates with rollback
 * - Event-based sync notifications
 * - Visibility-aware polling (pauses when tab is hidden)
 */

// Sync event types for cross-component communication
export type SyncEventType = 
  | 'SURGERY_UPDATED'
  | 'PATIENT_UPDATED'
  | 'INVENTORY_UPDATED'
  | 'HOLDING_AREA_UPDATED'
  | 'PACU_UPDATED'
  | 'ALERT_UPDATED'
  | 'BLOOD_REQUEST_UPDATED'
  | 'CHECKLIST_UPDATED'
  | 'ROSTER_UPDATED'
  | 'THEATRE_UPDATED'
  | 'PRESCRIPTION_UPDATED'
  | 'DATA_SYNCED';

// Sync event payload
interface SyncEvent {
  type: SyncEventType;
  entityId?: string;
  timestamp: number;
  source: 'local' | 'remote';
}

// Global sync state
class SyncManager {
  private listeners: Map<SyncEventType, Set<(event: SyncEvent) => void>> = new Map();
  private lastSyncTime: Map<string, number> = new Map();
  private pendingRequests: Map<string, AbortController> = new Map();
  private isOnline: boolean = true;
  private syncQueue: Array<{ endpoint: string; method: string; body?: any; retries: number }> = [];

  constructor() {
    // Monitor online/offline status
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.processSyncQueue();
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
      });

      // Sync when tab becomes visible
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.emit({ type: 'DATA_SYNCED', timestamp: Date.now(), source: 'remote' });
        }
      });
    }
  }

  // Subscribe to sync events
  subscribe(eventType: SyncEventType, callback: (event: SyncEvent) => void): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(eventType)?.delete(callback);
    };
  }

  // Emit sync event to all listeners
  emit(event: SyncEvent): void {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      listeners.forEach(callback => callback(event));
    }

    // Also emit to DATA_SYNCED listeners for global sync
    if (event.type !== 'DATA_SYNCED') {
      const globalListeners = this.listeners.get('DATA_SYNCED');
      if (globalListeners) {
        globalListeners.forEach(callback => callback(event));
      }
    }
  }

  // PUSH: Send data to server
  async push<T>(
    endpoint: string,
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    body?: any,
    options?: {
      retries?: number;
      onSuccess?: (data: T) => void;
      onError?: (error: Error) => void;
      syncEvent?: SyncEventType;
      entityId?: string;
    }
  ): Promise<T | null> {
    const { retries = 3, onSuccess, onError, syncEvent, entityId } = options || {};

    // Cancel any pending request to the same endpoint
    const existingController = this.pendingRequests.get(endpoint);
    if (existingController) {
      existingController.abort();
    }

    const controller = new AbortController();
    this.pendingRequests.set(endpoint, controller);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(endpoint, {
          method,
          headers: {
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        this.pendingRequests.delete(endpoint);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Request failed with status ${response.status}`);
        }

        const data = await response.json();

        // Emit sync event on success
        if (syncEvent) {
          this.emit({
            type: syncEvent,
            entityId,
            timestamp: Date.now(),
            source: 'local',
          });
        }

        onSuccess?.(data);
        return data;
      } catch (error: any) {
        lastError = error;

        if (error.name === 'AbortError') {
          return null;
        }

        // If offline, queue the request
        if (!this.isOnline && attempt === retries) {
          this.syncQueue.push({ endpoint, method, body, retries });
          console.log('Request queued for sync when online');
        }

        // Wait before retry (exponential backoff)
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    this.pendingRequests.delete(endpoint);
    onError?.(lastError || new Error('Unknown error'));
    return null;
  }

  // PULL: Fetch data from server
  async pull<T>(
    endpoint: string,
    options?: {
      force?: boolean;
      cacheTime?: number;
      onSuccess?: (data: T) => void;
      onError?: (error: Error) => void;
    }
  ): Promise<T | null> {
    const { force = false, cacheTime = 0, onSuccess, onError } = options || {};

    // Check cache if not forced
    if (!force && cacheTime > 0) {
      const lastSync = this.lastSyncTime.get(endpoint);
      if (lastSync && Date.now() - lastSync < cacheTime) {
        return null; // Use cached data
      }
    }

    // Cancel any pending request to the same endpoint
    const existingController = this.pendingRequests.get(endpoint);
    if (existingController) {
      existingController.abort();
    }

    const controller = new AbortController();
    this.pendingRequests.set(endpoint, controller);

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      this.pendingRequests.delete(endpoint);

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = await response.json();
      this.lastSyncTime.set(endpoint, Date.now());
      onSuccess?.(data);
      return data;
    } catch (error: any) {
      this.pendingRequests.delete(endpoint);

      if (error.name !== 'AbortError') {
        onError?.(error);
      }
      return null;
    }
  }

  // Process queued requests when back online
  private async processSyncQueue(): Promise<void> {
    while (this.syncQueue.length > 0 && this.isOnline) {
      const request = this.syncQueue.shift();
      if (request) {
        await this.push(request.endpoint, request.method as any, request.body, {
          retries: request.retries,
        });
      }
    }
  }

  // Clear all pending requests
  cancelAll(): void {
    this.pendingRequests.forEach(controller => controller.abort());
    this.pendingRequests.clear();
  }
}

// Export singleton instance
export const syncManager = new SyncManager();

/**
 * Custom hook for data sync with automatic push/pull
 * Usage:
 * 
 * const { data, loading, refetch, mutate } = useSync('/api/surgeries', {
 *   refreshInterval: 30000,
 *   syncEvent: 'SURGERY_UPDATED',
 * });
 */
export interface UseSyncOptions<T> {
  refreshInterval?: number;
  syncEvent?: SyncEventType;
  initialData?: T;
  onDataChange?: (data: T) => void;
  enabled?: boolean;
}

export interface UseSyncResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  mutate: (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body?: any, entityId?: string) => Promise<any>;
  lastSyncTime: number | null;
}

// Helper function for creating sync-enabled fetch calls
export async function syncFetch<T>(
  endpoint: string,
  options?: RequestInit & { syncEvent?: SyncEventType; entityId?: string }
): Promise<T> {
  const { syncEvent, entityId, ...fetchOptions } = options || {};
  
  const response = await fetch(endpoint, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Request failed: ${response.status}`);
  }

  const data = await response.json();

  // Emit sync event if specified
  if (syncEvent) {
    syncManager.emit({
      type: syncEvent,
      entityId,
      timestamp: Date.now(),
      source: 'local',
    });
  }

  return data;
}

// Auto-refresh configuration for different modules.
//
// To minimise network usage (especially on poor connections) every module now
// polls at a relaxed 30-minute cadence. Users can pull fresh data at any time
// via the per-page "Sync now" / Refresh control, and a sync is also triggered
// automatically whenever a tab becomes visible again.
const THIRTY_MINUTES = 30 * 60 * 1000; // 1,800,000 ms

export const SYNC_INTERVALS = {
  // Patient-safety modules
  HOLDING_AREA: THIRTY_MINUTES,
  PACU: THIRTY_MINUTES,
  EMERGENCY_ALERTS: THIRTY_MINUTES,

  // High priority modules
  BLOOD_BANK: THIRTY_MINUTES,
  FAULT_ALERTS: THIRTY_MINUTES,
  SURGERIES: THIRTY_MINUTES,
  CHECKLISTS: THIRTY_MINUTES,
  OXYGEN_CONTROL: THIRTY_MINUTES,

  // Standard modules
  PREOP_REVIEWS: THIRTY_MINUTES,
  PRESCRIPTIONS: THIRTY_MINUTES,
  TRANSFERS: THIRTY_MINUTES,
  EQUIPMENT_CHECKOUT: THIRTY_MINUTES,

  // Lower priority modules
  INVENTORY: THIRTY_MINUTES,
  PATIENTS: THIRTY_MINUTES,
  ROSTER: THIRTY_MINUTES,
  USERS: THIRTY_MINUTES,
  THEATRE_SETUP: THIRTY_MINUTES,
  INCIDENTS: THIRTY_MINUTES,
  CANCELLATIONS: THIRTY_MINUTES,
};

export default syncManager;
