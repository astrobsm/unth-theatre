'use client';

/**
 * The committee member's review, section by section, on a phone.
 *
 * WHERE THIS PAGE LIVES AND WHY. Outside /dashboard, like /onboarding and
 * /feedback, because most of this committee are heads of department with no ORM
 * account. The link arrives in WhatsApp and must open without a sign-in;
 * /dashboard/policy-review is the Chairman's side and is gated to him.
 *
 * NOTHING IS LOST, WHICH IS THE WHOLE POINT
 *
 * A member opens the link between cases, answers six sections, is called away,
 * and finishes on a desktop two days later. Three things make that work, and
 * only the first one actually matters:
 *
 *   1. EVERY ANSWER IS SAVED TO THE SERVER as it is given -- a stance the
 *      moment it is tapped, text a second after typing stops. The response row
 *      exists with submittedAt still null, so progress is a fact in the
 *      database, not in this browser. That is what lets the review resume on a
 *      different device, which a localStorage draft could never do.
 *   2. THE STEP IS SAVED TOO, by its stable id, and flushed on
 *      `visibilitychange` with sendBeacon -- the one request that survives
 *      Android reclaiming the tab while they are in WhatsApp.
 *   3. useFormDraft covers only the gap between a keystroke and a successful
 *      save, for when the connection drops mid-sentence.
 *
 * It never reopens at section 1 when there is progress. The server decides
 * where they resume (resolveCursor), not this page.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  Loader2,
  ListChecks,
  Send,
} from 'lucide-react';

import PolicyMarkdown from '@/components/policy/PolicyMarkdown';
import { useFormDraft } from '@/lib/useFormDraft';
import {
  GENERAL_STEP_ID,
  REVIEW_STEP_ID,
  isStepComplete,
  policyProgress,
  type PolicyStep,
} from '@/lib/policy/steps';

// ── The shapes the API sends ───────────────────────────────────────────────

type Stance = 'AGREE' | 'AGREE_WITH_CHANGES' | 'DISAGREE' | 'NOT_MY_AREA';

interface DecisionItem {
  id: string;
  placeholder: string;
  surroundingSentence: string;
  type: string;
  currentValue: string;
  options: unknown;
}

interface Section {
  id: string;
  number: string | null;
  title: string;
  parentId: string | null;
  order: number;
  isAppendix: boolean;
  body: string;
  decisionItems: DecisionItem[];
}

interface ReviewState {
  ok: true;
  round: { id: string; title: string | null; version: string; closesAt: string; status: string };
  document: { title: string; version: string } | null;
  reviewer: {
    name: string;
    submittedAt: string | null;
    selfEnrolled: boolean;
    invitationId: string;
  };
  sections: Section[];
  steps: PolicyStep[];
  cursor: { index: number; stepId: string; reason: string };
  progress: { done: number; total: number; percent: number; sectionsAnswered: number; sectionsTotal: number };
  sectionResponses: Array<{
    sectionId: string;
    stance: Stance;
    comment: string | null;
    proposedWording: string | null;
    concernType: string | null;
    priority: string | null;
  }>;
  itemResponses: Array<{
    decisionItemId: string;
    acceptsCurrent: boolean;
    proposedValue: string | null;
    reason: string | null;
  }>;
  general: GeneralAnswer | null;
}

interface Refusal { ok: false; problem: string; message: string }

/**
 * The verdict, as a heading.
 *
 * Written for somebody holding a phone in a corridor, not for the developer
 * who knows what NOT_FOUND means.
 */
const REFUSAL_TITLE: Record<string, string> = {
  NOT_FOUND: 'We do not recognise this link',
  REVOKED: 'This link has been withdrawn',
  EXPIRED: 'The review has closed',
  ROUND_NOT_OPEN: 'The review has not opened yet',
  SIGN_IN_REQUIRED: 'Please sign in to continue',
};

interface SectionAnswer {
  stance: Stance | null;
  comment: string;
  proposedWording: string;
  concernType: string;
  priority: string;
}

interface ItemAnswer {
  acceptsCurrent: boolean | null;
  proposedValue: string;
  reason: string;
}

interface GeneralAnswer {
  overallSupport: number | null;
  concern1: string | null;
  concern2: string | null;
  concern3: string | null;
  barriers: string | null;
  resourcesNeeded: string | null;
  otherComments: string | null;
}

interface Receipt {
  submittedAt: string;
  reviewerName: string;
  policyTitle: string | null;
  version: string;
  sectionsAnswered: number;
  decisionItemsAnswered: number;
  sectionsTotal: number;
  complete: boolean;
  reference: string;
}

const EMPTY_SECTION: SectionAnswer = {
  stance: null, comment: '', proposedWording: '', concernType: '', priority: '',
};
const EMPTY_ITEM: ItemAnswer = { acceptsCurrent: null, proposedValue: '', reason: '' };
const EMPTY_GENERAL: GeneralAnswer = {
  overallSupport: null, concern1: '', concern2: '', concern3: '',
  barriers: '', resourcesNeeded: '', otherComments: '',
};

const STANCES: Array<{ value: Stance; label: string; tone: string }> = [
  { value: 'AGREE', label: 'Agree', tone: 'border-emerald-300 bg-emerald-50 text-emerald-900' },
  { value: 'AGREE_WITH_CHANGES', label: 'Agree with changes', tone: 'border-amber-300 bg-amber-50 text-amber-900' },
  { value: 'DISAGREE', label: 'Disagree', tone: 'border-rose-300 bg-rose-50 text-rose-900' },
  { value: 'NOT_MY_AREA', label: 'Not my area', tone: 'border-slate-300 bg-slate-100 text-slate-700' },
];

const CONCERNS: Array<{ value: string; label: string }> = [
  { value: 'PATIENT_SAFETY', label: 'Patient safety' },
  { value: 'FEASIBILITY', label: 'Not workable as written' },
  { value: 'RESOURCES', label: 'Staff, equipment or money' },
  { value: 'LEGAL_OR_DISCIPLINARY', label: 'Legal or disciplinary fairness' },
  { value: 'CLARITY', label: 'Unclear wording' },
  { value: 'OTHER', label: 'Something else' },
];

const DEBOUNCE_MS = 900;

const formatDeadline = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Lagos',
  }).format(new Date(iso));

const timeOnly = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Lagos',
  }).format(new Date(iso));

export default function PolicyReviewPage() {
  const [query, setQuery] = useState<string | null>(null);
  const [state, setState] = useState<ReviewState | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [failed, setFailed] = useState(false);

  const [stepIndex, setStepIndex] = useState(0);
  const [resumeNotice, setResumeNotice] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  const [answers, setAnswers] = useState<Record<string, SectionAnswer>>({});
  const [items, setItems] = useState<Record<string, ItemAnswer>>({});
  const [general, setGeneral] = useState<GeneralAnswer>(EMPTY_GENERAL);

  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const idempotencyKey = useRef<string>('');

  // ── The link's own identity ──────────────────────────────────────────────
  // Read from window.location rather than useSearchParams, which would need a
  // Suspense boundary on a page that must render instantly on a weak phone.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('t');
    const round = params.get('round');
    setQuery(token ? `?t=${encodeURIComponent(token)}` : round ? `?round=${encodeURIComponent(round)}` : '');
    idempotencyKey.current = `pr-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }, []);

  // ── Load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (query === null) return;
    if (query === '') {
      setRefusal({
        ok: false,
        problem: 'NOT_FOUND',
        message:
          'This page needs the review link that was sent to you. Please open the '
          + 'whole link from your message — the entire line, up to the end.',
      });
      return;
    }

    let live = true;
    (async () => {
      try {
        const res = await fetch(`/api/policy/review${query}`, { cache: 'no-store' });
        const data = await res.json();
        if (!live) return;

        if (data?.ok !== true) {
          setRefusal(data as Refusal);
          return;
        }

        const loaded = data as ReviewState;
        setState(loaded);
        setAnswers(Object.fromEntries(loaded.sectionResponses.map((r) => [r.sectionId, {
          stance: r.stance,
          comment: r.comment ?? '',
          proposedWording: r.proposedWording ?? '',
          concernType: r.concernType ?? '',
          priority: r.priority ?? '',
        }])));
        setItems(Object.fromEntries(loaded.itemResponses.map((r) => [r.decisionItemId, {
          acceptsCurrent: r.acceptsCurrent,
          proposedValue: r.proposedValue ?? '',
          reason: r.reason ?? '',
        }])));
        if (loaded.general) setGeneral({ ...EMPTY_GENERAL, ...loaded.general });

        // THE SERVER DECIDES WHERE THEY RESUME. This page does not second-guess
        // it, because the one bug that matters here is reopening at section 1
        // for somebody who has already answered six.
        setStepIndex(loaded.cursor.index);
        if (loaded.progress.done > 0 || loaded.cursor.reason === 'saved') {
          if (loaded.cursor.reason === 'step-missing') {
            setResumeNotice(
              `Welcome back. You have answered ${loaded.progress.sectionsAnswered} of `
              + `${loaded.progress.sectionsTotal} sections. The section you stopped on has `
              + 'changed since, so we have taken you to the next one you have not answered.',
            );
          } else if (loaded.cursor.reason === 'complete') {
            setResumeNotice('Welcome back. You have answered every section — this is the summary.');
          } else if (loaded.progress.done > 0) {
            setResumeNotice(
              `Welcome back. You have answered ${loaded.progress.sectionsAnswered} of `
              + `${loaded.progress.sectionsTotal} sections, and we have taken you back to `
              + 'where you stopped.',
            );
          }
        }
      } catch {
        if (live) setFailed(true);
      }
    })();

    return () => { live = false; };
  }, [query]);

  // Memoised, not `state?.steps ?? []`. That expression hands back a NEW empty
  // array on every render, which re-ran the cursor memo, the navigation
  // callback and -- the one that actually matters -- the effect that attaches
  // the visibilitychange listener. A listener torn down and re-added on every
  // keystroke is a listener that may not be there when the tab is reclaimed,
  // which is precisely the moment the step cursor needs flushing.
  const steps = useMemo(() => state?.steps ?? [], [state]);
  const step = steps[stepIndex];
  const sectionsById = useMemo(
    () => Object.fromEntries((state?.sections ?? []).map((s) => [s.id, s])),
    [state],
  );
  const answeredIds = useMemo(
    () => new Set(Object.entries(answers).filter(([, a]) => a.stance !== null).map(([id]) => id)),
    [answers],
  );
  const progress = useMemo(
    () => (steps.length ? policyProgress(steps, answeredIds) : null),
    [steps, answeredIds],
  );

  // ── Saving ───────────────────────────────────────────────────────────────

  const send = useCallback(async (payload: unknown) => {
    if (!query) return;
    setSaving((n) => n + 1);
    try {
      const res = await fetch(`/api/policy/review${query}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data?.ok === false && data?.message) {
        // The round closed while they were typing. Said in words.
        setRefusal(data as Refusal);
        return;
      }
      if (!res.ok) {
        setSaveError('Not saved — check your connection. Your typing is kept on this phone.');
        return;
      }
      setSaveError(null);
      setSavedAt(data?.savedAt ?? new Date().toISOString());
    } catch {
      setSaveError('Not saved — check your connection. Your typing is kept on this phone.');
    } finally {
      setSaving((n) => Math.max(0, n - 1));
    }
  }, [query]);

  /** Debounced per field, so typing a paragraph is one write, not forty. */
  const queueSave = useCallback((key: string, payload: unknown) => {
    if (timers.current[key]) clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => { void send(payload); }, DEBOUNCE_MS);
  }, [send]);

  /** Immediate, for a tap: a stance is the thing that marks progress. */
  const saveNow = useCallback((key: string, payload: unknown) => {
    if (timers.current[key]) clearTimeout(timers.current[key]);
    void send(payload);
  }, [send]);

  const sectionPayload = (sectionId: string, a: SectionAnswer) => ({
    kind: 'section' as const,
    sectionId,
    stance: a.stance,
    comment: a.comment || null,
    proposedWording: a.proposedWording || null,
    concernType: a.concernType || null,
    priority: a.priority || null,
  });

  const setSection = (sectionId: string, patch: Partial<SectionAnswer>, immediate = false) => {
    setAnswers((prev) => {
      const next = { ...(prev[sectionId] ?? EMPTY_SECTION), ...patch };
      const updated = { ...prev, [sectionId]: next };
      if (next.stance) {
        const payload = sectionPayload(sectionId, next);
        if (immediate) saveNow(`s:${sectionId}`, payload);
        else queueSave(`s:${sectionId}`, payload);
      }
      return updated;
    });
  };

  const setItem = (itemId: string, patch: Partial<ItemAnswer>, immediate = false) => {
    setItems((prev) => {
      const next = { ...(prev[itemId] ?? EMPTY_ITEM), ...patch };
      const updated = { ...prev, [itemId]: next };
      if (next.acceptsCurrent !== null) {
        const payload = {
          kind: 'item' as const,
          decisionItemId: itemId,
          acceptsCurrent: next.acceptsCurrent,
          proposedValue: next.proposedValue || null,
          reason: next.reason || null,
        };
        if (immediate) saveNow(`i:${itemId}`, payload);
        else queueSave(`i:${itemId}`, payload);
      }
      return updated;
    });
  };

  const setGeneralField = (patch: Partial<GeneralAnswer>, immediate = false) => {
    setGeneral((prev) => {
      const next = { ...prev, ...patch };
      const payload = { kind: 'general' as const, ...next };
      if (immediate) saveNow('g', payload);
      else queueSave('g', payload);
      return next;
    });
  };

  // ── The step cursor ──────────────────────────────────────────────────────

  const goTo = useCallback((index: number) => {
    const target = Math.max(0, Math.min(index, steps.length - 1));
    setStepIndex(target);
    setNavOpen(false);
    setResumeNotice(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    const id = steps[target]?.id;
    if (id && query) void send({ kind: 'cursor', stepId: id });
  }, [steps, query, send]);

  /**
   * Flush the cursor when the tab goes away.
   *
   * `visibilitychange` and not `beforeunload`: on the handsets this hospital
   * runs on, a member switching to WhatsApp to check a folder number may never
   * get an unload event at all, because Android simply reclaims the tab.
   * sendBeacon is the only request that survives it.
   */
  useEffect(() => {
    if (!query || !steps.length) return;
    const flush = () => {
      if (document.visibilityState !== 'hidden') return;
      const id = steps[stepIndex]?.id;
      if (!id) return;
      const body = JSON.stringify({ kind: 'cursor', stepId: id });
      try {
        navigator.sendBeacon(
          `/api/policy/review${query}`,
          new Blob([body], { type: 'application/json' }),
        );
      } catch {
        // Nothing to do. The server still has every answer; only the place in
        // the list is at risk, and resolveCursor resolves forward anyway.
      }
    };
    document.addEventListener('visibilitychange', flush);
    return () => document.removeEventListener('visibilitychange', flush);
  }, [query, steps, stepIndex]);

  // Unsent keystrokes, for a connection that drops mid-sentence. Scoped to the
  // invitation, so a draft is never restored to whoever picks up the handset
  // next -- ten staff share eight devices here.
  useFormDraft({
    key: `policyReview.${state?.round.id ?? 'none'}`,
    version: 1,
    userId: state?.reviewer.invitationId ?? null,
    value: { answers, items, general },
    ready: state !== null,
    onRestore: (saved) => {
      if (!saved) return;
      setAnswers((prev) => ({ ...saved.answers, ...prev }));
      setItems((prev) => ({ ...saved.items, ...prev }));
      setGeneral((prev) => ({ ...saved.general, ...prev }));
    },
  });

  const submit = async () => {
    if (!query) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/policy/review/submit${query}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: idempotencyKey.current }),
      });
      const data = await res.json();
      if (data?.ok !== true) {
        setSaveError(data?.message ?? 'Could not record your submission.');
        return;
      }
      setReceipt(data as Receipt);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
    } catch {
      setSaveError('Could not reach ORM. Your answers are saved; try Submit again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Screens ──────────────────────────────────────────────────────────────

  if (failed) {
    return (
      <Shell>
        <Notice tone="rose" icon={<AlertTriangle className="h-5 w-5" />} title="ORM could not be reached">
          Please check your connection and reload. Nothing you have already sent is lost.
        </Notice>
      </Shell>
    );
  }

  if (refusal) {
    return (
      <Shell>
        {/*
          The heading names the problem. It used to read just "This review
          link", which says nothing and leaves somebody standing in a
          corridor on mobile data to parse a paragraph for the verdict.
        */}
        <Notice
          tone="amber"
          icon={<AlertTriangle className="h-5 w-5" />}
          title={REFUSAL_TITLE[refusal.problem] ?? 'This review link cannot be opened'}
        >
          {refusal.message}
          {refusal.problem === 'NOT_FOUND' && (
            <p className="mt-2 font-medium">
              If more than one link has been sent to you, please open the one from the
              most recent message — an earlier link stops working as soon as a new one
              is issued.
            </p>
          )}
        </Notice>
      </Shell>
    );
  }

  if (!state || !progress) {
    return (
      <Shell>
        <div className="flex items-center gap-3 py-16 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Opening your review…</span>
        </div>
      </Shell>
    );
  }

  if (receipt) return <Shell><ReceiptCard receipt={receipt} /></Shell>;

  const title = state.document?.title ?? state.round.title ?? 'Theatre policy review';

  return (
    <Shell>
      {/* Sticky header: where they are, and that it is saved. */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-900">{title}</p>
            <p className="text-[11px] text-slate-500">
              {progress.sectionsAnswered} of {progress.sectionsTotal} sections answered
            </p>
          </div>
          <SaveBadge saving={saving > 0} savedAt={savedAt} error={saveError} />
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-blue-600 transition-all"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </div>

      {resumeNotice && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
          <p className="text-xs leading-relaxed text-blue-900">{resumeNotice}</p>
        </div>
      )}

      {saveError && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {saveError}
        </div>
      )}

      {/* The navigator: answer in any order, skip what is not yours. */}
      <button
        type="button"
        onClick={() => setNavOpen((o) => !o)}
        className="mt-3 flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <ListChecks className="h-4 w-4" />
          Jump to a section
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-500 transition ${navOpen ? 'rotate-180' : ''}`} />
      </button>

      {navOpen && (
        <ol className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {steps.map((s, i) => {
            const done = s.kind === 'section' && isStepComplete(s, answeredIds);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => goTo(i)}
                  className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs ${
                    i === stepIndex ? 'bg-blue-50 font-semibold text-blue-900' : 'text-slate-700'
                  }`}
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                    done ? 'border-emerald-400 bg-emerald-100 text-emerald-700' : 'border-slate-300 text-slate-400'
                  }`}>
                    {done ? <Check className="h-3 w-3" /> : i}
                  </span>
                  <span className="truncate">{s.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <div className="pb-24 pt-4">
        {step?.kind === 'welcome' && (
          <Welcome
            title={title}
            version={state.round.version}
            closesAt={state.round.closesAt}
            reviewerName={state.reviewer.name}
            sections={progress.sectionsTotal}
            onStart={() => goTo(1)}
          />
        )}

        {step?.kind === 'section' && step.sectionId && (
          <SectionStep
            step={step}
            sectionsById={sectionsById as Record<string, Section>}
            answers={answers}
            items={items}
            onSection={setSection}
            onItem={setItem}
          />
        )}

        {step?.id === GENERAL_STEP_ID && (
          <GeneralStep value={general} onChange={setGeneralField} />
        )}

        {step?.id === REVIEW_STEP_ID && (
          <SummaryStep
            steps={steps}
            answeredIds={answeredIds}
            progress={progress}
            answers={answers}
            sectionsById={sectionsById as Record<string, Section>}
            alreadySubmitted={state.reviewer.submittedAt}
            submitting={submitting}
            onJump={goTo}
            onSubmit={submit}
          />
        )}
      </div>

      {/* Sticky footer: big targets, reachable with a thumb. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <button
            type="button"
            onClick={() => goTo(stepIndex - 1)}
            disabled={stepIndex === 0}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="flex-1 text-center text-[11px] text-slate-500">
            Step {stepIndex} of {steps.length - 1}
          </div>
          {stepIndex < steps.length - 1 ? (
            <button
              type="button"
              onClick={() => goTo(stepIndex + 1)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Submit
            </button>
          )}
        </div>
      </div>
    </Shell>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-4">{children}</div>
    </main>
  );
}

function Notice({
  tone, icon, title, children,
}: {
  tone: 'amber' | 'rose' | 'blue';
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const tones = {
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    rose: 'border-rose-200 bg-rose-50 text-rose-900',
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
  };
  return (
    <div className={`mt-8 rounded-xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-2 font-semibold">
        {icon}
        {title}
      </div>
      <p className="mt-2 text-sm leading-relaxed">{children}</p>
    </div>
  );
}

function SaveBadge({ saving, savedAt, error }: { saving: boolean; savedAt: string | null; error: string | null }) {
  if (error) return <span className="shrink-0 text-[11px] font-medium text-amber-700">Not saved</span>;
  if (saving) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px] text-slate-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving
      </span>
    );
  }
  if (savedAt) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-700">
        <Check className="h-3 w-3" />
        Saved {timeOnly(savedAt)}
      </span>
    );
  }
  return null;
}

function Welcome({
  title, version, closesAt, reviewerName, sections, onStart,
}: {
  title: string; version: string; closesAt: string; reviewerName: string;
  sections: number; onStart: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
        <FileText className="h-4 w-4" />
        Theatre Users Committee
      </div>
      <h1 className="mt-2 text-lg font-bold text-slate-900">{title}</h1>
      <p className="mt-1 text-xs text-slate-500">Version {version} · for {reviewerName}</p>

      <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-700">
        <p>
          Every theatre case in this hospital is booked, prepared and sometimes cancelled
          under this policy. Before it goes to Hospital Management, the committee is asking
          you to go through it section by section.
        </p>
        <p>
          There are <strong>{sections} sections</strong>. It takes about 20–30 minutes, and you
          are expected to <strong>skip anything outside your area</strong> — mark it
          &ldquo;Not my area&rdquo; and move on.
        </p>
        <p className="rounded-lg bg-slate-50 p-3 text-xs">
          <strong>You can stop whenever you like.</strong> Everything you answer is saved as you
          go, so you can close this and open the same link later — on this phone or any other —
          and carry on from where you stopped.
        </p>
        <p className="text-xs text-slate-600">
          Your responses are recorded <strong>under your name</strong>, with your role and unit,
          so the committee can tell which units raised what. They are used to produce the final
          recommendation to Management.
        </p>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <Clock className="h-4 w-4 shrink-0 text-amber-700" />
        <p className="text-xs font-medium text-amber-900">
          Closes {formatDeadline(closesAt)}
        </p>
      </div>

      <button
        type="button"
        onClick={onStart}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white"
      >
        Start the review
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function SectionStep({
  step, sectionsById, answers, items, onSection, onItem,
}: {
  step: PolicyStep;
  sectionsById: Record<string, Section>;
  answers: Record<string, SectionAnswer>;
  items: Record<string, ItemAnswer>;
  onSection: (id: string, patch: Partial<SectionAnswer>, immediate?: boolean) => void;
  onItem: (id: string, patch: Partial<ItemAnswer>, immediate?: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      {step.requires.map((sectionId) => {
        const section = sectionsById[sectionId];
        if (!section) return null;
        return (
          <SectionCard
            key={sectionId}
            section={section}
            answer={answers[sectionId] ?? EMPTY_SECTION}
            items={items}
            onSection={onSection}
            onItem={onItem}
          />
        );
      })}
    </div>
  );
}

function SectionCard({
  section, answer, items, onSection, onItem,
}: {
  section: Section;
  answer: SectionAnswer;
  items: Record<string, ItemAnswer>;
  onSection: (id: string, patch: Partial<SectionAnswer>, immediate?: boolean) => void;
  onItem: (id: string, patch: Partial<ItemAnswer>, immediate?: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  const wantsChange = answer.stance === 'AGREE_WITH_CHANGES' || answer.stance === 'DISAGREE';

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">
            {section.number ? `${section.number}. ` : ''}{section.title}
          </h2>
          {answer.stance && (
            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              Answered
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-1 text-[11px] font-medium text-blue-700"
        >
          {open ? 'Hide the text' : 'Show the text'}
        </button>

        {open && (
          <div className="mt-2 rounded-lg bg-slate-50 p-3">
            <PolicyMarkdown markdown={section.body} />
          </div>
        )}
      </div>

      <div className="space-y-3 p-4">
        <fieldset>
          <legend className="text-xs font-semibold text-slate-700">
            What do you say to this section?
          </legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {STANCES.map((s) => {
              const active = answer.stance === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => onSection(section.id, { stance: s.value }, true)}
                  className={`rounded-lg border px-3 py-2.5 text-xs font-medium transition ${
                    active ? `${s.tone} ring-2 ring-offset-1 ring-slate-400` : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        {answer.stance && answer.stance !== 'NOT_MY_AREA' && (
          <>
            <label className="block">
              <span className="text-xs font-semibold text-slate-700">
                Your comment <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <textarea
                value={answer.comment}
                onChange={(e) => onSection(section.id, { comment: e.target.value })}
                onBlur={() => onSection(section.id, {}, true)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm"
                placeholder="What works, what does not, and why."
              />
            </label>

            {wantsChange && (
              <>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-700">What kind of concern?</span>
                    <select
                      value={answer.concernType}
                      onChange={(e) => onSection(section.id, { concernType: e.target.value }, true)}
                      className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm"
                    >
                      <option value="">Choose…</option>
                      {CONCERNS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-700">How pressing?</span>
                    <select
                      value={answer.priority}
                      onChange={(e) => onSection(section.id, { priority: e.target.value }, true)}
                      className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm"
                    >
                      <option value="">Choose…</option>
                      <option value="HIGH">High — must be settled</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="LOW">Low</option>
                    </select>
                  </label>
                </div>

                {answer.concernType === 'PATIENT_SAFETY' && (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[11px] text-rose-900">
                    A patient-safety concern is reported to the committee on its own, even if you
                    are the only person who raises it. It is not averaged into a majority.
                  </p>
                )}

                <label className="block">
                  <span className="text-xs font-semibold text-slate-700">
                    Propose different wording <span className="font-normal text-slate-400">(optional)</span>
                  </span>
                  {answer.proposedWording === '' && section.body.trim() !== '' && (
                    <button
                      type="button"
                      onClick={() => onSection(section.id, { proposedWording: section.body }, true)}
                      className="mt-1 block text-[11px] font-medium text-blue-700"
                    >
                      Start from the current text
                    </button>
                  )}
                  <textarea
                    value={answer.proposedWording}
                    onChange={(e) => onSection(section.id, { proposedWording: e.target.value })}
                    onBlur={() => onSection(section.id, {}, true)}
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 font-mono text-xs"
                    placeholder="Write the section as you think it should read."
                  />
                </label>
              </>
            )}
          </>
        )}

        {section.decisionItems.length > 0 && answer.stance !== 'NOT_MY_AREA' && (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
            <p className="text-xs font-bold text-amber-900">
              {section.decisionItems.length} value{section.decisionItems.length === 1 ? '' : 's'} still
              to be settled in this section
            </p>
            {section.decisionItems.map((item) => (
              <DecisionItemCard
                key={item.id}
                item={item}
                answer={items[item.id] ?? EMPTY_ITEM}
                onItem={onItem}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function DecisionItemCard({
  item, answer, onItem,
}: {
  item: DecisionItem;
  answer: ItemAnswer;
  onItem: (id: string, patch: Partial<ItemAnswer>, immediate?: boolean) => void;
}) {
  const options = Array.isArray(item.options) ? (item.options as string[]) : null;

  return (
    <div className="rounded-lg border border-amber-200 bg-white p-3">
      <p className="text-[11px] leading-relaxed text-slate-600">
        &ldquo;{item.surroundingSentence}&rdquo;
      </p>
      <p className="mt-1.5 text-xs font-semibold text-slate-900">
        Proposed: <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">{item.currentValue}</span>
      </p>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => onItem(item.id, { acceptsCurrent: true }, true)}
          className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium ${
            answer.acceptsCurrent === true
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-200'
              : 'border-slate-200 text-slate-600'
          }`}
        >
          Accept
        </button>
        <button
          type="button"
          onClick={() => onItem(item.id, { acceptsCurrent: false }, true)}
          className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium ${
            answer.acceptsCurrent === false
              ? 'border-amber-300 bg-amber-100 text-amber-900 ring-2 ring-amber-200'
              : 'border-slate-200 text-slate-600'
          }`}
        >
          Propose another
        </button>
      </div>

      {answer.acceptsCurrent === false && (
        <div className="mt-2 space-y-2">
          {options ? (
            <select
              value={answer.proposedValue}
              onChange={(e) => onItem(item.id, { proposedValue: e.target.value }, true)}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm"
            >
              <option value="">Choose…</option>
              {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              type={item.type === 'TIME' ? 'time' : 'text'}
              value={answer.proposedValue}
              onChange={(e) => onItem(item.id, { proposedValue: e.target.value })}
              onBlur={() => onItem(item.id, {}, true)}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm"
              placeholder="Your proposed value"
            />
          )}
          <input
            type="text"
            value={answer.reason}
            onChange={(e) => onItem(item.id, { reason: e.target.value })}
            onBlur={() => onItem(item.id, {}, true)}
            className="w-full rounded-lg border border-slate-300 p-2 text-sm"
            placeholder="Why? (one line is enough)"
          />
        </div>
      )}
    </div>
  );
}

function GeneralStep({
  value, onChange,
}: {
  value: GeneralAnswer;
  onChange: (patch: Partial<GeneralAnswer>, immediate?: boolean) => void;
}) {
  const text = (
    field: keyof GeneralAnswer,
    label: string,
    placeholder: string,
    rows = 2,
  ) => (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <textarea
        value={(value[field] as string) ?? ''}
        onChange={(e) => onChange({ [field]: e.target.value } as Partial<GeneralAnswer>)}
        onBlur={() => onChange({}, true)}
        rows={rows}
        className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm"
        placeholder={placeholder}
      />
    </label>
  );

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div>
        <h2 className="text-sm font-bold text-slate-900">Your overall view</h2>
        <p className="mt-1 text-xs text-slate-500">
          Four questions about the policy as a whole.
        </p>
      </div>

      <fieldset>
        <legend className="text-xs font-semibold text-slate-700">
          Do you support this policy overall?
        </legend>
        <div className="mt-2 flex gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange({ overallSupport: n }, true)}
              className={`flex-1 rounded-lg border py-2.5 text-sm font-semibold ${
                value.overallSupport === n
                  ? 'border-blue-400 bg-blue-50 text-blue-900 ring-2 ring-blue-200'
                  : 'border-slate-200 text-slate-600'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-slate-500">
          <span>1 — not at all</span>
          <span>5 — fully</span>
        </div>
      </fieldset>

      <div className="space-y-2">
        <span className="text-xs font-semibold text-slate-700">Your three biggest concerns</span>
        {(['concern1', 'concern2', 'concern3'] as const).map((field, i) => (
          <input
            key={field}
            type="text"
            value={(value[field] as string) ?? ''}
            onChange={(e) => onChange({ [field]: e.target.value } as Partial<GeneralAnswer>)}
            onBlur={() => onChange({}, true)}
            className="w-full rounded-lg border border-slate-300 p-2.5 text-sm"
            placeholder={`Concern ${i + 1}`}
          />
        ))}
      </div>

      {text(
        'barriers',
        'What would stop this working in your own unit?',
        'Be specific. This is the question a group chat never asks.',
        3,
      )}
      {text('resourcesNeeded', 'What would you need to make it work?', 'Staff, equipment, space, money.', 2)}
      {text('otherComments', 'Anything else', 'Anything the sections above did not cover.', 2)}
    </div>
  );
}

function SummaryStep({
  steps, answeredIds, progress, answers, sectionsById, alreadySubmitted, submitting, onJump, onSubmit,
}: {
  steps: PolicyStep[];
  answeredIds: Set<string>;
  progress: { sectionsAnswered: number; sectionsTotal: number };
  answers: Record<string, SectionAnswer>;
  sectionsById: Record<string, Section>;
  alreadySubmitted: string | null;
  submitting: boolean;
  onJump: (index: number) => void;
  onSubmit: () => void;
}) {
  const unanswered = steps
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.kind === 'section' && !isStepComplete(s, answeredIds));

  const safety = Object.entries(answers)
    .filter(([, a]) => a.concernType === 'PATIENT_SAFETY')
    .map(([id]) => sectionsById[id])
    .filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-bold text-slate-900">Before you send</h2>
        <p className="mt-1 text-xs text-slate-600">
          You have answered <strong>{progress.sectionsAnswered} of {progress.sectionsTotal}</strong> sections.
        </p>

        {alreadySubmitted && (
          <p className="mt-3 rounded-lg bg-blue-50 p-3 text-xs text-blue-900">
            You have already submitted this review. You may still change any answer until the
            deadline — press Submit again afterwards and the committee sees your latest version.
          </p>
        )}

        {unanswered.length > 0 ? (
          <div className="mt-3">
            <p className="text-xs font-semibold text-slate-700">
              Not yet answered — you may leave these out if they are not your area:
            </p>
            <ul className="mt-2 space-y-1">
              {unanswered.map(({ s, i }) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onJump(i)}
                    className="text-left text-xs font-medium text-blue-700 underline underline-offset-2"
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Every section has an answer.
          </p>
        )}

        {safety.length > 0 && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
            <p className="text-xs font-bold text-rose-900">
              You raised a patient-safety concern on:
            </p>
            <ul className="mt-1 list-disc pl-5 text-xs text-rose-900">
              {safety.map((s) => (
                <li key={s.id}>{s.number ? `${s.number}. ` : ''}{s.title}</li>
              ))}
            </ul>
            <p className="mt-1.5 text-[11px] text-rose-800">
              These are reported to the committee individually, not counted in a majority.
            </p>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {alreadySubmitted ? 'Send my updated review' : 'Submit my review'}
      </button>
    </div>
  );
}

function ReceiptCard({ receipt }: { receipt: Receipt }) {
  return (
    <div className="mt-8 rounded-xl border border-emerald-200 bg-white p-6">
      <div className="flex items-center gap-2 text-emerald-700">
        <CheckCircle2 className="h-6 w-6" />
        <h1 className="text-base font-bold">Thank you — your review is in</h1>
      </div>

      <dl className="mt-4 space-y-2 text-xs">
        {[
          ['Reviewer', receipt.reviewerName],
          ['Policy', `${receipt.policyTitle ?? 'Theatre policy'} (v${receipt.version})`],
          ['Sections answered', `${receipt.sectionsAnswered} of ${receipt.sectionsTotal}`],
          ['Values settled', String(receipt.decisionItemsAnswered)],
          ['Received', timeOnly(receipt.submittedAt)],
          ['Reference', receipt.reference],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 border-b border-slate-100 pb-1.5">
            <dt className="text-slate-500">{label}</dt>
            <dd className="text-right font-medium text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-xs leading-relaxed text-slate-600">
        Your responses will be analysed with everyone else&rsquo;s and harmonised into the final
        recommendation to Hospital Management. You can still change any answer until the deadline
        by opening the same link again.
      </p>
      <p className="mt-3 text-[11px] text-slate-400">
        Keep the reference above if you need to ask the Committee Secretariat whether your review
        arrived.
      </p>
    </div>
  );
}
