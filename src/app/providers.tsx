'use client';

import { SessionProvider } from "next-auth/react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { OfflineProvider } from "@/components/OfflineProvider";
import { MediaHubProvider } from "@/components/MediaHub";

// Global audio/media chrome is never needed for first paint — it only
// activates after the user is authenticated and interacts. Deferring it with
// next/dynamic (ssr:false) keeps this heavy client JS out of the critical
// bundle so pages become interactive faster for impatient users.
const RadioPlayer = dynamic(() => import("@/components/RadioPlayer"), { ssr: false });
const BackgroundMusicPlayer = dynamic(() => import("@/components/BackgroundMusicPlayer"), { ssr: false });
const MediaHubLauncher = dynamic(() => import("@/components/MediaHub").then((m) => m.MediaHubLauncher), { ssr: false });

// Mounts its children only once the browser is idle after first paint, so the
// media widgets (radio poll, music manifest, launcher) never compete with the
// initial render and data fetches. Falls back to a short timeout where
// requestIdleCallback is unavailable.
function DeferUntilIdle({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 3000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(t);
  }, []);
  return ready ? <>{children}</> : null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <OfflineProvider>
        <MediaHubProvider>
          {children}
          {/* Media chrome (Theatre Radio, background music, launcher) is
              non-critical and only mounts once the page is idle, keeping the
              initial load fast. The radio still activates well within its
              normal polling window. */}
          <DeferUntilIdle>
            <RadioPlayer />
            <BackgroundMusicPlayer />
            <MediaHubLauncher />
          </DeferUntilIdle>
        </MediaHubProvider>
      </OfflineProvider>
    </SessionProvider>
  );
}
