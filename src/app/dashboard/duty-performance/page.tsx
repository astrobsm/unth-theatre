'use client';

/**
 * Duty performance: who is doing the job, and on time.
 *
 * FIVE DUTIES ON ONE PAGE, not five pages. They are owned by five different
 * departments, but the question is identical and so is the answer's shape —
 * and a hospital with five separate boards gets five different arguments about
 * whose figures are right.
 *
 * TWO RATES SHOWN SEPARATELY. Not doing the work and doing it late are
 * different failures needing different conversations, and a single blended
 * percentage hides which one a person has.
 *
 * THE EXPORT IS THE POINT. The reason to measure this is that the figures get
 * seen: the summary is written to be pasted straight into the departmental
 * WhatsApp group, and it praises by name while reporting the shortfall as a
 * count. A group message listing who is failing is a public reprimand
 * delivered to an audience, which produces silence rather than packed
 * trolleys.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Award,
  Check,
  Clock,
  Copy,
  Download,
  Loader2,
  MessageCircle,
  Printer,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { whatsappLink } from '@/lib/whatsapp';
import {
  formatRate,
  formatMargin,
  MIN_EVENTS_TO_RANK,
  COMMENDATION_RATE,
  CHASE_RATE,
} from '@/lib/dutyPerformance/report';
import {
  DUTIES,
  DUTY_KEYS,
  type DutyKey,
  type DutyReport,
  type DutyDefinition,
  type DutyPerformance,
} from '@/lib/dutyPerformance/types';

export default function DutyPerformancePage() {
  const [duty, setDuty] = useState<DutyKey>('PREOP_REVIEW');
  const [from, setFrom] = useState('2026-10-01');
  const [to, setTo] = useState('2026-10-31');

  const [report, setReport] = useState<DutyReport | null>(null);
  const [definition, setDefinition] = useState<DutyDefinition | null>(null);
  const [period, setPeriod] = useState('');
  const [summary, setSummary] = useState('');
  const [csv, setCsv] = useState('');
  const [chased, setChased] = useState<string[]>([]);
  const [commended, setCommended] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** The WhatsApp hand-off for the last message sent. Kept on screen so a
      blocked pop-up never turns into a message nobody received. */
  const [handoff, setHandoff] = useState<{ href: string; name: string } | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/duty-performance?duty=${duty}&from=${from}&to=${to}`, {
        credentials: 'include',
      });
      if (res.status === 401 || res.status === 403) { setDenied(true); return; }
      if (!res.ok) { setProblem('Could not build the board.'); return; }
      const data = await res.json();
      setReport(data.report);
      setDefinition(data.definition);
      setPeriod(data.periodLabel ?? '');
      setSummary(data.whatsapp ?? '');
      setCsv(data.csv ?? '');
      setChased(data.chasedUserIds ?? []);
      setCommended(data.commendedUserIds ?? []);
      setDenied(false);
      setProblem(null);
    } catch {
      setProblem('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [duty, from, to]);

  useEffect(() => { void load(); }, [load]);

  const send = async (personId: string, personName: string, kind: 'chase' | 'commend') => {
    setBusy(personId);
    setProblem(null);
    setNote(null);
    setHandoff(null);
    try {
      const res = await fetch('/api/duty-performance/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ duty, personId, from, to, kind }),
      });
      const data = await res.json();
      if (!res.ok) { setProblem(data?.error ?? 'Could not send it.'); return; }
      if (data.alreadySent) { setNote(data.message); return; }

      const href = data.whatsapp ? whatsappLink(data.whatsapp.number, data.whatsapp.text) : null;
      if (href) {
        setHandoff({ href, name: personName });
        // Opened straight away so the ordinary case is one press. The record
        // is written on the server first, so a blocked pop-up can only leave
        // the message unsent, never sent and unrecorded.
        window.open(href, '_blank', 'noopener');
      }
      setNote(
        `${kind === 'commend' ? 'Letter of appreciation' : 'Request'} recorded for ${personName}.`
        + (href
          ? ' WhatsApp is opening with the message — press send there.'
          : ` No WhatsApp: ${data.whatsappSkipped ?? 'no number on file'}. It is in their ORM notifications.`),
      );
      await load();
    } catch {
      setProblem('Could not reach the server.');
    } finally {
      setBusy(null);
    }
  };

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setNote('Summary copied. Paste it into the WhatsApp group.');
    } catch {
      setProblem('Could not copy — select the text below and copy it by hand.');
    }
  };

  const downloadCsv = () => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `duty-${duty.toLowerCase()}-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (denied) {
    return (
      <div className="mx-auto max-w-3xl rounded-lg bg-white p-6 shadow">
        <h1 className="text-lg font-semibold">Duty performance</h1>
        <p className="mt-2 text-sm text-gray-600">
          This board names individuals against a tally of work not done. It is restricted to
          theatre management and heads of department.
        </p>
      </div>
    );
  }

  const def = definition ?? DUTIES[duty];
  const chasedSet = new Set(chased);
  const commendedSet = new Set(commended);
  const onTimeShare = (p: DutyPerformance) =>
    p.total > 0 ? (p.done - p.late) / p.total : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-lg bg-white p-6 shadow print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
              <Clock className="h-6 w-6 text-indigo-600" />
              Duty performance
            </h1>
            <p className="mt-1 text-sm text-gray-600">{def.owner} · {def.label}</p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium print:hidden"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3 print:hidden">
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">Duty</span>
            <select
              value={duty}
              onChange={(e) => setDuty(e.target.value as DutyKey)}
              className="rounded-lg border border-gray-300 px-3 py-2"
            >
              {DUTY_KEYS.map((k) => (
                <option key={k} value={k}>{DUTIES[k].label}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <button type="button" onClick={() => void load()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
            Run
          </button>
        </div>

        {loading && (
          <p className="mt-4 flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Building the board…
          </p>
        )}
        {problem && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{problem}</p>}
        {note && (
          <div className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
            <p>{note}</p>
            {handoff && (
              <a href={handoff.href} target="_blank" rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white">
                <MessageCircle className="h-4 w-4" /> Open WhatsApp to {handoff.name}
              </a>
            )}
          </div>
        )}

        {report && (
          <dl className="mt-4 grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-gray-50 p-3">
              <dt className="text-xs text-gray-500">Due in the period</dt>
              <dd className="text-2xl font-semibold">{report.total}</dd>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3">
              <dt className="text-xs text-gray-500">Done on time</dt>
              <dd className="text-2xl font-semibold text-emerald-700">{report.onTime}</dd>
            </div>
            <div className="rounded-lg bg-amber-50 p-3">
              <dt className="text-xs text-gray-500">Done late</dt>
              <dd className="text-2xl font-semibold text-amber-700">{report.late}</dd>
            </div>
            <div className="rounded-lg bg-red-50 p-3">
              <dt className="text-xs text-gray-500">Never done</dt>
              <dd className="text-2xl font-semibold text-red-700">{report.outstanding}</dd>
            </div>
          </dl>
        )}

        <p className="mt-3 text-xs text-gray-500">
          Deadline: {def.deadline}
          {def.graceMinutes > 0 && ` (${def.graceMinutes} minutes' grace before anything is called late)`}.
          At least {MIN_EVENTS_TO_RANK} are needed to be ranked,{' '}
          {Math.round(COMMENDATION_RATE * 100)}% on time to be commended, and below{' '}
          {Math.round(CHASE_RATE * 100)}% to be chased.
        </p>
      </div>

      {/* ── The export, which is the reason this page exists ──────────── */}
      {report && report.total > 0 && (
        <div className="rounded-lg border-2 border-green-300 bg-white p-6 shadow print:hidden">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <MessageCircle className="h-5 w-5 text-green-600" /> Share on WhatsApp
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Written to be pasted straight into the departmental group. It names the colleagues
            doing well and reports the shortfall as a count — a group message listing who is
            failing is a public reprimand, and the people who need that conversation get it
            individually below.
          </p>
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs text-gray-800">
            {summary}
          </pre>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(summary)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white"
            >
              <MessageCircle className="h-4 w-4" /> Open WhatsApp to share
            </a>
            <button type="button" onClick={() => void copySummary()}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium">
              <Copy className="h-4 w-4" /> Copy
            </button>
            <button type="button" onClick={downloadCsv}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium">
              <Download className="h-4 w-4" /> Download the detail (CSV)
            </button>
          </div>
        </div>
      )}

      {/* ── Commendable ──────────────────────────────────────────────── */}
      {report && report.commendable.length > 0 && (
        <div className="rounded-lg border-2 border-emerald-300 bg-white p-6 shadow print:break-inside-avoid">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <Award className="h-5 w-5 text-emerald-600" /> Worth thanking
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {Math.round(COMMENDATION_RATE * 100)}% or more of what they were responsible for, done
            on time.
          </p>
          <ul className="mt-4 divide-y divide-gray-100">
            {report.commendable.map((p, i) => (
              <li key={p.personId ?? p.name} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold text-gray-900">
                    <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                      {i + 1}
                    </span>
                    {p.name}
                    {p.perfect && (
                      <span className="ml-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                        Perfect
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {p.done - p.late} of {p.total} on time ({formatRate(onTimeShare(p))})
                    {p.medianMarginMinutes !== null && ` · typically ${formatMargin(p.medianMarginMinutes)}`}
                    {p.units.length > 0 && ` · ${p.units.join(', ')}`}
                  </p>
                </div>
                <div className="print:hidden">
                  {!p.personId ? (
                    <span className="text-xs text-gray-400">No ORM account</span>
                  ) : commendedSet.has(p.personId) ? (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                      <Check className="h-3.5 w-3.5 text-green-600" /> Thanked
                    </span>
                  ) : (
                    <button type="button" disabled={busy === p.personId}
                      onClick={() => void send(p.personId!, p.name, 'commend')}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50">
                      {busy === p.personId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Commend
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Worth a conversation ─────────────────────────────────────── */}
      {report && report.chaseable.length > 0 && (
        <div className="rounded-lg border-2 border-amber-300 bg-white p-6 shadow print:break-inside-avoid">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <ShieldAlert className="h-5 w-5 text-amber-600" /> Worth a conversation
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Below {Math.round(CHASE_RATE * 100)}%. The message is an appeal rather than a
            reprimand — it quotes their own figures and asks for them to come up.
          </p>
          <ul className="mt-4 divide-y divide-gray-100">
            {report.chaseable.map((p) => (
              <li key={p.personId ?? p.name} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold text-gray-900">{p.name}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {p.done - p.late} of {p.total} on time ({formatRate(onTimeShare(p))})
                    {p.outstanding > 0 && ` · ${p.outstanding} never done`}
                    {p.late > 0 && ` · ${p.late} late`}
                    {p.units.length > 0 && ` · ${p.units.join(', ')}`}
                  </p>
                </div>
                <div className="print:hidden">
                  {!p.personId ? (
                    <span className="text-xs text-gray-400">No ORM account</span>
                  ) : chasedSet.has(p.personId) ? (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                      <Check className="h-3.5 w-3.5 text-green-600" /> Written to
                    </span>
                  ) : (
                    <button type="button" disabled={busy === p.personId}
                      onClick={() => void send(p.personId!, p.name, 'chase')}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-600 px-3 py-1.5 text-xs font-semibold text-amber-700 disabled:opacity-50">
                      {busy === p.personId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Send the appeal
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Everybody ────────────────────────────────────────────────── */}
      {report && report.people.length > 0 && (
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-1 text-lg font-semibold">Everyone, ranked</h2>
          <p className="mb-3 text-sm text-gray-600">
            Completion and punctuality shown apart: not doing the work and doing it late are
            different failures and need different conversations.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-gray-500">
                <tr>
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Done</th>
                  <th className="py-2 pr-3">Never done</th>
                  <th className="py-2 pr-3">Late</th>
                  <th className="py-2 pr-3">On time</th>
                  <th className="py-2 pr-3">Typically</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.people.map((p, i) => {
                  const share = onTimeShare(p) ?? 0;
                  return (
                    <tr key={p.personId ?? p.name}>
                      <td className="py-2 pr-3 text-gray-500">{i + 1}</td>
                      <td className="py-2 pr-3 font-medium">{p.name}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{p.done} / {p.total}</td>
                      <td className={`py-2 pr-3 ${p.outstanding > 0 ? 'font-semibold text-red-700' : 'text-gray-400'}`}>
                        {p.outstanding}
                      </td>
                      <td className={`py-2 pr-3 ${p.late > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                        {p.late}
                      </td>
                      <td className={`py-2 pr-3 font-semibold ${
                        share >= COMMENDATION_RATE ? 'text-emerald-700'
                          : share >= CHASE_RATE ? 'text-gray-800' : 'text-red-700'
                      }`}>
                        {formatRate(share)}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap text-gray-600">
                        {formatMargin(p.medianMarginMinutes)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Units ────────────────────────────────────────────────────── */}
      {report && report.units.length > 0 && (
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-3 text-lg font-semibold">By unit</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-gray-500">
                <tr>
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Unit</th>
                  <th className="py-2 pr-3">On time</th>
                  <th className="py-2 pr-3">Never done</th>
                  <th className="py-2 pr-3">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.units.map((u, i) => (
                  <tr key={u.unit}>
                    <td className="py-2 pr-3 text-gray-500">{u.ranked ? i + 1 : '—'}</td>
                    <td className="py-2 pr-3 font-medium">
                      {u.unit}
                      {!u.ranked && <span className="ml-2 text-xs text-gray-400">too few to rank</span>}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{u.onTime} / {u.total}</td>
                    <td className={`py-2 pr-3 ${u.outstanding > 0 ? 'text-red-700' : 'text-gray-400'}`}>
                      {u.outstanding}
                    </td>
                    <td className="py-2 pr-3 font-semibold">
                      {formatRate(u.total > 0 ? u.onTime / u.total : null)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── The detail ───────────────────────────────────────────────── */}
      {report && report.cases.length > 0 && (
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Every one, worst first</h2>
            <button type="button" onClick={() => setShowDetail((v) => !v)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium print:hidden">
              {showDetail ? 'Hide' : `Show all ${report.cases.length}`}
            </button>
          </div>
          {showDetail && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-xs uppercase text-gray-500">
                  <tr>
                    <th className="py-2 pr-3">State</th>
                    <th className="py-2 pr-3">What</th>
                    <th className="py-2 pr-3">Unit</th>
                    <th className="py-2 pr-3">Who</th>
                    <th className="py-2 pr-3">Due</th>
                    <th className="py-2 pr-3">Done</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {report.cases.slice(0, 300).map((c) => (
                    <tr key={c.id}>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          c.state === 'OUTSTANDING' ? 'bg-red-100 text-red-700'
                            : c.state === 'LATE' ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {c.state === 'OUTSTANDING' ? 'Not done' : c.state === 'LATE' ? 'Late' : 'On time'}
                        </span>
                      </td>
                      <td className="py-2 pr-3">{c.label}</td>
                      <td className="py-2 pr-3 text-gray-600">{c.unit}</td>
                      <td className="py-2 pr-3">{c.personName}</td>
                      <td className="py-2 pr-3 whitespace-nowrap text-gray-600">{c.dueAtLabel}</td>
                      <td className="py-2 pr-3 whitespace-nowrap text-gray-600">
                        {c.doneAtLabel}
                        {c.marginMinutes !== null && (
                          <span className={c.marginMinutes < 0 ? ' text-amber-700' : ' text-gray-400'}>
                            {' '}({formatMargin(c.marginMinutes)})
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.cases.length > 300 && (
                <p className="mt-2 text-xs text-gray-500">
                  Showing the worst 300 of {report.cases.length}. The CSV has all of them.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {report && report.total === 0 && !loading && (
        <div className="rounded-lg bg-white p-6 shadow">
          <p className="text-sm text-gray-600">Nothing was due for this duty in this period.</p>
        </div>
      )}

      {/* ── Why ──────────────────────────────────────────────────────── */}
      <div className="rounded-lg border-2 border-gray-300 bg-white p-6 shadow print:break-inside-avoid">
        <h2 className="text-lg font-bold text-gray-900">Why {def.label.toLowerCase()} is measured</h2>
        <p className="mt-1 text-xs uppercase tracking-wide text-gray-500">
          University of Nigeria Teaching Hospital, Ituku-Ozalla · Theatre Management
        </p>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-gray-800">
          <p>{def.why}</p>
          <p>
            <strong>Two numbers, not one.</strong> A duty can fail two ways — not done at all,
            or done too late — and they need different conversations. Somebody with work
            outstanding is missing it entirely; somebody late is doing it but behind the list.
            A single blended score would hide which, and the wrong conversation follows.
          </p>
          <p>
            <strong>What the board is for.</strong> It is read in both directions. Colleagues
            doing this reliably are thanked by name, and the figures are shared with the
            department so that is visible. Colleagues falling behind are written to individually,
            with an appeal rather than a reprimand, because the outcome wanted is the duty done
            tomorrow — not a person who feels got at.
          </p>
          <p className="pt-2">
            <strong>Theatre Management</strong><br />
            University of Nigeria Teaching Hospital, Ituku-Ozalla
          </p>
        </div>
      </div>
      {period && <p className="text-center text-xs text-gray-400">{period}</p>}
    </div>
  );
}
