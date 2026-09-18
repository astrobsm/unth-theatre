'use client';

// ============================================================
// The dialog that settles a scheduling problem where it happens
// ------------------------------------------------------------
// A surgeon with a patient in front of them picks 10:00, is told the theatre is
// busy, and that is where the application used to stop. What followed was five
// minutes of leaving the form, finding the list, working out what was where,
// and coming back — or, far more often, picking a different hour and hoping.
//
// This shows the same refusal with everything needed to act on it:
//
//   what is in the way, named;
//   the whole day in that theatre, with the times EDITABLE, because sometimes
//   the person knows exactly which case should move and by how much;
//   the ways out, each one a single button that carries out the whole change.
//
// NOTHING HAPPENS WITHOUT A PRESS. The options are ranked with the ones that
// disturb nobody first, and that is as far as the ranking goes — moving another
// surgeon's patient is a decision with a person on the end of it, and the
// application does not get to make it quietly because it was tidier.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRight, CalendarClock, Check, Clock, Loader2, Users, X,
} from 'lucide-react';

export interface ScheduleRequest {
  scheduledDate: string;
  scheduledTime: string;
  estimatedDuration: number;
  theatreId?: string | null;
  unit?: string | null;
  patientId?: string | null;
  /** Set when an existing case is being moved, so it does not block itself. */
  ignoreId?: string | null;
}

/** What the caller should now put in the form. */
export interface Resolved {
  scheduledTime: string;
  estimatedDuration?: number;
  theatreId?: string | null;
  theatreName?: string | null;
  /** True when the user decided to book despite the patient's other case. */
  allowDuplicate?: boolean;
}

interface Props {
  open: boolean;
  request: ScheduleRequest;
  onResolved: (r: Resolved) => void;
  onClose: () => void;
}

interface Move { id: string; from: string; to: string; patientName?: string; procedureName?: string }
interface Option {
  kind: string; label: string; detail?: string;
  scheduledTime?: string; estimatedDuration?: number;
  theatreId?: string | null; theatreName?: string | null;
  moves: Move[]; disruption: number;
}
interface DayCase {
  id: string; start: string; end: string; scheduledTime: string;
  estimatedDuration: number; patientName?: string; procedureName?: string;
  surgeonName?: string; status?: string; immovable?: boolean;
}
interface PatientCase {
  id: string; scheduledDate: string; scheduledTime: string; procedureName: string;
  status: string; sameDay: boolean; inThePast: boolean; surgeonName?: string;
}
interface Payload {
  ok: boolean; clear: boolean; theatreName: string;
  blockers: Array<{ kind: string; message: string }>;
  options: Option[];
  dayList: DayCase[];
  gaps: Array<{ start: string; end: string; minutes: number }>;
  patientCases: PatientCase[];
}

export default function ScheduleConflictDialog({ open, request, onResolved, onClose }: Props) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Times the user has edited by hand, by case id. Kept apart from the loaded
  // list so "what is booked" and "what I am proposing" never blur together.
  const [edits, setEdits] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/surgeries/schedule-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error || 'Could not read the theatre list.');
        return;
      }
      setData(await res.json());
      setEdits({});
    } catch {
      setErr('Could not reach the server to read the theatre list.');
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const editedMoves = useMemo(
    () => Object.entries(edits)
      .filter(([id, time]) => {
        const original = data?.dayList.find((c) => c.id === id);
        return original && time && time !== original.scheduledTime;
      })
      .map(([id, scheduledTime]) => ({ id, scheduledTime })),
    [edits, data],
  );

  /** Send a set of moves, and say plainly if they were refused. */
  const applyMoves = async (moves: Array<{ id: string; scheduledTime: string }>, reason: string) => {
    if (!moves.length) return true;
    const res = await fetch('/api/surgeries/reschedule-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moves, reason }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error || 'Those cases could not be moved.');
      return false;
    }
    return true;
  };

  const chooseOption = async (option: Option) => {
    setApplying(option.kind + (option.theatreId ?? ''));
    setErr(null);
    try {
      const ok = await applyMoves(
        option.moves.map((m) => ({ id: m.id, scheduledTime: m.to })),
        'Moved to make room for another case',
      );
      if (!ok) return;

      onResolved({
        scheduledTime: option.scheduledTime ?? request.scheduledTime,
        estimatedDuration: option.estimatedDuration,
        theatreId: option.theatreId ?? request.theatreId,
        theatreName: option.theatreName,
      });
    } finally {
      setApplying(null);
    }
  };

  const saveEdits = async () => {
    setApplying('manual');
    setErr(null);
    try {
      const ok = await applyMoves(editedMoves, 'Times adjusted while booking another case');
      if (ok) await load();
    } finally {
      setApplying(null);
    }
  };

  if (!open) return null;

  const blockedByPatient = (data?.patientCases?.length ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-4xl rounded-xl bg-white shadow-2xl">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-amber-100 p-2">
              <CalendarClock className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {data?.clear ? 'This slot is free' : 'This slot is not free'}
              </h2>
              <p className="text-sm text-gray-600">
                {request.scheduledTime} for {request.estimatedDuration} minutes
                {data?.theatreName ? ` in ${data.theatreName}` : ''} on{' '}
                {new Date(request.scheduledDate).toLocaleDateString('en-GB', {
                  weekday: 'short', day: 'numeric', month: 'short',
                })}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          {loading && (
            <p className="flex items-center gap-2 py-8 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Reading the theatre list…
            </p>
          )}

          {err && (
            <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
          )}

          {data && !loading && (
            <>
              {/* ── What is in the way ───────────────────────────────────── */}
              {data.blockers.map((b, i) => (
                <div key={i} className="flex gap-2 rounded border border-red-200 bg-red-50 px-4 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <p className="text-sm text-red-900">{b.message}</p>
                </div>
              ))}

              {/* ── The patient's own unfinished case ────────────────────── */}
              {blockedByPatient && (
                <div className="rounded border border-purple-200 bg-purple-50 p-4">
                  <p className="flex items-center gap-2 font-semibold text-purple-900">
                    <Users className="h-4 w-4" />
                    This patient already has an operation booked that has not happened
                  </p>
                  <div className="mt-2 space-y-2">
                    {data.patientCases.map((p) => (
                      <div key={p.id} className="rounded border border-purple-200 bg-white p-2 text-sm">
                        <p className="font-medium text-gray-900">{p.procedureName}</p>
                        <p className="text-gray-600">
                          {new Date(p.scheduledDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          {' at '}{p.scheduledTime} · {String(p.status).toLowerCase().replace(/_/g, ' ')}
                          {p.inThePast && <span className="ml-1 font-semibold text-red-700">· still open from an earlier date</span>}
                        </p>
                        <a
                          href={`/dashboard/surgeries/${p.id}`}
                          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-purple-700 hover:underline"
                        >
                          Open that case <ArrowRight className="h-3 w-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-purple-800">
                    If this procedure is part of that operation, add it there instead of booking a second slot.
                  </p>
                  <button
                    type="button"
                    onClick={() => onResolved({ scheduledTime: request.scheduledTime, allowDuplicate: true })}
                    className="mt-2 rounded border border-purple-300 bg-white px-3 py-1.5 text-xs font-medium text-purple-800 hover:bg-purple-100"
                  >
                    This is a separate operation — book it as well
                  </button>
                </div>
              )}

              {/* ── The ways out ─────────────────────────────────────────── */}
              {data.options.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">
                    What you can do
                  </h3>
                  <div className="space-y-2">
                    {data.options.map((o, i) => (
                      <div
                        key={`${o.kind}-${i}`}
                        className={`rounded-lg border p-3 ${
                          o.moves.length ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900">{o.label}</p>
                            {o.detail && <p className="mt-0.5 text-sm text-gray-700">{o.detail}</p>}
                            {o.moves.length > 0 && (
                              <ul className="mt-1 ml-4 list-disc text-xs text-gray-700">
                                {o.moves.map((m) => (
                                  <li key={m.id}>
                                    {m.procedureName || 'Case'}
                                    {m.patientName ? ` (${m.patientName})` : ''}: {m.from} → <b>{m.to}</b>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <button
                            type="button"
                            disabled={!!applying}
                            onClick={() => chooseOption(o)}
                            className="btn-primary shrink-0 text-xs disabled:opacity-50"
                          >
                            {applying === o.kind + (o.theatreId ?? '')
                              ? 'Applying…'
                              : o.moves.length ? `Move ${o.moves.length} and book` : 'Use this'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── The day, with the times editable ─────────────────────── */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500">
                    {data.theatreName} — {new Date(request.scheduledDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </h3>
                  {editedMoves.length > 0 && (
                    <button
                      type="button"
                      onClick={saveEdits}
                      disabled={!!applying}
                      className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {applying === 'manual'
                        ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
                        : <><Check className="h-3 w-3" /> Save {editedMoves.length} change{editedMoves.length === 1 ? '' : 's'}</>}
                    </button>
                  )}
                </div>

                {data.dayList.length === 0 ? (
                  <p className="rounded border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
                    Nothing else is booked in this theatre that day.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                          <th className="px-3 py-2">Start</th>
                          <th className="px-3 py-2">Ends</th>
                          <th className="px-3 py-2">Patient</th>
                          <th className="px-3 py-2">Procedure</th>
                          <th className="px-3 py-2">Surgeon</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {data.dayList.map((cs) => (
                          <tr key={cs.id} className={edits[cs.id] && edits[cs.id] !== cs.scheduledTime ? 'bg-blue-50' : ''}>
                            <td className="px-3 py-2">
                              <input
                                type="time"
                                aria-label={`Start time for ${cs.procedureName ?? 'case'}`}
                                value={edits[cs.id] ?? cs.scheduledTime}
                                disabled={cs.immovable}
                                onChange={(e) => setEdits((s) => ({ ...s, [cs.id]: e.target.value }))}
                                className="w-24 rounded border border-gray-300 px-1.5 py-1 text-sm disabled:bg-gray-100 disabled:text-gray-500"
                              />
                            </td>
                            <td className="px-3 py-2 text-gray-600">{cs.end}</td>
                            <td className="px-3 py-2">{cs.patientName || '—'}</td>
                            <td className="px-3 py-2">{cs.procedureName || '—'}</td>
                            <td className="px-3 py-2 text-gray-600">
                              {cs.surgeonName || '—'}
                              {cs.immovable && (
                                <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-700">
                                  {String(cs.status ?? '').toLowerCase().replace(/_/g, ' ') || 'in progress'}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {data.gaps.length > 0 && (
                  <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
                    <Clock className="h-3.5 w-3.5" /> Free:
                    {data.gaps.map((g) => (
                      <span key={g.start} className="rounded bg-green-100 px-1.5 py-0.5 font-medium text-green-800">
                        {g.start}–{g.end}
                      </span>
                    ))}
                  </p>
                )}
                <p className="mt-2 text-xs text-gray-500">
                  A case cannot start until 20 minutes after the one before it ends — the patient has to
                  leave, the theatre has to be cleaned and the next patient brought in. A case already in
                  the holding area or under way cannot be moved from here.
                </p>
              </div>
            </>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-5 py-3">
          <button type="button" onClick={onClose} className="text-sm text-gray-600 hover:text-gray-900">
            Go back to the form
          </button>
          {data?.clear && (
            <button
              type="button"
              onClick={() => onResolved({ scheduledTime: request.scheduledTime })}
              className="btn-primary text-sm"
            >
              Nothing is in the way — continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
