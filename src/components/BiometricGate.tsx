'use client';

/**
 * BiometricGate
 * -------------
 * Two jobs, both only inside the installed native app:
 *
 *   1. COLD START — ask for a fingerprint once per app launch, the way a bank
 *      app does. Returning from the recents list does not re-ask; relaunching
 *      does.
 *
 *   2. LAPSED SESSION — when the 30-day session has finally expired, redeem
 *      the stored device credential instead of showing a password box.
 *
 * IT MUST NEVER BE THE ONLY WAY IN. Every path out of this component ends at
 * either the dashboard or the password screen — never at a spinner, never at
 * a dialog with one button that does not work. A surgeon with wet hands in
 * the middle of a list must always be four taps from being signed in. That is
 * why "Use password instead" is always visible rather than appearing after a
 * failure, and why every error is swallowed into that same offer.
 */

import { useEffect, useState, useCallback } from 'react';
import { signIn } from 'next-auth/react';
import {
  biometricAvailable,
  hasStoredCredential,
  promptFingerprint,
  readCredential,
  forgetCredential,
} from '@/lib/native/biometric';

/**
 * Marks this launch as already unlocked.
 *
 * sessionStorage rather than a module variable or localStorage, and the
 * distinction is the whole feature: a module variable is lost on any
 * full page load (so it would re-prompt on every navigation), and
 * localStorage survives the app being killed (so it would never re-prompt
 * again, which is precisely the bank-app behaviour we were asked for and
 * would not have). sessionStorage dies with the WebView, which is exactly
 * what "cold start" means here.
 */
const UNLOCKED_KEY = 'orm.biometric.unlocked';

type Phase = 'checking' | 'locked' | 'working' | 'open';

export default function BiometricGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [failed, setFailed] = useState(false);

  const markOpen = useCallback(() => {
    try {
      sessionStorage.setItem(UNLOCKED_KEY, '1');
    } catch {
      /* private mode or storage disabled — worst case we ask again */
    }
    setPhase('open');
  }, []);

  const unlock = useCallback(async () => {
    setFailed(false);
    setPhase('working');

    const ok = await promptFingerprint('Sign in to UNTH Theatre ORM');
    if (!ok) {
      setFailed(true);
      setPhase('locked');
      return;
    }

    const credential = await readCredential();
    if (!credential) {
      // Enrolled according to the gate, but the Keystore has nothing. Clear
      // the flag and let the password through rather than looping.
      await forgetCredential();
      markOpen();
      return;
    }

    // Redeem it. If a session is already live this is harmless — NextAuth
    // simply reissues one — and it is what makes the lapsed-session case
    // work without a password box.
    const res = await signIn('device', { credential, redirect: false });

    if (res?.error) {
      // The server refused: revoked, expired, or the account was suspended.
      // Drop the stored secret, because a credential the server will not
      // accept makes every future cold start fail at the fingerprint instead
      // of going straight to the password box that would actually work.
      await forgetCredential();
      setFailed(true);
      setPhase('locked');
      return;
    }

    markOpen();
  }, [markOpen]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Already unlocked this launch?
        let already = false;
        try {
          already = sessionStorage.getItem(UNLOCKED_KEY) === '1';
        } catch {
          /* treat as not unlocked */
        }
        if (already) {
          if (!cancelled) setPhase('open');
          return;
        }

        // Web, or a handset with no usable biometrics, or a phone that was
        // never enrolled: this component does nothing at all.
        const [available, enrolled] = await Promise.all([
          biometricAvailable(),
          hasStoredCredential(),
        ]);
        if (cancelled) return;

        if (!available || !enrolled) {
          markOpen();
          return;
        }

        setPhase('locked');
        // Offer the prompt immediately — making someone tap a button to
        // reach the fingerprint reader is a tap for nothing.
        void unlock();
      } catch {
        // Anything unexpected: open. Failing closed here would lock the
        // theatre out of its own system over a plugin error.
        if (!cancelled) markOpen();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [markOpen, unlock]);

  if (phase === 'open') return <>{children}</>;

  // 'checking' renders the same shell as 'locked' so there is no flash of the
  // dashboard behind the lock while we decide.
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#15323B] px-6 text-center">
      <div className="w-full max-w-sm">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-white/10">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="h-10 w-10 text-[#7FD4C1]"
            aria-hidden="true"
          >
            <path d="M12 11c0 3.5-.5 6-1.5 8" />
            <path d="M8.5 9.5a3.5 3.5 0 0 1 7 0c0 4-.7 6.8-1.8 9.2" />
            <path d="M5 9a7 7 0 0 1 14 0c0 1.2 0 2.3-.2 3.4" />
            <path d="M7.5 18.5c.9-1.8 1.4-4 1.4-6.4" />
            <path d="M17.6 16.5c-.3 1.2-.7 2.3-1.2 3.3" />
          </svg>
        </div>

        <h1 className="text-xl font-semibold text-white">
          {phase === 'working' ? 'Waiting for your fingerprint' : 'Unlock ORM'}
        </h1>

        <p className="mt-2 text-sm text-[#9FBCC2]">
          {failed
            ? 'That did not work. Try again, or sign in with your password.'
            : 'Touch the fingerprint sensor to continue.'}
        </p>

        <button
          type="button"
          onClick={() => void unlock()}
          disabled={phase === 'working'}
          className="mt-7 w-full rounded-xl bg-[#0F7A6C] px-5 py-3 font-semibold text-white disabled:opacity-60"
        >
          {phase === 'working' ? 'Scanning…' : 'Try fingerprint again'}
        </button>

        {/* ALWAYS PRESENT, not revealed after a failure. Someone who cannot
            use the sensor right now must not have to fail first to find the
            way past it. */}
        <button
          type="button"
          onClick={markOpen}
          className="mt-3 w-full rounded-xl border border-white/25 px-5 py-3 font-medium text-white"
        >
          Use password instead
        </button>
      </div>
    </div>
  );
}
