// ============================================================
// Global Fetch Interceptor
// Monkey-patches window.fetch to automatically provide
// offline fallback for ALL API calls without modifying pages
// ============================================================

import {
  setCachedData,
  getCachedData,
  addToOfflineQueue,
  addPendingRecord,
  getPendingRecords,
} from './offlineStore';
import {
  parseApiPath,
  mergePendingIntoList,
  mergePendingIntoRecord,
  materialiseCreate,
  offlineMutationEcho,
  type PendingRecord,
  type PendingOp,
} from './offlineMerge';

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

  // Whenever a queued mutation reaches the server its local stand-in is
  // removed; drop the overlay snapshot so reads stop merging it.
  window.addEventListener('orm:pending-changed', invalidatePendingSnapshot);

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
// GET handler — LOCAL FIRST
// ------------------------------------------------------------
// Order of preference:
//   1. A locally cached copy newer than FRESH_WINDOW_MS  -> returned instantly,
//      with a silent background revalidation. Navigating back to a page you
//      just looked at never waits on the network.
//   2. An older cached copy -> raced against the network for SLOW_NETWORK_MS,
//      so a degraded link (2G, packet loss) shows real data in ~1s instead of
//      hanging. The network request is NOT aborted; it keeps running and
//      refreshes the cache for next time.
//   3. Nothing cached -> the network, as before, with the cache as fallback.
// ============================================================

/** How long a cached response may be served without touching the network. */
const FRESH_WINDOW_MS = 60 * 1000;
/** How long we wait for the network when we already hold an older copy. */
const SLOW_NETWORK_MS = 1200;
/** How long cached API responses stay usable as an offline fallback. */
const OFFLINE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Endpoints that must never be answered from cache while the device is online:
 * live status boards, auth, deploy-version polling and anything whose whole
 * purpose is to be current. They still fall back to cache when offline.
 */
const ALWAYS_LIVE = [
  '/api/auth/',
  '/api/version',
  '/api/app-version',
  '/api/emergency-display',
  '/api/emergency-alerts',
  // The list of booked emergencies. Left out of this list, it was served from
  // the 60-second fresh-window cache: a clinician booked an emergency, opened
  // the board, did not see it, and booked it again — which is exactly what
  // happened in production (two identical bookings fourteen minutes apart).
  // An emergency board that can be a minute stale is not a board.
  '/api/emergency-booking',
  '/api/emergency-team-availability',
  '/api/radio',
  '/api/notifications',
  '/api/staff/availability',
  '/api/power-status',
  '/api/live',
  // Returns an .xlsx, not JSON. writeThrough already declines to cache it, but
  // marking it live stops the read path treating it as a cacheable GET at all —
  // there is no sensible offline answer to "produce a spreadsheet", and the
  // reports page surfaces the failure plainly.
  '/api/imprest/reports/export',
  // Administrative CATALOGUES, whose contents change when the app is deployed
  // rather than when somebody edits data. A week-old copy of "which duties
  // exist" hides newly added offices from the very screen that assigns them —
  // which is exactly what happened when the Chief Accountant and Chief Medical
  // Director duties were added and admins kept being served the old list.
  // These are desk tasks performed online; an error is better than a stale
  // catalogue that silently cannot do the thing it was opened to do.
  '/api/imprest/duties',
  '/api/imprest/reference',
  // Who has said they are coming, right now. A cached copy of this board is
  // actively misleading: it would show an anaesthetist as present minutes
  // after they marked themselves unavailable, and the coordinator would find
  // out from the empty theatre instead of from the screen.
  '/api/theatre-ops/check-in',
  // What has been recorded so far, on a screen people tap repeatedly during a
  // case. A cached copy would offer a milestone already logged and hide one
  // just entered by a colleague in the same room.
  '/api/theatre-ops/milestones',
  // A response clock served from cache is a stopped clock. This screen exists
  // to say how long a department has been silent; a stale copy would say a
  // shorter time than the truth, which is the one direction it must never err.
  '/api/theatre-ops/emergency-response',
  // The procedure catalogue GROWS as surgeons add to it. A cached copy would
  // not show the entry a colleague added an hour ago, so the next surgeon
  // types it again — and the duplicate-prevention that makes "Other" safe
  // only works if everybody is looking at the same list.
  '/api/procedures',
];

function isAlwaysLive(pathname: string): boolean {
  return ALWAYS_LIVE.some((p) => pathname.startsWith(p));
}

function pathOf(url: string): string {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url;
  }
}

// ------------------------------------------------------------
// Pending-record overlay
// ------------------------------------------------------------
// Reading IndexedDB on every single GET would tax the fast path, so the
// pending set is snapshotted in memory. It only changes when a mutation is
// queued or the queue drains, and both of those invalidate the snapshot.
let pendingSnapshot: PendingRecord[] | null = null;
let pendingSnapshotAt = 0;
const PENDING_SNAPSHOT_TTL_MS = 2000;

export function invalidatePendingSnapshot(): void {
  pendingSnapshot = null;
}

async function pendingRecords(): Promise<PendingRecord[]> {
  if (pendingSnapshot && Date.now() - pendingSnapshotAt < PENDING_SNAPSHOT_TTL_MS) {
    return pendingSnapshot;
  }
  try {
    pendingSnapshot = await getPendingRecords();
    pendingSnapshotAt = Date.now();
  } catch {
    pendingSnapshot = [];
    pendingSnapshotAt = Date.now();
  }
  return pendingSnapshot;
}

/**
 * Fold anything this device created/changed offline into a response, so a
 * queued booking appears in the list immediately instead of after the next
 * sync. Returns the original response untouched when there is nothing pending
 * for that entity — the overwhelmingly common case.
 */
async function applyPending(response: Response, url: string): Promise<Response> {
  try {
    if (!response.ok) return response;
    if (!(response.headers.get('content-type') || '').includes('json')) return response;

    const { entityType, id } = parseApiPath(url, window.location.origin);
    const relevant = (await pendingRecords()).filter((p) => p.entityType === entityType);
    if (!relevant.length) return response;

    const data = await response.clone().json();
    // Choose by PAYLOAD SHAPE, not by URL shape. `/api/roster/departments/x`
    // has path segments after the entity but returns a list, and a list merge
    // is what it needs. mergePendingIntoList hands the payload straight back
    // when it finds no array, so we then try the single-record path.
    let merged = mergePendingIntoList(data, relevant, entityType);
    if (merged === data && id) merged = mergePendingIntoRecord(data, relevant, id);
    if (merged === data) return response;

    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'application/json');
    headers.set('X-Offline-Pending-Merged', 'true');
    return new Response(JSON.stringify(merged), { status: 200, headers });
  } catch {
    return response;
  }
}

/**
 * The version of the record this device is about to edit, taken from whatever
 * copy it last saw (detail cache first, then the list it appeared in). Sent as
 * `X-Base-Version` so the server can refuse to overwrite someone else's later
 * change instead of silently clobbering it.
 *
 * Deliberately only used for mutations QUEUED OFFLINE. Attaching it to online
 * edits would turn a merely-stale local cache into a spurious conflict for an
 * edit the user is making right now, with the server reachable anyway.
 */
async function resolveBaseVersion(url: string): Promise<string | null> {
  try {
    const { entityType, id } = parseApiPath(url, window.location.origin);
    if (!id) return null;

    const readVersion = (row: unknown): string | null => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const v = r.updatedAt ?? r.updated_at;
      return typeof v === 'string' || typeof v === 'number' ? String(v) : null;
    };

    // The detail endpoint's cached copy is the most precise source.
    const detail = await getCachedData(`api-cache:/api/${entityType}/${id}`);
    if (detail) {
      const d = detail.data as Record<string, unknown>;
      const direct = readVersion(d) ?? readVersion(d?.data);
      if (direct) return direct;
    }

    // Otherwise find the row inside the cached list.
    const list = await getCachedData(`api-cache:/api/${entityType}`);
    if (list) {
      const payload = list.data as unknown;
      const rows: unknown[] = Array.isArray(payload)
        ? payload
        : ((payload as Record<string, unknown>)?.[entityType] as unknown[]) ??
          ((payload as Record<string, unknown>)?.data as unknown[]) ??
          [];
      const match = (rows || []).find(
        (r) => r && typeof r === 'object' && String((r as Record<string, unknown>).id) === id
      );
      if (match) return readVersion(match);
    }
  } catch {
    /* no version available — the server simply skips the check */
  }
  return null;
}

/**
 * A detail request for a record that only exists on this device
 * (`/api/surgeries/offline-…`). There is nothing on the server to ask for, so
 * serve the local copy instead of letting the page 404.
 */
async function servePendingRecord(url: string): Promise<Response | null> {
  const { id } = parseApiPath(url, window.location.origin);
  if (!id || !id.startsWith('offline-')) return null;
  const match = (await pendingRecords()).find((p) => p.clientId === id);
  if (!match) return null;
  return new Response(JSON.stringify(materialiseCreate(match)), {
    status: 200,
    statusText: 'OK (Pending Local Record)',
    headers: {
      'Content-Type': 'application/json',
      'X-Offline-Cache': 'true',
      'X-Offline-Pending-Record': 'true',
    },
  });
}

/** Build the Response we hand back for locally-held data. */
function cachedResponse(data: unknown, opts: { stale: boolean; offline: boolean }): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    statusText: opts.offline ? 'OK (Offline Cache)' : 'OK (Local Cache)',
    headers: {
      'Content-Type': 'application/json',
      'X-Offline-Cache': 'true',
      'X-Cache-Stale': opts.stale ? 'true' : 'false',
      ...(opts.offline ? { 'X-Offline': 'true' } : {}),
    },
  });
}

/**
 * Mirror a successful JSON GET into IndexedDB. Deliberately not awaited by the
 * caller: parsing happens after the response has already been handed to the
 * page, so this never adds latency to the request the user is waiting on.
 */
function writeThrough(cacheKey: string, response: Response): void {
  const type = response.headers.get('content-type') || '';
  if (!type.includes('json')) return;
  response
    .clone()
    .json()
    .then((data) => setCachedData(cacheKey, data, OFFLINE_CACHE_TTL_MS))
    .catch(() => {
      /* unparseable or storage full — cache is best-effort */
    });
}

async function handleGetFetch(
  url: string,
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  // A record that exists only on this device is served from local state; there
  // is nothing on the server to ask for.
  const local = await servePendingRecord(url);
  if (local) return local;

  const response = await readThrough(url, input, init);
  return applyPending(response, url);
}

async function readThrough(
  url: string,
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const cacheKey = urlToCacheKey(url);
  const live = isAlwaysLive(pathOf(url));

  // Requests that opt out of caching (Range, streaming, explicit no-store) go
  // straight to the network untouched.
  if (init?.cache === 'no-store' || init?.signal) {
    return networkWithCacheFallback(url, input, init, cacheKey);
  }

  let cached: Awaited<ReturnType<typeof getCachedData>> = null;
  try {
    cached = await getCachedData(cacheKey);
  } catch {
    cached = null;
  }

  const age = cached ? Date.now() - cached.cachedAt : Infinity;

  // 1) Fresh local copy — serve now, refresh quietly behind the user's back.
  if (cached && !live && age < FRESH_WINDOW_MS) {
    void originalFetch(input, init)
      .then((res) => { if (res.ok) writeThrough(cacheKey, res); })
      .catch(() => { /* offline — the copy we just served is still valid */ });
    return cachedResponse(cached.data, { stale: false, offline: false });
  }

  // 2) Older local copy — race it against a slow network.
  if (cached) {
    const networkPromise = originalFetch(input, init).then((res) => {
      if (res.ok) writeThrough(cacheKey, res);
      return res;
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const fallback = new Promise<Response>((resolve) => {
      timer = setTimeout(
        () => resolve(cachedResponse(cached!.data, { stale: true, offline: false })),
        SLOW_NETWORK_MS
      );
    });

    try {
      // The rejection is handled inside the race: once the timeout has won, an
      // outer catch can no longer observe it and it would surface as an
      // unhandled rejection.
      return await Promise.race([
        networkPromise.catch(() =>
          cachedResponse(cached!.data, { stale: cached!.isStale, offline: true })
        ),
        fallback,
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // 3) Never seen this endpoint before — nothing to render from, so wait.
  return networkWithCacheFallback(url, input, init, cacheKey);
}

/**
 * Last resort for a detail request with no cached copy of its own: find the
 * record inside the cached LIST it appeared in. Opening a patient offline that
 * you only ever saw in a list then shows the record instead of an error.
 *
 * The row may carry fewer fields than the detail endpoint returns (nested
 * relations are usually list-omitted), so the response is marked partial.
 */
async function findInCachedList(url: string): Promise<Record<string, unknown> | null> {
  try {
    const { entityType, id } = parseApiPath(url, window.location.origin);
    if (!id || id.includes('/')) return null;

    const list = await getCachedData(`api-cache:/api/${entityType}`);
    if (!list) return null;

    const payload = list.data as unknown;
    const rows: unknown[] = Array.isArray(payload)
      ? payload
      : ((payload as Record<string, unknown>)?.[entityType] as unknown[]) ??
        ((payload as Record<string, unknown>)?.data as unknown[]) ??
        ((payload as Record<string, unknown>)?.items as unknown[]) ??
        [];

    const match = (rows || []).find(
      (r) => r && typeof r === 'object' && String((r as Record<string, unknown>).id) === id
    );
    return (match as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

async function networkWithCacheFallback(
  url: string,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  cacheKey: string
): Promise<Response> {
  try {
    const response = await originalFetch(input, init);
    if (response.ok) writeThrough(cacheKey, response);
    return response;
  } catch (networkError) {
    const cached = await getCachedData(cacheKey).catch(() => null);
    if (cached) {
      return cachedResponse(cached.data, { stale: cached.isStale, offline: true });
    }

    // Nothing cached for this exact URL — fall back to the row in its list.
    const fromList = await findInCachedList(url);
    if (fromList) {
      return new Response(JSON.stringify(fromList), {
        status: 200,
        statusText: 'OK (Offline, from cached list)',
        headers: {
          'Content-Type': 'application/json',
          'X-Offline-Cache': 'true',
          'X-Offline': 'true',
          'X-Offline-Partial': 'true',
        },
      });
    }
    // Nothing cached and no network — let the caller handle it, but tell the
    // app so the global "Working offline" indicator can explain the gap.
    try {
      window.dispatchEvent(
        new CustomEvent('orm:offline-read-miss', { detail: { url, at: Date.now() } })
      );
    } catch {
      /* CustomEvent unsupported */
    }
    throw networkError;
  }
}

// ============================================================
// Mutation handler — queue in IndexedDB when offline
// ============================================================
function headersToObject(h?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  if (h instanceof Headers) h.forEach((v, k) => { out[k] = v; });
  else if (Array.isArray(h)) h.forEach(([k, v]) => { out[k] = v; });
  else Object.assign(out, h as Record<string, string>);
  return out;
}
function genIdempotencyKey(): string {
  try {
    const c: any = typeof crypto !== 'undefined' ? crypto : null;
    if (c?.randomUUID) return c.randomUUID();
  } catch { /* ignore */ }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function handleMutationFetch(
  url: string,
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  // A stable idempotency key attached to the FIRST attempt AND every offline
  // replay, so a mutation that reached the server but lost its response (or is
  // replayed on reconnect) is de-duplicated server-side.
  const idemKey = genIdempotencyKey();
  const canInject = typeof input === 'string' || input instanceof URL;
  const firstInit: RequestInit | undefined = canInject
    ? { ...init, headers: { ...headersToObject(init?.headers), 'X-Idempotency-Key': idemKey } }
    : init;
  try {
    const response = await originalFetch(input, firstInit);
    return response;
  } catch (networkError) {
    // Offline — queue the mutation
    const method = (init?.method ?? 'POST').toUpperCase();
    let body: unknown = null;

    try {
      if (init?.body) {
        body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
      }
    } catch {
      body = init?.body;
    }

    // Carry the SAME idempotency key on every replay.
    const headers: Record<string, string> = { ...headersToObject(init?.headers), 'X-Idempotency-Key': idemKey };

    const { entityType, id: targetId } = parseApiPath(url, window.location.origin);

    // Stamp the change with the record version this device was looking at, so
    // the server can tell "nobody else touched it" from "this would overwrite
    // someone's later edit" when the queue is replayed, possibly hours later.
    if (method !== 'POST') {
      const baseVersion = await resolveBaseVersion(url);
      if (baseVersion) headers['X-Base-Version'] = baseVersion;
    }

    await addToOfflineQueue({
      url,
      method,
      headers,
      body,
      description: `${method} ${url}`,
      entityType,
    });

    // Record what this mutation DOES to the data, not just that it happened, so
    // reads can show the row immediately instead of the user's work vanishing
    // until connectivity returns.
    // Classify by METHOD, not by URL shape: POST to a nested collection
    // (/api/roster/departments/anaesthetists) still creates a row, even though
    // the path has segments after the entity.
    const op: PendingOp =
      method === 'DELETE' ? 'delete' : method === 'POST' ? 'create' : 'update';
    const pending: PendingRecord = {
      clientId: op === 'create' ? `offline-${idemKey}` : `offline-${op}-${targetId}-${idemKey}`,
      entityType,
      op,
      targetId,
      url,
      method,
      body: body && typeof body === 'object' ? (body as Record<string, unknown>) : null,
      createdAt: Date.now(),
      idempotencyKey: idemKey,
    };
    await addPendingRecord(pending);
    invalidatePendingSnapshot();

    console.log(`[FetchInterceptor] Queued offline mutation: ${method} ${url}`);

    // Register Background Sync so the queue drains automatically when the
    // network returns — even if the tab is closed — and tell the UI right away.
    await requestBackgroundSync();
    notifyQueued(entityType);

    // Echo back a usable record (with an id the caller can navigate to) rather
    // than a bare success flag, so post-submit redirects and optimistic UI
    // behave the same offline as online.
    return new Response(JSON.stringify(offlineMutationEcho(pending)), {
      status: 200,
      statusText: 'OK (Queued Offline)',
      headers: {
        'Content-Type': 'application/json',
        'X-Offline-Queued': 'true',
        'X-Offline-Record-Id': pending.clientId,
      },
    });
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
      let session: { user?: unknown } | null = null;
      try {
        session = await response.clone().json();
      } catch {
        session = null;
      }

      if (session?.user) {
        await setCachedData('session', session, 7 * 24 * 60 * 60 * 1000); // 7 days
        return response;
      }

      // A 200 with no user is NOT proof of being signed out. Offline, it is what
      // the service worker returns when it has nothing cached ({user: null}) —
      // and because that is a *successful* response, the catch below never runs,
      // so the session stored by an offline sign-in was ignored and the user was
      // bounced to the login screen. Consult the local session instead.
      //
      // Only while offline: online, an empty session genuinely means signed out,
      // and a dead session must never be resurrected.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const cached = await getCachedData<{ user?: unknown }>('session');
        if (cached?.data?.user) {
          return new Response(JSON.stringify(cached.data), {
            status: 200,
            statusText: 'OK (Offline Session)',
            headers: { 'Content-Type': 'application/json', 'X-Offline-Cache': 'true' },
          });
        }
      }
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
