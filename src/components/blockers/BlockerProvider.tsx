'use client';

// ============================================================
// Listening for refusals, everywhere in the application
// ------------------------------------------------------------
// Mounted ONCE, beside the toaster. The fetch interceptor already sees every
// mutation this application makes, so a refusal it can explain is announced as
// a window event and picked up here — which is how ~150 screens get this
// without any of them being edited.
//
// A second copy of this would show two dialogs for one refusal, so it refuses
// to mount twice.
//
// RETRY RE-SENDS THE ORIGINAL REQUEST. The interceptor hands over enough to do
// that, because "try again" that only closes the box is not a fix — it is an
// instruction to the user to do the work a second time.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import BlockerDialog from './BlockerDialog';
import { describeBlocker, type Blocker } from '@/lib/blockers/catalogue';
import { RAISE_EVENT } from '@/lib/blockers/raise';

/** What the interceptor sends, and what a retry needs to repeat the request. */
export interface BlockedDetail {
  status: number;
  url: string;
  method: string;
  body: unknown;
  offline?: boolean;
  /** The request that was refused, for the retry button. */
  request?: { url: string; method: string; headers?: Record<string, string>; body?: string };
}

export const BLOCKED_EVENT = 'orm:blocked';

let mounted = false;

export default function BlockerProvider() {
  const [blocker, setBlocker] = useState<Blocker | null>(null);
  const [retrying, setRetrying] = useState(false);
  const pending = useRef<BlockedDetail | null>(null);
  const owns = useRef(false);

  useEffect(() => {
    if (mounted && !owns.current) return;
    mounted = true;
    owns.current = true;

    const onBlocked = (e: Event) => {
      const detail = (e as CustomEvent<BlockedDetail>).detail;
      if (!detail) return;
      const described = describeBlocker(detail);
      // No dialog for a refusal we cannot improve on. The form's own message
      // stands, which at least knows what the person was trying to do.
      if (!described) return;
      pending.current = detail;
      setBlocker(described);
    };

    // Blocks the form worked out for itself — a time outside theatre hours, a
    // step that needs an earlier one done first. These never reach the server,
    // and they are the ones people get most stuck on, so they get the same
    // dialog rather than a second way of being told no.
    const onRaised = (e: Event) => {
      const detail = (e as CustomEvent<Blocker>).detail;
      if (!detail) return;
      pending.current = null; // nothing to retry: no request was ever sent
      setBlocker(detail);
    };

    window.addEventListener(BLOCKED_EVENT, onBlocked as EventListener);
    window.addEventListener(RAISE_EVENT, onRaised as EventListener);
    return () => {
      window.removeEventListener(BLOCKED_EVENT, onBlocked as EventListener);
      window.removeEventListener(RAISE_EVENT, onRaised as EventListener);
      owns.current = false;
      mounted = false;
    };
  }, []);

  const close = useCallback(() => {
    setBlocker(null);
    pending.current = null;
    setRetrying(false);
  }, []);

  const retry = useCallback(async () => {
    const req = pending.current?.request;
    if (!req) { close(); return; }
    setRetrying(true);
    try {
      const res = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
      });
      if (res.ok) {
        close();
        // The screen that made the request does not know it succeeded on the
        // second attempt, so it is told to refresh rather than left showing
        // what it had before.
        window.dispatchEvent(new CustomEvent('orm:blocked-resolved', { detail: { url: req.url } }));
        return;
      }
      // Still refused — describe whatever it says now rather than leaving the
      // old reason up, which may no longer be the reason.
      const body = await res.json().catch(() => ({}));
      const described = describeBlocker({
        status: res.status, url: req.url, method: req.method, body,
      });
      setBlocker(described ?? blocker);
    } catch {
      // The network went while retrying. Say that, rather than the original.
      setBlocker(describeBlocker({
        status: 0, url: req.url, method: req.method, body: {}, offline: true,
      }));
    } finally {
      setRetrying(false);
    }
  }, [blocker, close]);

  return (
    <BlockerDialog
      blocker={blocker}
      onClose={close}
      onRetry={pending.current?.request ? retry : undefined}
      retrying={retrying}
    />
  );
}
