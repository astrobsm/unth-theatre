'use client';

// ============================================================
// Surgical practice, counted from the hospital's own operation notes
// ------------------------------------------------------------
// A sub-page of Research & Analytics, so it inherits that module's access
// rather than introducing a second set of rules for the same audience.
//
// THE PAGE IS ORDERED THE WAY THE NUMBERS SHOULD BE TRUSTED, and that order is
// deliberate and unusual. Documentation completeness comes FIRST, above every
// distribution and every comparison. For the first year that is very probably
// the only honest finding available, and a reader who sees "wound class
// recorded in 12% of notes" before seeing a pie chart of wound classes has been
// told the one thing needed to read the pie chart correctly.
//
// Putting it last, under a heading like "data quality", is how a percentage
// computed from eleven cases out of six hundred ends up in a presentation.
//
// NOTHING ON THIS PAGE ASSERTS A CAUSE. The wording comes from the analytics
// module, which is where the constraint is tested; this file adds no sentences
// of its own about what any number means beyond what that module returns.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowLeft, BarChart3, Download, FlaskConical, Info, Loader2, RefreshCw,
} from 'lucide-react';

interface DistributionItem {
  value: string; label: string; count: number; percent: number;
}
interface Distribution {
  title: string; total: number; notRecorded: number;
  items: DistributionItem[]; overlapping?: boolean;
}
interface VariationFinding {
  value: string; label: string; lowest: number; highest: number;
  spread: number; groupsCompared: number; statement: string;
}
interface CompletenessItem {
  field: string; title: string; recorded: number; total: number; percent: number;
}
interface Payload {
  total: number;
  message?: string;
  scope?: { from: string | null; to: string | null; unit: string | null };
  distributions: Distribution[];
  cleansingSteps?: { steps: number; notes: number }[];
  variation: VariationFinding[];
  completeness: CompletenessItem[];
  caveat?: string;
}

/** Bar colour by how complete a field is. Nothing is green below 80%. */
function completenessColour(percent: number): string {
  if (percent >= 80) return 'bg-green-500';
  if (percent >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

export default function SurgicalPracticePage() {
  const [data, setData] = useState<Payload | null>(null);
  const [units, setUnits] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [unit, setUnit] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const q = new URLSearchParams();
      if (from) q.set('from', new Date(from).toISOString());
      if (to) q.set('to', new Date(`${to}T23:59:59`).toISOString());
      if (unit) q.set('unit', unit);
      const res = await fetch(`/api/post-op-notes/analytics?${q.toString()}`, { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErr(body.error || 'Could not load the practice figures.');
        return;
      }
      setData(await res.json());
    } catch {
      setErr('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [from, to, unit]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    fetch('/api/surgical-units', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const list = Array.isArray(d) ? d : d.units ?? [];
        setUnits(Array.from(new Set(list.map((u: { name?: string }) => u.name).filter(Boolean))) as string[]);
      })
      .catch(() => {});
  }, []);

  /**
   * The figures as a CSV, for whoever is writing the audit up.
   *
   * Every row carries its denominator. A share without the number it was
   * computed from is the thing that gets quoted out of context, and the
   * spreadsheet is exactly where that happens.
   */
  const csv = useMemo(() => {
    if (!data) return '';
    const rows: string[][] = [['Section', 'Item', 'Count', 'Denominator', 'Percent']];
    for (const c of data.completeness) {
      rows.push(['Completeness', c.title, String(c.recorded), String(c.total), String(c.percent)]);
    }
    for (const d of data.distributions) {
      for (const item of d.items) {
        rows.push([d.title, item.label, String(item.count), String(d.total), String(item.percent)]);
      }
      if (d.notRecorded > 0) {
        rows.push([d.title, 'Not recorded', String(d.notRecorded), String(d.total),
          String(Math.round((d.notRecorded / d.total) * 1000) / 10)]);
      }
    }
    return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
  }, [data]);

  const download = () => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `surgical-practice-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <Link href="/dashboard/research" className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800">
        <ArrowLeft className="h-4 w-4" /> Research &amp; Analytics
      </Link>

      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md">
          <FlaskConical className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Surgical Practice Review</h1>
          <p className="text-sm text-gray-500">
            Counted from signed operation notes. Preparation, technique, orders and documentation.
          </p>
        </div>
      </div>

      {/* ── Scope ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <div>
          <label htmlFor="from" className="mb-1 block text-xs font-medium text-gray-600">From</label>
          <input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label htmlFor="to" className="mb-1 block text-xs font-medium text-gray-600">To</label>
          <input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label htmlFor="unit" className="mb-1 block text-xs font-medium text-gray-600">Unit</label>
          <select id="unit" value={unit} onChange={(e) => setUnit(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm">
            <option value="">All units</option>
            {units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <button onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
        {data && data.total > 0 && (
          <button onClick={download}
            className="inline-flex items-center gap-1.5 rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
            <Download className="h-4 w-4" /> CSV
          </button>
        )}
        <span className="ml-auto text-sm text-gray-600">
          {loading ? <Loader2 className="inline h-4 w-4 animate-spin" />
            : data ? <><span className="font-semibold text-gray-900">{data.total}</span> signed notes</>
            : null}
        </span>
      </div>

      {err && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
      )}

      {data && data.total === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
          <BarChart3 className="mx-auto h-8 w-8 text-gray-400" />
          <h2 className="mt-2 font-semibold text-gray-900">Nothing to count yet</h2>
          <p className="mx-auto mt-1 max-w-lg text-sm text-gray-600">
            {data.message ?? 'No signed structured operation notes fall in this period.'} Figures appear
            here as surgeons sign notes on the new form; notes written on the old free-text field carry no
            structured fields and cannot be counted.
          </p>
        </div>
      )}

      {data && data.total > 0 && (
        <>
          {/* ── Completeness. First, deliberately. ───────────────────────── */}
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-3">
              <h2 className="font-bold text-gray-900">How much of the note is being filled in</h2>
              <p className="mt-1 text-sm text-gray-600">
                Read this before anything below it. A field completed in a small minority of notes cannot
                support a finding, however clean the chart of it looks.
              </p>
            </div>
            <div className="space-y-3 p-4">
              {data.completeness.map((c) => (
                <div key={c.field}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span className="text-gray-800">{c.title}</span>
                    <span className="tabular-nums text-gray-600">
                      {c.recorded} of {c.total} · <span className="font-semibold">{c.percent}%</span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded bg-gray-100">
                    <div className={`h-full ${completenessColour(c.percent)}`} style={{ width: `${c.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Practice variation ───────────────────────────────────────── */}
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-3">
              <h2 className="font-bold text-gray-900">Variation between units</h2>
              <p className="mt-1 text-sm text-gray-600">
                Compared by unit rather than by surgeon, and only across units with enough cases to compare.
              </p>
            </div>
            <div className="p-4">
              {data.variation.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No variation wide enough to report, or not yet enough cases in two or more units to
                  compare them. Nothing is inferred from that either way.
                </p>
              ) : (
                <div className="space-y-3">
                  {data.variation.map((v) => (
                    <div key={v.value} className="rounded border border-gray-200 bg-gray-50 p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium text-gray-900">{v.label}</span>
                        <span className="text-sm tabular-nums text-gray-600">
                          {v.lowest}% – {v.highest}%
                          <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-semibold text-indigo-800">
                            {v.spread} point spread
                          </span>
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">{v.statement}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ── The preparation sequence ─────────────────────────────────── */}
          {data.cleansingSteps && data.cleansingSteps.length > 0 && (
            <section className="rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-200 px-4 py-3">
                <h2 className="font-bold text-gray-900">Cleansing steps per operation</h2>
                <p className="mt-1 text-sm text-gray-600">
                  How many cleansing steps were recorded before draping. This is the question the
                  step-by-step record exists to answer, and a single free-text preparation field could
                  not have answered it at all.
                </p>
              </div>
              <div className="p-4">
                <div className="flex flex-wrap gap-3">
                  {data.cleansingSteps.map((s) => (
                    <div key={s.steps} className="rounded border border-gray-200 px-4 py-2 text-center">
                      <div className="text-2xl font-bold tabular-nums text-gray-900">{s.notes}</div>
                      <div className="text-xs text-gray-600">
                        {s.steps === 0 ? 'none recorded' : `${s.steps} step${s.steps === 1 ? '' : 's'}`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ── Distributions ───────────────────────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-2">
            {data.distributions.map((d) => (
              <section key={d.title} className="rounded-lg border border-gray-200 bg-white">
                <div className="border-b border-gray-200 px-4 py-3">
                  <h3 className="font-semibold text-gray-900">{d.title}</h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {d.overlapping
                      ? 'Several may apply to one operation, so these add up to more than 100%.'
                      : 'One per operation.'}
                    {d.notRecorded > 0 && (
                      <span className="ml-1 text-amber-700">
                        {d.notRecorded} of {d.total} not recorded.
                      </span>
                    )}
                  </p>
                </div>
                <div className="space-y-2 p-4">
                  {d.items.length === 0 ? (
                    <p className="text-sm text-gray-500">Nothing recorded in this period.</p>
                  ) : d.items.map((item) => (
                    <div key={item.value}>
                      <div className="mb-0.5 flex items-baseline justify-between text-sm">
                        <span className="text-gray-800">{item.label}</span>
                        <span className="tabular-nums text-gray-600">
                          {item.count} <span className="text-gray-400">·</span> {item.percent}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded bg-gray-100">
                        <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, item.percent)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* ── The caveat, in full, at the bottom where it is read last ─── */}
          {data.caveat && (
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div className="text-sm text-amber-900">
                <p className="font-semibold">How to read these figures</p>
                <p className="mt-1">{data.caveat}</p>
                <p className="mt-2 flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Before quoting any figure here, check its completeness bar at the top of the page.
                  </span>
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
