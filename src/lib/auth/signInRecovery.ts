'use client';

// ============================================================
// Getting a locked-out device back to a working sign-in page
// ------------------------------------------------------------
// Reported from theatre: "it opened, I saw the duty roster, but it signed me
// out and I can't sign in again."
//
// The sign-in fault itself was fixed in d1e7d51: the global fetch
// interceptor used to treat the sign-in POST as ordinary application data,
// queue it to IndexedDB when the network looked unhealthy, and answer with a
// synthetic 200. NextAuth could not parse that, so the form appeared to do
// nothing, for ever.
//
// THE FIX DOES NOT REACH THE DEVICE THAT NEEDS IT. public/sw.js deliberately
// does not call skipWaiting() on install, so a new service worker waits until
// every tab is closed. The desktop app is never closed -- staff leave it open
// across shifts -- so a handset or workstation can run weeks-old JavaScript.
// On a device still carrying the pre-fix bundle the sign-in form stays broken
// no matter how many times the hospital deploys the cure.
//
// So this runs on the SIGN-IN PAGE, which is exactly where a locked-out
// person ends up, and it does the two things that device needs:
//
//   1. Deletes any queued or failed /api/auth/ mutation. Those entries are a
//      staff password sitting in IndexedDB, and on the old code they were
//      replayed on reconnect. Nothing should ever have put one there.
//
//   2. Activates a waiting service worker and drops the app-shell caches, so
//      the page the person is about to use is built from current code.
//
// WHY CLEARING CACHE HERE IS SAFE, when it would not be elsewhere. There is
// no offline sign-in: the server holds the password hash, so an unreachable
// server is a failed sign-in however much is cached. The sign-in page has
// nothing to gain from a cached shell and everything to lose. The DATA cache
// is left alone -- that is the work people did offline, and it is not ours to
// discard to fix a login.
// ============================================================

import {
  getOfflineQueue,
  removeFromOfflineQueue,
  getFailedMutations,
  discardFailedMutation,
} from '@/lib/offlineStore';

/** Anything on the sign-in machinery. Matches what the interceptor exempts. */
function isAuthUrl(url: string): boolean {
  if (!url) return false;
  try {
    const base = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
    return new URL(url, base).pathname.startsWith('/api/auth/');
  } catch {
    return url.indexOf('/api/auth/') !== -1;
  }
}

/**
 * Remove every queued or failed sign-in attempt from this device.
 *
 * Returns how many were removed, so the caller can say something true about
 * it. Never throws: this runs on the page somebody is trying to sign in on,
 * and a storage error must not stop them trying.
 */
export async function purgeQueuedAuthMutations(): Promise<number> {
  let removed = 0;

  try {
    const queued = await getOfflineQueue();
    for (let i = 0; i < queued.length; i += 1) {
      const item = queued[i];
      if (item.id !== undefined && isAuthUrl(item.url)) {
        await removeFromOfflineQueue(item.id);
        removed += 1;
      }
    }
  } catch {
    /* storage unavailable or blocked: nothing to clean, nothing to report */
  }

  try {
    const failed = await getFailedMutations();
    for (let i = 0; i < failed.length; i += 1) {
      const item = failed[i];
      if (item.id !== undefined && isAuthUrl(item.url)) {
        await discardFailedMutation(item.id);
        removed += 1;
      }
    }
  } catch {
    /* as above */
  }

  return removed;
}

/**
 * Make sure the sign-in page is running current code.
 *
 * Asks a waiting service worker to take over immediately and drops the
 * app-shell caches. Deliberately leaves `orm-data-*` alone.
 *
 * Returns true when something was actually replaced, so the caller can
 * reload once rather than on every visit — a sign-in page that refreshes
 * itself every time is its own kind of broken.
 */
export async function refreshAppShellForSignIn(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  let changed = false;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        // Ask the server whether there is a newer worker. On a device that
        // has been open for weeks this is the first time it has been asked.
        await reg.update().catch(() => undefined);
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          changed = true;
        }
      }
    }
  } catch {
    /* ignore: a failure here just leaves the old worker in place */
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      const shells = keys.filter((k) => /orm-(static|pages|rsc)-/i.test(k));
      await Promise.all(shells.map((k) => caches.delete(k)));
      if (shells.length > 0) changed = true;
    }
  } catch {
    /* ignore */
  }

  return changed;
}
