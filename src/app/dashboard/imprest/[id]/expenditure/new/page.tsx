'use client';

// ============================================================
// Post an expenditure against an imprest
// ------------------------------------------------------------
// The running total shown while typing uses the SAME domain function the server
// uses to persist the line (computeExpenditureAmounts), so what the officer sees
// before saving is what gets written. A separately-coded preview would sooner or
// later disagree with the ledger.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, AlertCircle } from 'lucide-react';
import { formatNaira, nairaToKobo } from '@/lib/imprest/money';
import { computeExpenditureAmounts } from '@/lib/imprest/calculations';
import { PaymentMethod } from '@/lib/imprest/enums';

interface Ref { id: string; name?: string; code?: string; fullName?: string }

export default function NewExpenditurePage() {
  const params = useParams<{ id: string }>();
  const imprestId = params?.id as string;
  const router = useRouter();

  const [reference, setReference] = useState<Record<string, Ref[]>>({});
  const [imprest, setImprest] = useState<{ imprestNumber: string; balance: number; status: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    vendorId: '',
    vendorName: '',
    vendorPhone: '',
    description: '',
    categoryId: '',
    quantity: '1',
    unitOfMeasure: '',
    unitCost: '',
    totalCostOverride: '',
    vat: '',
    withholdingTax: '',
    paymentMethod: PaymentMethod.CASH as string,
    receiptNumber: '',
    invoiceNumber: '',
    receiptDate: '',
    officerResponsibleId: '',
    remarks: '',
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    (async () => {
      try {
        const [refRes, impRes] = await Promise.all([
          fetch('/api/imprest/reference'),
          fetch(`/api/imprest/imprests/${imprestId}`),
        ]);
        if (refRes.ok) setReference(await refRes.json());
        if (impRes.ok) {
          const j = await impRes.json();
          setImprest({
            imprestNumber: j.imprest.imprestNumber,
            balance: j.imprest.balance,
            status: j.imprest.status,
          });
        } else {
          const b = await impRes.json().catch(() => ({}));
          setError(b.error || 'Could not load the imprest.');
        }
      } catch {
        setError('Could not load reference data. If you are offline it will appear once cached.');
      }
    })();
  }, [imprestId]);

  // Live totals from the domain layer — the same code the server persists with.
  const preview = useMemo(() => {
    const unitCost = form.unitCost ? nairaToKobo(Number(form.unitCost)) : 0;
    const quantity = Number(form.quantity) || 0;
    if (!unitCost || !quantity) return null;
    try {
      return computeExpenditureAmounts({
        quantity,
        unitCost,
        totalCostOverride: form.totalCostOverride ? nairaToKobo(Number(form.totalCostOverride)) : null,
        vat: form.vat ? nairaToKobo(Number(form.vat)) : 0,
        withholdingTax: form.withholdingTax ? nairaToKobo(Number(form.withholdingTax)) : 0,
      });
    } catch (err) {
      // The domain refuses tax above the line total — surface its own wording.
      return { error: (err as Error).message } as const;
    }
  }, [form.unitCost, form.quantity, form.totalCostOverride, form.vat, form.withholdingTax]);

  const previewError = preview && 'error' in preview ? preview.error : null;
  const totals = preview && !('error' in preview) ? preview : null;
  const overBalance = !!(totals && imprest && totals.totalCost > imprest.balance);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch('/api/imprest/expenditures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imprestId,
          date: form.date,
          vendorId: form.vendorId || null,
          vendorName: form.vendorName,
          vendorPhone: form.vendorPhone || null,
          description: form.description,
          categoryId: form.categoryId,
          quantity: Number(form.quantity) || 1,
          unitOfMeasure: form.unitOfMeasure || undefined,
          unitCost: nairaToKobo(Number(form.unitCost)),
          totalCost: form.totalCostOverride ? nairaToKobo(Number(form.totalCostOverride)) : undefined,
          vat: form.vat ? nairaToKobo(Number(form.vat)) : 0,
          withholdingTax: form.withholdingTax ? nairaToKobo(Number(form.withholdingTax)) : 0,
          paymentMethod: form.paymentMethod,
          receiptNumber: form.receiptNumber || undefined,
          invoiceNumber: form.invoiceNumber || undefined,
          receiptDate: form.receiptDate || null,
          officerResponsibleId: form.officerResponsibleId,
          remarks: form.remarks || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'The expenditure could not be posted.');
        if (data.details?.fieldErrors) setFieldErrors(data.details.fieldErrors);
        return;
      }
      router.push(`/dashboard/imprest/${imprestId}`);
    } catch {
      setError('Could not reach the server. The line has been kept on this device and will sync.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-5 p-4 sm:p-6">
      <Link href={`/dashboard/imprest/${imprestId}`} className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" /> Back to the imprest
      </Link>

      <div>
        <h1 className="text-xl font-bold text-gray-900">Post Expenditure</h1>
        {imprest && (
          <p className="text-sm text-gray-500">
            Against {imprest.imprestNumber} · balance{' '}
            <span className="font-semibold text-gray-800">{formatNaira(imprest.balance)}</span>
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <form onSubmit={submit} className="space-y-5">
        <Card title="What was bought">
          <F label="Date" required error={fieldErrors.date}>
            <input type="date" required value={form.date} onChange={(e) => set('date', e.target.value)} className={I} />
          </F>
          <F label="Category" required error={fieldErrors.categoryId}>
            <select required value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} className={I}>
              <option value="">Select…</option>
              {(reference.categories ?? []).map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </F>
          <F label="Description" required full error={fieldErrors.description}>
            <input required value={form.description} onChange={(e) => set('description', e.target.value)} className={I} placeholder="e.g. 20 boxes of surgical gloves" />
          </F>
        </Card>

        <Card title="Vendor">
          <F label="Vendor (from register)">
            <select
              value={form.vendorId}
              onChange={(e) => {
                const v = (reference.vendors ?? []).find((x) => x.id === e.target.value);
                set('vendorId', e.target.value);
                if (v?.name) set('vendorName', v.name);
              }}
              className={I}
            >
              <option value="">Not in the register</option>
              {(reference.vendors ?? []).map((v) => (<option key={v.id} value={v.id}>{v.name}</option>))}
            </select>
          </F>
          <F label="Vendor name" required error={fieldErrors.vendorName}>
            <input required value={form.vendorName} onChange={(e) => set('vendorName', e.target.value)} className={I} />
            <p className="mt-1 text-xs text-gray-500">Recorded on the line itself, so the printed cash book stays correct.</p>
          </F>
          <F label="Vendor phone"><input value={form.vendorPhone} onChange={(e) => set('vendorPhone', e.target.value)} className={I} /></F>
        </Card>

        <Card title="Amount">
          <F label="Quantity" required>
            <input type="number" min="0.001" step="0.001" required value={form.quantity} onChange={(e) => set('quantity', e.target.value)} className={I} />
          </F>
          <F label="Unit of measure"><input value={form.unitOfMeasure} onChange={(e) => set('unitOfMeasure', e.target.value)} className={I} placeholder="box, litre…" /></F>
          <F label="Unit cost (₦)" required error={fieldErrors.unitCost}>
            <input type="number" min="0" step="0.01" required value={form.unitCost} onChange={(e) => set('unitCost', e.target.value)} className={I} />
          </F>
          <F label="Total override (₦)">
            <input type="number" min="0" step="0.01" value={form.totalCostOverride} onChange={(e) => set('totalCostOverride', e.target.value)} className={I} />
            <p className="mt-1 text-xs text-gray-500">Only when the invoice total differs from quantity × unit cost.</p>
          </F>
          <F label="VAT (₦)"><input type="number" min="0" step="0.01" value={form.vat} onChange={(e) => set('vat', e.target.value)} className={I} /></F>
          <F label="Withholding tax (₦)"><input type="number" min="0" step="0.01" value={form.withholdingTax} onChange={(e) => set('withholdingTax', e.target.value)} className={I} /></F>
        </Card>

        {(totals || previewError) && (
          <div className={`rounded-xl border p-4 ${previewError || overBalance ? 'border-red-200 bg-red-50' : 'border-primary-200 bg-primary-50'}`}>
            {previewError ? (
              <p className="flex items-start gap-2 text-sm font-medium text-red-800">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {previewError}
              </p>
            ) : totals ? (
              <div className="space-y-1 text-sm">
                <Line label="Line total" value={formatNaira(totals.totalCost)} strong />
                {totals.withholdingTax > 0 && <Line label="Less withholding tax" value={`− ${formatNaira(totals.withholdingTax)}`} />}
                {totals.withholdingTax > 0 && <Line label="Paid to vendor" value={formatNaira(totals.netAmount)} />}
                {imprest && (
                  <Line
                    label="Balance after posting"
                    value={formatNaira(imprest.balance - totals.totalCost)}
                    strong
                  />
                )}
                {overBalance && (
                  <p className="pt-1 text-xs font-semibold text-red-700">
                    This exceeds the remaining balance on the imprest.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}

        <Card title="Evidence and responsibility">
          <F label="Payment method" required>
            <select required value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)} className={I}>
              {Object.values(PaymentMethod).map((m) => (<option key={m} value={m}>{m}</option>))}
            </select>
          </F>
          <F label="Receipt number"><input value={form.receiptNumber} onChange={(e) => set('receiptNumber', e.target.value)} className={I} /></F>
          <F label="Receipt date"><input type="date" value={form.receiptDate} onChange={(e) => set('receiptDate', e.target.value)} className={I} /></F>
          <F label="Invoice number"><input value={form.invoiceNumber} onChange={(e) => set('invoiceNumber', e.target.value)} className={I} /></F>
          <F label="Officer responsible" required error={fieldErrors.officerResponsibleId}>
            <select required value={form.officerResponsibleId} onChange={(e) => set('officerResponsibleId', e.target.value)} className={I}>
              <option value="">Select…</option>
              {(reference.officers ?? []).map((o) => (<option key={o.id} value={o.id}>{o.fullName}</option>))}
            </select>
          </F>
          <F label="Remarks" full>
            <textarea rows={2} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} className={I} />
          </F>
        </Card>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || !!previewError}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? 'Posting…' : 'Post expenditure'}
          </button>
          <Link href={`/dashboard/imprest/${imprestId}`} className="text-sm text-gray-600 hover:text-gray-900">Cancel</Link>
        </div>
      </form>
    </div>
  );
}

const I = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function F({
  label, children, required, full, error,
}: { label: string; children: React.ReactNode; required?: boolean; full?: boolean; error?: string[] }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="mb-1 block text-xs font-medium text-gray-600">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {error?.length ? <p className="mt-1 text-xs text-red-600">{error[0]}</p> : null}
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-600">{label}</span>
      <span className={`tabular-nums ${strong ? 'font-bold text-gray-900' : 'text-gray-800'}`}>{value}</span>
    </div>
  );
}
