'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  transferProcedure, escortLabel, type TransferInputs,
} from '@/lib/pacu/transferProcedure';

/**
 * Where a PACU discharge lands.
 *
 * Discharge used to end with an alert box and a bounce back to the PACU list.
 * The transfer — which porters, which ward, what goes with the patient — was a
 * separate button on the page the nurse had just been sent away from, so the
 * patient was discharged in the system with nobody assigned to move them and
 * nothing printed to travel with them.
 *
 * This is that missing page. It says what this particular patient needs, names
 * the people who will move them, starts the transport, and prints the slip.
 */

interface Assessment {
  id: string;
  surgeryId: string;
  admissionTime: string;
  dischargeTime?: string | null;
  dischargedTo?: string | null;
  dischargeNotes?: string | null;
  wardNurseHandover?: string | null;
  totalTimeInPACU?: number | null;
  aldreteTotalScore: number;
  oxygenTherapy: boolean;
  oxygenFlowRate?: number | null;
  airwayStatus?: string | null;
  consciousnessLevel?: string | null;
  drainsPresent: boolean;
  catheterInSitu: boolean;
  redAlertTriggered: boolean;
  redAlertType?: string | null;
  redAlertDescription?: string | null;
  redAlertTime?: string | null;
  redAlertResolvedAt?: string | null;
  patient: { id: string; name: string; folderNumber: string; ward: string; age: number; ageUnit?: string; gender: string };
  surgery?: { procedureName?: string | null; surgeonName?: string | null } | null;
  redAlerts?: Array<{
    id: string; alertType: string; description: string;
    triggeredAt: string; resolved: boolean; resolutionAction?: string | null;
  }>;
}

interface Porter { id: string; fullName: string; staffCode: string | null }

export default function PacuTransferPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [a, setA] = useState<Assessment | null>(null);
  const [porters, setPorters] = useState<Porter[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [started, setStarted] = useState(false);

  const [form, setForm] = useState({
    destination: '', porter1: '', porter2: '', escortNurse: '', notes: '',
  });

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/pacu/${params.id}`, { cache: 'no-store' });
      if (!r.ok) { setErr('Could not load this recovery record.'); return; }
      const d = await r.json();
      setA(d);
      setForm((f) => ({ ...f, destination: f.destination || d.dischargedTo || d.patient?.ward || '' }));
    } catch {
      setErr('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    // Porters on duty today; the full approved list if no roster is up.
    fetch(`/api/roster/on-duty?date=${encodeURIComponent(new Date().toISOString())}&theatreId=all`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const onDuty = Array.isArray(d?.candidates?.porters) ? d.candidates.porters : [];
        if (onDuty.length) {
          setPorters(onDuty.map((u: { userId: string; name: string; staffCode: string | null }) => ({
            id: u.userId, fullName: u.name, staffCode: u.staffCode,
          })));
          return null;
        }
        return fetch('/api/users?role=PORTER&status=APPROVED').then((r) => (r.ok ? r.json() : []));
      })
      .then((d) => {
        if (!d) return;
        const list = Array.isArray(d) ? d : d.users ?? [];
        setPorters(list.map((u: { id: string; fullName: string; staffCode: string | null }) => ({
          id: u.id, fullName: u.fullName, staffCode: u.staffCode,
        })));
      })
      .catch(() => {});
  }, []);

  // What this patient needs, decided from the record rather than from habit.
  const procedure = useMemo(() => {
    if (!a) return null;
    const input: TransferInputs = {
      redAlertEverTriggered: !!(a.redAlertTriggered || a.redAlertTime || (a.redAlerts?.length ?? 0) > 0),
      redAlertStillOpen: !!a.redAlertTriggered,
      aldreteTotalScore: typeof a.aldreteTotalScore === 'number' ? a.aldreteTotalScore : null,
      oxygenTherapy: !!a.oxygenTherapy,
      airwayStatus: a.airwayStatus ?? null,
      consciousnessLevel: a.consciousnessLevel ?? null,
      drainsPresent: !!a.drainsPresent,
      catheterInSitu: !!a.catheterInSitu,
      destination: form.destination || a.dischargedTo || null,
    };
    return transferProcedure(input);
  }, [a, form.destination]);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!a || !procedure) return;
    setErr(null);

    if (procedure.blocked) { setErr(procedure.blockedReason ?? 'This transfer cannot start yet.'); return; }
    if (!form.destination.trim()) { setErr('Say where the patient is going.'); return; }
    if (!form.porter1) { setErr('Name at least one porter.'); return; }
    if (procedure.requiresNamedNurse && !form.escortNurse.trim()) {
      setErr(`${escortLabel(procedure.escort)} — name the person who will travel with the patient.`);
      return;
    }

    const p1 = porters.find((p) => p.id === form.porter1);
    const p2 = form.porter2 ? porters.find((p) => p.id === form.porter2) : null;
    if (!p1?.staffCode) { setErr('That porter has no staff code on file, so the transport cannot be logged.'); return; }

    setStarting(true);
    try {
      const notes = [
        procedure.requiresNamedNurse ? `Escort: ${form.escortNurse} (${escortLabel(procedure.escort)})` : '',
        a.redAlertDescription ? `Red alert during recovery: ${a.redAlertDescription}` : '',
        form.notes,
      ].filter(Boolean).join(' • ');

      const body = {
        staffCode: p1.staffCode,
        transporter2Code: p2?.staffCode || null,
        patientFolderNumber: a.patient.folderNumber,
        fromLocation: 'PACU',
        toLocation: form.destination,
        transportType: 'Post-Op Transfer',
        surgeryId: a.surgeryId,
        notes: notes || undefined,
      };

      let res = await fetch('/api/transport/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      let data = await res.json();

      if (!res.ok && data.canForce) {
        if (!window.confirm(`${data.error}\n\nEnd that transport and start this one?`)) { return; }
        res = await fetch('/api/transport/start', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, force: true }),
        });
        data = await res.json();
      }
      if (!res.ok) { setErr(data.error || 'Could not start the transfer.'); return; }

      await fetch(`/api/pacu/${params.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dischargedTo: form.destination,
          wardNurseHandover: form.escortNurse || undefined,
        }),
      }).catch(() => {});

      setStarted(true);
      await load();
      // The slip is the point of the page; put it on screen immediately.
      setTimeout(() => window.print(), 400);
    } catch {
      setErr('Could not reach the server to start the transfer.');
    } finally {
      setStarting(false);
    }
  };

  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (!a) return <p className="text-red-700">{err ?? 'Recovery record not found.'}</p>;

  const p1 = porters.find((p) => p.id === form.porter1);
  const p2 = porters.find((p) => p.id === form.porter2);
  const hadAlert = !!(a.redAlertTriggered || a.redAlertTime || (a.redAlerts?.length ?? 0) > 0);

  return (
    <div className="space-y-6">
      {/* Everything except the slip is hidden when printing. */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #transfer-slip, #transfer-slip * { visibility: visible; }
          #transfer-slip { position: absolute; left: 0; top: 0; width: 100%; }
          @page { size: A5; margin: 10mm; }
        }
      `}</style>

      <div className="no-print">
        <Link href={`/dashboard/pacu/${params.id}`} className="text-sm text-primary-600 hover:underline">
          ← Back to the recovery record
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Transfer out of recovery</h1>
        <p className="text-sm text-gray-600">
          {a.patient.name} · {a.patient.folderNumber}
          {a.dischargeTime ? ` · discharged ${new Date(a.dischargeTime).toLocaleString('en-GB')}` : ''}
        </p>
      </div>

      {err && <div className="no-print rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{err}</div>}

      {/* The procedure for THIS patient. */}
      {procedure && (
        <section className={`no-print rounded-lg border-2 p-4 ${
          procedure.blocked ? 'border-red-500 bg-red-50'
            : procedure.escort === 'PORTERS' ? 'border-gray-300 bg-white' : 'border-amber-400 bg-amber-50'
        }`}>
          <p className="text-xs uppercase tracking-wide text-gray-600">Escort required</p>
          <h2 className="text-xl font-bold text-gray-900">{escortLabel(procedure.escort)}</h2>

          {procedure.blocked && (
            <p className="mt-2 rounded-md bg-red-100 border border-red-300 p-3 text-sm text-red-900">
              {procedure.blockedReason}
            </p>
          )}

          <ul className="mt-3 space-y-1 text-sm text-gray-800 list-disc pl-5">
            {procedure.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Before the trolley leaves</p>
              <ul className="mt-1 space-y-1 text-sm text-gray-800 list-disc pl-5">
                {procedure.before.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Goes with the patient</p>
              <ul className="mt-1 space-y-1 text-sm text-gray-800 list-disc pl-5">
                {procedure.takeWith.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>
          </div>
        </section>
      )}

      {hadAlert && (
        <section className="no-print rounded-lg border border-red-300 bg-white p-4">
          <h2 className="font-semibold text-red-900">Red alert during this recovery</h2>
          {a.redAlertDescription && (
            <p className="text-sm text-gray-900 mt-1">
              {a.redAlertType ? `${a.redAlertType.replace(/_/g, ' ')}: ` : ''}{a.redAlertDescription}
            </p>
          )}
          {a.dischargeNotes && (
            <p className="text-sm text-gray-800 mt-2 whitespace-pre-wrap">{a.dischargeNotes}</p>
          )}
          <p className="text-xs text-gray-500 mt-2">
            This travels with the patient on the slip, and is handed over out loud.
          </p>
        </section>
      )}

      <form onSubmit={start} className="no-print rounded-lg border border-gray-200 bg-white p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="dest" className="label">Destination</label>
            <input id="dest" className="input-field" value={form.destination}
              onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
              placeholder="Ward, ICU or HDU" />
          </div>
          <div>
            <label htmlFor="escort" className="label">
              Escorting nurse {procedure?.requiresNamedNurse && <span className="text-red-600">*</span>}
            </label>
            <input id="escort" className="input-field" value={form.escortNurse}
              onChange={(e) => setForm((f) => ({ ...f, escortNurse: e.target.value }))}
              placeholder={procedure?.requiresNamedNurse ? 'Name the person travelling with the patient' : 'Optional'} />
          </div>
          <div>
            <label htmlFor="p1" className="label">Porter 1</label>
            <select id="p1" className="input-field" value={form.porter1}
              onChange={(e) => setForm((f) => ({ ...f, porter1: e.target.value }))}>
              <option value="">Select porter</option>
              {porters.map((p) => (
                <option key={p.id} value={p.id}>{p.fullName}{p.staffCode ? ` (${p.staffCode})` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="p2" className="label">Porter 2 <span className="text-gray-400">(a trolley takes two)</span></label>
            <select id="p2" className="input-field" value={form.porter2}
              onChange={(e) => setForm((f) => ({ ...f, porter2: e.target.value }))}>
              <option value="">None</option>
              {porters.filter((p) => p.id !== form.porter1).map((p) => (
                <option key={p.id} value={p.id}>{p.fullName}{p.staffCode ? ` (${p.staffCode})` : ''}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="tnotes" className="label">Notes for the receiving ward</label>
          <textarea id="tnotes" rows={2} className="input-field" value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button type="submit" disabled={starting || procedure?.blocked}
            className="px-5 py-2.5 font-medium rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
            {starting ? 'Starting…' : 'Start transfer & print slip'}
          </button>
          {started && (
            <>
              <span className="text-sm text-green-700">Transfer started.</span>
              <button type="button" onClick={() => window.print()}
                className="px-4 py-2 text-sm rounded-md border border-gray-400 bg-white hover:bg-gray-50">
                Print slip again
              </button>
              <button type="button" onClick={() => router.push('/dashboard/pacu')}
                className="px-4 py-2 text-sm text-primary-700 hover:underline">
                Back to PACU
              </button>
            </>
          )}
        </div>
      </form>

      {/* ── The slip ──────────────────────────────────────────────────────
          Plain, black on white, A5. It is photocopied, folded into notes and
          handed to a ward clerk; nothing about it should depend on a colour
          printer or a webfont. */}
      <div id="transfer-slip" className="rounded-lg border border-gray-300 bg-white p-6"
        style={{ fontFamily: 'Georgia, "Times New Roman", serif', color: '#000' }}>
        <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '6px' }}>
          <div style={{ fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: '13pt' }}>
            UNIVERSITY OF NIGERIA TEACHING HOSPITAL
          </div>
          <div style={{ fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: '10pt', marginTop: '2px' }}>
            RECOVERY (PACU) — PATIENT TRANSFER SLIP
          </div>
        </div>

        <table style={{ width: '100%', fontSize: '10pt', marginTop: '8px', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ padding: '3px 0' }}><strong>Patient:</strong> {a.patient.name}</td>
              <td style={{ padding: '3px 0' }}><strong>Folder:</strong> {a.patient.folderNumber}</td>
            </tr>
            <tr>
              <td style={{ padding: '3px 0' }}><strong>Age/Sex:</strong> {a.patient.age} {a.patient.ageUnit ?? 'years'}, {a.patient.gender}</td>
              <td style={{ padding: '3px 0' }}><strong>From:</strong> PACU</td>
            </tr>
            <tr>
              <td style={{ padding: '3px 0' }}><strong>Procedure:</strong> {a.surgery?.procedureName ?? '—'}</td>
              <td style={{ padding: '3px 0' }}><strong>To:</strong> {form.destination || a.dischargedTo || '—'}</td>
            </tr>
            <tr>
              <td style={{ padding: '3px 0' }}><strong>Surgeon:</strong> {a.surgery?.surgeonName ?? '—'}</td>
              <td style={{ padding: '3px 0' }}>
                <strong>Time in recovery:</strong> {a.totalTimeInPACU ? `${a.totalTimeInPACU} min` : '—'}
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{
          marginTop: '8px', border: '1.5pt solid #000', padding: '6px',
          fontFamily: 'Arial, sans-serif', fontSize: '10pt', fontWeight: 700,
        }}>
          ESCORT: {procedure ? escortLabel(procedure.escort).toUpperCase() : '—'}
          {form.escortNurse ? ` — ${form.escortNurse}` : ''}
        </div>

        {hadAlert && (
          <div style={{ marginTop: '8px', border: '1.5pt solid #000', padding: '6px' }}>
            <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '9pt', fontWeight: 700 }}>
              RED ALERT DURING RECOVERY — HAND OVER VERBALLY
            </div>
            <div style={{ fontSize: '10pt', marginTop: '3px' }}>
              {a.redAlertType ? `${a.redAlertType.replace(/_/g, ' ')}: ` : ''}
              {a.redAlertDescription ?? 'See recovery record.'}
            </div>
            {a.dischargeNotes && (
              <div style={{ fontSize: '10pt', marginTop: '3px', whiteSpace: 'pre-wrap' }}>{a.dischargeNotes}</div>
            )}
          </div>
        )}

        {procedure && (
          <div style={{ marginTop: '8px', fontSize: '9.5pt' }}>
            <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '9pt', fontWeight: 700 }}>GOES WITH THE PATIENT</div>
            <ul style={{ margin: '3px 0 0 16px', padding: 0 }}>
              {procedure.takeWith.map((s) => <li key={s}>{s}</li>)}
            </ul>
          </div>
        )}

        <table style={{ width: '100%', fontSize: '10pt', marginTop: '8px' }}>
          <tbody>
            <tr>
              <td style={{ padding: '3px 0' }}>
                <strong>Porter 1:</strong> {p1 ? `${p1.fullName}${p1.staffCode ? ` (${p1.staffCode})` : ''}` : '________________'}
              </td>
              <td style={{ padding: '3px 0' }}>
                <strong>Porter 2:</strong> {p2 ? `${p2.fullName}${p2.staffCode ? ` (${p2.staffCode})` : ''}` : '________________'}
              </td>
            </tr>
          </tbody>
        </table>

        {form.notes && (
          <div style={{ marginTop: '6px', fontSize: '10pt' }}><strong>Notes:</strong> {form.notes}</div>
        )}

        <table style={{ width: '100%', fontSize: '9pt', marginTop: '18px' }}>
          <tbody>
            <tr>
              <td style={{ borderTop: '0.6pt solid #000', paddingTop: '3px', width: '48%' }}>
                Recovery nurse — signature &amp; time
              </td>
              <td style={{ width: '4%' }} />
              <td style={{ borderTop: '0.6pt solid #000', paddingTop: '3px', width: '48%' }}>
                Receiving ward nurse — signature &amp; time
              </td>
            </tr>
          </tbody>
        </table>

        <p style={{ fontSize: '7.5pt', marginTop: '10px', color: '#444' }}>
          Printed {new Date().toLocaleString('en-GB')} · file this slip in the patient&rsquo;s notes.
        </p>
      </div>
    </div>
  );
}
