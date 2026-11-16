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
  Gavel,
  Loader2,
  Pencil,
  ShieldAlert,
  Sparkles,
  Users,
} from 'lucide-react';

import PolicyMarkdown from '@/components/policy/PolicyMarkdown';

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
  const [editing, setEditing] = useState<Record<string, string>>({});
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

  const runAnalysis = async () => {
    setRunning(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/policy/rounds/${params.id}/analysis`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? 'The analysis could not be run.');
        return;
      }
      setNotice(body.message ?? null);
      if (body.status !== 'VALIDATED') setError(body.message ?? 'The analysis was refused.');
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

        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {[
            ['final', 'Revised policy + change log'],
            ['synthesis', 'Synthesis report'],
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
        </div>
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
