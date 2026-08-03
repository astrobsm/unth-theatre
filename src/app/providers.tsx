'use client';

import { SessionProvider } from "next-auth/react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { OfflineProvider } from "@/components/OfflineProvider";
import { MediaHubProvider } from "@/components/MediaHub";
import { FloatingDockRoot } from "@/components/FloatingDock";

// Global audio/media chrome is never needed for first paint — it only
// activates after the user is authenticated and interacts. Deferring it with
// next/dynamic (ssr:false) keeps this heavy client JS out of the critical
// bundle so pages become interactive faster for impatient users.
const RadioPlayer = dynamic(() => import("@/components/RadioPlayer"), { ssr: false });
const BackgroundMusicPlayer = dynamic(() => import("@/components/BackgroundMusicPlayer"), { ssr: false });
const MediaHubLauncher = dynamic(() => import("@/components/MediaHub").then((m) => m.MediaHubLauncher), { ssr: false });
// Native push registration — no-op on web; only active inside the installed app.
const PushNotificationRegistrar = dynamic(() => import("@/components/PushNotificationRegistrar"), { ssr: false });
// Native offline-first warm-up — auto-caches the whole app on the device (native only).
const NativeOfflineWarmup = dynamic(() => import("@/components/NativeOfflineWarmup"), { ssr: false });
// Native shell auto-update check — prompts to install a newer APK (native only).
const NativeUpdateChecker = dynamic(() => import("@/components/NativeUpdateChecker"), { ssr: false });
// Content/feature auto-update — detects a newer DEPLOYMENT and refreshes the app
// onto it (Android/desktop/PWA), so improvements reach devices without re-install.
const AppUpdateChecker = dynamic(() => import("@/components/AppUpdateChecker"), { ssr: false });

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

/**
 * Routes where NO floating widget may appear.
 *
 * Reported from a phone: an emergency announcement arrived while the user was
 * signing in. The acknowledge banner took the top of the screen and the radio
 * panel — anchored to the bottom, which the on-screen keyboard pushes into the
 * middle — sat directly over the password field and the Sign In button. The
 * page was unusable, and the one thing the user needed to do was authenticate
 * so they could act on the emergency.
 *
 * Nothing here is worth showing to somebody who is not yet signed in: they
 * cannot acknowledge anything, and the announcement will still be waiting a
 * few seconds later.
 */
const NO_CHROME_PREFIXES = ['/auth', '/login', '/register', '/offline'];

function useChromeAllowed(): boolean {
  const pathname = usePathname();
  if (!pathname) return true;
  return !NO_CHROME_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function FloatingChrome() {
  const allowed = useChromeAllowed();
  if (!allowed) return null;
  return (
    <DeferUntilIdle>
      <RadioPlayer />
      <BackgroundMusicPlayer />
      <MediaHubLauncher />
    </DeferUntilIdle>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <OfflineProvider>
        <MediaHubProvider>
          {/* Anchors for every floating widget. Mounted before them so the
              portals find their host on first paint. */}
          <FloatingDockRoot />
          {children}
          {/* Media chrome (Theatre Radio, background music, launcher) is
              non-critical and only mounts once the page is idle, keeping the
              initial load fast. The radio still activates well within its
              normal polling window. */}
          {/* Anything that DRAWS goes through FloatingChrome, which keeps it
              off the sign-in screen. */}
          <FloatingChrome />
          {/* These register listeners and never draw, so they run everywhere —
              push registration and update checks must keep working on the
              login screen. */}
          <DeferUntilIdle>
            <PushNotificationRegistrar />
            <NativeOfflineWarmup />
            <NativeUpdateChecker />
            <AppUpdateChecker />
          </DeferUntilIdle>
        </MediaHubProvider>
      </OfflineProvider>
    </SessionProvider>
  );
}
