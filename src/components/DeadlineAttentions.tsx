'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, Gavel } from 'lucide-react';

/**
 * What somebody is being asked about, on their own dashboard.
 *
 * This replaces a disciplinary query arriving from the CMD's office. The tone
 * is deliberate: it says what is outstanding and offers three ways to deal
 * with it, one of which is simply telling us what went wrong. Nobody is
 * accused of anything, because at this stage nobody knows anything — the
 * commonest reason a theatre deadline slips is that the person was busy
 * operating.
 *
 * Renders nothing at all when there is nothing outstanding. A permanent empty
 * "Outstanding items (0)" panel is a small daily reminder that you are being
 * watched, and this should not feel like that.
 */

type Status = 'OPEN' | 'DELAY_LOGGED' | 'RESOLVED' | 'IN_AUDIT';

interface Item {
  id: string;
  subjectLabel: string;
  subjectType: string;
  deadlineAt: string;
  status: Status;
  delayReason: string | null;
}

export default function DeadlineAttentions() {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/deadline-attentions', { cache: 'no-store' });
      if (!res.ok) return;
      const d = await res.json();
      setItems(Array.isArray(d.items) ? d.items : []);
    } catch {
      // A dashboard panel that cannot load is not worth an error to somebody
      // about to start a list.
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = async (id: string, action: 'START' | 'DELAY' | 'RESOLVE') => {
    setBusy(id);
    setNote((n) => ({ ...n, [id]: '' }));
    try {
      const res = await fetch('/api/deadline-attentions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          action,
          ...(action === 'DELAY' ? { reason: draft[id] ?? '' } : {}),
          ...(action === 'RESOLVE' ? { resolution: draft[id] ?? '' } : {}),
        }),
      });
      const d = await res.json().catch(() => ({}));
      setNote((n) => ({ ...n, [id]: d.message ?? 'Could not record that just now.' }));
      if (d.ok) { setDraft((x) => ({ ...x, [id]: '' })); await load(); }
    } catch {
      setNote((n) => ({ ...n, [id]: 'Could not record that just now. Please try again.' }));
    } finally {
      setBusy(null);
    }
  };

  if (items.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold text-amber-900">
        <AlertTriangle className="h-4 w-4" />
        Needs your attention ({items.length})
      </h2>
      <p className="mt-0.5 text-xs text-amber-800">
        A theatre deadline passed without the case being taken. Tell us what happened —
        saying that something delayed it is enough to keep it out of Theatre Audit.
      </p>

      <div className="mt-3 space-y-3">
        {items.map((it) => {
          const inAudit = it.status === 'IN_AUDIT';
          const owesOutcome = it.status === 'DELAY_LOGGED';
          return (
            <div key={it.id} className="rounded-lg border border-amber-200 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{it.subjectLabel}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="h-3 w-3" />
                    Was required by {new Date(it.deadlineAt).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    inAudit
                      ? 'bg-slate-800 text-white'
                      : owesOutcome
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-amber-200 text-amber-900'
                  }`}
                >
                  {inAudit
                    ? 'Referred to Theatre Audit'
                    : owesOutcome
                      ? 'Explained — still needs an outcome'
                      : 'Needs your attention'}
                </span>
              </div>

              {it.delayReason && (
                <p className="mt-2 rounded bg-blue-50 px-2 py-1.5 text-xs text-blue-900">
                  <span className="font-semibold">You said:</span> {it.delayReason}
                </p>
              )}

              {inAudit && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-700">
                  <Gavel className="mt-0.5 h-3 w-3 shrink-0" />
                  This went to Theatre Audit after twelve hours. You may still be invited to
                  discuss it. Recording the outcome below is worth doing either way.
                </p>
              )}

              <textarea
                value={draft[it.id] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [it.id]: e.target.value }))}
                rows={2}
                className="mt-2 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-amber-500 focus:outline-none"
                placeholder={
                  owesOutcome || inAudit
                    ? 'How was it resolved? e.g. "Case ran at 14:30 in Theatre 5 once the leak was fixed."'
                    : 'What delayed it? e.g. "Operating on an earlier emergency; case moved to the afternoon."'
                }
              />

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy === it.id}
                  onClick={() => void act(it.id, 'START')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  <CheckCircle className="h-3.5 w-3.5" /> The case has started
                </button>

                {!owesOutcome && !inAudit && (
                  <button
                    type="button"
                    disabled={busy === it.id}
                    onClick={() => void act(it.id, 'DELAY')}
                    className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-60"
                  >
                    Record what delayed it
                  </button>
                )}

                <button
                  type="button"
                  disabled={busy === it.id}
                  onClick={() => void act(it.id, 'RESOLVE')}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                >
                  Record how it was resolved
                </button>
              </div>

              {note[it.id] && (
                <p className="mt-2 text-xs text-gray-700">{note[it.id]}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
