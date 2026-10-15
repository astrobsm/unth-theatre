'use client';

// ============================================================
// Tomorrow's preoperative reviews
// ------------------------------------------------------------
// The question this answers is the one nobody could answer before: for each
// case on tomorrow's list, WHO is supposed to review it, and has anybody.
//
// The column that matters most is "how the name was arrived at". A case
// showing an anaesthetist's name because the roster says so, and a case
// showing the same name because nobody was rostered and the booking route
// fell back to the on-call consultant, look identical on every other screen
// in this system. They are completely different facts: the second is a hole
// in the rota that is hiding itself, and it is the one that produces a
// morning with no reviewer and nobody at fault.
//
// Both deadlines are shown as wall-clock times, counting down, because "by
// 9pm" is actionable and "in 94 minutes" is not until you are close.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, CheckCircle2, Clock, Loader2, UserCheck, UserX,
} from 'lucide-react';

interface Case {
  surgeryId: string;
  procedureName: string;
  scheduledTime: string | null;
  unit: string | null;
  subspecialty: string | null;
  patient: { name: string; folderNumber: string; ward: string | null } | null;
  surgeonName: string | null;
  expectedReviewer: { id: string; fullName: string } | null;
  assignmentSource: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
  reviewId: string | null;
  handedBackAt: string | null;
  handedBackReason: string | null;
  reassignedToName: string | null;
  lapsedAt: string | null;
  lapseGround: string | null;
  state: string;
  bookedTooLate: boolean;
  mine: boolean;
}

interface Board {
  day: string;
  handbackBy: string;
  reviewBy: string;
  rosterPublished: boolean;
  canReassign: boolean;
  cases: Case[];
}

const STATE: Record<string, { label: string; cls: string }> = {
  REVIEWED: { label: 'Reviewed', cls: 'bg-green-100 text-green-800' },
  AWAITING: { label: 'Awaiting review', cls: 'bg-gray-100 text-gray-700' },
  AWAITING_REASSIGNMENT: { label: 'Handed back — needs reassigning', cls: 'bg-amber-100 text-amber-800' },
  HANDBACK_WINDOW_CLOSED: { label: 'Past 7pm, unreviewed', cls: 'bg-orange-100 text-orange-800' },
  LAPSED: { label: 'Missed the 9pm deadline', cls: 'bg-red-100 text-red-800' },
  SETTLED: { label: 'No longer pending', cls: 'bg-slate-100 text-slate-600' },
};

/** The honest description of how a case came to name an anaesthetist. */
const SOURCE: Record<string, { label: string; cls: string }> = {
  subspecialty: { label: 'Rostered to this specialty', cls: 'text-green-700' },
  'on-call': { label: 'On-call cover — nobody rostered', cls: 'text-amber-700 font-semibold' },
  'other-specialty': { label: 'Rostered elsewhere', cls: 'text-amber-700 font-semibold' },
  unrostered: { label: 'Assigned by hand, not on the roster', cls: 'text-gray-600' },
  none: { label: 'No anaesthetist named', cls: 'text-red-700 font-semibold' },
};

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export default function PreopWatchPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [day, setDay] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [anaesthetists, setAnaesthetists] = useState<{ id: string; fullName: string }[]>([]);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/preop-reviews/watch${d ? `?day=${d}` : ''}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? 'Could not load the board.'); return; }
      setBoard(j);
      setDay(j.day);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(''); }, [load]);

  useEffect(() => {
    if (!board?.canReassign) return;
    fetch('/api/users?role=ANAESTHETIST&status=APPROVED')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setAnaesthetists(Array.isArray(d)
        ? d.map((u: { id: string; fullName: string }) => ({ id: u.id, fullName: u.fullName }))
        : []))
      .catch(() => undefined);
  }, [board?.canReassign]);

  const post = async (surgeryId: string, payload: Record<string, unknown>) => {
    setBusy(surgeryId);
    setError(null);
    setNote(null);
    try {
      const r = await fetch('/api/preop-reviews/watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surgeryId, ...payload }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? 'That did not work.'); return; }
      setNote(j.message ?? 'Done.');
      await load(day);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(null);
    }
  };

  const handback = (c: Case) => {
    const reason = window.prompt(
      `Why can you not review ${c.patient?.name ?? 'this patient'}?\n\n`
      + 'This goes to the Head of Anaesthesia so somebody else can be named. '
      + 'It must be done before 7pm.',
    );
    if (reason && reason.trim().length >= 5) {
      void post(c.surgeryId, { action: 'handback', reason: reason.trim() });
    }
  };

  const shiftDay = (n: number) => {
    if (!board) return;
    const [y, m, d] = board.day.split('-').map(Number);
    void load(new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10));
  };

  const unreviewed = board?.cases.filter((c) => !c.reviewedAt).length ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <UserCheck className="h-6 w-6 text-indigo-600" /> Preoperative review watch
        </h1>
        <p className="mt-1 text-gray-600">
          Who is expected to review each of the next day&rsquo;s cases, and whether they have.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 ring-1 ring-gray-200">
        <button type="button" onClick={() => shiftDay(-1)}
          className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50">
          ← Previous day
        </button>
        <span className="px-2 font-semibold text-gray-900">
          {board ? new Date(`${board.day}T12:00:00Z`).toLocaleDateString('en-GB', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          }) : '…'}
        </span>
        <button type="button" onClick={() => shiftDay(1)}
          className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50">
          Next day →
        </button>
        {board && (
          <span className="ml-auto flex flex-wrap items-center gap-3 text-sm text-gray-600">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-4 w-4" /> Hand back by {clock(board.handbackBy)}
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-gray-800">
              Review by {clock(board.reviewBy)}
            </span>
          </span>
        )}
      </div>

      {board && !board.rosterPublished && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          No published anaesthetist roster for this day. Every case will read as a rota gap,
          and no individual anaesthetist will be summoned for a missed review.
        </p>
      )}
      {error && (
        <p className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}
        </p>
      )}
      {note && (
        <p className="flex items-start gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{note}
        </p>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading&hellip;
        </p>
      ) : !board || board.cases.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-gray-600 ring-1 ring-gray-200">
          No cases booked for this day.
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-600">
            {board.cases.length} case{board.cases.length === 1 ? '' : 's'}
            {unreviewed > 0 && <> · <strong>{unreviewed}</strong> without a review</>}
          </p>

          <div className="space-y-2">
            {board.cases.map((c) => {
              const st = STATE[c.state] ?? { label: c.state, cls: 'bg-gray-100 text-gray-700' };
              const src = SOURCE[c.assignmentSource] ?? { label: c.assignmentSource, cls: 'text-gray-600' };
              return (
                <div key={c.surgeryId} className="rounded-2xl bg-white p-4 ring-1 ring-gray-200">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}>
                          {st.label}
                        </span>
                        {c.scheduledTime && (
                          <span className="text-xs text-gray-500">{c.scheduledTime}</span>
                        )}
                        {c.unit && <span className="text-xs text-gray-500">{c.unit}</span>}
                        {c.bookedTooLate && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            Booked too late to review
                          </span>
                        )}
                      </div>

                      <p className="mt-1 font-semibold text-gray-900">
                        {c.patient?.name ?? 'Patient'}{' '}
                        <span className="font-normal text-gray-500">
                          ({c.patient?.folderNumber ?? '—'})
                        </span>
                      </p>
                      <p className="text-sm text-gray-700">
                        {c.procedureName}
                        {c.surgeonName ? ` · ${c.surgeonName}` : ''}
                      </p>

                      <div className="mt-1.5 text-sm">
                        <span className="text-gray-600">Expected reviewer: </span>
                        <span className="font-medium text-gray-900">
                          {c.expectedReviewer?.fullName ?? 'nobody'}
                        </span>
                        {/* The column that matters. */}
                        <span className={`ml-2 text-xs ${src.cls}`}>{src.label}</span>
                      </div>

                      {c.reassignedToName && (
                        <p className="text-sm text-blue-800">
                          Reassigned to {c.reassignedToName}
                        </p>
                      )}
                      {c.handedBackAt && !c.reassignedToName && (
                        <p className="text-sm text-amber-800">
                          Handed back at {clock(c.handedBackAt)}
                          {c.handedBackReason ? ` — ${c.handedBackReason}` : ''}
                        </p>
                      )}
                      {c.reviewedAt && (
                        <p className="text-sm text-green-800">
                          Reviewed {clock(c.reviewedAt)}
                          {c.reviewedByName ? ` by ${c.reviewedByName}` : ''}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {!c.reviewedAt && (
                        <Link href={`/dashboard/preop-reviews/new?surgeryId=${c.surgeryId}`}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">
                          Review this case
                        </Link>
                      )}
                      {c.reviewId && (
                        <Link href={`/dashboard/preop-reviews/${c.reviewId}`}
                          className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50">
                          Open the review
                        </Link>
                      )}
                      {c.mine && !c.reviewedAt && !c.handedBackAt && (
                        <button type="button" disabled={busy === c.surgeryId}
                          onClick={() => handback(c)}
                          className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-amber-700 ring-1 ring-amber-300 hover:bg-amber-50 disabled:opacity-50">
                          {busy === c.surgeryId ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <UserX className="h-4 w-4" />}
                          I cannot review this
                        </button>
                      )}
                      {board.canReassign && !c.reviewedAt && (
                        <select
                          disabled={busy === c.surgeryId}
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) {
                              void post(c.surgeryId, { action: 'reassign', toUserId: e.target.value });
                              e.target.value = '';
                            }
                          }}
                          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                        >
                          <option value="">Reassign to…</option>
                          {anaesthetists.map((a) => (
                            <option key={a.id} value={a.id}>{a.fullName}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
