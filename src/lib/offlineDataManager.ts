// ============================================================
// Offline Data Manager
// Pre-fetches and stores all critical app data into IndexedDB
// so the entire app can function fully offline
// ============================================================

import { setCachedData, getCachedData } from './offlineStore';

/**
 * Every collection endpoint the app reads, so ONE "Prepare for Offline Use" run
 * leaves every module with data — not just the handful that used to be listed
 * here (21 of 71 collections, which is why modules a device had never visited
 * came up empty offline).
 *
 * Derived from the API routes that expose a GET collection handler. Anything
 * that 404s or 403s for the signed-in user is simply skipped, so a role that
 * cannot see a module costs nothing.
 *
 * `contacts`, `emergency-pre-anaesthetic` and `emergency-team-availability`
 * were listed here and are deliberately NOT: none of them is a collection.
 * Each requires a parameter (`id`/`name`, `bookingId`) and answers 400 without
 * one, so prefetching them cached nothing and logged an error per load. Their
 * data is per-booking and is cached when the booking page fetches it.
 */
const OFFLINE_COLLECTIONS = [
  // Overview / scheduling
  'dashboard/stats', 'surgeries', 'patients', 'cancellations', 'surgery-readiness',
  'surgical-units', 'surgical-packs', 'anaesthesia-packs', 'wards', 'locations',
  // Emergency
  'emergency-booking', 'emergency-display', 'emergency-alerts', 'emergency-lab-workup',
  'emergency-prescriptions',
  // Pre-op
  'pre-operative-visit', 'preop-reviews', 'prescriptions', 'post-op-prescriptions',
  'blood-requests', 'investigations', 'drug-dressing-requests',
  // Theatre / intra-op
  'theatres', 'theatre-setup', 'theatre-reception', 'theatre-audit', 'allocations',
  'holding-area', 'checklists', 'intraoperative', 'equipment-checkout', 'call-for-patient',
  // Post-op
  'pacu', 'nurse-handover', 'transfers',
  // Roster & staff
  'roster', 'users', 'scrubs', 'walkie-talkies',
  // Stores & supplies
  'inventory', 'sub-stores', 'stock-transfers', 'consumable-requests',
  // CSSD / laundry / facilities
  'cssd-inventory', 'cssd-sterilization', 'cssd-readiness', 'laundry',
  'power-status', 'power-maintenance', 'power-readiness', 'power-fuel-consumption',
  'water-supply', 'water-supply-readiness', 'plumbing-water-supply',
  // Alerts, safety & governance
  'alerts', 'fault-alerts', 'incidents', 'mortality', 'anonymous-tips',
  'security-reports', 'disciplinary-queries', 'audit-logs',
  // Admin / misc
  'announcements', 'theatre-meals', 'notifications',
];

/** Endpoints whose data goes stale quickly get a shorter refresh window. */
const SHORT_TTL = new Set([
  'emergency-display', 'emergency-alerts', 'emergency-booking', 'alerts', 'fault-alerts',
  'power-status', 'water-supply', 'notifications', 'holding-area', 'theatre-reception',
]);

// All API endpoints to pre-fetch and cache for offline access.
//
// IMPORTANT: the cache key MUST match urlToCacheKey() in
// globalFetchInterceptor.ts. It previously used bare keys ('surgeries'), which
// no reader ever looked up — so everything this prefetched was invisible to the
// pages that needed it offline.
const OFFLINE_DATA_ENDPOINTS = OFFLINE_COLLECTIONS.map((name) => ({
  key: `api-cache:/api/${name}`,
  url: `/api/${name}`,
  ttl: (SHORT_TTL.has(name) ? 15 : 60) * 60 * 1000,
}));

// Dashboard routes to pre-cache as HTML for offline navigation.
// COMPREHENSIVE: every module page the user can reach from the sidebar so the
// whole app keeps working on an unstable / dropped network connection.
const APP_SHELL_ROUTES = [
  // Overview
  '/dashboard',
  '/dashboard/live-monitoring',
  '/dashboard/presentation',
  '/dashboard/settings',
  // Emergency
  '/dashboard/emergency-booking',
  '/dashboard/emergency-booking/new',
  '/dashboard/emergency-alerts',
  '/dashboard/emergency-lab-workup',
  '/emergency-display',
  // Patients & scheduling
  '/dashboard/patients',
  '/dashboard/patients/new',
  '/dashboard/surgeries',
  '/dashboard/surgeries/new',
  '/dashboard/surgeries/completed',
  '/dashboard/cancellations',
  '/dashboard/surgical-unit-calendar',
  '/dashboard/call-for-patient',
  // Pre-operative
  '/dashboard/pre-operative-visit',
  '/dashboard/patient-payment-guide',
  '/dashboard/anaesthetist-board',
  '/dashboard/preop-reviews',
  '/dashboard/prescription-approvals',
  '/dashboard/prescriptions',
  '/dashboard/blood-bank',
  '/dashboard/anesthesia-setup',
  '/dashboard/medication-tracking',
  // Day-of-surgery logistics
  '/dashboard/roster',
  '/dashboard/theatres',
  '/dashboard/theatre-setup',
  '/dashboard/theatre-readiness',
  // Intra-operative
  '/dashboard/holding-area',
  '/dashboard/checklists',
  '/dashboard/equipment-checkout',
  '/dashboard/consumable-pack-provider',
  // Post-operative
  '/dashboard/pacu',
  '/dashboard/nurse-handover',
  // Facilities & support
  '/dashboard/power-house/status',
  '/dashboard/power-house/maintenance',
  '/dashboard/power-house/readiness',
  '/dashboard/oxygen-control',
  '/dashboard/oxygen-supervisor',
  '/dashboard/cssd/inventory',
  '/dashboard/cssd/sterilization',
  '/dashboard/cssd/readiness',
  '/dashboard/cssd-supervisor',
  '/dashboard/laundry',
  '/dashboard/plumbing-water-supply',
  '/dashboard/works',
  // Alerts & safety
  '/dashboard/alerts',
  '/dashboard/radio',
  '/dashboard/fault-alerts',
  '/dashboard/mortality',
  '/dashboard/incidents',
  '/dashboard/anonymous-tips',
  '/dashboard/anonymous-tips/view',
  '/dashboard/feedback',
  '/dashboard/feedback/review',
  '/dashboard/security-reports',
  '/dashboard/security-reports/view',
  // Inventory & supplies
  '/dashboard/inventory',
  '/dashboard/sub-stores',
  // Reports & administration
  '/dashboard/announcements',
  '/dashboard/unit-booking-letter',
  '/dashboard/theatre-meals',
  '/dashboard/meals/order',
  '/dashboard/reports',
  '/dashboard/reports/staff-effectiveness',
  '/dashboard/catalog-contribute',
  '/dashboard/catalog-letter',
  '/dashboard/disciplinary-queries',
  '/dashboard/theatre-audit',
  '/dashboard/users',
  '/dashboard/admin/access',
  '/dashboard/admin/surgical-units',
  '/dashboard/admin/surgical-catalog',
  // Executive dashboards
  '/dashboard/cmd',
  '/dashboard/cmac',
  '/dashboard/dc-mac',
];

export interface OfflineDataStatus {
  totalEndpoints: number;
  cachedEndpoints: number;
  failedEndpoints: string[];
  lastFullSync: number | null;
  isFullyCached: boolean;
}

/**
 * Pre-fetch critical data and store in IndexedDB for offline use.
 * LAZY: skips endpoints whose cache is still fresh.
 * BATCHED: fetches 3 at a time to avoid request storms.
 */
export async function prefetchAllOfflineData(
  onProgress?: (done: number, total: number) => void
): Promise<OfflineDataStatus> {
  const total = OFFLINE_DATA_ENDPOINTS.length;
  let cached = 0;
  let skipped = 0; // endpoints this user's role has no access to
  const failed: string[] = [];
  // Six at a time: the endpoint list covers every module now, so a batch of 3
  // made "Prepare for Offline Use" take noticeably longer without being kinder
  // to the network in any way that mattered.
  const BATCH_SIZE = 6;

  // Filter to only endpoints that need refreshing
  const staleEndpoints: typeof OFFLINE_DATA_ENDPOINTS = [];
  for (const ep of OFFLINE_DATA_ENDPOINTS) {
    const existing = await getCachedData(ep.key);
    if (!existing || existing.isStale) {
      staleEndpoints.push(ep);
    } else {
      cached++; // already fresh
    }
  }

  // Fetch stale endpoints in small parallel batches
  for (let i = 0; i < staleEndpoints.length; i += BATCH_SIZE) {
    const batch = staleEndpoints.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (endpoint) => {
        const response = await fetch(endpoint.url);
        if (response.ok) {
          const data = await response.json();
          await setCachedData(endpoint.key, data, endpoint.ttl);
          return 'cached' as const;
        }
        // This role simply cannot see that module — not a failure, and it must
        // not make the device report itself as "not ready for offline use".
        if ([401, 403, 404].includes(response.status)) return 'skipped' as const;
        return 'failed' as const;
      })
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === 'fulfilled' && r.value === 'cached') cached++;
      else if (r.status === 'fulfilled' && r.value === 'skipped') skipped++;
      else failed.push(batch[j].key);
    }
    onProgress?.(cached + skipped + failed.length, total);
  }

  const status: OfflineDataStatus = {
    // Endpoints this role cannot see are excluded from the total, so the
    // readiness figure reflects what this user actually needs offline.
    totalEndpoints: total - skipped,
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
 * Pre-cache app shell pages so navigation works offline.
 * Uses requestIdleCallback to avoid blocking the main thread.
 * Only sends a small batch at a time.
 */
export function precacheAppShell(): void {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;

  const sendBatch = (routes: string[]) => {
    navigator.serviceWorker.controller?.postMessage({
      type: 'PRECACHE_APP_SHELL',
      payload: { routes },
    });
  };

  // Send in batches of 5 with idle delays between
  const BATCH = 5;
  let idx = 0;
  const scheduleNext = () => {
    if (idx >= APP_SHELL_ROUTES.length) return;
    const batch = APP_SHELL_ROUTES.slice(idx, idx + BATCH);
    idx += BATCH;
    sendBatch(batch);
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => setTimeout(scheduleNext, 2000));
    } else {
      setTimeout(scheduleNext, 3000);
    }
  };

  // Start after 15 seconds so initial page load is unblocked
  setTimeout(scheduleNext, 15000);
}

/**
 * COMPREHENSIVE WARM-UP: cache every module page for offline navigation,
 * promptly (used right after login). Resolves once all batches have been
 * handed to the service worker. Safe to call repeatedly.
 */
export function precacheAllPages(
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      resolve();
      return;
    }
    const total = APP_SHELL_ROUTES.length;
    navigator.serviceWorker.ready
      .then((reg) => {
        const controller = navigator.serviceWorker.controller || reg.active;
        if (!controller) {
          resolve();
          return;
        }
        const BATCH = 4;
        let idx = 0;
        const next = () => {
          if (idx >= total) {
            onProgress?.(total, total);
            resolve();
            return;
          }
          const batch = APP_SHELL_ROUTES.slice(idx, idx + BATCH);
          idx += BATCH;
          controller.postMessage({
            type: 'PRECACHE_APP_SHELL',
            payload: { routes: batch },
          });
          onProgress?.(Math.min(idx, total), total);
          // Small gap between batches so we never saturate the network.
          setTimeout(next, 700);
        };
        next();
      })
      .catch(() => resolve());
  });
}

/**
 * Full post-login warm-up: cache the session, prefetch all API data into
 * IndexedDB, and precache every module page. This is what guarantees the user
 * can keep using the whole app even if the network drops right after login.
 */
export async function warmUpEntireApp(
  onProgress?: (phase: 'session' | 'data' | 'pages', done: number, total: number) => void
): Promise<OfflineDataStatus | null> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null;
  try {
    onProgress?.('session', 0, 1);
    await cacheSessionForOffline();
    onProgress?.('session', 1, 1);

    const status = await prefetchAllOfflineData((d, t) => onProgress?.('data', d, t));

    await precacheAllPages((d, t) => onProgress?.('pages', d, t));

    return status;
  } catch {
    return null;
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
  const etagKey = `${cacheKey}__etag`;

  // Replay the previously stored ETag so the server can answer 304 when unchanged.
  let storedEtag: string | null = null;
  try {
    const etagRec = await getCachedData<string>(etagKey);
    storedEtag = etagRec?.data ?? null;
  } catch {
    storedEtag = null;
  }

  try {
    const response = await fetch(
      url,
      storedEtag ? { headers: { 'If-None-Match': storedEtag } } : undefined
    );

    // 304 Not Modified — reuse the cached copy, nothing transferred.
    if (response.status === 304) {
      const cached = await getCachedData<T>(cacheKey);
      if (cached) {
        return { data: cached.data, isOffline: false, isStale: cached.isStale, isCached: true, error: null };
      }
    }

    if (response.ok) {
      const json = await response.json();
      const data = transform ? transform(json) : json;

      // Cache the fresh data
      await setCachedData(cacheKey, data, cacheTtl);
      const etag = response.headers.get('etag');
      if (etag) await setCachedData(etagKey, etag, cacheTtl);

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
 * Cache-first (stale-while-revalidate) fetch for fast perceived load on poor networks.
 *
 * Unlike `offlineAwareFetch` (network-first, which blocks on a slow request), this:
 *   1. Reads the IndexedDB cache FIRST and, if present, hands it back immediately via
 *      `onCachedData` so the page can paint instantly with last-known data.
 *   2. Then performs the network request in the background and resolves with fresh
 *      data (also re-caching it). The caller updates the UI again when it resolves.
 *
 * Result: on a slow/unstable connection the user sees content instantly instead of a
 * blocking spinner, and it silently refreshes once the network responds.
 */
export async function cacheFirstFetch<T = unknown>(
  url: string,
  cacheKey: string,
  options: {
    cacheTtl?: number;
    transform?: (data: unknown) => T;
    onCachedData?: (data: T, meta: { isStale: boolean }) => void;
  } = {}
): Promise<{
  data: T | null;
  isOffline: boolean;
  isStale: boolean;
  isCached: boolean;
  error: string | null;
}> {
  const { cacheTtl = 30 * 60 * 1000, transform, onCachedData } = options;
  const etagKey = `${cacheKey}__etag`;

  // 1) Serve cache immediately (if any) so the page can render without waiting.
  let cachedSnapshot: { data: T; isStale: boolean } | null = null;
  try {
    const cached = await getCachedData<T>(cacheKey);
    if (cached) {
      cachedSnapshot = { data: cached.data, isStale: cached.isStale };
      if (onCachedData) onCachedData(cached.data, { isStale: cached.isStale });
    }
  } catch {
    // Ignore cache read errors — proceed to network.
  }

  // Replay the previously stored ETag so the server can answer 304 (empty body)
  // when nothing changed — the core "transfer only recent changes" optimisation.
  let storedEtag: string | null = null;
  try {
    const etagRec = await getCachedData<string>(etagKey);
    storedEtag = etagRec?.data ?? null;
  } catch {
    storedEtag = null;
  }

  // 2) Revalidate from the network in the foreground; resolve with fresh data.
  try {
    const response = await fetch(
      url,
      storedEtag ? { headers: { 'If-None-Match': storedEtag } } : undefined
    );

    // 304 Not Modified — keep the cached copy, nothing transferred.
    if (response.status === 304 && cachedSnapshot) {
      return {
        data: cachedSnapshot.data,
        isOffline: false,
        isStale: false,
        isCached: true,
        error: null,
      };
    }

    if (response.ok) {
      const json = await response.json();
      const data = transform ? transform(json) : json;
      await setCachedData(cacheKey, data, cacheTtl);
      const etag = response.headers.get('etag');
      if (etag) await setCachedData(etagKey, etag, cacheTtl);
      return { data: data as T, isOffline: false, isStale: false, isCached: false, error: null };
    }

    if (cachedSnapshot) {
      return { data: cachedSnapshot.data, isOffline: false, isStale: cachedSnapshot.isStale, isCached: true, error: null };
    }
    return {
      data: null,
      isOffline: false,
      isStale: false,
      isCached: false,
      error: `Server returned ${response.status}`,
    };
  } catch {
    if (cachedSnapshot) {
      return { data: cachedSnapshot.data, isOffline: true, isStale: cachedSnapshot.isStale, isCached: true, error: null };
    }
    return {
      data: null,
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
