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
const RELOAD_WINDOW_MS = 20000;

function isChunkError(message?: string | null): boolean {
  if (!message) return false;
  return (
    /ChunkLoadError/i.test(message) ||
    /Loading chunk\s+[\w-]+\s+failed/i.test(message) ||
    /Loading CSS chunk/i.test(message) ||
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

    let reloading = false;
    const triggerReload = async () => {
      if (reloading || recentlyReloaded()) return; // prevent reload loops
      reloading = true;
      try {
        window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
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
      if (isChunkError(e?.message) || isChunkError(err?.name) || isChunkError(err?.message)) {
        void triggerReload();
      }
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const r: any = e?.reason;
      const msg = (r && (r.message || r.name)) || (typeof r === 'string' ? r : '');
      if (isChunkError(msg)) void triggerReload();
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
