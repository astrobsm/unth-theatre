'use client';

/**
 * Applying to the Theatre Research Board, and the board deciding.
 *
 * ONE SCREEN, TWO AUDIENCES. A clinician sees their own applications and the
 * form to make another. A board member sees the same, plus everything waiting
 * for a decision, oldest first — because the one closest to the twenty-four
 * hours is the one that needs deciding, not the one that arrived last.
 *
 * THE FORM ASKS FOR SENTENCES, NOT TICKS. A board cannot weigh "audit" as a
 * rationale, and an application that cannot be weighed gets approved on the
 * nod, which is the failure this whole process exists to prevent. The server
 * refuses a scope under ten characters for the same reason.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Check, Clock, FileSignature, Loader2, ShieldCheck, X,
} from 'lucide-react';

interface Req {
  id: string; title: string; rationale: string; purpose: string;
  scopeRequested: string; scopeGranted: string | null;
  periodFrom: string | null; periodTo: string | null; ethicsReference: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | 'REVOKED';
  submittedAt: string; dueBy: string; decidedAt: string | null;
  decidedByName: string | null; decisionNote: string | null; expiresAt: string | null;
  applicant: { id: string; fullName: string; role: string | null };
}

const TONE: Record<Req['status'], string> = {
  PENDING: 'bg-amber-50 text-amber-800 border-amber-200',
  APPROVED: 'bg-green-50 text-green-800 border-green-200',
  REJECTED: 'bg-red-50 text-red-700 border-red-200',
  WITHDRAWN: 'bg-gray-50 text-gray-600 border-gray-200',
  REVOKED: 'bg-red-50 text-red-700 border-red-200',
};

const when = (iso: string | null) =>
  (iso ? iso.slice(0, 16).replace('T', ' ') : '—');

export default function ResearchAccess({ onChanged }: { onChanged?: () => void }) {
  const [data, setData] = useState<{
    onBoard: boolean; purposes: string[]; decisionHours: number;
    defaultGrantDays: number; mine: Req[]; forReview: Req[];
    boardRoles: string[];
  } | null>(null);
  const [form, setForm] = useState({
    title: '', purpose: '', rationale: '', scopeRequested: '',
    periodFrom: '', periodTo: '', ethicsReference: '',
  });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/research/access-request', { cache: 'no-store' });
      const d = await res.json();
      if (d.error) { setError(d.error); return; }
      setData(d);
      if (!form.purpose && d.purposes?.length) {
        setForm((f) => ({ ...f, purpose: d.purposes[0] }));
      }
    } catch {
      setError('Could not load the research access applications.');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);

  const apply = async () => {
    setBusy('apply'); setError('');
    try {
      const res = await fetch('/api/research/access-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'Could not submit it.'); return; }
      if (d.alreadyPending) { setError(d.message); return; }
      setForm((f) => ({ ...f, title: '', rationale: '', scopeRequested: '', ethicsReference: '' }));
      await load();
      onChanged?.();
    } catch {
      setError('Could not submit it.');
    } finally { setBusy(''); }
  };

  const decide = async (id: string, action: string, extra: Record<string, unknown> = {}) => {
    setBusy(`${id}-${action}`); setError('');
    try {
      const res = await fetch('/api/research/access-request', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, decisionNote: note || undefined, ...extra }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'Could not record it.'); return; }
      setNote('');
      await load();
      onChanged?.();
    } catch {
      setError('Could not record it.');
    } finally { setBusy(''); }
  };

  const pendingMine = data?.mine.find((r) => r.status === 'PENDING') ?? null;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="rounded-full bg-indigo-50 p-2.5 text-indigo-700">
          <FileSignature className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Research access</h2>
          <p className="mt-0.5 max-w-3xl text-sm text-gray-600">
            You can always study the cases your own name is on. To study cases you were not
            involved in, apply to the Theatre Research Board — they undertake to answer within{' '}
            {data?.decisionHours ?? 24} hours.
          </p>
        </div>
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* ---- The application form ---- */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900">Apply for wider access</h3>
        {pendingMine ? (
          <p className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Your application <strong>{pendingMine.title}</strong> is with the board. A decision
              is due by {when(pendingMine.dueBy)}. Withdraw it below if you want to replace it.
            </span>
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-gray-600">
                Title of the study
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Outcomes of emergency laparotomy, 2025–2026"
                  className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-semibold text-gray-600">
                Purpose
                <select value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm">
                  {(data?.purposes ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            </div>
            <label className="block text-xs font-semibold text-gray-600">
              Which cases do you need?
              <textarea value={form.scopeRequested} rows={2}
                onChange={(e) => setForm({ ...form, scopeRequested: e.target.value })}
                placeholder="All emergency laparotomies in General Surgery between January 2025 and December 2026."
                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
              <span className="mt-0.5 block font-normal text-[11px] text-gray-500">
                The board grants the scope you describe, so describe it narrowly. A vague scope
                is refused rather than widened.
              </span>
            </label>
            <label className="block text-xs font-semibold text-gray-600">
              Why do you need cases that are not your own?
              <textarea value={form.rationale} rows={3}
                onChange={(e) => setForm({ ...form, rationale: e.target.value })}
                placeholder="The unit performs about forty of these a year and I have been involved in eleven. A mortality analysis on eleven cases cannot support a conclusion."
                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-semibold text-gray-600">
                Cases from
                <input type="date" value={form.periodFrom}
                  onChange={(e) => setForm({ ...form, periodFrom: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-semibold text-gray-600">
                Cases to
                <input type="date" value={form.periodTo}
                  onChange={(e) => setForm({ ...form, periodTo: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-semibold text-gray-600">
                Ethics reference (if any)
                <input value={form.ethicsReference}
                  onChange={(e) => setForm({ ...form, ethicsReference: e.target.value })}
                  placeholder="UNTH/CSA/329/…"
                  className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
              </label>
            </div>
            <button type="button" disabled={busy === 'apply'} onClick={() => void apply()}
              className="flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50">
              {busy === 'apply' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
              Submit to the board
            </button>
          </div>
        )}
      </div>

      {/* ---- Your own applications ---- */}
      {(data?.mine.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900">Your applications</h3>
          <ul className="mt-2 space-y-2">
            {data!.mine.map((r) => (
              <li key={r.id} className={`rounded-xl border p-3 ${TONE[r.status]}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{r.title}</p>
                    <p className="text-xs opacity-80">
                      {r.purpose} · submitted {when(r.submittedAt)}
                      {r.status === 'PENDING' && ` · due ${when(r.dueBy)}`}
                      {r.decidedAt && ` · decided ${when(r.decidedAt)} by ${r.decidedByName ?? 'the board'}`}
                      {r.expiresAt && ` · in force until ${r.expiresAt.slice(0, 10)}`}
                    </p>
                    {r.scopeGranted && r.scopeGranted !== r.scopeRequested && (
                      <p className="mt-1 text-xs">
                        <strong>Granted a narrower scope:</strong> {r.scopeGranted}
                      </p>
                    )}
                    {r.decisionNote && <p className="mt-1 text-xs">{r.decisionNote}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-bold">
                      {r.status}
                    </span>
                    {r.status === 'PENDING' && (
                      <button type="button" disabled={busy !== ''}
                        onClick={() => void decide(r.id, 'withdraw')}
                        className="rounded-lg border border-current px-2 py-1 text-[11px] font-semibold">
                        Withdraw
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---- The board's desk ---- */}
      {data?.onBoard && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-indigo-900">
            <ShieldCheck className="h-4 w-4" />
            Waiting for the board ({data.forReview.length})
          </h3>
          <p className="mt-0.5 text-xs text-indigo-900/80">
            Oldest first. Grant the narrowest scope that answers the question — the scope you
            grant is the scope the query runs under.
          </p>

          {data.forReview.length === 0 && (
            <p className="mt-3 text-sm text-indigo-900/70">Nothing waiting. </p>
          )}

          <ul className="mt-3 space-y-3">
            {data.forReview.map((r) => {
              const overdue = new Date(r.dueBy).getTime() < Date.now();
              return (
                <li key={r.id} className="rounded-xl border border-gray-200 bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900">{r.title}</p>
                      <p className="text-xs text-gray-500">
                        {r.applicant.fullName}
                        {r.applicant.role ? ` · ${r.applicant.role.replace(/_/g, ' ').toLowerCase()}` : ''}
                        {' · '}{r.purpose}
                      </p>
                    </div>
                    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      overdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                      {overdue ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                      {overdue ? 'Past the 24 hours' : `Due ${when(r.dueBy)}`}
                    </span>
                  </div>

                  <dl className="mt-2 space-y-1 text-xs text-gray-700">
                    <div><dt className="inline font-semibold">Scope asked for: </dt>
                      <dd className="inline">{r.scopeRequested}</dd></div>
                    <div><dt className="inline font-semibold">Why: </dt>
                      <dd className="inline">{r.rationale}</dd></div>
                    {(r.periodFrom || r.periodTo) && (
                      <div><dt className="inline font-semibold">Period: </dt>
                        <dd className="inline">{r.periodFrom?.slice(0, 10) ?? '—'} to {r.periodTo?.slice(0, 10) ?? '—'}</dd></div>
                    )}
                    {r.ethicsReference && (
                      <div><dt className="inline font-semibold">Ethics reference: </dt>
                        <dd className="inline">{r.ethicsReference}</dd></div>
                    )}
                  </dl>

                  <textarea
                    value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                    placeholder="Decision note. Required if you refuse — without a reason the same application comes back next week."
                    className="mt-2 block w-full rounded-xl border border-gray-300 px-3 py-2 text-xs"
                  />

                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" disabled={busy !== ''}
                      onClick={() => void decide(r.id, 'approve', { grantDays: data.defaultGrantDays })}
                      className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50">
                      {busy === `${r.id}-approve` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Approve for {data.defaultGrantDays} days
                    </button>
                    <button type="button" disabled={busy !== ''}
                      onClick={() => void decide(r.id, 'reject')}
                      className="flex items-center gap-1.5 rounded-xl border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                      <X className="h-3.5 w-3.5" /> Refuse
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
