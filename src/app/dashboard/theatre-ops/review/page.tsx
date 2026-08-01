'use client';

// ============================================================
// Quality Assurance — reviewing flagged cases
// ------------------------------------------------------------
// The detector says a case ran late with nothing recorded. This screen is
// where a person decides what that means, and it is deliberately built to slow
// that decision down rather than speed it up.
//
// There is no "guilty" button. The three outcomes are: nothing to answer for,
// the theatre was let down by something outside its control, or this needs a
// conversation. Whether a delay was avoidable is a separate, optional judgement
// a reviewer makes after reading the case — never inferred from a category or
// a timer, and set nowhere else in the system.
//
// Where a reason WAS recorded but arrived after the threshold, the screen says
// so prominently. A theatre that explained itself at fifty minutes documented
// the problem; it was simply late doing so, and that is a different matter
// from one that never said anything.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Gavel, Inbox, RefreshCw, ShieldQuestion } from 'lucide-react';

interface DelayRecord {
  categoryCode: string;
  narrative: string;
  recordedAt: string;
  reportedByName: string | null;
}

interface FlaggedCase {
  id: string;
  minutesLate: number;
  isEmergency: boolean;
  reviewStatus: string;
  reviewNotes: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  judgedAvoidable: boolean | null;
  detectedAt: string;
  explainedLate: boolean;
  surgery: {
    id: string;
    procedureName: string | null;
    scheduledDate: string;
    scheduledTime: string | null;
    surgeryType: string;
    unit: string | null;
    location: string | null;
    surgeonName: string | null;
    delayRecords: DelayRecord[];
  };
}

const OUTCOMES = [
  { value: 'REVIEWED_NO_ACTION', label: 'Nothing to answer for', hint: 'Looked at; the theatre acted reasonably.' },
  { value: 'REVIEWED_SYSTEM_ISSUE', label: 'A system failure', hint: 'The theatre was let down by something outside its control.' },
  { value: 'REVIEWED_REFERRED', label: 'Refer for a conversation', hint: 'Needs discussion the software has no business having.' },
];

const STATUS_LABEL: Record<string, string> = {
  PENDING_REVIEW: 'Awaiting review',
  REVIEWED_NO_ACTION: 'Nothing to answer for',
  REVIEWED_SYSTEM_ISSUE: 'System failure',
  REVIEWED_REFERRED: 'Referred',
};

export default function QaReviewPage() {
  const [cases, setCases] = useState<FlaggedCase[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [status, setStatus] = useState('PENDING_REVIEW');
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [reviewing, setReviewing] = useState<FlaggedCase | null>(null);
  const [outcome, setOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const [avoidable, setAvoidable] = useState<'unset' | 'yes' | 'no'>('unset');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/theatre-ops/unexplained?status=${status}`);
      if (res.status === 401 || res.status === 403) {
        const b = await res.json().catch(() => ({}));
        setDenied(true);
        setError(b.error || 'Flagged cases are reviewed by management and Quality Assurance.');
        return;
      }
      if (!res.ok) throw new Error();
      const d = await res.json();
      setDenied(false);
      setCases(d.cases ?? []);
      setTotals(d.totals ?? {});
    } catch {
      setError('Could not load the review queue.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!reviewing || !outcome) { setNotice('Choose an outcome.'); return; }
    if (notes.trim().length < 10) { setNotice('Record what the committee concluded, and why.'); return; }

    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/theatre-ops/unexplained', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: reviewing.id,
          outcome,
          notes: notes.trim(),
          ...(avoidable === 'unset' ? {} : { judgedAvoidable: avoidable === 'yes' }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setNotice(data.error || 'That could not be recorded.'); return; }
      setNotice('Review recorded.');
      setReviewing(null);
      setOutcome('');
      setNotes('');
      setAvoidable('unset');
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (denied) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <div><p className="font-semibold text-amber-900">Not available to your role</p><p className="text-sm text-amber-800">{error}</p></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-100">
            <Gavel className="h-6 w-6 text-primary-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Quality Assurance Review</h1>
            <p className="text-sm text-gray-500">
              Cases that ran late with nothing recorded. {totals.pending ?? 0} awaiting review.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="PENDING_REVIEW">Awaiting review</option>
            <option value="ALL">All</option>
            <option value="REVIEWED_NO_ACTION">Nothing to answer for</option>
            <option value="REVIEWED_SYSTEM_ISSUE">System failure</option>
            <option value="REVIEWED_REFERRED">Referred</option>
          </select>
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      <p className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-900">
        <ShieldQuestion className="mt-0.5 h-4 w-4 flex-shrink-0" />
        A flag says a CASE ran late with nothing recorded. It names nobody and concludes nothing. Whether a
        delay was avoidable is a judgement made here, by people, after reading the case.
      </p>

      {notice && <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">{notice}</div>}
      {error && !denied && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>}

      {cases.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <Inbox className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm text-gray-600">
            {loading ? 'Loading…' : status === 'PENDING_REVIEW' ? 'Nothing is awaiting review.' : 'No cases match.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {cases.map((c) => (
            <div key={c.id} className={`rounded-xl border p-4 ${c.reviewStatus === 'PENDING_REVIEW' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{c.surgery.procedureName ?? 'Procedure not named'}</p>
                  <p className="text-xs text-gray-600">
                    {new Date(c.surgery.scheduledDate).toLocaleDateString('en-GB')}
                    {c.surgery.scheduledTime ? ` · due ${c.surgery.scheduledTime}` : ''}
                    {c.surgery.location ? ` · ${c.surgery.location}` : ''}
                    {c.surgery.unit ? ` · ${c.surgery.unit}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <span className="block text-sm font-semibold text-gray-900">{c.minutesLate} min late</span>
                  <span className="block text-[11px] text-gray-500">{STATUS_LABEL[c.reviewStatus] ?? c.reviewStatus}</span>
                </div>
              </div>

              {c.isEmergency && (
                <p className="mt-1.5 text-xs font-semibold text-red-700">
                  Emergency case — measured from booking, not a scheduled time.
                </p>
              )}

              {/* A reason that arrived late is materially different from none. */}
              {c.explainedLate ? (
                <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-2">
                  <p className="text-xs font-medium text-blue-900">
                    A reason WAS recorded, after the threshold. The theatre documented the problem — late.
                  </p>
                  {c.surgery.delayRecords.map((d, i) => (
                    <p key={i} className="mt-1 text-xs text-blue-800">
                      “{d.narrative}” — {d.reportedByName ?? 'theatre'} at{' '}
                      {new Date(d.recordedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-gray-600">No reason was recorded for this case at any point.</p>
              )}

              {c.reviewStatus === 'PENDING_REVIEW' ? (
                <button
                  onClick={() => { setReviewing(c); setNotice(null); }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-700"
                >
                  <Gavel className="h-4 w-4" /> Review this case
                </button>
              ) : (
                <div className="mt-3 rounded-lg bg-gray-50 p-2 text-xs text-gray-700">
                  <p className="font-medium">
                    {STATUS_LABEL[c.reviewStatus]}
                    {c.judgedAvoidable === true && ' · judged avoidable'}
                    {c.judgedAvoidable === false && ' · judged unavoidable'}
                  </p>
                  {c.reviewNotes && <p className="mt-0.5">{c.reviewNotes}</p>}
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    {c.reviewedByName ?? 'Reviewer'}
                    {c.reviewedAt ? ` · ${new Date(c.reviewedAt).toLocaleDateString('en-GB')}` : ''}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {reviewing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl">
            <h2 className="font-semibold text-gray-900">Review</h2>
            <p className="mt-0.5 text-xs text-gray-600">
              {reviewing.surgery.procedureName ?? 'Case'} · {reviewing.minutesLate} minutes late
            </p>

            <label className="mt-3 block text-xs font-medium text-gray-600">Outcome</label>
            <div className="mt-1 space-y-1.5">
              {OUTCOMES.map((o) => (
                <label key={o.value} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 ${outcome === o.value ? 'border-primary-300 bg-primary-50' : 'border-gray-200'}`}>
                  <input type="radio" name="outcome" checked={outcome === o.value} onChange={() => setOutcome(o.value)} className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">{o.label}</span>
                    <span className="block text-xs text-gray-600">{o.hint}</span>
                  </span>
                </label>
              ))}
            </div>

            <label className="mt-3 block text-xs font-medium text-gray-600">
              Was the delay avoidable? <span className="text-gray-400">(optional)</span>
            </label>
            <div className="mt-1 flex gap-2">
              {(['unset', 'no', 'yes'] as const).map((v) => (
                <button key={v} type="button" onClick={() => setAvoidable(v)}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${avoidable === v ? 'border-primary-300 bg-primary-50 font-medium text-primary-800' : 'border-gray-300 text-gray-700'}`}>
                  {v === 'unset' ? 'Not judged' : v === 'no' ? 'Unavoidable' : 'Avoidable'}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-gray-500">
              This is the only place in the system where that judgement is made, and only a person makes it.
            </p>

            <label className="mt-3 block text-xs font-medium text-gray-600">What the committee concluded</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder="e.g. Pack was re-sterilised after a failed indicator. CSSD followed protocol; the list should have been re-sequenced."
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <p className="mt-0.5 text-[11px] text-gray-500">
              A review with no reasoning cannot be defended later to the person it concerns.
            </p>

            <div className="mt-4 flex gap-2">
              <button onClick={() => setReviewing(null)} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700">
                Cancel
              </button>
              <button onClick={submit} disabled={busy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
                <CheckCircle2 className="h-4 w-4" /> {busy ? 'Recording…' : 'Record review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
