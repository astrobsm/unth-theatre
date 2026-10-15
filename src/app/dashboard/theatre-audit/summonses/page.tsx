'use client';

// ============================================================
// Summonses to the theatre audit
// ------------------------------------------------------------
// Two pages in one, because they are the same list seen from two sides and
// keeping them apart would let them disagree.
//
// A PERSON SUMMONED sees their own matters, what each is about, when and
// where the sitting is, and one button to confirm they will be there. That
// is the whole of what they need, and a summons that does not say what it is
// about cannot be prepared for — so the ground is stated in full, not
// abbreviated to a category.
//
// THE COMMITTEE sees everybody's, grouped by person, and can excuse somebody
// or mark attendance. Excusing requires a reason, because an attendance
// record with unexplained absences is not one the sitting can use.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, CalendarClock, CheckCircle2, Gavel, Link2, Loader2,
  MapPin, UserX, Video,
} from 'lucide-react';

interface Summons {
  id: string;
  cause: string;
  ground: string;
  reason: string;
  status: string;
  personName: string;
  roleOnCase: string;
  userId: string;
  raisedAt: string;
  acknowledgedAt: string | null;
  excusedReason: string | null;
  surgeryId: string | null;
  conference: {
    id: string; title: string; sittingDate: string; mode: string;
    venue: string | null; meetingLink: string | null; status: string;
  } | null;
  surgery: {
    procedureName: string; scheduledDate: string; unit: string | null;
    patient: { name: string; folderNumber: string } | null;
  } | null;
}

const CAUSE_LABEL: Record<string, string> = {
  CASE_CANCELLATION: 'Case cancelled',
  PREOP_REVIEW_LAPSE: 'Preoperative review not done',
  EMERGENCY_DELAY: 'Emergency not started',
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700',
  NOTIFIED: 'bg-amber-100 text-amber-800',
  ACKNOWLEDGED: 'bg-blue-100 text-blue-800',
  ATTENDED: 'bg-green-100 text-green-800',
  EXCUSED: 'bg-slate-100 text-slate-700',
  NO_SHOW: 'bg-red-100 text-red-800',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Awaiting a sitting',
  NOTIFIED: 'Summoned',
  ACKNOWLEDGED: 'Attending',
  ATTENDED: 'Attended',
  EXCUSED: 'Excused',
  NO_SHOW: 'Did not attend',
};

export default function SummonsesPage() {
  const [rows, setRows] = useState<Summons[]>([]);
  const [committee, setCommittee] = useState(false);
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (s: 'mine' | 'all') => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/theatre-audit/summonses?scope=${s}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? 'Could not load the summonses.'); return; }
      setRows(d.summonses ?? []);
      setCommittee(Boolean(d.committee));
      setScope(d.scope);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load('mine'); }, [load]);

  const act = async (id: string, action: string, reason?: string) => {
    setBusy(id);
    setError(null);
    try {
      const r = await fetch('/api/theatre-audit/summonses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, reason }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? 'That did not work.'); return; }
      setRows((prev) => prev.map((x) => (x.id === id ? d.summons : x)));
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(null);
    }
  };

  const excuse = (id: string) => {
    const reason = window.prompt(
      'Why is this person excused? The attendance record shows this, so it has to '
      + 'say something.',
    );
    if (reason && reason.trim().length >= 5) void act(id, 'excuse', reason.trim());
  };

  /** Grouped by person, so one consultant with three matters reads as one entry. */
  const byPerson = useMemo(() => {
    const m = new Map<string, Summons[]>();
    for (const r of rows) {
      const list = m.get(r.userId);
      if (list) list.push(r); else m.set(r.userId, [r]);
    }
    return Array.from(m.values()).sort((a, b) => b.length - a.length);
  }, [rows]);

  const outstanding = rows.filter(
    (r) => r.status === 'NOTIFIED' || r.status === 'PENDING',
  ).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Gavel className="h-6 w-6 text-indigo-600" /> Theatre audit summonses
          </h1>
          <p className="mt-1 text-gray-600">
            {scope === 'mine'
              ? 'Matters you have been asked to come and account for.'
              : 'Everybody summoned, grouped by person.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {committee && (
            <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-gray-300">
              {(['mine', 'all'] as const).map((s) => (
                <button key={s} type="button" onClick={() => void load(s)}
                  className={`px-3 py-1.5 text-sm font-semibold ${
                    scope === s ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}>
                  {s === 'mine' ? 'Mine' : 'Everyone'}
                </button>
              ))}
            </div>
          )}
          <Link href="/dashboard/theatre-audit/pool"
            className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50">
            The week&rsquo;s pool
          </Link>
        </div>
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}
        </p>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading&hellip;
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-gray-200">
          <CheckCircle2 className="mx-auto h-8 w-8 text-green-600" />
          <p className="mt-2 font-semibold text-gray-900">Nothing outstanding.</p>
          <p className="text-sm text-gray-600">
            {scope === 'mine'
              ? 'You have not been summoned to the theatre audit.'
              : 'No summonses have been raised.'}
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-600">
            {rows.length} summons{rows.length === 1 ? '' : 'es'}
            {outstanding > 0 && <> · <strong>{outstanding}</strong> not yet answered</>}
          </p>

          {byPerson.map((group) => (
            <div key={group[0].userId} className="rounded-2xl bg-white ring-1 ring-gray-200">
              {scope === 'all' && (
                <div className="border-b border-gray-100 px-5 py-3">
                  <p className="font-semibold text-gray-900">{group[0].personName}</p>
                  <p className="text-xs text-gray-500">
                    {group.length} matter{group.length === 1 ? '' : 's'} to answer
                  </p>
                </div>
              )}
              <ul className="divide-y divide-gray-100">
                {group.map((s) => (
                  <li key={s.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                            {CAUSE_LABEL[s.cause] ?? s.cause}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            STATUS_STYLE[s.status] ?? 'bg-gray-100 text-gray-700'}`}>
                            {STATUS_LABEL[s.status] ?? s.status}
                          </span>
                          <span className="text-xs text-gray-500">as {s.roleOnCase}</span>
                        </div>

                        {s.surgery && (
                          <p className="mt-1.5 font-medium text-gray-900">
                            {s.surgery.patient?.name ?? 'Patient'}{' '}
                            <span className="font-normal text-gray-500">
                              ({s.surgery.patient?.folderNumber ?? '—'})
                            </span>{' '}
                            — {s.surgery.procedureName}
                          </p>
                        )}

                        {/* Stated in full. An abbreviated summons is one
                            nobody can prepare for. */}
                        <p className="mt-1 text-sm text-gray-700">{s.reason}</p>

                        {s.excusedReason && (
                          <p className="mt-1 text-sm text-slate-600">
                            Excused: {s.excusedReason}
                          </p>
                        )}

                        {s.conference ? (
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
                            <span className="inline-flex items-center gap-1">
                              <CalendarClock className="h-4 w-4" />
                              {new Date(s.conference.sittingDate).toLocaleString('en-GB', {
                                weekday: 'short', day: 'numeric', month: 'short',
                                hour: '2-digit', minute: '2-digit',
                              })}
                            </span>
                            {s.conference.venue && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-4 w-4" />{s.conference.venue}
                              </span>
                            )}
                            {s.conference.meetingLink && (
                              <a href={s.conference.meetingLink} target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline">
                                {s.conference.mode === 'VIRTUAL'
                                  ? <Video className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                                Join the sitting
                              </a>
                            )}
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-gray-500">
                            The chairman has not yet set a date for the sitting.
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        {scope === 'mine' && s.status === 'NOTIFIED' && (
                          <button type="button" disabled={busy === s.id}
                            onClick={() => void act(s.id, 'acknowledge')}
                            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                            {busy === s.id ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <CheckCircle2 className="h-4 w-4" />}
                            I will attend
                          </button>
                        )}
                        {committee && scope === 'all' && s.status !== 'EXCUSED' && (
                          <>
                            <button type="button" disabled={busy === s.id}
                              onClick={() => void act(s.id, 'attended')}
                              className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-green-700 ring-1 ring-green-300 hover:bg-green-50 disabled:opacity-50">
                              Attended
                            </button>
                            <button type="button" disabled={busy === s.id}
                              onClick={() => void act(s.id, 'no_show')}
                              className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-red-700 ring-1 ring-red-300 hover:bg-red-50 disabled:opacity-50">
                              <UserX className="h-4 w-4" /> Absent
                            </button>
                            <button type="button" disabled={busy === s.id}
                              onClick={() => excuse(s.id)}
                              className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-50">
                              Excuse
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
