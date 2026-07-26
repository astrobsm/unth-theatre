'use client';

/**
 * AppUpdateChecker
 * ----------------
 * Keeps the installed apps (Android/Capacitor, desktop/Electron and the PWA) up
 * to date as fixes and improvements are deployed. Because those apps load the
 * live site, new code is already served on each load — but an aggressive service
 * worker cache can leave a launch one version behind. This component polls a
 * lightweight /api/version endpoint (whose value changes on every deployment),
 * and when it sees a NEW build it offers a one-tap "Update now" that:
 *   1. tells any waiting service worker to activate (skipWaiting),
 *   2. clears the SW caches so the newest assets are fetched, and
 *   3. reloads the app onto the new version.
 *
 * No native re-install needed — the native shell just reloads the live site.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

const POLL_MS = 5 * 60 * 1000; // check every 5 minutes and on focus

export default function AppUpdateChecker() {
  const baseline = useRef<string | null>(null);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const check = useCallback(async () => {
    try {
      const res = await fetch('/api/version', { cache: 'no-store' });
      if (!res.ok) return;
      const { version } = await res.json();
      if (!version || version === 'dev') return; // local/dev: nothing to update to
      if (baseline.current === null) {
        baseline.current = version; // first read establishes the running version
        return;
      }
      if (version !== baseline.current) setUpdateVersion(version);
    } catch {
      /* offline or transient — ignore, we'll retry */
    }
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, POLL_MS);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [check]);

  const applyUpdate = async () => {
    setUpdating(true);
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        // Activate a freshly-installed worker if one is waiting.
        reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
        // Drop cached pages/assets so the reload pulls the newest build.
        reg?.active?.postMessage({ type: 'CLEAR_CACHES' });
        try { await reg?.update(); } catch { /* best effort */ }
      }
    } finally {
      // Give the SW a beat to process the messages, then hard-reload.
      setTimeout(() => window.location.reload(), 400);
    }
  };

  if (!updateVersion || dismissed === updateVersion) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom,0)+12px)]">
      <div className="flex w-full max-w-md items-center gap-3 rounded-xl border border-blue-200 bg-white p-3 shadow-lg">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
          <RefreshCw className={`h-5 w-5 text-blue-600 ${updating ? 'animate-spin' : ''}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-900">Update available</div>
          <div className="text-xs text-gray-500">A newer version of the app is ready.</div>
        </div>
        <button
          onClick={applyUpdate}
          disabled={updating}
          className="flex-shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {updating ? 'Updating…' : 'Update now'}
        </button>
        <button
          onClick={() => setDismissed(updateVersion)}
          className="flex-shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
