'use client';

/**
 * Account recovery by one-time code.
 *
 * Built as three steps on one page rather than three pages, because the people
 * using it are locked out, often on a phone, often in a corridor, and every
 * navigation is a chance to lose the code they have just been sent.
 *
 * The code field is deliberately a numeric input with autocomplete="one-time-code":
 * on both Android and iOS that offers the code from the SMS above the keyboard,
 * so most users never type it at all.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { KeyRound, Smartphone, ShieldCheck, ArrowLeft, Loader2 } from 'lucide-react';

type Purpose = 'PASSWORD_RESET' | 'USERNAME_RECOVERY';
type Step = 'identify' | 'code' | 'password' | 'done';

export default function RecoverPage() {
  const router = useRouter();
  const [purpose, setPurpose] = useState<Purpose>('PASSWORD_RESET');
  const [step, setStep] = useState<Step>('identify');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ticket, setTicket] = useState('');
  const [username, setUsername] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // A visible countdown, so "wait" is a number rather than a guess.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const post = useCallback(async (url: string, payload: unknown) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, d };
  }, []);

  const requestCode = async () => {
    setBusy(true); setError(null); setNotice(null);
    const { ok, status, d } = await post('/api/auth/otp/request', { identifier, purpose });
    setBusy(false);
    if (!ok) {
      setError(d.error ?? 'That did not work. Please try again.');
      if (status === 429 && d.retryAfterSeconds) setCooldown(d.retryAfterSeconds);
      return;
    }
    setSentTo(d.sentTo ?? null);
    setNotice(d.message ?? null);
    setCooldown(60);
    setStep('code');
  };

  const verify = async () => {
    setBusy(true); setError(null);
    const { ok, d } = await post('/api/auth/otp/verify', { identifier, code, purpose });
    setBusy(false);
    if (!ok) { setError(d.error ?? 'That code is not valid.'); return; }
    if (purpose === 'USERNAME_RECOVERY') { setUsername(d.username); setStep('done'); return; }
    setTicket(d.ticket);
    setStep('password');
  };

  const reset = async () => {
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setBusy(true); setError(null);
    const { ok, d } = await post('/api/auth/otp/reset', { ticket, newPassword: password });
    setBusy(false);
    if (!ok) { setError(d.error ?? 'Your password could not be changed.'); return; }
    setUsername(d.username ?? '');
    setStep('done');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm">

        <div className="mb-5 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-blue-700" />
          <h1 className="text-lg font-bold text-gray-900">Recover your account</h1>
        </div>

        {step === 'identify' && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setPurpose('PASSWORD_RESET')}
                className={`rounded border px-3 py-2 text-sm ${purpose === 'PASSWORD_RESET' ? 'border-blue-600 bg-blue-50 font-semibold text-blue-800' : 'border-gray-300 text-gray-600'}`}>
                Forgot password
              </button>
              <button type="button" onClick={() => setPurpose('USERNAME_RECOVERY')}
                className={`rounded border px-3 py-2 text-sm ${purpose === 'USERNAME_RECOVERY' ? 'border-blue-600 bg-blue-50 font-semibold text-blue-800' : 'border-gray-300 text-gray-600'}`}>
                Forgot username
              </button>
            </div>

            <label className="mb-1 block text-sm font-medium text-gray-700">
              {purpose === 'USERNAME_RECOVERY' ? 'Your registered phone number' : 'Username or phone number'}
            </label>
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              inputMode={purpose === 'USERNAME_RECOVERY' ? 'tel' : 'text'}
              placeholder={purpose === 'USERNAME_RECOVERY' ? '08039133373' : 'your username, or 08039133373'}
              className="w-full rounded border border-gray-300 px-3 py-2.5 text-sm"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              A 6-digit code will be sent by SMS to the number registered on your account.
            </p>

            <button type="button" onClick={requestCode} disabled={busy || !identifier.trim() || cooldown > 0}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
              {cooldown > 0 ? `Wait ${cooldown}s` : 'Send me a code'}
            </button>
          </>
        )}

        {step === 'code' && (
          <>
            <p className="mb-3 text-sm text-gray-600">
              {sentTo
                ? <>We sent a 6-digit code to <strong>{sentTo}</strong>. It expires in 10 minutes.</>
                : notice}
            </p>
            <label className="mb-1 block text-sm font-medium text-gray-700">Enter the code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className="w-full rounded border border-gray-300 px-3 py-3 text-center text-2xl tracking-[0.4em] font-mono"
            />
            <button type="button" onClick={verify} disabled={busy || code.length !== 6}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Verify
            </button>
            <button type="button" onClick={requestCode} disabled={busy || cooldown > 0}
              className="mt-2 w-full rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 disabled:opacity-40">
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send another code'}
            </button>
          </>
        )}

        {step === 'password' && (
          <>
            <p className="mb-3 text-sm text-gray-600">Code accepted. Choose a new password.</p>
            <label className="mb-1 block text-sm font-medium text-gray-700">New password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="mb-3 w-full rounded border border-gray-300 px-3 py-2.5 text-sm" />
            <label className="mb-1 block text-sm font-medium text-gray-700">Confirm new password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2.5 text-sm" />
            <p className="mt-1.5 text-xs text-gray-500">At least 8 characters.</p>
            <button type="button" onClick={reset} disabled={busy || password.length < 8}
              className="mt-4 w-full rounded bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
              {busy ? 'Saving…' : 'Change my password'}
            </button>
          </>
        )}

        {step === 'done' && (
          <div className="text-center">
            <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-green-600" />
            {purpose === 'USERNAME_RECOVERY' ? (
              <>
                <p className="text-sm text-gray-600">Your username is</p>
                <p className="my-2 text-xl font-bold text-gray-900">{username}</p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-gray-900">Your password has been changed.</p>
                {username && <p className="mt-1 text-sm text-gray-600">Sign in as <strong>{username}</strong>.</p>}
              </>
            )}
            <button type="button" onClick={() => router.push('/auth/signin')}
              className="mt-5 w-full rounded bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white">
              Go to sign in
            </button>
          </div>
        )}

        {error && <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {step !== 'done' && (
          <div className="mt-5 border-t border-gray-100 pt-4">
            <Link href="/auth/signin" className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-3 w-3" /> Back to sign in
            </Link>
            {/* The 16 staff with no phone number on file can never be reached by
                SMS. Telling them where to go is kinder than a code that silently
                never arrives. */}
            <p className="mt-2 text-xs text-gray-500">
              No phone number on your account? Ask the Theatre Manager to reset it for you.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
