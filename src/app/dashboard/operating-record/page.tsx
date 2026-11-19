'use client';

// ============================================================
// The operating record
// ------------------------------------------------------------
// What each surgeon, assistant and anaesthetist ACTUALLY did, as against what
// the booking said they would. Built only from cases somebody confirmed, and
// honest on the page about how much of the list that is.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import BackLink from '@/components/BackLink';
import { Users, AlertCircle, Download } from 'lucide-react';
import type { PersonRecord } from '@/lib/surgery/actualTeam';

interface Coverage {
  completed: number;
  confirmed: number;
  unconfirmed: number;
  share: number | null;
}

interface Unconfirmed {
  id: string;
  procedureName: string;
  unit: string;
  scheduledDate: string;
}

const GRADE_LABEL: Record<string, string> = {
  CONSULTANT: 'Consultant',
  SENIOR_REGISTRAR: 'Senior registrar',
  REGISTRAR: 'Registrar',
  HOUSE_OFFICER: 'House officer',
  UNRECORDED: 'Grade not recorded',
};

const firstOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const today = () => new Date().toISOString().slice(0, 10);

const mins = (v: number | null) => (v === null ? '—' : `${v} min`);
const signed = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v} min`);

export default function OperatingRecordPage() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [people, setPeople] = useState<PersonRecord[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [unconfirmed, setUnconfirmed] = useState<Unconfirmed[]>([]);
  const [thresholds, setThresholds] = useState<{ lateStartMinutes: number; overrunMinutes: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/performance/operating?from=${from}&to=${to}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error || 'Could not load the operating record');
        setPeople([]);
        return;
      }
      setPeople(d.people ?? []);
      setCoverage(d.coverage ?? null);
      setUnconfirmed(d.unconfirmed ?? []);
      setThresholds(d.thresholds ?? null);
    } catch {
      setError('A network error stopped this loading.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const exportCsv = () => {
    const head = [
      'Name', 'Staff code', 'Operated', 'Assisted', 'Anaesthetised', 'Anaesthesia assisted',
      'Total', 'Units', 'Starts measured', 'Started late', 'Median start delay (min)',
      'Durations measured', 'Median duration (min)', 'Overruns measured', 'Overran',
      'Median overrun (min)',
    ];
    const rows = people.map((p) => [
      p.name, p.staffCode ?? '', p.operated, p.assisted, p.anaesthetised, p.anaesthesiaAssisted,
      p.total, p.units.join(' / '), p.startMeasured, p.startedLate, p.medianStartDelay ?? '',
      p.durationMeasured, p.medianDuration ?? '', p.overrunMeasured, p.overran, p.medianOverrun ?? '',
    ]);
    const csv = [head, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `operating-record-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <BackLink fallback="/dashboard" className="mb-2 inline-flex items-center gap-1.5 text-primary-600 hover:text-primary-700" />

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-7 h-7 text-primary-600" />
            Operating record
          </h1>
          <p className="text-gray-600 mt-1">
            What each person actually did, from the teams confirmed after each case.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="block text-gray-600">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="block text-gray-600">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <button type="button" onClick={exportCsv} disabled={!people.length}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:text-gray-300">
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* THE HONEST HEADLINE, above the table and not under it. Every figure
          below is drawn only from confirmed cases, so a board built on a third
          of the list is a board that will be believed and should not be. */}
      {coverage && coverage.completed > 0 && (
        <div className={`mb-4 rounded-lg border p-3 text-sm ${
          (coverage.share ?? 0) >= 0.8
            ? 'border-green-200 bg-green-50 text-green-900'
            : 'border-amber-400 bg-amber-50 text-amber-900'
        }`}>
          <p className="font-semibold">
            Built on {coverage.confirmed} of {coverage.completed} completed cases
            {coverage.share !== null && ` (${Math.round(coverage.share * 100)}%)`}.
          </p>
          {coverage.unconfirmed > 0 && (
            <p className="mt-1">
              {coverage.unconfirmed} case{coverage.unconfirmed === 1 ? ' has' : 's have'} no
              confirmed team and count{coverage.unconfirmed === 1 ? 's' : ''} for nobody here.
              Whoever was in the room can confirm it from the case page.
            </p>
          )}
        </div>
      )}

      {/* The sentence this page is obliged to carry. */}
      <p className="mb-4 text-xs text-gray-500">
        A late start is a <strong>theatre</strong> figure shown per person, not a mark against a
        name. A case starts late because the list before it overran, because the porter was on
        another floor, because consent was not signed, because no anaesthetist was free, or
        because the surgeon was not there. One row cannot tell those apart and does not try.
        {thresholds && ` Late means more than ${thresholds.lateStartMinutes} minutes after the booked start; an overrun is more than ${thresholds.overrunMinutes} minutes past the booked duration.`}
      </p>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : people.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-gray-500">
          No confirmed teams in this period.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Person', 'Operated', 'Assisted', 'Anaesthetic', 'Total', 'Grade mix',
                  'Started late', 'Median delay', 'Median duration', 'Overran'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {people.map((p) => (
                <tr key={p.userId ?? p.name} className="hover:bg-gray-50 align-top">
                  <td className="px-3 py-2 text-sm">
                    <span className="font-medium text-gray-900">{p.name}</span>
                    {!p.userId && (
                      <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                        no account
                      </span>
                    )}
                    {p.units.length > 0 && (
                      <p className="text-xs text-gray-500">{p.units.join(' · ')}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm font-semibold">{p.operated}</td>
                  <td className="px-3 py-2 text-sm">
                    {p.assisted}
                    {p.firstAssistant > 0 && (
                      <span className="block text-xs text-gray-500">{p.firstAssistant} as first</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {p.anaesthetised > 0 ? p.anaesthetised : '—'}
                    {p.anaesthesiaAssisted > 0 && (
                      <span className="block text-xs text-gray-500">{p.anaesthesiaAssisted} assisting</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm font-semibold">{p.total}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {Object.entries(p.byGrade).map(([grade, posts]) => (
                      <div key={grade}>
                        {GRADE_LABEL[grade] ?? grade}:{' '}
                        {Object.entries(posts).map(([role, n]) => `${role === 'PRIMARY_SURGEON' ? 'op' : role === 'ASSISTANT' ? 'asst' : role === 'ANAESTHETIST' ? 'gas' : 'gas asst'} ${n}`).join(', ')}
                      </div>
                    ))}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {p.startMeasured === 0 ? (
                      <span className="text-gray-400">not measured</span>
                    ) : (
                      <>
                        {p.startedLate} of {p.startMeasured}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm">{signed(p.medianStartDelay)}</td>
                  <td className="px-3 py-2 text-sm">
                    {mins(p.medianDuration)}
                    {p.durationMeasured > 0 && (
                      <span className="block text-xs text-gray-500">of {p.durationMeasured}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {p.overrunMeasured === 0 ? (
                      <span className="text-gray-400">not measured</span>
                    ) : (
                      <>
                        {p.overran} of {p.overrunMeasured}
                        <span className="block text-xs text-gray-500">{signed(p.medianOverrun)}</span>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {unconfirmed.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-gray-900">
            Completed, team not confirmed ({unconfirmed.length})
          </h2>
          <p className="text-sm text-gray-600">Oldest first — these are the ones most likely to be forgotten.</p>
          <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {unconfirmed.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{u.procedureName}</span>
                  <span className="text-gray-500"> · {u.unit} · {new Date(u.scheduledDate).toLocaleDateString()}</span>
                </span>
                <a href={`/dashboard/surgeries/${u.id}`} className="shrink-0 text-primary-600 hover:underline">
                  Confirm
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
