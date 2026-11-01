'use client';

/**
 * The days I would like marked.
 *
 * The sign-in prompt asks once; this is where somebody comes back to it —
 * after a wedding, after a change of mind, or because they pressed "ask me
 * next time" three mornings running. Same editor, same endpoint, so the two
 * cannot disagree about what is allowed.
 */

import { useCallback, useEffect, useState } from 'react';
import { Cake, Check, Loader2, ShieldCheck } from 'lucide-react';
import {
  CelebrationEditor, saveCelebrations, type CelebrationRow,
} from '@/components/CelebrationPrompt';

export default function MyCelebrationsPage() {
  const [rows, setRows] = useState<CelebrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/me/celebrations', { cache: 'no-store' });
      const d = await res.json();
      setRows((d.celebrations ?? []).map((c: CelebrationRow) => ({
        id: c.id,
        kind: c.kind,
        label: c.label ?? '',
        month: c.month,
        day: c.day,
        sinceYear: c.sinceYear ?? null,
      })));
    } catch {
      setError('Could not load your days just now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submit = async (decline: boolean) => {
    setBusy(true);
    setError('');
    setSaved('');
    const res = await saveCelebrations(rows, decline).catch(() => ({
      ok: false as const, error: 'Could not save that just now.',
    }));
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Could not save that just now.');
      return;
    }
    setSaved(res.message ?? 'Saved.');
    if (decline) setRows([]);
  };

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="rounded-full bg-primary-50 p-2.5 text-primary-700">
          <Cake className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-gray-900">My special days</h1>
          <p className="mt-1 text-sm text-gray-600">
            Days you would like theatre management to mark. Your birthday, an
            anniversary, years of service, or anything else that matters to you.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl bg-blue-50 p-3 text-xs text-blue-900">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Only theatre management sees these, and only so that somebody can send you a
          message on the day. We never ask for your year of birth. Remove a day at any
          time and nothing further will be sent for it.
        </p>
      </div>

      <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        {loading ? (
          <p className="flex items-center gap-2 py-6 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your days…
          </p>
        ) : (
          <CelebrationEditor rows={rows} setRows={setRows} />
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {saved && (
          <p className="mt-3 flex items-center gap-2 text-sm font-medium text-green-700">
            <Check className="h-4 w-4" /> {saved}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || loading}
            onClick={() => void submit(false)}
            className="flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
          <button
            type="button"
            disabled={busy || loading}
            onClick={() => void submit(true)}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            I would rather not be celebrated
          </button>
        </div>
      </div>
    </div>
  );
}
