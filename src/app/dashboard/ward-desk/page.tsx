'use client';

/**
 * The Ward Desk.
 *
 * One ward's theatre cases, for the nurse in charge of that ward. Three
 * things, in the order the ward meets them: what is booked, the theatre has
 * sent for a patient, the patient has gone.
 *
 * The empty states carry most of the weight here. A ward nurse whose posting
 * has not been set sees an explanation and a thing to do about it, not an
 * empty table — because an account that is correctly showing nothing and an
 * account that is broken look identical from the ward.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  BedDouble, RefreshCw, AlertTriangle, CheckCircle2, Clock, Send,
  Save, UserCheck, Info,
} from 'lucide-react';
import { WARD_DESK_DUTIES, canReleasePatient } from '@/lib/ward/nurseInCharge';

interface CallUp {
  id: string;
  status: string;
  theatreName: string | null;
  invitedAt: string | null;
  invitedByName: string | null;
  patientEnRouteAt: string | null;
  patientArrivedAt: string | null;
  porterArrivedAtWard: string | null;
  porterDepartedWard: string | null;
  wardNurseName: string | null;
  notes: string | null;
  recordedByName: string | null;
  recordedAt: string | null;
}

interface WardCase {
  surgeryId: string;
  patientName: string;
  folderNumber: string;
  age: number | null;
  ageUnit: string | null;
  gender: string | null;
  ward: string | null;
  procedureName: string;
  scheduledDate: string;
  scheduledTime: string;
  magnitude: string | null;
  status: string;
  surgeryType: string;
  isDayCase: boolean;
  unit: string;
  location: string | null;
  surgeonName: string | null;
  callUp: CallUp | null;
}

interface DeskResponse {
  ward: string | null;
  viewingAs: 'own' | 'chosen' | 'none';
  nurseName?: string;
  role?: string;
  reason?: string;
  cases: WardCase[];
}

interface FormState {
  arrived: string;
  departed: string;
  nurseName: string;
  notes: string;
}

const hhmm = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const timeOf = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';

/** "Today", "Tomorrow", or the date — a ward nurse reads the day, not the date. */
const dayLabel = (iso: string): string => {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

export default function WardDeskPage() {
  const [data, setData] = useState<DeskResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState<Record<string, FormState>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ward-desk');
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not load your ward');
      setData(json as DeskResponse);
      // Hydrate only rows the user is not part-way through editing.
      setForms((prev) => {
        const next = { ...prev };
        for (const c of (json.cases as WardCase[]) ?? []) {
          const cu = c.callUp;
          if (!cu || next[cu.id]) continue;
          next[cu.id] = {
            arrived: hhmm(cu.porterArrivedAtWard),
            departed: hhmm(cu.porterDepartedWard),
            nurseName: cu.wardNurseName || '',
            notes: cu.notes || '',
          };
        }
        return next;
      });
    } catch (e: any) {
      setError(e?.message || 'Could not load your ward');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const patch = async (callUpId: string, extra: Record<string, unknown>, note: string) => {
    const f = forms[callUpId] ?? { arrived: '', departed: '', nurseName: '', notes: '' };
    setSavingId(callUpId);
    setError(null);
    try {
      const res = await fetch(`/api/ward-desk/${callUpId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          porterArrivedAtWard: f.arrived || null,
          porterDepartedWard: f.departed || null,
          wardNurseName: f.nurseName.trim() || undefined,
          notes: f.notes.trim() || null,
          ...extra,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not save');
      setSuccess(note);
      setTimeout(() => setSuccess(null), 3500);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not save');
      setTimeout(() => setError(null), 6000);
    } finally {
      setSavingId(null);
    }
  };

  const setForm = (id: string, p: Partial<FormState>) =>
    setForms((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { arrived: '', departed: '', nurseName: '', notes: '' }), ...p } }));

  // ---------------------------------------------------------------- no ward
  if (!loading && data && data.viewingAs === 'none') {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <BedDouble className="w-8 h-8 text-teal-600" /> Ward Desk
        </h1>
        <div className="mt-6 rounded-xl border-2 border-amber-300 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="font-semibold text-amber-900">No ward is set on your account</h2>
              <p className="text-sm text-amber-900/90 mt-2">{data.reason}</p>
              <p className="text-sm text-amber-900/80 mt-3">
                This page is empty on purpose. It would be easy to show you every
                ward in the hospital instead, and that is exactly what must not
                happen: you would be recording handovers for patients who are not
                yours.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const cases = data?.cases ?? [];
  // A health assistant records the times; the nurse-in-charge releases the
  // patient. The button is hidden rather than shown-and-refused, and the
  // reason is printed where the button would have been.
  const release = canReleasePatient(data?.role);
  const awaitingWard = cases.filter((c) => c.callUp && c.callUp.status === 'INVITED');

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <BedDouble className="w-8 h-8 text-teal-600" /> Ward Desk
          </h1>
          <p className="text-gray-600 mt-1">
            {data?.ward ? (
              <>
                Theatre cases for <b>{data.ward}</b>
                {data.viewingAs === 'chosen' && (
                  <span className="text-amber-700"> (your account has no ward of its own)</span>
                )}
              </>
            ) : (
              'Loading your ward…'
            )}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {awaitingWard.length > 0 && (
        <div className="mb-4 rounded-xl border-2 border-blue-300 bg-blue-50 p-4">
          <div className="flex items-center gap-2 font-semibold text-blue-900">
            <Send className="w-4 h-4" />
            Theatre has sent for {awaitingWard.length}{' '}
            {awaitingWard.length === 1 ? 'patient' : 'patients'}
          </div>
          <p className="text-sm text-blue-900/80 mt-1">
            {awaitingWard.map((c) => c.patientName).join(', ')}
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-red-700 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700 text-sm">
          <CheckCircle2 className="w-4 h-4" /> {success}
        </div>
      )}

      {loading && cases.length === 0 ? (
        <div className="text-center py-12 text-gray-500">Loading…</div>
      ) : cases.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <BedDouble className="w-12 h-12 text-gray-300 mx-auto" />
          <p className="mt-3 text-gray-700 font-medium">
            No theatre cases booked for {data?.ward} in this window.
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Yesterday through the next four days. A case booked for later appears
            here as its date comes round.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {cases.map((c) => {
            const cu = c.callUp;
            const f = forms[cu?.id ?? ''] ?? { arrived: '', departed: '', nurseName: '', notes: '' };
            const gone = !!cu && ['PATIENT_EN_ROUTE', 'PATIENT_ARRIVED'].includes(cu.status);
            return (
              <div
                key={c.surgeryId}
                className={`bg-white rounded-xl shadow-sm border p-5 ${
                  cu?.status === 'INVITED' ? 'border-blue-300 ring-1 ring-blue-100'
                    : gone ? 'border-green-300' : 'border-gray-200'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-gray-900">
                      {c.patientName}{' '}
                      <span className="text-sm font-normal text-gray-500">({c.folderNumber})</span>
                      {c.isDayCase && (
                        <span className="ml-2 inline-flex items-center rounded-md border border-amber-500 bg-amber-100 px-1.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-amber-900">
                          Day case
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-700 mt-0.5">{c.procedureName}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      <b>{dayLabel(c.scheduledDate)}</b> {c.scheduledTime} · {c.unit}
                      {c.surgeonName && <> · {c.surgeonName}</>}
                      {c.magnitude && <> · {c.magnitude.toLowerCase()}</>}
                      {c.surgeryType !== 'ELECTIVE' && (
                        <span className="ml-1 font-semibold text-red-700">{c.surgeryType}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    {!cu ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                        <Clock className="w-3 h-3" /> Not sent for yet
                      </span>
                    ) : cu.status === 'INVITED' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 text-blue-800 font-semibold">
                        <Send className="w-3 h-3" /> Sent for at {timeOf(cu.invitedAt)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-800 font-semibold">
                        <CheckCircle2 className="w-3 h-3" />
                        {cu.status === 'PATIENT_ARRIVED' ? 'In the theatre complex' : 'Left the ward'}
                        {cu.patientEnRouteAt && <> · {timeOf(cu.patientEnRouteAt)}</>}
                      </span>
                    )}
                    {cu?.theatreName && (
                      <div className="text-gray-500 mt-1">Theatre {cu.theatreName}</div>
                    )}
                  </div>
                </div>

                {/* The ward has nothing to record until the theatre sends for the patient. */}
                {!cu ? (
                  <p className="mt-4 text-sm text-gray-500 border-t border-gray-100 pt-3">
                    Nothing for you to record yet. When the theatre sends for this
                    patient, the handover times and the &ldquo;patient has gone&rdquo; button
                    appear here.
                  </p>
                ) : (
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <div className="grid gap-3 md:grid-cols-4">
                      <label className="text-sm">
                        <span className="block text-gray-700 font-medium mb-1">Porter reached the ward</span>
                        <input
                          type="time"
                          value={f.arrived}
                          onChange={(e) => setForm(cu.id, { arrived: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                        />
                      </label>
                      <label className="text-sm">
                        <span className="block text-gray-700 font-medium mb-1">Patient left the ward</span>
                        <input
                          type="time"
                          value={f.departed}
                          onChange={(e) => setForm(cu.id, { departed: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                        />
                      </label>
                      <label className="text-sm">
                        <span className="block text-gray-700 font-medium mb-1">Nurse who handed over</span>
                        <input
                          value={f.nurseName}
                          onChange={(e) => setForm(cu.id, { nurseName: e.target.value })}
                          placeholder={data?.nurseName || 'Your name'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                        />
                      </label>
                      <label className="text-sm">
                        <span className="block text-gray-700 font-medium mb-1">Notes (delay, escort…)</span>
                        <input
                          value={f.notes}
                          onChange={(e) => setForm(cu.id, { notes: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                        />
                      </label>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => patch(cu.id, {}, 'Handover times saved.')}
                        disabled={savingId === cu.id}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-800 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm"
                      >
                        <Save className="w-4 h-4" /> Save times
                      </button>
                      {cu.status === 'INVITED' && release.ok && (
                        <button
                          onClick={() => patch(cu.id, { markSent: true }, 'Recorded — the patient has left the ward.')}
                          disabled={savingId === cu.id}
                          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 text-sm font-semibold"
                        >
                          <UserCheck className="w-4 h-4" /> Patient has gone to theatre
                        </button>
                      )}
                      {cu.status === 'INVITED' && !release.ok && (
                        <span className="text-xs text-gray-600 max-w-md">{release.reason}</span>
                      )}
                      {cu.recordedAt && (
                        <span className="text-xs text-gray-500">
                          Last recorded by {cu.recordedByName} at {timeOf(cu.recordedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* What the role is for. A role handed out with no statement of its duties
          becomes whatever the first holder assumes it is. */}
      <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-5">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Info className="w-4 h-4 text-gray-500" /> What this desk is for
        </h2>
        <ul className="mt-3 space-y-3">
          {WARD_DESK_DUTIES.map((d) => (
            <li key={d.id} className="text-sm">
              <span className="font-medium text-gray-900">{d.label}</span>
              <span className="block text-gray-600">{d.detail}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
