// ============================================================
// IndexedDB Offline Store
// Provides: offline mutation queue, API data cache, sync tracking
// ============================================================

const DB_NAME = 'orm-offline';
const DB_VERSION = 3;

export interface OfflineQueueItem {
  id?: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  timestamp: number;
  retryCount: number;
  description: string; // Human-readable description for UI
  entityType: string;  // e.g. 'surgery', 'inventory', 'transfer'
}

export interface CachedDataItem {
  key: string;
  data: unknown;
  timestamp: number;
  expiresAt: number;
}

export interface SyncMeta {
  key: string;
  value: unknown;
}

// ============================================================
// DB Connection
// ============================================================
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
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

// ============================================================
// OFFLINE QUEUE - Queue mutations when offline
// ============================================================

export async function addToOfflineQueue(item: Omit<OfflineQueueItem, 'id' | 'timestamp' | 'retryCount'>): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineQueue', 'readwrite');
    const store = tx.objectStore('offlineQueue');
    const request = store.add({
      ...item,
      timestamp: Date.now(),
      retryCount: 0,
    });
    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

export async function getOfflineQueue(): Promise<OfflineQueueItem[]> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('offlineQueue', 'readonly');
    const store = tx.objectStore('offlineQueue');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
}

export async function getOfflineQueueCount(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('offlineQueue', 'readonly');
    const store = tx.objectStore('offlineQueue');
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(0);
  });
}

export async function removeFromOfflineQueue(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineQueue', 'readwrite');
    const store = tx.objectStore('offlineQueue');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearOfflineQueue(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineQueue', 'readwrite');
    const store = tx.objectStore('offlineQueue');
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ============================================================
// DATA CACHE - Cache API responses in IndexedDB
// ============================================================

export async function setCachedData(key: string, data: unknown, ttlMs: number = 30 * 60 * 1000): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cachedData', 'readwrite');
    const store = tx.objectStore('cachedData');
    const request = store.put({
      key,
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttlMs,
    });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getCachedData<T = unknown>(key: string): Promise<{ data: T; isStale: boolean; cachedAt: number } | null> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('cachedData', 'readonly');
    const store = tx.objectStore('cachedData');
    const request = store.get(key);
    request.onsuccess = () => {
      const result = request.result as CachedDataItem | undefined;
      if (!result) {
        resolve(null);
        return;
      }
      resolve({
        data: result.data as T,
        isStale: Date.now() > result.expiresAt,
        cachedAt: result.timestamp,
      });
    };
    request.onerror = () => resolve(null);
  });
}

export async function removeCachedData(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('cachedData', 'readwrite');
    const store = tx.objectStore('cachedData');
    store.delete(key);
    resolve();
  });
}

export async function clearExpiredCache(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('cachedData', 'readwrite');
    const store = tx.objectStore('cachedData');
    const request = store.getAll();
    let cleared = 0;
    request.onsuccess = () => {
      const items = request.result as CachedDataItem[];
      const now = Date.now();
      for (const item of items) {
        if (now > item.expiresAt) {
          store.delete(item.key);
          cleared++;
        }
      }
      resolve(cleared);
    };
    request.onerror = () => resolve(0);
  });
}

// ============================================================
// SYNC META - Track sync status
// ============================================================

export async function setSyncMeta(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('syncMeta', 'readwrite');
    const store = tx.objectStore('syncMeta');
    store.put({ key, value });
    resolve();
  });
}

export async function getSyncMeta<T = unknown>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('syncMeta', 'readonly');
    const store = tx.objectStore('syncMeta');
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result?.value ?? null);
    request.onerror = () => resolve(null);
  });
}

// ============================================================
// SYNC ENGINE - Process queued mutations
// ============================================================

export async function processOfflineQueue(): Promise<{ synced: number; failed: number; remaining: number }> {
  const queue = await getOfflineQueue();
  if (queue.length === 0) return { synced: 0, failed: 0, remaining: 0 };

  let synced = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: { 'Content-Type': 'application/json', ...item.headers },
        body: item.body ? JSON.stringify(item.body) : undefined,
      });

      if (response.ok) {
        await removeFromOfflineQueue(item.id!);
        synced++;
      } else if (response.status >= 400 && response.status < 500) {
        // Client error - don't retry
        await removeFromOfflineQueue(item.id!);
        failed++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  const remaining = await getOfflineQueueCount();
  await setSyncMeta('lastSync', { timestamp: Date.now(), synced, failed, remaining });

  return { synced, failed, remaining };
}

// ============================================================
// OFFLINE FETCH WRAPPER
// ============================================================

export async function offlineFetch(
  url: string,
  options: RequestInit & { entityType?: string; description?: string; cacheKey?: string; cacheTtl?: number } = {}
): Promise<Response> {
  const { entityType = 'unknown', description = '', cacheKey, cacheTtl, ...fetchOptions } = options;
  const isGet = !fetchOptions.method || fetchOptions.method === 'GET';

  // For GET requests: try network, fall back to IndexedDB cache
  if (isGet) {
    try {
      const response = await fetch(url, fetchOptions);
      // Cache successful responses
      if (response.ok && cacheKey) {
        const data = await response.clone().json();
        await setCachedData(cacheKey, data, cacheTtl);
      }
      return response;
    } catch {
      // Offline - try IndexedDB cache
      if (cacheKey) {
        const cached = await getCachedData(cacheKey);
        if (cached) {
          return new Response(JSON.stringify(cached.data), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'X-ORM-Cache': 'true',
              'X-ORM-Stale': cached.isStale ? 'true' : 'false',
            },
          });
        }
      }
      return new Response(JSON.stringify({ error: 'Offline', offline: true }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // For mutations: try network, queue if offline
  try {
    const response = await fetch(url, fetchOptions);
    return response;
  } catch {
    // Queue for later sync
    let body: unknown = null;
    if (fetchOptions.body && typeof fetchOptions.body === 'string') {
      try { body = JSON.parse(fetchOptions.body); } catch { body = fetchOptions.body; }
    }

    await addToOfflineQueue({
      url,
      method: fetchOptions.method || 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      description,
      entityType,
    });

    // Request background sync
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const reg = await navigator.serviceWorker.ready;
      try {
        await (reg as any).sync.register('orm-offline-sync');
      } catch {}
    }

    // Return a synthetic success response so the UI can treat it as queued
    return new Response(JSON.stringify({ queued: true, offline: true, message: 'Saved offline — will sync when connected' }), {
      status: 202,
      headers: { 'Content-Type': 'application/json', 'X-ORM-Queued': 'true' },
    });
  }
}
