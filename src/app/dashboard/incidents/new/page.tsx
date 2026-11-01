'use client';

// ============================================================
// Reporting an incident
// ------------------------------------------------------------
// The Incident Reports list has carried a "Report Incident" button since it
// was built, and that button pointed at /dashboard/incidents/new, which did
// not exist. So the list was empty — not because nothing had happened in
// theatre, but because there was no way for anybody to say that it had.
//
// The API was already there and complete. This is the form it was waiting for.
//
// WHAT IS ASKED FOR, AND WHAT IS NOT. Only four things are required: when,
// what kind, how serious, and where. Everything else is optional, because an
// incident form that demands a full account before it will save anything is a
// form people abandon and finish "later" — and the value of an incident report
// is almost entirely in it being written while the detail is still fresh.
// ============================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';

const INCIDENT_TYPES: { value: string; label: string }[] = [
  { value: 'ACCIDENT', label: 'Accident' },
  { value: 'EQUIPMENT_FAILURE', label: 'Equipment failure' },
  { value: 'SAFETY_HAZARD', label: 'Safety hazard' },
  { value: 'PATIENT_FALL', label: 'Patient fall' },
  { value: 'MEDICATION_ERROR', label: 'Medication error' },
  { value: 'FIRE', label: 'Fire' },
  { value: 'SECURITY_BREACH', label: 'Security breach' },
  { value: 'THREATENING_SITUATION', label: 'Threatening situation' },
  { value: 'FIGHT', label: 'Fight' },
  { value: 'OTHER', label: 'Other' },
];

const SEVERITIES: { value: string; label: string; hint: string; tone: string }[] = [
  { value: 'MINOR', label: 'Minor', hint: 'No harm; noted so it does not recur', tone: 'border-blue-300 bg-blue-50 text-blue-900' },
  { value: 'MODERATE', label: 'Moderate', hint: 'Care was disrupted or delayed', tone: 'border-yellow-300 bg-yellow-50 text-yellow-900' },
  { value: 'MAJOR', label: 'Major', hint: 'Harm, or a case affected', tone: 'border-orange-300 bg-orange-50 text-orange-900' },
  { value: 'CRITICAL', label: 'Critical', hint: 'Serious harm, or very nearly', tone: 'border-red-300 bg-red-50 text-red-900' },
];

/** Local date and time, formatted for a datetime-local input. */
function nowForInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function NewIncidentPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    incidentDate: nowForInput(),
    incidentType: '',
    severity: '',
    location: '',
    description: '',
    witnessesPresent: false,
    witnessNames: '',
    injuriesReported: false,
    injuryDetails: '',
    damagesReported: false,
    damageDetails: '',
    investigationRequired: true,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.incidentType) return setError('What kind of incident was it?');
    if (!form.severity) return setError('How serious was it?');
    if (!form.location.trim()) return setError('Where did it happen?');
    if (!form.description.trim()) return setError('Please describe what happened.');

    setSaving(true);
    try {
      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          incidentDate: new Date(form.incidentDate).toISOString(),
          // Blank optional text is sent as null rather than '', so the detail
          // page can tell "nothing to add" from "not answered".
          witnessNames: form.witnessesPresent && form.witnessNames.trim() ? form.witnessNames.trim() : null,
          injuryDetails: form.injuriesReported && form.injuryDetails.trim() ? form.injuryDetails.trim() : null,
          damageDetails: form.damagesReported && form.damageDetails.trim() ? form.damageDetails.trim() : null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Could not save the report');
      }
      const saved = await res.json();
      router.push(saved?.id ? `/dashboard/incidents/${saved.id}` : '/dashboard/incidents');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the report');
      setSaving(false);
    }
  };

  const field = 'w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent';
  const label = 'block text-sm font-medium text-gray-700 mb-2';

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link href="/dashboard/incidents" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeft className="w-4 h-4" />
        Back to incident reports
      </Link>

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <AlertTriangle className="w-8 h-8 text-orange-500" />
          Report an Incident
        </h1>
        <p className="text-gray-600 mt-1">
          Write it while it is fresh. Only the first four answers are required — the rest
          can be added by whoever investigates.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="space-y-6">
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={label} htmlFor="incidentDate">When did it happen? *</label>
              <input
                id="incidentDate"
                type="datetime-local"
                value={form.incidentDate}
                onChange={(e) => set('incidentDate', e.target.value)}
                className={field}
                required
              />
            </div>
            <div>
              <label className={label} htmlFor="incidentType">What kind of incident? *</label>
              <select
                id="incidentType"
                value={form.incidentType}
                onChange={(e) => set('incidentType', e.target.value)}
                className={field}
                required
              >
                <option value="">Choose…</option>
                {INCIDENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <span className={label}>How serious was it? *</span>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {SEVERITIES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => set('severity', s.value)}
                  className={`rounded-lg border-2 p-3 text-left transition ${
                    form.severity === s.value ? s.tone : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="font-semibold text-sm">{s.label}</div>
                  <div className="text-xs mt-1 opacity-80">{s.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={label} htmlFor="location">Where? *</label>
            <input
              id="location"
              type="text"
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
              placeholder="Theatre 3, recovery bay 2, the corridor to CSSD…"
              className={field}
              required
            />
          </div>

          <div>
            <label className={label} htmlFor="description">What happened? *</label>
            <textarea
              id="description"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={5}
              placeholder="What you saw, in the order it happened. Names of staff involved are better here than left out."
              className={field}
              required
            />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Anything else worth recording</h2>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={form.witnessesPresent}
              onChange={(e) => set('witnessesPresent', e.target.checked)}
              className="mt-1 w-4 h-4"
            />
            <span className="text-sm text-gray-800">Someone else saw it</span>
          </label>
          {form.witnessesPresent && (
            <input
              type="text"
              value={form.witnessNames}
              onChange={(e) => set('witnessNames', e.target.value)}
              placeholder="Who was there"
              className={field}
            />
          )}

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={form.injuriesReported}
              onChange={(e) => set('injuriesReported', e.target.checked)}
              className="mt-1 w-4 h-4"
            />
            <span className="text-sm text-gray-800">Somebody was hurt</span>
          </label>
          {form.injuriesReported && (
            <textarea
              value={form.injuryDetails}
              onChange={(e) => set('injuryDetails', e.target.value)}
              rows={2}
              placeholder="Who, and what the injury was"
              className={field}
            />
          )}

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={form.damagesReported}
              onChange={(e) => set('damagesReported', e.target.checked)}
              className="mt-1 w-4 h-4"
            />
            <span className="text-sm text-gray-800">Equipment or property was damaged</span>
          </label>
          {form.damagesReported && (
            <textarea
              value={form.damageDetails}
              onChange={(e) => set('damageDetails', e.target.value)}
              rows={2}
              placeholder="What was damaged, and whether it is still usable"
              className={field}
            />
          )}

          <label className="flex items-start gap-3 pt-2 border-t border-gray-100">
            <input
              type="checkbox"
              checked={form.investigationRequired}
              onChange={(e) => set('investigationRequired', e.target.checked)}
              className="mt-1 w-4 h-4"
            />
            <span className="text-sm text-gray-800">
              This needs investigating
              <span className="block text-xs text-gray-500">
                Left ticked by default. Untick only for something already fully accounted for.
              </span>
            </span>
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <AlertTriangle className="w-5 h-5" />}
            {saving ? 'Saving…' : 'Submit report'}
          </button>
          <Link href="/dashboard/incidents" className="px-6 py-3 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
