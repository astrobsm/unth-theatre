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
  AlertTriangle, BedDouble, CheckCircle2, Clock, Loader2, MessageCircle, UserCheck, UserX,
} from 'lucide-react';
import { whatsappLink } from '@/lib/whatsapp';
import { requestFix } from '@/lib/geo/requestFix';
import { GRADE_LABEL, REVIEWER_SOURCE_LABEL, type ReviewerGrade, type ReviewerSource } from '@/lib/anaesthesia/expectedReviewers';

/**
 * What the server made of a handset's position.
 *
 * Shown as one sentence and a map link, deliberately without a tick or a
 * cross. A doctor standing at the bedside whose phone never found a satellite
 * produces exactly the same reading as a doctor who was not there, and a
 * board that scored it would be scoring the building's walls.
 */
interface Where {
  hasFix: boolean;
  verdict: string;
  label: string;
  sentence: string;
  mapUrl: string | null;
  corroborated: boolean;
}

interface Case {
  surgeryId: string;
  procedureName: string;
  scheduledTime: string | null;
  unit: string | null;
  subspecialty: string | null;
  patient: { name: string; folderNumber: string; ward: string | null } | null;
  surgeonName: string | null;
  expectedReviewer: { id: string; fullName: string } | null;
  /// The registrar and senior registrar rostered to this case's specialty.
  expectedReviewers?: { id: string; fullName: string; phone: string | null; grade: string }[];
  reviewerSource?: string;
  assignmentSource: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
  reviewId: string | null;
  /** Where the review was entered from. Never a pass or a fail — see below. */
  reviewedWhere: Where | null;
  /** An anaesthetist went and the patient was not in the ward. */
  patientAbsentAt: string | null;
  patientAbsentByName: string | null;
  patientAbsentReason: string | null;
  patientAbsentWhere: Where | null;
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
  canChase?: boolean;
  canRecordAbsence?: boolean;
  cases: Case[];
}

const STATE: Record<string, { label: string; cls: string }> = {
  REVIEWED: { label: 'Reviewed', cls: 'bg-green-100 text-green-800' },
  AWAITING: { label: 'Awaiting review', cls: 'bg-gray-100 text-gray-700' },
  AWAITING_REASSIGNMENT: { label: 'Handed back — needs reassigning', cls: 'bg-amber-100 text-amber-800' },
  HANDBACK_WINDOW_CLOSED: { label: 'Past 7pm, unreviewed', cls: 'bg-orange-100 text-orange-800' },
  // Purple and not red: this case is a finding against the list, not against
  // the department. Somebody walked to the ward and there was nobody in it.
  PATIENT_NOT_IN_WARD: {
    label: 'Attended — patient not in the ward',
    cls: 'bg-purple-100 text-purple-800',
  },
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
  // The WhatsApp hand-off from the last chase. Kept on screen rather than
  // fired and forgotten: a browser blocks every pop-up but the first, so
  // chasing two reviewers at once would silently send one message and lose
  // the other. The buttons stay until the next chase replaces them.
  const [handoff, setHandoff] = useState<
    { surgeryId: string; who: { name: string; href: string | null }[] } | null
  >(null);

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

  /**
   * Chase the people who were expected to review and did not.
   *
   * The server writes the dashboard message and the audit row BEFORE this
   * sees a link, so a blocked pop-up leaves a chase recorded-but-unsent,
   * never sent-but-unrecorded.
   */
  const chase = async (c: Case) => {
    setBusy(c.surgeryId);
    setError(null);
    setNote(null);
    setHandoff(null);
    try {
      const r = await fetch('/api/preop-reviews/watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surgeryId: c.surgeryId, action: 'chase' }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? 'Could not send that.'); return; }

      const who = (j.whatsapp ?? []).map(
        (w: { name: string; number: string | null; text: string }) => ({
          name: w.name,
          href: whatsappLink(w.number, w.text),
        }),
      );
      setHandoff({ surgeryId: c.surgeryId, who });
      setNote(j.message ?? 'Chased.');

      const first = who.find((w: { href: string | null }) => w.href);
      if (first?.href) window.open(first.href, '_blank', 'noopener,noreferrer');
      await load(day);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(null);
    }
  };

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

  /**
   * "I went to the ward and the patient was not there."
   *
   * Takes a position with it, and takes it on the ward — not at the desk
   * afterwards, which is the whole reason this button is here on the board
   * rather than only in the review form.
   *
   * requestFix never rejects and has its own ceiling, so a handset with no
   * signal costs a few seconds and records the reason instead of blocking.
   */
  const recordAbsent = async (c: Case) => {
    const reason = window.prompt(
      `${c.patient?.name ?? 'This patient'} was not in the ward — what did you find?\n\n`
      + 'e.g. "not yet admitted", "away for imaging", "ward says it is a day case".\n\n'
      + 'This goes to whoever booked the case and to the surgeon, with your name and the '
      + 'time. The case stays unreviewed — because the patient has not been seen — but it '
      + 'will not be held against you.',
    );
    if (!reason || reason.trim().length < 5) return;

    setBusy(c.surgeryId);
    setError(null);
    setNote(null);
    setHandoff(null);
    try {
      const fix = await requestFix();
      const r = await fetch('/api/preop-reviews/watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surgeryId: c.surgeryId, action: 'patient-absent', reason: reason.trim(), fix,
        }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? 'That did not work.'); return; }

      const who = (j.whatsapp ?? []).map(
        (w: { name: string; number: string | null; text: string }) => ({
          name: w.name,
          href: whatsappLink(w.number, w.text),
        }),
      );
      setHandoff({ surgeryId: c.surgeryId, who });
      setNote(j.message ?? 'Recorded.');

      const first = who.find((w: { href: string | null }) => w.href);
      if (first?.href) window.open(first.href, '_blank', 'noopener,noreferrer');
      await load(day);
    } catch {
      setError('Could not reach the server. Nothing has been recorded.');
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

                      {/* The registrar and senior registrar rostered to this
                          specialty -- the grades who actually do the
                          assessment. Both are shown when both are rostered:
                          the list is shared between them and either may take
                          any case, so naming one would make the other
                          invisible on a board about accountability. */}
                      <div className="mt-1.5 text-sm">
                        <span className="text-gray-600">
                          Expected reviewer{(c.expectedReviewers?.length ?? 0) > 1 ? 's' : ''}:{' '}
                        </span>
                        {(c.expectedReviewers?.length ?? 0) === 0 ? (
                          <span className="font-medium text-gray-900">nobody</span>
                        ) : (
                          c.expectedReviewers!.map((r, i) => (
                            <span key={r.id}>
                              {i > 0 && <span className="text-gray-400">, </span>}
                              <span className="font-medium text-gray-900">{r.fullName}</span>
                              {GRADE_LABEL[r.grade as ReviewerGrade] && (
                                <span className="ml-1 text-xs text-gray-500">
                                  ({GRADE_LABEL[r.grade as ReviewerGrade].toLowerCase()})
                                </span>
                              )}
                              {!r.phone && (
                                <span className="ml-1 text-xs text-gray-400">no number</span>
                              )}
                            </span>
                          ))
                        )}
                        {/* How the name was arrived at: the column that matters. */}
                        <span className={`ml-2 text-xs ${src.cls}`}>
                          {c.reviewerSource
                            ? REVIEWER_SOURCE_LABEL[c.reviewerSource as ReviewerSource] ?? src.label
                            : src.label}
                        </span>
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
                      {c.reviewedAt && c.reviewedWhere && (
                        <p className="text-xs text-gray-500">
                          {c.reviewedWhere.sentence}
                          {c.reviewedWhere.mapUrl && (
                            <>
                              {' '}
                              <a
                                href={c.reviewedWhere.mapUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-indigo-600 underline"
                              >
                                See it on a map
                              </a>
                            </>
                          )}
                        </p>
                      )}

                      {/* Attended, and the bed was empty. Said at the same
                          weight as a review, because for the person who walked
                          there it is the same amount of work. */}
                      {c.patientAbsentAt && !c.reviewedAt && (
                        <div className="mt-1 rounded-lg border border-purple-200 bg-purple-50 p-2">
                          <p className="text-sm font-medium text-purple-900">
                            Patient not in the ward at {clock(c.patientAbsentAt)}
                            {c.patientAbsentByName ? ` — ${c.patientAbsentByName} attended` : ''}
                          </p>
                          {c.patientAbsentReason && (
                            <p className="text-sm text-purple-900">{c.patientAbsentReason}</p>
                          )}
                          {c.patientAbsentWhere && (
                            <p className="mt-0.5 text-xs text-purple-700">
                              {c.patientAbsentWhere.sentence}
                              {c.patientAbsentWhere.mapUrl && (
                                <>
                                  {' '}
                                  <a
                                    href={c.patientAbsentWhere.mapUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-medium underline"
                                  >
                                    See it on a map
                                  </a>
                                </>
                              )}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-purple-800">
                            Still unreviewed: the patient has not been seen. The surgical team
                            has been asked to produce them or to declare it a day case.
                          </p>
                        </div>
                      )}

                      {/* The hand-off, kept on screen rather than fired once.
                          A browser blocks every pop-up but the first, so a
                          case with two reviewers would otherwise send one
                          message and silently lose the other. Every message
                          is already recorded on their dashboards; these
                          buttons only decide whether WhatsApp carries it
                          too. */}
                      {handoff?.surgeryId === c.surgeryId && handoff.who.length > 0 && (
                        <div className="mt-2 rounded-lg bg-green-50 p-2 ring-1 ring-green-200">
                          <p className="text-xs text-green-900">
                            Recorded on their dashboards. Send the WhatsApp message:
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-2">
                            {handoff.who.map((w) => (
                              w.href ? (
                                <a
                                  key={w.name}
                                  href={w.href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700"
                                >
                                  <MessageCircle className="h-3.5 w-3.5" />
                                  {w.name}
                                </a>
                              ) : (
                                <span key={w.name} className="text-xs text-gray-500">
                                  {w.name} — no phone number on file
                                </span>
                              )
                            ))}
                          </div>
                        </div>
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
                      {/* Offered to any anaesthetist, not only the one the
                          case names: the person who walks to the ward is
                          usually the registrar on the roster, not the
                          consultant the booking carries. The record names
                          whoever made it, which is what makes that safe. */}
                      {board.canRecordAbsence && !c.reviewedAt && !c.patientAbsentAt && (
                        <button type="button" disabled={busy === c.surgeryId}
                          onClick={() => void recordAbsent(c)}
                          className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-purple-700 ring-1 ring-purple-300 hover:bg-purple-50 disabled:opacity-50"
                          title="Record that you went to the ward and the patient was not there">
                          {busy === c.surgeryId ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <BedDouble className="h-4 w-4" />}
                          Patient not in the ward
                        </button>
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
                      {/* Only a case that has actually defaulted. Writing to
                          somebody who is still within their window is how a
                          chase comes to be deleted unread -- so the button is
                          not merely disabled, it is absent. */}
                      {board.canChase && !c.reviewedAt
                        && (c.state === 'LAPSED' || c.state === 'HANDBACK_WINDOW_CLOSED') && (
                        <button
                          type="button"
                          disabled={busy === c.surgeryId}
                          onClick={() => void chase(c)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                          title={c.state === 'LAPSED'
                            ? 'Write to the reviewer about the missed 9pm deadline'
                            : 'Remind the reviewer before the 9pm deadline'}
                        >
                          {busy === c.surgeryId
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <MessageCircle className="h-4 w-4" />}
                          {c.state === 'LAPSED' ? 'Chase on WhatsApp' : 'Remind on WhatsApp'}
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
