'use client';

/**
 * Fingerprint sign-in, in Settings, permanently.
 *
 * WHY THIS EXISTS: the feature was unreachable. The login-page button only
 * appears once a phone is enrolled, and the only way to enrol was a card
 * shown once after signing in — which vanished for good the moment anybody
 * tapped "Not now", and which could not complete at all on a handset whose
 * fingerprint prompt misbehaves. Three dead ends and no door. The honest
 * summary of the bug report was "I cannot find the biometric sign-in",
 * because there was nothing to find.
 *
 * So: one place, always present inside the installed app, that states what
 * the phone can do and lets it be turned on and off. It is deliberately NOT
 * hidden when biometrics are unavailable — it says WHY instead, because
 * "there is no such setting" and "your phone has no fingerprints saved" look
 * identical when the answer is a missing row, and only one of them is
 * something the person can go and fix.
 */

import { useCallback, useEffect, useState } from 'react';
import { Fingerprint, Check, AlertTriangle } from 'lucide-react';
import {
  biometricStatus,
  hasStoredCredential,
  promptFingerprint,
  storeCredential,
  forgetCredential,
  type BiometricStatus,
} from '@/lib/native/biometric';

/** Cleared when fingerprint is enabled here, so the one-time card can return. */
const DECLINED_KEY = 'orm.biometric.declined';

export default function FingerprintSetting() {
  const [native, setNative] = useState(false);
  const [status, setStatus] = useState<BiometricStatus | null>(null);
  const [enrolled, setEnrolled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { Capacitor } = await import('@capacitor/core');
    const isNative = !!Capacitor?.isNativePlatform?.();
    setNative(isNative);
    if (!isNative) return;
    setStatus(await biometricStatus());
    setEnrolled(await hasStoredCredential());
  }, []);

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  // On a computer this is not a setting, it is noise. The dashboard is the
  // same page on both, so say nothing rather than show something inert.
  if (!native) return null;

  const enable = async () => {
    setBusy(true);
    setNote(null);
    setProblem(null);
    try {
      // THE NETWORK CALL NEEDS ITS OWN DEADLINE. This hung on "Setting up..."
      // for a phone on a very slow connection: fetch has no default timeout,
      // so the await simply never returned and the button stayed busy for
      // ever. Twenty seconds is generous for a few hundred bytes on theatre
      // wifi and still short enough that nobody is left wondering.
      const res = await fetch('/api/device-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({ platform: 'android', deviceLabel: navigator.userAgent.slice(0, 80) }),
      });
      if (!res.ok) {
        setProblem('The server could not set this up. Please try again later.');
        return;
      }
      const { credential } = (await res.json()) as { credential?: string };
      if (!credential) {
        setProblem('The server did not return a credential. Please try again later.');
        return;
      }

      // Prove the sensor works BEFORE relying on it, and before writing
      // anything to the device. Enabling a sign-in method that cannot be
      // used is how somebody ends up locked out of a hospital system.
      const verified = await promptFingerprint('Confirm your fingerprint to turn this on');
      if (!verified.ok) {
        setProblem(verified.message);
        return;
      }

      if (!(await storeCredential(credential))) {
        await forgetCredential();
        setProblem('This phone would not store the credential securely. Nothing was saved.');
        return;
      }

      try {
        localStorage.removeItem(DECLINED_KEY);
      } catch {
        /* storage unavailable */
      }
      setEnrolled(true);
      setNote('Fingerprint sign-in is on. You will see it on the sign-in screen.');
    } catch (e) {
      // AbortSignal.timeout rejects with a TimeoutError. Naming the network
      // tells somebody on theatre wifi to move and try again, rather than
      // leaving them to conclude the feature is broken.
      const timedOut = (e as { name?: string })?.name === 'TimeoutError';
      setProblem(
        timedOut
          ? 'The connection was too slow to set this up. Nothing was saved — please try again.'
          : 'Something went wrong. Nothing was saved.',
      );
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setNote(null);
    setProblem(null);
    try {
      // Revoke server-side as well as locally. Forgetting only the phone's
      // copy would leave a credential the server still honours.
      await fetch('/api/device-credentials', {
        method: 'DELETE',
        credentials: 'include',
        signal: AbortSignal.timeout(20_000),
      }).catch(() => undefined);
      await forgetCredential();
      setEnrolled(false);
      setNote('Fingerprint sign-in is off. Your password still works as normal.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Fingerprint className="h-5 w-5 text-blue-600" />
        Fingerprint sign-in
      </h2>

      <p className="text-sm text-gray-600 mb-4">
        Use your fingerprint instead of typing your password each time you open the app. Your
        password always keeps working, and you can turn this off here at any time.
      </p>

      {enrolled ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-800">
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
          <span>This phone is set up. The option appears under the password box when you sign in.</span>
        </div>
      ) : status && !status.available ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{status.reason ?? 'Fingerprint sign-in is not available on this phone.'}</span>
        </div>
      ) : null}

      {note && <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{note}</p>}
      {problem && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          {problem} Your password still works as normal.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {enrolled ? (
          <button
            type="button"
            onClick={() => void disable()}
            disabled={busy}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-60"
          >
            {busy ? 'Working…' : 'Turn off fingerprint sign-in'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void enable()}
            // Deliberately NOT disabled when status.available is false. The
            // check happens on tap and reports the device's own reason —
            // a greyed-out button with no explanation is what sent somebody
            // looking for a setting that was staring at them.
            disabled={busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Setting up…' : 'Turn on fingerprint sign-in'}
          </button>
        )}

        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-60"
        >
          Re-check this phone
        </button>
      </div>
    </div>
  );
}
