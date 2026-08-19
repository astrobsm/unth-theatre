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

/**
 * Why the mutation was queued: the device was offline, or the link was up and
 * the server did not answer within the deadline.
 *
 * Worth telling apart. Somebody on a working connection who is told they are
 * offline stops believing the rest of the screen — and the two situations need
 * different advice, because a timeout may mean the write ALREADY LANDED and the
 * reply is what went missing.
 */
export function offlineQueuedReason(res: Response): 'timeout' | 'offline' {
  try {
    return res.headers?.get('X-Offline-Reason') === 'timeout' ? 'timeout' : 'offline';
  } catch {
    return 'offline';
  }
}

/**
 * The sentence for a request that timed out rather than failed.
 *
 * "Do not book it again" is the whole point of it. A booking whose reply went
 * missing has usually been made — that is where the duplicated cases on the
 * list came from — and the person reading this is deciding, right now, whether
 * to press the button a second time.
 */
export const TIMED_OUT_SAVED_MESSAGE =
  'The server did not reply in time, so this has been saved and will complete automatically. '
  + 'It may already have gone through — do not enter it again. Check the list in a few minutes.';

/** The right sentence for however the mutation ended up queued. */
export function queuedMessage(res: Response): string {
  return offlineQueuedReason(res) === 'timeout' ? TIMED_OUT_SAVED_MESSAGE : OFFLINE_SAVED_MESSAGE;
}
