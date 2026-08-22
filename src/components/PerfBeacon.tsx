'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Reports how long this page actually took, for a sample of loads.
 *
 * The point of it: the server side is now measured — nginx logs request time,
 * Postgres has pg_stat_statements — but neither can say what a nurse on a
 * tablet on theatre wifi actually waited for. Server time of 6ms tells you
 * nothing about a page that takes four seconds to become usable.
 *
 * Three rules it follows:
 *
 *   SAMPLED.   One load in ten. Radio polling is already 55% of this server's
 *              traffic; measuring must not become another source of it.
 *   BEACONED.  navigator.sendBeacon, so it is queued by the browser and never
 *              competes with the page or delays unload.
 *   ANONYMOUS. The route PATTERN, never the URL. /dashboard/surgeries/abc-123
 *              is reported as /dashboard/surgeries/[id], because a folder
 *              number in a telemetry log is a patient identifier in a
 *              telemetry log.
 */

const SAMPLE_RATE = 0.1;

/**
 * Strip the identifiers out of a path.
 *
 * UUIDs, long numeric ids and folder-number-shaped segments all become [id].
 * Erring towards over-scrubbing: a route pattern that is slightly too coarse
 * costs a little analytical precision, while one that leaks costs a patient
 * their privacy.
 */
function routePattern(pathname: string): string {
  return pathname
    .split('/')
    .map((seg) => {
      if (!seg) return seg;
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg)) return '[id]';
      if (/^\d{3,}$/.test(seg)) return '[id]';
      if (/^(PT|UNTH)/i.test(seg)) return '[id]';
      if (seg.length > 24) return '[id]';
      return seg;
    })
    .join('/')
    .slice(0, 120);
}

export default function PerfBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.sendBeacon) return;
    if (Math.random() > SAMPLE_RATE) return;

    // Wait for the load event to settle, or the numbers are half-formed.
    const send = () => {
      try {
        const nav = performance.getEntriesByType('navigation')[0] as
          | PerformanceNavigationTiming
          | undefined;
        if (!nav) return;

        const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
        const lcp = lcpEntries.length
          ? Math.round(lcpEntries[lcpEntries.length - 1].startTime)
          : undefined;

        const conn = (navigator as { connection?: { effectiveType?: string } }).connection;

        const payload = {
          route: routePattern(pathname || '/'),
          ttfb: Math.round(nav.responseStart),
          domReady: Math.round(nav.domContentLoadedEventEnd),
          loadComplete: Math.round(nav.loadEventEnd || nav.domContentLoadedEventEnd),
          lcp,
          cores: navigator.hardwareConcurrency || undefined,
          memoryGb: (navigator as { deviceMemory?: number }).deviceMemory,
          // Which server answered — the whole architecture rests on local being
          // the fast path, and this is how that gets checked rather than assumed.
          origin: window.location.hostname.endsWith('.vercel.app') ? 'cloud' : 'local',
          connection: conn?.effectiveType,
        };

        navigator.sendBeacon(
          '/api/telemetry/perf',
          new Blob([JSON.stringify(payload)], { type: 'application/json' }),
        );
      } catch {
        // Telemetry must never be the reason a clinical page misbehaves.
      }
    };

    if (document.readyState === 'complete') {
      // Defer past the current frame so loadEventEnd is populated.
      const t = window.setTimeout(send, 0);
      return () => window.clearTimeout(t);
    }
    window.addEventListener('load', send, { once: true });
    return () => window.removeEventListener('load', send);
  }, [pathname]);

  return null;
}
