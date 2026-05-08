'use client';

import { SessionProvider } from "next-auth/react";
import { OfflineProvider } from "@/components/OfflineProvider";
import RadioPlayer from "@/components/RadioPlayer";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <OfflineProvider>
        {children}
        {/* Theatre Radio runs globally and stays mounted across all routes
            once the app is opened. The component itself only activates when
            the user is authenticated and presses START RADIO. */}
        <RadioPlayer />
      </OfflineProvider>
    </SessionProvider>
  );
}
