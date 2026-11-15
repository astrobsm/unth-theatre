// ============================================================
// The steps of a policy review, and where a reviewer left off
// ------------------------------------------------------------
// WHY THIS FILE EXISTS AT ALL, rather than the page just holding an array.
//
// ORM already has a server-resumable wizard: the surgery booking form saves a
// draft with a `step` column and offers "Continue where I stopped". It also has
// a live bug, and this file is shaped to make that bug impossible rather than
// to repeat it.
//
// The booking page turns a step INDEX into a step NAME with one array
// (`['patient','surgery','team','consent','preop','packs']`) while its API
// route validates the name against another
// (`['patient','surgery','preop','consent','packs','team','review']`). The
// orderings disagree -- `team`/`preop` and `packs`/`team` are transposed -- so
// a resumed booking can land on the wrong step. Nothing warns anybody: the
// form simply opens on a page the user did not stop on.
//
// Two hand-maintained orderings of one list will always drift. So:
//
//   1. THE CURSOR IS A STABLE ID, NEVER AN INDEX. "section:<uuid>" means that
//      section wherever it ends up in the order. Inserting section 4a next week
//      cannot shift the saved place of somebody halfway through.
//   2. ONE BUILDER, used by the page AND the route. There is no second
//      ordering to disagree with the first, because there is only one.
//   3. AN UNRECOGNISED ID IS NOT AN ERROR AND NOT A RESET. It resolves to the
//      first section the reviewer has not answered. A cursor pointing at a
//      section that was merged away must not dump somebody back at the start of
//      a twenty-two step review.
//
// WHY SUBSECTIONS DO NOT GET THEIR OWN STEP. Section 3 alone has twelve
// subsections (3.1-3.12). One step each would make this a sixty-step form on a
// phone, over hospital mobile data, for people doing it between cases. So a
// step is a TOP-LEVEL section, and its subsections render inside it, each still
// independently answerable. A step is done when its own stance and all its
// descendants' stances are recorded.
// ============================================================

export type PolicyStepKind = 'welcome' | 'section' | 'general' | 'review';

/** Stable step ids. Stored in PolicyParticipation.currentStepId. */
export const WELCOME_STEP_ID = 'welcome';
export const GENERAL_STEP_ID = 'general';
export const REVIEW_STEP_ID = 'review';

/** `section:<id>` — the only composite id, so the section is recoverable. */
export const sectionStepId = (sectionId: string): string => `section:${sectionId}`;

/** The section id inside a `section:<id>` step id, or null for anything else. */
export function sectionIdOfStep(stepId: string | null | undefined): string | null {
  if (!stepId) return null;
  const prefix = 'section:';
  if (!stepId.startsWith(prefix)) return null;
  const id = stepId.slice(prefix.length);
  return id === '' ? null : id;
}

/** The shape this module needs from a PolicySection row. */
export interface SectionLike {
  id: string;
  number: string | null;
  title: string;
  parentId: string | null;
  order: number;
  isAppendix?: boolean;
}

export interface PolicyStep {
  /** Stable. Never derived from position. */
  id: string;
  kind: PolicyStepKind;
  /** The top-level section this step is about, where it is a section step. */
  sectionId: string | null;
  /** What the navigator shows, e.g. "5. Perioperative laboratory". */
  label: string;
  /**
   * Every section whose stance this step collects: the top-level section and
   * all of its descendants. A step is complete when all of these are answered.
   */
  requires: string[];
}

const labelOf = (s: SectionLike): string =>
  s.number ? `${s.number}. ${s.title}` : s.title;

/**
 * Sort by `order`, then by number, then by title.
 *
 * `order` alone is not enough to rely on: an importer that assigned every
 * section order 0 would otherwise produce a step list whose sequence depends on
 * however Postgres happened to return the rows, which is not a sequence at all.
 */
function inDocumentOrder(a: SectionLike, b: SectionLike): number {
  if (a.order !== b.order) return a.order - b.order;
  const an = a.number ?? '';
  const bn = b.number ?? '';
  if (an !== bn) return an.localeCompare(bn, 'en', { numeric: true });
  return a.title.localeCompare(b.title, 'en');
}

/** Every descendant of `id`, depth first, in document order. */
function descendantsOf(id: string, byParent: Map<string, SectionLike[]>): string[] {
  const out: string[] = [];
  const children = (byParent.get(id) ?? []).slice().sort(inDocumentOrder);
  for (const child of children) {
    out.push(child.id);
    out.push(...descendantsOf(child.id, byParent));
  }
  return out;
}

/**
 * The steps of this review, in order: welcome, one per top-level section, the
 * general questions, then review-and-submit.
 *
 * Called on the server to validate a saved cursor and on the client to render
 * the navigator. Same function, same answer, by construction.
 */
export function buildPolicySteps(sections: SectionLike[]): PolicyStep[] {
  const byParent = new Map<string, SectionLike[]>();
  const ids = new Set(sections.map((s) => s.id));
  for (const s of sections) {
    // A section whose parent is not in this list is treated as top level
    // rather than dropped. Losing a section silently is worse than showing it
    // at the wrong depth: nobody reviews what they cannot see.
    const key = s.parentId && ids.has(s.parentId) ? s.parentId : '';
    const list = byParent.get(key) ?? [];
    list.push(s);
    byParent.set(key, list);
  }

  const top = (byParent.get('') ?? []).slice().sort(inDocumentOrder);

  const steps: PolicyStep[] = [
    { id: WELCOME_STEP_ID, kind: 'welcome', sectionId: null, label: 'Welcome', requires: [] },
  ];

  for (const s of top) {
    steps.push({
      id: sectionStepId(s.id),
      kind: 'section',
      sectionId: s.id,
      label: labelOf(s),
      requires: [s.id, ...descendantsOf(s.id, byParent)],
    });
  }

  steps.push({
    id: GENERAL_STEP_ID,
    kind: 'general',
    sectionId: null,
    label: 'Your overall view',
    requires: [],
  });
  steps.push({
    id: REVIEW_STEP_ID,
    kind: 'review',
    sectionId: null,
    label: 'Review and submit',
    requires: [],
  });

  return steps;
}

/** Has every section this step asks about been answered? */
export function isStepComplete(step: PolicyStep, answered: ReadonlySet<string>): boolean {
  if (step.requires.length === 0) return false;
  return step.requires.every((id) => answered.has(id));
}

export interface PolicyProgress {
  /** Section steps fully answered. */
  done: number;
  /** Section steps in total. Welcome, general and review are not counted. */
  total: number;
  percent: number;
  /** Individual sections answered, which is what "7 of 22" is counted from. */
  sectionsAnswered: number;
  sectionsTotal: number;
}

/**
 * How far through the review this reviewer is.
 *
 * Counted over section steps, not over every step: "2 of 24" when somebody has
 * answered both sections of a two-section round, because welcome and submit are
 * not work, would read as though they had barely started.
 */
export function policyProgress(
  steps: PolicyStep[],
  answered: ReadonlySet<string>,
): PolicyProgress {
  const sectionSteps = steps.filter((s) => s.kind === 'section');
  const done = sectionSteps.filter((s) => isStepComplete(s, answered)).length;
  const sectionsTotal = sectionSteps.reduce((n, s) => n + s.requires.length, 0);
  const sectionsAnswered = sectionSteps.reduce(
    (n, s) => n + s.requires.filter((id) => answered.has(id)).length,
    0,
  );
  return {
    done,
    total: sectionSteps.length,
    percent: sectionSteps.length === 0 ? 0 : Math.round((done / sectionSteps.length) * 100),
    sectionsAnswered,
    sectionsTotal,
  };
}

/**
 * The first section step with anything still unanswered, or the review step
 * when there is none.
 *
 * Never the welcome step: somebody who has already answered six sections does
 * not need to be told again what the review is for.
 */
export function firstUnansweredStepIndex(
  steps: PolicyStep[],
  answered: ReadonlySet<string>,
): number {
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (step.kind !== 'section') continue;
    if (!isStepComplete(step, answered)) return i;
  }
  const review = steps.findIndex((s) => s.kind === 'review');
  return review === -1 ? Math.max(0, steps.length - 1) : review;
}

export type CursorReason =
  /** The saved step still exists; they are exactly where they left off. */
  | 'saved'
  /** Nothing saved yet — a first visit. */
  | 'fresh'
  /** The saved step is gone (a section merged or removed since). */
  | 'step-missing'
  /** Everything is answered, so they land on review-and-submit. */
  | 'complete';

export interface ResolvedCursor {
  index: number;
  stepId: string;
  reason: CursorReason;
}

/**
 * Where to put this reviewer when they open the link again.
 *
 * THE WHOLE POINT OF THE MODULE'S "come back and continue" promise is here, so
 * the failure modes are enumerated rather than collapsed into a fallback:
 *
 *   - a saved step that still exists wins, even if it is already answered,
 *     because they may have stopped mid-edit on purpose;
 *   - a saved step that has since been removed resolves FORWARD to the first
 *     unanswered section, not back to the beginning;
 *   - a first visit with no progress lands on the welcome screen, which is the
 *     one case where starting at the front is right;
 *   - a first visit by somebody who somehow has answers but no cursor (their
 *     participation row was lost, or answers arrived from another device)
 *     resolves to their first unanswered section, not to welcome.
 */
export function resolveCursor(opts: {
  steps: PolicyStep[];
  storedStepId: string | null | undefined;
  answered: ReadonlySet<string>;
}): ResolvedCursor {
  const { steps, storedStepId, answered } = opts;
  if (steps.length === 0) {
    return { index: 0, stepId: WELCOME_STEP_ID, reason: 'fresh' };
  }

  if (storedStepId) {
    const at = steps.findIndex((s) => s.id === storedStepId);
    if (at !== -1) {
      return { index: at, stepId: steps[at].id, reason: 'saved' };
    }
    const next = firstUnansweredStepIndex(steps, answered);
    return { index: next, stepId: steps[next].id, reason: 'step-missing' };
  }

  if (answered.size === 0) {
    return { index: 0, stepId: steps[0].id, reason: 'fresh' };
  }

  const progress = policyProgress(steps, answered);
  const next = firstUnansweredStepIndex(steps, answered);
  return {
    index: next,
    stepId: steps[next].id,
    reason: progress.done === progress.total ? 'complete' : 'step-missing',
  };
}

/**
 * Is this a step id this round actually has?
 *
 * Used by the route before writing a cursor. The booking draft route validates
 * its step against a hardcoded list; this validates against the round's own
 * steps, so a cursor can never name a step that does not exist.
 */
export function isKnownStepId(steps: PolicyStep[], stepId: string | null | undefined): boolean {
  if (!stepId) return false;
  return steps.some((s) => s.id === stepId);
}
