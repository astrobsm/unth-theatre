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
 * It also applies updates AUTOMATICALLY (no tap) as soon as that cannot cost the
 * user anything — while the app is backgrounded, or just after a resume with no
 * queued work and no recent typing. That is what keeps the installed Android and
 * desktop apps current, since both load the live site: a deploy reaches them the
 * next time the app is backgrounded or reopened. The banner remains for the
 * cases auto-apply declines (mid-task, or changes still waiting to sync).
 *
 * No native re-install needed — the native shell just reloads the live site.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { getOfflineQueueCount } from '@/lib/offlineStore';

const POLL_MS = 5 * 60 * 1000; // check every 5 minutes and on focus
/** How long the app must have been in the background for a resume to count. */
const RESUME_AFTER_MS = 15 * 1000;
/** Recent typing means the user is mid-task; never reload under them. */
const RECENT_INPUT_MS = 60 * 1000;

export default function AppUpdateChecker() {
  const baseline = useRef<string | null>(null);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  // Last time the user typed/changed a field anywhere in the app.
  const lastInputAt = useRef(0);
  // When the app was last hidden, so we can tell a real resume from a tab blur.
  const hiddenSince = useRef(0);
  const applyingRef = useRef(false);

  const check = useCallback(async () => {
    try {
      // Offline there is nothing to update TO, and the request below could be
      // answered from cache — see the guard on the response.
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;

      const res = await fetch('/api/version', { cache: 'no-store' });
      if (!res.ok) return;

      // CRITICAL: a cached answer must never be read as a new deployment. The
      // offline layer can serve a stored copy of this endpoint, and a stale
      // value differing from the running build would look like an update — which,
      // now that updates can apply automatically, would reload the app over and
      // over. Only a genuinely fresh response counts.
      if (res.headers.get('X-Offline-Cache') === 'true' || res.headers.get('X-Offline') === 'true') {
        return;
      }

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
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSince.current = Date.now();
      }
      check();
    };
    // Any typing anywhere marks the user as mid-task (capture phase, so it is
    // seen regardless of which component owns the field).
    const onInput = () => { lastInputAt.current = Date.now(); };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('input', onInput, true);
    document.addEventListener('change', onInput, true);

    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('change', onInput, true);
    };
  }, [check]);

  /**
   * Is it safe to reload the app out from under the user right now?
   *
   * Reloading loses in-progress form input, so this refuses whenever the user
   * might be mid-task. It is intentionally conservative: when in doubt the
   * banner is shown instead, and the update applies on the next resume.
   */
  const safeToApplyAutomatically = useCallback(async (): Promise<boolean> => {
    if (typeof document === 'undefined') return false;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;

    // Nothing may be waiting to sync — a reload while the queue drains risks
    // interrupting an upload of clinical work.
    try {
      if ((await getOfflineQueueCount()) > 0) return false;
    } catch {
      return false;
    }

    // Hidden: nobody is looking, so this is the ideal moment.
    if (document.visibilityState === 'hidden') return true;

    // Visible: only just after a real resume, and only if the user has not been
    // typing. Anything else waits for the banner.
    const resumedRecently =
      hiddenSince.current > 0 && Date.now() - hiddenSince.current < RESUME_AFTER_MS;
    const typingRecently = Date.now() - lastInputAt.current < RECENT_INPUT_MS;
    return resumedRecently && !typingRecently;
  }, []);

  const applyUpdate = async () => {
    if (applyingRef.current) return;
    applyingRef.current = true;
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

  /**
   * Apply a detected update WITHOUT waiting to be tapped, as soon as doing so
   * cannot cost the user anything. The Android and desktop shells load the live
   * site, so this is what actually keeps installed apps current: a new deploy
   * lands the next time the app is backgrounded or reopened, with no prompt.
   *
   * The banner remains for the cases this refuses (mid-task, queued work) and
   * for anyone who wants it immediately.
   */
  useEffect(() => {
    if (!updateVersion || dismissed === updateVersion || applyingRef.current) return;

    let cancelled = false;
    const tryAuto = async () => {
      if (cancelled) return;
      if (await safeToApplyAutomatically()) applyUpdate();
    };

    // Attempt now, and again whenever the app is backgrounded or resumed.
    tryAuto();
    const onVisibility = () => { tryAuto(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateVersion, dismissed, safeToApplyAutomatically]);

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
