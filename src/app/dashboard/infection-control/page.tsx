'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Infection prevention and control, and SSI surveillance.
 *
 * The rate at the top is the point of the page. Everything else exists to make
 * it defensible: which cases it was computed over, how many of them were
 * actually followed to a conclusion, and what was audited in the meantime.
 */

type WoundClass = 'CLEAN' | 'CLEAN_CONTAMINATED' | 'CONTAMINATED' | 'DIRTY_INFECTED';
type SurvStatus = 'OPEN' | 'CLOSED_NO_INFECTION' | 'CLOSED_INFECTION' | 'LOST_TO_FOLLOW_UP';

interface Breakdown {
  total: number; evaluable: number; infections: number;
  stillOpen: number; lostToFollowUp: number;
  ratePercent: number | null; followUpPercent: number | null;
}

interface Assessment {
  id: string; assessedOn: string; dayPostOp: number;
  infectionPresent: boolean; ssiType: string | null; signs: string | null;
  organism: string | null; assessedByName: string; woundInspected: boolean;
}

interface Surveillance {
  id: string; surgeryId: string; patientId: string;
  woundClass: WoundClass; status: SurvStatus;
  implantPlaced: boolean; prophylaxisTiming: string;
  infectionType: string | null; organism: string | null; detectedOn: string | null;
  followUpDueOn: string | null; openedByName: string; createdAt: string;
  assessments: Assessment[];
  patient: { id: string; name: string; folderNumber: string; ward: string } | null;
}

interface AuditSummary {
  auditType: string; rounds: number; observations: number;
  compliant: number; compliancePercent: number | null;
}

const WOUND_LABEL: Record<WoundClass, string> = {
  CLEAN: 'Clean',
  CLEAN_CONTAMINATED: 'Clean-contaminated',
  CONTAMINATED: 'Contaminated',
  DIRTY_INFECTED: 'Dirty / infected',
};

const STATUS_STYLE: Record<SurvStatus, string> = {
  OPEN: 'bg-blue-100 text-blue-800',
  CLOSED_NO_INFECTION: 'bg-green-100 text-green-800',
  CLOSED_INFECTION: 'bg-red-100 text-red-800',
  LOST_TO_FOLLOW_UP: 'bg-gray-200 text-gray-700',
};

export default function InfectionControlPage() {
  const [records, setRecords] = useState<Surveillance[]>([]);
  const [rates, setRates] = useState<{ overall: Breakdown; byWoundClass: Record<WoundClass, Breakdown> } | null>(null);
  const [audits, setAudits] = useState<AuditSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [dueOnly, setDueOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [sr, ar] = await Promise.all([
        fetch(`/api/ipc/surveillance${dueOnly ? '?due=true' : ''}`, { cache: 'no-store' }),
        fetch('/api/ipc/audits', { cache: 'no-store' }),
      ]);
      if (sr.ok) {
        const d = await sr.json();
        setRecords(Array.isArray(d.records) ? d.records : []);
        setRates(d.rates ?? null);
      } else {
        setErr('Could not load surveillance.');
      }
      if (ar.ok) {
        const d = await ar.json();
        setAudits(Array.isArray(d.summary) ? d.summary : []);
      }
    } catch {
      setErr('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [dueOnly]);

  useEffect(() => { void load(); }, [load]);

  const assess = async (id: string) => {
    const infected = window.confirm('Is there an infection? OK for yes, Cancel for no.');
    let ssiType: string | null = null;
    if (infected) {
      const depth = window.prompt('Depth: 1 = superficial incisional, 2 = deep incisional, 3 = organ/space');
      ssiType = depth === '1' ? 'SUPERFICIAL_INCISIONAL'
        : depth === '2' ? 'DEEP_INCISIONAL'
          : depth === '3' ? 'ORGAN_SPACE' : null;
      if (!ssiType) { setErr('The depth is the finding — say which of the three it is.'); return; }
    }
    const signs = window.prompt(infected ? 'Signs / organism / treatment' : 'Notes (optional)') ?? '';
    setBusy(id);
    try {
      const r = await fetch(`/api/ipc/surveillance/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ infectionPresent: infected, ssiType, signs }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setErr(d.error ?? 'Could not record that assessment.');
        return;
      }
      await load();
    } finally { setBusy(null); }
  };

  const close = async (id: string, status: SurvStatus) => {
    setBusy(id);
    try {
      const r = await fetch(`/api/ipc/surveillance/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setErr(d.error ?? 'Could not close that record.');
        return;
      }
      await load();
    } finally { setBusy(null); }
  };

  const overall = rates?.overall;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Infection control &amp; quality assurance</h1>
          <p className="text-sm text-gray-600 mt-1">
            Surgical site infection surveillance, and the audits that go with it.
          </p>
        </div>
        <button type="button" onClick={() => setDueOnly((d) => !d)}
          className="px-3 py-2 text-sm rounded-md border border-gray-300 bg-white hover:bg-gray-50">
          {dueOnly ? 'Show all cases' : 'Show follow-ups due'}
        </button>
      </div>

      {err && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{err}</div>}

      {/* The rate, with the two numbers that decide whether to believe it. */}
      {overall && (
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-end gap-8">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">SSI rate</p>
              <p className="text-4xl font-bold text-gray-900 tabular-nums">
                {overall.ratePercent === null ? '—' : `${overall.ratePercent}%`}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {overall.infections} of {overall.evaluable} case{overall.evaluable === 1 ? '' : 's'} followed to a conclusion
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Follow-up achieved</p>
              <p className="text-2xl font-semibold text-gray-900 tabular-nums">
                {overall.followUpPercent === null ? '—' : `${overall.followUpPercent}%`}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {overall.stillOpen} still open · {overall.lostToFollowUp} lost to follow-up
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-500 max-w-prose">
            The rate is infections divided by the cases actually followed to a conclusion — not by
            everything opened. Patients who could not be reached are excluded rather than counted
            as uninfected, which is why the follow-up figure sits beside it: a low rate over poor
            follow-up is not a good result, it is an unknown one.
          </p>

          {rates && (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b">
                    <th className="py-2 pr-4">Wound class</th>
                    <th className="py-2 pr-4 text-right">Cases</th>
                    <th className="py-2 pr-4 text-right">Evaluable</th>
                    <th className="py-2 pr-4 text-right">Infections</th>
                    <th className="py-2 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(WOUND_LABEL) as WoundClass[]).map((k) => {
                    const b = rates.byWoundClass[k];
                    return (
                      <tr key={k} className="border-b last:border-0">
                        <td className="py-2 pr-4">{WOUND_LABEL[k]}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{b.total}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{b.evaluable}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{b.infections}</td>
                        <td className="py-2 text-right tabular-nums font-medium">
                          {b.ratePercent === null ? '—' : `${b.ratePercent}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {audits.length > 0 && (
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="font-semibold text-gray-900">IPC audit compliance</h2>
          <p className="text-xs text-gray-500 mb-3">
            Pooled over observations, not averaged across rounds — a round of three and a round of
            three hundred do not carry equal weight.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {audits.map((a) => (
              <div key={a.auditType} className="rounded-md border border-gray-200 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  {a.auditType.replace(/_/g, ' ').toLowerCase()}
                </p>
                <p className="text-2xl font-bold tabular-nums text-gray-900">
                  {a.compliancePercent === null ? '—' : `${a.compliancePercent}%`}
                </p>
                <p className="text-xs text-gray-600">
                  {a.compliant}/{a.observations} over {a.rounds} round{a.rounds === 1 ? '' : 's'}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-semibold text-gray-900 mb-2">
          Cases under surveillance {dueOnly && <span className="text-sm font-normal text-gray-500">— follow-up due</span>}
        </h2>
        {loading ? (
          <p className="text-gray-500">Loading…</p>
        ) : records.length === 0 ? (
          <p className="text-gray-500">
            {dueOnly ? 'Nothing due.' : 'No cases under surveillance yet.'}
          </p>
        ) : (
          <div className="space-y-3">
            {records.map((r) => {
              const overdue = r.status === 'OPEN' && r.followUpDueOn
                && new Date(r.followUpDueOn) < new Date();
              return (
                <article key={r.id} className={`rounded-lg border bg-white p-4 ${overdue ? 'border-amber-400' : 'border-gray-200'}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_STYLE[r.status]}`}>
                          {r.status.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                          {WOUND_LABEL[r.woundClass]}
                        </span>
                        {r.implantPlaced && (
                          <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-800">
                            implant · 90-day follow-up
                          </span>
                        )}
                        {overdue && (
                          <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-medium">
                            follow-up overdue
                          </span>
                        )}
                      </div>
                      <h3 className="mt-1 font-semibold text-gray-900">
                        {r.patient ? `${r.patient.name} · ${r.patient.folderNumber}` : 'Patient unknown'}
                      </h3>
                      <p className="text-xs text-gray-500">
                        Opened by {r.openedByName} on {new Date(r.createdAt).toLocaleDateString('en-GB')}
                        {r.followUpDueOn ? ` · due ${new Date(r.followUpDueOn).toLocaleDateString('en-GB')}` : ''}
                      </p>
                      {r.status === 'CLOSED_INFECTION' && (
                        <p className="text-sm text-red-800 mt-1">
                          {r.infectionType?.replace(/_/g, ' ').toLowerCase()}
                          {r.organism ? ` · ${r.organism}` : ''}
                          {r.detectedOn ? ` · found ${new Date(r.detectedOn).toLocaleDateString('en-GB')}` : ''}
                        </p>
                      )}
                    </div>

                    {r.status === 'OPEN' && (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={busy === r.id} onClick={() => void assess(r.id)}
                          className="px-3 py-1.5 text-sm rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
                          Record assessment
                        </button>
                        <button type="button" disabled={busy === r.id}
                          onClick={() => void close(r.id, 'CLOSED_NO_INFECTION')}
                          className="px-3 py-1.5 text-sm rounded-md border border-gray-400 bg-white hover:bg-gray-50">
                          Close — no infection
                        </button>
                        <button type="button" disabled={busy === r.id}
                          onClick={() => void close(r.id, 'LOST_TO_FOLLOW_UP')}
                          className="px-3 py-1.5 text-sm rounded-md border border-gray-400 bg-white hover:bg-gray-50">
                          Unreachable
                        </button>
                      </div>
                    )}
                  </div>

                  {r.assessments.length > 0 && (
                    <ol className="mt-3 space-y-1 border-t pt-2">
                      {r.assessments.map((a) => (
                        <li key={a.id} className="text-sm text-gray-700 flex gap-2 flex-wrap">
                          <span className="text-xs text-gray-500 tabular-nums w-16">day {a.dayPostOp}</span>
                          <span className={a.infectionPresent ? 'text-red-800 font-medium' : 'text-green-800'}>
                            {a.infectionPresent
                              ? (a.ssiType?.replace(/_/g, ' ').toLowerCase() ?? 'infection')
                              : 'no infection'}
                          </span>
                          {!a.woundInspected && <span className="text-xs text-gray-500">(not inspected)</span>}
                          {a.signs && <span className="text-gray-600">— {a.signs}</span>}
                          <span className="text-xs text-gray-400">{a.assessedByName}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
