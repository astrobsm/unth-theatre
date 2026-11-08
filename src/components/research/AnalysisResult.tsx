'use client';

/**
 * Rendering a result so it cannot be read as more than it is.
 *
 * Every analysis in this module comes back with words beside its numbers — a
 * headline, a plain-English paragraph, the cautions that weaken it, and a
 * sentence in the form a results section uses. This component always shows all
 * four, in that order, and the cautions are not collapsed by default. A p-value
 * on its own gets read as a verdict; a p-value with "only 38% of cases had this
 * recorded" underneath it does not.
 *
 * The charts follow the same rule. A Kaplan-Meier curve is drawn stepped (never
 * smoothed, which invents survival between event times) and stops at the last
 * follow-up. A ROC curve carries its chance diagonal, because an AUC of 0.58
 * looks impressive as a rising line and looks like what it is next to the
 * diagonal.
 */

import { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  AlertTriangle, Copy, Check, ChevronDown, ChevronRight, Sigma, Info,
} from 'lucide-react';

const chartLoading = () => (
  <div className="h-64 flex items-center justify-center text-sm text-gray-400">Loading chart…</div>
);
const Bar = dynamic(() => import('@/components/charts/ChartKit').then((m) => m.Bar), { ssr: false, loading: chartLoading });
const Line = dynamic(() => import('@/components/charts/ChartKit').then((m) => m.Line), { ssr: false, loading: chartLoading });

/**
 * Eight categorical hues, in this order and not cycled.
 *
 * The order is load-bearing: adjacent slots are the pairs a reader has to tell
 * apart, and this sequence clears colour-vision separation on every adjacent
 * pair (worst dE 9.1 protan) as well as the normal-vision floor (worst 19.6).
 * An earlier set put amber beside red, which measured 14.4 to a reader with
 * full colour vision — two survival curves nobody could distinguish. Reordering
 * or substituting a hue means re-checking the adjacent pairs, not eyeballing it.
 *
 * A ninth group does not get a ninth hue. Nine curves on one chart cannot be
 * read anyway; the analysis wants fewer groups.
 */
export const PALETTE = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100',
  '#e87ba4', '#008300', '#6250d6', '#e34948',
];

/** One hue for a single-series chart: the bars are one measure, not eight. */
export const SINGLE_SERIES = '#2a78d6';

const num = (x: unknown, dp = 2): string => (typeof x === 'number' && Number.isFinite(x)
  ? String(Math.round(x * 10 ** dp) / 10 ** dp) : '—');

export const fmtP = (p: unknown): string => {
  if (typeof p !== 'number' || !Number.isFinite(p)) return '—';
  if (p < 0.001) return '<0.001';
  return String(Math.round(p * 10000) / 10000);
};

// ── Interpretation ───────────────────────────────────────────────────

export interface Interpretation {
  headline: string;
  plain: string;
  cautions: string[];
  reporting: string;
  significant: boolean | null;
}

export function InterpretationCard({ i }: { i: Interpretation }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(i.reporting);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — the sentence is on screen to select */ }
  };

  const tone = i.significant === true ? 'border-indigo-200 bg-indigo-50'
    : i.significant === false ? 'border-gray-200 bg-gray-50'
      : 'border-amber-200 bg-amber-50';

  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <p className="text-sm font-semibold text-gray-900 leading-snug">{i.headline}</p>
      <p className="text-sm text-gray-700 mt-2 leading-relaxed">{i.plain}</p>

      {i.cautions.length > 0 && (
        <div className="mt-3 bg-white/70 rounded-lg border border-amber-200 p-3">
          <p className="text-xs font-semibold text-amber-900 flex items-center gap-1.5 mb-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            What weakens this result ({i.cautions.length})
          </p>
          <ul className="space-y-1.5">
            {i.cautions.map((c, idx) => (
              <li key={idx} className="text-xs text-gray-700 leading-relaxed flex gap-1.5">
                <span className="text-amber-600 shrink-0">•</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 bg-white rounded-lg border border-gray-200 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            For the results section
          </p>
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 shrink-0"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="text-sm text-gray-800 mt-1 leading-relaxed">{i.reporting}</p>
      </div>
    </div>
  );
}

// ── Logistic regression ──────────────────────────────────────────────

export function LogisticTable({ res }: { res: Record<string, any> }) {
  const terms: any[] = Array.isArray(res.terms) ? res.terms : [];
  if (!res.ok) {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
        <p className="font-medium">The model was not fitted.</p>
        <p className="mt-1">{res.detail}</p>
      </div>
    );
  }
  const predictors = terms.filter((t) => t.name !== '(Intercept)');

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-x-4 gap-y-1">
        <h4 className="text-sm font-semibold text-gray-800">Multivariable logistic regression</h4>
        <span className="text-xs text-gray-500">{res.n} complete cases</span>
        <span className="text-xs text-gray-500">{res.events} events</span>
        {res.pseudoR2 !== null && (
          <span className="text-xs text-gray-500">Nagelkerke R² {num(res.pseudoR2, 3)}</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="text-left py-2 px-3">Variable</th>
              <th className="text-right py-2 px-3">Adjusted OR</th>
              <th className="text-right py-2 px-3">95% CI</th>
              <th className="text-right py-2 px-3">p</th>
            </tr>
          </thead>
          <tbody>
            {predictors.map((t) => {
              const sig = t.pValue < 0.05;
              // An interval that crosses 1 is compatible with no effect in
              // either direction, and it is marked so that nobody reads a
              // point estimate of 2.4 as a doubling.
              const crosses = t.ci95Lower < 1 && t.ci95Upper > 1;
              return (
                <tr key={t.name} className="border-b border-gray-50">
                  <td className="py-2 px-3 text-gray-800">{t.name}</td>
                  <td className={`py-2 px-3 text-right tabular-nums ${sig ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                    {num(t.oddsRatio)}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-gray-600">
                    {num(t.ci95Lower)}–{num(t.ci95Upper)}
                    {crosses && <span className="ml-1 text-[10px] text-gray-400">crosses 1</span>}
                  </td>
                  <td className={`py-2 px-3 text-right tabular-nums ${sig ? 'font-semibold text-indigo-700' : 'text-gray-600'}`}>
                    {fmtP(t.pValue)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {Array.isArray(res.references) && res.references.length > 0 && (
        <p className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100">
          Reference levels: {res.references.map((r: any) => `${r.field} = ${r.reference}`).join('; ')}
        </p>
      )}
      {Array.isArray(res.warnings) && res.warnings.length > 0 && (
        <ul className="px-4 py-2 border-t border-gray-100 space-y-1">
          {res.warnings.map((w: string, i: number) => (
            <li key={i} className="text-xs text-amber-800">⚠ {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Kaplan-Meier ─────────────────────────────────────────────────────

export function SurvivalChart({ res }: { res: Record<string, any> }) {
  const curves: any[] = Array.isArray(res.curves) ? res.curves : [];
  if (curves.length === 0) return null;

  const datasets = curves.map((c, i) => ({
    label: `${c.label} (n=${c.n})`,
    // The curve starts at 1.0 at time zero and steps down at each event time.
    data: [{ x: 0, y: 1 }, ...c.points.map((p: any) => ({ x: p.time, y: p.survival }))],
    borderColor: PALETTE[i % PALETTE.length],
    backgroundColor: PALETTE[i % PALETTE.length],
    // Stepped, never smoothed: survival does not drift between event times.
    stepped: 'after' as const,
    pointRadius: 0,
    borderWidth: 2,
    tension: 0,
  }));

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <h4 className="text-sm font-semibold text-gray-800 mb-1">Kaplan-Meier curve</h4>
      <p className="text-xs text-gray-500 mb-3">
        Steps fall at event times only. The curve ends at the last follow-up; nothing beyond it
        is estimated.
      </p>
      <div className="h-72">
        <Line
          data={{ datasets }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            parsing: false as never,
            scales: {
              x: {
                type: 'linear',
                title: {
                  display: true,
                  text: res.timeUnit ? `Time (${res.timeUnit})` : 'Time',
                },
              },
              y: {
                min: 0, max: 1,
                title: { display: true, text: 'Proportion event-free' },
                ticks: { callback: (v: any) => `${Math.round(v * 100)}%` },
              },
            },
            plugins: { legend: { position: 'bottom' } },
          } as never}
        />
      </div>
      <div className="overflow-x-auto mt-3">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="text-left py-2 px-3">Group</th>
              <th className="text-right py-2 px-3">n</th>
              <th className="text-right py-2 px-3">Events</th>
              <th className="text-right py-2 px-3">Censored</th>
              <th className="text-left py-2 px-3">Median</th>
            </tr>
          </thead>
          <tbody>
            {curves.map((c) => (
              <tr key={c.label} className="border-b border-gray-50">
                <td className="py-2 px-3 text-gray-800">{c.label}</td>
                <td className="py-2 px-3 text-right tabular-nums">{c.n}</td>
                <td className="py-2 px-3 text-right tabular-nums">{c.events}</td>
                <td className="py-2 px-3 text-right tabular-nums">{c.censored}</td>
                {/* "Not reached" is a result, not a gap, and the engine's own
                    note says so in words. */}
                <td className="py-2 px-3 text-gray-700">{c.medianNote}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── ROC ──────────────────────────────────────────────────────────────

export function RocChart({ res }: { res: Record<string, any> }) {
  if (!res.ok) return null;
  const points: any[] = Array.isArray(res.points) ? res.points : [];
  const curve = points
    .map((p) => ({ x: 1 - p.specificity, y: p.sensitivity }))
    .sort((a, b) => a.x - b.x);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <h4 className="text-sm font-semibold text-gray-800 mb-1">ROC curve</h4>
      <p className="text-xs text-gray-500 mb-3">
        The straight line is chance. A curve close to it discriminates no better than a coin toss,
        whatever the cut-off.
      </p>
      <div className="h-72">
        <Line
          data={{
            datasets: [
              {
                label: `AUC ${num(res.auc, 3)}`,
                data: [{ x: 0, y: 0 }, ...curve, { x: 1, y: 1 }],
                borderColor: PALETTE[0],
                backgroundColor: 'rgba(42,120,214,0.08)',
                fill: true,
                pointRadius: 0,
                borderWidth: 2,
                tension: 0,
              },
              {
                label: 'Chance',
                data: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
                borderColor: '#9ca3af',
                borderDash: [5, 5],
                pointRadius: 0,
                borderWidth: 1,
                fill: false,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            parsing: false as never,
            scales: {
              x: {
                type: 'linear', min: 0, max: 1,
                title: { display: true, text: '1 − specificity (false positives)' },
              },
              y: {
                min: 0, max: 1,
                title: { display: true, text: 'Sensitivity (true positives)' },
              },
            },
            plugins: { legend: { position: 'bottom' } },
          } as never}
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
        <Stat label="AUC" value={num(res.auc, 3)} />
        <Stat label="95% CI" value={`${num(res.ci95Lower, 3)}–${num(res.ci95Upper, 3)}`} />
        <Stat label="With outcome" value={res.positives} />
        <Stat label="Without" value={res.negatives} />
      </div>
      {res.bestCutoff && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs font-semibold text-amber-900">
            Best cut-off on these data: {num(res.bestCutoff.threshold)}
          </p>
          <p className="text-xs text-gray-700 mt-1">
            Sensitivity {num(res.bestCutoff.sensitivity * 100, 1)}%, specificity{' '}
            {num(res.bestCutoff.specificity * 100, 1)}%. Chosen on the same cases it is scored on,
            so it will perform worse on the next cohort — it is a candidate to test, not a
            threshold to adopt.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Agreement ────────────────────────────────────────────────────────

export function AgreementCard({ res }: { res: Record<string, any> }) {
  if (!res.ok) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <h4 className="text-sm font-semibold text-gray-800 mb-3">Agreement</h4>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Cohen's κ" value={num(res.kappa)} />
        <Stat label="95% CI" value={`${num(res.ci95Lower)}–${num(res.ci95Upper)}`} />
        <Stat
          label="Raw agreement"
          value={res.observedAgreement === null ? '—' : `${num(res.observedAgreement * 100, 1)}%`}
        />
        <Stat label="Pairs" value={res.n} />
      </div>
      <p className="text-xs text-gray-500 mt-3">
        Strength: {res.strength}. Categories compared: {(res.categories ?? []).join(', ')}.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900 tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

// ── Generic test result ──────────────────────────────────────────────

export function TestResultCard({ res }: { res: Record<string, any> }) {
  const effect = res.oddsRatio as Record<string, any> | undefined;
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-1.5">
        <Sigma className="w-4 h-4" />{res.test ?? 'Test'}
      </h4>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Statistic" value={num(res.statistic, 4)} />
        <Stat label="p-value" value={fmtP(res.pValue)} />
        {res.df !== undefined && res.df !== null && <Stat label="df" value={num(res.df)} />}
        {res.slope !== undefined && <Stat label="Slope" value={num(res.slope, 4)} />}
        {res.r2 !== undefined && <Stat label="R²" value={num(res.r2, 3)} />}
        {effect?.estimate !== undefined && (
          <Stat
            label={effect.measure ?? 'Effect'}
            value={`${num(effect.estimate)} (${num(effect.ci95Lower)}–${num(effect.ci95Upper)})`}
          />
        )}
      </div>
      {Array.isArray(res.groups) && res.groups.length > 0 && (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="text-left py-2 px-3">Group</th>
                <th className="text-right py-2 px-3">n</th>
                {res.groups[0]?.median !== undefined && <th className="text-right py-2 px-3">Median</th>}
                {res.groups[0]?.mean !== undefined && <th className="text-right py-2 px-3">Mean</th>}
                {res.groups[0]?.observed !== undefined && <th className="text-right py-2 px-3">Observed</th>}
                {res.groups[0]?.expected !== undefined && <th className="text-right py-2 px-3">Expected</th>}
              </tr>
            </thead>
            <tbody>
              {res.groups.map((g: any) => (
                <tr key={g.label} className="border-b border-gray-50">
                  <td className="py-2 px-3 text-gray-800">{g.label}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{g.n}</td>
                  {g.median !== undefined && <td className="py-2 px-3 text-right tabular-nums">{num(g.median)}</td>}
                  {g.mean !== undefined && <td className="py-2 px-3 text-right tabular-nums">{num(g.mean)}</td>}
                  {g.observed !== undefined && <td className="py-2 px-3 text-right tabular-nums">{num(g.observed)}</td>}
                  {g.expected !== undefined && <td className="py-2 px-3 text-right tabular-nums">{num(g.expected, 1)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {res.detail && <p className="text-xs text-gray-500 mt-3">{res.detail}</p>}
    </div>
  );
}

// ── Table 1 ──────────────────────────────────────────────────────────

export function TableOneView({ t1 }: { t1: Record<string, any> }) {
  const groups: any[] = t1.groups ?? [];
  const rows: any[] = t1.rows ?? [];
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h4 className="text-sm font-semibold text-gray-800">
          Table 1 — cohort characteristics by {t1.groupByLabel}
        </h4>
        <p className="text-xs text-gray-500 mt-0.5">
          {t1.overallN} cases
          {t1.ungrouped > 0 && ` · ${t1.ungrouped} had no ${t1.groupByLabel} recorded and are not in any column`}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600">
            <tr>
              <th className="text-left py-2 px-3 font-semibold">Characteristic</th>
              <th className="text-right py-2 px-3 font-semibold">
                Overall<br /><span className="font-normal">n = {t1.overallN}</span>
              </th>
              {groups.map((g) => (
                <th key={g.label} className="text-right py-2 px-3 font-semibold whitespace-nowrap">
                  {g.label}<br /><span className="font-normal">n = {g.n}</span>
                </th>
              ))}
              <th className="text-right py-2 px-3 font-semibold">p</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.key}-${r.level ?? ''}`} className="border-b border-gray-50">
                <td className={`py-2 px-3 ${r.isLevel ? 'pl-7 text-gray-600' : 'text-gray-800 font-medium'}`}>
                  {r.isLevel ? r.level : r.label}
                  {!r.isLevel && r.unit && <span className="text-gray-400 font-normal">, {r.unit}</span>}
                  {!r.isLevel && r.missing > 0 && (
                    <span className="block text-[10px] text-amber-700 font-normal">
                      {r.missing} not recorded
                    </span>
                  )}
                </td>
                <td className="py-2 px-3 text-right tabular-nums text-gray-700">{r.overall?.display ?? '—'}</td>
                {groups.map((g) => (
                  <td key={g.label} className="py-2 px-3 text-right tabular-nums text-gray-700">
                    {r.cells?.[g.label]?.display ?? '—'}
                  </td>
                ))}
                <td className="py-2 px-3 text-right tabular-nums">
                  {r.pValue !== null && r.pValue !== undefined ? (
                    <span className={r.pValue < 0.05 ? 'font-semibold text-indigo-700' : 'text-gray-600'}>
                      {fmtP(r.pValue)}
                    </span>
                  ) : (
                    <span className="text-gray-400 text-xs" title={r.pNote ?? ''}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {Array.isArray(t1.footnotes) && t1.footnotes.length > 0 && (
        <ul className="px-4 py-3 border-t border-gray-100 space-y-1 bg-gray-50">
          {t1.footnotes.map((f: string, i: number) => (
            <li key={i} className="text-xs text-gray-600 flex gap-1.5">
              <Info className="w-3 h-3 mt-0.5 shrink-0 text-gray-400" /><span>{f}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Descriptive statistics ───────────────────────────────────────────

export function DescriptiveBlock({ descriptive }: { descriptive: Record<string, any> }) {
  const [open, setOpen] = useState(true);
  const entries = Object.entries(descriptive ?? {});
  if (entries.length === 0) return null;

  const numeric = entries.filter(([, v]) => v.kind === 'numeric');
  const categorical = entries.filter(([, v]) => v.kind === 'categorical');

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 px-4 py-3 text-sm font-semibold text-gray-800"
      >
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        Descriptive statistics ({entries.length} variable{entries.length === 1 ? '' : 's'})
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-5">
          {numeric.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="text-left py-2 px-3">Variable</th>
                    <th className="text-right py-2 px-3">Recorded</th>
                    <th className="text-right py-2 px-3">Mean (SD)</th>
                    <th className="text-right py-2 px-3">Median [IQR]</th>
                    <th className="text-right py-2 px-3">Range</th>
                  </tr>
                </thead>
                <tbody>
                  {numeric.map(([k, v]) => (
                    <tr key={k} className="border-b border-gray-50">
                      <td className="py-2 px-3 text-gray-800">
                        {v.label}{v.unit ? <span className="text-gray-400">, {v.unit}</span> : null}
                      </td>
                      {/* The denominator sits beside every figure: "mean 112"
                          over 38 of 300 cases is a different claim from the
                          same mean over 290. */}
                      <td className="py-2 px-3 text-right tabular-nums text-gray-600">
                        {v.recorded}/{v.total}
                        <span className="block text-[10px] text-gray-400">
                          {v.total > 0 ? Math.round((v.recorded / v.total) * 100) : 0}%
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">{num(v.mean, 1)} ({num(v.sd, 1)})</td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {num(v.median, 1)} [{num(v.q1, 1)}–{num(v.q3, 1)}]
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-600">
                        {num(v.min, 1)}–{num(v.max, 1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {categorical.map(([k, v]) => {
            const counts: Record<string, number> = v.counts ?? {};
            const labels = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 14);
            if (labels.length === 0) {
              return (
                <p key={k} className="text-sm text-gray-500">
                  {v.label}: nothing recorded in {v.total} cases.
                </p>
              );
            }
            return (
              <div key={k}>
                <p className="text-sm font-medium text-gray-700">{v.label}</p>
                <p className="text-xs text-gray-500 mb-2">
                  Recorded in {v.recorded} of {v.total} cases
                  {v.recorded < v.total && ` — ${v.total - v.recorded} blank, and blanks are not a category`}
                </p>
                <div className="h-56">
                  <Bar
                    data={{
                      labels,
                      datasets: [{
                        label: 'Cases',
                        data: labels.map((l) => counts[l]),
                        // One colour: the bars are counts of one thing. A hue
                        // per bar would make colour mean rank, and the colours
                        // would move when a filter changed the order.
                        backgroundColor: SINGLE_SERIES,
                        borderRadius: 4,
                      }],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      indexAxis: labels.some((l) => l.length > 14) ? 'y' : 'x',
                      plugins: { legend: { display: false } },
                      scales: { x: { ticks: { autoSkip: false } } },
                    } as never}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Grouped outcomes ─────────────────────────────────────────────────

export function GroupedBlock({ grouped }: { grouped: Record<string, any> }) {
  const groups: any[] = grouped?.groups ?? [];
  if (groups.length === 0) return null;
  const keys = Object.keys(groups[0].outcomes ?? {});

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h4 className="text-sm font-semibold text-gray-800">By {grouped.byLabel}</h4>
        {grouped.ungrouped > 0 && (
          <p className="text-xs text-amber-700 mt-0.5">
            {grouped.ungrouped} case{grouped.ungrouped === 1 ? '' : 's'} had no {grouped.byLabel}{' '}
            recorded and are in no row below.
          </p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="text-left py-2 px-3">{grouped.byLabel}</th>
              <th className="text-right py-2 px-3">Cases</th>
              {keys.map((k) => (
                <th key={k} className="text-right py-2 px-3 whitespace-nowrap">
                  {groups[0].outcomes[k]?.kind === 'rate' ? 'Rate' : 'Median'}: {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.label} className="border-b border-gray-50">
                <td className="py-2 px-3 text-gray-800">{g.label}</td>
                <td className="py-2 px-3 text-right tabular-nums">{g.n}</td>
                {keys.map((k) => {
                  const o = g.outcomes[k];
                  if (!o) return <td key={k} className="py-2 px-3 text-right text-gray-400">—</td>;
                  return (
                    <td key={k} className="py-2 px-3 text-right tabular-nums text-gray-700">
                      {o.kind === 'rate'
                        ? `${o.percent === null ? '—' : `${o.percent}%`} (${o.yes}/${o.recorded})`
                        : `${num(o.median, 1)} (n=${o.recorded})`}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
