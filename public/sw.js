// ============================================================
// Operative Resource Manager - Service Worker v2
// Full offline-first PWA with background sync
// ============================================================

const CACHE_VERSION = 'v2';
const STATIC_CACHE = `orm-static-${CACHE_VERSION}`;
const DATA_CACHE = `orm-data-${CACHE_VERSION}`;
const OFFLINE_PAGE = '/offline.html';

// Static assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/',
  '/offline.html',
  '/logo.png',
  '/manifest.json',
];

// ============================================================
// INSTALL - Pre-cache static assets + offline page
// ============================================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS).catch(() => {
        console.log('[SW] Some precache assets unavailable, continuing...');
      }))
      .then(() => self.skipWaiting())
  );
});

// ============================================================
// ACTIVATE - Clean old caches, claim clients
// ============================================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== DATA_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ============================================================
// FETCH - Strategy router
// ============================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip non-GET (mutations go through background sync)
  if (request.method !== 'GET') return;

  // Skip auth, SSE streams
  if (url.pathname.startsWith('/api/auth/') ||
      url.pathname.includes('/stream')) return;

  // API routes: Network-first with data cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithCache(request));
    return;
  }

  // Navigation: Network-first with offline page fallback
  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request));
    return;
  }

  // Static assets (JS, CSS, images, fonts): Cache-first
  if (isStaticAsset(request.url)) {
    event.respondWith(cacheFirstWithNetwork(request));
    return;
  }

  // Next.js chunks and data: Stale-while-revalidate
  if (url.pathname.startsWith('/_next/')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
});

// ============================================================
// CACHING STRATEGIES
// ============================================================

// Network-first: Try network, fall back to cache for API data
async function networkFirstWithCache(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-ORM-Cache', 'true');
      headers.set('X-ORM-Cache-Date', cached.headers.get('date') || '');
      return new Response(cached.body, { status: cached.status, headers });
    }
    return new Response(JSON.stringify({ error: 'Offline', offline: true, data: [] }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'X-ORM-Offline': 'true' },
    });
  }
}

// Navigation handler: network-first with offline page fallback
async function navigationHandler(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offlinePage = await caches.match(OFFLINE_PAGE);
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
  return /\.(png|jpg|jpeg|svg|gif|ico|css|js|woff2?|ttf|eot|webp|avif)(\?.*)?$/.test(url);
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
        successIds.push(item.id); // Don't retry client errors
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

  // Remove successful items
  if (successIds.length > 0) {
    const deleteTx = db.transaction('offlineQueue', 'readwrite');
    const deleteStore = deleteTx.objectStore('offlineQueue');
    for (const id of successIds) deleteStore.delete(id);
  }

  // Update retry counts for failed items
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
}

// IndexedDB helpers for service worker
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
          cache.addAll(payload.urls).catch(() => {});
        });
      }
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
  const staticKeys = await staticCache.keys();
  const dataKeys = await dataCache.keys();
  return {
    staticAssets: staticKeys.length,
    cachedApiRoutes: dataKeys.length,
    version: CACHE_VERSION,
  };
}
