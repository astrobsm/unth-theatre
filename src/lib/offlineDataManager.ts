// ============================================================
// Offline Data Manager
// Pre-fetches and stores all critical app data into IndexedDB
// so the entire app can function fully offline
// ============================================================

import { setCachedData, getCachedData } from './offlineStore';

// All API endpoints to pre-fetch and cache for offline access
const OFFLINE_DATA_ENDPOINTS = [
  { key: 'dashboard-stats', url: '/api/dashboard/stats', ttl: 60 * 60 * 1000 }, // 1 hour
  { key: 'surgeries', url: '/api/surgeries', ttl: 30 * 60 * 1000 },
  { key: 'patients', url: '/api/patients', ttl: 30 * 60 * 1000 },
  { key: 'inventory', url: '/api/inventory', ttl: 30 * 60 * 1000 },
  { key: 'theatres', url: '/api/theatres', ttl: 60 * 60 * 1000 },
  { key: 'sub-stores', url: '/api/sub-stores', ttl: 30 * 60 * 1000 },
  { key: 'roster', url: '/api/roster', ttl: 60 * 60 * 1000 },
  { key: 'transfers', url: '/api/transfers', ttl: 30 * 60 * 1000 },
  { key: 'alerts', url: '/api/alerts', ttl: 15 * 60 * 1000 },
  { key: 'theatre-setup', url: '/api/theatre-setup', ttl: 60 * 60 * 1000 },
  { key: 'preop-reviews', url: '/api/preop-reviews', ttl: 30 * 60 * 1000 },
  { key: 'prescriptions', url: '/api/prescriptions', ttl: 30 * 60 * 1000 },
  { key: 'power-status', url: '/api/power-status', ttl: 15 * 60 * 1000 },
  { key: 'water-supply', url: '/api/water-supply', ttl: 15 * 60 * 1000 },
  { key: 'theatre-meals', url: '/api/theatre-meals', ttl: 60 * 60 * 1000 },
  { key: 'users', url: '/api/users', ttl: 60 * 60 * 1000 },
  { key: 'emergency-booking', url: '/api/emergency-booking', ttl: 15 * 60 * 1000 },
];

// Dashboard routes to pre-cache as HTML for offline navigation
const APP_SHELL_ROUTES = [
  '/dashboard',
  '/dashboard/surgeries',
  '/dashboard/patients',
  '/dashboard/inventory',
  '/dashboard/theatres',
  '/dashboard/transfers',
  '/dashboard/alerts',
  '/dashboard/checklists',
  '/dashboard/pacu',
  '/dashboard/holding-area',
  '/dashboard/reports',
  '/dashboard/sub-stores',
  '/dashboard/roster',
  '/dashboard/theatre-setup',
  '/dashboard/preop-reviews',
  '/dashboard/prescriptions',
  '/dashboard/blood-bank',
  '/dashboard/cancellations',
  '/dashboard/mortality',
  '/dashboard/theatre-readiness',
  '/dashboard/anesthesia-setup',
  '/dashboard/power-house/status',
  '/dashboard/equipment-checkout',
  '/dashboard/fault-alerts',
  '/dashboard/emergency-alerts',
  '/dashboard/emergency-booking',
  '/dashboard/emergency-booking/new',
  '/dashboard/cmd',
  '/dashboard/cmac',
  '/dashboard/dc-mac',
  '/dashboard/laundry-supervisor',
  '/dashboard/cssd-supervisor',
  '/dashboard/oxygen-supervisor',
  '/dashboard/works-supervisor',
];

export interface OfflineDataStatus {
  totalEndpoints: number;
  cachedEndpoints: number;
  failedEndpoints: string[];
  lastFullSync: number | null;
  isFullyCached: boolean;
}

/**
 * Pre-fetch all critical data and store in IndexedDB for offline use
 * Called once on login and periodically in the background
 */
export async function prefetchAllOfflineData(
  onProgress?: (done: number, total: number) => void
): Promise<OfflineDataStatus> {
  const total = OFFLINE_DATA_ENDPOINTS.length;
  let cached = 0;
  const failed: string[] = [];

  for (const endpoint of OFFLINE_DATA_ENDPOINTS) {
    try {
      const response = await fetch(endpoint.url);
      if (response.ok) {
        const data = await response.json();
        await setCachedData(endpoint.key, data, endpoint.ttl);
        cached++;
      } else {
        failed.push(endpoint.key);
      }
    } catch {
      // Skip failed endpoints — they may need auth or the server is down
      failed.push(endpoint.key);
    }
    onProgress?.(cached + failed.length, total);
  }

  const status: OfflineDataStatus = {
    totalEndpoints: total,
    cachedEndpoints: cached,
    failedEndpoints: failed,
    lastFullSync: cached > 0 ? Date.now() : null,
    isFullyCached: failed.length === 0,
  };

  // Store sync timestamp
  await setCachedData('offline-sync-status', status, 24 * 60 * 60 * 1000);

  return status;
}

/**
 * Pre-cache app shell pages so navigation works offline
 */
export function precacheAppShell(): void {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'PRECACHE_APP_SHELL',
      payload: { routes: APP_SHELL_ROUTES },
    });
  }
}

/**
 * Tell the SW to refresh all cached API data
 */
export function refreshAllCachedData(): void {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'CACHE_API_DATA' });
  }
}

/**
 * Get a cached data entry from IndexedDB with a fallback
 */
export async function getOfflineData<T>(key: string, fallback?: T): Promise<{ data: T; isStale: boolean; cached: boolean }> {
  const cached = await getCachedData<T>(key);
  if (cached) {
    return { data: cached.data, isStale: cached.isStale, cached: true };
  }
  return { data: fallback as T, isStale: false, cached: false };
}

/**
 * Fetch data with automatic offline fallback to IndexedDB
 * Use this for any data fetch in the app
 */
export async function offlineAwareFetch<T = unknown>(
  url: string,
  cacheKey: string,
  options: {
    cacheTtl?: number;
    fallback?: T;
    transform?: (data: unknown) => T;
  } = {}
): Promise<{
  data: T;
  isOffline: boolean;
  isStale: boolean;
  isCached: boolean;
  error: string | null;
}> {
  const { cacheTtl = 30 * 60 * 1000, fallback, transform } = options;

  try {
    const response = await fetch(url);

    if (response.ok) {
      const json = await response.json();
      const data = transform ? transform(json) : json;

      // Cache the fresh data
      await setCachedData(cacheKey, data, cacheTtl);

      return { data: data as T, isOffline: false, isStale: false, isCached: false, error: null };
    }

    // Non-OK response — try cache
    const cached = await getCachedData<T>(cacheKey);
    if (cached) {
      return { data: cached.data, isOffline: false, isStale: cached.isStale, isCached: true, error: null };
    }

    return {
      data: (fallback ?? null) as T,
      isOffline: false,
      isStale: false,
      isCached: false,
      error: `Server returned ${response.status}`,
    };
  } catch {
    // Network error — we're offline, use IndexedDB cache
    const cached = await getCachedData<T>(cacheKey);
    if (cached) {
      return { data: cached.data, isOffline: true, isStale: cached.isStale, isCached: true, error: null };
    }

    return {
      data: (fallback ?? null) as T,
      isOffline: true,
      isStale: false,
      isCached: false,
      error: 'Offline with no cached data',
    };
  }
}

/**
 * Register periodic background sync if browser supports it
 */
export async function registerPeriodicSync(): Promise<void> {
  if ('serviceWorker' in navigator && 'periodicSync' in ServiceWorkerRegistration.prototype) {
    try {
      const reg = await navigator.serviceWorker.ready;
      // @ts-ignore — periodicSync is not in TypeScript types yet
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' as PermissionName });
      if (status.state === 'granted') {
        // @ts-ignore
        await reg.periodicSync.register('orm-data-refresh', {
          minInterval: 60 * 60 * 1000, // 1 hour
        });
        console.log('[Offline] Periodic background sync registered');
      }
    } catch {
      // Not supported or permission denied
    }
  }
}

/**
 * Cache the current session data for offline auth
 */
export async function cacheSessionForOffline(): Promise<void> {
  try {
    const response = await fetch('/api/auth/session');
    if (response.ok) {
      const session = await response.json();
      if (session?.user) {
        await setCachedData('session', session, 7 * 24 * 60 * 60 * 1000); // 7 days
        // Also store user info separately for quick access
        await setCachedData('currentUser', session.user, 7 * 24 * 60 * 60 * 1000);
      }
    }
  } catch {
    // Already offline, session should already be cached
  }
}
