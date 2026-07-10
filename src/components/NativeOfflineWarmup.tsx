'use client';

/**
 * NativeOfflineWarmup
 * -------------------
 * Makes the installed native app genuinely OFFLINE-FIRST: on the first launch
 * (while online) it automatically downloads the ENTIRE app shell — every module
 * page's HTML + JS chunks + RSC — plus all cacheable API data into the device,
 * so afterwards the whole UI opens instantly and works with no network.
 *
 * This is the practical equivalent of "bundling the web app on the phone": the
 * front-end lives on the device; only live data is fetched from the server (and
 * that is cached + queued when offline). It runs ONLY inside the native app
 * (Capacitor) — on the web it is a no-op, since browsers cache on demand.
 */

import { useEffect, useRef } from 'react';
import { useOfflineContext } from '@/components/OfflineProvider';

// Bump the suffix to force every installed app to re-warm after a major release.
const WARMED_KEY = 'orm.native.offlineWarmed.v1';

export default function NativeOfflineWarmup() {
  const { downloadAppShellNow } = useOfflineContext();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        // Native app only — the browser/PWA caches on demand already.
        if (!Capacitor?.isNativePlatform?.()) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        // Only auto-download the full shell once per install (heavy, one-time).
        try {
          if (window.localStorage.getItem(WARMED_KEY)) return;
        } catch { /* storage blocked — proceed once */ }

        // Defer so app startup stays snappy, then cache everything for offline.
        setTimeout(async () => {
          try {
            await downloadAppShellNow();
            window.localStorage.setItem(WARMED_KEY, String(Date.now()));
          } catch {
            // Failed (e.g. flaky network) — leave the flag unset so the next
            // launch tries again until the device is fully offline-ready.
          }
        }, 5000);
      } catch {
        /* web / plugin unavailable — ignore */
      }
    })();
  }, [downloadAppShellNow]);

  return null;
}
