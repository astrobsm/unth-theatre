// ============================================================
// Operative Resource Manager - Service Worker v3
// FULL Offline-First PWA with aggressive caching
// ============================================================

const CACHE_VERSION = 'v3';
const STATIC_CACHE = `orm-static-${CACHE_VERSION}`;
const DATA_CACHE = `orm-data-${CACHE_VERSION}`;
const PAGE_CACHE = `orm-pages-${CACHE_VERSION}`;
const OFFLINE_PAGE = '/offline.html';

// Static assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/',
  '/offline.html',
  '/logo.png',
  '/manifest.json',
  '/dashboard',
  '/dashboard/emergency-booking',
  '/dashboard/cmd',
  '/dashboard/cmac',
  '/dashboard/dc-mac',
  '/dashboard/laundry-supervisor',
  '/dashboard/cssd-supervisor',
  '/dashboard/oxygen-supervisor',
  '/dashboard/works-supervisor',
];

// API routes to eagerly cache for offline data access
const CRITICAL_API_ROUTES = [
  '/api/dashboard/stats',
  '/api/surgeries',
  '/api/patients',
  '/api/inventory',
  '/api/theatres',
  '/api/equipment',
  '/api/sub-stores',
  '/api/roster',
  '/api/checklists',
  '/api/alerts',
  '/api/transfers',
  '/api/theatre-setup',
  '/api/preop-reviews',
  '/api/prescriptions',
  '/api/blood-bank',
  '/api/power-status',
  '/api/water-supply',
  '/api/theatre-meals',
  '/api/emergency-booking',
];

// ============================================================
// INSTALL - Pre-cache static assets + critical pages
// ============================================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((cache) =>
        cache.addAll(PRECACHE_ASSETS).catch((err) => {
          console.log('[SW] Some precache assets unavailable, continuing...', err);
        })
      ),
    ]).then(() => self.skipWaiting())
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
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
      .then(() => {
        // Eagerly cache critical API data after activation
        caches.open(DATA_CACHE).then((cache) => {
          CRITICAL_API_ROUTES.forEach((route) => {
            fetch(route).then((response) => {
              if (response.ok) cache.put(route, response);
            }).catch(() => {});
          });
        });
      })
  );
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

  // API routes: Network-first with IndexedDB + Cache API fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithCache(request));
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
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
      // Also cache in IndexedDB for offline data access
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) {
        try {
          const data = await networkResponse.clone().json();
          storeInIndexedDB('cachedData', url.pathname + url.search, data);
        } catch (e) {}
      }
    }
    return networkResponse;
  } catch (err) {
    // Try Cache API first
    const cached = await cache.match(request);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-ORM-Cache', 'true');
      headers.set('X-ORM-Offline', 'true');
      return new Response(cached.body, { status: cached.status, headers });
    }
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

// Navigation handler: serve cached pages, fallback to dashboard shell
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
    // Try page cache
    const cachedPage = await pageCache.match(request);
    if (cachedPage) return cachedPage;
    
    const staticPage = await staticCache.match(request);
    if (staticPage) return staticPage;

    // Try matching pathname without query
    const url = new URL(request.url);
    const pathRequest = new Request(url.pathname);
    const cachedPath = await pageCache.match(pathRequest) || await staticCache.match(pathRequest);
    if (cachedPath) return cachedPath;

    // For dashboard subpages, serve the cached dashboard shell
    if (url.pathname.startsWith('/dashboard')) {
      const dashboardPage = await pageCache.match('/dashboard') || await staticCache.match('/dashboard');
      if (dashboardPage) return dashboardPage;
    }

    // Serve root if available
    const rootPage = await pageCache.match('/') || await staticCache.match('/');
    if (rootPage) return rootPage;

    // Last resort: offline page
    const offlinePage = await staticCache.match(OFFLINE_PAGE);
    return offlinePage || new Response('Offline', { status: 503 });
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
  return /\.(png|jpg|jpeg|svg|gif|ico|css|js|woff2?|ttf|eot|webp|avif|map)(\?.*)?$/.test(url);
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
// PUSH NOTIFICATIONS
// ============================================================
self.addEventListener('push', (event) => {
  let data = { title: 'ORM Notification', body: 'New update available', url: '/dashboard' };

  try {
    if (event.data) data = event.data.json();
  } catch (err) {
    if (event.data) data.body = event.data.text();
  }

  const options = {
    body: data.body,
    icon: '/logo.png',
    badge: '/logo.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/dashboard', dateOfArrival: Date.now() },
    actions: [
      { action: 'view', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
    tag: data.tag || 'orm-notification',
    renotify: true,
    requireInteraction: data.priority === 'URGENT' || data.priority === 'HIGH',
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/dashboard';
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
