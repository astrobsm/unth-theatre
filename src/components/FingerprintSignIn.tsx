'use client';

/**
 * "Sign in with fingerprint", on the login page itself.
 *
 * REPLACES THE FULL-SCREEN LOCK GATE, and the reason is worth recording. The
 * gate blocked the app before the login page and asked for a fingerprint
 * straight away. On a handset where the system prompt never appeared, that
 * put a dead screen in front of a hospital system — twice, on two different
 * builds. The password box was reachable, but only by recognising that the
 * quiet button was the way out.
 *
 * An option on the login page cannot do that. The login page is already the
 * place you can always type a password; a fingerprint button beside it is
 * strictly additive. If the sensor does nothing, the username and password
 * are right there, already on screen, with nothing to dismiss.
 *
 * IT ALSO SAYS WHY IT FAILED. The previous version swallowed every error into
 * "that did not work", which is how two rounds of guessing happened. The
 * plugin reports a real reason — no fingerprints enrolled, hardware busy,
 * locked out after too many attempts — and this shows it.
 */

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { Fingerprint } from 'lucide-react';
import {
  biometricStatus,
  hasStoredCredential,
  promptFingerprint,
  readCredential,
  forgetCredential,
} from '@/lib/native/biometric';

export default function FingerprintSignIn({ onSignedIn }: { onSignedIn?: () => void }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [status, enrolled] = await Promise.all([biometricStatus(), hasStoredCredential()]);
        if (cancelled) return;
        // Only offer it on a phone that both supports it and has been enrolled
        // by its owner. Offering it otherwise is a button that cannot work.
        if (status.available && enrolled) setShow(true);
      } catch {
        /* web, or no plugin — the password form stands alone */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await promptFingerprint('Sign in to UNTH Theatre ORM');

      if (!result.ok) {
        setError(result.message);
        setBusy(false);
        return;
      }

      const credential = await readCredential();
      if (!credential) {
        await forgetCredential();
        setError('This phone is no longer set up for fingerprint sign-in. Please use your password.');
        setBusy(false);
        return;
      }

      const res = await signIn('device', { credential, redirect: false });
      if (res?.error) {
        // Revoked, expired, or the account was suspended. Drop the local
        // secret so the button stops offering something that cannot work.
        await forgetCredential();
        setShow(false);
        setError('Fingerprint sign-in has expired for this phone. Please sign in with your password.');
        setBusy(false);
        return;
      }

      onSignedIn?.();
      window.location.assign('/dashboard');
    } catch {
      setError('Fingerprint sign-in could not start. Please use your password.');
      setBusy(false);
    }
  };

  return (
    <div className="mt-4">
      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-3 text-sm text-gray-500">or</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void go()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-primary-600 px-4 py-3 font-semibold text-primary-700 disabled:opacity-60"
      >
        <Fingerprint className="h-5 w-5" />
        {busy ? 'Waiting for your fingerprint…' : 'Sign in with fingerprint'}
      </button>

      {error && (
        <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          {error} Your username and password above always work.
        </p>
      )}
    </div>
  );
}
