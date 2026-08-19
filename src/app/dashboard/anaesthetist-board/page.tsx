'use client';

// ============================================================
// The anaesthetist's board for one day's list
// ------------------------------------------------------------
// A consultant anaesthetist arrives with one question, and it is always the
// same: can today's list run, and what is waiting on me. Previously this board
// answered neither — it listed the day's cases with their special requirements,
// which meant opening every case to find out whether it had been reviewed and
// whether its drugs had been approved.
//
// It now shows, per case: who is assigned, whether the review is done and what
// it decided, and where the anaesthetic prescription has got to — with the
// approval itself on the row, because a consultant who has to navigate away to
// approve will do it later, and "later" is what the pharmacy is waiting on.
//
// Everything shown is assembled server-side by /api/anaesthesia/board. Three
// fetches joined in the browser would show a different answer depending on
// which arrived first, and the whole point of a board is that two people
// reading it see the same thing.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Stethoscope, RefreshCw, Calendar, AlertTriangle, CheckCircle2, Clock,
  UserX, FileText, ThumbsUp, ThumbsDown, Loader2, ChevronRight,
} from 'lucide-react';

type ReviewState = 'NONE' | 'IN_PROGRESS' | 'COMPLETED' | 'APPROVED';
type RxState = 'NONE' | 'DRAFT' | 'AWAITING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'IN_PHARMACY' | 'CANCELLED';

interface BoardCase {
  id: string;
  patientName: string;
  folderNumber: string | null;
  age: number | null;
  gender: string | null;
  ward: string | null;
  procedureName: string;
  unit: string;
  scheduledTime: string;
  status: string;
  surgeryType: string | null;
  theatre: string | null;
  anaesthesiaType: string | null;
  surgeonName: string | null;
  anaesthetist: { id: string; name: string; phone: string | null } | null;
  review: {
    state: ReviewState; byName: string | null; consultantName: string | null;
    reviewedAt: string | null; fitness: 'FIT' | 'NOT_FIT' | null; asaClass: string | null;
  };
  prescription: {
    id: string | null; state: RxState; version: number | null; itemCount: number;
    prescribedByName: string | null; approvedByName: string | null; amended: boolean;
  };
  readyForTheatre: boolean;
  outstanding: string[];
}

interface BoardResponse {
  date: string;
  canApprove: boolean;
  cases: BoardCase[];
  summary: {
    total: number; unassigned: number; notReviewed: number; reviewInProgress: number;
    notFit: number; rxAwaitingApproval: number; rxNone: number; readyToProceed: number;
  };
}

const REVIEW_LABEL: Record<ReviewState, string> = {
  NONE: 'Not reviewed',
  IN_PROGRESS: 'Review started',
  COMPLETED: 'Reviewed',
  APPROVED: 'Reviewed & approved',
};

const RX_LABEL: Record<RxState, string> = {
  NONE: 'No prescription',
  DRAFT: 'Draft',
  AWAITING_APPROVAL: 'Awaiting approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  IN_PHARMACY: 'With pharmacy',
  CANCELLED: 'Cancelled',
};

// Colour carries the same meaning in both columns: grey nothing yet, amber
// waiting on somebody, green settled, red a problem to look at.
const tone = (kind: 'ok' | 'wait' | 'none' | 'bad') =>
  kind === 'ok' ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
  : kind === 'wait' ? 'bg-amber-50 text-amber-900 border-amber-200'
  : kind === 'bad' ? 'bg-red-50 text-red-800 border-red-200'
  : 'bg-gray-50 text-gray-600 border-gray-200';

const reviewTone = (c: BoardCase) =>
  c.review.fitness === 'NOT_FIT' ? 'bad'
  : c.review.state === 'NONE' ? 'none'
  : c.review.state === 'IN_PROGRESS' ? 'wait'
  : 'ok';

const rxTone = (s: RxState) =>
  s === 'NONE' ? 'none'
  : s === 'REJECTED' || s === 'CANCELLED' ? 'bad'
  : s === 'APPROVED' || s === 'IN_PHARMACY' ? 'ok'
  : 'wait';

export default function AnaesthetistBoardPage() {
  const [data, setData] = useState<BoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyOutstanding, setOnlyOutstanding] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/anaesthesia/board?date=${encodeURIComponent(date)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Could not load the board.');
        setData(null);
        return;
      }
      setData(await res.json());
    } catch {
      setError('Could not reach the server. The list below may be out of date.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [date]);

  useEffect(() => { void load(); }, [load]);

  const decide = async (rxId: string, approved: boolean) => {
    // A rejection must say why — it goes back to the prescriber as the reason
    // to rewrite, and "rejected" with no reason is an instruction to guess.
    let rejectionReason = '';
    if (!approved) {
      rejectionReason = (window.prompt('Why is this prescription being rejected?') || '').trim();
      if (!rejectionReason) return;
    }
    setActing(rxId);
    try {
      const res = await fetch(`/api/prescriptions/${rxId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(approved ? { approved: true } : { approved: false, rejectionReason }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'That decision could not be saved.');
        return;
      }
      await load();
    } catch {
      setError('That decision could not be saved — check the connection and try again.');
    } finally {
      setActing(null);
    }
  };

  const cases = useMemo(() => {
    const all = data?.cases ?? [];
    return onlyOutstanding ? all.filter((c) => c.outstanding.length > 0) : all;
  }, [data, onlyOutstanding]);

  const s = data?.summary;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Stethoscope className="w-6 h-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900 flex-1">Anaesthetist Board</h1>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-500" />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            aria-label="List date"
          />
          <button
            onClick={() => void load()}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 flex gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* The counts a consultant acts on, not a count of everything. */}
      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
          {[
            { n: s.total, l: 'Cases booked', t: 'none' as const },
            { n: s.rxAwaitingApproval, l: 'Awaiting your approval', t: s.rxAwaitingApproval ? 'wait' as const : 'ok' as const },
            { n: s.notReviewed + s.reviewInProgress, l: 'Not yet reviewed', t: (s.notReviewed + s.reviewInProgress) ? 'wait' as const : 'ok' as const },
            { n: s.notFit, l: 'Assessed NOT FIT', t: s.notFit ? 'bad' as const : 'ok' as const },
            { n: s.readyToProceed, l: 'Ready to proceed', t: 'ok' as const },
          ].map((k) => (
            <div key={k.l} className={`rounded-xl border p-3 ${tone(k.t)}`}>
              <div className="text-2xl font-bold tabular-nums">{k.n}</div>
              <div className="text-xs mt-0.5">{k.l}</div>
            </div>
          ))}
        </div>
      )}

      <label className="inline-flex items-center gap-2 mb-4 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={onlyOutstanding}
          onChange={(e) => setOnlyOutstanding(e.target.checked)}
          className="rounded border-gray-300"
        />
        Show only cases with something outstanding
      </label>

      {loading ? (
        <div className="py-16 text-center text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          Loading the list…
        </div>
      ) : cases.length === 0 ? (
        <div className="py-16 text-center text-gray-500 border border-dashed rounded-xl">
          {data?.cases.length
            ? 'Nothing outstanding on this list.'
            : 'No cases booked for this date.'}
        </div>
      ) : (
        <div className="space-y-3">
          {cases.map((c) => (
            <div
              key={c.id}
              className={`rounded-xl border bg-white p-4 ${c.review.fitness === 'NOT_FIT' ? 'border-red-300' : 'border-gray-200'}`}
            >
              <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                <div className="min-w-[14rem] flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{c.patientName}</span>
                    {c.folderNumber && <span className="text-xs text-gray-500">{c.folderNumber}</span>}
                    {c.surgeryType === 'EMERGENCY' && (
                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                        Emergency
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-700 mt-0.5">{c.procedureName}</div>
                  <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{c.scheduledTime}</span>
                    <span>{c.unit}</span>
                    {c.theatre && <span>{c.theatre}</span>}
                    {c.anaesthesiaType && <span>{c.anaesthesiaType}</span>}
                    {c.surgeonName && <span>Surgeon: {c.surgeonName}</span>}
                  </div>
                </div>

                {/* Who is doing the anaesthetic. Unassigned is a real state and
                    is shown as one rather than left blank. */}
                <div className="min-w-[11rem]">
                  <div className="text-[11px] uppercase tracking-wide text-gray-400">Anaesthetist</div>
                  {c.anaesthetist ? (
                    <div className="text-sm text-gray-900">{c.anaesthetist.name}</div>
                  ) : (
                    <div className="text-sm text-amber-800 inline-flex items-center gap-1">
                      <UserX className="w-3.5 h-3.5" /> Not assigned
                    </div>
                  )}
                </div>

                <div className="min-w-[12rem]">
                  <div className="text-[11px] uppercase tracking-wide text-gray-400">Review</div>
                  <span className={`inline-block text-xs px-2 py-0.5 rounded border ${tone(reviewTone(c))}`}>
                    {REVIEW_LABEL[c.review.state]}
                    {c.review.fitness === 'NOT_FIT' && ' — NOT FIT'}
                    {c.review.fitness === 'FIT' && ' — fit'}
                  </span>
                  <div className="text-xs text-gray-500 mt-1">
                    {c.review.byName ? `by ${c.review.byName}` : 'no reviewer yet'}
                    {c.review.asaClass && ` · ASA ${c.review.asaClass}`}
                  </div>
                </div>

                <div className="min-w-[13rem]">
                  <div className="text-[11px] uppercase tracking-wide text-gray-400">Anaesthetic drugs</div>
                  <span className={`inline-block text-xs px-2 py-0.5 rounded border ${tone(rxTone(c.prescription.state))}`}>
                    {RX_LABEL[c.prescription.state]}
                    {c.prescription.itemCount > 0 && ` · ${c.prescription.itemCount} item${c.prescription.itemCount === 1 ? '' : 's'}`}
                  </span>
                  <div className="text-xs text-gray-500 mt-1">
                    {c.prescription.prescribedByName ? `by ${c.prescription.prescribedByName}` : 'not prescribed'}
                    {c.prescription.amended && ` · amended (v${c.prescription.version})`}
                  </div>
                </div>

                {/* The decision, on the row. A consultant who has to navigate
                    away to approve will do it later, and later is what the
                    pharmacy is waiting on. */}
                <div className="flex items-center gap-2">
                  {data?.canApprove && c.prescription.state === 'AWAITING_APPROVAL' && c.prescription.id && (
                    <>
                      <button
                        onClick={() => void decide(c.prescription.id!, true)}
                        disabled={acting === c.prescription.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium px-3 py-2 hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {acting === c.prescription.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <ThumbsUp className="w-4 h-4" />}
                        Approve
                      </button>
                      <button
                        onClick={() => void decide(c.prescription.id!, false)}
                        disabled={acting === c.prescription.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 text-red-700 text-sm px-3 py-2 hover:bg-red-50 disabled:opacity-60"
                      >
                        <ThumbsDown className="w-4 h-4" />
                        Reject
                      </button>
                    </>
                  )}
                  <Link
                    href={`/dashboard/surgeries/${c.id}`}
                    className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"
                  >
                    Open case <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>

              {c.outstanding.length > 0 ? (
                <div className="mt-3 pt-3 border-t border-dashed border-gray-200 flex flex-wrap gap-x-4 gap-y-1">
                  {c.outstanding.map((o) => (
                    <span key={o} className="text-xs text-amber-900 inline-flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-600" />{o}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
                  <span className="text-xs text-emerald-800 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Reviewed, fit, and drugs approved
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-6 inline-flex items-center gap-1">
        <FileText className="w-3 h-3" />
        Review status comes from the pre-operative anaesthetic review; drug status from the
        anaesthetic prescription in force for the case.
      </p>
    </div>
  );
}
