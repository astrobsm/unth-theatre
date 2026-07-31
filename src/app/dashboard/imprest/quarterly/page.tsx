'use client';

// ============================================================
// Quarterly imprest position
// ------------------------------------------------------------
// The screen the imprest holder opens to answer four questions:
//
//   how much of this quarter's ₦500,000 is left?
//   how many days until the retirement is due?
//   which receipts are still missing?
//   can I raise next quarter yet?
//
// Everything is computed server-side from the ledger (see the `quarterly` and
// `annual` reports) rather than in the browser, so the figures here cannot
// disagree with the retirement that gets certified.
//
// It fetches with plain `fetch`, so the app's offline layer serves it from
// cache when there is no signal — an imprest holder in a theatre corridor still
// sees where the quarter stands.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CalendarClock,
  ChevronRight,
  PieChart,
  ReceiptText,
  RefreshCw,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { ALL_QUARTERS, STANDING_IMPREST_KOBO } from '@/lib/imprest/enums';
import { formatNaira } from '@/lib/imprest/money';
import { quarterLabel, quarterOf } from '@/lib/imprest/quarterlyRules';

interface OutstandingLine {
  id: string;
  expenseNumber: string;
  description: string;
  amount: number;
}

interface QuarterImprest {
  id: string;
  imprestNumber: string;
  status: string;
  amountApproved: number;
  amountReceived: number;
  totalExpenditure: number;
  balance: number;
  expenditureCount: number;
  outstandingReceipts: number;
  outstandingReceiptLines: OutstandingLine[];
  expectedRetirementDate: string | null;
  daysUntilRetirementDue: number | null;
  eligibleForNextQuarter: boolean;
  officer: string | null;
  department: string | null;
  financialYear: string | null;
  retirement: {
    id: string;
    retirementNumber: string;
    status: string;
    currentStage: string;
    refundDue: number;
    submittedAt: string | null;
    approvedAt: string | null;
  } | null;
}

interface QuarterlyReport {
  quarter: string;
  quarterLabel: string;
  imprests: QuarterImprest[];
  categories: Array<{ category: string; count: number; total: number }>;
  totals: {
    imprests: number;
    received: number;
    spent: number;
    balance: number;
    outstandingReceipts: number;
  };
}

interface AnnualReport {
  financialYear: string | null;
  quarters: Array<{
    quarter: string;
    label: string;
    imprests: number;
    received: number;
    spent: number;
    balance: number;
    utilisation: number;
    retiredAndApproved: number;
    refundDue: number;
  }>;
  totals: { received: number; spent: number; balance: number; refundDue: number; annualEntitlement: number };
}

export default function QuarterlyImprestPage() {
  const [quarter, setQuarter] = useState<string>(quarterOf(new Date()));
  const [report, setReport] = useState<QuarterlyReport | null>(null);
  const [annual, setAnnual] = useState<AnnualReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [qRes, aRes] = await Promise.all([
        fetch(`/api/imprest/reports?kind=quarterly&quarter=${quarter}`),
        fetch('/api/imprest/reports?kind=annual'),
      ]);
      if (qRes.status === 401 || qRes.status === 403) {
        const b = await qRes.json().catch(() => ({}));
        setDenied(true);
        setError(b.error || 'You do not have an imprest duty assigned.');
        return;
      }
      if (!qRes.ok) throw new Error();
      setDenied(false);
      setReport(await qRes.json());
      if (aRes.ok) setAnnual(await aRes.json());
    } catch {
      setError('Could not load the quarterly position. If you are offline it will appear once cached.');
    } finally {
      setLoading(false);
    }
  }, [quarter]);

  useEffect(() => { load(); }, [load]);

  // The quarter usually holds one imprest; the summary tiles speak about it
  // directly rather than about a list of one.
  const primary = report?.imprests[0] ?? null;
  const utilisation = useMemo(() => {
    if (!report || report.totals.received === 0) return 0;
    return Math.min(100, Math.round((report.totals.spent / report.totals.received) * 100));
  }, [report]);

  if (denied) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-900">No imprest duty assigned</p>
              <p className="text-sm text-amber-800">{error}</p>
              <Link href="/dashboard/imprest/duties" className="inline-block pt-1 text-xs font-semibold text-amber-900 underline">
                Open Imprest Duties →
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-100">
            <Wallet className="h-6 w-6 text-primary-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Quarterly Imprest Position</h1>
            <p className="text-sm text-gray-500">
              {report?.quarterLabel ?? quarterLabel(quarter as never)}
              {primary?.financialYear ? ` · ${primary.financialYear}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            {ALL_QUARTERS.map((q) => (
              <option key={q} value={q}>{quarterLabel(q)}</option>
            ))}
          </select>
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {error && !denied && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>
      )}

      {/* --- The four figures ------------------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Imprest received"
          value={formatNaira(report?.totals.received ?? 0)}
          hint={`of ${formatNaira(STANDING_IMPREST_KOBO)} standing imprest`}
        />
        <Tile label="Total expenditure" value={formatNaira(report?.totals.spent ?? 0)} hint={`${primary?.expenditureCount ?? 0} lines posted`} />
        <Tile label="Balance" value={formatNaira(report?.totals.balance ?? 0)} highlight />
        <Tile
          label="Retirement due"
          value={dueLabel(primary?.daysUntilRetirementDue ?? null)}
          hint={primary?.expectedRetirementDate ? new Date(primary.expectedRetirementDate).toLocaleDateString('en-GB') : '—'}
          danger={(primary?.daysUntilRetirementDue ?? 1) < 0}
        />
      </div>

      {/* --- Utilisation ------------------------------------------------ */}
      {report && report.totals.received > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">Imprest utilised</span>
            <span className="font-semibold text-gray-900">{utilisation}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full ${utilisation >= 90 ? 'bg-red-500' : utilisation >= 70 ? 'bg-amber-500' : 'bg-primary-600'}`}
              style={{ width: `${utilisation}%` }}
            />
          </div>
        </div>
      )}

      {/* --- Retirement status ------------------------------------------ */}
      {primary && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <CalendarClock className="h-4 w-4 text-gray-400" /> Retirement
          </h2>
          {primary.retirement ? (
            <div className="space-y-2 text-sm">
              <Row label="Retirement number" value={primary.retirement.retirementNumber} />
              <Row label="Status" value={primary.retirement.status.replace(/_/g, ' ')} />
              <Row label="Currently with" value={primary.retirement.currentStage.replace(/_/g, ' ')} />
              {primary.retirement.refundDue > 0 && (
                <Row label="Refund due from officer" value={formatNaira(primary.retirement.refundDue)} danger />
              )}
              <Link
                href="/dashboard/imprest/retirement"
                className="inline-flex items-center gap-1 pt-1 text-xs font-semibold text-primary-700 hover:underline"
              >
                Open the retirement queue <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              No retirement has been prepared for this quarter yet.
            </p>
          )}
          <p className={`mt-3 rounded-lg px-3 py-2 text-xs ${primary.eligibleForNextQuarter ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
            {primary.eligibleForNextQuarter
              ? 'This quarter is retired and approved — the next quarter’s imprest may be raised.'
              : 'The next quarter’s imprest cannot be raised until this one is retired and approved.'}
          </p>
        </div>
      )}

      {/* --- Outstanding receipts --------------------------------------- */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <ReceiptText className="h-4 w-4 text-gray-400" /> Outstanding receipts
          {(report?.totals.outstandingReceipts ?? 0) > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
              {report?.totals.outstandingReceipts}
            </span>
          )}
        </h2>
        {(report?.totals.outstandingReceipts ?? 0) === 0 ? (
          <p className="text-sm text-gray-600">Every expenditure line has a supporting document.</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-gray-500">
              The retirement cannot be submitted until each of these carries a receipt, invoice or voucher.
            </p>
            <ul className="divide-y divide-gray-100">
              {(report?.imprests ?? []).flatMap((i) => i.outstandingReceiptLines).map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium text-gray-900">{l.expenseNumber}</span>
                    <span className="ml-2 truncate text-gray-600">{l.description}</span>
                  </span>
                  <span className="flex-shrink-0 font-medium text-gray-900">{formatNaira(l.amount)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* --- Category analysis ------------------------------------------ */}
      {(report?.categories.length ?? 0) > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <PieChart className="h-4 w-4 text-gray-400" /> Spending by category
          </h2>
          <div className="space-y-2">
            {report!.categories.map((c) => {
              const share = report!.totals.spent > 0 ? (c.total / report!.totals.spent) * 100 : 0;
              return (
                <div key={c.category}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-700">{c.category} <span className="text-gray-400">({c.count})</span></span>
                    <span className="font-medium text-gray-900">{formatNaira(c.total)}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-primary-500" style={{ width: `${share}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --- The year at a glance --------------------------------------- */}
      {annual && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <TrendingUp className="h-4 w-4 text-gray-400" /> Annual summary
            {annual.financialYear && <span className="font-normal text-gray-400">· {annual.financialYear}</span>}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3 font-medium">Quarter</th>
                  <th className="py-2 pr-3 text-right font-medium">Received</th>
                  <th className="py-2 pr-3 text-right font-medium">Spent</th>
                  <th className="py-2 pr-3 text-right font-medium">Balance</th>
                  <th className="py-2 pr-3 text-right font-medium">Utilised</th>
                  <th className="py-2 text-right font-medium">Retired</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {annual.quarters.map((q) => (
                  <tr
                    key={q.quarter}
                    className={q.quarter === quarter ? 'bg-primary-50/60' : undefined}
                  >
                    <td className="py-2 pr-3 font-medium text-gray-900">{q.label}</td>
                    <td className="py-2 pr-3 text-right text-gray-700">{formatNaira(q.received)}</td>
                    <td className="py-2 pr-3 text-right text-gray-700">{formatNaira(q.spent)}</td>
                    <td className="py-2 pr-3 text-right text-gray-700">{formatNaira(q.balance)}</td>
                    <td className="py-2 pr-3 text-right text-gray-700">{q.utilisation}%</td>
                    <td className="py-2 text-right text-gray-700">
                      {q.imprests === 0 ? '—' : `${q.retiredAndApproved}/${q.imprests}`}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 font-semibold text-gray-900">
                  <td className="py-2 pr-3">Year</td>
                  <td className="py-2 pr-3 text-right">{formatNaira(annual.totals.received)}</td>
                  <td className="py-2 pr-3 text-right">{formatNaira(annual.totals.spent)}</td>
                  <td className="py-2 pr-3 text-right">{formatNaira(annual.totals.balance)}</td>
                  <td className="py-2 pr-3 text-right" />
                  <td className="py-2 text-right" />
                </tr>
              </tfoot>
            </table>
          </div>
          {annual.totals.refundDue > 0 && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
              {formatNaira(annual.totals.refundDue)} is still owed in refunds across the year.
            </p>
          )}
        </div>
      )}

      {loading && !report && <p className="text-sm text-gray-500">Loading the quarterly position…</p>}
      {!loading && report && report.imprests.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center">
          <p className="text-sm text-gray-600">No imprest has been raised for {report.quarterLabel}.</p>
          <Link href="/dashboard/imprest/new" className="mt-2 inline-block text-sm font-semibold text-primary-700 hover:underline">
            Raise the quarterly imprest →
          </Link>
        </div>
      )}
    </div>
  );
}

/** "12 days", "due today", or how far overdue. */
function dueLabel(days: number | null): string {
  if (days === null) return '—';
  if (days === 0) return 'Due today';
  if (days < 0) return `${Math.abs(days)} days overdue`;
  return `${days} days`;
}

function Tile({
  label,
  value,
  hint,
  highlight,
  danger,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        danger ? 'border-red-200 bg-red-50' : highlight ? 'border-primary-200 bg-primary-50' : 'border-gray-200 bg-white'
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${danger ? 'text-red-700' : 'text-gray-900'}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function Row({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium ${danger ? 'text-red-700' : 'text-gray-900'}`}>{value}</span>
    </div>
  );
}
