'use client';

// ============================================================
// Imprest detail — the cash book for one imprest
// ------------------------------------------------------------
// Answers the question staff actually ask: what is left on this imprest, and
// what was it spent on? Everything else on the page is secondary to those two.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Plus, AlertCircle, Wallet, Banknote, Receipt } from 'lucide-react';
import { formatNaira } from '@/lib/imprest/money';

interface Line {
  id: string;
  expenseNumber: string;
  date: string;
  description: string;
  vendorName: string;
  totalCost: number;
  paymentMethod: string;
  receiptNumber: string | null;
  status: string;
  category?: { name: string } | null;
  attachments?: Array<{ id: string; kind: string; fileName: string }>;
  _offlinePending?: string;
}

interface Detail {
  id: string;
  imprestNumber: string;
  voucherNumber: string | null;
  purpose: string;
  status: string;
  office: string | null;
  fundingSource: string | null;
  remarks: string | null;
  amountApproved: number;
  amountReceived: number;
  balance: number;
  dateApproved: string | null;
  dateReceived: string | null;
  expectedRetirementDate: string | null;
  financialYear?: { label: string } | null;
  department?: { code: string; name: string } | null;
  budgetHead?: { code: string; name: string } | null;
  voteCode?: { code: string; name: string } | null;
  costCentre?: { code: string; name: string } | null;
  receivingOfficer?: { fullName: string; staffCode: string | null } | null;
  expenditures: Line[];
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-200',
  ACTIVE: 'bg-blue-100 text-blue-800 border-blue-200',
  PARTIALLY_RETIRED: 'bg-amber-100 text-amber-800 border-amber-200',
  FULLY_RETIRED: 'bg-green-100 text-green-800 border-green-200',
  CLOSED: 'bg-slate-200 text-slate-700 border-slate-300',
  CANCELLED: 'bg-red-100 text-red-800 border-red-200',
  POSTED: 'bg-blue-50 text-blue-700 border-blue-200',
  QUERIED: 'bg-amber-50 text-amber-800 border-amber-200',
  VOIDED: 'bg-red-50 text-red-700 border-red-200',
  RETIRED: 'bg-green-50 text-green-700 border-green-200',
};

export default function ImprestDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [data, setData] = useState<Detail | null>(null);
  const [summary, setSummary] = useState<{ spent: number; retiredPercent: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/imprest/imprests/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `Could not load this imprest (${res.status}).`);
        return;
      }
      const json = await res.json();
      setData(json.imprest);
      setSummary(json.summary);
    } catch {
      setError('Could not load this imprest. If you are offline it will appear once cached.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return <div className="p-6 text-sm text-gray-400">Loading…</div>;
  }

  if (error && !data) {
    return (
      <div className="p-6 space-y-4">
        <BackLink />
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
            <p className="text-sm text-amber-800">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const spent = summary?.spent ?? 0;
  const utilisation = data.amountReceived > 0 ? Math.min(100, Math.round((spent / data.amountReceived) * 100)) : 0;
  const spendable = data.status === 'ACTIVE' || data.status === 'PARTIALLY_RETIRED';

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <BackLink />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">{data.imprestNumber}</h1>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[data.status] ?? ''}`}>
              {data.status.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">{data.purpose}</p>
        </div>
        {spendable && (
          <Link
            href={`/dashboard/imprest/${data.id}/expenditure/new`}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" /> Post expenditure
          </Link>
        )}
      </div>

      {/* The two figures that matter */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile icon={Banknote} label="Received" value={formatNaira(data.amountReceived)} sub={`of ${formatNaira(data.amountApproved)} approved`} />
        <Tile icon={Receipt} label="Spent" value={formatNaira(spent)} sub={`${data.expenditures.length} line${data.expenditures.length === 1 ? '' : 's'}`} />
        <Tile icon={Wallet} label="Balance" value={formatNaira(data.balance)} highlight sub={`${utilisation}% utilised`} />
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full transition-all ${utilisation >= 90 ? 'bg-amber-500' : 'bg-primary-500'}`}
          style={{ width: `${utilisation}%` }}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Cash book */}
        <div className="lg:col-span-2 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Cash book
          </div>
          {data.expenditures.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-gray-500">
              Nothing has been spent against this imprest yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Description</th>
                    <th className="px-4 py-2">Vendor</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.expenditures.map((l) => (
                    <tr key={l.id} className={l._offlinePending ? 'bg-amber-50/60' : ''}>
                      <td className="whitespace-nowrap px-4 py-2 text-gray-600">
                        {l.date ? new Date(l.date).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <p className="font-medium text-gray-900">{l.description}</p>
                        <p className="text-xs text-gray-500">
                          {l.expenseNumber}
                          {l.category?.name ? ` · ${l.category.name}` : ''}
                          {l.receiptNumber ? ` · receipt ${l.receiptNumber}` : ''}
                          {l.attachments?.length ? ` · ${l.attachments.length} attachment(s)` : ''}
                        </p>
                        {l._offlinePending && (
                          <span className="mt-1 inline-block rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                            SAVED ON THIS DEVICE
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-700">{l.vendorName}</td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">{formatNaira(l.totalCost)}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[l.status] ?? ''}`}>
                          {l.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Particulars */}
        <div className="space-y-4">
          <Panel title="Particulars">
            <Row label="Financial year" value={data.financialYear?.label} />
            <Row label="Department" value={data.department ? `${data.department.code} — ${data.department.name}` : null} />
            <Row label="Receiving officer" value={data.receivingOfficer?.fullName} />
            <Row label="Voucher" value={data.voucherNumber} />
            <Row label="Office" value={data.office} />
            <Row label="Funding source" value={data.fundingSource} />
          </Panel>
          <Panel title="Classification">
            <Row label="Budget head" value={data.budgetHead ? `${data.budgetHead.code} — ${data.budgetHead.name}` : null} />
            <Row label="Vote code" value={data.voteCode ? `${data.voteCode.code} — ${data.voteCode.name}` : null} />
            <Row label="Cost centre" value={data.costCentre ? `${data.costCentre.code} — ${data.costCentre.name}` : null} />
          </Panel>
          <Panel title="Dates">
            <Row label="Approved" value={data.dateApproved ? new Date(data.dateApproved).toLocaleDateString() : null} />
            <Row label="Received" value={data.dateReceived ? new Date(data.dateReceived).toLocaleDateString() : null} />
            <Row label="Retire by" value={data.expectedRetirementDate ? new Date(data.expectedRetirementDate).toLocaleDateString() : null} />
          </Panel>
          {data.remarks && (
            <Panel title="Remarks"><p className="text-sm text-gray-700">{data.remarks}</p></Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/dashboard/imprest" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
      <ArrowLeft className="h-4 w-4" /> Imprest Register
    </Link>
  );
}

function Tile({
  icon: Icon, label, value, sub, highlight,
}: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'border-primary-200 bg-primary-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className={`mt-1 text-lg font-bold tabular-nums ${highlight ? 'text-primary-800' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-900">{value || '—'}</span>
    </div>
  );
}
