'use client';

/**
 * "I am here and I cannot start."
 *
 * Sits on a case. Goes amber and starts asking once the case is genuinely
 * overdue — five minutes past a scheduled start, or an hour after an emergency
 * was booked — and is available quietly before that, because somebody who
 * already knows the case cannot run should never be told it is too early to
 * say so.
 *
 * Written to be usable one-handed, standing in a theatre, by somebody who is
 * annoyed. Big targets, a fixed list of reasons, and nothing compulsory except
 * the reason itself.
 */

import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, CheckCircle2, X } from 'lucide-react';
import {
  BLOCKER_REASONS,
  CASE_OUTCOMES,
  reportingWindow,
  type CaseOutcome,
} from '@/lib/caseBlockers';

interface Props {
  surgeryId: string;
  surgeryType: string;
  status: string;
  /** ISO instant of the scheduled start, or null. */
  scheduledStart?: string | null;
  /** ISO instant the case was booked. */
  bookedAt: string;
  onReported?: () => void;
}

export default function ReportBlockerButton({
  surgeryId,
  surgeryType,
  status,
  scheduledStart,
  bookedAt,
  onReported,
}: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [outcome, setOutcome] = useState<CaseOutcome>('PENDING');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const win = useMemo(
    () =>
      reportingWindow({
        surgeryType,
        scheduledStart: scheduledStart ? new Date(scheduledStart) : null,
        bookedAt: new Date(bookedAt),
        status,
      }),
    [surgeryType, scheduledStart, bookedAt, status],
  );

  const submit = useCallback(async () => {
    if (!reason) { setError('Choose what is stopping the case.'); return; }
    if (reason === 'OTHER' && !detail.trim()) {
      setError('You chose Other — say what is stopping it.');
      return;
    }
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/case-blockers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surgeryId, reason, detail: detail.trim(), outcome }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? 'That could not be recorded.'); return; }
      setDone(true);
      onReported?.();
      setTimeout(() => { setOpen(false); setDone(false); setReason(''); setDetail(''); }, 1600);
    } catch {
      setError('That could not be recorded. Check your connection.');
    } finally {
      setBusy(false);
    }
  }, [surgeryId, reason, detail, outcome, onReported]);

  // A closed case cannot be blocked, so the control disappears entirely rather
  // than sitting there disabled and inviting a tap.
  if (['COMPLETED', 'CANCELLED'].includes(status)) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold border transition ${
          win.prompt
            ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
        }`}
        title={win.message}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        {win.prompt ? 'Why has this not started?' : 'Report a blocker'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-gray-100 bg-white px-4 py-3">
              <div>
                <h2 className="text-base font-bold text-gray-900">What is stopping this case?</h2>
                <p className="mt-0.5 text-xs text-gray-500">{win.message}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {done ? (
              <div className="p-8 text-center">
                <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-600" />
                <p className="font-semibold text-gray-900">Recorded.</p>
                <p className="mt-1 text-sm text-gray-600">
                  The theatre manager has been told. You do not need to telephone anybody.
                </p>
              </div>
            ) : (
              <div className="p-4">
                <fieldset>
                  <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    The reason
                  </legend>
                  <div className="grid gap-1.5">
                    {BLOCKER_REASONS.map((r) => (
                      <label
                        key={r.code}
                        className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${
                          reason === r.code
                            ? 'border-blue-600 bg-blue-50 font-medium text-blue-900'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="blocker-reason"
                          value={r.code}
                          checked={reason === r.code}
                          onChange={(e) => setReason(e.target.value)}
                          className="h-4 w-4"
                        />
                        {r.label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="mt-3 block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Anything else worth knowing{reason === 'OTHER' ? '' : ' (optional)'}
                  </span>
                  <textarea
                    value={detail}
                    onChange={(e) => setDetail(e.target.value)}
                    rows={2}
                    placeholder="e.g. scrub nurse is covering Theatre 2, no one else free"
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>

                <label className="mt-3 block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    What has happened to the case?
                  </span>
                  <select
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value as CaseOutcome)}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2.5 text-sm"
                  >
                    {CASE_OUTCOMES.map((o) => (
                      <option key={o.code} value={o.code}>{o.label}</option>
                    ))}
                  </select>
                  {/* Choosing Cancelled here cancels the case. Say so before
                      they choose it, not after. */}
                  {outcome === 'CANCELLED' && (
                    <span className="mt-1 block text-xs text-red-700">
                      This will cancel the case on the list.
                    </span>
                  )}
                  {outcome === 'COMPLETED' && (
                    <span className="mt-1 block text-xs text-green-700">
                      This will mark the case completed.
                    </span>
                  )}
                </label>

                {error && <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

                <button
                  type="button"
                  onClick={submit}
                  disabled={busy}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                  Report it
                </button>
                <p className="mt-2 text-center text-[11px] text-gray-500">
                  Goes to the theatre manager with your name on it. Reporting a delay is
                  not a complaint — it is the only way the reason ever gets fixed.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
