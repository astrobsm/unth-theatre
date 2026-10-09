'use client';

// ============================================================
// Case mix — how many operations, of what size, by whom
// ------------------------------------------------------------
// The question an audit meeting opens with, and the one ORM could not answer
// without somebody counting rows by hand.
//
// WHAT THE PAGE INSISTS ON SAYING. ORM holds two different answers to "how
// big was this operation": an assessed complexity class on cases that were
// written up, and a booking magnitude on nearly all of them. They differ in
// coverage and in banding — there is no Supermajor at booking, because nobody
// knows yet.
//
// So the provenance is on the page, not in a footnote. "142 Major" means
// something quite different if 20 were assessed and 122 assumed from the
// booking form, and a committee reading the first as the second will draw the
// wrong conclusion confidently.
//
// Unclassified is a column like any other. A theatre assessing complexity on
// a third of its work would otherwise appear, in its own report, to perform a
// third as many operations as it does.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, BarChart3, Download, Loader2, RefreshCw,
} from 'lucide-react';

const BANDS = ['Minor', 'Intermediate', 'Major', 'Supermajor', 'Unclassified'] as const;
type Band = (typeof BANDS)[number];

/** Colour by severity, with Unclassified deliberately grey rather than alarming. */
const BAND_TONE: Record<Band, string> = {
  Minor: 'bg-emerald-100 text-emerald-900',
  Intermediate: 'bg-sky-100 text-sky-900',
  Major: 'bg-amber-100 text-amber-900',
  Supermajor: 'bg-red-100 text-red-900',
  Unclassified: 'bg-gray-100 text-gray-600',
};

interface Group { key: string; counts: Record<Band, number>; total: number }

interface Result {
  total: number;
  counts: Record<Band, number>;
  provenance: { assessed: number; booking: number; none: number };
  byMonth: Group[];
  bySubspecialty: Group[];
  byUnit: Group[];
  window: { from: string; to: string };
  note: string;
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return new Date(Date.UTC(y, m - 1, 1))
    .toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Twelve months back from today, which is the question most people arrive with. */
function defaultWindow() {
  const to = new Date();
  const from = new Date(Date.UTC(to.getUTCFullYear() - 1, to.getUTCMonth(), to.getUTCDate()));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function CaseMixPage() {
  // Lazy initialisers: defaultWindow() runs once, not on every render. As a
  // plain call it would also rebuild the object each time and make any effect
  // depending on it run forever.
  const [from, setFrom] = useState(() => defaultWindow().from);
  const [to, setTo] = useState(() => defaultWindow().to);
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/case-mix?from=${f}&to=${t}`, { cache: 'no-store' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? 'That could not be loaded.'); return; }
      setData(d as Result);
    } catch {
      setError('The server did not answer. Check the connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // The first load, once. Guarded by state rather than an empty dependency
  // array so the declared dependencies are honest — a lie there is how an
  // effect quietly stops re-running when somebody later adds a dependency it
  // actually needs.
  useEffect(() => {
    if (loadedOnce) return;
    setLoadedOnce(true);
    void load(from, to);
  }, [loadedOnce, from, to, load]);

  /** CSV of every breakdown, for the committee pack. */
  const exportCsv = () => {
    if (!data) return;
    const lines: string[] = [];
    const section = (title: string, rows: Group[]) => {
      lines.push('', title, ['', ...BANDS, 'Total'].join(','));
      for (const r of rows) {
        lines.push([
          `"${r.key.replace(/"/g, '""')}"`,
          ...BANDS.map((b) => r.counts[b] ?? 0), r.total,
        ].join(','));
      }
    };
    lines.push(`Case mix,${data.window.from} to ${data.window.to}`);
    lines.push(`Total cases,${data.total}`);
    lines.push(`Assessed,${data.provenance.assessed},From booking,${data.provenance.booking},Unclassified,${data.provenance.none}`);
    section('By month', data.byMonth.map((m) => ({ ...m, key: monthLabel(m.key) })));
    section('By subspecialty', data.bySubspecialty);
    section('By unit', data.byUnit);

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `case-mix-${data.window.from}-to-${data.window.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const Table = ({ title, rows, firstCol }: { title: string; rows: Group[]; firstCol: string }) => (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-gray-200">
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-gray-600">No cases in this window.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b-2 border-gray-900 text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3">{firstCol}</th>
                {BANDS.map((b) => <th key={b} className="py-2 pr-3 text-right">{b}</th>)}
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-gray-100">
                  <td className="py-2 pr-3 font-medium text-gray-900">{r.key}</td>
                  {BANDS.map((b) => (
                    <td key={b} className="py-2 pr-3 text-right tabular-nums text-gray-700">
                      {r.counts[b] ? r.counts[b] : <span className="text-gray-300">—</span>}
                    </td>
                  ))}
                  <td className="py-2 text-right font-bold tabular-nums text-gray-900">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <BarChart3 className="h-6 w-6 text-indigo-600" /> Case mix
        </h1>
        <p className="mt-1 max-w-2xl text-gray-600">
          Operations by size — minor, intermediate, major and supermajor — broken down by
          month, subspecialty and unit, over any period.
        </p>
      </div>

      {/* ── Window ── */}
      <form
        onSubmit={(e) => { e.preventDefault(); void load(from, to); }}
        className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-5 ring-1 ring-gray-200"
      >
        <label className="block">
          <span className="block text-xs font-semibold text-gray-700">From</span>
          <input
            id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-700">To</span>
          <input
            id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit" disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Generate
        </button>
        {data && (
          <button
            type="button" onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-800 ring-1 ring-gray-300 hover:bg-gray-50"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        )}
      </form>

      {error && (
        <p className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}
        </p>
      )}

      {data && (
        <>
          {/* ── Totals ── */}
          <section className="rounded-2xl bg-white p-5 ring-1 ring-gray-200">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-lg font-bold text-gray-900">
                {data.total.toLocaleString()} case{data.total === 1 ? '' : 's'}
              </h2>
              <p className="font-mono text-xs text-gray-500">
                {data.window.from} → {data.window.to}
              </p>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-5">
              {BANDS.map((b) => (
                <div key={b} className={`rounded-xl px-3 py-3 ${BAND_TONE[b]}`}>
                  <p className="text-2xl font-bold tabular-nums">{data.counts[b] ?? 0}</p>
                  <p className="text-xs font-semibold">{b}</p>
                </div>
              ))}
            </div>

            {/* The sentence that stops the numbers being over-read. */}
            <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <p>
                <span className="font-semibold tabular-nums">{data.provenance.assessed}</span> of
                these were banded from a completed complexity assessment.{' '}
                <span className="font-semibold tabular-nums">{data.provenance.booking}</span> had
                none, so the magnitude recorded at booking was used instead — that scale has no
                supermajor, so some of those may in fact have been larger than they appear here.{' '}
                <span className="font-semibold tabular-nums">{data.provenance.none}</span> had
                neither and are shown as unclassified rather than left out.
              </p>
              {data.provenance.assessed < data.total / 2 && data.total > 0 && (
                <p className="mt-2 font-semibold text-amber-900">
                  Fewer than half of these cases were formally assessed, so this is a rough
                  picture of the hospital&rsquo;s workload rather than a measured one. More
                  post-operative complexity assessments would sharpen it.
                </p>
              )}
            </div>
          </section>

          <Table title="By month" rows={data.byMonth.map((m) => ({ ...m, key: monthLabel(m.key) }))} firstCol="Month" />
          <Table title="By subspecialty" rows={data.bySubspecialty} firstCol="Subspecialty" />
          <Table title="By unit" rows={data.byUnit} firstCol="Unit" />
        </>
      )}

      {loading && !data && (
        <p className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Counting…
        </p>
      )}
    </div>
  );
}
