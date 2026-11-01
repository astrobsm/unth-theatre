'use client';

// ============================================================
// Responding to an oxygen alert
// ------------------------------------------------------------
// Every active alert on the Oxygen Control board carries a red "Respond"
// button, and it pointed at a page that did not exist. An oxygen alert is
// raised when a theatre may be about to lose its supply, sometimes with a
// patient already asleep — so of all the links in this application, this is
// the worst one to have been dead.
//
// The three steps the API models are the three a person actually takes:
// acknowledge that you have seen it, record what you did, and close it with
// what caused it. Acknowledgement is one press and nothing else, because the
// point of it is speed — someone standing in a theatre corridor confirming
// they are on their way should not be made to fill in a form first.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Clock, Loader2, Wind,
} from 'lucide-react';

interface Person { fullName: string; role?: string }

interface OxygenAlert {
  id: string;
  alertDate: string;
  alertType: string;
  severity: string;
  status: string;
  location: string;
  affectedTheatres: string | null;
  currentPressure: number | null;
  normalPressure: number | null;
  oxygenLevel: number | null;
  description: string;
  immediateRisk: boolean;
  triggerReason: string;
  triggeredBy: Person | null;
  acknowledgedBy: Person | null;
  acknowledgedAt: string | null;
  respondedBy: Person | null;
  respondedAt: string | null;
  responseAction: string | null;
  resolvedBy: Person | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  rootCause: string | null;
  preventativeMeasures: string | null;
  downtime: number | null;
  surgeriesAffected: number;
  patientsAffected: number;
  activeSurgery: {
    id: string;
    procedureName: string;
    scheduledDate: string;
    patient: { name: string; folderNumber: string; ward: string | null } | null;
  } | null;
}

const SEVERITY_TONE: Record<string, string> = {
  LOW: 'bg-blue-100 text-blue-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  HIGH: 'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
};

const words = (s: string) => (s || '').replace(/_/g, ' ');
const when = (v: string | null) => (v
  ? new Date(v).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  : null);

export default function OxygenAlertPage() {
  const params = useParams();
  const id = String(params?.id ?? '');

  const [alert, setAlert] = useState<OxygenAlert | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [responseAction, setResponseAction] = useState('');
  const [downtime, setDowntime] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [preventativeMeasures, setPreventativeMeasures] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/oxygen/alerts/${id}`);
      if (res.status === 404) { setMissing(true); return; }
      if (!res.ok) return;
      setAlert(await res.json());
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  const act = async (action: string, body: Record<string, unknown> = {}) => {
    setBusy(action);
    setNote(null);
    try {
      const res = await fetch(`/api/oxygen/alerts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      });
      if (!res.ok) throw new Error();
      setNote(action === 'acknowledge' ? 'Acknowledged.' : 'Saved.');
      await load();
    } catch {
      setNote('Could not save that.');
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-lg">Loading…</div>;
  }

  if (missing || !alert) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Link href="/dashboard/oxygen-control" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Oxygen Control
        </Link>
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <Wind className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-700">That alert is no longer there.</p>
        </div>
      </div>
    );
  }

  const closed = alert.status === 'RESOLVED' || alert.status === 'CANCELLED';
  const field = 'w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent';

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-sm text-gray-900 mt-0.5">{children}</div>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link href="/dashboard/oxygen-control" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Oxygen Control
      </Link>

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Wind className="w-7 h-7 text-red-600" />
            {words(alert.alertType)}
          </h1>
          <p className="text-gray-600 mt-1">{alert.location} · {when(alert.alertDate)}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${SEVERITY_TONE[alert.severity] ?? 'bg-gray-100 text-gray-800'}`}>
            {alert.severity}
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">
            {words(alert.status)}
          </span>
        </div>
      </div>

      {alert.immediateRisk && !closed && (
        <div className="mb-6 rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
          <div className="text-sm text-red-900">
            <strong>A case is at risk.</strong>
            {alert.activeSurgery && (
              <span>
                {' '}{alert.activeSurgery.procedureName}
                {alert.activeSurgery.patient ? ` — ${alert.activeSurgery.patient.name} (${alert.activeSurgery.patient.folderNumber})` : ''}.
                {' '}
                <Link href={`/dashboard/surgeries/${alert.activeSurgery.id}`} className="underline font-medium">
                  Open the case
                </Link>
              </span>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4 mb-6">
        <h2 className="text-lg font-semibold text-gray-900">What was raised</h2>
        <p className="text-sm text-gray-900 whitespace-pre-wrap">{alert.description}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
          <Row label="Raised by">
            {alert.triggeredBy?.fullName ?? 'Unknown'}
            {alert.triggeredBy?.role ? ` · ${words(alert.triggeredBy.role)}` : ''}
          </Row>
          <Row label="Why">{alert.triggerReason}</Row>
          <Row label="Theatres affected">{alert.affectedTheatres || alert.location}</Row>
          <Row label="Pressure">
            {alert.currentPressure !== null
              ? `${alert.currentPressure}${alert.normalPressure !== null ? ` (normal ${alert.normalPressure})` : ''}`
              : 'Not recorded'}
          </Row>
          <Row label="Oxygen level">{alert.oxygenLevel !== null ? `${alert.oxygenLevel}` : 'Not recorded'}</Row>
          <Row label="Impact">
            {alert.surgeriesAffected} surger{alert.surgeriesAffected === 1 ? 'y' : 'ies'}, {alert.patientsAffected} patient{alert.patientsAffected === 1 ? '' : 's'}
            {alert.downtime !== null ? ` · ${alert.downtime} min without supply` : ''}
          </Row>
        </div>
      </div>

      {(alert.acknowledgedBy || alert.respondedBy || alert.resolvedBy) && (
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-3 mb-6">
          <h2 className="text-lg font-semibold text-gray-900">What has happened since</h2>
          {alert.acknowledgedBy && (
            <Row label="Acknowledged">
              {alert.acknowledgedBy.fullName}{alert.acknowledgedAt ? ` · ${when(alert.acknowledgedAt)}` : ''}
            </Row>
          )}
          {alert.respondedBy && (
            <Row label="Response">
              <span className="whitespace-pre-wrap">{alert.responseAction || '—'}</span>
              <span className="block text-xs text-gray-500 mt-1">
                <Clock className="w-3 h-3 inline mr-1" />
                {alert.respondedBy.fullName}{alert.respondedAt ? ` · ${when(alert.respondedAt)}` : ''}
              </span>
            </Row>
          )}
          {alert.resolvedBy && (
            <>
              <Row label="Resolved">
                <span className="whitespace-pre-wrap">{alert.resolutionNotes || '—'}</span>
                <span className="block text-xs text-gray-500 mt-1">
                  <CheckCircle2 className="w-3 h-3 inline mr-1 text-green-600" />
                  {alert.resolvedBy.fullName}{alert.resolvedAt ? ` · ${when(alert.resolvedAt)}` : ''}
                </span>
              </Row>
              {alert.rootCause && <Row label="Root cause"><span className="whitespace-pre-wrap">{alert.rootCause}</span></Row>}
              {alert.preventativeMeasures && <Row label="To prevent it"><span className="whitespace-pre-wrap">{alert.preventativeMeasures}</span></Row>}
            </>
          )}
        </div>
      )}

      {!closed && (
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-6">
          {!alert.acknowledgedBy && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Seen it?</h2>
              <p className="text-sm text-gray-600 mb-3">
                One press, so whoever raised it knows somebody is coming.
              </p>
              <button
                onClick={() => act('acknowledge')}
                disabled={busy !== null}
                className="bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white px-6 py-2.5 rounded-lg flex items-center gap-2"
              >
                {busy === 'acknowledge' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Acknowledge
              </button>
            </div>
          )}

          <div className={alert.acknowledgedBy ? '' : 'pt-6 border-t border-gray-100'}>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">What you did</h2>
            <textarea
              rows={3}
              value={responseAction}
              onChange={(e) => setResponseAction(e.target.value)}
              placeholder="Cylinder changed, manifold switched, theatre moved…"
              className={field}
            />
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <input
                type="number"
                min={0}
                value={downtime}
                onChange={(e) => setDowntime(e.target.value)}
                placeholder="Minutes without supply"
                className={`${field} sm:max-w-xs`}
              />
              <button
                onClick={() => act('respond', {
                  responseAction: responseAction.trim(),
                  ...(downtime ? { downtime: Number(downtime) } : {}),
                })}
                disabled={busy !== null || !responseAction.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-6 py-2.5 rounded-lg flex items-center gap-2"
              >
                {busy === 'respond' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Record response
              </button>
            </div>
          </div>

          <div className="pt-6 border-t border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Close it</h2>
            <textarea
              rows={2}
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="Supply restored and verified at…"
              className={field}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <input
                type="text"
                value={rootCause}
                onChange={(e) => setRootCause(e.target.value)}
                placeholder="Root cause"
                className={field}
              />
              <input
                type="text"
                value={preventativeMeasures}
                onChange={(e) => setPreventativeMeasures(e.target.value)}
                placeholder="What would stop it happening again"
                className={field}
              />
            </div>
            <button
              onClick={() => act('resolve', {
                resolutionNotes: resolutionNotes.trim(),
                ...(rootCause.trim() ? { rootCause: rootCause.trim() } : {}),
                ...(preventativeMeasures.trim() ? { preventativeMeasures: preventativeMeasures.trim() } : {}),
              })}
              disabled={busy !== null || !resolutionNotes.trim()}
              className="mt-3 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-6 py-2.5 rounded-lg flex items-center gap-2"
            >
              {busy === 'resolve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Mark resolved
            </button>
          </div>

          {note && <p className="text-sm text-gray-600">{note}</p>}
        </div>
      )}
    </div>
  );
}
