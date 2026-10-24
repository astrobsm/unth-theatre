'use client';

/**
 * BiometricEnrolment
 * ------------------
 * Offers fingerprint sign-in once, after the person has signed in with their
 * password inside the installed app. Without this nobody ever receives a
 * device credential and BiometricGate has nothing to unlock.
 *
 * ASKED ONCE, AND "NO" IS REMEMBERED. A prompt that reappears every session
 * is how a useful feature becomes something people reflexively dismiss — and
 * they then dismiss it on the one occasion they would have said yes. The
 * declined flag is per-device in localStorage, which is the right storage
 * here precisely because it should survive the app being killed.
 *
 * Nothing is stored until the fingerprint has actually been presented. The
 * sequence is deliberately: ask the server for a credential, THEN verify the
 * fingerprint, THEN write it to the Keystore — so a credential is never left
 * sitting on a device whose owner walked away at the prompt.
 */

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  biometricAvailable,
  hasStoredCredential,
  promptFingerprint,
  storeCredential,
  forgetCredential,
} from '@/lib/native/biometric';

const DECLINED_KEY = 'orm.biometric.declined';

export default function BiometricEnrolment() {
  // Only once there is somebody to enrol. On the sign-in screen the POST
  // would 401 and the card would offer a thing that cannot work.
  const { status } = useSession();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;

    (async () => {
      try {
        let declined = false;
        try {
          declined = localStorage.getItem(DECLINED_KEY) === '1';
        } catch {
          /* storage unavailable — just ask */
        }
        if (declined) return;

        const [available, already] = await Promise.all([
          biometricAvailable(),
          hasStoredCredential(),
        ]);
        if (cancelled) return;
        if (available && !already) setShow(true);
      } catch {
        /* never block the dashboard over this */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status]);

  const decline = () => {
    try {
      localStorage.setItem(DECLINED_KEY, '1');
    } catch {
      /* worst case we ask again next launch */
    }
    setShow(false);
  };

  const enrol = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/device-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        // fetch has no default timeout. Without this the card sits on
        // "Setting up..." for ever on a slow connection.
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({
          platform: 'android',
          deviceLabel: navigator.userAgent.slice(0, 80),
        }),
      });

      if (!res.ok) {
        setError('The server could not set this up. You can try again later from the dashboard.');
        setBusy(false);
        return;
      }

      const { credential } = (await res.json()) as { credential?: string };
      if (!credential) {
        setError('The server did not return a credential. Please try again later.');
        setBusy(false);
        return;
      }

      // Verify BEFORE storing: if they walk away at the prompt, nothing is
      // left on the device.
      const verified = await promptFingerprint('Confirm your fingerprint to set this up');
      if (!verified.ok) {
        setBusy(false);
        // Say WHY. "Not confirmed" covers a wet finger, a phone with no
        // fingerprints saved, and a prompt that never opened — three things
        // with three different fixes.
        setError(`${verified.message} Nothing was saved.`);
        return;
      }

      const stored = await storeCredential(credential);
      if (!stored) {
        // Do not leave a half-enrolled state: the server thinks this phone is
        // enrolled and the phone has nothing, so every cold start would fail
        // at the fingerprint.
        await forgetCredential();
        setError('This phone would not store the credential securely. Nothing was saved.');
        setBusy(false);
        return;
      }

      setShow(false);
    } catch {
      setError('Something went wrong. Nothing was saved.');
      setBusy(false);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[9998] p-4">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-[#D7E0DE]">
        <h2 className="text-lg font-semibold text-[#15323B]">Sign in with your fingerprint?</h2>
        <p className="mt-1 text-sm text-[#3D5A63]">
          Use your fingerprint instead of typing your password each time you open the app. Your
          password still works, and you can turn this off at any time.
        </p>

        {error && <p className="mt-3 rounded-lg bg-[#FBF0E8] p-3 text-sm text-[#7A4420]">{error}</p>}

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => void enrol()}
            disabled={busy}
            className="flex-1 rounded-xl bg-[#0F7A6C] px-4 py-3 font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Setting up…' : 'Use fingerprint'}
          </button>
          <button
            type="button"
            onClick={decline}
            disabled={busy}
            className="rounded-xl border border-[#D7E0DE] px-4 py-3 font-medium text-[#3D5A63]"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
