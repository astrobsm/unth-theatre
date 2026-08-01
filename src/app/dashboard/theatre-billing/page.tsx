'use client';

// ============================================================
// Theatre Billing — one bill per surgery
// ------------------------------------------------------------
// The cash desk's screen. Raise the bill for a finished case, issue it, take
// payment against it.
//
// Every figure shown comes from the server: the bill is assembled from what the
// case actually consumed, at the prices agreed when it was booked. Nothing here
// recomputes a total, because a screen that did its own arithmetic would
// eventually disagree with the invoice it was displaying.
//
// Plain `fetch`, so a payment taken while the network is down queues with
// everything else and settles when it returns.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  BadgeCheck,
  Banknote,
  FileText,
  Receipt,
  RefreshCw,
  Search,
  Send,
  XCircle,
} from 'lucide-react';

interface InvoiceLine {
  id: string;
  kind: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  vendor?: { id: string; name: string } | null;
}

interface PaymentRow {
  id: string;
  amount: number;
  method: string;
  reference: string | null;
  receivedAt: string;
  receivedByName: string | null;
  reversedAt: string | null;
}

interface Distribution {
  id: string;
  amount: number;
  kind: string;
  status: string;
  account: { id: string; code: string; name: string; kind: string };
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  surgeryId: string;
  patientName: string | null;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amountPaid: number;
  balance: number;
  issuedAt: string | null;
  lines?: InvoiceLine[];
  payments?: PaymentRow[];
  distributions?: Distribution[];
  _count?: { lines: number; payments: number };
}

const naira = (kobo: number) =>
  `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-200',
  ISSUED: 'bg-blue-100 text-blue-800 border-blue-200',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-800 border-amber-200',
  PAID: 'bg-green-100 text-green-800 border-green-200',
  CANCELLED: 'bg-red-100 text-red-800 border-red-200',
  REFUNDED: 'bg-slate-200 text-slate-700 border-slate-300',
};

export default function TheatreBillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      const res = await fetch(`/api/billing/invoices?${params.toString()}`);
      if (res.status === 401 || res.status === 403) {
        const b = await res.json().catch(() => ({}));
        setDenied(true);
        setError(b.error || 'Your role does not allow you to see theatre billing.');
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDenied(false);
      setInvoices(data.invoices ?? []);
      setTotals(data.totals ?? {});
    } catch {
      setError('Could not load invoices. If you are offline they will appear once cached.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const open = async (id: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/billing/invoices?id=${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSelected(data.invoice);
    } catch {
      setNotice('Could not open that invoice.');
    } finally {
      setBusy(false);
    }
  };

  const act = async (invoice: Invoice, action: 'ISSUE' | 'CANCEL') => {
    let reason: string | undefined;
    if (action === 'CANCEL') {
      reason = window.prompt(`Why is ${invoice.invoiceNumber} being cancelled?`) ?? '';
      if (reason.trim().length < 5) {
        setNotice('A reason is required to cancel an invoice.');
        return;
      }
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/billing/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: invoice.id, action, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(data.error || 'That could not be done.');
        return;
      }
      setSelected(data.invoice);
      setNotice(action === 'ISSUE' ? `${invoice.invoiceNumber} issued.` : `${invoice.invoiceNumber} cancelled.`);
      load();
    } finally {
      setBusy(false);
    }
  };

  const takePayment = async (invoice: Invoice) => {
    const entered = window.prompt(
      `Payment against ${invoice.invoiceNumber}\nOutstanding: ${naira(invoice.balance)}\n\nAmount in naira:`
    );
    if (entered === null) return;
    const naira_ = Number(entered);
    if (!Number.isFinite(naira_) || naira_ <= 0) {
      setNotice('Enter the amount in naira, for example 15000.');
      return;
    }
    const reference = window.prompt('Teller or POS reference (optional):') ?? '';

    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/billing/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Converted to kobo here and nowhere else, so there is exactly one
        // place a rounding mistake could be made.
        body: JSON.stringify({
          invoiceId: invoice.id,
          amount: Math.round(naira_ * 100),
          reference: reference.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The server's wording names the actual balance, which is usually
        // enough to reveal the wrong invoice was keyed.
        setNotice(data.error || 'That payment could not be taken.');
        return;
      }
      setNotice(
        data.settled
          ? `Paid in full. ${data.distribution?.shares ?? 0} revenue shares recorded${
              data.distribution?.matchesInvoiceTotal === false ? ' — WARNING: the split does not match the invoice total.' : '.'
            }`
          : `Payment recorded. ${naira(data.invoice.balance)} still outstanding.`
      );
      await open(invoice.id);
      load();
    } finally {
      setBusy(false);
    }
  };

  if (denied) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-900">Theatre billing is not available to your role</p>
              <p className="text-sm text-amber-800">{error}</p>
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
            <Receipt className="h-6 w-6 text-primary-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Theatre Billing</h1>
            <p className="text-sm text-gray-500">One bill per surgery — theatre, anaesthesia, consumables and drugs together.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">All statuses</option>
            {Object.keys(STATUS_STYLES).map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Invoices" value={String(totals.count ?? 0)} />
        <Tile label="Billed" value={naira(totals.billed ?? 0)} />
        <Tile label="Outstanding" value={naira(totals.outstanding ?? 0)} warn={(totals.outstanding ?? 0) > 0} />
      </div>

      {notice && <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">{notice}</div>}
      {error && !denied && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* Register */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {invoices.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="mx-auto h-8 w-8 text-gray-300" />
              <p className="mt-2 text-sm text-gray-600">
                {loading ? 'Loading…' : 'No invoices yet. One is raised per surgery once the case has been completed.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {invoices.map((i) => (
                <li key={i.id}>
                  <button
                    onClick={() => open(i.id)}
                    className={`w-full px-4 py-3 text-left hover:bg-gray-50 ${selected?.id === i.id ? 'bg-primary-50' : ''}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900">{i.invoiceNumber}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[i.status] ?? ''}`}>
                        {i.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between text-xs text-gray-500">
                      <span>{i.patientName ?? 'Patient not recorded'}</span>
                      <span className="font-medium text-gray-900">{naira(i.total)}</span>
                    </div>
                    {i.balance > 0 && i.status !== 'CANCELLED' && (
                      <p className="mt-0.5 text-xs font-medium text-amber-700">{naira(i.balance)} outstanding</p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Detail */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          {!selected ? (
            <p className="py-8 text-center text-sm text-gray-500">Select an invoice to see what it charges for.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-gray-900">{selected.invoiceNumber}</h2>
                  <p className="text-xs text-gray-500">{selected.patientName ?? 'Patient not recorded'}</p>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[selected.status] ?? ''}`}>
                  {selected.status.replace(/_/g, ' ')}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-left uppercase tracking-wide text-gray-500">
                      <th className="py-1.5 pr-2 font-medium">Charge</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Qty</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Unit</th>
                      <th className="py-1.5 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(selected.lines ?? []).map((l) => (
                      <tr key={l.id}>
                        <td className="py-1.5 pr-2">
                          <span className="text-gray-900">{l.description}</span>
                          <span className="ml-1 rounded bg-gray-100 px-1 text-[10px] uppercase text-gray-600">{l.kind}</span>
                          {l.vendor && (
                            <span className="ml-1 rounded bg-purple-100 px-1 text-[10px] text-purple-700">{l.vendor.name}</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-gray-700">{l.quantity}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-gray-700">{naira(l.unitPrice)}</td>
                        <td className="py-1.5 text-right tabular-nums font-medium text-gray-900">{naira(l.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="text-xs">
                    <Row label="Subtotal" value={naira(selected.subtotal)} />
                    {selected.discount > 0 && <Row label="Discount" value={`−${naira(selected.discount)}`} />}
                    {selected.tax > 0 && <Row label="Tax" value={naira(selected.tax)} />}
                    <Row label="Total" value={naira(selected.total)} strong />
                    <Row label="Paid" value={naira(selected.amountPaid)} />
                    <Row label="Outstanding" value={naira(selected.balance)} strong />
                  </tfoot>
                </table>
              </div>

              {(selected.payments?.length ?? 0) > 0 && (
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Payments</h3>
                  <ul className="space-y-1 text-xs">
                    {selected.payments!.map((p) => (
                      <li key={p.id} className="flex items-center justify-between">
                        <span className="text-gray-600">
                          {new Date(p.receivedAt).toLocaleDateString('en-GB')} · {p.method}
                          {p.reference ? ` · ${p.reference}` : ''}
                        </span>
                        <span className={`font-medium ${p.reversedAt ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                          {naira(p.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(selected.distributions?.length ?? 0) > 0 && (
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Revenue distribution</h3>
                  <ul className="space-y-1 text-xs">
                    {selected.distributions!.map((d) => (
                      <li key={d.id} className="flex items-center justify-between">
                        <span className="text-gray-600">{d.account.name} <span className="text-gray-400">({d.kind})</span></span>
                        <span className="font-medium text-gray-900">{naira(d.amount)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[11px] text-gray-500">
                    Recorded for Finance to settle. No money moves through this system.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                {selected.status === 'DRAFT' && (
                  <Action onClick={() => act(selected, 'ISSUE')} busy={busy} icon={Send} label="Issue invoice" primary />
                )}
                {(selected.status === 'ISSUED' || selected.status === 'PARTIALLY_PAID') && (
                  <Action onClick={() => takePayment(selected)} busy={busy} icon={Banknote} label="Take payment" primary />
                )}
                {selected.status !== 'CANCELLED' && selected.status !== 'PAID' && selected.amountPaid === 0 && (
                  <Action onClick={() => act(selected, 'CANCEL')} busy={busy} icon={XCircle} label="Cancel" danger />
                )}
                {selected.status === 'PAID' && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-1.5 text-sm font-medium text-green-800">
                    <BadgeCheck className="h-4 w-4" /> Paid in full
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <tr className={strong ? 'font-semibold text-gray-900' : 'text-gray-600'}>
      <td className="py-1 pr-2" colSpan={3}>{label}</td>
      <td className="py-1 text-right tabular-nums">{value}</td>
    </tr>
  );
}

function Tile({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${warn ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${warn ? 'text-amber-800' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function Action({
  onClick, busy, icon: Icon, label, primary, danger,
}: {
  onClick: () => void; busy: boolean; icon: typeof Send; label: string; primary?: boolean; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
        primary
          ? 'bg-primary-600 text-white hover:bg-primary-700'
          : danger
            ? 'border border-red-300 text-red-700 hover:bg-red-50'
            : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
      }`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}
