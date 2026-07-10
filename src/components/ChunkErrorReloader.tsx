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

// Persisted in localStorage (NOT sessionStorage) so the cool-down survives page
// reloads, new tabs and app restarts — this is what makes a reload LOOP
// impossible: at most one automatic recovery reload per device in the window.
const RELOAD_KEY = '__chunkReloadAt';
// Minimum time between automatic recovery reloads. Generous so that even across
// frequent deploys the user never experiences "repeated refreshing".
const RELOAD_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

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
    const lastReloadAt = () => {
      try {
        return Number(window.localStorage.getItem(RELOAD_KEY) || '0');
      } catch {
        return 0;
      }
    };
    const withinCooldown = () => Date.now() - lastReloadAt() < RELOAD_WINDOW_MS;

    let reloading = false;
    const triggerReload = async () => {
      // Never reload while offline (the reload would just fail again), never
      // loop, and never reload more than once per cool-down window. When we're
      // still inside the cool-down, surface a gentle manual prompt instead of
      // silently refreshing — so the user is never caught in a refresh loop.
      if (reloading) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      if (withinCooldown()) {
        try {
          window.dispatchEvent(new CustomEvent('orm:update-available'));
        } catch { /* ignore */ }
        return;
      }
      reloading = true;
      try {
        window.localStorage.setItem(RELOAD_KEY, String(Date.now()));
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
              .filter((k) => /orm-(static|pages|rsc)-/i.test(k))
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
