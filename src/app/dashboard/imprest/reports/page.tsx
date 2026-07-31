'use client';

// ============================================================
// Imprest reports
// ------------------------------------------------------------
// One screen for every register the unit is asked to produce. Each report is
// rendered from the same JSON the Excel export uses, so what is on screen and
// what is in the workbook cannot differ.
//
// The table is generic on purpose: a report is a list of rows plus a column
// layout, and writing eight bespoke tables would mean eight places to update
// when a figure changes.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Download, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { ALL_QUARTERS } from '@/lib/imprest/enums';
import { formatNaira } from '@/lib/imprest/money';
import { quarterLabel, quarterOf } from '@/lib/imprest/quarterlyRules';

interface Column {
  header: string;
  key: string;
  money?: boolean;
  date?: boolean;
  align?: 'right';
}

interface ReportDef {
  kind: string;
  title: string;
  blurb: string;
  rowsFrom: string;
  columns: Column[];
  /** Reports that only make sense for one imprest are not offered here. */
  needsImprest?: boolean;
  usesQuarter?: boolean;
}

const REPORTS: ReportDef[] = [
  {
    kind: 'quarterly',
    title: 'Quarterly Retirement',
    blurb: 'What was released, spent and left in a quarter, and what is still undocumented.',
    rowsFrom: 'imprests',
    usesQuarter: true,
    columns: [
      { header: 'Imprest', key: 'imprestNumber' },
      { header: 'Officer', key: 'officer' },
      { header: 'Status', key: 'status' },
      { header: 'Received', key: 'amountReceived', money: true },
      { header: 'Expenditure', key: 'totalExpenditure', money: true },
      { header: 'Balance', key: 'balance', money: true },
      { header: 'Lines', key: 'expenditureCount', align: 'right' },
      { header: 'Missing receipts', key: 'outstandingReceipts', align: 'right' },
      { header: 'Retire by', key: 'expectedRetirementDate', date: true },
    ],
  },
  {
    kind: 'annual',
    title: 'Financial Year Summary',
    blurb: 'The four quarters side by side, with utilisation and outstanding refunds.',
    rowsFrom: 'quarters',
    columns: [
      { header: 'Quarter', key: 'label' },
      { header: 'Imprests', key: 'imprests', align: 'right' },
      { header: 'Received', key: 'received', money: true },
      { header: 'Spent', key: 'spent', money: true },
      { header: 'Balance', key: 'balance', money: true },
      { header: 'Utilised %', key: 'utilisation', align: 'right' },
      { header: 'Retired', key: 'retiredAndApproved', align: 'right' },
      { header: 'Refund due', key: 'refundDue', money: true },
    ],
  },
  {
    kind: 'register',
    title: 'Imprest Register',
    blurb: 'Every imprest raised, and what became of it.',
    rowsFrom: 'lines',
    columns: [
      { header: 'Imprest', key: 'imprestNumber' },
      { header: 'Approved', key: 'dateApproved', date: true },
      { header: 'Officer', key: 'officer' },
      { header: 'Purpose', key: 'purpose' },
      { header: 'Approved', key: 'amountApproved', money: true },
      { header: 'Received', key: 'amountReceived', money: true },
      { header: 'Spent', key: 'spent', money: true },
      { header: 'Balance', key: 'balance', money: true },
      { header: 'Status', key: 'status' },
    ],
  },
  {
    kind: 'outstanding',
    title: 'Outstanding Retirement',
    blurb: 'Imprests not yet retired, oldest first, with days overdue.',
    rowsFrom: 'lines',
    columns: [
      { header: 'Imprest', key: 'imprestNumber' },
      { header: 'Officer', key: 'officer' },
      { header: 'Received', key: 'amountReceived', money: true },
      { header: 'Spent', key: 'spent', money: true },
      { header: 'Unretired', key: 'unretired', money: true },
      { header: 'Retire by', key: 'expectedRetirementDate', date: true },
      { header: 'Days overdue', key: 'daysOverdue', align: 'right' },
    ],
  },
  {
    kind: 'categories',
    title: 'Category Analysis',
    blurb: 'What the money actually goes on, and each head’s share of the total.',
    rowsFrom: 'lines',
    usesQuarter: true,
    columns: [
      { header: 'Category', key: 'category' },
      { header: 'Lines', key: 'count', align: 'right' },
      { header: 'Total', key: 'total', money: true },
      { header: 'Share %', key: 'share', align: 'right' },
    ],
  },
  {
    kind: 'receipts',
    title: 'Receipt Register',
    blurb: 'Every supporting document held, with the content hash that proves it has not been swapped.',
    rowsFrom: 'lines',
    usesQuarter: true,
    columns: [
      { header: 'Imprest', key: 'imprestNumber' },
      { header: 'Expense', key: 'expenseNumber' },
      { header: 'Particulars', key: 'description' },
      { header: 'Vendor', key: 'vendorName' },
      { header: 'Amount', key: 'amount', money: true },
      { header: 'Document', key: 'fileName' },
      { header: 'Type', key: 'kind' },
      { header: 'Checksum', key: 'checksum' },
      { header: 'Captured', key: 'capturedAt', date: true },
    ],
  },
  {
    kind: 'audit',
    title: 'Audit Report',
    blurb: 'Who changed what, when, from where — and for an override, why.',
    rowsFrom: 'lines',
    columns: [
      { header: 'When', key: 'at', date: true },
      { header: 'Action', key: 'action' },
      { header: 'Entity', key: 'entity' },
      { header: 'Record', key: 'record' },
      { header: 'Officer', key: 'actor' },
      { header: 'Changed', key: 'changed' },
      { header: 'Reason', key: 'reason' },
      { header: 'IP', key: 'ipAddress' },
    ],
  },
  {
    kind: 'vendors',
    title: 'Supplier Analysis',
    blurb: 'Who the unit pays, how often, and how much.',
    rowsFrom: 'lines',
    columns: [
      { header: 'Supplier', key: 'vendorName' },
      { header: 'TIN', key: 'tin' },
      { header: 'Transactions', key: 'count', align: 'right' },
      { header: 'Total paid', key: 'total', money: true },
      { header: 'Last paid', key: 'last', date: true },
    ],
  },
];

export default function ImprestReportsPage() {
  const [kind, setKind] = useState(REPORTS[0].kind);
  const [quarter, setQuarter] = useState<string>(quarterOf(new Date()));
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [exporting, setExporting] = useState(false);

  const report = useMemo(() => REPORTS.find((r) => r.kind === kind)!, [kind]);

  const params = useCallback(() => {
    const p = new URLSearchParams({ kind });
    if (report.usesQuarter) p.set('quarter', quarter);
    return p;
  }, [kind, quarter, report.usesQuarter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/imprest/reports?${params().toString()}`);
      if (res.status === 401 || res.status === 403) {
        const b = await res.json().catch(() => ({}));
        setDenied(true);
        setError(b.error || 'You do not have an imprest duty assigned.');
        return;
      }
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || `Request failed (${res.status})`);
      }
      setDenied(false);
      setData(await res.json());
    } catch (err) {
      setError((err as Error).message || 'Could not produce the report.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => { load(); }, [load]);

  const exportExcel = async () => {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/imprest/reports/export?${params().toString()}`);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || 'The export failed.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.title.replace(/\s+/g, '-').toLowerCase()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const rows: Record<string, unknown>[] = Array.isArray(data?.[report.rowsFrom])
    ? (data![report.rowsFrom] as Record<string, unknown>[])
    : [];
  const totals = (data?.totals ?? {}) as Record<string, number>;

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
            <FileSpreadsheet className="h-6 w-6 text-primary-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Imprest Reports</h1>
            <p className="text-sm text-gray-500">{report.blurb}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {report.usesQuarter && (
            <select
              value={quarter}
              onChange={(e) => setQuarter(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {ALL_QUARTERS.map((q) => (
                <option key={q} value={q}>{quarterLabel(q)}</option>
              ))}
            </select>
          )}
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            onClick={exportExcel}
            disabled={exporting || rows.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> {exporting ? 'Preparing…' : 'Export to Excel'}
          </button>
        </div>
      </div>

      {/* Report picker */}
      <div className="flex flex-wrap gap-2">
        {REPORTS.map((r) => (
          <button
            key={r.kind}
            onClick={() => setKind(r.kind)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
              r.kind === kind
                ? 'border-primary-300 bg-primary-50 text-primary-800'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {r.title}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              {report.columns.map((c) => (
                <th
                  key={c.key + c.header}
                  className={`px-3 py-2 font-medium ${c.money || c.align === 'right' ? 'text-right' : ''}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={report.columns.length} className="px-3 py-8 text-center text-gray-500">
                  {loading ? 'Producing the report…' : 'Nothing to report for this selection.'}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  {report.columns.map((c) => (
                    <td
                      key={c.key + c.header}
                      className={`px-3 py-2 ${c.money || c.align === 'right' ? 'text-right tabular-nums' : ''} ${
                        c.key === 'daysOverdue' && Number(row[c.key]) > 0 ? 'font-semibold text-red-700' : 'text-gray-700'
                      }`}
                    >
                      {render(row[c.key], c)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Totals as the report itself computed them, not re-added here. */}
      {Object.keys(totals).length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(totals)
            .filter(([, v]) => typeof v === 'number')
            .map(([k, v]) => (
              <div key={k} className="rounded-xl border border-gray-200 bg-white p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                </p>
                <p className="mt-0.5 font-semibold text-gray-900">{formatTotal(k, v)}</p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/** Counts stay counts; anything that is money is shown as naira. */
const COUNT_KEYS = ['count', 'imprests', 'categories', 'vendors', 'overdue', 'outstandingReceipts'];

function formatTotal(key: string, value: number): string {
  return COUNT_KEYS.includes(key) ? String(value) : formatNaira(value);
}

function render(value: unknown, column: Column): string {
  if (value === null || value === undefined || value === '') return '—';
  if (column.money) return formatNaira(Number(value));
  if (column.date) return new Date(String(value)).toLocaleDateString('en-GB');
  if (typeof value === 'string') return value.replace(/_/g, ' ');
  return String(value);
}
