'use client';

/**
 * Trigger a new Oxygen Alert.
 * POSTs to /api/oxygen/alerts. Only ANAESTHETIST / CONSULTANT_ANAESTHETIST /
 * ANAESTHETIC_TECHNICIAN / THEATRE_MANAGER / ADMIN are authorised server-side.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertOctagon, Save, ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';

const ALERT_TYPES = [
  'LOW_PRESSURE',
  'SUPPLY_FAILURE',
  'PIPELINE_LEAK',
  'CYLINDER_DEPLETION',
  'CONTAMINATION',
  'EQUIPMENT_MALFUNCTION',
  'OTHER',
] as const;

const SEVERITIES = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as const;

export default function NewOxygenAlertPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    alertType: 'LOW_PRESSURE' as (typeof ALERT_TYPES)[number],
    severity: 'HIGH' as (typeof SEVERITIES)[number],
    location: '',
    affectedTheatres: '',
    currentPressure: '' as string | number,
    normalPressure: '' as string | number,
    oxygenLevel: '' as string | number,
    description: '',
    immediateRisk: false,
    surgeriesAffected: 0,
    patientsAffected: 0,
    triggerReason: '',
    notes: '',
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/oxygen/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          currentPressure: form.currentPressure === '' ? undefined : Number(form.currentPressure),
          normalPressure: form.normalPressure === '' ? undefined : Number(form.normalPressure),
          oxygenLevel: form.oxygenLevel === '' ? undefined : Number(form.oxygenLevel),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `Save failed (${res.status})`);
      }
      router.push('/dashboard/oxygen-control');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <Link
        href="/dashboard/oxygen-control"
        className="text-blue-700 hover:text-blue-900 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Oxygen Control
      </Link>

      <header className="flex items-center gap-3">
        <AlertOctagon className="w-8 h-8 text-red-600" />
        <div>
          <h1 className="text-2xl font-bold text-red-700">Trigger Oxygen Alert</h1>
          <p className="text-sm text-gray-600">
            Anaesthetists and theatre technicians can raise an alert that immediately notifies the Oxygen Unit.
          </p>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={submit} className="space-y-5 bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Alert type">
            <select
              value={form.alertType}
              onChange={(e) => set('alertType', e.target.value as typeof form.alertType)}
              className={inputCls}
            >
              {ALERT_TYPES.map((o) => (
                <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </Field>
          <Field label="Severity">
            <select
              value={form.severity}
              onChange={(e) => set('severity', e.target.value as typeof form.severity)}
              className={inputCls}
            >
              {SEVERITIES.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </Field>
          <Field label="Location">
            <input
              type="text"
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
              className={inputCls}
              placeholder="e.g. Theatre 2"
              required
            />
          </Field>
          <Field label="Affected theatres (comma-separated)">
            <input
              type="text"
              value={form.affectedTheatres}
              onChange={(e) => set('affectedTheatres', e.target.value)}
              className={inputCls}
              placeholder="e.g. Theatre 1, Theatre 3"
            />
          </Field>
          <Field label="Current pressure (psi)">
            <input
              type="number"
              value={form.currentPressure}
              onChange={(e) => set('currentPressure', e.target.value)}
              className={inputCls}
              step={0.1}
            />
          </Field>
          <Field label="Normal pressure (psi)">
            <input
              type="number"
              value={form.normalPressure}
              onChange={(e) => set('normalPressure', e.target.value)}
              className={inputCls}
              step={0.1}
            />
          </Field>
          <Field label="Oxygen level (%)">
            <input
              type="number"
              value={form.oxygenLevel}
              onChange={(e) => set('oxygenLevel', e.target.value)}
              className={inputCls}
              min={0}
              max={100}
              step={0.1}
            />
          </Field>
          <Field label="Surgeries affected (count)">
            <input
              type="number"
              value={form.surgeriesAffected}
              onChange={(e) => set('surgeriesAffected', Number(e.target.value))}
              className={inputCls}
              min={0}
            />
          </Field>
          <Field label="Patients affected (count)">
            <input
              type="number"
              value={form.patientsAffected}
              onChange={(e) => set('patientsAffected', Number(e.target.value))}
              className={inputCls}
              min={0}
            />
          </Field>
          <Field label="Immediate risk to patient?">
            <label className="inline-flex items-center gap-2 mt-2 text-sm">
              <input
                type="checkbox"
                checked={form.immediateRisk}
                onChange={(e) => set('immediateRisk', e.target.checked)}
                className="w-4 h-4 text-red-600 rounded border-gray-300"
              />
              Yes — immediate risk
            </label>
          </Field>
        </div>

        <Field label="Description" full>
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            className={inputCls}
            rows={3}
            required
          />
        </Field>
        <Field label="Reason this alert was triggered" full>
          <textarea
            value={form.triggerReason}
            onChange={(e) => set('triggerReason', e.target.value)}
            className={inputCls}
            rows={2}
          />
        </Field>
        <Field label="Additional notes" full>
          <textarea
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            className={inputCls}
            rows={2}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Link
            href="/dashboard/oxygen-control"
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-800"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Sending alert…' : 'Trigger alert'}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  'w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? 'md:col-span-2' : ''}`}>
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
