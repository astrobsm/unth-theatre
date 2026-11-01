'use client';

// ============================================================
// One incident report
// ------------------------------------------------------------
// The "View" link on every row of the incident list pointed here, and there
// was no page here, so every incident ever filed was unreadable the moment it
// was filed.
//
// The page shows the account as it was written, then the investigation on top
// of it. Governance roles can move the status on and record what was found and
// what was changed as a result; everybody else reads it. A report that nobody
// can act on is a complaint, and a complaint that nobody can read is nothing.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Clock, Loader2, Search, ShieldCheck, User,
} from 'lucide-react';

interface Person { id?: string; fullName: string; role: string }

interface Incident {
  id: string;
  incidentDate: string;
  incidentType: string;
  severity: string;
  status: string;
  location: string;
  description: string;
  reportedBy: Person | null;
  witnessesPresent: boolean;
  witnessNames: string | null;
  injuriesReported: boolean;
  injuryDetails: string | null;
  damagesReported: boolean;
  damageDetails: string | null;
  investigationRequired: boolean;
  investigatedBy: Person | null;
  investigationNotes: string | null;
  investigationDate: string | null;
  verifiedBy: Person | null;
  verifiedAt: string | null;
  verificationNotes: string | null;
  preventionMeasures: string | null;
  actionTaken: string | null;
  responsiblePerson: string | null;
  followUpRequired: boolean;
  followUpDate: string | null;
  followUpNotes: string | null;
  createdAt: string;
}

/** Who may move an incident along. Reading it is open to any signed-in staff. */
const GOVERNANCE_ROLES = [
  'ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN',
  'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC',
  'HEAD_OF_ANAESTHESIA', 'HEAD_OF_SURGERY', 'HEAD_OF_OBSTETRICS_GYNAECOLOGY',
  'INFECTION_CONTROL_NURSE',
];

const STATUSES = [
  'REPORTED', 'UNDER_INVESTIGATION', 'VERIFIED', 'ACTION_TAKEN', 'RESOLVED', 'CLOSED',
];

const SEVERITY_TONE: Record<string, string> = {
  MINOR: 'bg-blue-100 text-blue-800',
  MODERATE: 'bg-yellow-100 text-yellow-800',
  MAJOR: 'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
};

const words = (s: string) => (s || '').replace(/_/g, ' ');

const when = (v: string | null) => (v
  ? new Date(v).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  : null);

export default function IncidentDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const { data: session } = useSession();

  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const [update, setUpdate] = useState({
    status: '',
    investigationNotes: '',
    actionTaken: '',
    preventionMeasures: '',
    responsiblePerson: '',
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/incidents/${id}`);
      if (res.status === 404) { setNotFound(true); return; }
      if (!res.ok) return;
      const data = await res.json();
      setIncident(data);
      setUpdate((u) => ({ ...u, status: data.status }));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  const canAct = GOVERNANCE_ROLES.includes(String((session?.user as { role?: string } | undefined)?.role ?? ''));

  const save = async () => {
    setSaving(true);
    setNote(null);
    try {
      const body: Record<string, unknown> = {};
      if (update.status && update.status !== incident?.status) body.status = update.status;
      if (update.investigationNotes.trim()) body.investigationNotes = update.investigationNotes.trim();
      if (update.actionTaken.trim()) body.actionTaken = update.actionTaken.trim();
      if (update.preventionMeasures.trim()) body.preventionMeasures = update.preventionMeasures.trim();
      if (update.responsiblePerson.trim()) body.responsiblePerson = update.responsiblePerson.trim();
      // Recording notes is what makes someone the investigator; the API stamps
      // the date. Without this the notes would appear with nobody's name on
      // them, which is the one thing an investigation record cannot do.
      if (body.investigationNotes && !incident?.investigatedBy) {
        body.investigatedById = (session?.user as { id?: string } | undefined)?.id;
      }

      if (Object.keys(body).length === 0) {
        setNote('Nothing to save.');
        return;
      }

      const res = await fetch(`/api/incidents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Could not save');
      setUpdate((u) => ({ ...u, investigationNotes: '', actionTaken: '', preventionMeasures: '', responsiblePerson: '' }));
      setNote('Saved.');
      await load();
    } catch {
      setNote('Could not save that.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-lg">Loading…</div>;
  }

  if (notFound || !incident) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Link href="/dashboard/incidents" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to incident reports
        </Link>
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <AlertTriangle className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-700">That incident report is no longer there.</p>
        </div>
      </div>
    );
  }

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-sm text-gray-900 mt-0.5">{children}</div>
    </div>
  );

  const field = 'w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent';

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link href="/dashboard/incidents" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to incident reports
      </Link>

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-7 h-7 text-orange-500" />
            {words(incident.incidentType)}
          </h1>
          <p className="text-gray-600 mt-1">
            {incident.location} · {when(incident.incidentDate)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${SEVERITY_TONE[incident.severity] ?? 'bg-gray-100 text-gray-800'}`}>
            {incident.severity}
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">
            {words(incident.status)}
          </span>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4 mb-6">
        <h2 className="text-lg font-semibold text-gray-900">What was reported</h2>
        <p className="text-sm text-gray-900 whitespace-pre-wrap">{incident.description}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
          <Row label="Reported by">
            <span className="inline-flex items-center gap-1">
              <User className="w-4 h-4 text-gray-400" />
              {incident.reportedBy?.fullName ?? 'Unknown'}
              {incident.reportedBy?.role ? ` · ${words(incident.reportedBy.role)}` : ''}
            </span>
          </Row>
          <Row label="Filed">{when(incident.createdAt)}</Row>
          <Row label="Witnesses">
            {incident.witnessesPresent ? (incident.witnessNames || 'Yes — not named') : 'None'}
          </Row>
          <Row label="Injuries">
            {incident.injuriesReported ? (incident.injuryDetails || 'Yes — no detail given') : 'None reported'}
          </Row>
          <Row label="Damage">
            {incident.damagesReported ? (incident.damageDetails || 'Yes — no detail given') : 'None reported'}
          </Row>
          <Row label="Investigation">
            {incident.investigationRequired ? 'Required' : 'Not required'}
          </Row>
        </div>
      </div>

      {(incident.investigationNotes || incident.actionTaken || incident.preventionMeasures
        || incident.verifiedBy || incident.followUpRequired) && (
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-4 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-500" /> What was found
          </h2>
          {incident.investigationNotes && (
            <Row label={`Investigation${incident.investigatedBy ? ` — ${incident.investigatedBy.fullName}` : ''}`}>
              <span className="whitespace-pre-wrap">{incident.investigationNotes}</span>
              {incident.investigationDate && (
                <span className="block text-xs text-gray-500 mt-1">
                  <Clock className="w-3 h-3 inline mr-1" />{when(incident.investigationDate)}
                </span>
              )}
            </Row>
          )}
          {incident.actionTaken && <Row label="Action taken"><span className="whitespace-pre-wrap">{incident.actionTaken}</span></Row>}
          {incident.preventionMeasures && <Row label="To stop it happening again"><span className="whitespace-pre-wrap">{incident.preventionMeasures}</span></Row>}
          {incident.responsiblePerson && <Row label="Responsible">{incident.responsiblePerson}</Row>}
          {incident.verifiedBy && (
            <Row label="Verified">
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-green-600" />
                {incident.verifiedBy.fullName}{incident.verifiedAt ? ` · ${when(incident.verifiedAt)}` : ''}
              </span>
              {incident.verificationNotes && (
                <span className="block text-sm mt-1 whitespace-pre-wrap">{incident.verificationNotes}</span>
              )}
            </Row>
          )}
          {incident.followUpRequired && (
            <Row label="Follow-up">
              {incident.followUpDate ? `Due ${when(incident.followUpDate)}` : 'Required'}
              {incident.followUpNotes ? ` — ${incident.followUpNotes}` : ''}
            </Row>
          )}
        </div>
      )}

      {canAct && (
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" /> Record the investigation
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="status">Status</label>
            <select
              id="status"
              value={update.status}
              onChange={(e) => setUpdate((u) => ({ ...u, status: e.target.value }))}
              className={field}
            >
              {STATUSES.map((s) => <option key={s} value={s}>{words(s)}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="investigationNotes">What you found</label>
            <textarea
              id="investigationNotes"
              rows={3}
              value={update.investigationNotes}
              onChange={(e) => setUpdate((u) => ({ ...u, investigationNotes: e.target.value }))}
              className={field}
              placeholder={incident.investigationNotes ? 'Adds to the record above' : 'What happened, and why'}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="actionTaken">Action taken</label>
              <textarea
                id="actionTaken"
                rows={2}
                value={update.actionTaken}
                onChange={(e) => setUpdate((u) => ({ ...u, actionTaken: e.target.value }))}
                className={field}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="preventionMeasures">To stop it happening again</label>
              <textarea
                id="preventionMeasures"
                rows={2}
                value={update.preventionMeasures}
                onChange={(e) => setUpdate((u) => ({ ...u, preventionMeasures: e.target.value }))}
                className={field}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="responsiblePerson">Who is seeing it through</label>
            <input
              id="responsiblePerson"
              type="text"
              value={update.responsiblePerson}
              onChange={(e) => setUpdate((u) => ({ ...u, responsiblePerson: e.target.value }))}
              className={field}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white px-6 py-2.5 rounded-lg flex items-center gap-2 transition"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving…' : 'Save'}
            </button>
            {note && <span className="text-sm text-gray-600">{note}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
