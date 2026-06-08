'use client';

/**
 * New Oxygen Readiness Report form.
 * POSTs to /api/oxygen/readiness which expects the fields below.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Wind, Save, ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';

const SHIFT_OPTIONS = ['MORNING', 'AFTERNOON', 'NIGHT'] as const;
const STATUS_OPTIONS = ['EXCELLENT', 'GOOD', 'ADEQUATE', 'LOW', 'CRITICAL'] as const;
const READINESS_OPTIONS = ['EXCELLENT', 'GOOD', 'ADEQUATE', 'COMPROMISED', 'CRITICAL'] as const;

export default function NewOxygenReadinessReportPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    reportDate: new Date().toISOString().slice(0, 16),
    shiftType: 'MORNING' as (typeof SHIFT_OPTIONS)[number],

    centralOxygenPressure: 50,
    centralOxygenStatus: 'GOOD' as (typeof STATUS_OPTIONS)[number],
    cylinderBankLevel: 80,
    backupCylindersCount: 4,
    backupCylindersStatus: 'GOOD' as (typeof STATUS_OPTIONS)[number],

    manifoldSystemOk: true,
    pipelineIntegrityOk: true,

    theatre1OxygenOk: true,
    theatre1Pressure: 50,
    theatre2OxygenOk: true,
    theatre2Pressure: 50,
    theatre3OxygenOk: true,
    theatre3Pressure: 50,
    theatre4OxygenOk: true,
    theatre4Pressure: 50,
    recoveryRoomOxygenOk: true,
    recoveryRoomPressure: 50,

    alarmSystemFunctional: true,
    lowPressureAlarmOk: true,
    highPressureAlarmOk: true,

    predictedShortage: false,
    shortageEstimatedTime: '',
    shortageReason: '',

    lastMaintenanceDate: '',
    nextMaintenanceDate: '',
    maintenanceRequired: false,
    maintenanceDetails: '',

    overallReadiness: 'GOOD' as (typeof READINESS_OPTIONS)[number],
    criticalIssues: '',
    actionTaken: '',
    recommendations: '',
    notes: '',
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/oxygen/readiness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
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
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/oxygen-control"
            className="text-blue-700 hover:text-blue-900 inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Oxygen Control
          </Link>
        </div>
      </div>

      <header className="flex items-center gap-3">
        <Wind className="w-8 h-8 text-blue-700" />
        <div>
          <h1 className="text-2xl font-bold text-blue-900">New Oxygen Readiness Report</h1>
          <p className="text-sm text-gray-600">
            Submitted by the Oxygen Unit Supervisor at the start of each shift.
          </p>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={submit} className="space-y-6">
        <Section title="Report metadata">
          <Field label="Report date & time">
            <input
              type="datetime-local"
              value={form.reportDate}
              onChange={(e) => set('reportDate', e.target.value)}
              className={inputCls}
              required
            />
          </Field>
          <Field label="Shift">
            <select
              value={form.shiftType}
              onChange={(e) => set('shiftType', e.target.value as typeof form.shiftType)}
              className={inputCls}
            >
              {SHIFT_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </Field>
          <Field label="Overall readiness">
            <select
              value={form.overallReadiness}
              onChange={(e) => set('overallReadiness', e.target.value as typeof form.overallReadiness)}
              className={inputCls}
            >
              {READINESS_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </Field>
        </Section>

        <Section title="Central oxygen supply">
          <Field label="Central oxygen pressure (psi)">
            <input
              type="number"
              value={form.centralOxygenPressure}
              onChange={(e) => set('centralOxygenPressure', Number(e.target.value))}
              className={inputCls}
              min={0}
              step={0.1}
            />
          </Field>
          <Field label="Central oxygen status">
            <select
              value={form.centralOxygenStatus}
              onChange={(e) => set('centralOxygenStatus', e.target.value as typeof form.centralOxygenStatus)}
              className={inputCls}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </Field>
          <Field label="Cylinder bank level (%)">
            <input
              type="number"
              value={form.cylinderBankLevel}
              onChange={(e) => set('cylinderBankLevel', Number(e.target.value))}
              className={inputCls}
              min={0}
              max={100}
            />
          </Field>
          <Field label="Backup cylinders count">
            <input
              type="number"
              value={form.backupCylindersCount}
              onChange={(e) => set('backupCylindersCount', Number(e.target.value))}
              className={inputCls}
              min={0}
            />
          </Field>
          <Field label="Backup cylinders status">
            <select
              value={form.backupCylindersStatus}
              onChange={(e) => set('backupCylindersStatus', e.target.value as typeof form.backupCylindersStatus)}
              className={inputCls}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </Field>
        </Section>

        <Section title="System integrity">
          <Checkbox label="Manifold system OK" checked={form.manifoldSystemOk} onChange={(v) => set('manifoldSystemOk', v)} />
          <Checkbox label="Pipeline integrity OK" checked={form.pipelineIntegrityOk} onChange={(v) => set('pipelineIntegrityOk', v)} />
          <Checkbox label="Alarm system functional" checked={form.alarmSystemFunctional} onChange={(v) => set('alarmSystemFunctional', v)} />
          <Checkbox label="Low-pressure alarm OK" checked={form.lowPressureAlarmOk} onChange={(v) => set('lowPressureAlarmOk', v)} />
          <Checkbox label="High-pressure alarm OK" checked={form.highPressureAlarmOk} onChange={(v) => set('highPressureAlarmOk', v)} />
        </Section>

        <Section title="Per-theatre check">
          {[1, 2, 3, 4].map((n) => {
            const okKey = `theatre${n}OxygenOk` as keyof typeof form;
            const pKey = `theatre${n}Pressure` as keyof typeof form;
            return (
              <div key={n} className="contents">
                <Checkbox
                  label={`Theatre ${n} oxygen OK`}
                  checked={form[okKey] as boolean}
                  onChange={(v) => set(okKey as 'theatre1OxygenOk', v)}
                />
                <Field label={`Theatre ${n} pressure (psi)`}>
                  <input
                    type="number"
                    value={form[pKey] as number}
                    onChange={(e) => set(pKey as 'theatre1Pressure', Number(e.target.value))}
                    className={inputCls}
                    min={0}
                    step={0.1}
                  />
                </Field>
              </div>
            );
          })}
          <Checkbox
            label="Recovery room oxygen OK"
            checked={form.recoveryRoomOxygenOk}
            onChange={(v) => set('recoveryRoomOxygenOk', v)}
          />
          <Field label="Recovery room pressure (psi)">
            <input
              type="number"
              value={form.recoveryRoomPressure}
              onChange={(e) => set('recoveryRoomPressure', Number(e.target.value))}
              className={inputCls}
              min={0}
              step={0.1}
            />
          </Field>
        </Section>

        <Section title="Predicted shortage">
          <Checkbox
            label="Predict shortage in this shift?"
            checked={form.predictedShortage}
            onChange={(v) => set('predictedShortage', v)}
          />
          <Field label="Estimated time of shortage">
            <input
              type="datetime-local"
              value={form.shortageEstimatedTime}
              onChange={(e) => set('shortageEstimatedTime', e.target.value)}
              className={inputCls}
              disabled={!form.predictedShortage}
            />
          </Field>
          <Field label="Reason for predicted shortage" full>
            <input
              type="text"
              value={form.shortageReason}
              onChange={(e) => set('shortageReason', e.target.value)}
              className={inputCls}
              disabled={!form.predictedShortage}
              placeholder="e.g. delivery delay, increased consumption"
            />
          </Field>
        </Section>

        <Section title="Maintenance">
          <Field label="Last maintenance date">
            <input
              type="date"
              value={form.lastMaintenanceDate}
              onChange={(e) => set('lastMaintenanceDate', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Next maintenance date">
            <input
              type="date"
              value={form.nextMaintenanceDate}
              onChange={(e) => set('nextMaintenanceDate', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Checkbox
            label="Maintenance required now"
            checked={form.maintenanceRequired}
            onChange={(v) => set('maintenanceRequired', v)}
          />
          <Field label="Maintenance details" full>
            <textarea
              value={form.maintenanceDetails}
              onChange={(e) => set('maintenanceDetails', e.target.value)}
              className={inputCls}
              rows={2}
            />
          </Field>
        </Section>

        <Section title="Issues, actions & notes">
          <Field label="Critical issues" full>
            <textarea
              value={form.criticalIssues}
              onChange={(e) => set('criticalIssues', e.target.value)}
              className={inputCls}
              rows={2}
              placeholder="Leave blank if none"
            />
          </Field>
          <Field label="Action taken" full>
            <textarea
              value={form.actionTaken}
              onChange={(e) => set('actionTaken', e.target.value)}
              className={inputCls}
              rows={2}
            />
          </Field>
          <Field label="Recommendations" full>
            <textarea
              value={form.recommendations}
              onChange={(e) => set('recommendations', e.target.value)}
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
        </Section>

        <div className="flex justify-end gap-2">
          <Link
            href="/dashboard/oxygen-control"
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-800"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-semibold"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save report'}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  'w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <h2 className="px-5 py-3 border-b border-gray-200 font-semibold text-blue-900">{title}</h2>
      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </section>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? 'md:col-span-2' : ''}`}>
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-gray-800">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 text-blue-700 rounded border-gray-300 focus:ring-blue-500"
      />
      {label}
    </label>
  );
}
