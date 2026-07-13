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

import { useEffect, useRef, useState } from 'react';

const DISMISS_KEY = 'orm.native.updateDismissedFor';
const CHECK_EVENT = 'orm:native-update-check';
const RESULT_EVENT = 'orm:native-update-result';

type UpdateState =
  | { status: 'idle' }
  | { status: 'unavailable'; message: string }
  | { status: 'current'; current: string }
  | { status: 'available'; current: string; latest: string; url: string; name?: string };

declare global {
  interface WindowEventMap {
    [CHECK_EVENT]: CustomEvent<{ manual?: boolean }>;
    [RESULT_EVENT]: CustomEvent<UpdateState>;
  }
}

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
  const [isNativeAndroid, setIsNativeAndroid] = useState(false);
  const [checking, setChecking] = useState(false);
  const [update, setUpdate] = useState<UpdateState>({ status: 'idle' });

  const publish = (state: UpdateState) => {
    setUpdate(state);
    window.dispatchEvent(new CustomEvent(RESULT_EVENT, { detail: state }));
  };

  const openUpdate = async (url: string) => {
    try {
      const { AppLauncher } = await import('@capacitor/app-launcher');
      await AppLauncher.openUrl({ url });
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const checkForUpdate = async (manual = false) => {
    if (checking) return;
    setChecking(true);
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor?.isNativePlatform?.() || Capacitor.getPlatform?.() !== 'android') {
        publish({ status: 'unavailable', message: 'Android app updates are only available inside the installed Android app.' });
        return;
      }
      setIsNativeAndroid(true);
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        publish({ status: 'unavailable', message: 'Connect to the internet to check for app updates.' });
        return;
      }

      const { App } = await import('@capacitor/app');
      const info = await App.getInfo();
      const current = info?.version || '0.0.0';

      const res = await fetch('/api/app-version', { cache: 'no-store' });
      if (!res.ok) {
        publish({ status: 'unavailable', message: 'Could not reach the update server.' });
        return;
      }

      const data = await res.json();
      const latest: string | undefined = data?.android?.version;
      const url: string | undefined = data?.android?.url;
      const name: string | undefined = data?.android?.name;
      if (!latest || !url) {
        publish({ status: 'unavailable', message: 'No Android update package is available yet.' });
        return;
      }

      if (!isNewer(latest, current)) {
        publish({ status: 'current', current });
        return;
      }

      publish({ status: 'available', current, latest, url, name });
      if (!manual) {
        try {
          if (window.localStorage.getItem(DISMISS_KEY) === latest) return;
          window.localStorage.setItem(DISMISS_KEY, latest);
        } catch {
          /* ignore */
        }
      }
    } catch {
      publish({ status: 'unavailable', message: 'App update check failed. Please try again.' });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const onManualCheck = (event: WindowEventMap[typeof CHECK_EVENT]) => {
      checkForUpdate(Boolean(event.detail?.manual));
    };
    window.addEventListener(CHECK_EVENT, onManualCheck);
    checkForUpdate(false);
    return () => window.removeEventListener(CHECK_EVENT, onManualCheck);
  }, []);

  if (!isNativeAndroid || update.status !== 'available') return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[70] rounded-lg border border-blue-200 bg-white p-4 shadow-2xl sm:left-auto sm:w-[380px]">
      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">Android app update available</p>
          <p className="text-xs text-gray-600">
            Version {update.latest} is ready. You have {update.current}.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => openUpdate(update.url)}
            className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Update Android App
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                window.localStorage.setItem(DISMISS_KEY, update.latest);
              } catch {
                /* ignore */
              }
              setUpdate({ status: 'idle' });
            }}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
