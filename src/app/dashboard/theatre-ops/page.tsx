'use client';

// ============================================================
// Theatre Operations — the live board, and what to do about it
// ------------------------------------------------------------
// Two audiences, deliberately on one screen.
//
// A scrub nurse or surgeon looking at a case that has not started needs one
// thing: somewhere to say why, in a few taps, before the forty-five-minute
// threshold. Recording a delay is the GOOD outcome, so it is the primary
// action on every late case rather than something buried in a menu.
//
// A department — CSSD, pharmacy, biomedical — needs the opposite view: what
// has been escalated to them, how long it has sat, and a way to close it.
//
// The colours and thresholds come from lib/theatreOps/delays, the same module
// the server-side detector uses. A board that decided for itself what "late"
// meant would eventually disagree with the record being written.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Inbox,
  RefreshCw,
  Send,
} from 'lucide-react';
import {
  assessDelay,
  CATEGORY_GROUPS,
  categoriesInGroup,
  STAGE_TWO_MINUTES,
} from '@/lib/theatreOps/delays';

interface Case {
  id: string;
  procedureName: string | null;
  scheduledDate: string;
  scheduledTime: string | null;
  surgeryType: string;
  status: string;
  theatreId: string | null;
  patientName?: string | null;
  startedAt: string | null;
  hasDelayRecord: boolean;
}

interface Escalation {
  id: string;
  notifiedRole: string;
  status: string;
  minutesOpen: number;
  categoryLabel: string;
  acknowledgedByName: string | null;
  delayRecord: {
    narrative: string;
    recordedAt: string;
    reportedByName: string | null;
    theatreName: string | null;
    surgery: { procedureName: string | null; scheduledTime: string | null } | null;
  };
}

const STAGE_STYLE: Record<string, string> = {
  NONE: 'border-gray-200 bg-white',
  APPROACHING: 'border-amber-200 bg-amber-50',
  WARNING: 'border-orange-300 bg-orange-50',
  UNEXPLAINED: 'border-red-300 bg-red-50',
};

export default function TheatreOpsPage() {
  const [tab, setTab] = useState<'board' | 'escalations'>('board');
  const [cases, setCases] = useState<Case[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [escTotals, setEscTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Recording form
  const [recordFor, setRecordFor] = useState<Case | null>(null);
  const [group, setGroup] = useState(CATEGORY_GROUPS[0]);
  const [categoryCode, setCategoryCode] = useState('');
  const [narrative, setNarrative] = useState('');

  // Ticks so the "minutes late" ages in front of you rather than freezing.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [caseRes, escRes] = await Promise.all([
        fetch(`/api/theatre-ops/board?date=${new Date().toISOString().slice(0, 10)}`),
        fetch('/api/theatre-ops/escalations'),
      ]);

      if (caseRes.status === 401 || caseRes.status === 403) {
        const b = await caseRes.json().catch(() => ({}));
        setDenied(true);
        setError(b.error || 'Theatre operations is not available to your role.');
        return;
      }
      setDenied(false);
      if (caseRes.ok) setCases((await caseRes.json()).cases ?? []);
      if (escRes.ok) {
        const d = await escRes.json();
        setEscalations(d.escalations ?? []);
        setEscTotals(d.totals ?? {});
      }
    } catch {
      setError('Could not load the board. If you are offline it will appear once cached.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Theatre moves in minutes, so the board refreshes on its own.
  useEffect(() => { const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);

  /** Each case with its delay stage, decided by the shared rules. */
  const assessed = useMemo(
    () =>
      cases.map((c) => {
        const scheduled =
          c.scheduledTime && /^\d{1,2}:\d{2}$/.test(c.scheduledTime)
            ? (() => {
                const [h, m] = c.scheduledTime!.split(':').map(Number);
                const d = new Date(c.scheduledDate);
                d.setHours(h, m, 0, 0);
                return d;
              })()
            : null;
        return {
          ...c,
          assessment: assessDelay({
            scheduledStart: scheduled,
            startedAt: c.startedAt,
            documented: c.hasDelayRecord,
            now,
          }),
        };
      }),
    [cases, now]
  );

  const late = assessed.filter((c) => c.assessment.stage !== 'NONE');

  const submitDelay = async () => {
    if (!recordFor || !categoryCode) { setNotice('Choose what is holding the case up.'); return; }
    if (narrative.trim().length < 10) { setNotice('Describe it, so the department can act on it.'); return; }

    setBusy(true);
    setNotice(null);

    // Position is taken once, here, and the server validates it against the
    // hospital boundary and discards it — only inside/outside is stored.
    const fix = await new Promise<GeolocationPosition | null>((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 8000, maximumAge: 60_000 });
    });

    try {
      const res = await fetch('/api/theatre-ops/delays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surgeryId: recordFor.id,
          categoryCode,
          narrative: narrative.trim(),
          minutesLateAtRecord: recordFor.scheduledTime
            ? assessed.find((c) => c.id === recordFor.id)?.assessment.minutesLate ?? null
            : null,
          ...(fix ? { latitude: fix.coords.latitude, longitude: fix.coords.longitude } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setNotice(data.error || 'That could not be recorded.'); return; }
      setNotice(data.message ?? 'Recorded.');
      setRecordFor(null);
      setCategoryCode('');
      setNarrative('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const actOnEscalation = async (e: Escalation, action: 'ACKNOWLEDGE' | 'RESOLVE') => {
    let note: string | undefined;
    if (action === 'RESOLVE') {
      note = window.prompt(`What was done to resolve this?\n\n${e.categoryLabel}: ${e.delayRecord.narrative}`) ?? '';
      if (note.trim().length < 5) { setNotice('Say what was done — that is what makes the record worth keeping.'); return; }
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/theatre-ops/escalations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: e.id, action, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setNotice(data.error || 'That could not be done.'); return; }
      setNotice(action === 'ACKNOWLEDGE' ? 'Acknowledged.' : 'Closed.');
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (denied) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <div><p className="font-semibold text-amber-900">Not available to your role</p><p className="text-sm text-amber-800">{error}</p></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-100">
            <ClipboardList className="h-6 w-6 text-primary-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Theatre Operations</h1>
            <p className="text-sm text-gray-500">
              Cases that have not started, and what is being done about them.
            </p>
          </div>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab('board')}
          className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${tab === 'board' ? 'border-primary-300 bg-primary-50 text-primary-800' : 'border-gray-300 bg-white text-gray-700'}`}>
          Live board {late.length > 0 && <span className="ml-1 rounded-full bg-orange-100 px-1.5 text-[11px] text-orange-800">{late.length}</span>}
        </button>
        <button onClick={() => setTab('escalations')}
          className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${tab === 'escalations' ? 'border-primary-300 bg-primary-50 text-primary-800' : 'border-gray-300 bg-white text-gray-700'}`}>
          Escalations {(escTotals.open ?? 0) > 0 && <span className="ml-1 rounded-full bg-red-100 px-1.5 text-[11px] text-red-800">{escTotals.open}</span>}
        </button>
      </div>

      {notice && <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">{notice}</div>}
      {error && !denied && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>}

      {tab === 'board' ? (
        <div className="space-y-3">
          {assessed.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">
              {loading ? 'Loading today’s list…' : 'No cases scheduled for today.'}
            </div>
          ) : (
            assessed.map((c) => (
              <div key={c.id} className={`rounded-xl border p-4 ${STAGE_STYLE[c.assessment.stage] ?? STAGE_STYLE.NONE}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">{c.procedureName ?? 'Procedure not named'}</p>
                    <p className="text-xs text-gray-600">
                      {c.scheduledTime ? `Due ${c.scheduledTime}` : 'No committed start time'}
                      {c.surgeryType !== 'ELECTIVE' && <span className="ml-1 rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700">{c.surgeryType}</span>}
                      {c.startedAt && <span className="ml-1 text-green-700">· started</span>}
                    </p>
                  </div>
                  {c.assessment.stage !== 'NONE' && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-gray-800">
                      <Clock className="h-3.5 w-3.5" /> {c.assessment.minutesLate} min late
                    </span>
                  )}
                </div>

                {c.assessment.message && (
                  <p className={`mt-1.5 text-xs ${c.assessment.stage === 'UNEXPLAINED' ? 'font-medium text-red-800' : 'text-gray-700'}`}>
                    {c.assessment.message}
                  </p>
                )}

                {/* Recording a reason is the primary action on a late case —
                    it is the good outcome, so it is not buried. */}
                {!c.startedAt && c.assessment.stage !== 'NONE' && (
                  <div className="mt-2">
                    {c.hasDelayRecord ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-800">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Reason recorded — no query will be raised
                      </span>
                    ) : (
                      <button
                        onClick={() => { setRecordFor(c); setNotice(null); }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-700"
                      >
                        <Send className="h-4 w-4" /> Say what is holding it up
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {(escTotals.unacknowledgedOver30 ?? 0) > 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              {escTotals.unacknowledgedOver30} escalation{escTotals.unacknowledgedOver30 === 1 ? ' has' : 's have'} been
              open for over half an hour with nobody acknowledging.
            </p>
          )}

          {escalations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
              <Inbox className="mx-auto h-8 w-8 text-gray-300" />
              <p className="mt-2 text-sm text-gray-600">{loading ? 'Loading…' : 'Nothing has been escalated to you.'}</p>
            </div>
          ) : (
            escalations.map((e) => (
              <div key={e.id} className={`rounded-xl border p-4 ${e.status === 'OPEN' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">{e.categoryLabel}</p>
                    <p className="text-xs text-gray-600">
                      {e.delayRecord.surgery?.procedureName ?? 'Case'}
                      {e.delayRecord.surgery?.scheduledTime ? ` · due ${e.delayRecord.surgery.scheduledTime}` : ''}
                      {e.delayRecord.theatreName ? ` · ${e.delayRecord.theatreName}` : ''}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold ${e.minutesOpen > 30 && e.status === 'OPEN' ? 'text-red-700' : 'text-gray-700'}`}>
                    open {e.minutesOpen} min
                  </span>
                </div>

                <p className="mt-1.5 rounded bg-white/70 px-2 py-1.5 text-sm text-gray-800">{e.delayRecord.narrative}</p>
                <p className="mt-1 text-[11px] text-gray-500">
                  Raised with {e.notifiedRole.replace(/_/g, ' ').toLowerCase()} by {e.delayRecord.reportedByName ?? 'theatre'}
                  {e.acknowledgedByName ? ` · acknowledged by ${e.acknowledgedByName}` : ''}
                </p>

                <div className="mt-2 flex flex-wrap gap-2">
                  {e.status === 'OPEN' && (
                    <button onClick={() => actOnEscalation(e, 'ACKNOWLEDGE')} disabled={busy}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                      We have seen it
                    </button>
                  )}
                  <button onClick={() => actOnEscalation(e, 'RESOLVE')} disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
                    <CheckCircle2 className="h-4 w-4" /> Resolved
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Recording a delay */}
      {recordFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl">
            <h2 className="font-semibold text-gray-900">What is holding this case up?</h2>
            <p className="mt-0.5 text-xs text-gray-600">
              {recordFor.procedureName ?? 'Case'}{recordFor.scheduledTime ? ` · due ${recordFor.scheduledTime}` : ''}
            </p>
            <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900">
              Recording this notifies the department that can fix it, and means no query is raised at{' '}
              {STAGE_TWO_MINUTES} minutes. Saying what is wrong is what the system asks of you — nothing more.
            </p>

            <label className="mt-3 block text-xs font-medium text-gray-600">Kind of problem</label>
            <select value={group} onChange={(e) => { setGroup(e.target.value); setCategoryCode(''); }}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              {CATEGORY_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>

            <label className="mt-3 block text-xs font-medium text-gray-600">What exactly</label>
            <select value={categoryCode} onChange={(e) => setCategoryCode(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">Choose…</option>
              {categoriesInGroup(group).map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>

            <label className="mt-3 block text-xs font-medium text-gray-600">Detail</label>
            <textarea value={narrative} onChange={(e) => setNarrative(e.target.value)} rows={3}
              placeholder="e.g. Pack 4 was sent for re-sterilisation at 08:40, CSSD say it will be ready by 10:15."
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <p className="mt-0.5 text-[11px] text-gray-500">
              A category alone tells the department nothing they can act on.
            </p>

            <div className="mt-4 flex gap-2">
              <button onClick={() => setRecordFor(null)} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700">
                Cancel
              </button>
              <button onClick={submitDelay} disabled={busy}
                className="flex-1 rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
                {busy ? 'Recording…' : 'Record and notify'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
