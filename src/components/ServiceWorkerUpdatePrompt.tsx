'use client';

import { useServiceWorker } from '@/lib/useOffline';
import { RefreshCw, Sparkles } from 'lucide-react';
import { DockSlot, DOCK_ORDER } from '@/components/FloatingDock';

/**
 * Floating banner shown when a new service worker version has installed
 * in the background. Clicking "Reload now" calls SKIP_WAITING and reloads
 * so users get the latest app shell without having to refresh twice.
 */
export default function ServiceWorkerUpdatePrompt() {
  const { updateAvailable, applyUpdate } = useServiceWorker();

  if (!updateAvailable) return null;

  return (
    // Docked bottom-left, away from the media cluster. It previously sat at
    // `bottom-4 right-4 z-50` — the same corner as the media widgets but at a
    // far lower z-index, so it rendered *underneath* them and its "Reload now"
    // button could not be reached.
    <DockSlot anchor="bottom-left" order={DOCK_ORDER.update}>
    <div
      role="status"
      aria-live="polite"
      className="w-[min(92vw,24rem)] rounded-lg border border-blue-300 bg-white shadow-xl"
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-blue-100 p-2 text-blue-700">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900">Update available</p>
            <p className="mt-0.5 text-sm text-gray-600">
              A new version of the app is ready. Reload to get the latest features and offline updates.
            </p>
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={applyUpdate}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Reload now
          </button>
        </div>
      </div>
    </div>
    </DockSlot>
  );
}
