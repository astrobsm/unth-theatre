'use client';

/**
 * useAdaptivePoll — polling that respects the network it is running on.
 *
 * Pages across this app each wrote their own `setInterval(fetchX, ms)` with no
 * gating, so a hidden tab cost exactly as much as a focused one and an offline
 * handset kept firing requests that could only fail. In a theatre on poor mobile
 * internet that traffic competes with the requests that actually matter, and it
 * drains the battery of the phone someone is relying on.
 *
 * The policy, in one place so every caller inherits it:
 *   - visible + online      → the interval you asked for
 *   - hidden                → `hiddenMultiplier`× slower (default 4×)
 *   - save-data / 2G        → `slowLinkMultiplier`× slower (default 3×)
 *   - offline               → skipped entirely; nothing is sent
 *   - tab shown / back online → fires immediately, so a backed-off or skipped
 *                             cycle never leaves the screen stale
 *
 * Self-rescheduling rather than setInterval, so the delay is re-evaluated every
 * cycle and overlapping runs are impossible on a slow connection.
 *
 * Usage:
 *   useAdaptivePoll(useCallback(async () => { await load(); }, [load]), 15000);
 */

import { useEffect, useRef } from 'react';

export interface AdaptivePollOptions {
  /** Set false to suspend polling (e.g. a paused toggle, or unauthenticated). */
  enabled?: boolean;
  /** Slow-down factor while the tab is hidden. */
  hiddenMultiplier?: number;
  /** Slow-down factor on a metered or 2G connection. */
  slowLinkMultiplier?: number;
  /** Run once immediately on mount. Default true. */
  leading?: boolean;
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function isSlowLink(): boolean {
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as any).connection;
  if (!conn) return false;
  if (conn.saveData) return true;
  return typeof conn.effectiveType === 'string' && /2g/.test(conn.effectiveType);
}

export function useAdaptivePoll(
  fn: () => void | Promise<void>,
  intervalMs: number,
  options: AdaptivePollOptions = {}
): void {
  const {
    enabled = true,
    hiddenMultiplier = 4,
    slowLinkMultiplier = 3,
    leading = true,
  } = options;

  // Kept in a ref so a caller passing an inline function does not tear down and
  // restart the loop on every render — which would turn a re-render storm into
  // a request storm.
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    let running = false;

    const delay = () => {
      if (typeof document !== 'undefined' && document.hidden) return intervalMs * hiddenMultiplier;
      if (isSlowLink()) return intervalMs * slowLinkMultiplier;
      return intervalMs;
    };

    const tick = async () => {
      if (cancelled || running) return;
      if (!isOffline()) {
        running = true;
        try {
          await fnRef.current();
        } catch {
          /* caller owns error reporting; a failed poll must not kill the loop */
        } finally {
          running = false;
        }
      }
      if (!cancelled) timer = setTimeout(tick, delay());
    };

    if (leading) {
      tick();
    } else {
      timer = setTimeout(tick, delay());
    }

    const wake = () => {
      if (cancelled || (typeof document !== 'undefined' && document.hidden)) return;
      clearTimeout(timer);
      tick();
    };

    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
    };
  }, [enabled, intervalMs, hiddenMultiplier, slowLinkMultiplier, leading]);
}
