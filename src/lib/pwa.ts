// ============================================================
// PWA Registration & Install Prompt
// Handles: service worker lifecycle, install prompt, update detection
// ============================================================

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;
let onInstallReady: (() => void) | null = null;
let onUpdateAvailable: ((reg: ServiceWorkerRegistration) => void) | null = null;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// ============================================================
// Register Service Worker
// ============================================================
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    swRegistration = registration;

    // Check for updates on load
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New version available
          onUpdateAvailable?.(registration);
        }
      });
    });

    // Listen for messages from SW
    navigator.serviceWorker.addEventListener('message', (event) => {
      const { type, synced, pending } = event.data || {};
      if (type === 'SYNC_COMPLETE') {
        window.dispatchEvent(new CustomEvent('sw-sync-complete', {
          detail: { synced, pending },
        }));
      }
      if (type === 'CACHE_STATUS') {
        window.dispatchEvent(new CustomEvent('sw-cache-status', {
          detail: event.data.payload,
        }));
      }
    });

    // Periodic update check every 60 minutes
    setInterval(() => {
      registration.update();
    }, 60 * 60 * 1000);

    console.log('[PWA] Service worker registered');
    return registration;
  } catch (error) {
    console.error('[PWA] Service worker registration failed:', error);
    return null;
  }
}

// ============================================================
// Install Prompt
// ============================================================
export function setupInstallPrompt(callback: () => void): () => void {
  onInstallReady = callback;

  const handler = (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    onInstallReady?.();
  };

  window.addEventListener('beforeinstallprompt', handler);
  return () => window.removeEventListener('beforeinstallprompt', handler);
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;

  try {
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    return outcome === 'accepted';
  } catch {
    return false;
  }
}

export function canInstall(): boolean {
  return deferredPrompt !== null;
}

// ============================================================
// Update Management
// ============================================================
export function setUpdateHandler(handler: (reg: ServiceWorkerRegistration) => void): void {
  onUpdateAvailable = handler;
}

export function applyUpdate(): void {
  if (swRegistration?.waiting) {
    swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    window.location.reload();
  }
}

// ============================================================
// Cache Management
// ============================================================
export function requestCacheStatus(): void {
  navigator.serviceWorker.controller?.postMessage({ type: 'GET_CACHE_STATUS' });
}

export function precacheUrls(urls: string[]): void {
  navigator.serviceWorker.controller?.postMessage({
    type: 'CACHE_URLS',
    payload: { urls },
  });
}

export function clearAllCaches(): void {
  navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_CACHES' });
}

// ============================================================
// PWA Status
// ============================================================
export function isPWAInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as any).standalone === true;
}

export function getRegistration(): ServiceWorkerRegistration | null {
  return swRegistration;
}
