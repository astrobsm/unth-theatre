'use client';

import { SessionProvider } from "next-auth/react";
import dynamic from "next/dynamic";
import { OfflineProvider } from "@/components/OfflineProvider";
import { MediaHubProvider } from "@/components/MediaHub";

// Global audio/media chrome is never needed for first paint — it only
// activates after the user is authenticated and interacts. Deferring it with
// next/dynamic (ssr:false) keeps this heavy client JS out of the critical
// bundle so pages become interactive faster for impatient users.
const RadioPlayer = dynamic(() => import("@/components/RadioPlayer"), { ssr: false });
const BackgroundMusicPlayer = dynamic(() => import("@/components/BackgroundMusicPlayer"), { ssr: false });
const MediaHubLauncher = dynamic(() => import("@/components/MediaHub").then((m) => m.MediaHubLauncher), { ssr: false });

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <OfflineProvider>
        <MediaHubProvider>
          {children}
          {/* Theatre Radio runs globally and stays mounted across all routes
              once the app is opened. The component itself only activates when
              the user is authenticated and presses START RADIO. It now only
              renders its full panel when chosen from the combined media hub. */}
          <RadioPlayer />
          {/* Background music — lowest priority audio source. Automatically
              ducks (pauses) on `radio:active` and resumes on `radio:idle`,
              so it never overlaps with announcements or emergency alerts. */}
          <BackgroundMusicPlayer />
          {/* Single combined launcher: tap to split into Radio / Music, pick
              one to enlarge, auto-collapses back to one icon afterwards. */}
          <MediaHubLauncher />
        </MediaHubProvider>
      </OfflineProvider>
    </SessionProvider>
  );
}
