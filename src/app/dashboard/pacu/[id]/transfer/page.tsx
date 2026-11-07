'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import {
  transferProcedure, escortLabel, type TransferInputs,
} from '@/lib/pacu/transferProcedure';
import {
  PAPERS, paperSpec, slipPrintCss, formatRecoveryMinutes, recoveryTimeLooksWrong,
  type SlipPaper,
} from '@/lib/pacu/slipFormat';

// Rules, not boxes. A thermal head prints a solid line cleanly and a boxed
// panel badly, and a rule costs no paper -- which on a roll is the same as
// costing no money.
const RULE_HEAVY: CSSProperties = { borderTop: '3px solid #000', margin: '2mm 0' };
const RULE_DASH: CSSProperties = { borderTop: '1px dashed #000', margin: '2mm 0' };

/** One fact on one line, label first. */
function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ padding: '0.4mm 0' }}>
      <strong>{label}:</strong> {value}
    </div>
  );
}

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
  // The roll is the default: the ward copy is what this page is for.
  const [paper, setPaper] = useState<SlipPaper>('THERMAL_80');
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
  const spec = paperSpec(paper);

  return (
    <div className="space-y-6">
      {/* Everything except the slip is hidden when printing. */}
      {/* The print rules for whichever paper is selected. Built in
          lib/pacu/slipFormat so the 80mm page size and the printable width
          can be tested rather than eyeballed on a roll. */}
      <style>{slipPrintCss(paper)}</style>

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

        {/* Which paper. The roll is the default and is what the ward copy is
            printed on; the sheet is here because thermal paper fades in
            months and this slip is filed in the patient's notes. */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-700">Print on:</span>
          {(Object.values(PAPERS)).map((opt) => (
            <button key={opt.key} type="button" onClick={() => setPaper(opt.key)}
              className={`px-3 py-1.5 text-sm rounded-md border ${
                paper === opt.key
                  ? 'border-primary-600 bg-primary-50 font-semibold text-primary-800'
                  : 'border-gray-300 bg-white text-gray-700'
              }`}>
              {opt.label}
            </button>
          ))}
          {paper === 'A5' && (
            <span className="text-xs text-gray-600">
              Use this for the copy that is filed — thermal paper fades.
            </span>
          )}
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
          One column, black on white, laid out for an 80mm thermal roll. The
          A5 sheet prints the same column on a bigger page: one layout rather
          than two that drift apart. Nothing here depends on colour, on grey,
          or on a webfont, because the printer has none of them. */}
      <div id="transfer-slip" className="bg-white"
        style={{
          fontFamily: 'Arial, Helvetica, sans-serif',
          color: '#000',
          width: spec.width,
          maxWidth: '100%',
          margin: '0 auto',
          padding: spec.padding,
          fontSize: spec.fontSize,
          lineHeight: 1.3,
          border: '1px solid #ccc',
        }}>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: '11pt', lineHeight: 1.15 }}>
            UNIVERSITY OF NIGERIA<br />TEACHING HOSPITAL
          </div>
          <div style={{ fontWeight: 700, marginTop: '1.5mm' }}>
            RECOVERY (PACU)<br />PATIENT TRANSFER SLIP
          </div>
        </div>

        <div style={RULE_HEAVY} />

        {/* The name large and alone: it is the first thing anybody checks,
            and on a narrow roll a name sharing a line with a folder number
            is a name that wraps into it. */}
        <div style={{ fontWeight: 700, fontSize: '12pt', lineHeight: 1.2 }}>
          {a.patient.name}
        </div>
        <Field label="Folder" value={a.patient.folderNumber} />
        <Field label="Age/Sex" value={`${a.patient.age} ${a.patient.ageUnit ?? 'years'}, ${a.patient.gender}`} />

        <div style={RULE_DASH} />

        <Field label="Procedure" value={a.surgery?.procedureName ?? '—'} />
        <Field label="Surgeon" value={a.surgery?.surgeonName ?? '—'} />
        <Field label="From" value="PACU" />
        <Field label="To" value={form.destination || a.dischargedTo || '—'} />
        <Field
          label="Time in recovery"
          value={
            <>
              {formatRecoveryMinutes(a.totalTimeInPACU)}
              {recoveryTimeLooksWrong(a.totalTimeInPACU) && (
                <span style={{ fontWeight: 700 }}> (check record)</span>
              )}
            </>
          }
        />

        <div style={RULE_HEAVY} />

        {/* The escort, in capitals, because it is the one instruction on this
            slip that somebody has to act on before the trolley moves. */}
        <div style={{ fontWeight: 700, fontSize: '10pt', lineHeight: 1.25 }}>
          ESCORT: {procedure ? escortLabel(procedure.escort).toUpperCase() : '—'}
        </div>
        {form.escortNurse && (
          <div style={{ fontWeight: 700 }}>{form.escortNurse}</div>
        )}

        {hadAlert && (
          <>
            <div style={RULE_HEAVY} />
            {/* No red ink on a thermal head. A heavy rule above and below,
                and capitals, are what carry the weight instead. */}
            <div style={{ fontWeight: 700, fontSize: '10pt', lineHeight: 1.25 }}>
              ** RED ALERT DURING RECOVERY **<br />HAND OVER VERBALLY
            </div>
            <div style={{ marginTop: '1mm' }}>
              {a.redAlertType ? `${a.redAlertType.replace(/_/g, ' ')}: ` : ''}
              {a.redAlertDescription ?? 'See recovery record.'}
            </div>
            {a.dischargeNotes && (
              <div style={{ marginTop: '1mm', whiteSpace: 'pre-wrap' }}>{a.dischargeNotes}</div>
            )}
            <div style={RULE_HEAVY} />
          </>
        )}

        {procedure && (
          <>
            {!hadAlert && <div style={RULE_DASH} />}
            <div style={{ fontWeight: 700 }}>GOES WITH THE PATIENT</div>
            <ul style={{ margin: '1mm 0 0 0', padding: '0 0 0 4mm' }}>
              {procedure.takeWith.map((s) => (
                <li key={s} style={{ marginBottom: '0.5mm' }}>{s}</li>
              ))}
            </ul>
          </>
        )}

        <div style={RULE_DASH} />

        <Field
          label="Porter 1"
          value={p1 ? `${p1.fullName}${p1.staffCode ? ` (${p1.staffCode})` : ''}` : '______________'}
        />
        <Field
          label="Porter 2"
          value={p2 ? `${p2.fullName}${p2.staffCode ? ` (${p2.staffCode})` : ''}` : '______________'}
        />
        {form.notes && <Field label="Notes" value={form.notes} />}

        <div style={RULE_DASH} />

        {/* Signature lines stacked, each with room to write. Side by side at
            72mm leaves two boxes too narrow to sign in. */}
        <div style={{ marginTop: '2mm' }}>
          <div>Recovery nurse</div>
          <div style={{ borderBottom: '1px solid #000', height: '7mm' }} />
          <div style={{ fontSize: '8pt' }}>signature &amp; time</div>
        </div>
        <div style={{ marginTop: '3mm' }}>
          <div>Receiving ward nurse</div>
          <div style={{ borderBottom: '1px solid #000', height: '7mm' }} />
          <div style={{ fontSize: '8pt' }}>signature &amp; time</div>
        </div>

        <div style={RULE_DASH} />

        <div style={{ fontSize: '8pt', textAlign: 'center' }}>
          Printed {new Date().toLocaleString('en-GB')}
          <br />File this slip in the patient&rsquo;s notes.
        </div>

        {/* The cutter sits past the print head: without this the last line is
            what gets torn off. */}
        <div style={{ height: '12mm' }} />
      </div>
    </div>
  );
}
