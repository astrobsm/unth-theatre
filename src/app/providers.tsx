'use client';

import { SessionProvider } from "next-auth/react";
import { OfflineProvider } from "@/components/OfflineProvider";
import RadioPlayer from "@/components/RadioPlayer";
import BackgroundMusicPlayer from "@/components/BackgroundMusicPlayer";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <OfflineProvider>
        {children}
        {/* Theatre Radio runs globally and stays mounted across all routes
            once the app is opened. The component itself only activates when
            the user is authenticated and presses START RADIO. */}
        <RadioPlayer />
        {/* Background music — lowest priority audio source. Automatically
            ducks (pauses) on `radio:active` and resumes on `radio:idle`,
            so it never overlaps with announcements or emergency alerts. */}
        <BackgroundMusicPlayer />
      </OfflineProvider>
    </SessionProvider>
  );
}
