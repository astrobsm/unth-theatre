'use client';

/**
 * The oxygen position, shown wherever somebody needs it.
 *
 * One component, three screens: the anaesthetic technician's setup page, the
 * oxygen status page every account can open, and the oxygen room's own
 * control page. They show the same readings, the same age against the same
 * schedule, and the same thread — because a technician and a supervisor
 * looking at different accounts of the same manifold is how a theatre ends up
 * setting up against a posting that went stale three hours ago.
 *
 * The age is as prominent as the readings. "Central supply: GOOD" with no
 * stated age is not a status, it is a rumour with a colour.
 */

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  Wind, Gauge, Phone, MessageCircle, AlertTriangle, CheckCircle2,
  Clock, RefreshCw, Send,
} from 'lucide-react';
import { whatsappChatLink } from '@/lib/whatsapp';
import {
  clockText, stampText, ageText, freshnessLabel, freshnessTone,
  scheduleSentence, type FreshnessLevel,
} from '@/lib/oxygen/schedule';
import {
  OXYGEN_COMMENT_KINDS, OXYGEN_ANSWER_OUTCOMES, commentProblem, answerProblem,
  kindLabel, outcomeLabel, oxygenWhatsAppText, type OxygenComment,
} from '@/lib/oxygen/comment';

interface SlotRow {
  key: string;
  label: string;
  at: string;
  status: 'COVERED' | 'DUE' | 'LATE' | 'UPCOMING';
  coveredAt: string | null;
  minutesLate: number;
}

interface OxygenStaff {
  id: string;
  fullName: string;
  phoneNumber: string | null;
  extension: string | null;
}

interface StatusPayload {
  now: string;
  report: any | null;
  schedule: {
    level: FreshnessLevel;
    message: string;
    workingDay: boolean;
    ageMinutes: number | null;
    minutesLate: number;
    lastReportAt: string | null;
    expectedLabel: string | null;
    nextAt: string | null;
    nextLabel: string | null;
  };
  slots: SlotRow[];
  comments: OxygenComment[];
  staff: OxygenStaff[];
}

/** Roles whose answer to a request counts as the oxygen room's answer. */
const ANSWERING_ROLES = [
  'OXYGEN_UNIT_SUPERVISOR',
  'WORKS_SUPERVISOR',
  'THEATRE_MANAGER',
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
];

const TONE_CLASSES: Record<string, string> = {
  green: 'bg-green-50 text-green-800 ring-green-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-800 ring-red-200',
  grey: 'bg-gray-50 text-gray-700 ring-gray-200',
};

const SUPPLY_TONE: Record<string, string> = {
  EXCELLENT: 'text-green-700 bg-green-50',
  GOOD: 'text-green-700 bg-green-50',
  ADEQUATE: 'text-amber-700 bg-amber-50',
  LOW: 'text-orange-700 bg-orange-50',
  CRITICAL: 'text-red-700 bg-red-50',
  DEPLETED: 'text-red-800 bg-red-100',
};

function prettyRole(role?: string | null): string {
  if (!role) return '';
  return role.replace(/_/g, ' ').toLowerCase();
}

export default function OxygenStatusPanel({
  theatreName,
  setupLogId,
  title = 'Oxygen status',
}: {
  /** The theatre the reader is standing in, when the page knows. */
  theatreName?: string | null;
  setupLogId?: string | null;
  title?: string;
}) {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const mayAnswer = !!role && ANSWERING_ROLES.includes(role);

  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [kind, setKind] = useState<string>('CONFIRM_REQUEST');
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState('');

  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerOutcome, setAnswerOutcome] = useState<string>('CONFIRMED');
  const [answerBody, setAnswerBody] = useState('');
  const [answerBusy, setAnswerBusy] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    try {
      const res = await fetch('/api/oxygen/status');
      if (!res.ok) throw new Error('Could not read the oxygen status.');
      setData(await res.json());
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Could not read the oxygen status.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Five minutes. The posting cadence is two hours; polling faster than this
    // buys nothing and costs a request from every open theatre screen.
    const t = setInterval(() => load(true), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  const problem = commentProblem({ kind, body, theatreName });

  const submitComment = async () => {
    if (problem) return;
    setPosting(true);
    setPosted('');
    try {
      const res = await fetch('/api/oxygen/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          body,
          theatreName: theatreName || null,
          setupLogId: setupLogId || null,
          reportId: data?.report?.id || null,
          reportedAt: data?.report?.reportDate || null,
        }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out?.error || 'Could not post the comment.');
      setBody('');
      setPosted('Sent to the oxygen room.');
      await load(true);
    } catch (e: any) {
      setPosted(e?.message || 'Could not post the comment.');
    } finally {
      setPosting(false);
    }
  };

  const submitAnswer = async (id: string) => {
    const p = answerProblem({ outcome: answerOutcome, body: answerBody });
    if (p) {
      setError(p);
      return;
    }
    setAnswerBusy(true);
    try {
      const res = await fetch(`/api/oxygen/comments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: answerOutcome, body: answerBody }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out?.error || 'Could not send the answer.');
      setAnsweringId(null);
      setAnswerBody('');
      setAnswerOutcome('CONFIRMED');
      setError('');
      await load(true);
    } catch (e: any) {
      setError(e?.message || 'Could not send the answer.');
    } finally {
      setAnswerBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <p className="text-sm text-gray-500">Reading the oxygen status…</p>
      </div>
    );
  }

  const sched = data?.schedule;
  const report = data?.report;
  const tone = TONE_CLASSES[freshnessTone(sched?.level ?? 'NONE')] || TONE_CLASSES.grey;

  const statusLine = report
    ? `${report.centralOxygenStatus} · ${report.centralOxygenPressure} psi · bank ${report.cylinderBankLevel}%`
    : 'nothing posted';

  const theatreOutlets = report
    ? [1, 2, 3, 4].map((n) => ({
        label: `Theatre ${n}`,
        ok: report[`theatre${n}OxygenOk`] as boolean,
        pressure: report[`theatre${n}Pressure`] as number | null,
      })).concat([{
        label: 'Recovery room',
        ok: report.recoveryRoomOxygenOk as boolean,
        pressure: report.recoveryRoomPressure as number | null,
      }])
    : [];

  return (
    <div className="card space-y-4">
      <div className="flex items-start gap-2">
        <Wind className="w-5 h-5 text-sky-600 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500">{scheduleSentence()}</p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          className="ml-auto text-gray-400 hover:text-gray-700 p-1"
          aria-label="Refresh oxygen status"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">{error}</div>
      )}

      {/* ---- Freshness. As loud as the readings, on purpose. ---- */}
      <div className={`rounded-lg p-3 ring-1 ${tone}`}>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 flex-shrink-0" />
          <span className="font-semibold text-sm">{freshnessLabel(sched?.level ?? 'NONE')}</span>
        </div>
        <p className="text-sm mt-1">{sched?.message}</p>
      </div>

      {/* ---- The day's four postings ---- */}
      {data?.slots?.length ? (
        <div className="grid grid-cols-4 gap-2">
          {data.slots.map((s) => {
            const cls = s.status === 'COVERED'
              ? 'bg-green-50 ring-green-200 text-green-800'
              : s.status === 'LATE'
                ? 'bg-red-50 ring-red-200 text-red-800'
                : s.status === 'DUE'
                  ? 'bg-amber-50 ring-amber-200 text-amber-800'
                  : 'bg-gray-50 ring-gray-200 text-gray-500';
            return (
              <div key={s.key} className={`rounded-lg px-2 py-2 text-center ring-1 ${cls}`}>
                <p className="text-xs font-semibold">{s.label}</p>
                <p className="text-[11px] mt-0.5">
                  {s.status === 'COVERED' && s.coveredAt
                    ? `posted ${clockText(new Date(s.coveredAt))}`
                    : s.status === 'UPCOMING'
                      ? `due ${clockText(new Date(s.at))}`
                      : s.status === 'DUE'
                        ? 'due now'
                        : `${ageText(s.minutesLate)} late`}
                </p>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* ---- The readings ---- */}
      {report ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className={`rounded-lg p-3 ${SUPPLY_TONE[report.centralOxygenStatus] || 'bg-gray-50 text-gray-700'}`}>
              <p className="text-[11px] uppercase tracking-wide opacity-80">Central supply</p>
              <p className="text-base font-bold">{report.centralOxygenStatus}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">Pressure</p>
              <p className="text-base font-bold text-gray-900 flex items-center gap-1">
                <Gauge className="w-4 h-4 text-gray-400" />{report.centralOxygenPressure} psi
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">Cylinder bank</p>
              <p className="text-base font-bold text-gray-900">{report.cylinderBankLevel}%</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {theatreOutlets.map((t) => (
              <div
                key={t.label}
                className={`rounded-lg px-2 py-2 text-center ring-1 ${
                  t.ok ? 'bg-green-50 ring-green-200 text-green-800' : 'bg-red-50 ring-red-200 text-red-800'
                } ${theatreName && t.label.toLowerCase() === theatreName.toLowerCase() ? 'ring-2 ring-offset-1' : ''}`}
              >
                <p className="text-xs font-semibold">{t.label}</p>
                <p className="text-[11px]">
                  {t.ok ? 'OK' : 'NOT OK'}{t.pressure != null ? ` · ${t.pressure} psi` : ''}
                </p>
              </div>
            ))}
          </div>

          {report.predictedShortage && (
            <div className="rounded-lg bg-orange-50 p-3 ring-1 ring-orange-200">
              <p className="text-sm font-semibold text-orange-900 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" /> Shortage predicted
                {report.shortageEstimatedTime ? ` in ${report.shortageEstimatedTime}` : ''}
              </p>
              {report.shortageReason && <p className="text-sm text-orange-800 mt-1">{report.shortageReason}</p>}
            </div>
          )}

          {report.criticalIssues && (
            <div className="rounded-lg bg-red-50 p-3 ring-1 ring-red-200">
              <p className="text-sm font-semibold text-red-900 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" /> Critical issues
              </p>
              <p className="text-sm text-red-800 mt-1">{report.criticalIssues}</p>
            </div>
          )}

          <p className="text-xs text-gray-500">
            Posted {stampText(new Date(report.reportDate))} by {report.reportedBy?.fullName || 'the oxygen room'}
            {report.shiftType ? ` (${report.shiftType.toLowerCase()} shift)` : ''}
            {sched?.ageMinutes != null ? ` — ${ageText(sched.ageMinutes)} ago` : ''}.
          </p>
        </div>
      ) : (
        <div className="rounded-lg bg-gray-50 p-4 ring-1 ring-gray-200">
          <p className="text-sm text-gray-700">
            No oxygen readiness report has been posted. Set up against the gauge on the wall,
            and ask the oxygen room below.
          </p>
        </div>
      )}

      {/* ---- Who to ring ---- */}
      <div className="rounded-lg bg-sky-50 p-3 ring-1 ring-sky-200">
        <p className="text-sm font-semibold text-sky-900 mb-2">Oxygen room</p>
        {data?.staff?.length ? (
          <div className="flex flex-wrap gap-2">
            {data.staff.map((s) => {
              const wa = whatsappChatLink(
                s.phoneNumber,
                oxygenWhatsAppText({
                  kind,
                  body,
                  theatreName,
                  authorName: session?.user?.name || 'Theatre',
                  authorRole: role,
                  statusLine,
                }),
              );
              return (
                <div key={s.id} className="flex items-center gap-1 rounded-full bg-white px-2 py-1 ring-1 ring-sky-200">
                  <span className="text-xs font-medium text-sky-900">{s.fullName}</span>
                  {s.phoneNumber ? (
                    <>
                      <a
                        href={`tel:${s.phoneNumber}`}
                        className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-800 hover:bg-sky-200"
                        title="Call"
                      >
                        <Phone className="w-3 h-3" />{s.phoneNumber}
                      </a>
                      {wa && (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 hover:bg-green-200"
                          title="WhatsApp"
                        >
                          <MessageCircle className="w-3 h-3" /> WhatsApp
                        </a>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-gray-500">
                      no number on file{s.extension ? ` · ext ${s.extension}` : ''}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          // Said plainly rather than left blank. An empty box reads as "fine",
          // and this is the opposite of fine at 11:40 on a Friday.
          <p className="text-sm text-sky-900">
            No oxygen room account is approved on the system, so there is no number to show here.
            Ask an administrator to add the oxygen unit supervisor under Users.
          </p>
        )}
      </div>

      {/* ---- Say something back ---- */}
      <div className="rounded-lg border border-gray-200 p-3 space-y-3">
        <p className="text-sm font-semibold text-gray-900">Comment to the oxygen room</p>
        <div className="flex flex-wrap gap-2">
          {OXYGEN_COMMENT_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${
                kind === k
                  ? 'bg-sky-600 text-white ring-sky-600'
                  : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50'
              }`}
            >
              {kindLabel(k)}
            </button>
          ))}
        </div>
        <textarea
          className="input-field"
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            kind === 'CONFIRM_REQUEST'
              ? 'Optional — e.g. "Setting up now, gauge reads lower than posted."'
              : kind === 'ADJUSTMENT_REQUEST'
                ? 'What needs adjusting, and where. e.g. "Theatre 2 wall outlet at 30 psi, please raise."'
                : 'What you saw.'
          }
        />
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={submitComment}
            disabled={posting || !!problem}
            className="btn-primary disabled:opacity-50 inline-flex items-center gap-1"
          >
            <Send className="w-4 h-4" /> {posting ? 'Sending…' : 'Send to oxygen room'}
          </button>
          {problem && <span className="text-xs text-amber-700">{problem}</span>}
          {posted && <span className="text-xs text-gray-600">{posted}</span>}
        </div>
      </div>

      {/* ---- The thread ---- */}
      {data?.comments?.length ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-900">Recent comments</p>
          {data.comments.slice(0, 8).map((c) => (
            <div
              key={c.id}
              className={`rounded-lg p-3 ring-1 ${
                c.status === 'OPEN' && c.kind !== 'OBSERVATION'
                  ? 'bg-amber-50 ring-amber-200'
                  : 'bg-gray-50 ring-gray-200'
              }`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-gray-900">{kindLabel(c.kind)}</span>
                {c.theatreName && <span className="text-xs text-gray-600">· {c.theatreName}</span>}
                <span className="text-xs text-gray-500 ml-auto">{stampText(new Date(c.createdAt))}</span>
              </div>
              {c.body && <p className="text-sm text-gray-800 mt-1">{c.body}</p>}
              <p className="text-xs text-gray-500 mt-1">
                {c.authorName}{c.authorRole ? `, ${prettyRole(c.authorRole)}` : ''}
              </p>

              {c.status === 'ANSWERED' ? (
                <div className="mt-2 rounded bg-white p-2 ring-1 ring-green-200">
                  <p className="text-xs font-semibold text-green-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> {outcomeLabel(c.answerOutcome as string)}
                  </p>
                  {c.answerBody && <p className="text-sm text-gray-800 mt-1">{c.answerBody}</p>}
                  <p className="text-xs text-gray-500 mt-1">
                    {c.answeredByName}{c.answeredAt ? ` · ${stampText(new Date(c.answeredAt))}` : ''}
                  </p>
                </div>
              ) : c.kind !== 'OBSERVATION' && mayAnswer ? (
                answeringId === c.id ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {OXYGEN_ANSWER_OUTCOMES.map((o) => (
                        <button
                          key={o}
                          type="button"
                          onClick={() => setAnswerOutcome(o)}
                          className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${
                            answerOutcome === o
                              ? 'bg-green-600 text-white ring-green-600'
                              : 'bg-white text-gray-700 ring-gray-300'
                          }`}
                        >
                          {outcomeLabel(o)}
                        </button>
                      ))}
                    </div>
                    <textarea
                      className="input-field"
                      rows={2}
                      value={answerBody}
                      onChange={(e) => setAnswerBody(e.target.value)}
                      placeholder="What was done, or why it could not be."
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => submitAnswer(c.id)}
                        disabled={answerBusy}
                        className="btn-primary disabled:opacity-50 text-sm"
                      >
                        {answerBusy ? 'Sending…' : 'Send answer'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnsweringId(null)}
                        className="text-sm text-gray-600 hover:text-gray-900"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setAnsweringId(c.id); setAnswerOutcome('CONFIRMED'); setAnswerBody(''); }}
                    className="mt-2 text-xs font-semibold text-sky-700 hover:text-sky-900"
                  >
                    Answer this →
                  </button>
                )
              ) : (
                c.kind !== 'OBSERVATION' && (
                  <p className="mt-2 text-xs text-amber-800">Waiting on the oxygen room.</p>
                )
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
