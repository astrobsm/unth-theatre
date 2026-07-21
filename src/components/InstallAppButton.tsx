'use client';

/**
 * Floating "Install App" button.
 *
 * Visibility rules:
 *  - Hidden when the app is already running as an installed PWA
 *    (display-mode: standalone / iOS navigator.standalone).
 *  - Hidden when the user has dismissed the prompt (localStorage flag).
 *  - On Chrome/Edge/Android: shown as soon as `beforeinstallprompt` fires
 *    AND also shown as a fallback "How to install" button if the browser
 *    never fires the event (so it is visible to ALL non-installed users).
 *  - On iOS Safari: shown with Add-to-Home-Screen instructions.
 */

import { useEffect, useState } from 'react';
import { Download, X, Share, Plus } from 'lucide-react';
import { DockSlot, DOCK_ORDER } from '@/components/FloatingDock';
import {
  setupInstallPrompt,
  promptInstall,
  isPWAInstalled,
} from '@/lib/pwa';

const DISMISS_KEY = 'orm.installPrompt.dismissedAt';
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 3; // 3 days — re-appears after this

function isIos(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
}

export default function InstallAppButton() {
  const [installed, setInstalled] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false); // native beforeinstallprompt is ready
  const [showBanner, setShowBanner] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [showFallbackHelp, setShowFallbackHelp] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setInstalled(isPWAInstalled());

    // Honour previous dismissal (within TTL).
    try {
      const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (ts && Date.now() - ts < DISMISS_TTL_MS) {
        setDismissed(true);
      }
    } catch {}

    const cleanup = setupInstallPrompt(() => setCanPrompt(true));

    const onInstalled = () => {
      setInstalled(true);
      setShowBanner(false);
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      cleanup();
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || dismissed) return null;

  const handleClick = async () => {
    if (canPrompt) {
      const accepted = await promptInstall();
      if (accepted) {
        setInstalled(true);
        return;
      }
      // User cancelled the native prompt — soft-dismiss.
      handleDismiss();
      return;
    }
    if (isIos()) {
      setShowIosHelp(true);
      return;
    }
    // Browser never fired beforeinstallprompt (e.g. Firefox, desktop Safari,
    // already-saved-to-homescreen on a different profile, in-app browser).
    setShowFallbackHelp(true);
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setDismissed(true);
    setShowBanner(false);
  };

  return (
    <>
      {/* Bottom-LEFT: the bottom-right corner is the media cluster. This used to
          share the exact `bottom-4 right-4` slot as the hub launcher, so the two
          round buttons overlapped and fought for taps. */}
      <DockSlot anchor="bottom-left" order={DOCK_ORDER.install}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleClick}
          className="group flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 ring-2 ring-white/40 transition hover:bg-blue-700 hover:shadow-xl active:scale-95"
          aria-label="Install Operative Resource Manager app"
          title="Install the app on this device"
        >
          <Download className="h-5 w-5" />
          <span className="hidden sm:inline">Install App</span>
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-full bg-white/90 p-2 text-slate-600 shadow ring-1 ring-slate-300 transition hover:bg-white hover:text-slate-900"
          aria-label="Dismiss install prompt"
          title="Dismiss for now"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      </DockSlot>

      {/* iOS Safari add-to-home-screen instructions */}
      {showIosHelp && (
        <div
          className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => setShowIosHelp(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-lg font-bold text-slate-900">
              Install on iPhone / iPad
            </h3>
            <p className="mb-4 text-sm text-slate-600">
              Add Operative Resource Manager to your Home Screen for the best
              experience.
            </p>
            <ol className="space-y-3 text-sm text-slate-800">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                  1
                </span>
                <span>
                  Tap the <Share className="inline h-4 w-4 align-text-bottom text-blue-600" />{' '}
                  <strong>Share</strong> button at the bottom of Safari.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                  2
                </span>
                <span>
                  Scroll down and tap{' '}
                  <strong>
                    Add to Home Screen{' '}
                    <Plus className="inline h-4 w-4 align-text-bottom" />
                  </strong>
                  .
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                  3
                </span>
                <span>
                  Tap <strong>Add</strong> in the top-right corner.
                </span>
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIosHelp(false)}
              className="mt-6 w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Generic fallback help — desktop Safari / Firefox / in-app browsers */}
      {showFallbackHelp && (
        <div
          className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => setShowFallbackHelp(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-lg font-bold text-slate-900">
              Install Operative Resource Manager
            </h3>
            <p className="mb-4 text-sm text-slate-600">
              For the best experience, install the app on this device.
            </p>
            <div className="space-y-3 text-sm text-slate-800">
              <div>
                <strong className="text-slate-900">Chrome / Edge (desktop):</strong>{' '}
                Click the <Download className="inline h-4 w-4 align-text-bottom text-blue-600" />{' '}
                install icon in the address bar, or open the browser menu and choose{' '}
                <em>Install Operative Resource Manager…</em>
              </div>
              <div>
                <strong className="text-slate-900">Android (Chrome):</strong> Open
                the menu (⋮) and tap <em>Add to Home screen</em> /{' '}
                <em>Install app</em>.
              </div>
              <div>
                <strong className="text-slate-900">Firefox:</strong> Open the menu
                and tap <em>Install</em> / <em>Add to Home screen</em>.
              </div>
              <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
                <strong>Tip:</strong> If you opened this link inside a chat app
                (WhatsApp, Messenger), tap the <em>Open in browser</em> option
                first — in-app browsers cannot install PWAs.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowFallbackHelp(false)}
              className="mt-6 w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
