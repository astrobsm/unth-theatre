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

// ============================================================
// Recognising a pending create that has already landed
// ------------------------------------------------------------
// A create queued offline is held under a LOCAL id (`offline-…`). When it
// reaches the server the row comes back under a real uuid — a different id, by
// definition. So "is this pending create already in the list?" cannot be
// answered by comparing ids, and for a long time it was: the merge asked
// whether any row carried the CLIENT id, which the server never sends.
//
// The consequence was not subtle. A queued registration that synced stayed in
// the list forever ALONGSIDE the real record, so the patient appeared twice;
// and the optimistic copy still carried its `offline-…` id, so a surgeon who
// picked that one out of the booking dropdown sent an id the server had never
// seen and was told "Patient not found" for a patient plainly on the screen.
// Two patients registered on 15 September were duplicated this way, and neither
// could be booked.
//
// The cleanup on the queue side (removePendingByIdempotencyKey after a
// successful replay) remains the primary mechanism and still runs. This is the
// backstop for every path that does not reach it — a first attempt that timed
// out on this device but succeeded on the server, a queue drained by the
// service worker, a mutation dead-lettered after the row had in fact been
// created. Those are precisely the cases where the duplicate is permanent, so
// the backstop has to work from evidence the list itself carries rather than
// from bookkeeping that has already been missed once.
//
// A NATURAL KEY, NOT A FUZZY MATCH. Two different patients must never collapse
// into one row, so this compares the identifier the hospital itself uses and
// nothing looser. An entity with no natural key defined returns null, and null
// never supersedes anything.
// ============================================================

/**
 * Case- and punctuation-insensitive.
 *
 * "PT-529930", "PT529930" and "pt 529930" are one folder number written by
 * three different people — and the patients table already holds all three
 * spellings, so this is observed practice rather than a hypothetical.
 */
const normaliseKey = (v: unknown): string =>
  String(v ?? '').trim().toUpperCase().replace(/[\s._/-]+/g, '');

const firstFilled = (row: Record<string, unknown>, keys: string[]): string => {
  for (const k of keys) {
    const v = normaliseKey(row[k]);
    if (v) return v;
  }
  return '';
};

/**
 * What identifies this row to the hospital, rather than to the database.
 *
 * Returns null when the entity has no key we are confident about, or when the
 * row does not carry enough to build one. Null NEVER supersedes: an unknown
 * shape leaves the pending row on screen, which is the safe direction — a
 * duplicate is visible and irritating, a silently vanished booking is neither.
 */
export function naturalKeyOf(
  entityType: string,
  row: Record<string, unknown>
): string | null {
  if (entityType === 'patients') {
    // The folder number is the hospital's own identifier and is the thing a
    // duplicate registration repeats. ptNumber is the fallback the rest of the
    // app already uses where no folder number has been issued.
    const identifier = firstFilled(row, ['folderNumber', 'ptNumber']);
    if (identifier) return `patients:${identifier}`;
    // With no identifier at all, name AND age together — a name alone is not
    // unique in a hospital this size, and two people called Okeke Bridget must
    // not be merged into one.
    const name = normaliseKey(row.name);
    const age = normaliseKey(row.age);
    return name && age ? `patients:${name}:${age}` : null;
  }

  if (entityType === 'surgeries') {
    // One patient, one day, one procedure. The procedure is deliberately part
    // of it: a patient genuinely returning to theatre twice in a day is a real
    // case this application already supports, and those two must stay separate.
    const patientId = normaliseKey(row.patientId);
    const date = String(row.scheduledDate ?? '').slice(0, 10);
    const procedure = normaliseKey(row.procedureName);
    return patientId && date && procedure
      ? `surgeries:${patientId}:${date}:${procedure}`
      : null;
  }

  return null;
}

/**
 * The clientIds of pending creates the server list already contains.
 *
 * Exported so the caller can DELETE them locally as well as hide them: a
 * pending record nobody clears is merged into every later read, and the point
 * is for this to heal itself rather than to paper over the row on each render.
 */
export function supersededCreates(
  rows: Record<string, unknown>[],
  pending: PendingRecord[],
  entityType: string
): Set<string> {
  const superseded = new Set<string>();

  const landed = new Set<string>();
  for (const r of rows) {
    const key = naturalKeyOf(entityType, r);
    if (key) landed.add(key);
  }
  if (!landed.size) return superseded;

  for (const p of pending) {
    if (p.op !== 'create' || !p.body) continue;
    const key = naturalKeyOf(entityType, p.body);
    if (key && landed.has(key)) superseded.add(p.clientId);
  }
  return superseded;
}

/**
 * The same question asked of a whole response payload rather than of rows.
 *
 * Saves the caller having to know how a list is buried inside a response, which
 * is knowledge this module already has and should keep.
 */
export function supersededInPayload(
  payload: unknown,
  pending: PendingRecord[],
  entityType: string
): Set<string> {
  const slot = locateList(payload, entityType);
  if (!slot) return new Set();
  return supersededCreates(slot.get(), pending, entityType);
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

  // Two ways a pending create can already be in this list, and both must be
  // checked. By id, for a server that echoes the client id back; and by natural
  // key, for the ordinary case where it came back under a real uuid — which is
  // what made the row duplicate forever.
  const existing = new Set(rows.map((r) => idOf(r)));
  const landed = supersededCreates(rows, pending, entityType);
  const creates = pending
    .filter((p) => p.op === 'create' && !existing.has(p.clientId) && !landed.has(p.clientId))
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
 * Every local id in this mutation that we cannot resolve to a server id.
 *
 * The ids themselves, not just a yes/no, because the answer decides what the
 * person is told. A booking waiting behind a patient registration that is
 * still in the queue is a one-minute wait. One waiting behind a registration
 * the server REFUSED is waiting for ever, and the only way to tell those
 * apart is to know which record it is waiting for and go and look.
 */
export function collectUnresolvedClientIds(
  url: string,
  body: unknown,
  map: Record<string, string>,
): string[] {
  const out: string[] = [];
  const note = (v: string) => {
    if (isClientId(v) && !map[v] && out.indexOf(v) === -1) out.push(v);
  };

  url.split(/[/?=&]/).forEach(note);

  const walk = (v: unknown) => {
    if (typeof v === 'string') { note(v); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(body);

  return out;
}

/**
 * What is actually happening to the record this mutation is waiting for.
 *
 *   in-flight — its create is still queued and has not been refused. Waiting
 *               is correct and it really will go through shortly.
 *   refused   — the server rejected its create. It will NEVER resolve. The
 *               row is still on screen, badged, and still selectable, so the
 *               person picks it again and waits again for something that is
 *               never coming.
 *   unknown   — this device has no pending create for that id at all. Either
 *               the create landed and the reply was unusable, so the mapping
 *               was never learned, or local storage was cleared. Either way
 *               nothing on this device will ever resolve it.
 *
 * ONLY THE FIRST IS WORTH WAITING FOR. The other two are the reason a surgeon
 * can press Submit, be told in green that the case is saved and will go
 * through "usually within a minute", and find no case on the list an hour
 * later — having been told not to enter it again.
 */
export type UnresolvedParentState = 'in-flight' | 'refused' | 'unknown';

export function classifyUnresolvedParent(
  clientId: string,
  pending: PendingRecord[],
): UnresolvedParentState {
  const record = pending.find((p) => p.op === 'create' && p.clientId === clientId);
  if (!record) return 'unknown';
  return record.failed ? 'refused' : 'in-flight';
}

/**
 * Does this queued mutation still point at a local id we cannot resolve? Such
 * an item must NOT be sent — the server would reject it and the work would be
 * dead-lettered even though its parent may simply not have synced yet.
 */
export function hasUnresolvedClientId(url: string, body: unknown, map: Record<string, string>): boolean {
  return collectUnresolvedClientIds(url, body, map).length > 0;
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
