'use client';

/**
 * Account recovery: Staff ID number, then the username, then a new password.
 *
 * NO ONE-TIME CODE. Instructed on 7 November, after the code was put forward
 * as the thing proving the person asking owned the account:
 *
 *   "modify such that once the user inputs the staff id number he can set a
 *    new password without need for the 6 digit sms code"
 *
 * The consequence is written out in full at the top of
 * /api/auth/staff-id-reset and is not repeated here, except for the part that
 * belongs on the screen: whoever holds a Staff ID number holds that account.
 * The screen therefore says, in plain words, that a message goes to the
 * registered phone the moment a password changes — so a staff member who did
 * not ask for it knows within minutes rather than never.
 *
 * WHY THE STAFF ID IS WHAT IS ASKED FOR. This page used to open with
 * "Username or phone number". Somebody who has forgotten their username has
 * only the phone number left, and the phone number is held in this database in
 * half a dozen spellings, so the one they type is often not the one on file.
 * The Staff ID number is printed on the card in their pocket: the one
 * identifier a locked-out member of staff can read rather than remember.
 *
 * WHY THE USERNAME IS NAMED BEFORE THE PASSWORD IS SET. Changing the password
 * is useless to somebody who has also forgotten what to type in the box above
 * it, and somebody who only needed the username can stop at that screen
 * without changing a password they still know.
 */

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  KeyRound, ShieldCheck, ArrowLeft, Loader2, IdCard, Copy, Check, Search,
} from 'lucide-react';

type Step = 'identify' | 'confirm' | 'password' | 'done';

/** What the person is being asked to type. */
type IdMode = 'STAFF_ID' | 'OTHER';

interface Found {
  fullName: string;
  username: string;
  willNotifyPhone: boolean;
}

export default function RecoverPage() {
  const router = useRouter();
  const [idMode, setIdMode] = useState<IdMode>('STAFF_ID');
  const [step, setStep] = useState<Step>('identify');
  const [identifier, setIdentifier] = useState('');
  const [found, setFound] = useState<Found | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [changed, setChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const post = useCallback(async (payload: unknown) => {
    const r = await fetch('/api/auth/staff-id-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, d };
  }, []);

  const lookUp = async () => {
    setBusy(true); setError(null);
    const { ok, d } = await post({ identifier: identifier.trim() });
    setBusy(false);
    if (!ok) { setError(d.error ?? 'That did not work. Please try again.'); return; }
    setFound({
      fullName: d.fullName,
      username: d.username,
      willNotifyPhone: Boolean(d.willNotifyPhone),
    });
    setStep('confirm');
  };

  const reset = async () => {
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setBusy(true); setError(null);
    const { ok, d } = await post({ identifier: identifier.trim(), newPassword: password });
    setBusy(false);
    if (!ok) { setError(d.error ?? 'Your password could not be changed.'); return; }
    setChanged(true);
    setStep('done');
  };

  // Clipboard access fails on an http origin and in some embedded browsers.
  // A failure must not look like a crash: the username is on the screen in
  // selectable text either way, which is the thing that actually matters.
  const copyUsername = async () => {
    try {
      await navigator.clipboard.writeText(found?.username ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  /** Where "sign in" goes, with the username already in the box. */
  const signInHref = found?.username
    ? `/auth/login?u=${encodeURIComponent(found.username)}`
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
            <p className="mb-4 rounded bg-blue-50 px-3 py-2 text-xs text-blue-900">
              Enter your Staff ID number. This page will show you your username,
              and let you set a new password.
            </p>

            <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <IdCard className="h-4 w-4 text-gray-400" />
              {idMode === 'STAFF_ID'
                ? 'Your Staff ID number'
                : 'Your phone number or username'}
            </label>
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && identifier.trim()) lookUp(); }}
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

            <button type="button" onClick={lookUp} disabled={busy || !identifier.trim()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Find my account
            </button>
          </>
        )}

        {step === 'confirm' && found && (
          <>
            {/* The name is shown so a mistyped digit is caught here, by the
                person, rather than by a colleague discovering their password
                has changed. */}
            <p className="text-xs text-gray-500">This account</p>
            <p className="mb-3 text-base font-semibold text-gray-900">{found.fullName}</p>

            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-3 text-center">
              <p className="text-xs text-gray-600">Your username is</p>
              <p className="my-1 break-all text-xl font-bold tracking-wide text-gray-900">
                {found.username}
              </p>
              <button type="button" onClick={copyUsername}
                className="mx-auto flex items-center gap-1.5 rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700">
                {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy username'}
              </button>
            </div>

            <button type="button" onClick={() => { setStep('password'); setError(null); }}
              className="mt-4 w-full rounded bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white">
              Set a new password
            </button>
            {/* Somebody who only forgot the username stops here rather than
                being made to change a password they still know. */}
            <button type="button" onClick={() => setStep('done')}
              className="mt-2 w-full rounded border border-gray-300 px-4 py-2 text-sm text-gray-700">
              That is all I needed
            </button>
            <button type="button"
              onClick={() => { setStep('identify'); setFound(null); setError(null); }}
              className="mt-3 w-full text-xs text-gray-500 underline">
              That is not me — try another number
            </button>
          </>
        )}

        {step === 'password' && found && (
          <>
            <p className="mb-1 text-xs text-gray-500">Setting a new password for</p>
            <p className="mb-3 text-sm font-semibold text-gray-900">
              {found.fullName} <span className="font-normal text-gray-500">({found.username})</span>
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

            {/* Said on the screen, not buried in a policy. The code was removed
                by instruction; what replaces it is that the owner of the
                account finds out immediately. */}
            {found.willNotifyPhone && (
              <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-900">
                A message will be sent to the phone number registered on this
                account to say the password has been changed.
              </p>
            )}

            <button type="button" onClick={reset} disabled={busy || password.length < 8}
              className="mt-4 w-full rounded bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
              {busy ? 'Saving…' : 'Change my password'}
            </button>
          </>
        )}

        {step === 'done' && (
          <div className="text-center">
            <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-green-600" />

            {changed && (
              <p className="mb-3 text-sm font-semibold text-gray-900">
                Your password has been changed.
              </p>
            )}

            {found?.username ? (
              <>
                <p className="text-sm text-gray-600">Your username is</p>
                <p className="my-2 break-all text-2xl font-bold tracking-wide text-gray-900">
                  {found.username}
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
            <p className="mt-2 text-xs text-gray-500">
              Staff ID not on file? Ask the Theatre Manager to add it, or to
              reset your password for you.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
