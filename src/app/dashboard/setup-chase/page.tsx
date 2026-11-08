'use client';

/**
 * Elective theatre-days that were not set up, not checked, or not closed down.
 *
 * ONE CARD PER TECHNICIAN, not per theatre — somebody covering three rooms on
 * a Tuesday gets one conversation about three rooms, which is also the only
 * way the pattern is visible. Inside each card the rows are theatre-days,
 * because that is the unit the deadlines apply to.
 *
 * THE DEADLINES COME FROM THE SERVER, not from this file. The board states
 * whatever the code enforces, so a screen cannot promise 08:30 while the
 * detection applies something else.
 *
 * A THEATRE STOOD DOWN IS NOT ON THIS BOARD. A technician who checks the
 * machine, finds the ventilator faulty and records the theatre as NOT ready
 * has done the job properly, and nothing here reports it as a failure. That is
 * said on the screen as well as in the message, because a board that punished
 * it would teach everybody to tick the boxes and say nothing.
 *
 * THEATRE-DAYS WITH NOBODY ASSIGNED ARE SHOWN SEPARATELY. A theatre that
 * operated with no technician named anywhere is a worse finding than a late
 * setup and no message can fix it.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, Check, ClipboardCheck, Eye, Loader2, Send, ShieldCheck, UserX, Wrench,
} from 'lucide-react';

interface TheatreDay {
  day: string;
  dayLabel: string;
  theatreId: string;
  theatreName: string;
  gaps: string[];
  bits: string[];
  caseCount: number;
  evidence: 'ALLOCATION' | 'CASE';
  certifiedClock: string | null;
  endOfDayClock: string | null;
  unchecked: string[];
  stoodDown: boolean;
  technicianName: string | null;
  technicianSource: 'SETUP_LOG' | 'ALLOCATION' | 'CASE' | 'NONE';
  assignedTheatreName: string | null;
}

interface Technician {
  personId: string;
  personName: string;
  role: string | null;
  hasPhone: boolean;
  active: boolean;
  theatres: string[];
  dayCount: number;
  counts: Record<string, number>;
  headline: string;
  sentAt: string | null;
  theatreDays: TheatreDay[];
}

interface Board {
  from: string;
  to: string;
  today: string;
  periodLabel: string;
  deadlines: { morning: string; endOfDay: string };
  canSend: boolean;
  totals: Record<string, number>;
  gapLabels: { code: string; label: string }[];
  technicians: Technician[];
  unassigned: TheatreDay[];
}

export default function SetupChasePage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState('');
  const [preview, setPreview] = useState<{ text: string; headline: string } | null>(null);

  const load = useCallback(async (a?: string, b?: string) => {
    setLoading(true);
    setError('');
    try {
      const qs = a && b ? `?from=${a}&to=${b}` : '';
      const res = await fetch(`/api/setup-chase${qs}`, { cache: 'no-store' });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? 'Could not read the board.');
        return;
      }
      setBoard(d);
      setFrom(d.from);
      setTo(d.to);
    } catch {
      setError('Could not read the board.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = async (t: Technician, asPreview: boolean) => {
    setBusy(`${t.personId}-${asPreview ? 'p' : 's'}`);
    setError('');
    setResult('');
    try {
      const res = await fetch('/api/setup-chase/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId: t.personId, from, to, preview: asPreview }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? 'Could not do that.');
        return;
      }
      if (asPreview) {
        setPreview({ text: d.text, headline: d.headline });
        return;
      }
      setResult(d.message ?? (d.alreadySent ? 'Already sent.' : 'Sent.'));
      await load(from, to);
    } catch {
      setError('Could not do that.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="rounded-full bg-sky-50 p-2.5 text-sky-700">
          <Wrench className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Theatre setup and equipment checks</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Elective theatre-days where the morning setup was not logged and certified by{' '}
            <strong>{board?.deadlines.morning ?? '08:30'}</strong>, the equipment checklist was
            left incomplete, or the end-of-day check was not recorded before{' '}
            <strong>{board?.deadlines.endOfDay ?? '18:00'}</strong>.
          </p>
        </div>
      </div>

      <section className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
        <p className="text-xs leading-relaxed text-emerald-900">
          A theatre that was checked, found wanting and stood down is <strong>not</strong> on
          this board and never will be. Recording a theatre as not ready is the job done
          properly. What this reports is a theatre nobody certified, and a theatre certified
          with the checks left blank.
        </p>
      </section>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-gray-600">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block rounded-xl border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 block rounded-xl border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => void load(from, to)}
          className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-bold text-white"
        >
          Show
        </button>
        {board && <span className="ml-auto text-xs text-gray-500">{board.periodLabel}</span>}
      </div>

      {board && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Theatre-days outstanding" value={board.totals.theatreDays ?? 0} />
          <Stat label="Of elective theatre-days" value={board.totals.electiveTheatreDays ?? 0} />
          <Stat label="No morning setup" value={board.totals.NO_MORNING_SETUP ?? 0} />
          <Stat label="No end-of-day check" value={board.totals.NO_END_OF_DAY ?? 0} />
          <Stat label="Checks left unticked" value={board.totals.EQUIPMENT_NOT_CHECKED ?? 0} />
        </div>
      )}

      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {result && (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-800">
          <Check className="h-4 w-4" /> {result}
        </p>
      )}

      {board && !board.canSend && (
        <p className="mt-4 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
          You can read this board and close what is outstanding on it. Sending a chase from
          it is done by theatre management or the Head of Anaesthesia.
        </p>
      )}

      {loading && !board && (
        <p className="mt-6 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading the theatre days…
        </p>
      )}

      {board && board.technicians.length === 0 && board.unassigned.length === 0 && (
        <p className="mt-4 rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          Every elective theatre-day in this period was set up, certified and closed down on
          time. {board.totals.electiveTheatreDays ?? 0} theatre-days, nothing outstanding —
          that is worth saying to the technicians.
        </p>
      )}

      <div className="mt-3 space-y-2">
        {(board?.technicians ?? []).map((t) => (
          <div key={t.personId} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-bold text-gray-900">
                  {t.personName}
                  {t.sentAt && (
                    <span className="ml-2 rounded-full bg-green-50 px-2 py-0.5 text-xs font-bold text-green-700">
                      written to {t.sentAt.slice(0, 10)}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {t.theatres.join(', ')}
                  {!t.hasPhone && ' · no phone number on file'}
                  {!t.active && ' · account not active'}
                </p>
                <p className="mt-1.5 text-sm text-gray-800">{t.headline}</p>
                <button
                  type="button"
                  onClick={() => setOpen(open === t.personId ? '' : t.personId)}
                  className="mt-1 text-xs font-semibold text-primary-700 underline"
                >
                  {open === t.personId
                    ? 'Hide the days'
                    : `Show the ${t.dayCount} theatre-${t.dayCount === 1 ? 'day' : 'days'}`}
                </button>
              </div>
              {board?.canSend && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy !== ''}
                    onClick={() => void act(t, true)}
                    className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {busy === `${t.personId}-p`
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Eye className="h-3.5 w-3.5" />}
                    Preview
                  </button>
                  <button
                    type="button"
                    disabled={busy !== '' || !t.active}
                    onClick={() => void act(t, false)}
                    className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700 disabled:opacity-50"
                  >
                    {busy === `${t.personId}-s`
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Send className="h-3.5 w-3.5" />}
                    {t.sentAt ? 'Send again' : 'Send'}
                  </button>
                </div>
              )}
            </div>

            {open === t.personId && (
              <ul className="divide-y divide-gray-100 border-t border-gray-100 bg-gray-50/60">
                {t.theatreDays.map((td) => (
                  <li key={`${td.day}-${td.theatreId}`} className="px-4 py-2 text-xs text-gray-700">
                    <span className="font-semibold">{td.dayLabel}</span> — {td.theatreName}
                    <span className="ml-1 text-rose-700">· {td.bits.join('; ')}</span>
                    {td.assignedTheatreName && td.assignedTheatreName !== td.theatreName && (
                      <span className="ml-1 text-gray-500">
                        · assigned {td.assignedTheatreName}
                      </span>
                    )}
                    {td.caseCount > 0 && (
                      <span className="ml-1 text-gray-500">
                        · {td.caseCount} elective {td.caseCount === 1 ? 'case' : 'cases'}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* Theatre-days nobody can be written to about. The more serious half. */}
      {board && board.unassigned.length > 0 && (
        <section className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <UserX className="h-4 w-4" /> Theatre-days with no technician assigned
          </h2>
          <p className="mt-1 text-xs text-amber-900">
            These theatres had an elective list and no anaesthetic technician named on the
            allocation, on any case, or on a setup log. Nobody can be chased about them: they
            need somebody allocated on{' '}
            <Link href="/dashboard/theatre-readiness" className="font-semibold underline">
              theatre readiness
            </Link>{' '}
            first.
          </p>
          <ul className="mt-2 space-y-1">
            {board.unassigned.map((td) => (
              <li key={`${td.day}-${td.theatreId}`} className="text-xs text-amber-900">
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                <span className="font-semibold">{td.dayLabel}</span> — {td.theatreName} ·{' '}
                {td.bits.join('; ')}
                {td.caseCount > 0
                  && ` · ${td.caseCount} elective ${td.caseCount === 1 ? 'case' : 'cases'}`}
              </li>
            ))}
          </ul>
        </section>
      )}

      {board && (
        <p className="mt-6 flex items-start gap-2 text-xs text-gray-500">
          <ClipboardCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          A day counts as an elective day for a theatre when that theatre had an elective
          list — an allocation or a booked elective case. Days a theatre did not operate are
          not asked about, so public holidays look after themselves and a Saturday list is
          not missed.
        </p>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="font-bold text-gray-900">As it will reach them</h3>
            <p className="mt-0.5 text-xs text-gray-500">{preview.headline}</p>
            <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-xs leading-relaxed text-gray-800">
              {preview.text}
            </pre>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="mt-4 w-full rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-gray-900">{value}</p>
    </div>
  );
}
