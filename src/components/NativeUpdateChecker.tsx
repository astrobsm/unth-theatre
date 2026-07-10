'use client';

/**
 * NativeUpdateChecker
 * -------------------
 * The installed Android app loads the live web app, so its UI/data always
 * auto-update. Only the native shell (APK) needs a manual reinstall when it
 * changes. This component checks — on launch — whether a newer APK has been
 * released and, if so, offers a one-tap download so users stay current.
 *
 * Runs ONLY inside the native app (Capacitor). On web/desktop it is a no-op
 * (the desktop app self-updates via electron-updater; the PWA updates via its
 * service worker).
 */

import { useEffect, useRef } from 'react';

const DISMISS_KEY = 'orm.native.updateDismissedFor';

// Compare dotted numeric versions (e.g. "1.0.4" > "1.0.3"). Non-numeric parts
// are treated as 0. Returns true when `latest` is strictly newer than `current`.
function isNewer(latest: string, current: string): boolean {
  const a = String(latest).split('.').map((n) => parseInt(n, 10) || 0);
  const b = String(current).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

export default function NativeUpdateChecker() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor?.isNativePlatform?.()) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

        const { App } = await import('@capacitor/app');
        const info = await App.getInfo();
        const current = info?.version || '0.0.0';

        const res = await fetch('/api/app-version', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const latest: string | undefined = data?.android?.version;
        const url: string | undefined = data?.android?.url;
        if (!latest || !url) return;
        if (!isNewer(latest, current)) return;

        // Don't nag: only prompt once per newer version per install.
        try {
          if (window.localStorage.getItem(DISMISS_KEY) === latest) return;
        } catch {
          /* storage blocked — prompt anyway */
        }

        const accept = window.confirm(
          `A new version of ORM - UNTH (${latest}) is available.\n\n` +
            `You have ${current}. Download and install the update now?`
        );
        try {
          window.localStorage.setItem(DISMISS_KEY, latest);
        } catch {
          /* ignore */
        }
        if (accept) {
          // Open the APK download in the system browser to install.
          window.open(url, '_blank');
        }
      } catch {
        /* plugin unavailable / web — ignore */
      }
    })();
  }, []);

  return null;
}
