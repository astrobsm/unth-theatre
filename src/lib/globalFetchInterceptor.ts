// ============================================================
// Global Fetch Interceptor
// Monkey-patches window.fetch to automatically provide
// offline fallback for ALL API calls without modifying pages
// ============================================================

import { setCachedData, getCachedData, addToOfflineQueue } from './offlineStore';

let interceptorInstalled = false;
let originalFetch: typeof window.fetch;

/**
 * Derive a cache key from a URL (strip origin, keep pathname + query)
 */
function urlToCacheKey(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    return `api-cache:${parsed.pathname}${parsed.search}`;
  } catch {
    return `api-cache:${url}`;
  }
}

/**
 * Check if this URL is an internal API call that should be intercepted
 */
function isInternalApi(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    // Only intercept same-origin /api/ calls
    return (
      parsed.origin === window.location.origin &&
      parsed.pathname.startsWith('/api/')
    );
  } catch {
    return url.startsWith('/api/');
  }
}

/**
 * Check if a request is a mutation (non-GET)
 */
function isMutation(init?: RequestInit): boolean {
  const method = (init?.method ?? 'GET').toUpperCase();
  return method !== 'GET' && method !== 'HEAD';
}

/**
 * Ask the browser to flush the offline mutation queue as soon as connectivity
 * returns — even if the app/tab is closed — via the Background Sync API.
 * Falls back silently when unsupported (the OfflineProvider's `online` handler
 * still drains the queue while the app is open).
 */
async function requestBackgroundSync(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (!('SyncManager' in window)) return;
    const reg = await navigator.serviceWorker.ready;
    // @ts-ignore — sync is not in the default TS lib types
    await reg.sync?.register('orm-offline-sync');
  } catch {
    // Unsupported or permission denied — safe to ignore
  }
}

/**
 * Notify the rest of the app that a mutation was just queued offline so the
 * sync indicator / pending count can update immediately instead of waiting
 * for the next poll.
 */
function notifyQueued(entityType: string): void {
  try {
    window.dispatchEvent(
      new CustomEvent('orm:offline-queued', { detail: { entityType, at: Date.now() } })
    );
  } catch {
    // CustomEvent unsupported — non-critical
  }
}

/**
 * Install the global fetch interceptor.
 * Call this ONCE from OfflineProvider.
 */
export function installFetchInterceptor(): void {
  if (interceptorInstalled || typeof window === 'undefined') return;
  interceptorInstalled = true;

  originalFetch = window.fetch.bind(window);

  window.fetch = async function interceptedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    // Only intercept internal API calls
    if (!isInternalApi(url)) {
      return originalFetch(input, init);
    }

    // Handle auth/session separately — always try network, fallback to cache
    if (url.includes('/api/auth/session')) {
      return handleSessionFetch(input, init);
    }

    // Handle mutations (POST/PUT/DELETE) — queue offline if needed
    if (isMutation(init)) {
      return handleMutationFetch(url, input, init);
    }

    // Handle GET requests — network first with cache fallback
    return handleGetFetch(url, input, init);
  } as typeof window.fetch;
}

/**
 * Uninstall the interceptor (for cleanup)
 */
export function uninstallFetchInterceptor(): void {
  if (!interceptorInstalled || typeof window === 'undefined') return;
  window.fetch = originalFetch;
  interceptorInstalled = false;
}

// ============================================================
// GET handler — network first, fallback to IndexedDB cache
// ============================================================
async function handleGetFetch(
  url: string,
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const cacheKey = urlToCacheKey(url);

  try {
    const response = await originalFetch(input, init);

    if (response.ok) {
      // Clone before reading body — response can only be read once
      const clone = response.clone();
      try {
        const data = await clone.json();
        // Cache response data in IndexedDB (30 min default TTL)
        await setCachedData(cacheKey, data, 30 * 60 * 1000);
      } catch {
        // Response wasn't JSON, skip caching
      }
    }

    return response;
  } catch (networkError) {
    // Network failed — try IndexedDB cache
    const cached = await getCachedData(cacheKey);
    if (cached) {
      console.log(`[FetchInterceptor] Serving cached data for ${url}`);
      return new Response(JSON.stringify(cached.data), {
        status: 200,
        statusText: 'OK (Offline Cache)',
        headers: {
          'Content-Type': 'application/json',
          'X-Offline-Cache': 'true',
          'X-Cache-Stale': cached.isStale ? 'true' : 'false',
        },
      });
    }

    // No cache available — re-throw so the calling code can handle it
    throw networkError;
  }
}

// ============================================================
// Mutation handler — queue in IndexedDB when offline
// ============================================================
async function handleMutationFetch(
  url: string,
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  try {
    const response = await originalFetch(input, init);
    return response;
  } catch (networkError) {
    // Offline — queue the mutation
    const method = (init?.method ?? 'POST').toUpperCase();
    let body: unknown = null;
    let headers: Record<string, string> = {};

    try {
      if (init?.body) {
        body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
      }
    } catch {
      body = init?.body;
    }

    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => { headers[k] = v; });
      } else if (Array.isArray(init.headers)) {
        init.headers.forEach(([k, v]) => { headers[k] = v; });
      } else {
        headers = init.headers as Record<string, string>;
      }
    }

    // Derive entity type from URL
    const entityType = url.split('/api/')[1]?.split('/')[0]?.split('?')[0] ?? 'unknown';

    await addToOfflineQueue({
      url,
      method,
      headers,
      body,
      description: `${method} ${url}`,
      entityType,
    });

    console.log(`[FetchInterceptor] Queued offline mutation: ${method} ${url}`);

    // Register Background Sync so the queue drains automatically when the
    // network returns — even if the tab is closed — and tell the UI right away.
    await requestBackgroundSync();
    notifyQueued(entityType);

    // Return a synthetic success response so the UI doesn't break
    return new Response(
      JSON.stringify({
        success: true,
        offline: true,
        message: 'Your changes have been saved offline and will sync when you are back online.',
      }),
      {
        status: 200,
        statusText: 'OK (Queued Offline)',
        headers: {
          'Content-Type': 'application/json',
          'X-Offline-Queued': 'true',
        },
      }
    );
  }
}

// ============================================================
// Session handler — network first, fallback to cached session
// ============================================================
async function handleSessionFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  try {
    const response = await originalFetch(input, init);

    if (response.ok) {
      const clone = response.clone();
      try {
        const session = await clone.json();
        if (session?.user) {
          await setCachedData('session', session, 7 * 24 * 60 * 60 * 1000); // 7 days
        }
      } catch {}
    }

    return response;
  } catch {
    // Offline — return cached session
    const cached = await getCachedData('session');
    if (cached) {
      console.log('[FetchInterceptor] Serving cached session');
      return new Response(JSON.stringify(cached.data), {
        status: 200,
        statusText: 'OK (Offline Session)',
        headers: {
          'Content-Type': 'application/json',
          'X-Offline-Cache': 'true',
        },
      });
    }

    // No cached session — return empty session
    return new Response(JSON.stringify({}), {
      status: 200,
      statusText: 'OK (No Session)',
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
