/* eslint-disable */
// ============================================================
// Operative Resource Manager - Service Worker v5
// FULL Offline-First PWA with aggressive caching
// Emergency-aware: audio precaching + priority push notifications
// ============================================================

const CACHE_VERSION = 'v36';
const STATIC_CACHE = `orm-static-${CACHE_VERSION}`;
const DATA_CACHE = `orm-data-${CACHE_VERSION}`;
const PAGE_CACHE = `orm-pages-${CACHE_VERSION}`;
const OFFLINE_PAGE = '/offline.html';

// Static assets to pre-cache on install (ONLY truly static, no auth required)
const PRECACHE_ASSETS = [
  '/',
  '/dashboard',
  '/auth/login',
  '/offline.html',
  '/logo.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/manifest.json',
  '/audio/announcement-default.mp3',
  '/audio/announcement-critical.mp3',
  '/audio/announcement-high.mp3',
  '/audio/emergency-alert.wav',
];

// API routes to eagerly cache for offline data access
const CRITICAL_API_ROUTES = [
  '/api/dashboard/stats',
  '/api/surgeries',
  '/api/patients',
  '/api/inventory',
  '/api/theatres',
  '/api/sub-stores',
  '/api/roster',
  '/api/checklists',
  '/api/alerts',
  '/api/transfers',
  '/api/theatre-setup',
  '/api/preop-reviews',
  '/api/prescriptions',
  '/api/blood-requests',
  '/api/power-status',
  '/api/water-supply',
  '/api/theatre-meals',
  '/api/emergency-booking',
  '/api/emergency-display',
  '/api/emergency-alerts',
  '/api/radio/queue',
];

// ============================================================
// INSTALL - Pre-cache static assets (resilient per-asset caching)
// ============================================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      // Cache each asset individually so one failure doesn't block the rest
      const results = await Promise.allSettled(
        PRECACHE_ASSETS.map(async (url) => {
          try {
            const response = await fetch(url, { credentials: 'omit' });
            if (response.ok) {
              await cache.put(url, response);
              return url;
            }
          } catch (e) {
            console.log('[SW] Failed to precache:', url, e);
          }
          return null;
        })
      );
      const cached = results.filter(r => r.status === 'fulfilled' && r.value).length;
      console.log(`[SW v5] Precached ${cached}/${PRECACHE_ASSETS.length} assets`);
    }).then(() => self.skipWaiting())
  );
});

// ============================================================
// ACTIVATE - Clean old caches, claim clients immediately
// ============================================================
self.addEventListener('activate', (event) => {
  const currentCaches = [STATIC_CACHE, DATA_CACHE, PAGE_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => !currentCaches.includes(key))
          .map((key) => {
            console.log('[SW v5] Deleting old cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim())
      .then(() => {
        console.log('[SW v5] Activated and claimed clients');
        // Lazy-cache API data: wait 20s then fetch 3 at a time
        setTimeout(() => {
          lazyCacheApiRoutes();
        }, 20000);
      })
  );
});

// Returns true only when there is a real, authenticated NextAuth session.
// Used to avoid firing session-protected endpoints (which return 401) while
// the user is on the login/public screen or after the session has expired —
// those 401s are harmless to the cache but create alarming console noise.
async function hasValidSession() {
  try {
    const res = await fetch('/api/auth/session', { credentials: 'include' });
    if (!res.ok) return false;
    const data = await res.clone().json().catch(() => null);
    return !!(data && data.user);
  } catch (e) {
    return false;
  }
}

// Lazy API route caching — 3 at a time with 2s gaps.
// IMPORTANT: include credentials so session-protected endpoints are cached
// (otherwise we just cache 401 responses, which then poison offline reads).
async function lazyCacheApiRoutes() {
  // Skip entirely when unauthenticated — prevents a burst of 401s against the
  // auth-protected CRITICAL_API_ROUTES on the login/public screen.
  if (!(await hasValidSession())) {
    console.log('[SW] Skipping lazy API caching — no authenticated session yet');
    return;
  }
  const cache = await caches.open(DATA_CACHE);
  const BATCH = 3;
  for (let i = 0; i < CRITICAL_API_ROUTES.length; i += BATCH) {
    const batch = CRITICAL_API_ROUTES.slice(i, i + BATCH);
    await Promise.allSettled(
      batch.map((route) =>
        fetch(route, { credentials: 'include' })
          .then((res) => {
            // Only cache 2xx responses — never poison the offline store with 401/403
            if (res.ok && res.status >= 200 && res.status < 300) {
              cache.put(route, res);
            }
          })
          .catch(() => {})
      )
    );
    // Small delay between batches
    await new Promise((r) => setTimeout(r, 2000));
  }
}

// ============================================================
// MESSAGE - Allow pages to request precaching of specific URLs
// (used to keep popouts like the Emergency TV display available offline)
// ============================================================
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'PRECACHE_PAGES' && Array.isArray(data.urls)) {
    event.waitUntil((async () => {
      const cache = await caches.open(PAGE_CACHE);
      await Promise.allSettled(
        data.urls.map(async (url) => {
          try {
            const res = await fetch(url, { credentials: 'include' });
            if (res.ok) await cache.put(new Request(url), res.clone());
          } catch (e) {
            console.log('[SW] PRECACHE_PAGES failed for', url, e);
          }
        })
      );
    })());
  } else if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ============================================================
// FETCH - Strategy router with full offline support
// ============================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Handle non-GET mutations — let app handle via offlineStore
  if (request.method !== 'GET') return;

  // Skip auth callback, SSE streams, and SW itself
  if (url.pathname.startsWith('/api/auth/callback') ||
      url.pathname.includes('/stream') ||
      url.pathname === '/sw.js') return;

  // Auth session endpoint: network-first with aggressive cache
  if (url.pathname === '/api/auth/session') {
    event.respondWith(networkFirstSession(request));
    return;
  }

  // Emergency display data: network-first with aggressive caching + IndexedDB
  // This ensures emergency data is always available offline
  if (url.pathname === '/api/emergency-display' || url.pathname === '/api/emergency-alerts') {
    event.respondWith(networkFirstEmergency(request));
    return;
  }

  // API routes: fast-cache first paint, then revalidate. On a healthy network
  // we still return fresh data; on a slow/poor network we fall back to the last
  // cached copy after a short timeout so pages render instantly instead of
  // hanging. The cache is always refreshed in the background when the network
  // eventually responds, so the next read only reflects recent changes.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithCache(request));
    return;
  }

  // React Server Component (App Router) navigation / prefetch payloads. These
  // are how client-side sidebar navigation fetches a page's content. Cache them
  // (network-first) so once a route has been visited or prefetched it keeps
  // working offline instead of bouncing the user to the dashboard.
  const isRSC =
    request.headers.get('RSC') === '1' ||
    request.headers.get('Next-Router-Prefetch') === '1' ||
    url.searchParams.has('_rsc');
  if (isRSC) {
    event.respondWith(rscNetworkFirst(request));
    return;
  }

  // Navigation: serve cached pages offline
  if (request.mode === 'navigate') {
    event.respondWith(offlineNavigationHandler(request));
    return;
  }

  // Next.js static chunks: Cache-first (immutable)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirstWithNetwork(request));
    return;
  }

  // Next.js data + other _next assets: Stale-while-revalidate
  if (url.pathname.startsWith('/_next/')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Static assets: Cache-first
  if (isStaticAsset(request.url)) {
    event.respondWith(cacheFirstWithNetwork(request));
    return;
  }
});

// ============================================================
// CACHING STRATEGIES
// ============================================================

// Emergency data: aggressive dual-cache (Cache API + IndexedDB) for offline display
// Emergency alerts are critical — always try to serve the freshest possible data
async function networkFirstEmergency(request) {
  const cache = await caches.open(DATA_CACHE);
  const url = new URL(request.url);
  const cacheKey = url.pathname;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      // Cache in both Cache API and IndexedDB for maximum offline durability
      cache.put(request, networkResponse.clone());
      try {
        const data = await networkResponse.clone().json();
        storeInIndexedDB('cachedData', cacheKey, data);
      } catch (e) {}
    }
    return networkResponse;
  } catch (err) {
    // Network failed — serve from cache
    const cached = await cache.match(request);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-ORM-Cache', 'true');
      headers.set('X-ORM-Offline', 'true');
      headers.set('X-ORM-Emergency', 'true');
      return new Response(cached.body, { status: cached.status, headers });
    }
    // IndexedDB as last resort
    const idbData = await getFromIndexedDB('cachedData', cacheKey);
    if (idbData) {
      return new Response(JSON.stringify(idbData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-ORM-Cache': 'true',
          'X-ORM-Offline': 'true',
          'X-ORM-Emergency': 'true',
        },
      });
    }
    return new Response(JSON.stringify({ error: 'Offline', offline: true, emergencies: [] }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'X-ORM-Offline': 'true' },
    });
  }
}

// Auth session: cache aggressively so app works offline
async function networkFirstSession(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
      // Also store in IndexedDB for extra durability
      try {
        const sessionData = await networkResponse.clone().json();
        storeInIndexedDB('cachedData', 'session', sessionData);
      } catch (e) {}
    }
    return networkResponse;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-ORM-Cache', 'true');
      headers.set('X-ORM-Offline', 'true');
      return new Response(cached.body, { status: cached.status, headers });
    }
    // Try IndexedDB as last resort
    const idbSession = await getFromIndexedDB('cachedData', 'session');
    if (idbSession) {
      return new Response(JSON.stringify(idbSession), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-ORM-Cache': 'true', 'X-ORM-Offline': 'true' },
      });
    }
    return new Response(JSON.stringify({ user: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-ORM-Offline': 'true' },
    });
  }
}

// Network-first: Try network, fall back to cache for API data
async function networkFirstWithCache(request) {
  const cache = await caches.open(DATA_CACHE);

  // How long we wait for the network before showing the cached copy. Keeps
  // pages responsive on poor connections; the network request keeps running in
  // the background and refreshes the cache when it finally resolves.
  const NETWORK_TIMEOUT_MS = 3000;

  const networkPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        // Store in the Cache API only. We no longer re-parse the body to also
        // write an IndexedDB copy on every response — that doubled the work on
        // every API call. The Cache API copy already serves offline fallback.
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    });

  const cached = await cache.match(request);

  if (cached) {
    // Race the network against a short timeout. If the network wins quickly we
    // return the fresh response; otherwise we serve the cached copy immediately
    // (and the background fetch above still refreshes the cache for next time).
    const timeoutFallback = new Promise((resolve) => {
      setTimeout(() => {
        const headers = new Headers(cached.headers);
        headers.set('X-ORM-Cache', 'true');
        resolve(new Response(cached.body, { status: cached.status, headers }));
      }, NETWORK_TIMEOUT_MS);
    });
    try {
      return await Promise.race([networkPromise, timeoutFallback]);
    } catch (err) {
      const headers = new Headers(cached.headers);
      headers.set('X-ORM-Cache', 'true');
      headers.set('X-ORM-Offline', 'true');
      return new Response(cached.body, { status: cached.status, headers });
    }
  }

  // No cached copy yet (first ever load of this endpoint) — wait for the network.
  try {
    return await networkPromise;
  } catch (err) {
    // Try IndexedDB
    const url = new URL(request.url);
    const idbData = await getFromIndexedDB('cachedData', url.pathname + url.search);
    if (idbData) {
      return new Response(JSON.stringify(idbData), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-ORM-Cache': 'true', 'X-ORM-Offline': 'true' },
      });
    }
    // Try base path without query
    const baseData = await getFromIndexedDB('cachedData', url.pathname);
    if (baseData) {
      return new Response(JSON.stringify(baseData), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-ORM-Cache': 'true', 'X-ORM-Offline': 'true' },
      });
    }
    return new Response(JSON.stringify({ error: 'Offline', offline: true, data: [] }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'X-ORM-Offline': 'true' },
    });
  }
}

// Navigation handler: serve the EXACT cached route offline.
// IMPORTANT: never serve a *different* route's HTML (e.g. the /dashboard shell
// for /dashboard/patients). The Next.js App Router would detect the URL/RSC
// mismatch and fall into a blank, infinitely-reloading page. When the exact
// route isn't cached we serve the static, router-free offline page instead.
// React Server Component (App Router) flight payloads. Serve a cached payload
// INSTANTLY when we have one (so navigation between visited/prefetched pages is
// immediate even on a poor network), refreshing it in the background. Only the
// very first visit to a route waits on the network.
async function rscNetworkFirst(request) {
  const cache = await caches.open(PAGE_CACHE);
  const url = new URL(request.url);
  // Normalise the key: drop the volatile `_rsc` cache-buster and tag it so RSC
  // payloads never collide with the plain-HTML page cache for the same URL.
  const keyUrl = new URL(url.href);
  keyUrl.searchParams.delete('_rsc');
  keyUrl.searchParams.set('__orm_rsc', '1');
  const key = keyUrl.href;

  const cached = await cache.match(key);
  const networkFetch = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(key, res.clone());
      return res;
    })
    .catch(() => null);

  if (cached) {
    // Instant: hand back the cached RSC now, refresh in the background.
    networkFetch.catch(() => {});
    return cached;
  }

  const res = await networkFetch;
  if (res) return res;
  // No cache + network failed — 404 makes the Next.js client fall back to a
  // full-page navigation, which the navigation handler serves from cache.
  return new Response('', { status: 404, headers: { 'Content-Type': 'text/plain' } });
}

async function offlineNavigationHandler(request) {
  const pageCache = await caches.open(PAGE_CACHE);
  const staticCache = await caches.open(STATIC_CACHE);

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      pageCache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    // 1) Exact route match (ignoreSearch handles App Router cache-busting params).
    const cached =
      (await pageCache.match(request, { ignoreSearch: true })) ||
      (await staticCache.match(request, { ignoreSearch: true }));
    if (cached) return cached;

    // 2) App-shell fallback. This is a client-rendered SPA (Next.js App Router):
    //    serving the cached dashboard/home shell lets the client router boot and
    //    render the requested route from cached data — instead of the dead-end
    //    offline page. Only routes under /dashboard get the dashboard shell so
    //    the sidebar layout matches; everything else gets the root shell.
    const url = new URL(request.url);
    const shellCandidates = url.pathname.startsWith('/dashboard')
      ? ['/dashboard', '/']
      : ['/', '/dashboard'];
    for (const shell of shellCandidates) {
      const shellRes =
        (await pageCache.match(shell, { ignoreSearch: true })) ||
        (await staticCache.match(shell, { ignoreSearch: true }));
      if (shellRes) {
        const headers = new Headers(shellRes.headers);
        headers.set('X-ORM-Offline-Shell', 'true');
        return new Response(shellRes.body, { status: shellRes.status, headers });
      }
    }

    // 3) Last resort — the stable static offline page.
    const offlinePage =
      (await staticCache.match(OFFLINE_PAGE)) || (await caches.match(OFFLINE_PAGE));
    return (
      offlinePage ||
      new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
    );
  }
}

// Cache-first: serve from cache, fall back to network (static assets)
async function cacheFirstWithNetwork(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    return new Response('', { status: 404 });
  }
}

// Stale-while-revalidate: serve cached immediately, update in background
async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const networkFetch = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);

  return cached || networkFetch;
}

function isStaticAsset(url) {
  return /\.(png|jpg|jpeg|svg|gif|ico|css|js|woff2?|ttf|eot|webp|avif|map|mp3|wav|ogg|webm|aac)(\?.*)?$/.test(url);
}

// ============================================================
// IndexedDB Helpers (for service worker context)
// ============================================================
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('orm-offline', 3);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('offlineQueue')) {
        db.createObjectStore('offlineQueue', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('cachedData')) {
        db.createObjectStore('cachedData', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('syncMeta')) {
        db.createObjectStore('syncMeta', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function storeInIndexedDB(storeName, key, data) {
  openIndexedDB().then((db) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.put({ key, data, timestamp: Date.now(), expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
  }).catch(() => {});
}

function getFromIndexedDB(storeName, key) {
  return openIndexedDB().then((db) => {
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result?.data || null);
      request.onerror = () => resolve(null);
    });
  }).catch(() => null);
}

// ============================================================
// BACKGROUND SYNC - Process queued offline mutations
// ============================================================
self.addEventListener('sync', (event) => {
  if (event.tag === 'orm-offline-sync') {
    event.waitUntil(processOfflineQueue());
  }
});

async function processOfflineQueue() {
  const db = await openIndexedDB();
  const tx = db.transaction('offlineQueue', 'readonly');
  const store = tx.objectStore('offlineQueue');
  const allRequests = await idbGetAll(store);

  if (!allRequests || allRequests.length === 0) return;

  const successIds = [];
  const failedItems = [];

  for (const item of allRequests) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body ? JSON.stringify(item.body) : undefined,
      });
      if (response.ok) {
        successIds.push(item.id);
      } else if (response.status >= 400 && response.status < 500) {
        successIds.push(item.id);
      } else {
        item.retryCount = (item.retryCount || 0) + 1;
        if (item.retryCount < 5) failedItems.push(item);
        else successIds.push(item.id);
      }
    } catch (err) {
      item.retryCount = (item.retryCount || 0) + 1;
      if (item.retryCount < 5) failedItems.push(item);
    }
  }

  if (successIds.length > 0) {
    const deleteTx = db.transaction('offlineQueue', 'readwrite');
    const deleteStore = deleteTx.objectStore('offlineQueue');
    for (const id of successIds) deleteStore.delete(id);
  }

  if (failedItems.length > 0) {
    const updateTx = db.transaction('offlineQueue', 'readwrite');
    const updateStore = updateTx.objectStore('offlineQueue');
    for (const item of failedItems) updateStore.put(item);
  }

  // Notify clients
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({
      type: 'SYNC_COMPLETE',
      synced: successIds.length,
      pending: failedItems.length,
      timestamp: Date.now(),
    });
  });

  // Refresh data caches after successful sync
  if (successIds.length > 0) {
    const dataCache = await caches.open(DATA_CACHE);
    CRITICAL_API_ROUTES.forEach((route) => {
      fetch(route).then((res) => {
        if (res.ok) dataCache.put(route, res);
      }).catch(() => {});
    });
  }
}

// ============================================================
// PERIODIC SYNC - Background data refresh
// ============================================================
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'orm-data-refresh') {
    event.waitUntil(refreshCriticalData());
  }
});

async function refreshCriticalData() {
  const cache = await caches.open(DATA_CACHE);
  for (const route of CRITICAL_API_ROUTES) {
    try {
      const response = await fetch(route);
      if (response.ok) {
        cache.put(route, response.clone());
        try {
          const data = await response.json();
          storeInIndexedDB('cachedData', route, data);
        } catch (e) {}
      }
    } catch (e) {}
  }
}

// IndexedDB helper
function idbGetAll(store) {
  return new Promise((resolve) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve([]);
  });
}

// ============================================================
// PUSH NOTIFICATIONS (with Emergency Surgery priority support)
// ============================================================
self.addEventListener('push', (event) => {
  let data = { title: 'ORM Notification', body: 'New update available', url: '/dashboard' };

  try {
    if (event.data) data = event.data.json();
  } catch (err) {
    if (event.data) data.body = event.data.text();
  }

  // Emergency surgery alerts get special treatment
  const isEmergency = data.tag === 'emergency-surgery' || data.priority === 'CRITICAL' || data.priority === 'URGENT';

  const options = {
    body: data.body,
    icon: '/logo.png',
    badge: '/logo.png',
    vibrate: isEmergency ? [200, 100, 200, 100, 200, 100, 400] : [100, 50, 100],
    data: { url: data.url || (isEmergency ? '/emergency-display' : '/dashboard'), dateOfArrival: Date.now(), isEmergency },
    actions: isEmergency
      ? [
          { action: 'view', title: '\ud83d\udea8 View Emergency' },
          { action: 'acknowledge', title: '\u2705 Acknowledge' },
        ]
      : [
          { action: 'view', title: 'View' },
          { action: 'dismiss', title: 'Dismiss' },
        ],
    tag: data.tag || (isEmergency ? 'emergency-surgery' : 'orm-notification'),
    renotify: true,
    requireInteraction: isEmergency || data.priority === 'URGENT' || data.priority === 'HIGH',
    urgency: isEmergency ? 'very-low' : undefined, // Hint to show even in DND
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
      .then(() => {
        // For emergencies, also notify all connected clients to trigger audio
        if (isEmergency) {
          return self.clients.matchAll({ type: 'window' }).then((clients) => {
            clients.forEach((client) => {
              client.postMessage({
                type: 'EMERGENCY_PUSH',
                priority: data.priority || 'HIGH',
                timestamp: Date.now(),
              });
            });
          });
        }
      })
  );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const isEmergency = event.notification.data?.isEmergency;
  const url = event.action === 'acknowledge'
    ? '/dashboard/emergency-alerts'
    : event.notification.data?.url || (isEmergency ? '/emergency-display' : '/dashboard');

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            client.navigate(url);
            return;
          }
        }
        return self.clients.openWindow(url);
      })
  );
});

// ============================================================
// MESSAGE HANDLER - Communicate with app
// ============================================================
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'CACHE_URLS':
      if (payload && payload.urls) {
        caches.open(DATA_CACHE).then((cache) => {
          payload.urls.forEach((url) => {
            fetch(url).then((resp) => {
              if (resp.ok) cache.put(url, resp);
            }).catch(() => {});
          });
        });
      }
      break;

    case 'CACHE_PAGE':
      if (payload && payload.url) {
        caches.open(PAGE_CACHE).then((cache) => {
          fetch(payload.url).then((resp) => {
            if (resp.ok) cache.put(payload.url, resp);
          }).catch(() => {});
        });
      }
      break;

    case 'PRECACHE_APP_SHELL':
      if (payload && payload.routes) {
        caches.open(PAGE_CACHE).then((cache) => {
          payload.routes.forEach((route) => {
            fetch(route).then((resp) => {
              if (resp.ok) cache.put(route, resp);
            }).catch(() => {});
          });
        });
      }
      break;

    case 'CACHE_API_DATA':
      refreshCriticalData();
      break;

    case 'GET_CACHE_STATUS':
      getCacheStatus().then((status) => {
        if (event.source) event.source.postMessage({ type: 'CACHE_STATUS', payload: status });
      });
      break;

    case 'CLEAR_CACHES':
      caches.keys().then((keys) => {
        Promise.all(keys.map((k) => caches.delete(k))).then(() => {
          if (event.source) event.source.postMessage({ type: 'CACHES_CLEARED' });
        });
      });
      break;
  }
});

async function getCacheStatus() {
  const staticCache = await caches.open(STATIC_CACHE);
  const dataCache = await caches.open(DATA_CACHE);
  const pageCache = await caches.open(PAGE_CACHE);
  const staticKeys = await staticCache.keys();
  const dataKeys = await dataCache.keys();
  const pageKeys = await pageCache.keys();
  return {
    staticAssets: staticKeys.length,
    cachedApiRoutes: dataKeys.length,
    cachedPages: pageKeys.length,
    version: CACHE_VERSION,
  };
}
