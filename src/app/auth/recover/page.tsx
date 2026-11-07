'use client';

/**
 * Account recovery: Staff ID number, then a code, then a new password, then
 * the username on screen.
 *
 * WHY THE STAFF ID IS THE FIRST THING ASKED FOR. This page used to open with
 * "Username or phone number". Somebody who has forgotten their username has
 * only the phone number left, and the phone number is held in this database in
 * half a dozen spellings, so the one they type is often not the one on file.
 * The Staff ID number is printed on the card in their pocket. It is the one
 * identifier a locked-out member of staff can read rather than remember.
 *
 * WHY A CODE IS STILL SENT. A Staff ID is not a secret: it is on a card, read
 * out at handover, shown on the staff screen inside this application, and
 * typed into the duty board. It says which account is being claimed; it cannot
 * say that the account belongs to whoever is typing. The code sent to the
 * registered phone is what does that. Without it, anybody who has seen a
 * colleague's ID card could take over their account.
 *
 * WHY THE USERNAME IS SHOWN AT THE END. Changing the password is useless to
 * somebody who has also forgotten what to type in the box above it. So the
 * last screen of the password flow names the username, in full, with a button
 * that copies it and a link into the sign-in page with it already filled in.
 *
 * Built as four steps on one page rather than four pages, because the people
 * using it are locked out, often on a phone, often in a corridor, and every
 * navigation is a chance to lose the code they have just been sent.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  KeyRound, Smartphone, ShieldCheck, ArrowLeft, Loader2, IdCard, Copy, Check,
} from 'lucide-react';

type Purpose = 'PASSWORD_RESET' | 'USERNAME_RECOVERY';
type Step = 'identify' | 'code' | 'password' | 'done';

/** What the person is being asked to type. */
type IdMode = 'STAFF_ID' | 'OTHER';

export default function RecoverPage() {
  const router = useRouter();
  const [purpose, setPurpose] = useState<Purpose>('PASSWORD_RESET');
  const [idMode, setIdMode] = useState<IdMode>('STAFF_ID');
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
  const [copied, setCopied] = useState(false);

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

  // Clipboard access fails on an http origin and in some embedded browsers.
  // A failure must not look like a crash: the username is on the screen in
  // selectable text either way, which is the thing that actually matters.
  const copyUsername = async () => {
    try {
      await navigator.clipboard.writeText(username);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  /** Where "sign in" goes, with the username already in the box. */
  const signInHref = username
    ? `/auth/login?u=${encodeURIComponent(username)}`
    : '/auth/login';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm">

        <div className="mb-5 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-blue-700" />
          <h1 className="text-lg font-bold text-gray-900">Recover your account</h1>
        </div>

        {step === 'identify' && (
          <>
            {/* The first button covers the common case, which is both at once:
                somebody who cannot remember the password usually cannot
                remember the username either, and that flow ends by naming it.
                The second exists so a person who only needs reminding is not
                made to change a password they still know. */}
            <div className="mb-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setPurpose('PASSWORD_RESET')}
                className={`rounded border px-3 py-2 text-sm ${purpose === 'PASSWORD_RESET' ? 'border-blue-600 bg-blue-50 font-semibold text-blue-800' : 'border-gray-300 text-gray-600'}`}>
                Forgot password<span className="block text-[11px] font-normal">(or both)</span>
              </button>
              <button type="button" onClick={() => setPurpose('USERNAME_RECOVERY')}
                className={`rounded border px-3 py-2 text-sm ${purpose === 'USERNAME_RECOVERY' ? 'border-blue-600 bg-blue-50 font-semibold text-blue-800' : 'border-gray-300 text-gray-600'}`}>
                Forgot username<span className="block text-[11px] font-normal">only</span>
              </button>
            </div>

            {purpose === 'PASSWORD_RESET' && (
              <p className="mb-4 rounded bg-blue-50 px-3 py-2 text-xs text-blue-900">
                You will set a new password, and this page will show you your
                username at the end.
              </p>
            )}

            <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <IdCard className="h-4 w-4 text-gray-400" />
              {idMode === 'STAFF_ID'
                ? 'Your Staff ID number'
                : 'Your phone number or username'}
            </label>
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder={idMode === 'STAFF_ID' ? 'e.g. UNTH/1234' : '08039133373, or your username'}
              className="w-full rounded border border-gray-300 px-3 py-2.5 text-sm"
            />

            {idMode === 'STAFF_ID' ? (
              <p className="mt-1.5 text-xs text-gray-500">
                The number on your hospital ID card. If you log your duties with
                a code instead, that code works here too.
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-gray-500">
                The phone number must be the one registered on your account.
              </p>
            )}

            {/* The endpoint accepts all four kinds whatever is selected here;
                this switch only changes what the person is told to type, so
                nobody is turned away for having guessed the wrong box. */}
            <button type="button"
              onClick={() => { setIdMode(idMode === 'STAFF_ID' ? 'OTHER' : 'STAFF_ID'); setError(null); }}
              className="mt-2 text-xs font-medium text-blue-700 underline">
              {idMode === 'STAFF_ID'
                ? 'I do not know my Staff ID — use my phone number instead'
                : 'Use my Staff ID number instead'}
            </button>

            <p className="mt-3 text-xs text-gray-500">
              A 6-digit code will be sent by SMS to the number registered on
              your account, to confirm it is you.
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
            <p className="mb-3 text-sm text-gray-600">
              Code accepted. Choose a new password — your username is shown on
              the next screen.
            </p>
            <label className="mb-1 block text-sm font-medium text-gray-700">New password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="mb-3 w-full rounded border border-gray-300 px-3 py-2.5 text-sm" />
            <label className="mb-1 block text-sm font-medium text-gray-700">Confirm new password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
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

            {purpose === 'PASSWORD_RESET' && (
              <p className="mb-3 text-sm font-semibold text-gray-900">
                Your password has been changed.
              </p>
            )}

            {/* Named, not mentioned. This is the half of the problem the old
                screen left unanswered: a new password is no use to somebody
                who cannot remember what goes in the box above it. */}
            {username ? (
              <>
                <p className="text-sm text-gray-600">Your username is</p>
                <p className="my-2 break-all text-2xl font-bold tracking-wide text-gray-900">
                  {username}
                </p>
                <button type="button" onClick={copyUsername}
                  className="mx-auto flex items-center gap-1.5 rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700">
                  {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy username'}
                </button>
                <p className="mt-3 text-xs text-gray-500">
                  Write it down. You sign in with this, not with your Staff ID
                  number.
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-600">Sign in with your usual username.</p>
            )}

            <button type="button" onClick={() => router.push(signInHref)}
              className="mt-5 w-full rounded bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white">
              Go to sign in
            </button>
          </div>
        )}

        {error && <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {step !== 'done' && (
          <div className="mt-5 border-t border-gray-100 pt-4">
            <Link href="/auth/login" className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-3 w-3" /> Back to sign in
            </Link>
            {/* The 20 approved staff with no phone number on file can never be
                reached by SMS, whatever they type here. Telling them where to
                go is kinder than a code that silently never arrives. */}
            <p className="mt-2 text-xs text-gray-500">
              No phone number on your account? Ask the Theatre Manager to reset
              it for you.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
