'use client';

// ============================================================
// "You are on a case today. Are you here?"
// ------------------------------------------------------------
// Asked for on 6 November: somebody signing in is shown a dialogue, if and
// only if their name is on a case booked for today, asking them to indicate
// their availability — with their location read, and with a plain warning
// if it is refused that their availability cannot be confirmed and may be
// treated as absence.
//
// WHY A DIALOGUE WHEN A CARD ALREADY EXISTS. TeamCheckInCard has sat at the
// top of every dashboard since the check-in board was built, and it gets
// scrolled past, because a panel on a page is something you go around on
// the way to what you came for. The people whose answer the theatre needs
// at 07:40 are the least likely to stop for it. This asks once, in front of
// the page, at the moment they have just arrived and signed in.
//
// IT APPEARS FOR ALMOST NOBODY, WHICH IS THE POINT. No cases today, or
// every case already answered, and it renders nothing at all. A dialogue
// that greets everybody every morning is one that gets dismissed unread
// within a week, and then it is useless on the morning it mattered.
//
// THE LOCATION IS ASKED FOR IMMEDIATELY, before any answer is given, so the
// browser's permission prompt and the hospital's warning are both in front
// of the person while they are deciding — not sprung on them afterwards.
// Refusing does not block the answer: see the long note in
// src/lib/theatreOps/arrivalPrompt.ts for why a gate here would produce no
// data rather than better data.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { MapPin, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { requestFix, type CapturedFix } from '@/lib/geo/requestFix';
import {
  ARRIVAL_ANSWERS, answerProblem, locationNotice, unanswered,
  type ArrivalAnswerKey, type MyCase,
} from '@/lib/theatreOps/arrivalPrompt';

/** Shown once per browser tab. Dismissing brings it back on the next load. */
let dismissedThisSession = false;

export default function ArrivalAvailabilityPrompt() {
  const [cases, setCases] = useState<MyCase[]>([]);
  const [open, setOpen] = useState(false);
  const [fix, setFix] = useState<CapturedFix | null>(null);
  const [locating, setLocating] = useState(false);
  const [answer, setAnswer] = useState<ArrivalAnswerKey | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (dismissedThisSession) return;
    try {
      const res = await fetch('/api/me/arrival-check-in', { cache: 'no-store' });
      if (!res.ok) return;
      const d = await res.json();
      const mine: MyCase[] = Array.isArray(d.cases) ? d.cases : [];
      setCases(mine);
      if (unanswered(mine).length > 0) setOpen(true);
    } catch {
      // A prompt that cannot load its cases simply does not appear. It must
      // never be the reason a dashboard looks broken.
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Ask the handset where it is as soon as the dialogue opens, so the
  // browser's own permission prompt and the warning below are in front of
  // the person while they decide — not after they have answered.
  useEffect(() => {
    if (!open || fix || locating) return;
    setLocating(true);
    void requestFix().then((f) => {
      setFix(f);
      setLocating(false);
    });
  }, [open, fix, locating]);

  const todo = unanswered(cases).filter((c) => !done.includes(`${c.kind}:${c.id}`));

  const send = async () => {
    const problem = answerProblem(answer, reason);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      const results = await Promise.all(todo.map(async (c) => {
        const res = await fetch('/api/me/arrival-check-in', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: c.kind,
            id: c.id,
            answer,
            reason: reason.trim() || undefined,
            deviceLabel: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
            fix: fix ?? undefined,
          }),
        });
        return { key: `${c.kind}:${c.id}`, ok: res.ok };
      }));
      const saved = results.filter((r) => r.ok).map((r) => r.key);
      setDone((d) => [...d, ...saved]);
      if (saved.length < results.length) {
        setError('Some of your cases could not be recorded. Try again, or use the check-in board.');
        return;
      }
      setOpen(false);
    } catch {
      setError('Network error. Your answer was not recorded.');
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    dismissedThisSession = true;
    setOpen(false);
  };

  if (!open || todo.length === 0) return null;

  const notice = locationNotice(fix);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-3 flex items-start justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            You are on {todo.length === 1 ? 'a case' : `${todo.length} cases`} today
          </h2>
          <button onClick={close} aria-label="Not now" className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-3 text-sm text-gray-600">
          Say whether you are here, before the theatre finds out by waiting.
        </p>

        <ul className="mb-4 space-y-1.5">
          {todo.map((c) => (
            <li
              key={`${c.kind}:${c.id}`}
              className={`rounded-lg border p-2.5 text-sm ${
                c.kind === 'EMERGENCY'
                  ? 'border-red-200 bg-red-50 text-red-900'
                  : 'border-gray-200 bg-gray-50 text-gray-800'
              }`}
            >
              <span className="font-medium">{c.label}</span>
              {c.myRole && <span className="block text-xs opacity-80">You are the {c.myRole}</span>}
            </li>
          ))}
        </ul>

        {/* The location, and the hospital's warning if there is none. */}
        <div
          className={`mb-4 rounded-lg border p-3 text-xs ${
            locating
              ? 'border-gray-200 bg-gray-50 text-gray-600'
              : notice.tone === 'ok'
                ? 'border-green-200 bg-green-50 text-green-900'
                : 'border-amber-300 bg-amber-50 text-amber-900'
          }`}
        >
          <p className="flex items-center gap-2 font-semibold">
            {locating
              ? <><MapPin className="h-4 w-4" /> Reading your location…</>
              : notice.tone === 'ok'
                ? <><CheckCircle2 className="h-4 w-4" /> {notice.title}</>
                : <><AlertTriangle className="h-4 w-4" /> {notice.title}</>}
          </p>
          {!locating && <p className="mt-1">{notice.detail}</p>}
        </div>

        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {ARRIVAL_ANSWERS.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => { setAnswer(a.key); setError(null); }}
              className={`rounded-xl border-2 px-3 py-2.5 text-left text-sm font-semibold ${
                answer === a.key
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                  : 'border-gray-200 text-gray-700 hover:border-emerald-300'
              }`}
            >
              {a.label}
              <span className="block text-xs font-normal text-gray-500">{a.hint}</span>
            </button>
          ))}
        </div>

        {answer === 'NOT_AVAILABLE' && (
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="mb-3 w-full rounded-lg border p-2 text-sm"
            placeholder="Why — one line is enough, so somebody can be found"
          />
        )}

        {error && (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/dashboard/theatre-ops/check-in"
            onClick={close}
            className="text-xs font-semibold text-gray-500 underline hover:text-gray-700"
          >
            Open the full check-in board
          </Link>
          <div className="flex gap-2">
            <button
              onClick={close}
              disabled={busy}
              className="rounded-xl bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300 disabled:opacity-50"
            >
              Not now
            </button>
            <button
              onClick={send}
              disabled={busy || !answer}
              className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy
                ? 'Recording…'
                : todo.length === 1 ? 'Record my status' : `Record for all ${todo.length}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
