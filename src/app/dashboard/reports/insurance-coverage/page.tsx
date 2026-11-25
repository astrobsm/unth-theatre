'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Download, RefreshCw, ShieldCheck } from 'lucide-react';

import { PAYER_BADGE, type PayerCategory } from '@/lib/payer/categories';
import { coverageRate, type CoverageSummary } from '@/lib/payer/coverageSummary';
import { exportToCSV } from '@/lib/exportUtils';

/**
 * Insurance Coverage Summary.
 *
 * Two questions, and the second is the one worth having: how much of what we
 * asked the schemes for did they take, and WHAT KEEPS COMING BACK.
 *
 * An item refused forty times in a month is either genuinely outside the
 * scheme — in which case the booking standard should stop putting it on
 * insured cases — or it is covered and nobody has ticked the flag. Both are
 * fixable. Neither is visible without counting, which is the whole reason
 * this page exists rather than a pharmacist's impression of a bad month.
 */

function monthStart(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-01`;
}

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function InsuranceCoveragePage() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [data, setData] = useState<CoverageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/reports/insurance-coverage?from=${from}&to=${to}`,
        { cache: 'no-store' },
      );
      const body = await res.json();
      if (!res.ok) { setError(body?.error ?? 'Could not build the report.'); return; }
      setData(body);
      setError(null);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const exportCsv = () => {
    if (!data) return;
    void exportToCSV(
      data.topNonCovered.map((i) => ({
        Item: i.name,
        List: i.list === 'PHARMACY' ? 'Drugs & dressings' : 'Consumables',
        'Times not covered': i.times,
        Units: i.units,
        'Reasons given': i.reasons.join('; ') || '—',
      })),
      `insurance-not-covered-${from}-to-${to}`,
    );
  };

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ShieldCheck className="h-6 w-6 text-emerald-700" /> Insurance Coverage Summary
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            What the theatre asked the schemes to cover, what they took, and what keeps
            coming back.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-gray-700">
            <span className="block font-medium">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="mt-0.5 rounded border border-gray-300 px-2 py-1 text-sm" />
          </label>
          <label className="text-xs text-gray-700">
            <span className="block font-medium">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="mt-0.5 rounded border border-gray-300 px-2 py-1 text-sm" />
          </label>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
      )}

      {data && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs uppercase text-gray-500">Insured cases</p>
              <p className="text-2xl font-bold text-gray-900">{data.totals.insuredCases}</p>
              <p className="text-xs text-gray-500">{data.totals.insuredLines} lines requested</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs uppercase text-amber-800">Never classified</p>
              <p className="text-2xl font-bold text-amber-900">{data.unclassified}</p>
              <p className="text-xs text-amber-800">
                Each one is a patient paying for something the scheme may well carry.
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs uppercase text-gray-500">Payer not set</p>
              <p className="text-2xl font-bold text-gray-900">{data.unspecifiedCases}</p>
              <p className="text-xs text-gray-500">
                Cases in this window booked before the question was asked.
              </p>
            </div>
          </div>

          {/* ---- Per scheme ---- */}
          <h2 className="mt-6 text-lg font-semibold">By scheme</h2>
          <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2">Scheme</th>
                  <th className="px-4 py-2">Lines requested</th>
                  <th className="px-4 py-2">Covered</th>
                  <th className="px-4 py-2">Sent back by the desk</th>
                  <th className="px-4 py-2">Never covered</th>
                  <th className="px-4 py-2">Coverage</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.schemes.map((s) => (
                  <tr key={s.scheme}>
                    <td className="px-4 py-2 font-medium">
                      {PAYER_BADGE[s.scheme as PayerCategory]}
                    </td>
                    <td className="px-4 py-2">
                      {s.requested}
                      <span className="ml-1 text-xs text-gray-500">({s.requestedUnits} units)</span>
                    </td>
                    <td className="px-4 py-2 text-emerald-800">
                      {s.covered}
                      <span className="ml-1 text-xs text-gray-500">({s.coveredUnits} units)</span>
                    </td>
                    <td className="px-4 py-2 text-amber-800">{s.reassigned}</td>
                    <td className="px-4 py-2">{s.notCovered}</td>
                    <td className="px-4 py-2 font-semibold">{coverageRate(s)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            &ldquo;Sent back by the desk&rdquo; and &ldquo;never covered&rdquo; are different facts:
            the first is the NHIA Pharmacy deciding, the second is the catalogue. Keeping
            them apart is what says whether the flags or the scheme are the problem.
          </p>

          {/* ---- Top non-covered ---- */}
          <div className="mt-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold">What keeps coming back</h2>
            {data.topNonCovered.length > 0 && (
              <button
                onClick={exportCsv}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
              >
                <Download className="h-4 w-4" /> Export CSV
              </button>
            )}
          </div>
          {data.topNonCovered.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">
              Nothing was refused in this window.
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-2">Item</th>
                    <th className="px-4 py-2">List</th>
                    <th className="px-4 py-2">Times</th>
                    <th className="px-4 py-2">Units</th>
                    <th className="px-4 py-2">Reasons given</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.topNonCovered.map((i) => (
                    <tr key={`${i.list}:${i.name}`}>
                      <td className="px-4 py-2 font-medium">{i.name}</td>
                      <td className="px-4 py-2 text-gray-600">
                        {i.list === 'PHARMACY' ? 'Drugs & dressings' : 'Consumables'}
                      </td>
                      <td className="px-4 py-2">{i.times}</td>
                      <td className="px-4 py-2">{i.units}</td>
                      <td className="px-4 py-2 text-gray-600">{i.reasons.join('; ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.unclassified > 0 && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {data.unclassified} line{data.unclassified === 1 ? '' : 's'} in this window were
              never classified in the catalogue, so they were treated as not covered. Tick
              the ones the scheme carries on the Surgical Catalog screen and the routing
              improves for every case after it.
            </p>
          )}
        </>
      )}
    </div>
  );
}
