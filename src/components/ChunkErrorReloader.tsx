'use client';

/**
 * ChunkErrorReloader
 *
 * After a new deployment, a tab that still has the previous build in memory can
 * throw `ChunkLoadError` (or "Loading chunk N failed") when the router tries to
 * fetch a JS/CSS chunk whose hashed filename no longer exists on the server.
 *
 * This listener detects those errors and performs a single, guarded hard reload
 * so the tab picks up the fresh build. Before reloading it drops the service
 * worker's static/page caches (keeping offline API data) so the reloaded page
 * is never served a stale app shell that points at the missing chunks.
 *
 * A sessionStorage timestamp guards against reload loops.
 */

import { useEffect } from 'react';

const RELOAD_KEY = '__chunkReloadAt';
const RELOAD_COUNT_KEY = '__chunkReloadCount';
// Only auto-reload at most this many times per browser session, and never more
// than once inside the cool-down window. Prevents reload loops / "reloading on
// its own" on flaky networks.
const RELOAD_WINDOW_MS = 60000;
const MAX_RELOADS_PER_SESSION = 2;

// Definitive stale-build signatures: after a new deployment the old app shell
// references hashed chunk files that no longer exist. These ALWAYS warrant a
// one-time reload to pick up the fresh build.
function isDefiniteChunkError(message?: string | null): boolean {
  if (!message) return false;
  return (
    /ChunkLoadError/i.test(message) ||
    /Loading chunk\s+[\w-]+\s+failed/i.test(message) ||
    /Loading CSS chunk/i.test(message)
  );
}

// Softer signatures (a lazy `import()` failed to fetch). These are frequently
// just a transient network blip, so we only reload for them when online and
// under the session cap — never repeatedly.
function isSoftImportError(message?: string | null): boolean {
  if (!message) return false;
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message)
  );
}

export default function ChunkErrorReloader() {
  useEffect(() => {
    const recentlyReloaded = () => {
      try {
        const t = Number(window.sessionStorage.getItem(RELOAD_KEY) || '0');
        return Date.now() - t < RELOAD_WINDOW_MS;
      } catch {
        return false;
      }
    };

    const reloadCount = () => {
      try {
        return Number(window.sessionStorage.getItem(RELOAD_COUNT_KEY) || '0');
      } catch {
        return 0;
      }
    };

    let reloading = false;
    const triggerReload = async () => {
      // Never reload while offline (the reload would just fail again), never
      // loop, and never exceed the per-session cap.
      if (reloading || recentlyReloaded()) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      if (reloadCount() >= MAX_RELOADS_PER_SESSION) return;
      reloading = true;
      try {
        window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.sessionStorage.setItem(RELOAD_COUNT_KEY, String(reloadCount() + 1));
      } catch {
        /* ignore */
      }
      // Drop stale app-shell / chunk caches so the reload fetches fresh assets.
      // Keep the data cache (orm-data-*) so offline API reads survive.
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(
            keys
              .filter((k) => /orm-(static|pages)-/i.test(k))
              .map((k) => caches.delete(k))
          );
        }
      } catch {
        /* ignore */
      }
      window.location.reload();
    };

    const onError = (e: ErrorEvent) => {
      const err: any = e?.error;
      const msgs = [e?.message, err?.name, err?.message];
      // ONLY reload for definite stale-build chunk errors (old app shell after a
      // deploy). Soft dynamic-import failures are usually transient network /
      // CDN / WASM blips (e.g. the Kokoro TTS model loading) — reloading for
      // those caused the app to "refresh on its own", so we now ignore them.
      if (msgs.some((m) => isDefiniteChunkError(m))) {
        void triggerReload();
      } else if (msgs.some((m) => isSoftImportError(m))) {
        console.warn('[ChunkErrorReloader] Transient dynamic-import failure ignored (no reload):', e?.message);
      }
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const r: any = e?.reason;
      const msg = (r && (r.message || r.name)) || (typeof r === 'string' ? r : '');
      // Same policy: only stale-build chunk errors force a reload.
      if (isDefiniteChunkError(msg)) {
        void triggerReload();
      } else if (isSoftImportError(msg)) {
        console.warn('[ChunkErrorReloader] Transient dynamic-import rejection ignored (no reload):', msg);
      }
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
