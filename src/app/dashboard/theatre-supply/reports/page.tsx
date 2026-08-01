'use client';

// ============================================================
// Theatre supply chain & billing reports
// ------------------------------------------------------------
// Twelve registers over one API. The table is generic on purpose: a report is
// a list of rows plus a column layout, and writing twelve bespoke tables would
// leave twelve places to update when a figure changes.
//
// Nothing is recomputed here. Totals come from the server, because a screen
// that added up its own columns would eventually disagree with the report it
// was displaying.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Download, FileBarChart, RefreshCw } from 'lucide-react';

interface Column {
  header: string;
  key: string;
  money?: boolean;
  date?: boolean;
  align?: 'right';
  /** Highlight when the value is worth acting on. */
  alert?: (v: unknown, row: Record<string, unknown>) => boolean;
}

interface ReportDef {
  kind: string;
  title: string;
  blurb: string;
  rowsFrom?: string;
  columns: Column[];
  dated?: boolean;
}

const naira = (kobo: number) =>
  `₦${(Number(kobo) / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const REPORTS: ReportDef[] = [
  {
    kind: 'consumption', title: 'Daily Theatre Consumption', dated: true,
    blurb: 'Every item used, on which case, by whom.',
    columns: [
      { header: 'When', key: 'occurredAt', date: true },
      { header: 'Item', key: 'item' },
      { header: 'Lot', key: 'batchNumber' },
      { header: 'Qty', key: 'quantity', align: 'right' },
      { header: 'Value', key: 'value', money: true },
      { header: 'Patient', key: 'patient' },
      { header: 'Recorded by', key: 'actor' },
    ],
  },
  {
    kind: 'controlled-register', title: 'Controlled Drug Register', dated: true,
    blurb: 'Every issue, return and discard from a controlled store, with its witness.',
    columns: [
      { header: 'When', key: 'occurredAt', date: true },
      { header: 'Drug', key: 'drug' },
      { header: 'Lot', key: 'batchNumber' },
      { header: 'Movement', key: 'movement' },
      { header: 'Qty', key: 'quantity', align: 'right' },
      { header: 'Officer', key: 'actor' },
      // The column an inspection looks at first.
      { header: 'Witness', key: 'witness', alert: (v, row) => !v && row.movement !== 'RETURN' },
      { header: 'Patient', key: 'patient' },
    ],
  },
  {
    kind: 'drug-usage', title: 'Drug Usage', dated: true,
    blurb: 'Drugs consumed across all stores.',
    columns: [
      { header: 'When', key: 'occurredAt', date: true },
      { header: 'Drug', key: 'drug' },
      { header: 'Qty', key: 'quantity', align: 'right' },
      { header: 'Store', key: 'store' },
      { header: 'Patient', key: 'patient' },
    ],
  },
  {
    kind: 'inventory-valuation', title: 'Inventory Valuation',
    blurb: 'What is on the shelf, valued at what the hospital paid for it.',
    columns: [
      { header: 'Item', key: 'item' },
      { header: 'Lot', key: 'batchNumber' },
      { header: 'Store', key: 'location' },
      { header: 'Owner', key: 'owner' },
      { header: 'On hand', key: 'onHand', align: 'right' },
      { header: 'Unit cost', key: 'unitCost', money: true },
      { header: 'Value', key: 'value', money: true },
      { header: 'Expiry', key: 'expiryDate', date: true, alert: (_v, row) => Boolean(row.expired) },
    ],
  },
  {
    kind: 'expiry', title: 'Stock Expiry',
    blurb: 'What lapses soon, and what it is worth — money about to be thrown away.',
    columns: [
      { header: 'Item', key: 'item' },
      { header: 'Lot', key: 'batchNumber' },
      { header: 'Store', key: 'location' },
      { header: 'On hand', key: 'onHand', align: 'right' },
      { header: 'Expiry', key: 'expiryDate', date: true },
      { header: 'Days left', key: 'daysUntilExpiry', align: 'right', alert: (v) => Number(v) <= 30 },
      { header: 'Value at risk', key: 'valueAtRisk', money: true },
    ],
  },
  {
    kind: 'stock-outs', title: 'Stock-out Events',
    blurb: 'Items at or below their reorder level.',
    columns: [
      { header: 'Item', key: 'item' },
      { header: 'Category', key: 'category' },
      { header: 'Available', key: 'available', align: 'right', alert: (v) => Number(v) === 0 },
      { header: 'Reorder level', key: 'reorderLevel', align: 'right' },
      { header: 'Lots', key: 'batches', align: 'right' },
    ],
  },
  {
    kind: 'emergency-usage', title: 'Emergency Stock Usage', dated: true,
    blurb: 'Draws on the ring-fenced emergency store, and who authorised them.',
    columns: [
      { header: 'When', key: 'occurredAt', date: true },
      { header: 'Item', key: 'item' },
      { header: 'Qty', key: 'quantity', align: 'right' },
      { header: 'Case', key: 'surgeryType', alert: (v) => v === 'ELECTIVE' },
      { header: 'Authorisation', key: 'authorisation' },
      { header: 'Officer', key: 'actor' },
    ],
  },
  {
    kind: 'vendor-settlement', title: 'Vendor Settlement', dated: true,
    blurb: 'What each vendor is owed for consignment stock consumed, and the margin on it.',
    columns: [
      { header: 'Vendor', key: 'vendor' },
      { header: 'Bank', key: 'bankName' },
      { header: 'Account', key: 'accountNumber' },
      { header: 'Units', key: 'units', align: 'right' },
      { header: 'Owed', key: 'owed', money: true },
      { header: 'Billed', key: 'billed', money: true },
      { header: 'Margin', key: 'margin', money: true },
    ],
  },
  {
    kind: 'procedure-cost', title: 'Procedure Cost Analysis', dated: true,
    blurb: 'What each case cost to do, broken down by charge.',
    columns: [
      { header: 'Invoice', key: 'invoiceNumber' },
      { header: 'Procedure', key: 'procedure' },
      { header: 'Theatre', key: 'theatre', money: true },
      { header: 'Anaesthesia', key: 'anaesthesia', money: true },
      { header: 'Consumables', key: 'consumables', money: true },
      { header: 'Drugs', key: 'drugs', money: true },
      { header: 'Total', key: 'total', money: true },
      { header: 'Paid', key: 'paid', money: true },
    ],
  },
  {
    kind: 'revenue-distribution', title: 'Revenue Distribution', dated: true,
    blurb: 'What each account has been allocated, and what is still to settle.',
    columns: [
      { header: 'Account', key: 'account' },
      { header: 'Code', key: 'code' },
      { header: 'Kind', key: 'kind' },
      { header: 'Invoices', key: 'invoices', align: 'right' },
      { header: 'Distributed', key: 'amount', money: true },
      { header: 'Awaiting settlement', key: 'pending', money: true },
    ],
  },
  {
    kind: 'outstanding-invoices', title: 'Outstanding Invoices',
    blurb: 'Bills issued and not yet settled, oldest first.',
    columns: [
      { header: 'Invoice', key: 'invoiceNumber' },
      { header: 'Patient', key: 'patient' },
      { header: 'Total', key: 'total', money: true },
      { header: 'Paid', key: 'paid', money: true },
      { header: 'Balance', key: 'balance', money: true },
      { header: 'Days out', key: 'daysOutstanding', align: 'right', alert: (_v, row) => Boolean(row.overdue) },
    ],
  },
  {
    kind: 'reconciliation', title: 'Reconciliation Exceptions',
    blurb: 'Stock that left a store and was never accounted for — the first thing an auditor asks for.',
    columns: [
      { header: 'Item', key: 'item' },
      { header: 'Lot', key: 'batchNumber' },
      { header: 'Store', key: 'location' },
      { header: 'Issued', key: 'issued', align: 'right' },
      { header: 'Returned', key: 'returned', align: 'right' },
      { header: 'Used', key: 'used', align: 'right' },
      { header: 'Wasted', key: 'wasted', align: 'right' },
      { header: 'Unaccounted', key: 'unaccounted', align: 'right', alert: (v) => Number(v) !== 0 },
    ],
  },
];

const COUNT_KEYS = [
  'movements', 'units', 'batches', 'items', 'outOfStock', 'alreadyExpired', 'vendors',
  'invoices', 'accounts', 'electiveDraws', 'unwitnessed', 'overdue', 'controlledBatches', 'unaccounted',
];

export default function SupplyReportsPage() {
  const [kind, setKind] = useState(REPORTS[0].kind);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const report = useMemo(() => REPORTS.find((r) => r.kind === kind)!, [kind]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams({ kind });
      if (report.dated && from) p.set('from', from);
      if (report.dated && to) p.set('to', to);
      const res = await fetch(`/api/stock/reports?${p.toString()}`);
      if (res.status === 401 || res.status === 403) {
        const b = await res.json().catch(() => ({}));
        setDenied(true);
        setError(b.error || 'Your role does not allow you to see these reports.');
        return;
      }
      if (!res.ok) throw new Error();
      setDenied(false);
      setData(await res.json());
    } catch {
      setError('Could not produce the report.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [kind, from, to, report.dated]);

  useEffect(() => { load(); }, [load]);

  const rows: Record<string, unknown>[] = Array.isArray(data?.lines) ? (data!.lines as Record<string, unknown>[]) : [];
  const totals = (data?.totals ?? {}) as Record<string, number>;

  const exportCsv = () => {
    if (rows.length === 0) return;
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      report.columns.map((c) => esc(c.header)).join(','),
      ...rows.map((r) => report.columns.map((c) => esc(cellText(r[c.key], c))).join(',')),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.kind}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-100">
            <FileBarChart className="h-6 w-6 text-primary-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Supply Chain Reports</h1>
            <p className="text-sm text-gray-500">{report.blurb}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {report.dated && (
            <>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-2 text-sm" />
              <span className="text-xs text-gray-400">to</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-2 text-sm" />
            </>
          )}
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={exportCsv} disabled={rows.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {REPORTS.map((r) => (
          <button key={r.kind} onClick={() => setKind(r.kind)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
              r.kind === kind ? 'border-primary-300 bg-primary-50 text-primary-800' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}>
            {r.title}
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>}

      {Object.keys(totals).length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(totals).filter(([, v]) => typeof v === 'number').map(([k, v]) => (
            <div key={k} className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
              </p>
              <p className="mt-0.5 font-semibold text-gray-900">
                {COUNT_KEYS.includes(k) ? String(v) : naira(v)}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              {report.columns.map((c) => (
                <th key={c.key + c.header} className={`px-3 py-2 font-medium ${c.money || c.align === 'right' ? 'text-right' : ''}`}>{c.header}</th>
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
            ) : rows.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                {report.columns.map((c) => {
                  const flagged = c.alert?.(row[c.key], row) ?? false;
                  return (
                    <td key={c.key + c.header}
                      className={`px-3 py-2 ${c.money || c.align === 'right' ? 'text-right tabular-nums' : ''} ${
                        flagged ? 'font-semibold text-red-700' : 'text-gray-700'
                      }`}>
                      {cellText(row[c.key], c)}
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

function cellText(value: unknown, column: Column): string {
  if (value === null || value === undefined || value === '') return '—';
  if (column.money) return naira(Number(value));
  if (column.date) return new Date(String(value)).toLocaleDateString('en-GB');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value.replace(/_/g, ' ');
  return String(value);
}
