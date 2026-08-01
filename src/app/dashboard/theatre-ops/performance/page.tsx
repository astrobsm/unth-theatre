'use client';

// ============================================================
// Theatre performance — the management picture
// ------------------------------------------------------------
// Section 13's indicators, presented so they cannot be misread.
//
// The single most important thing on this page is RECORD COMPLETENESS, and it
// is at the top rather than buried in a footnote. Every other figure is drawn
// from the milestones somebody remembered to tap; if half of them are missing,
// the on-time rate describes the half that were recorded and nothing else.
// A dashboard that shows "62% on time" in large type above a completeness of
// 30% is actively misleading, so this one says so first.
//
// Small samples are greyed and labelled rather than ranked. A theatre with
// three assessable cases is not comparable with one that had two hundred, and
// putting them in the same ordered list invites exactly that comparison.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, BarChart3, Info, RefreshCw } from 'lucide-react';
import { formatMinutes } from '@/lib/theatreOps/durations';
import { MIN_SAMPLE_FOR_RANKING } from '@/lib/theatreOps/analytics';

interface Group {
  key: string;
  cases: number;
  assessed: number;
  onTimePercent: number | null;
  averageDelayMinutes: number | null;
  averageOperativeMinutes: number | null;
  incompleteRecords: number;
  smallSample: boolean;
}

interface Bottleneck {
  code: string; label: string; group: string; count: number;
  totalMinutes: number; averageMinutes: number; avoidable: boolean; sharePercent: number;
}

interface Department {
  role: string; raised: number; acknowledged: number; resolved: number;
  stillOpen: number; averageAcknowledgeMinutes: number | null;
  averageResolveMinutes: number | null; neverAcknowledged: number; smallSample: boolean;
}

interface Analytics {
  period: { from: string; to: string; days: number };
  overall: Group & { emergencies: number; recordCompleteness: number | null };
  byTheatre: Group[];
  bySpecialty: Group[];
  utilisation: { occupiedMinutes: number; availableMinutes: number; percent: number | null; unrecorded: number };
  bottlenecks: Bottleneck[];
  byDepartment: Department[];
  totals: { cases: number; delaysRecorded: number; escalationsRaised: number; daysWithLists: number };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function TheatrePerformancePage() {
  const [from, setFrom] = useState(iso(new Date(Date.now() - 30 * 86_400_000)));
  const [to, setTo] = useState(iso(new Date()));
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/theatre-ops/analytics?from=${from}&to=${to}`);
      if (res.status === 401 || res.status === 403) {
        const b = await res.json().catch(() => ({}));
        setDenied(true);
        setError(b.error || 'These figures are shown to consultants and management.');
        return;
      }
      if (!res.ok) throw new Error();
      setDenied(false);
      setData(await res.json());
    } catch {
      setError('Could not produce the figures.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

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

  const completeness = data?.overall.recordCompleteness ?? null;
  const trustworthy = completeness !== null && completeness >= 70;

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-100">
            <BarChart3 className="h-6 w-6 text-primary-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Theatre Performance</h1>
            <p className="text-sm text-gray-500">
              {data ? `${data.totals.cases} cases over ${data.period.days} days` : 'Loading…'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-2 text-sm" />
          <span className="text-xs text-gray-400">to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-2 text-sm" />
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {error && !denied && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>}

      {/* Completeness first. Everything below is only as good as this. */}
      {data && completeness !== null && (
        <div className={`rounded-xl border p-4 ${trustworthy ? 'border-green-200 bg-green-50' : 'border-amber-300 bg-amber-50'}`}>
          <div className="flex items-start gap-3">
            {trustworthy ? <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-700" />
                         : <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700" />}
            <div>
              <p className={`font-semibold ${trustworthy ? 'text-green-900' : 'text-amber-900'}`}>
                Record completeness: {completeness}%
              </p>
              <p className={`mt-0.5 text-sm ${trustworthy ? 'text-green-800' : 'text-amber-800'}`}>
                {trustworthy
                  ? 'Enough milestones were recorded for the figures below to describe the whole list.'
                  : `Only ${data.overall.assessed} of ${data.overall.cases} cases could be assessed. Every figure below describes those cases and no others — it is not a picture of the theatre. Milestone recording has to improve before these numbers mean anything.`}
              </p>
            </div>
          </div>
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Started on time" value={data.overall.onTimePercent === null ? '—' : `${data.overall.onTimePercent}%`}
              hint={`from ${data.overall.assessed} assessable case${data.overall.assessed === 1 ? '' : 's'}`}
              muted={data.overall.smallSample} />
            <Tile label="Average delay when late" value={formatMinutes(data.overall.averageDelayMinutes)} />
            <Tile label="Theatre utilisation" value={data.utilisation.percent === null ? '—' : `${data.utilisation.percent}%`}
              hint={data.utilisation.unrecorded > 0 ? `${data.utilisation.unrecorded} case(s) unmeasured — understated` : undefined}
              muted={data.utilisation.unrecorded > 0} />
            <Tile label="Delays recorded" value={String(data.totals.delaysRecorded)}
              hint={`${data.totals.escalationsRaised} escalation(s) raised`} />
          </div>

          <Section title="By theatre" note={`Groups with fewer than ${MIN_SAMPLE_FOR_RANKING} assessable cases are shown greyed — too few to compare.`}>
            <GroupTable rows={data.byTheatre} />
          </Section>

          <Section title="By specialty">
            <GroupTable rows={data.bySpecialty} />
          </Section>

          <Section title="What costs the most time"
            note="Ranked by minutes lost, not by how often it happens — a rare, expensive cause matters more than a frequent trivial one.">
            {data.bottlenecks.length === 0 ? (
              <p className="px-3 py-4 text-sm text-gray-500">No delays were recorded in this period.</p>
            ) : (
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-2 font-medium">Cause</th>
                    <th className="px-3 py-2 font-medium">Group</th>
                    <th className="px-3 py-2 text-right font-medium">Times</th>
                    <th className="px-3 py-2 text-right font-medium">Time lost</th>
                    <th className="px-3 py-2 text-right font-medium">Average</th>
                    <th className="px-3 py-2 text-right font-medium">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.bottlenecks.map((b) => (
                    <tr key={b.code}>
                      <td className="px-3 py-2 text-gray-900">
                        {b.label}
                        {b.avoidable && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-800">avoidable</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{b.group}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">{b.count}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">{formatMinutes(b.totalMinutes)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">{formatMinutes(b.averageMinutes)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">{b.sharePercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section title="How departments respond"
            note="Response times cover escalations that WERE answered. Ones that never were are counted separately — an unanswered escalation is a failure, not a slow reply.">
            {data.byDepartment.length === 0 ? (
              <p className="px-3 py-4 text-sm text-gray-500">Nothing was escalated in this period.</p>
            ) : (
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-2 font-medium">Department</th>
                    <th className="px-3 py-2 text-right font-medium">Raised</th>
                    <th className="px-3 py-2 text-right font-medium">To acknowledge</th>
                    <th className="px-3 py-2 text-right font-medium">To resolve</th>
                    <th className="px-3 py-2 text-right font-medium">Still open</th>
                    <th className="px-3 py-2 text-right font-medium">Never answered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.byDepartment.map((d) => (
                    <tr key={d.role} className={d.smallSample ? 'text-gray-400' : ''}>
                      <td className="px-3 py-2 font-medium">
                        {d.role.replace(/_/g, ' ').toLowerCase()}
                        {d.smallSample && <span className="ml-1 text-[10px]">(too few to judge)</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.raised}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMinutes(d.averageAcknowledgeMinutes)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMinutes(d.averageResolveMinutes)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.stillOpen}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${d.neverAcknowledged > 0 && !d.smallSample ? 'font-semibold text-red-700' : ''}`}>
                        {d.neverAcknowledged}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function GroupTable({ rows }: { rows: Group[] }) {
  if (rows.length === 0) return <p className="px-3 py-4 text-sm text-gray-500">No cases in this period.</p>;
  return (
    <table className="w-full min-w-[560px] text-sm">
      <thead>
        <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <th className="px-3 py-2 font-medium">Name</th>
          <th className="px-3 py-2 text-right font-medium">Cases</th>
          <th className="px-3 py-2 text-right font-medium">Assessed</th>
          <th className="px-3 py-2 text-right font-medium">On time</th>
          <th className="px-3 py-2 text-right font-medium">Avg delay</th>
          <th className="px-3 py-2 text-right font-medium">Avg operating</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((r) => (
          // Greyed rather than ranked: too few cases to compare with anything.
          <tr key={r.key} className={r.smallSample ? 'text-gray-400' : 'text-gray-700'}>
            <td className="px-3 py-2 font-medium">
              {r.key}
              {r.smallSample && <span className="ml-1 text-[10px]">(too few to compare)</span>}
            </td>
            <td className="px-3 py-2 text-right tabular-nums">{r.cases}</td>
            <td className="px-3 py-2 text-right tabular-nums">{r.assessed}</td>
            <td className="px-3 py-2 text-right tabular-nums">{r.onTimePercent === null ? '—' : `${r.onTimePercent}%`}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatMinutes(r.averageDelayMinutes)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatMinutes(r.averageOperativeMinutes)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {note && <p className="mt-0.5 text-xs text-gray-500">{note}</p>}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function Tile({ label, value, hint, muted }: { label: string; value: string; hint?: string; muted?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${muted ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-white'}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${muted ? 'text-gray-500' : 'text-gray-900'}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-gray-500">{hint}</p>}
    </div>
  );
}
