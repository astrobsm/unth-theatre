'use client';

// ============================================================
// The device saying where it is, while its owner is on duty
// ------------------------------------------------------------
// Mounted once in the dashboard. Reports a position every ten minutes so the
// presence record has something to read; the SERVER decides whether to store
// anything, because the rules that keep this to duty hours must hold however
// the request arrives, not merely when this component behaves.
//
// It renders nothing at all. A person on duty has enough on the screen without
// a widget telling them they are being checked — what they are told is on the
// availability page, in words, where it belongs.
//
// IT NEVER PROMPTS. If the browser has not been granted location it asks once,
// quietly, and then stops; a permission dialog that reappears every ten minutes
// is how people learn to deny it permanently.
// ============================================================

import { useEffect, useRef } from 'react';

const EVERY_MS = 10 * 60 * 1000;

export default function PresenceReporter() {
  const stopped = useRef(false);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return undefined;

    let timer: number | undefined;

    const report = () => {
      if (stopped.current) return;

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          void fetch('/api/staff/presence', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracyM: pos.coords.accuracy,
              source: 'APP_HEARTBEAT',
            }),
          }).catch(() => { /* a missed heartbeat is a gap, not an error */ });
        },
        (err) => {
          // Denied: stop asking. Anything else — no signal, a timeout — is
          // temporary and worth trying again later, and the server records
          // nothing either way.
          if (err.code === err.PERMISSION_DENIED) stopped.current = true;
        },
        { enableHighAccuracy: false, timeout: 20_000, maximumAge: 5 * 60_000 },
      );
    };

    // Not immediately on load. The first minute after somebody opens the app is
    // the busiest it will be, and this is the least urgent thing happening.
    const first = window.setTimeout(report, 30_000);
    timer = window.setInterval(report, EVERY_MS);

    return () => {
      window.clearTimeout(first);
      if (timer) window.clearInterval(timer);
    };
  }, []);

  return null;
}
