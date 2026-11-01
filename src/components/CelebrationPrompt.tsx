'use client';

/**
 * Asking a colleague, once, which days they would like marked.
 *
 * There is no record anywhere in this hospital of when the porters' birthdays
 * are, and an HR extract would not cover the two thirds of these days that are
 * not birthdays at all. The only source is the person, on a morning they are
 * already signing in.
 *
 * THE PROMPT TAKES "NO" AS A COMPLETE ANSWER, and records it, so that nobody
 * is asked twice. Plenty of people would rather their birthday were not
 * mentioned at work, and a prompt that keeps returning until it gets a date is
 * not asking, it is insisting.
 *
 * NO BIRTH YEAR IS REQUESTED. A birth year is an age, an age is not the
 * hospital's business, and a greeting does not need one. Anniversaries ask for
 * a starting year because "ten years today" is the whole point of those, and
 * it is optional there too.
 */

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Cake, Loader2, PartyPopper, Plus, Trash2 } from 'lucide-react';

const KINDS = [
  { value: 'BIRTHDAY', label: 'My birthday', hint: 'The day only — we never ask the year.' },
  { value: 'WEDDING_ANNIVERSARY', label: 'Wedding anniversary', hint: 'The year is optional.' },
  { value: 'WORK_ANNIVERSARY', label: 'Years of service', hint: 'The year you joined, if you would like it counted.' },
  { value: 'OTHER', label: 'Another special day', hint: 'Tell us what to call it.' },
] as const;

type Kind = (typeof KINDS)[number]['value'];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export interface CelebrationRow {
  id?: string;
  kind: Kind;
  label?: string | null;
  month: number;
  day: number;
  sinceYear?: number | null;
}

const blank = (): CelebrationRow => ({ kind: 'BIRTHDAY', month: 1, day: 1, label: '', sinceYear: null });

/**
 * The editor itself, used both inside the one-time prompt and on the page a
 * colleague can return to. One component, so the two can never disagree about
 * what is allowed.
 */
export function CelebrationEditor({
  rows,
  setRows,
  compact = false,
}: {
  rows: CelebrationRow[];
  setRows: (next: CelebrationRow[]) => void;
  compact?: boolean;
}) {
  const update = (i: number, patch: Partial<CelebrationRow>) => {
    const next = rows.slice();
    next[i] = { ...next[i], ...patch };
    // A day that does not exist in the chosen month is pulled back rather than
    // refused on save: somebody who picks 31 and then February meant the end
    // of February.
    const max = DAYS_IN_MONTH[next[i].month - 1] ?? 31;
    if (next[i].day > max) next[i].day = max;
    setRows(next);
  };

  const remove = (i: number) => setRows(rows.filter((_, j) => j !== i));

  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div
          key={r.id ?? `row-${i}`}
          className="rounded-xl border border-gray-200 bg-gray-50 p-3"
        >
          <div className="flex items-start gap-2">
            <select
              value={r.kind}
              onChange={(e) => update(i, { kind: e.target.value as Kind })}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm"
              aria-label="What kind of day"
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => remove(i)}
              className="rounded-lg p-2 text-gray-400 hover:bg-white hover:text-red-600"
              aria-label="Remove this day"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {r.kind === 'OTHER' && (
            <input
              type="text"
              value={r.label ?? ''}
              maxLength={60}
              placeholder="What should we call it? e.g. Ordination anniversary"
              onChange={(e) => update(i, { label: e.target.value })}
              className="mt-2 w-full rounded-lg border border-gray-300 px-2 py-2 text-sm"
            />
          )}

          <div className="mt-2 grid grid-cols-2 gap-2">
            <select
              value={r.month}
              onChange={(e) => update(i, { month: Number(e.target.value) })}
              className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm"
              aria-label="Month"
            >
              {MONTHS.map((m, idx) => (
                <option key={m} value={idx + 1}>{m}</option>
              ))}
            </select>
            <select
              value={r.day}
              onChange={(e) => update(i, { day: Number(e.target.value) })}
              className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm"
              aria-label="Day"
            >
              {Array.from({ length: DAYS_IN_MONTH[r.month - 1] ?? 31 }, (_, d) => d + 1).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {r.kind !== 'BIRTHDAY' && (
            <input
              type="number"
              value={r.sinceYear ?? ''}
              min={1900}
              max={new Date().getFullYear()}
              placeholder={r.kind === 'WORK_ANNIVERSARY' ? 'Year you joined (optional)' : 'Year (optional)'}
              onChange={(e) => update(i, {
                sinceYear: e.target.value ? Number(e.target.value) : null,
              })}
              className="mt-2 w-full rounded-lg border border-gray-300 px-2 py-2 text-sm"
            />
          )}

          {!compact && (
            <p className="mt-2 text-xs text-gray-500">
              {KINDS.find((k) => k.value === r.kind)?.hint}
            </p>
          )}
        </div>
      ))}

      {rows.length < 12 && (
        <button
          type="button"
          onClick={() => setRows(rows.concat([blank()]))}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-600 hover:border-primary-400 hover:text-primary-700"
        >
          <Plus className="h-4 w-4" />
          Add a day
        </button>
      )}
    </div>
  );
}

/** Save the list. Shared by the prompt and the page. */
export async function saveCelebrations(
  rows: CelebrationRow[],
  decline = false,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  const res = await fetch('/api/me/celebrations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      decline
        ? { decline: true }
        : {
          entries: rows.map((r) => ({
            kind: r.kind,
            label: r.kind === 'OTHER' ? (r.label ?? '').trim() : null,
            month: r.month,
            day: r.day,
            sinceYear: r.kind === 'BIRTHDAY' ? null : (r.sinceYear ?? null),
          })),
        },
    ),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.ok) return { ok: false, error: d.error ?? 'Could not save that just now.' };
  return { ok: true, message: d.message };
}

export default function CelebrationPrompt() {
  const { data: session } = useSession();
  const [ask, setAsk] = useState(false);
  const [rows, setRows] = useState<CelebrationRow[]>([blank()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/me/celebrations', { cache: 'no-store' });
        if (!res.ok) return;
        const d = await res.json();
        if (!cancelled && d.ask) setAsk(true);
      } catch {
        // Never block a dashboard on this.
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user]);

  const submit = useCallback(async (decline: boolean) => {
    setBusy(true);
    setError('');
    const res = await saveCelebrations(rows, decline).catch(() => ({
      ok: false as const, error: 'Could not save that just now.',
    }));
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Could not save that just now.');
      return;
    }
    setDone(res.message ?? 'Thank you.');
    // Left on screen for a moment so the answer is visibly received, then out
    // of the way — this is not what the person opened the app to do.
    setTimeout(() => setAsk(false), 1800);
  }, [rows]);

  if (!ask) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="celebration-title"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="rounded-full bg-primary-50 p-2 text-primary-700">
            <Cake className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="celebration-title" className="text-lg font-bold text-gray-900">
              Is there a day you would like us to mark?
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Your birthday, an anniversary, anything you would like remembered. We ask
              once. Nobody sees these days except theatre management, and you can change
              or remove them whenever you like.
            </p>
          </div>
        </div>

        {done ? (
          <div className="mt-5 flex items-center gap-2 rounded-xl bg-green-50 p-4 text-sm font-medium text-green-800">
            <PartyPopper className="h-5 w-5 shrink-0" />
            {done}
          </div>
        ) : (
          <>
            <div className="mt-5">
              <CelebrationEditor rows={rows} setRows={setRows} />
            </div>

            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

            <div className="mt-5 grid gap-2">
              <button
                type="button"
                disabled={busy || rows.length === 0}
                onClick={() => void submit(false)}
                className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Save my days
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void submit(true)}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                I would rather not be celebrated
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setAsk(false)}
                className="mt-1 text-center text-xs text-gray-500 underline hover:text-gray-700 disabled:opacity-60"
              >
                Ask me next time
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
