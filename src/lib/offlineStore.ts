// ============================================================
// IndexedDB Offline Store
// Provides: offline mutation queue, API data cache, sync tracking
// ============================================================

import {
  extractServerId,
  hasUnresolvedClientId,
  remapClientIds,
  remapUrl,
  type PendingRecord,
} from './offlineMerge';

const DB_NAME = 'orm-offline';
const DB_VERSION = 6;
const MAX_SYNC_RETRIES = 5;

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
// DB Connection (with graceful degradation)
// ============================================================
let dbUnavailable = false; // cache failure so we stop retrying
let cachedDB: IDBDatabase | null = null;

/** Returns true if IndexedDB is available in the current environment */
export function isIndexedDBAvailable(): boolean {
  if (dbUnavailable) return false;
  if (typeof window === 'undefined') return false;
  if (typeof indexedDB === 'undefined') {
    dbUnavailable = true;
    return false;
  }
  return true;
}

function openDB(): Promise<IDBDatabase> {
  // Fast-fail if we already know DB is unavailable
  if (dbUnavailable) return Promise.reject(new Error('IndexedDB unavailable'));

  // Reuse existing connection if still open
  if (cachedDB) {
    try {
      // Verify the connection is still alive by checking name
      if (cachedDB.name) return Promise.resolve(cachedDB);
    } catch {
      cachedDB = null;
    }
  }

  if (!isIndexedDBAvailable()) {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }

  return new Promise((resolve, reject) => {
    try {
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
        // v4: dead-letter store for mutations that failed to sync (client error
        // or exhausted retries) so staff can see / retry / dismiss them.
        if (!db.objectStoreNames.contains('failedMutations')) {
          db.createObjectStore('failedMutations', { keyPath: 'id', autoIncrement: true });
        }
        // v5: encrypted offline-login vault — one record per enrolled user,
        // keyed by lowercased username. Holds ONLY ciphertext (see offlineAuth).
        if (!db.objectStoreNames.contains('authVault')) {
          db.createObjectStore('authVault', { keyPath: 'username' });
        }
        // v6: records created/edited/deleted while offline, so reads can show
        // them before they reach the server (see lib/offlineMerge.ts).
        if (!db.objectStoreNames.contains('pendingRecords')) {
          const store = db.createObjectStore('pendingRecords', { keyPath: 'clientId' });
          store.createIndex('entityType', 'entityType', { unique: false });
        }
      };

      request.onsuccess = () => {
        cachedDB = request.result;
        // Clear cached ref if connection closes
        cachedDB.onclose = () => { cachedDB = null; };
        resolve(cachedDB);
      };

      request.onerror = () => {
        console.warn('[offlineStore] IndexedDB open failed, disabling offline storage:', request.error?.message);
        dbUnavailable = true;
        reject(request.error);
      };
    } catch (err) {
      console.warn('[offlineStore] IndexedDB not available:', err);
      dbUnavailable = true;
      reject(err);
    }
  });
}

// ============================================================
// OFFLINE QUEUE - Queue mutations when offline
// ============================================================

export async function addToOfflineQueue(item: Omit<OfflineQueueItem, 'id' | 'timestamp' | 'retryCount'>): Promise<number> {
  if (!isIndexedDBAvailable()) return -1;
  // De-dupe: skip if an identical pending mutation (same url + method + body, or
  // same idempotency key) is already queued — prevents accidental double-queues.
  try {
    const pending = await getOfflineQueue();
    const newBody = JSON.stringify(item.body ?? null);
    const newKey = item.headers?.['X-Idempotency-Key'];
    const dup = pending.find((p) =>
      (newKey && p.headers?.['X-Idempotency-Key'] === newKey) ||
      (p.url === item.url && p.method === item.method && JSON.stringify(p.body ?? null) === newBody),
    );
    if (dup) return dup.id ?? -1;
  } catch { /* fall through to enqueue */ }
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
  if (!isIndexedDBAvailable()) return [];
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
  if (!isIndexedDBAvailable()) return 0;
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
  if (!isIndexedDBAvailable()) return;
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
  if (!isIndexedDBAvailable()) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineQueue', 'readwrite');
    const store = tx.objectStore('offlineQueue');
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Update a queued item in place (e.g. bump retryCount).
async function updateOfflineQueueItem(item: OfflineQueueItem): Promise<void> {
  if (!isIndexedDBAvailable() || item.id == null) return;
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('offlineQueue', 'readwrite');
    tx.objectStore('offlineQueue').put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// ============================================================
// DEAD-LETTER — mutations that could not be synced
// ============================================================
export interface FailedMutation {
  id?: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  description: string;
  entityType: string;
  failedAt: number;
  lastError: string;
  /**
   * Present when the server refused the change because the record had moved on.
   * Holds what the server currently has, so the user can compare the two
   * versions and decide, rather than being told only that it failed.
   */
  conflict?: {
    serverVersion?: string;
    yourVersion?: string;
    serverRecord?: unknown;
  };
}

async function addFailedMutation(
  item: OfflineQueueItem,
  lastError: string,
  conflict?: FailedMutation['conflict']
): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('failedMutations', 'readwrite');
    tx.objectStore('failedMutations').add({
      url: item.url, method: item.method, headers: item.headers, body: item.body,
      description: item.description, entityType: item.entityType, failedAt: Date.now(), lastError,
      ...(conflict ? { conflict } : {}),
    });
    tx.oncomplete = () => {
      try { window.dispatchEvent(new CustomEvent('orm:sync-failed')); } catch { /* ignore */ }
      resolve();
    };
    tx.onerror = () => resolve();
  });
}

export async function getFailedMutations(): Promise<FailedMutation[]> {
  if (!isIndexedDBAvailable()) return [];
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('failedMutations', 'readonly');
    const req = tx.objectStore('failedMutations').getAll();
    req.onsuccess = () => resolve((req.result as FailedMutation[]) || []);
    req.onerror = () => resolve([]);
  });
}

export async function getFailedCount(): Promise<number> {
  if (!isIndexedDBAvailable()) return 0;
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('failedMutations', 'readonly');
    const req = tx.objectStore('failedMutations').count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(0);
  });
}

export async function dismissFailedMutation(id: number): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('failedMutations', 'readwrite');
    tx.objectStore('failedMutations').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// Move a failed mutation back onto the live queue for another sync attempt.
export async function retryFailedMutation(id: number): Promise<void> {
  const failed = await getFailedMutations();
  const item = failed.find((f) => f.id === id);
  if (!item) return;
  await addToOfflineQueue({
    url: item.url, method: item.method, headers: item.headers, body: item.body,
    description: item.description, entityType: item.entityType,
  });
  // Back in the queue: clear the red "rejected" badge on the local row.
  await unmarkPendingFailed(item.headers?.['X-Idempotency-Key']);
  await dismissFailedMutation(id);
}

/** Clear the rejected flag when a failed mutation is queued again. */
export async function unmarkPendingFailed(key?: string): Promise<void> {
  if (!key) return;
  const all = await getPendingRecords();
  await Promise.all(
    all
      .filter((p) => p.idempotencyKey === key)
      .map((p) => addPendingRecord({ ...p, failed: false }))
  );
}

/**
 * Resolve a conflict in favour of THIS device's version: re-queue the change
 * with an explicit overwrite marker, having first moved the base version
 * forward to what the server now holds. The overwrite is deliberate, recorded,
 * and only ever happens because a person chose it.
 */
export async function resolveConflictKeepMine(id: number): Promise<void> {
  const failed = await getFailedMutations();
  const item = failed.find((f) => f.id === id);
  if (!item) return;

  const headers: Record<string, string> = { ...item.headers, 'X-Overwrite-Conflict': 'true' };
  if (item.conflict?.serverVersion) headers['X-Base-Version'] = item.conflict.serverVersion;

  await addToOfflineQueue({
    url: item.url, method: item.method, headers, body: item.body,
    description: item.description, entityType: item.entityType,
  });
  await unmarkPendingFailed(item.headers?.['X-Idempotency-Key']);
  await dismissFailedMutation(id);
}

/**
 * Resolve a conflict in favour of the SERVER: throw away this device's version
 * and let the record stand as it is. Equivalent to discarding the change.
 */
export async function resolveConflictKeepServer(id: number): Promise<void> {
  await discardFailedMutation(id);
}

/**
 * Discard a rejected change for good: removes the dead-letter entry AND the
 * local row it produced, so the list stops showing work that will never be
 * saved. Used by the "Dismiss" action in the sync panel.
 */
export async function discardFailedMutation(id: number): Promise<void> {
  const failed = await getFailedMutations();
  const item = failed.find((f) => f.id === id);
  if (item) await removePendingByIdempotencyKey(item.headers?.['X-Idempotency-Key']);
  await dismissFailedMutation(id);
}

// ============================================================
// PENDING RECORDS — rows created/changed offline, merged into reads until
// they reach the server (see lib/offlineMerge.ts).
// ============================================================
export async function addPendingRecord(record: PendingRecord): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('pendingRecords', 'readwrite');
    tx.objectStore('pendingRecords').put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function getPendingRecords(entityType?: string): Promise<PendingRecord[]> {
  if (!isIndexedDBAvailable()) return [];
  const db = await openDB();
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('pendingRecords', 'readonly');
      const store = tx.objectStore('pendingRecords');
      const req = entityType
        ? store.index('entityType').getAll(entityType)
        : store.getAll();
      req.onsuccess = () => resolve((req.result as PendingRecord[]) || []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function removePendingRecord(clientId: string): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('pendingRecords', 'readwrite');
    tx.objectStore('pendingRecords').delete(clientId);
    tx.oncomplete = () => {
      // Tell the fetch interceptor to drop its in-memory overlay so the next
      // read shows the server's authoritative row rather than the local copy.
      try { window.dispatchEvent(new CustomEvent('orm:pending-changed')); } catch { /* ignore */ }
      resolve();
    };
    tx.onerror = () => resolve();
  });
}

/**
 * Clear the pending record belonging to a queued mutation once that mutation
 * has reached the server — otherwise the row would keep showing a "waiting to
 * sync" badge forever.
 */
export async function removePendingByIdempotencyKey(key?: string): Promise<void> {
  if (!key) return;
  const all = await getPendingRecords();
  await Promise.all(
    all.filter((p) => p.idempotencyKey === key).map((p) => removePendingRecord(p.clientId))
  );
}

/**
 * Flag the local row whose sync the server rejected. It stays on screen (the
 * work is not thrown away) but is marked so it is not mistaken for saved.
 */
export async function markPendingFailed(key?: string): Promise<void> {
  if (!key) return;
  const all = await getPendingRecords();
  await Promise.all(
    all
      .filter((p) => p.idempotencyKey === key)
      .map((p) => addPendingRecord({ ...p, failed: true }))
  );
}

// ============================================================
// AUTH VAULT — encrypted offline-login records (see lib/offlineAuth.ts)
// Only ciphertext + non-secret metadata is ever stored here.
// ============================================================
export interface AuthVaultRecord {
  username: string;        // lowercased, the store key
  displayName: string;     // for the "signed in as" hint on the login screen
  salt: string;            // base64 PBKDF2 salt
  iv: string;              // base64 AES-GCM IV
  iterations: number;      // PBKDF2 iteration count used
  ciphertext: string;      // base64 AES-GCM payload (the NextAuth session)
  enrolledAt: number;
  expiresAt: number;
  failedAttempts: number;
  lockedUntil: number;     // epoch ms; 0 = not locked
  lastOfflineLoginAt: number;
}

export async function putAuthVault(record: AuthVaultRecord): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('authVault', 'readwrite');
    tx.objectStore('authVault').put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function getAuthVault(username: string): Promise<AuthVaultRecord | null> {
  if (!isIndexedDBAvailable()) return null;
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('authVault', 'readonly');
    const req = tx.objectStore('authVault').get(username.trim().toLowerCase());
    req.onsuccess = () => resolve((req.result as AuthVaultRecord) ?? null);
    req.onerror = () => resolve(null);
  });
}

export async function listAuthVaults(): Promise<AuthVaultRecord[]> {
  if (!isIndexedDBAvailable()) return [];
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('authVault', 'readonly');
    const req = tx.objectStore('authVault').getAll();
    req.onsuccess = () => resolve((req.result as AuthVaultRecord[]) || []);
    req.onerror = () => resolve([]);
  });
}

export async function deleteAuthVault(username: string): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('authVault', 'readwrite');
    tx.objectStore('authVault').delete(username.trim().toLowerCase());
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// ============================================================
// DATA CACHE - Cache API responses in IndexedDB
// ============================================================

export async function setCachedData(key: string, data: unknown, ttlMs: number = 30 * 60 * 1000): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  try {
    await putCachedData(key, data, ttlMs);
  } catch (err) {
    // Storage full — usually a form carrying base64 photos/scans. Drop expired
    // entries and try once more, so a queued mutation is never lost just
    // because the READ cache had filled up.
    const name = (err as { name?: string })?.name || '';
    if (name === 'QuotaExceededError' || name === 'AbortError') {
      try {
        await clearExpiredCache();
        await putCachedData(key, data, ttlMs);
        return;
      } catch {
        console.warn('[offlineStore] cache write failed after eviction; continuing without caching');
        return;
      }
    }
    // Any other failure: caching is best-effort and must never break the caller.
    console.warn('[offlineStore] cache write failed:', (err as Error)?.message);
  }
}

function putCachedData(key: string, data: unknown, ttlMs: number): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
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
        tx.onabort = () => reject(tx.error);
      })
  );
}

export async function getCachedData<T = unknown>(key: string): Promise<{ data: T; isStale: boolean; cachedAt: number } | null> {
  if (!isIndexedDBAvailable()) return null;
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
  if (!isIndexedDBAvailable()) return;
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('cachedData', 'readwrite');
    const store = tx.objectStore('cachedData');
    store.delete(key);
    resolve();
  });
}

export async function clearExpiredCache(): Promise<number> {
  if (!isIndexedDBAvailable()) return 0;
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
  if (!isIndexedDBAvailable()) return;
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('syncMeta', 'readwrite');
    const store = tx.objectStore('syncMeta');
    store.put({ key, value });
    resolve();
  });
}

export async function getSyncMeta<T = unknown>(key: string): Promise<T | null> {
  if (!isIndexedDBAvailable()) return null;
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

async function safeErr(response: Response): Promise<string> {
  try {
    const j = await response.clone().json();
    return (j?.error || j?.message || '').toString().slice(0, 200);
  } catch {
    return '';
  }
}

/** Persisted map of local ids -> the server ids they became. */
const ID_MAP_KEY = 'clientIdMap';

async function loadIdMap(): Promise<Record<string, string>> {
  return (await getSyncMeta<Record<string, string>>(ID_MAP_KEY)) ?? {};
}

export async function processOfflineQueue(): Promise<{ synced: number; failed: number; remaining: number }> {
  const queue = await getOfflineQueue();
  if (queue.length === 0) return { synced: 0, failed: 0, remaining: 0 };

  let synced = 0;
  let failed = 0;

  // Records created offline hold a local id; anything queued after them refers
  // to it (register a patient, then book their surgery). As each create lands
  // we learn its real id and rewrite the rest of the queue, so the chain of
  // work a nurse did offline syncs as a unit instead of the children failing.
  // The queue is FIFO, so a parent is always attempted before its children.
  const idMap = await loadIdMap();

  for (const rawItem of queue) {
    // Hold back anything still pointing at a local id we have not resolved —
    // its parent has not synced yet. Sending it would guarantee a rejection and
    // dead-letter real clinical work.
    if (hasUnresolvedClientId(rawItem.url, rawItem.body, idMap)) {
      failed++;
      continue;
    }

    const item: OfflineQueueItem = {
      ...rawItem,
      url: remapUrl(rawItem.url, idMap),
      body: remapClientIds(rawItem.body, idMap),
    };

    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: { 'Content-Type': 'application/json', ...item.headers },
        body: item.body ? JSON.stringify(item.body) : undefined,
      });

      if (response.ok) {
        // Learn this record's real id so later items can reference it.
        if (item.method === 'POST') {
          try {
            const created = await response.clone().json();
            const serverId = extractServerId(created);
            const pending = (await getPendingRecords()).find(
              (p) => p.idempotencyKey === item.headers?.['X-Idempotency-Key']
            );
            if (serverId && pending?.clientId) {
              idMap[pending.clientId] = serverId;
              await setSyncMeta(ID_MAP_KEY, idMap);
            }
          } catch {
            /* response had no usable body — later items simply stay held back */
          }
        }
        await removeFromOfflineQueue(item.id!);
        // The server now holds this row, so drop the local stand-in — the next
        // read will show the authoritative record instead of the pending copy.
        await removePendingByIdempotencyKey(item.headers?.['X-Idempotency-Key']);
        synced++;
      } else if (response.status === 409) {
        // CONFLICT — someone else changed the same record while this device was
        // offline. Never silently overwrite clinical data: keep BOTH versions
        // and let a human decide which one wins.
        let payload: Record<string, unknown> = {};
        try { payload = await response.clone().json(); } catch { /* no body */ }
        await addFailedMutation(
          item,
          `Conflict: this record was changed by someone else while you were offline. ` +
            `Your version was not applied. ${await safeErr(response)}`.trim(),
          {
            serverVersion: payload.serverVersion as string | undefined,
            yourVersion: payload.yourVersion as string | undefined,
            serverRecord: payload.current,
          }
        );
        await removeFromOfflineQueue(item.id!);
        await markPendingFailed(item.headers?.['X-Idempotency-Key']);
        failed++;
      } else if (response.status >= 400 && response.status < 500) {
        // Client error — permanent; dead-letter it so staff can see/retry/dismiss.
        await addFailedMutation(item, `Server rejected the change (HTTP ${response.status}). ${await safeErr(response)}`);
        await removeFromOfflineQueue(item.id!);
        await markPendingFailed(item.headers?.['X-Idempotency-Key']);
        failed++;
      } else {
        // Server error (5xx) — retry a few times, then dead-letter.
        const rc = (item.retryCount ?? 0) + 1;
        if (rc >= MAX_SYNC_RETRIES) {
          await addFailedMutation(item, `Server error (HTTP ${response.status}) after ${rc} attempts.`);
          await removeFromOfflineQueue(item.id!);
          await markPendingFailed(item.headers?.['X-Idempotency-Key']);
        } else {
          await updateOfflineQueueItem({ ...item, retryCount: rc });
        }
        failed++;
      }
    } catch {
      // Network error — still offline / transient; leave in queue for next sync
      // (never dead-letter on network failure, so we don't lose data).
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
