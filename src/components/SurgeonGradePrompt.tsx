'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Stethoscope } from 'lucide-react';

/**
 * Asks a surgeon, once, whether they are a consultant or a resident.
 *
 * Nearly every surgeon on this system is filed under the undifferentiated
 * SURGEON role, so the schedule cannot show who is supervising whom. There is
 * no record anywhere to derive this from — the only way to know is to ask the
 * person, on a day they are already signing in.
 *
 * Deliberately NOT dismissible by clicking away: an answer either way takes
 * one tap and is then never asked again, whereas a prompt that can be
 * accidentally dismissed gets accidentally dismissed 194 times. There is still
 * a way past it — "Ask me later" — because a surgeon opening this at the start
 * of a list must never be held up by an administrative question.
 */

export default function SurgeonGradePrompt() {
  const { data: session, update } = useSession();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/me/surgeon-grade', { cache: 'no-store' });
        if (!res.ok) return;
        const d = await res.json();
        if (!cancelled && d.ask) setAsk(true);
      } catch {
        // Never block a dashboard on this.
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user]);

  const choose = async (grade: 'CONSULTANT' | 'RESIDENT') => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/me/surgeon-grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) {
        setError(d.error ?? 'Could not save that just now. Please try again.');
        return;
      }
      setAsk(false);
      // The JWT still says SURGEON. Refresh it, or the menu keeps hiding
      // what the new role has just unlocked until the next sign-in.
      if (d.refreshSession) {
        try { await update(); } catch { /* the role is saved either way */ }
      }
    } catch {
      setError('Could not save that just now. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!ask) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="surgeon-grade-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="rounded-full bg-primary-50 p-2 text-primary-700">
            <Stethoscope className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="surgeon-grade-title" className="text-lg font-bold text-gray-900">
              Which grade are you?
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              We ask once, so the theatre schedule can show who is operating and who is
              supervising. You can change it later with an administrator.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void choose('CONSULTANT')}
            className="rounded-xl border-2 border-primary-200 bg-primary-50 px-4 py-3 text-left transition hover:border-primary-400 disabled:opacity-60"
          >
            <span className="block text-sm font-bold text-primary-900">Consultant Surgeon</span>
            <span className="mt-0.5 block text-xs text-primary-700">
              You supervise lists and take responsibility for cases.
            </span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => void choose('RESIDENT')}
            className="rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-left transition hover:border-gray-400 disabled:opacity-60"
          >
            <span className="block text-sm font-bold text-gray-900">Resident Surgeon</span>
            <span className="mt-0.5 block text-xs text-gray-600">
              Registrar, senior registrar or trainee operating under supervision.
            </span>
          </button>
        </div>

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

        <button
          type="button"
          disabled={busy}
          onClick={() => setAsk(false)}
          className="mt-4 w-full text-center text-xs text-gray-500 underline hover:text-gray-700 disabled:opacity-60"
        >
          Ask me next time
        </button>
      </div>
    </div>
  );
}
