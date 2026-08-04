'use client';

// ============================================================
// Milestone capture — one tap, from the list
// ------------------------------------------------------------
// Designed against the reason nothing was being recorded: a nurse who is
// scrubbed, or holding a patient, will not navigate three pages deep to log a
// timestamp. So the whole list is one screen, each case shows the single
// obvious next step as a large button, and one tap records it at the current
// time.
//
// Everything else — filling a skipped step, correcting a time — is behind a
// second tap, so it never competes with the thing being done eleven times a
// day at speed.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Clock,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  PHASE_META,
  PHASE_ORDER,
  STATE_LABEL,
  type CaseState,
  type Phase,
} from '@/lib/theatreOps/milestones';

interface Recorded {
  phase: Phase;
  timestamp: string;
  recordedBy?: string | null;
}

interface CaseRow {
  id: string;
  procedureName: string;
  scheduledTime: string;
  theatre: string | null;
  unit: string | null;
  surgeonName: string | null;
  surgeryType: string;
  patientName: string | null;
  folderNumber: string | null;
  recorded: Recorded[];
  next: Phase | null;
  missed: Phase[];
  state: CaseState;
  completeness: { recorded: number; essential: number; percent: number };
}

const STATE_STYLE: Record<CaseState, string> = {
  NOT_STARTED: 'bg-gray-100 text-gray-700 border-gray-200',
  ON_THE_WAY: 'bg-amber-100 text-amber-800 border-amber-200',
  IN_THEATRE: 'bg-blue-100 text-blue-800 border-blue-200',
  OPERATING: 'bg-green-100 text-green-800 border-green-300',
  FINISHING: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  COMPLETE: 'bg-gray-50 text-gray-500 border-gray-200',
};

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function MilestoneCapturePage() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [theatres, setTheatres] = useState<string[]>([]);
  const [theatre, setTheatre] = useState('all');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(
        `/api/theatre-ops/milestones?date=${date}&theatre=${encodeURIComponent(theatre)}`,
        { cache: 'no-store' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setCases(data.cases || []);
      setTheatres(data.theatres || []);
    } catch (e: any) {
      setError(e.message || 'Could not load the list');
    } finally {
      setLoading(false);
    }
  }, [date, theatre]);

  useEffect(() => {
    load();
  }, [load]);

  // A theatre display left open should stay current without anyone touching it.
  useEffect(() => {
    if (date !== today) return;
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load, date, today]);

  const record = async (surgeryId: string, phase: Phase, at?: string) => {
    setBusy(`${surgeryId}:${phase}`);
    setError(null);
    try {
      const res = await fetch('/api/theatre-ops/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surgeryId, phase, at }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not record it');
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not record it');
    } finally {
      setBusy(null);
    }
  };

  const live = cases.filter((c) => c.state !== 'COMPLETE');
  const done = cases.filter((c) => c.state === 'COMPLETE');

  const CaseCard = ({ c }: { c: CaseRow }) => {
    const open = !!expanded[c.id];
    const nextMeta = c.next ? PHASE_META[c.next] : null;

    return (
      <div className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <div className="font-semibold text-gray-900">{c.procedureName}</div>
            <div className="text-sm text-gray-600">
              {c.scheduledTime} · {c.patientName || 'Patient not named'}
              {c.folderNumber ? ` (${c.folderNumber})` : ''}
            </div>
            <div className="text-xs text-gray-500">
              {c.theatre || 'Theatre not allocated'}
              {c.unit ? ` · ${c.unit}` : ''}
              {c.surgeryType !== 'ELECTIVE' ? ` · ${c.surgeryType}` : ''}
            </div>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full border ${STATE_STYLE[c.state]}`}>
            {STATE_LABEL[c.state]}
          </span>
        </div>

        {/* The one tap this screen exists for. */}
        {c.next && nextMeta ? (
          <button
            onClick={() => record(c.id, c.next as Phase)}
            disabled={busy === `${c.id}:${c.next}`}
            className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-base disabled:opacity-60"
          >
            {busy === `${c.id}:${c.next}` ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Check className="w-5 h-5" />
            )}
            {nextMeta.label} — now
          </button>
        ) : (
          <div className="text-center text-sm text-gray-500 py-2">
            Every milestone recorded.
          </div>
        )}
        {nextMeta && <p className="mt-1.5 text-xs text-gray-500 text-center">{nextMeta.hint}</p>}

        {/* What has been recorded so far. */}
        {c.recorded.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {c.recorded.map((r) => (
              <span
                key={r.phase}
                className="text-[11px] px-2 py-1 rounded-full bg-gray-100 text-gray-700 border"
                title={r.recordedBy ? `Recorded by ${r.recordedBy}` : undefined}
              >
                {PHASE_META[r.phase]?.label ?? r.phase} {clock(r.timestamp)}
              </span>
            ))}
          </div>
        )}

        {c.missed.length > 0 && (
          <p className="mt-2 text-xs text-amber-700 flex items-start gap-1">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            Skipped: {c.missed.map((m) => PHASE_META[m].label).join(', ')} — add below if you know the time.
          </p>
        )}

        <button
          onClick={() => setExpanded((e) => ({ ...e, [c.id]: !open }))}
          className="mt-3 text-xs text-gray-600 hover:underline flex items-center gap-1"
        >
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {open ? 'Hide' : 'Record another milestone or fill a gap'}
        </button>

        {open && (
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {PHASE_ORDER.map((p) => {
              const already = c.recorded.some((r) => r.phase === p);
              return (
                <button
                  key={p}
                  onClick={() => record(c.id, p)}
                  disabled={already || busy === `${c.id}:${p}`}
                  className={`px-2 py-2 rounded-lg text-xs border ${
                    already
                      ? 'bg-gray-50 text-gray-400 border-gray-200'
                      : 'bg-white hover:bg-emerald-50 text-gray-800 border-gray-300'
                  }`}
                >
                  {already && <Check className="w-3 h-3 inline mr-1" />}
                  {PHASE_META[p].label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const overall = cases.length
    ? Math.round(cases.reduce((s, c) => s + c.completeness.percent, 0) / cases.length)
    : null;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-emerald-600" />
            Record Milestones
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            One tap, as it happens. Everything the theatre reports is built from these times.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={theatre}
            onChange={(e) => setTheatre(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="all">All theatres</option>
            {theatres.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm"
          />
          <button onClick={load} className="p-2 rounded-lg border hover:bg-gray-50" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {overall !== null && (
        <div className="mb-4 rounded-lg border bg-white px-4 py-2.5 text-sm flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-semibold text-gray-900">{cases.length} cases</span>
          <span className={overall < 50 ? 'text-amber-700' : 'text-green-700'}>
            <strong>{overall}%</strong> of the essential milestones recorded
          </span>
          <span className="text-xs text-gray-500">
            Punctuality, turnover and the delay detector all read these.
          </span>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading && cases.length === 0 ? (
        <div className="py-16 text-center text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          Loading today&apos;s list…
        </div>
      ) : cases.length === 0 ? (
        <div className="p-8 rounded-xl border border-dashed text-center text-sm text-gray-500">
          No cases booked for this date{theatre !== 'all' ? ' in this theatre' : ''}.
        </div>
      ) : (
        <>
          <div className="space-y-3 mb-8">
            {live.map((c) => (
              <CaseCard key={c.id} c={c} />
            ))}
          </div>

          {done.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                Finished ({done.length})
              </h2>
              <div className="space-y-3">
                {done.map((c) => (
                  <CaseCard key={c.id} c={c} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <div className="mt-8 text-xs text-gray-400">
        <Link href="/dashboard/theatre-ops" className="hover:underline">
          ← Theatre operations board
        </Link>
      </div>
    </div>
  );
}
