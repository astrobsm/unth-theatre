'use client';

// ============================================================
// Raise an imprest
// ------------------------------------------------------------
// Ported from ImprestFormPage. Money is entered in naira and converted to kobo
// on submit — the API and database deal only in integer kobo, so nothing here
// ever produces a floating-point amount.
//
// The form posts with plain fetch, so raising an imprest with no network queues
// it like any other change and the row appears in the register immediately,
// badged as saved on this device.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, AlertCircle } from 'lucide-react';
import { nairaToKobo, formatNaira } from '@/lib/imprest/money';

interface Ref { id: string; code?: string; name?: string; label?: string; fullName?: string; isCurrent?: boolean; isClosed?: boolean }

const todayIso = () => new Date().toISOString().slice(0, 10);
/** Imprest is conventionally retired within 30 days of receipt. */
const defaultRetirementDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
};

export default function NewImprestPage() {
  const router = useRouter();
  const [reference, setReference] = useState<Record<string, Ref[]>>({});
  const [loadingRef, setLoadingRef] = useState(true);
  const [refError, setRefError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [form, setForm] = useState({
    financialYearId: '',
    departmentId: '',
    receivingOfficerId: '',
    voucherNumber: '',
    approvalNumber: '',
    office: '',
    dateApproved: todayIso(),
    dateReceived: '',
    amountApproved: '',
    amountReceived: '',
    purpose: '',
    fundingSource: '',
    budgetHeadId: '',
    voteCodeId: '',
    costCentreId: '',
    expectedRetirementDate: defaultRetirementDate(),
    remarks: '',
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/imprest/reference');
        if (res.status === 401 || res.status === 403) {
          const b = await res.json().catch(() => ({}));
          setRefError(b.error || 'You do not have an imprest duty assigned.');
          return;
        }
        if (!res.ok) throw new Error();
        const data = await res.json();
        setReference(data);
        // Default to the current financial year — the common case.
        const current = (data.financialYears ?? []).find((y: Ref) => y.isCurrent && !y.isClosed);
        if (current) setForm((f) => ({ ...f, financialYearId: current.id }));
      } catch {
        setRefError('Could not load reference data. If you are offline it will appear once cached.');
      } finally {
        setLoadingRef(false);
      }
    })();
  }, []);

  // Vote codes belong to a budget head; narrow the list once one is chosen.
  const voteCodes = useMemo(() => {
    const all = (reference.voteCodes ?? []) as Array<Ref & { budgetHeadId?: string | null }>;
    if (!form.budgetHeadId) return all;
    return all.filter((v) => !v.budgetHeadId || v.budgetHeadId === form.budgetHeadId);
  }, [reference.voteCodes, form.budgetHeadId]);

  const approvedKobo = form.amountApproved ? nairaToKobo(Number(form.amountApproved)) : 0;
  const receivedKobo = form.amountReceived ? nairaToKobo(Number(form.amountReceived)) : 0;
  const receivedExceeds = receivedKobo > approvedKobo && approvedKobo > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});

    try {
      const res = await fetch('/api/imprest/imprests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          financialYearId: form.financialYearId,
          departmentId: form.departmentId,
          receivingOfficerId: form.receivingOfficerId,
          voucherNumber: form.voucherNumber || undefined,
          approvalNumber: form.approvalNumber || undefined,
          office: form.office || undefined,
          dateApproved: form.dateApproved,
          dateReceived: form.dateReceived || null,
          amountApproved: approvedKobo,
          amountReceived: receivedKobo,
          purpose: form.purpose,
          fundingSource: form.fundingSource || undefined,
          budgetHeadId: form.budgetHeadId || null,
          voteCodeId: form.voteCodeId || null,
          costCentreId: form.costCentreId || null,
          expectedRetirementDate: form.expectedRetirementDate,
          remarks: form.remarks || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || 'The imprest could not be saved.');
        if (data.details?.fieldErrors) setFieldErrors(data.details.fieldErrors);
        return;
      }

      // Offline, the interceptor returns the queued record with a local id, so
      // the register can show it straight away.
      router.push('/dashboard/imprest');
    } catch {
      setError('Could not reach the server. Your entry has been kept on this device.');
    } finally {
      setSaving(false);
    }
  };

  if (refError) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-900">Cannot raise an imprest</p>
              <p className="text-sm text-amber-800">{refError}</p>
              <Link href="/dashboard/imprest/duties" className="text-xs font-semibold text-amber-900 underline">
                Open Imprest Duties →
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/imprest" className="rounded-lg border border-gray-300 p-2 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Raise an Imprest</h1>
          <p className="text-sm text-gray-500">The number is allocated automatically on save.</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <form onSubmit={submit} className="space-y-5">
        <Section title="Approval">
          <Field label="Financial year" required error={fieldErrors.financialYearId}>
            <select required value={form.financialYearId} onChange={(e) => set('financialYearId', e.target.value)} className={inputCls}>
              <option value="">Select…</option>
              {(reference.financialYears ?? []).map((y) => (
                <option key={y.id} value={y.id} disabled={y.isClosed}>
                  {y.label}{y.isClosed ? ' (closed)' : ''}{y.isCurrent ? ' — current' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Department" required error={fieldErrors.departmentId}>
            <select required value={form.departmentId} onChange={(e) => set('departmentId', e.target.value)} className={inputCls}>
              <option value="">Select…</option>
              {(reference.departments ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Approval number"><input value={form.approvalNumber} onChange={(e) => set('approvalNumber', e.target.value)} className={inputCls} /></Field>
          <Field label="Date approved" required error={fieldErrors.dateApproved}>
            <input type="date" required value={form.dateApproved} onChange={(e) => set('dateApproved', e.target.value)} className={inputCls} />
          </Field>
        </Section>

        <Section title="Funds">
          <Field label="Amount approved (₦)" required error={fieldErrors.amountApproved}>
            <input type="number" min="0" step="0.01" required value={form.amountApproved} onChange={(e) => set('amountApproved', e.target.value)} className={inputCls} />
            {approvedKobo > 0 && <p className="mt-1 text-xs text-gray-500">{formatNaira(approvedKobo)}</p>}
          </Field>
          <Field label="Amount received (₦)" error={fieldErrors.amountReceived}>
            <input type="number" min="0" step="0.01" value={form.amountReceived} onChange={(e) => set('amountReceived', e.target.value)} className={inputCls} />
            {receivedExceeds && (
              <p className="mt-1 text-xs font-medium text-red-600">
                Cannot exceed the amount approved.
              </p>
            )}
            {!receivedExceeds && receivedKobo > 0 && (
              <p className="mt-1 text-xs text-gray-500">{formatNaira(receivedKobo)} — recording receipt activates the imprest.</p>
            )}
          </Field>
          <Field label="Voucher number"><input value={form.voucherNumber} onChange={(e) => set('voucherNumber', e.target.value)} className={inputCls} /></Field>
          <Field label="Date received"><input type="date" value={form.dateReceived} onChange={(e) => set('dateReceived', e.target.value)} className={inputCls} /></Field>
          <Field label="Receiving officer" required error={fieldErrors.receivingOfficerId}>
            <select required value={form.receivingOfficerId} onChange={(e) => set('receivingOfficerId', e.target.value)} className={inputCls}>
              <option value="">Select…</option>
              {(reference.officers ?? []).map((o) => (
                <option key={o.id} value={o.id}>{o.fullName}{o.code ? ` (${o.code})` : ''}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">Only staff holding an imprest duty may receive funds.</p>
          </Field>
          <Field label="Retire by" required error={fieldErrors.expectedRetirementDate}>
            <input type="date" required value={form.expectedRetirementDate} onChange={(e) => set('expectedRetirementDate', e.target.value)} className={inputCls} />
          </Field>
        </Section>

        <Section title="Classification">
          <Field label="Budget head">
            <select value={form.budgetHeadId} onChange={(e) => { set('budgetHeadId', e.target.value); set('voteCodeId', ''); }} className={inputCls}>
              <option value="">None</option>
              {(reference.budgetHeads ?? []).map((b) => (<option key={b.id} value={b.id}>{b.code} — {b.name}</option>))}
            </select>
          </Field>
          <Field label="Vote code">
            <select value={form.voteCodeId} onChange={(e) => set('voteCodeId', e.target.value)} className={inputCls}>
              <option value="">None</option>
              {voteCodes.map((v) => (<option key={v.id} value={v.id}>{v.code} — {v.name}</option>))}
            </select>
          </Field>
          <Field label="Cost centre">
            <select value={form.costCentreId} onChange={(e) => set('costCentreId', e.target.value)} className={inputCls}>
              <option value="">None</option>
              {(reference.costCentres ?? []).map((c) => (<option key={c.id} value={c.id}>{c.code} — {c.name}</option>))}
            </select>
          </Field>
          <Field label="Funding source"><input value={form.fundingSource} onChange={(e) => set('fundingSource', e.target.value)} className={inputCls} /></Field>
          <Field label="Office"><input value={form.office} onChange={(e) => set('office', e.target.value)} className={inputCls} /></Field>
        </Section>

        <Section title="Purpose" full>
          <Field label="Purpose of the imprest" required full error={fieldErrors.purpose}>
            <textarea required rows={3} value={form.purpose} onChange={(e) => set('purpose', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Remarks" full>
            <textarea rows={2} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} className={inputCls} />
          </Field>
        </Section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || loadingRef || receivedExceeds}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save imprest'}
          </button>
          <Link href="/dashboard/imprest" className="text-sm text-gray-600 hover:text-gray-900">Cancel</Link>
        </div>
      </form>
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none';

function Section({ title, children, full }: { title: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">{title}</h2>
      <div className={full ? 'space-y-3' : 'grid gap-3 sm:grid-cols-2'}>{children}</div>
    </div>
  );
}

function Field({
  label, children, required, full, error,
}: { label: string; children: React.ReactNode; required?: boolean; full?: boolean; error?: string[] }) {
  return (
    <div className={full ? '' : ''}>
      <label className="mb-1 block text-xs font-medium text-gray-600">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {error?.length ? <p className="mt-1 text-xs text-red-600">{error[0]}</p> : null}
    </div>
  );
}
