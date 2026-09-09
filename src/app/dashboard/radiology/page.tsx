'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

/**
 * The radiology worklist.
 *
 * One screen, two audiences. A surgeon comes here to ask for a scan and to see
 * whether the one they asked for yesterday exists yet. Radiology comes here to
 * work through what has been asked for, in the order it actually matters.
 */

type Status = 'REQUESTED' | 'ACCEPTED' | 'SCHEDULED' | 'PERFORMED' | 'REPORTED' | 'CANCELLED';
type Urgency = 'ROUTINE' | 'URGENT' | 'EMERGENCY' | 'INTRA_OPERATIVE';

interface ImagingRequest {
  id: string;
  patientId: string;
  surgeryId: string | null;
  modality: string;
  bodyRegion: string;
  clinicalQuestion: string;
  urgency: Urgency;
  status: Status;
  contrastRequested: boolean;
  pregnancyExcluded: boolean | null;
  creatinineChecked: boolean | null;
  requestedByName: string;
  requestedAt: string;
  scheduledFor: string | null;
  performedAt: string | null;
  reportText: string | null;
  reportedByName: string | null;
  reportedAt: string | null;
  criticalFinding: boolean;
  criticalAckAt: string | null;
  criticalAckByName: string | null;
  cancelReason: string | null;
  patient: { id: string; name: string; folderNumber: string; ward: string } | null;
}

interface Patient { id: string; name: string; folderNumber: string; ward: string }

const MODALITIES = ['XRAY', 'CT', 'MRI', 'ULTRASOUND', 'FLUOROSCOPY', 'MAMMOGRAPHY', 'INTERVENTIONAL', 'OTHER'];

const URGENCY_STYLE: Record<Urgency, string> = {
  EMERGENCY: 'bg-red-100 text-red-800 border-red-300',
  INTRA_OPERATIVE: 'bg-purple-100 text-purple-800 border-purple-300',
  URGENT: 'bg-amber-100 text-amber-800 border-amber-300',
  ROUTINE: 'bg-gray-100 text-gray-700 border-gray-300',
};

const STATUS_STYLE: Record<Status, string> = {
  REQUESTED: 'bg-blue-100 text-blue-800',
  ACCEPTED: 'bg-indigo-100 text-indigo-800',
  SCHEDULED: 'bg-cyan-100 text-cyan-800',
  PERFORMED: 'bg-teal-100 text-teal-800',
  REPORTED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-200 text-gray-600',
};

const RADIOLOGY_ROLES = ['RADIOLOGIST', 'RADIOGRAPHER', 'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];

export default function RadiologyPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role ?? '';
  const isRadiology = RADIOLOGY_ROLES.includes(role);
  const canReport = role === 'RADIOLOGIST' || ['ADMIN', 'SYSTEM_ADMINISTRATOR'].includes(role);

  const [requests, setRequests] = useState<ImagingRequest[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [form, setForm] = useState({
    patientId: '', modality: 'XRAY', bodyRegion: '', clinicalQuestion: '',
    urgency: 'ROUTINE' as Urgency, contrastRequested: false,
    pregnancyExcluded: false, creatinineChecked: false,
  });
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await fetch(`/api/imaging${showAll ? '' : '?outstanding=true'}`, { cache: 'no-store' });
      if (!r.ok) { setErr('Could not load the worklist.'); return; }
      const d = await r.json();
      setRequests(Array.isArray(d.requests) ? d.requests : []);
    } catch {
      setErr('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    fetch('/api/patients?limit=300')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setPatients(Array.isArray(d) ? d : d.patients ?? []))
      .catch(() => {});
  }, []);

  const act = async (id: string, action: string, extra: Record<string, unknown> = {}) => {
    setBusy(id);
    setErr(null);
    try {
      const r = await fetch(`/api/imaging/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setErr(d.error ?? 'That did not work.');
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch('/api/imaging', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setErr(d.error ?? 'Could not save that request.');
        return;
      }
      setShowForm(false);
      setForm({
        patientId: '', modality: 'XRAY', bodyRegion: '', clinicalQuestion: '',
        urgency: 'ROUTINE', contrastRequested: false, pregnancyExcluded: false, creatinineChecked: false,
      });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const unacknowledged = requests.filter((r) => r.criticalFinding && !r.criticalAckAt);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Radiology</h1>
          <p className="text-sm text-gray-600 mt-1">
            Imaging asked for, and what has come back. Emergencies sort to the top.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            className="px-3 py-2 text-sm rounded-md border border-gray-300 bg-white hover:bg-gray-50"
          >
            {showAll ? 'Show outstanding only' : 'Show everything'}
          </button>
          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            className="px-4 py-2 text-sm font-medium rounded-md bg-primary-600 text-white hover:bg-primary-700"
          >
            {showForm ? 'Close' : 'Request imaging'}
          </button>
        </div>
      </div>

      {err && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{err}</div>}

      {/* A critical finding nobody has acknowledged is the one thing on this
          page that cannot wait for somebody to scroll. */}
      {unacknowledged.length > 0 && (
        <div className="rounded-lg border-2 border-red-400 bg-red-50 p-4">
          <p className="font-semibold text-red-900">
            {unacknowledged.length} critical finding{unacknowledged.length === 1 ? '' : 's'} not yet acknowledged
          </p>
          <ul className="mt-2 space-y-2">
            {unacknowledged.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 flex-wrap text-sm">
                <span className="text-red-900">
                  {r.patient?.name ?? 'Patient'} — {r.modality} {r.bodyRegion}
                  {r.reportedByName ? `, reported by ${r.reportedByName}` : ''}
                </span>
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => void act(r.id, 'acknowledge')}
                  className="px-3 py-1.5 text-sm font-medium rounded-md bg-red-700 text-white hover:bg-red-800 disabled:opacity-50"
                >
                  I have read this
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="card space-y-4 p-4 border border-gray-200 rounded-lg bg-white">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="rx-patient" className="label">Patient</label>
              <select
                id="rx-patient" required className="input-field" value={form.patientId}
                onChange={(e) => setForm((f) => ({ ...f, patientId: e.target.value }))}
              >
                <option value="">Select patient</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {p.folderNumber} ({p.ward})</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="rx-modality" className="label">Modality</label>
              <select
                id="rx-modality" className="input-field" value={form.modality}
                onChange={(e) => setForm((f) => ({ ...f, modality: e.target.value }))}
              >
                {MODALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="rx-region" className="label">Body region</label>
              <input
                id="rx-region" required className="input-field" value={form.bodyRegion}
                onChange={(e) => setForm((f) => ({ ...f, bodyRegion: e.target.value }))}
                placeholder="e.g. Chest, Right femur"
              />
            </div>
            <div>
              <label htmlFor="rx-urgency" className="label">Urgency</label>
              <select
                id="rx-urgency" className="input-field" value={form.urgency}
                onChange={(e) => setForm((f) => ({ ...f, urgency: e.target.value as Urgency }))}
              >
                <option value="ROUTINE">Routine</option>
                <option value="URGENT">Urgent</option>
                <option value="EMERGENCY">Emergency</option>
                <option value="INTRA_OPERATIVE">Intra-operative (wanted in theatre)</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="rx-question" className="label">What do you need this to answer?</label>
            <textarea
              id="rx-question" required rows={2} className="input-field" value={form.clinicalQuestion}
              onChange={(e) => setForm((f) => ({ ...f, clinicalQuestion: e.target.value }))}
              placeholder="e.g. Is there free gas under the diaphragm?"
            />
            <p className="text-xs text-gray-500 mt-1">
              A request that says only &ldquo;CT abdomen&rdquo; gets a report that answers nobody&rsquo;s question.
            </p>
          </div>

          <fieldset className="border border-gray-200 rounded-md p-3">
            <legend className="text-xs font-semibold text-gray-600 px-1">Safety checks</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.contrastRequested}
                  onChange={(e) => setForm((f) => ({ ...f, contrastRequested: e.target.checked }))} />
                Contrast requested
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.pregnancyExcluded}
                  onChange={(e) => setForm((f) => ({ ...f, pregnancyExcluded: e.target.checked }))} />
                Pregnancy excluded
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.creatinineChecked}
                  onChange={(e) => setForm((f) => ({ ...f, creatinineChecked: e.target.checked }))} />
                Creatinine checked
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Asked here rather than at the scanner, where the answer costs a wasted patient journey.
            </p>
          </fieldset>

          <button type="submit" disabled={saving}
            className="px-4 py-2 text-sm font-medium rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Send request'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-gray-500">Loading worklist…</p>
      ) : requests.length === 0 ? (
        <p className="text-gray-500">Nothing outstanding.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <article key={r.id} className={`rounded-lg border-2 bg-white p-4 ${URGENCY_STYLE[r.urgency]}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_STYLE[r.status]}`}>
                      {r.status}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wide">{r.urgency.replace('_', '-')}</span>
                    {r.criticalFinding && (
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-600 text-white">CRITICAL</span>
                    )}
                    {r.contrastRequested && (
                      <span className="px-2 py-0.5 rounded text-xs bg-white border border-gray-300">contrast</span>
                    )}
                  </div>
                  <h3 className="mt-1 font-semibold text-gray-900">
                    {r.modality} — {r.bodyRegion}
                  </h3>
                  <p className="text-sm text-gray-700">
                    {r.patient ? `${r.patient.name} · ${r.patient.folderNumber} · ${r.patient.ward}` : 'Patient unknown'}
                  </p>
                  <p className="text-sm text-gray-800 mt-1 italic">&ldquo;{r.clinicalQuestion}&rdquo;</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Asked by {r.requestedByName} on {new Date(r.requestedAt).toLocaleString('en-GB')}
                    {r.scheduledFor ? ` · booked for ${new Date(r.scheduledFor).toLocaleString('en-GB')}` : ''}
                  </p>
                  {r.cancelReason && (
                    <p className="text-xs text-gray-600 mt-1">Cancelled: {r.cancelReason}</p>
                  )}
                </div>

                {isRadiology && r.status !== 'CANCELLED' && r.status !== 'REPORTED' && (
                  <div className="flex flex-wrap gap-2">
                    {r.status === 'REQUESTED' && (
                      <button type="button" disabled={busy === r.id}
                        onClick={() => void act(r.id, 'accept')}
                        className="px-3 py-1.5 text-sm rounded-md border border-gray-400 bg-white hover:bg-gray-50">
                        Accept
                      </button>
                    )}
                    {r.status !== 'PERFORMED' && (
                      <button type="button" disabled={busy === r.id}
                        onClick={() => {
                          const when = window.prompt('Book for (YYYY-MM-DD HH:MM)');
                          if (!when) return;
                          const d = new Date(when.replace(' ', 'T'));
                          if (Number.isNaN(d.getTime())) { setErr('That date could not be read.'); return; }
                          void act(r.id, 'schedule', { scheduledFor: d.toISOString() });
                        }}
                        className="px-3 py-1.5 text-sm rounded-md border border-gray-400 bg-white hover:bg-gray-50">
                        Schedule
                      </button>
                    )}
                    <button type="button" disabled={busy === r.id}
                      onClick={() => void act(r.id, 'perform')}
                      className="px-3 py-1.5 text-sm rounded-md border border-gray-400 bg-white hover:bg-gray-50">
                      Mark performed
                    </button>
                    {canReport && (
                      <button type="button" disabled={busy === r.id}
                        onClick={() => {
                          const text = window.prompt('Report');
                          if (!text) return;
                          const critical = window.confirm('Does this contain a critical finding that changes management today?');
                          void act(r.id, 'report', { reportText: text, criticalFinding: critical });
                        }}
                        className="px-3 py-1.5 text-sm rounded-md bg-primary-600 text-white hover:bg-primary-700">
                        Report
                      </button>
                    )}
                  </div>
                )}
              </div>

              {r.reportText && (
                <div className="mt-3 rounded-md bg-gray-50 border border-gray-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Report — {r.reportedByName}
                    {r.reportedAt ? `, ${new Date(r.reportedAt).toLocaleString('en-GB')}` : ''}
                  </p>
                  <p className="text-sm text-gray-900 mt-1 whitespace-pre-wrap">{r.reportText}</p>
                  {r.criticalFinding && (
                    <p className={`text-xs mt-2 ${r.criticalAckAt ? 'text-green-700' : 'text-red-700 font-semibold'}`}>
                      {r.criticalAckAt
                        ? `Acknowledged by ${r.criticalAckByName} on ${new Date(r.criticalAckAt).toLocaleString('en-GB')}`
                        : 'Critical finding — not yet acknowledged by anybody.'}
                    </p>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
