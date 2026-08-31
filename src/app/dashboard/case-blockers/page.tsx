'use client';

/**
 * What is stopping theatre today, and what stopped it before.
 *
 * The manager's side of the report button. Two things it must do: show what is
 * blocked RIGHT NOW so somebody can go and unblock it, and count the reasons
 * over time — because a delay you can count is a delay you can argue about
 * with a budget, and one you cannot is just a bad morning everybody remembers
 * differently.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Clock, CheckCircle2, XCircle, CalendarClock } from 'lucide-react';
import { BLOCKER_REASONS, CASE_OUTCOMES, describeBlocker, type CaseOutcome } from '@/lib/caseBlockers';

interface Report {
  id: string;
  surgeryId: string;
  reason: string;
  detail: string | null;
  reportedByName: string;
  reportedByRole: string | null;
  reportedAt: string;
  minutesLate: number | null;
  outcome: string;
  outcomeNote: string | null;
  surgery?: {
    id: string; procedureName: string; unit: string | null;
    scheduledTime: string | null; surgeonName: string | null;
    surgeryType: string; status: string;
  };
}

const today = () => new Date().toISOString().slice(0, 10);

const outcomeChip: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-900 border-amber-200',
  COMPLETED: 'bg-green-100 text-green-800 border-green-200',
  RESCHEDULED: 'bg-blue-100 text-blue-800 border-blue-200',
  CANCELLED: 'bg-red-100 text-red-800 border-red-200',
};

export default function CaseBlockersPage() {
  const [date, setDate] = useState(today());
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/case-blockers?date=${date}`, { cache: 'no-store' });
      const d = await r.json();
      setReports(Array.isArray(d.reports) ? d.reports : []);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { void load(); }, [load]);

  const setOutcome = async (report: Report, outcome: CaseOutcome) => {
    setBusyId(report.id);
    try {
      await fetch('/api/case-blockers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surgeryId: report.surgeryId, reportId: report.id, outcome }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const unresolved = useMemo(() => reports.filter((r) => r.outcome === 'PENDING'), [reports]);

  /** The count that makes a case for changing something. */
  const byReason = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of reports) m.set(r.reason, (m.get(r.reason) ?? 0) + 1);
    // Array.from, not spread: this project targets a lib without
    // downlevelIteration, so spreading a Map iterator does not compile.
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [reports]);

  const label = (code: string) =>
    BLOCKER_REASONS.find((r) => r.code === code)?.label ?? code;

  return (
    <div className="p-4 sm:p-6 max-w-5xl">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <AlertTriangle className="h-5 w-5 text-amber-600" /> Blocked cases
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            What stopped a case starting, who reported it, and what became of it.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="text-xs text-gray-600">
            <span className="mb-1 block font-medium">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : reports.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-green-500" />
          <p className="text-sm font-medium text-gray-900">Nothing reported on this date.</p>
          <p className="mt-1 text-sm text-gray-500">
            Either everything ran, or nobody reported what did not. Both are worth knowing —
            an empty day here and a late list on the board mean the button is not being used.
          </p>
        </div>
      ) : (
        <>
          {unresolved.length > 0 && (
            <div className="mb-4 rounded-lg border-l-4 border-amber-500 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-900">
                {unresolved.length} case{unresolved.length === 1 ? '' : 's'} still waiting
              </p>
              <p className="text-xs text-amber-800">
                These have been reported and nobody has recorded what happened next.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {reports.map((r) => (
              <div key={r.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">
                      {r.surgery?.procedureName ?? 'Case'}
                      {r.surgery?.unit && <span className="font-normal text-gray-500"> · {r.surgery.unit}</span>}
                    </p>
                    <p className="mt-0.5 text-sm text-gray-700">{label(r.reason)}</p>
                    {r.detail && <p className="mt-0.5 text-sm italic text-gray-600">&ldquo;{r.detail}&rdquo;</p>}
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${outcomeChip[r.outcome] ?? ''}`}>
                    {CASE_OUTCOMES.find((o) => o.code === r.outcome)?.label ?? r.outcome}
                  </span>
                </div>

                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(r.reportedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {typeof r.minutesLate === 'number' && r.minutesLate > 0 && (
                    <span className="font-medium text-amber-700">{r.minutesLate} min late</span>
                  )}
                  <span>
                    {r.reportedByName}
                    {r.reportedByRole ? ` · ${r.reportedByRole.replace(/_/g, ' ').toLowerCase()}` : ''}
                  </span>
                  {r.surgery?.scheduledTime && <span>scheduled {r.surgery.scheduledTime}</span>}
                </p>

                {r.outcome === 'PENDING' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(['COMPLETED', 'RESCHEDULED', 'CANCELLED'] as CaseOutcome[]).map((o) => (
                      <button
                        key={o}
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void setOutcome(r, o)}
                        className="inline-flex items-center gap-1.5 rounded border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-40"
                      >
                        {o === 'COMPLETED' && <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
                        {o === 'RESCHEDULED' && <CalendarClock className="h-3.5 w-3.5 text-blue-600" />}
                        {o === 'CANCELLED' && <XCircle className="h-3.5 w-3.5 text-red-600" />}
                        {CASE_OUTCOMES.find((c) => c.code === o)?.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <section className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h2 className="text-sm font-semibold text-gray-900">Reasons on this date</h2>
            <p className="mb-2 text-xs text-gray-500">
              The top row is the one worth fixing. A reason that appears once is a bad
              morning; the same reason every week is a system that needs changing.
            </p>
            <ul className="space-y-1 text-sm">
              {byReason.map(([code, n]) => (
                <li key={code} className="flex justify-between gap-3">
                  <span className="text-gray-700">{label(code)}</span>
                  <span className="font-semibold tabular-nums text-gray-900">{n}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
