// ============================================================
// Optimistic concurrency control
// ------------------------------------------------------------
// Stops a change made offline from silently overwriting a change someone else
// made in the meantime. When a device queues an edit it records WHICH VERSION
// of the record it was editing (`X-Base-Version`, taken from the row's
// `updatedAt`). On replay the server compares that against the row's current
// `updatedAt`:
//
//   • same version   -> apply the edit, as normal
//   • row is newer   -> 409 with the current server record, so the change is
//                       surfaced to a human instead of clobbering theatre data
//   • no header sent -> no check at all (online edits keep their existing
//                       behaviour; nothing regresses for callers that don't
//                       participate yet)
//
// A deliberate override (`X-Overwrite-Conflict: true`) is honoured, which is
// how "keep my version" resolution works from the sync panel.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

export const BASE_VERSION_HEADER = 'x-base-version';
export const OVERWRITE_HEADER = 'x-overwrite-conflict';

/**
 * `updatedAt` is serialised to JSON with millisecond precision, but round-trips
 * through several representations. A small tolerance stops rounding from
 * being reported as a conflict.
 */
const VERSION_TOLERANCE_MS = 1000;

/** The version the client believed it was editing, or null if it didn't say. */
export function baseVersionOf(request: NextRequest): number | null {
  const raw = request.headers.get(BASE_VERSION_HEADER);
  if (!raw) return null;
  const asNumber = Number(raw);
  const ms = Number.isFinite(asNumber) && raw.trim() !== '' ? asNumber : Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/** Did the user explicitly choose to overwrite the server's copy? */
export function isOverwriteRequested(request: NextRequest): boolean {
  return (request.headers.get(OVERWRITE_HEADER) || '').toLowerCase() === 'true';
}

/**
 * Returns a 409 response when `existing` has moved on since the client last saw
 * it, or null when it is safe to proceed.
 *
 * Usage in a route, after auth and after loading the record:
 *
 *   const conflict = detectConflict(request, existingSurgery, 'surgery');
 *   if (conflict) return conflict;
 */
export function detectConflict(
  request: NextRequest,
  existing: { updatedAt?: Date | string | null } | null,
  label = 'record'
): NextResponse | null {
  if (!existing) return null;

  const base = baseVersionOf(request);
  if (base === null) return null;              // caller opted out of the check
  if (isOverwriteRequested(request)) return null;

  const currentRaw = existing.updatedAt;
  if (!currentRaw) return null;                // model has no version to compare
  const current = currentRaw instanceof Date ? currentRaw.getTime() : Date.parse(String(currentRaw));
  if (!Number.isFinite(current)) return null;

  if (current - base <= VERSION_TOLERANCE_MS) return null;

  return NextResponse.json(
    {
      error:
        `This ${label} was changed by someone else after your copy was made. ` +
        `Your change was not applied.`,
      conflict: true,
      serverVersion: new Date(current).toISOString(),
      yourVersion: new Date(base).toISOString(),
      current: existing,
    },
    { status: 409 }
  );
}
