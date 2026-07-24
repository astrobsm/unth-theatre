// Detects the synthetic response the global fetch interceptor returns when a
// mutation was queued offline (see src/lib/globalFetchInterceptor.ts). Such a
// response is a 200 with header `X-Offline-Queued: true` and body
// `{ success: true, offline: true }` — it does NOT contain the created record
// (no server id / codes / computed fields), so form success handlers must branch
// on this before reading `data.id` or navigating to `/{id}`.

export function isOfflineQueued(res: Response): boolean {
  try {
    if (res.headers?.get('X-Offline-Queued') === 'true') return true;
  } catch { /* ignore */ }
  return false;
}

// Convenience: also true when the parsed body signals an offline queue.
export function isOfflineQueuedBody(body: any): boolean {
  return !!(body && body.offline === true);
}

export const OFFLINE_SAVED_MESSAGE =
  'Saved offline. This will sync automatically when you are back online — any pharmacy/consumable codes and IDs are generated on the server at that point.';
