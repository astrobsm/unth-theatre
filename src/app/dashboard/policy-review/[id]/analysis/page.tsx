'use client';

/**
 * The analysis, and the gate between what a model recommended and what the
 * policy says.
 *
 * Nothing on this page changes the policy until somebody presses Accept. The
 * model's output is labelled as a recommendation throughout, and the "traced
 * to" line under each change is not decoration: the server refused the whole
 * run unless every cited response existed and every count matched the database.
 *
 * A FAILED RUN IS SHOWN, with its reasons. The findings are not displayed as
 * findings, but a prompt that has started inventing support is something the
 * Chairman needs to see rather than a blank screen.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Check,
  CircleDollarSign,
  Download,
  FileCheck2,
  Activity,
  FileText,
  Gavel,
  RefreshCw,
  PenLine,
  KeyRound,
  RotateCcw,
  ClipboardCopy,
  Send,
  Loader2,
  Pencil,
  ShieldAlert,
  Sparkles,
  Users,
} from 'lucide-react';

import PolicyMarkdown from '@/components/policy/PolicyMarkdown';

interface LivePreview {
  coverage: {
    invited: number; submitted: number; percent: number;
    enoughForAnalysis: boolean; needed: number;
  };
  banner: string;
  summary: string;
  sections: Array<{
    sectionId: string; number: string | null; title: string;
    agree: number; agreeWithChanges: number; disagree: number; notMyArea: number;
    answered: number; patientSafety: number; highPriority: number;
    signal: 'THIN' | 'SETTLED' | 'CONTESTED' | 'DIVIDED'; signalLabel: string;
  }>;
  decisionItems: Array<{
    decisionItemId: string; sectionNumber: string | null; placeholder: string;
    currentValue: string; answered: number;
    leading: {
      value: string; support: number; isCurrent: boolean;
      margin: number; contested: boolean; answered: boolean;
    };
  }>;
  analysis: {
    hasRun: boolean; newSince: number; stale: boolean; message: string;
    lastRunAt: string | null; submittedAtRun: number | null; suggestRerun: boolean;
  };
  generatedAt: string;
}

interface Signoff {
  id: string;
  signerName: string;
  signerRole: string | null;
  signerUnit: string | null;
  outcomeVersion: string | null;
  sentAt: string | null;
  openedAt: string | null;
  revokedAt: string | null;
  signedAt: string | null;
  signedName: string | null;
  standing: 'SIGNED' | 'STALE' | 'AWAITING' | 'WITHDRAWN';
  standingLabel: string;
}

interface NewSignLink {
  signoffId: string;
  signerName: string;
  url: string;
  message: string;
  whatsapp: string | null;
  alreadySent?: boolean;
}

type Decision = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EDITED' | 'FOR_COMMITTEE';

interface Change {
  id: string;
  sectionId: string | null;
  type: string;
  currentText: string | null;
  proposedText: string;
  editedText: string | null;
  rationale: string;
  supportingResponseIds: unknown;
  supportStrength: string;
  clinicalReviewRequired: boolean;
  ownerDecision: Decision;
  decidedByName: string | null;
  decidedAt: string | null;
}

interface Synthesis {
  executive_summary?: string;
  areas_of_agreement?: string[];
  contested_issues?: Array<{ summary: string; section_ids: string[] }>;
  critical_concerns?: Array<{ type: string; summary: string; section_id: string | null }>;
  unit_barriers?: Array<{ unit: string; barrier: string; resources_needed: string | null }>;
  for_the_meeting?: string[];
}

interface Run {
  id: string;
  status: 'RUNNING' | 'VALIDATED' | 'FAILED_VALIDATION' | 'FAILED_API';
  model: string;
  promptVersion: string;
  startedAt: string;
  finishedAt: string | null;
  output: {
    synthesis?: Synthesis;
    crossSection?: { inconsistencies?: Array<{ summary: string; section_ids: string[] }> };
    corrections?: Array<{ detail: string; where: string }>;
  } | null;
  validationErrors: { message?: string; violations?: Array<{ detail: string; where?: string }> } | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costCents: number | null;
  runByName: string | null;
}

interface SectionRef { id: string; number: string | null; title: string }

const DECISION_TONE: Record<Decision, string> = {
  PENDING: 'border-slate-200',
  ACCEPTED: 'border-emerald-300 bg-emerald-50/40',
  EDITED: 'border-blue-300 bg-blue-50/40',
  REJECTED: 'border-slate-200 opacity-50',
  FOR_COMMITTEE: 'border-violet-300 bg-violet-50/40',
};

const money = (cents: number | null) =>
  cents == null ? '—' : `$${(cents / 100).toFixed(2)}`;

export default function PolicyAnalysisPage({ params }: { params: { id: string } }) {
  const [run, setRun] = useState<Run | null>(null);
  const [changes, setChanges] = useState<Change[]>([]);
  const [sections, setSections] = useState<SectionRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<
  { analysed: number; remaining: number; costCents: number } | null
  >(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  /**
   * The live picture, recomputed from the responses on every poll.
   *
   * Free and exact: no model, no spend, and it cannot be wrong about a count.
   * This is what “real time” means here -- the paid AI synthesis stays on the
   * Chairman’s click, because it costs money per press and eighteen members
   * would otherwise mean eighteen runs where only the last is ever read.
   */
  const [live, setLive] = useState<LivePreview | null>(null);
  const [liveAt, setLiveAt] = useState<Date | null>(null);
  const [showAllSections, setShowAllSections] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  /**
   * Signatures on the revised policy.
   *
   * `newSignLinks` holds links the server has just returned. They are shown
   * ONCE -- only each token's hash is stored -- so this state is the only
   * chance to copy them, exactly as the review invitations work.
   */
  const [signoffs, setSignoffs] = useState<Signoff[]>([]);
  const [signSentence, setSignSentence] = useState<string>('');
  const [signEligible, setSignEligible] = useState(0);
  const [signMissing, setSignMissing] = useState(0);
  const [newSignLinks, setNewSignLinks] = useState<NewSignLink[] | null>(null);
  const [signBusy, setSignBusy] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [copiedSign, setCopiedSign] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [version, setVersion] = useState('0.3');
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<{ applied: number; unapplied: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/policy/rounds/${params.id}/analysis`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? 'Could not load the analysis.');
        return;
      }
      setRun(body.run ?? null);
      setChanges(body.changes ?? []);
      setSections(body.sections ?? []);
      setError(null);
    } catch {
      setError('Could not load the analysis.');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { void load(); }, [load]);

  /**
   * Drive the run to completion.
   *
   * The server analyses what it can in about four minutes, banks it and
   * returns `done: false` with a count, because the deployment kills a function
   * at five and an eighty-section policy does not fit. So this calls again
   * until it is done — and a resumed run skips the sections already analysed,
   * so no section is paid for twice.
   *
   * The loop is bounded. An endless client loop against a paid API is a bill
   * nobody authorised, so it stops after enough slices to cover any realistic
   * policy and tells the Chairman to press the button again.
   */
  const runAnalysis = async () => {
    setRunning(true);
    setError(null);
    setNotice(null);
    setProgress(null);

    const MAX_SLICES = 20;
    try {
      for (let slice = 0; slice < MAX_SLICES; slice += 1) {
        const res = await fetch(`/api/policy/rounds/${params.id}/analysis`, { method: 'POST' });
        const body = await res.json();

        if (!res.ok) {
          setError(body?.error ?? 'The analysis could not be run.');
          return;
        }

        if (body.status === 'RUNNING' && body.done === false) {
          setProgress({
            analysed: body.sectionsAnalysed ?? 0,
            remaining: body.remaining ?? 0,
            costCents: body.costCents ?? 0,
          });
          continue;
        }

        setProgress(null);
        setNotice(body.message ?? null);
        if (body.status !== 'VALIDATED') {
          setError(body.message ?? 'The analysis was refused.');
        }
        await load();
        return;
      }

      setError(
        'The analysis is taking an unusual number of passes. What it has done so far is '
        + 'saved and paid for — press Run again to carry on from there.',
      );
      await load();
    } catch {
      setError('The analysis could not be run.');
    } finally {
      setRunning(false);
    }
  };

  const decide = async (change: Change, decision: Decision) => {
    setBusyId(change.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/policy/rounds/${params.id}/changes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changeId: change.id,
          decision,
          editedText: decision === 'EDITED' ? editing[change.id] ?? '' : null,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? 'Could not record that decision.');
        return;
      }
      if (body.notice) setNotice(body.notice);
      setChanges((prev) => prev.map((c) => (c.id === change.id
        ? {
          ...c,
          ownerDecision: decision,
          editedText: decision === 'EDITED' ? editing[change.id] ?? null : null,
        }
        : c)));
      if (decision !== 'EDITED') {
        setEditing((prev) => {
          const next = { ...prev };
          delete next[change.id];
          return next;
        });
      }
    } catch {
      setError('Could not record that decision.');
    } finally {
      setBusyId(null);
    }
  };

  const generate = async (approve: boolean) => {
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/policy/rounds/${params.id}/final-proposal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: version.trim(), approve }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? 'Could not generate the revised policy.');
        return;
      }
      setGenerated({ applied: body.applied, unapplied: body.unapplied });
      setNotice(body.notice ?? `Version ${version} generated from ${body.applied} applied change(s).`);
    } catch {
      setError('Could not generate the revised policy.');
    } finally {
      setGenerating(false);
    }
  };

  const labelOf = (sectionId: string | null) => {
    if (!sectionId) return 'New provision';
    const s = sections.find((x) => x.id === sectionId);
    if (!s) return 'Unknown section';
    return s.number ? `${s.number}. ${s.title}` : s.title;
  };

  const counted = (decision: Decision) => changes.filter((c) => c.ownerDecision === decision).length;
  const synthesis = run?.output?.synthesis;

  /**
   * The synthesis on the hospital letterhead.
   *
   * Two steps on purpose. The route decides what the document SAYS -- it
   * applies the round’s attribution setting, builds the roster and writes the
   * audit entry -- and hands back the figures as JSON. This only draws them.
   * So the PDF cannot show a name the Markdown would have withheld, and the
   * two carriers cannot drift apart.
   *
   * jsPDF is imported here rather than at the top of the file so it stays out
   * of the page bundle until somebody asks for a document; the estimate screen
   * does the same. It matters on a theatre phone.
   */
  const downloadSynthesisPdf = async () => {
    setPdfBusy(true);
    setPdfError(null);
    try {
      const res = await fetch(
        `/api/policy/rounds/${params.id}/export?format=synthesis&as=json`,
        { cache: 'no-store' },
      );
      const body = await res.json();
      if (!res.ok) {
        setPdfError(body?.error ?? 'Could not build the PDF.');
        return;
      }

      const { buildSynthesisPdf, synthesisFileName } = await import(
        '@/lib/policy/synthesisPdf'
      );
      const blob = await buildSynthesisPdf(body);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = synthesisFileName(body);
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'Could not build the PDF.');
    } finally {
      setPdfBusy(false);
    }
  };

  const loadLive = useCallback(async () => {
    try {
      const res = await fetch(`/api/policy/rounds/${params.id}/preview`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      setLive(await res.json());
      setLiveAt(new Date());
    } catch {
      // A failed poll must leave the last good picture on screen rather than
      // blanking it: a momentary drop on theatre wifi is not news.
    }
  }, [params.id]);

  /**
   * Poll while the page is open and visible.
   *
   * Thirty seconds, and only when the tab is actually being looked at. The
   * endpoint is cheap, but a forgotten tab polling all night on a theatre
   * handset is somebody’s battery and somebody’s data.
   */
  useEffect(() => {
    void loadLive();
    const tick = () => {
      if (document.visibilityState === 'visible') void loadLive();
    };
    const timer = setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [loadLive]);

  /** Who has signed, and where each signature stands against the current text. */
  const loadSignoffs = useCallback(async () => {
    try {
      const res = await fetch(`/api/policy/rounds/${params.id}/signoffs`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const body = await res.json();
      setSignoffs(body.signoffs ?? []);
      setSignSentence(body.sentence ?? '');
      setSignEligible(body.eligible ?? 0);
      setSignMissing(body.missingLinks ?? 0);
    } catch {
      // A failure here must not blank the analysis screen.
    }
  }, [params.id]);

  useEffect(() => { void loadSignoffs(); }, [loadSignoffs]);

  /** Issue signing links to every participant who does not have one. */
  const sendForSignature = async () => {
    setSignBusy(true);
    setSignError(null);
    try {
      const res = await fetch(`/api/policy/rounds/${params.id}/signoffs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();
      if (!res.ok) {
        setSignError(body?.error ?? 'Could not create the signing links.');
        return;
      }
      setNewSignLinks(body.created ?? []);
      await loadSignoffs();
    } catch {
      setSignError('Could not create the signing links.');
    } finally {
      setSignBusy(false);
    }
  };

  const changeSignoff = async (signoffId: string, action: 'reissue' | 'revoke' | 'restore') => {
    setSignBusy(true);
    setSignError(null);
    try {
      const res = await fetch(`/api/policy/rounds/${params.id}/signoffs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signoffId, action }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSignError(body?.error ?? 'Could not change that signing link.');
        return;
      }
      if (action === 'reissue') {
        setNewSignLinks((prev) => [
          ...(prev ?? []).filter((l) => l.signoffId !== body.signoffId),
          {
            signoffId: body.signoffId,
            signerName: body.signerName,
            url: body.url,
            message: body.message,
            whatsapp: body.whatsapp ?? null,
          },
        ]);
      }
      await loadSignoffs();
    } catch {
      setSignError('Could not change that signing link.');
    } finally {
      setSignBusy(false);
    }
  };

  const copySign = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSign(tag);
      setTimeout(() => setCopiedSign(null), 1800);
    } catch {
      setSignError('Could not copy — select the text and copy it by hand.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <Link
        href={`/dashboard/policy-review/${params.id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to the round
      </Link>

      <h1 className="text-xl font-bold text-slate-900">Analysis and decisions</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        What the committee said, clustered and checked. Every finding here cites the responses
        it rests on, and the run is refused outright if any citation does not exist or any
        count disagrees with the database.
      </p>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <p className="text-sm text-rose-900">{error}</p>
        </div>
      )}
      {notice && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          {notice}
        </div>
      )}

      {/*
        The live picture, recomputed on every poll.

        This is what updates as responses are submitted. It costs nothing and
        cannot be wrong about a count, because it IS the counts -- the paid AI
        synthesis below stays on the Chairman's click, since it spends real
        money per press and eighteen members would mean eighteen runs where
        only the last is ever read.
      */}
      {live && (
        <section className="mt-5 rounded-xl border-2 border-indigo-200 bg-indigo-50/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-indigo-900">
              <Activity className="h-4 w-4" />
              Live preview — updates as responses arrive
            </h2>
            <button
              type="button"
              onClick={() => void loadLive()}
              className="flex items-center gap-1 rounded border border-indigo-300 bg-white px-2 py-1 text-[11px] font-medium text-indigo-800"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
          </div>

          {/*
            The banner always says what the picture rests on. A provisional
            reading that does not announce itself gets quoted in a meeting as
            though the committee had finished.
          */}
          <p className="mt-2 rounded-lg border border-indigo-200 bg-white p-2 text-xs font-semibold text-indigo-900">
            {live.banner}
          </p>
          <p className="mt-2 text-xs text-slate-700">{live.summary}</p>
          {liveAt && (
            <p className="mt-1 text-[10px] text-slate-500">
              Recomputed at {liveAt.getHours().toString().padStart(2, '0')}:
              {liveAt.getMinutes().toString().padStart(2, '0')}:
              {liveAt.getSeconds().toString().padStart(2, '0')} · refreshes every 30s
            </p>
          )}

          {/* Where the stored AI analysis stands against what has come in since. */}
          <div
            className={`mt-3 rounded-lg border p-2 text-xs ${
              live.analysis.stale
                ? 'border-amber-300 bg-amber-50 text-amber-900'
                : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            {live.analysis.message}
          </div>

          {live.sections.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Sections, worst first
              </p>
              <ul className="mt-1 space-y-1">
                {(showAllSections ? live.sections : live.sections.slice(0, 6)).map((sec) => (
                  <li
                    key={sec.sectionId}
                    className="flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs"
                  >
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        sec.signal === 'DIVIDED' ? 'bg-rose-100 text-rose-800'
                          : sec.signal === 'CONTESTED' ? 'bg-amber-100 text-amber-900'
                            : sec.signal === 'THIN' ? 'bg-slate-100 text-slate-600'
                              : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {sec.signalLabel}
                    </span>
                    <span className="font-medium text-slate-900">
                      {sec.number ? `${sec.number} ` : ''}{sec.title}
                    </span>
                    <span className="ml-auto text-[11px] text-slate-500">
                      {sec.agree} agree · {sec.agreeWithChanges} with changes ·{' '}
                      {sec.disagree} disagree
                      {sec.patientSafety > 0 && (
                        <span className="ml-1 font-bold text-rose-700">
                          · {sec.patientSafety} safety
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {live.sections.length > 6 && (
                <button
                  type="button"
                  onClick={() => setShowAllSections((v) => !v)}
                  className="mt-1 text-[11px] font-semibold text-indigo-800 underline"
                >
                  {showAllSections
                    ? 'Show fewer'
                    : `Show all ${live.sections.length} sections`}
                </button>
              )}
            </div>
          )}

          {live.decisionItems.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Open values — what is winning so far
              </p>
              <ul className="mt-1 space-y-1">
                {live.decisionItems.slice(0, 8).map((d) => (
                  <li
                    key={d.decisionItemId}
                    className="flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs"
                  >
                    <span className="font-mono text-[11px] text-slate-600">
                      {d.sectionNumber ? `${d.sectionNumber} ` : ''}{d.placeholder}
                    </span>
                    {d.leading.answered ? (
                      <>
                        <span className="font-semibold text-slate-900">
                          {d.leading.value}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {d.leading.support} in favour
                          {d.leading.isCurrent ? ' (the drafted value)' : ' (a proposal)'}
                        </span>
                        {/*
                          A one-vote gap or a tie is flagged rather than
                          presented as a result: settling an open value on that
                          basis would be inventing a committee decision.
                        */}
                        {d.leading.contested && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                            {d.leading.margin === 0 ? 'tied' : 'close'}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[11px] text-slate-500">nobody has answered yet</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {live.analysis.suggestRerun && (
            <p className="mt-3 text-[11px] text-slate-600">
              Enough has changed to be worth running the AI synthesis below
              {live.analysis.hasRun ? ' again' : ''}. It is never run automatically —
              each run spends money on the hospital&rsquo;s account.
            </p>
          )}
        </section>
      )}

      {/* ── Run ─────────────────────────────────────────────────────────── */}
      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
              <Sparkles className="h-4 w-4 text-blue-600" />
              The analysis
            </h2>
            {run ? (
              <p className="mt-1 text-xs text-slate-500">
                {run.status === 'VALIDATED' ? 'Checked and accepted' : run.status.replace(/_/g, ' ').toLowerCase()}
                {' · '}
                {run.model} · prompt {run.promptVersion}
                {run.runByName ? ` · run by ${run.runByName}` : ''}
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">Not run yet.</p>
            )}
          </div>
          <button
            type="button"
            onClick={runAnalysis}
            disabled={running}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {run ? 'Run it again' : 'Run the analysis'}
          </button>
        </div>

        {progress && (
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="flex items-center gap-2 text-xs font-semibold text-blue-900">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Analysed {progress.analysed} section(s), {progress.remaining} to go
              {progress.costCents > 0 && ` · ${money(progress.costCents)} so far`}
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-blue-200">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{
                  width: `${Math.round(
                    (progress.analysed / Math.max(1, progress.analysed + progress.remaining)) * 100,
                  )}%`,
                }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-blue-800">
              It runs a few sections at a time and keeps what it has done, so leaving this
              page does not waste anything — come back and press Run to carry on.
            </p>
          </div>
        )}

        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-600">
          <CircleDollarSign className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            This sends the policy text and the committee&rsquo;s responses to Anthropic and
            costs real money, so it only runs when you press the button. Reviewers are
            identified by <strong>role and unit only — no names are sent</strong>. There is no
            patient data in this module. A run is refused before anything is sent if it would
            cost more than the configured ceiling.
            {run?.costCents != null && (
              <> The last run cost about <strong>{money(run.costCents)}</strong>
                {run.inputTokens != null && ` (${run.inputTokens.toLocaleString()} in, ${(run.outputTokens ?? 0).toLocaleString()} out)`}.
              </>
            )}
          </span>
        </p>

        {run?.status === 'FAILED_VALIDATION' && (
          <div className="mt-3 rounded-lg border-2 border-rose-300 bg-rose-50 p-3">
            <p className="flex items-center gap-1.5 text-sm font-bold text-rose-900">
              <ShieldAlert className="h-4 w-4" />
              This run was refused, and nothing from it is shown as a finding
            </p>
            <p className="mt-1 text-xs text-rose-900">{run.validationErrors?.message}</p>
            {run.validationErrors?.violations && run.validationErrors.violations.length > 0 && (
              <ul className="mt-2 max-h-56 list-disc space-y-1 overflow-y-auto pl-5 text-[11px] text-rose-900">
                {run.validationErrors.violations.map((v, i) => (
                  <li key={i}>
                    {v.where ? <strong>{v.where}: </strong> : null}
                    {v.detail}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {run?.status === 'FAILED_API' && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <strong>The run did not complete. </strong>
            {run.validationErrors?.message}
          </div>
        )}

        {run?.output?.corrections && run.output.corrections.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-bold text-amber-900">
              {run.output.corrections.length} change(s) were flagged for clinical review
              automatically
            </p>
            <p className="mt-1 text-[11px] text-amber-900">
              Either they rest on a response that raised a patient-safety concern, or their
              wording touches a clinical provision. The flag was added by ORM, not by the model.
            </p>
          </div>
        )}
      </section>

      {/* ── Synthesis ───────────────────────────────────────────────────── */}
      {run?.status === 'VALIDATED' && synthesis && (
        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold text-slate-900">Synthesis</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Drafted by the model from findings already checked against the responses. A
            recommendation to the committee, not a decision.
          </p>

          {synthesis.executive_summary && (
            <div className="mt-3 rounded-lg bg-slate-50 p-3">
              <PolicyMarkdown markdown={synthesis.executive_summary} highlightPlaceholders={false} />
            </div>
          )}

          {!!synthesis.critical_concerns?.length && (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p className="text-xs font-bold text-rose-900">Critical concerns</p>
              <ul className="mt-1 space-y-1 text-xs text-rose-900">
                {synthesis.critical_concerns.map((c, i) => (
                  <li key={i}>
                    <strong>{c.type.replace(/_/g, ' ')}</strong>
                    {c.section_id ? ` (${labelOf(c.section_id)})` : ''} — {c.summary}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {!!synthesis.areas_of_agreement?.length && (
              <Panel title="Agreed">
                {synthesis.areas_of_agreement.map((a, i) => <li key={i}>{a}</li>)}
              </Panel>
            )}
            {!!synthesis.contested_issues?.length && (
              <Panel title="Contested">
                {synthesis.contested_issues.map((c, i) => <li key={i}>{c.summary}</li>)}
              </Panel>
            )}
            {!!run.output?.crossSection?.inconsistencies?.length && (
              <Panel title="Internal inconsistencies">
                {run.output.crossSection.inconsistencies.map((c, i) => <li key={i}>{c.summary}</li>)}
              </Panel>
            )}
            {!!synthesis.for_the_meeting?.length && (
              <Panel title="For the meeting">
                {synthesis.for_the_meeting.map((f, i) => <li key={i}>{f}</li>)}
              </Panel>
            )}
          </div>

          {!!synthesis.unit_barriers?.length && (
            <div className="mt-3">
              <p className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Users className="h-3.5 w-3.5" />
                What each unit said it would need
              </p>
              <ul className="mt-1 space-y-1 text-xs text-slate-700">
                {synthesis.unit_barriers.map((u, i) => (
                  <li key={i}>
                    <strong>{u.unit}</strong> — {u.barrier}
                    {u.resources_needed ? <em className="text-slate-500"> Needs: {u.resources_needed}</em> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ── Tracked changes ─────────────────────────────────────────────── */}
      {changes.length > 0 && (
        <section className="mt-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Proposed changes
            </h2>
            <p className="text-[11px] text-slate-500">
              {counted('ACCEPTED') + counted('EDITED')} accepted · {counted('REJECTED')} rejected
              {' · '}{counted('FOR_COMMITTEE')} for the meeting · {counted('PENDING')} undecided
            </p>
          </div>

          <ul className="space-y-3">
            {changes.map((change) => {
              const supporting = Array.isArray(change.supportingResponseIds)
                ? (change.supportingResponseIds as string[])
                : [];
              const isEditing = editing[change.id] !== undefined;

              return (
                <li
                  key={change.id}
                  className={`rounded-xl border-2 bg-white p-4 ${DECISION_TONE[change.ownerDecision]}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                      {change.type}
                    </span>
                    <span className="text-xs font-semibold text-slate-900">
                      {labelOf(change.sectionId)}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                      {change.supportStrength.toLowerCase()} support
                    </span>
                    {change.clinicalReviewRequired && (
                      <span className="flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                        <ShieldAlert className="h-3 w-3" />
                        clinical review required
                      </span>
                    )}
                    {change.ownerDecision !== 'PENDING' && (
                      <span className="ml-auto text-[10px] font-semibold text-slate-500">
                        {change.ownerDecision.replace(/_/g, ' ').toLowerCase()}
                        {change.decidedByName ? ` · ${change.decidedByName}` : ''}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                      <p className="mb-1 text-[10px] font-bold uppercase text-slate-500">
                        As it stands
                      </p>
                      <p className="whitespace-pre-wrap text-xs text-slate-700">
                        {change.currentText ?? <em className="text-slate-400">(new text)</em>}
                      </p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2.5">
                      <p className="mb-1 text-[10px] font-bold uppercase text-emerald-700">
                        Proposed
                      </p>
                      <p className="whitespace-pre-wrap text-xs text-slate-800">
                        {change.editedText ?? change.proposedText}
                      </p>
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-slate-600">
                    <strong className="text-slate-800">Why: </strong>{change.rationale}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Traced to {supporting.length} response{supporting.length === 1 ? '' : 's'} on
                    file — every one checked to exist before this run was accepted.
                  </p>

                  {isEditing && (
                    <div className="mt-2">
                      <textarea
                        value={editing[change.id]}
                        onChange={(e) => setEditing((p) => ({ ...p, [change.id]: e.target.value }))}
                        rows={4}
                        className="w-full rounded-lg border border-blue-300 p-2.5 text-xs"
                        placeholder="Your wording, which is what goes into the policy."
                      />
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => decide(change, 'ACCEPTED')}
                      disabled={busyId === change.id}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Accept
                    </button>
                    {isEditing ? (
                      <button
                        type="button"
                        onClick={() => decide(change, 'EDITED')}
                        disabled={busyId === change.id}
                        className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Accept my wording
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditing((p) => ({
                          ...p,
                          [change.id]: change.editedText ?? change.proposedText,
                        }))}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit then accept
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => decide(change, 'FOR_COMMITTEE')}
                      disabled={busyId === change.id}
                      className="flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 disabled:opacity-50"
                    >
                      <Gavel className="h-3.5 w-3.5" />
                      For the meeting
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(change, 'REJECTED')}
                      disabled={busyId === change.id}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-50"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      Reject
                    </button>
                    {change.ownerDecision !== 'PENDING' && (
                      <button
                        type="button"
                        onClick={() => decide(change, 'PENDING')}
                        disabled={busyId === change.id}
                        className="text-xs font-medium text-slate-500 underline"
                      >
                        undo
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Agenda for the meeting ──────────────────────────────────────── */}
      {counted('FOR_COMMITTEE') > 0 && (
        <section className="mt-5 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-violet-900">
            <Gavel className="h-4 w-4" />
            Agenda for the committee meeting
          </h2>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs text-violet-900">
            {changes.filter((c) => c.ownerDecision === 'FOR_COMMITTEE').map((c) => (
              <li key={c.id}>
                <strong>{labelOf(c.sectionId)}</strong> — {c.rationale}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ── Generate + export ───────────────────────────────────────────── */}
      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
          <FileCheck2 className="h-4 w-4" />
          The revised policy
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          Built from the changes you accepted, and nothing else, with a change log linking each
          one to the responses behind it.
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="text-xs font-semibold text-slate-700">Version</span>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="mt-1 w-24 rounded-lg border border-slate-300 p-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => generate(false)}
            disabled={generating}
            className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
            Generate
          </button>
          <button
            type="button"
            onClick={() => generate(true)}
            disabled={generating}
            className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-60"
          >
            <Check className="h-4 w-4" />
            Generate and approve
          </button>
        </div>

        {generated && generated.unapplied > 0 && (
          <div className="mt-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-3">
            <p className="text-xs font-bold text-amber-900">
              {generated.unapplied} accepted change(s) could not be applied automatically
            </p>
            <p className="mt-1 text-[11px] text-amber-900">
              The wording they replace is no longer in the section — most likely it was edited
              after the analysis ran. They are listed in the change log of the exported document
              and must be put in by hand <strong>before this goes to Management</strong>.
            </p>
          </div>
        )}

        {/*
          Markdown AND pdf, from one set of figures.

          Markdown is what the next draft is written from -- it diffs and it
          pastes. It is the wrong thing to hand a Chief Medical Director, so the
          same document is also drawn on the hospital letterhead. The PDF is
          built in the browser from `as=json` because jsPDF's default export is
          not a constructor under Node; see src/lib/policy/synthesisPdf.ts.
        */}
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Download
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void downloadSynthesisPdf()}
              disabled={pdfBusy}
              className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              <FileText className="h-3.5 w-3.5" />
              {pdfBusy ? 'Building…' : 'Synthesis (PDF)'}
            </button>
            {[
              ['synthesis', 'Synthesis (Markdown)'],
              ['final', 'Revised policy + change log (Markdown)'],
              ['roster', 'Participation roster (Markdown)'],
              ['responses', 'All responses (CSV)'],
            ].map(([format, label]) => (
              <a
                key={format}
                href={`/api/policy/rounds/${params.id}/export?format=${format}`}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                <Download className="h-3.5 w-3.5" />
                {label}
              </a>
            ))}
            <a
              href={`/api/policy/rounds/${params.id}/export?format=roster&as=csv`}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              <Download className="h-3.5 w-3.5" />
              Participation roster (CSV)
            </a>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Every download names each invited member and how far they got, and is
            recorded in the audit trail.
          </p>
          {pdfError && (
            <p className="mt-2 text-[11px] font-medium text-rose-700">{pdfError}</p>
          )}
        </div>
      </section>

      {/*
        Signatures on the revised policy.

        The round used to end at a recommendation nobody had endorsed, with the
        endorsement happening in a WhatsApp thread. Only the members who
        SUBMITTED a review are asked: a signature list padded with people who
        never opened the draft tells Management the committee agreed when most
        of it never looked.
      */}
      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
          <PenLine className="h-4 w-4" />
          Signatures on the revised policy
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          {signSentence || 'Nobody has been asked to sign this document yet.'}
        </p>

        {newSignLinks && newSignLinks.length > 0 && (
          <div className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
            <p className="flex items-center gap-2 text-xs font-bold text-amber-900">
              <ShieldAlert className="h-4 w-4" />
              Copy these links now — they cannot be shown again
            </p>
            <ul className="mt-2 space-y-2">
              {newSignLinks.map((l) => (
                <li key={l.signoffId} className="rounded-lg border border-amber-200 bg-white p-2">
                  <p className="text-xs font-semibold text-slate-900">{l.signerName}</p>
                  {l.alreadySent ? (
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Already has a signing link — no second one was created.
                    </p>
                  ) : (
                    <>
                      <p className="mt-0.5 break-all font-mono text-[10px] text-slate-600">{l.url}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => void copySign(l.url, `u-${l.signoffId}`)}
                          className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[10px] font-medium"
                        >
                          {copiedSign === `u-${l.signoffId}` ? <Check className="h-3 w-3" /> : <ClipboardCopy className="h-3 w-3" />}
                          Copy link
                        </button>
                        <button
                          type="button"
                          onClick={() => void copySign(l.message, `m-${l.signoffId}`)}
                          className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[10px] font-medium"
                        >
                          {copiedSign === `m-${l.signoffId}` ? <Check className="h-3 w-3" /> : <ClipboardCopy className="h-3 w-3" />}
                          Copy message
                        </button>
                        {l.whatsapp && (
                          <a
                            href={l.whatsapp}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white"
                          >
                            <Send className="h-3 w-3" />
                            Send on WhatsApp
                          </a>
                        )}
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setNewSignLinks(null)}
              className="mt-2 text-[11px] font-semibold text-amber-900 underline"
            >
              I have copied them
            </button>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void sendForSignature()}
            disabled={signBusy || signEligible === 0}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            <PenLine className="h-3.5 w-3.5" />
            {signBusy ? 'Working…' : 'Send for signature'}
          </button>
          {signMissing > 0 && signoffs.length > 0 && (
            <span className="text-[11px] font-medium text-amber-800">
              {signMissing} participant(s) submitted later and have no link yet.
            </span>
          )}
          {signEligible === 0 && (
            <span className="text-[11px] text-slate-500">
              Nobody has submitted a review, so there is nobody to ask.
            </span>
          )}
        </div>

        {signError && (
          <p className="mt-2 text-[11px] font-medium text-rose-700">{signError}</p>
        )}

        {signoffs.length > 0 && (
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Participant</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">State</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700">Link</th>
                </tr>
              </thead>
              <tbody>
                {signoffs.map((sg) => (
                  <tr key={sg.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-900">{sg.signerName}</p>
                      {(sg.signerRole || sg.signerUnit) && (
                        <p className="text-[11px] text-slate-500">
                          {[sg.signerRole, sg.signerUnit].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {/*
                        STALE is called out in amber rather than folded into
                        "signed": it is the one state that looks like agreement
                        and is not. They signed words that have since changed.
                      */}
                      <span
                        className={
                          sg.standing === 'SIGNED' ? 'font-medium text-emerald-700'
                            : sg.standing === 'STALE' ? 'font-medium text-amber-800'
                              : sg.standing === 'WITHDRAWN' ? 'text-rose-700'
                                : 'text-slate-500'
                        }
                      >
                        {sg.standingLabel}
                      </span>
                      {sg.signedName && (
                        <p className="text-[11px] text-slate-500">as {sg.signedName}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => void changeSignoff(sg.id, 'reissue')}
                          disabled={signBusy}
                          className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[10px] font-medium text-slate-700 disabled:opacity-50"
                          title="Issue a new link. Any signature already given is kept."
                        >
                          <KeyRound className="h-3 w-3" />
                          New link
                        </button>
                        {sg.revokedAt ? (
                          <button
                            type="button"
                            onClick={() => void changeSignoff(sg.id, 'restore')}
                            disabled={signBusy}
                            className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[10px] font-medium text-slate-700 disabled:opacity-50"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Restore
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void changeSignoff(sg.id, 'revoke')}
                            disabled={signBusy}
                            className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[10px] font-medium text-rose-700 disabled:opacity-50"
                          >
                            <Ban className="h-3 w-3" />
                            Withdraw
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!run && (
        <p className="mt-5 rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500">
          Nothing has been analysed yet. Close the round, or run the analysis on what has come
          in so far — you can run it again afterwards and each run is kept.
        </p>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-bold text-slate-800">{title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-slate-700">{children}</ul>
    </div>
  );
}
