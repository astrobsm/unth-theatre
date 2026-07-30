// ============================================================
// Offline record merging
// ------------------------------------------------------------
// When a mutation is made with no network it is queued, and the record it
// creates/changes does not exist on the server yet. Without this module the
// user submits a booking offline and it simply vanishes from every list until
// connectivity returns — which is exactly the failure mode the offline-first
// design is meant to remove.
//
// So every queued mutation also writes a PENDING RECORD, and reads are merged
// with it: created rows appear at the top of their list, edits are applied over
// the cached row, deletions disappear. Each merged row carries `_offlinePending`
// so the UI can badge it as "waiting to sync".
//
// These are pure functions over already-parsed JSON so they can be reasoned
// about and tested directly; the wiring lives in globalFetchInterceptor.
// ============================================================

export type PendingOp = 'create' | 'update' | 'delete';

export interface PendingRecord {
  /** Local identity for a created row: also the `id` the UI will see. */
  clientId: string;
  /** First path segment after /api/ — e.g. 'surgeries', 'patients'. */
  entityType: string;
  op: PendingOp;
  /** Server id for update/delete; undefined for create. */
  targetId?: string;
  url: string;
  method: string;
  body: Record<string, unknown> | null;
  createdAt: number;
  /** Ties this record to its queued mutation so both clear together. */
  idempotencyKey?: string;
  /**
   * The server refused this change (conflict / validation / exhausted retries).
   * The row stays visible — losing a nurse's work from the screen because the
   * sync failed would be worse than showing it flagged — but it is badged so
   * nobody mistakes it for saved.
   */
  failed?: boolean;
}

/** Marker added to every row that has not reached the server yet. */
export const PENDING_FLAG = '_offlinePending';
/** Marker added to rows whose sync was rejected by the server. */
export const FAILED_FLAG = '_offlineFailed';

/** Keys we are willing to treat as "the list" inside an object response. */
const LIST_KEYS = ['data', 'items', 'results', 'records', 'rows', 'list'];

/**
 * `/api/surgeries?date=x`      -> { entityType: 'surgeries' }
 * `/api/surgeries/abc123`      -> { entityType: 'surgeries', id: 'abc123' }
 * `/api/roster/departments/x`  -> { entityType: 'roster', id: 'departments/x' }
 */
export function parseApiPath(url: string, origin?: string): { entityType: string; id?: string } {
  let pathname = url;
  try {
    pathname = new URL(url, origin ?? 'http://local').pathname;
  } catch {
    pathname = url.split('?')[0];
  }
  const parts = pathname.replace(/^\/api\//, '').split('/').filter(Boolean);
  const entityType = parts[0] ?? 'unknown';
  const rest = parts.slice(1).join('/');
  return rest ? { entityType, id: rest } : { entityType };
}

/** True when `value` looks like a list of records we can merge into. */
function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return (
    Array.isArray(value) &&
    (value.length === 0 || (typeof value[0] === 'object' && value[0] !== null && !Array.isArray(value[0])))
  );
}

/**
 * Locate the array of records inside a response payload. Returns null when the
 * shape is not something we understand — in that case the payload is handed
 * back untouched rather than guessed at.
 */
function locateList(
  payload: unknown,
  entityType: string
): { get: () => Record<string, unknown>[]; set: (rows: Record<string, unknown>[]) => unknown } | null {
  if (isRecordArray(payload)) {
    let current = payload;
    return { get: () => current, set: (rows) => (current = rows) };
  }
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const obj = payload as Record<string, unknown>;
    const candidates = [entityType, ...LIST_KEYS];
    for (const key of candidates) {
      if (isRecordArray(obj[key])) {
        return {
          get: () => obj[key] as Record<string, unknown>[],
          // Returns a COPY rather than mutating: callers rely on reference
          // identity to tell "nothing changed" from "merged", and an in-place
          // mutation would look unchanged and get discarded.
          set: (rows) => ({ ...obj, [key]: rows }),
        };
      }
    }
  }
  return null;
}

function idOf(row: Record<string, unknown>): string | undefined {
  const id = row.id ?? row._id ?? row.uuid;
  return id == null ? undefined : String(id);
}

/** Build the row the UI should see for a pending create. */
export function materialiseCreate(pending: PendingRecord): Record<string, unknown> {
  return {
    ...(pending.body ?? {}),
    id: pending.clientId,
    [PENDING_FLAG]: 'create' as PendingOp,
    ...(pending.failed ? { [FAILED_FLAG]: true } : {}),
    createdAt: (pending.body?.createdAt as string) ?? new Date(pending.createdAt).toISOString(),
  };
}

/**
 * Merge every pending record for this entity into a LIST payload.
 * Creates are prepended (newest first), updates applied in place, deletes removed.
 */
export function mergePendingIntoList(
  payload: unknown,
  pending: PendingRecord[],
  entityType: string
): unknown {
  if (!pending.length) return payload;
  const slot = locateList(payload, entityType);
  if (!slot) return payload;

  let rows = [...slot.get()];

  const deletes = new Set(
    pending.filter((p) => p.op === 'delete' && p.targetId).map((p) => p.targetId as string)
  );
  if (deletes.size) rows = rows.filter((r) => !deletes.has(idOf(r) ?? ''));

  for (const p of pending) {
    if (p.op !== 'update' || !p.targetId) continue;
    rows = rows.map((r) =>
      idOf(r) === p.targetId
        ? {
            ...r,
            ...(p.body ?? {}),
            [PENDING_FLAG]: 'update' as PendingOp,
            ...(p.failed ? { [FAILED_FLAG]: true } : {}),
          }
        : r
    );
  }

  const existing = new Set(rows.map((r) => idOf(r)));
  const creates = pending
    .filter((p) => p.op === 'create' && !existing.has(p.clientId))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(materialiseCreate);

  return slot.set([...creates, ...rows]);
}

/**
 * Merge pending state into a SINGLE-record payload (a detail page).
 * Returns null when the requested id is a pending create that we hold locally
 * but the caller has no cached payload for — the caller then serves the
 * materialised record on its own.
 */
export function mergePendingIntoRecord(
  payload: unknown,
  pending: PendingRecord[],
  id: string
): unknown {
  const update = pending.find((p) => p.op === 'update' && p.targetId === id);
  if (!update || !payload || typeof payload !== 'object') return payload;

  const obj = payload as Record<string, unknown>;
  // Some endpoints wrap the record: { surgery: {...} } / { data: {...} }.
  for (const key of LIST_KEYS) {
    const inner = obj[key];
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      return {
        ...obj,
        [key]: { ...(inner as Record<string, unknown>), ...(update.body ?? {}), [PENDING_FLAG]: 'update' },
      };
    }
  }
  return { ...obj, ...(update.body ?? {}), [PENDING_FLAG]: 'update' };
}

// ============================================================
// Client-id -> server-id remapping
// ------------------------------------------------------------
// A record created offline gets a local id (`offline-…`). Anything created
// AFTER it, in the same offline stretch, references that local id — register a
// patient, then book their surgery. When the queue drains, the patient is
// created server-side with a REAL id, and the surgery must be rewritten to use
// it. Without this the surgery replays with a dead reference and the server
// rejects it ("Patient not found"), losing the booking.
// ============================================================

/** True for an id minted on this device rather than by the server. */
export function isClientId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('offline-');
}

/**
 * Pull the server's id out of a create response. Handles a bare record, and
 * the common wrappers ({data: …}, {surgery: …}, {patient: …}).
 */
export function extractServerId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;

  const direct = obj.id ?? obj._id ?? obj.uuid;
  if (typeof direct === 'string' && !isClientId(direct)) return direct;
  if (typeof direct === 'number') return String(direct);

  for (const key of Object.keys(obj)) {
    const inner = obj[key];
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      const nested = (inner as Record<string, unknown>).id;
      if (typeof nested === 'string' && !isClientId(nested)) return nested;
      if (typeof nested === 'number') return String(nested);
    }
  }
  return null;
}

/**
 * Deep-replace every local id with its server id. Structure is preserved; only
 * string values that are known local ids change.
 */
export function remapClientIds<T>(value: T, map: Record<string, string>): T {
  if (typeof value === 'string') {
    return (map[value] ?? value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => remapClientIds(v, map)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = remapClientIds(v, map);
    }
    return out as unknown as T;
  }
  return value;
}

/** Rewrite local ids that appear as path segments, e.g. /api/patients/offline-1. */
export function remapUrl(url: string, map: Record<string, string>): string {
  if (!url.includes('offline-')) return url;
  return url
    .split('/')
    .map((seg) => {
      const [base, ...rest] = seg.split('?');
      const mapped = map[base];
      return mapped ? [mapped, ...rest].join('?') : seg;
    })
    .join('/');
}

/**
 * Does this queued mutation still point at a local id we cannot resolve? Such
 * an item must NOT be sent — the server would reject it and the work would be
 * dead-lettered even though its parent may simply not have synced yet.
 */
export function hasUnresolvedClientId(url: string, body: unknown, map: Record<string, string>): boolean {
  const unresolved = (v: string) => isClientId(v) && !map[v];
  if (url.split(/[/?=&]/).some(unresolved)) return true;

  let found = false;
  const walk = (v: unknown) => {
    if (found) return;
    if (typeof v === 'string') { if (unresolved(v)) found = true; return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(body);
  return found;
}

/**
 * The body we hand back for a mutation that was queued rather than sent, so
 * callers doing `const created = await res.json()` still receive a usable
 * record (with an id they can navigate to) instead of a bare success flag.
 */
export function offlineMutationEcho(pending: PendingRecord): Record<string, unknown> {
  const base = pending.op === 'create' ? materialiseCreate(pending) : {
    ...(pending.body ?? {}),
    id: pending.targetId,
    [PENDING_FLAG]: pending.op,
  };
  return {
    ...base,
    success: true,
    offline: true,
    queued: true,
    message: 'Saved on this device. It will sync automatically when you are back online.',
  };
}
