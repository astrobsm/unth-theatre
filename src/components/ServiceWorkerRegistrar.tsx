'use client';

// ============================================================
// Register the service worker on EVERY page, not just the dashboard
// ------------------------------------------------------------
// A browser will not offer to install a web app until a service worker with a
// fetch handler is registered and controlling the page. Registration lived in
// OfflineIndicator, which is mounted in the DASHBOARD layout — so on
// /auth/login, the first screen anybody sees and the one they are looking at
// when they think "I should install this", no service worker existed and
// `beforeinstallprompt` could never fire.
//
// The install button was already in the root layout and rendered there
// perfectly happily. It simply had nothing to offer, on the only screen an
// uninstalled visitor reliably reaches.
//
// This registers as early as the app has a body, on every route, so the prompt
// is available from the login screen onward — and so the shell is cached before
// somebody signs in on a bad link rather than after.
//
// Registering twice is harmless: navigator.serviceWorker.register with the same
// script and scope resolves to the existing registration. OfflineIndicator
// still does its own, because it also drives the update prompt and the cache
// status and should not depend on this component existing.
// ============================================================

import { useEffect } from 'react';
import { registerServiceWorker } from '@/lib/pwa';

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    // Deliberately not awaited and never allowed to throw. Caching is a
    // convenience; a browser that refuses it (private mode, an unsupported
    // in-app webview, an insecure context) must still get a working app.
    registerServiceWorker().catch(() => {
      /* no service worker here — the app works, it just will not install */
    });
  }, []);

  return null;
}
