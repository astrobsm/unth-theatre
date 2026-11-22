/**
 * The analysis as it stands right now, recomputed from the responses
 * themselves.
 *
 * WHY THIS IS NOT THE AI RUN, AND MUST NOT BE. runPolicyAnalysis() spends real
 * money on the hospital's Anthropic account, takes three passes over a
 * twenty-two section policy, and is chunked across several requests because one
 * pass does not finish inside the sixty seconds the deployment allows. Firing
 * that on every submission would mean eighteen paid runs where only the last
 * one is ever read, and the route says in as many words that it is "never
 * triggered by a page load".
 *
 * So the thing that updates on every submission is this: the picture the
 * database can already answer, for nothing, instantly and exactly. Which
 * sections are settled and which are contested, which proposed value is
 * winning and by how much, what has been raised as a patient-safety concern,
 * and who has not answered. That is most of what anybody wants to know
 * mid-round, and unlike a model it cannot be wrong about a count.
 *
 * The AI synthesis stays on the Chairman's click. What this adds for it is
 * STALENESS: once it has run, the page can say "four more responses have
 * arrived since", which is the only thing that makes a mid-round analysis safe
 * to read at all.
 *
 * Everything here is pure, so the thresholds that decide what counts as
 * "contested" can be argued with in a test rather than in production.
 */

import { MINIMUM_FOR_ANALYSIS } from './analysis/schema';

export interface SectionLike {
  sectionId: string;
  number: string | null;
  title: string;
  agree: number;
  agreeWithChanges: number;
  disagree: number;
  notMyArea: number;
  answered: number;
  changeRequests: number;
  patientSafety: number;
  highPriority: number;
}

/**
 * Where a section stands.
 *
 * THIN comes first and is the most important of the four. A section with two
 * opinions on it is not settled and it is not contested; it is unread, and
 * reporting "100% agree" from a single response is how a provisional picture
 * becomes a decision nobody meant to take.
 */
export type SectionSignal = 'THIN' | 'SETTLED' | 'CONTESTED' | 'DIVIDED';

/** Opinions that actually bear on the section. "Not my area" is not a view. */
export function engagedCount(s: SectionLike): number {
  return s.agree + s.agreeWithChanges + s.disagree;
}

export function sectionSignal(s: SectionLike): SectionSignal {
  const engaged = engagedCount(s);
  if (engaged < MINIMUM_FOR_ANALYSIS) return 'THIN';

  // Any outright disagreement, or a majority wanting changes, makes it
  // contested. DIVIDED is the stronger case: the section has real opposition
  // rather than a request to reword it.
  const against = s.disagree;
  if (against > 0 && against >= Math.ceil(engaged / 3)) return 'DIVIDED';
  if (s.disagree > 0 || s.agreeWithChanges > s.agree) return 'CONTESTED';
  return 'SETTLED';
}

export function signalLabel(sig: SectionSignal): string {
  switch (sig) {
    case 'THIN': return 'Too few views yet';
    case 'SETTLED': return 'Agreed so far';
    case 'CONTESTED': return 'Changes requested';
    case 'DIVIDED': return 'Opposed';
    default: return 'Unknown';
  }
}

/** Sections the Chairman should look at first, worst first. */
const SIGNAL_ORDER: SectionSignal[] = ['DIVIDED', 'CONTESTED', 'THIN', 'SETTLED'];

export function rankSections<T extends SectionLike>(sections: T[]): Array<T & { signal: SectionSignal }> {
  return sections
    .map((s) => ({ ...s, signal: sectionSignal(s) }))
    .sort((a, b) => {
      const d = SIGNAL_ORDER.indexOf(a.signal) - SIGNAL_ORDER.indexOf(b.signal);
      if (d !== 0) return d;
      // Within a band, the one with most safety flags, then most opposition.
      if (b.patientSafety !== a.patientSafety) return b.patientSafety - a.patientSafety;
      return b.disagree - a.disagree;
    });
}

export interface TallyLike {
  decisionItemId: string;
  placeholder: string;
  currentValue: string;
  accepted: number;
  proposals: Array<{ value: string; support: number }>;
  answered: number;
}

export interface LeadingValue {
  value: string;
  support: number;
  /** True when the current bracketed value is still ahead. */
  isCurrent: boolean;
  /** How far ahead of the runner-up. 0 means a tie. */
  margin: number;
  contested: boolean;
  answered: boolean;
}

/**
 * Which value is winning for one open bracket, and whether it is close.
 *
 * A tie is reported as a tie rather than resolved by order, because the order
 * here is whatever the database returned and settling "[11:00] or [12:00]" on
 * that basis would be inventing a committee decision.
 */
export function leadingValue(t: TallyLike): LeadingValue {
  const options = [
    { value: t.currentValue, support: t.accepted, isCurrent: true },
    ...t.proposals.map((p) => ({ value: p.value, support: p.support, isCurrent: false })),
  ].filter((o) => (o.value ?? '').trim() !== '');

  if (t.answered === 0 || options.length === 0) {
    return {
      value: t.currentValue,
      support: 0,
      isCurrent: true,
      margin: 0,
      contested: false,
      answered: false,
    };
  }

  const sorted = [...options].sort((a, b) => b.support - a.support);
  const top = sorted[0];
  const next = sorted[1];
  const margin = top.support - (next?.support ?? 0);

  return {
    value: top.value,
    support: top.support,
    isCurrent: top.isCurrent,
    margin,
    // Close, or more than one value in play at all.
    contested: sorted.filter((o) => o.support > 0).length > 1 && margin <= 1,
    answered: true,
  };
}

export interface CoverageLike {
  invited: number;
  submitted: number;
}

export interface Coverage {
  invited: number;
  submitted: number;
  percent: number;
  /** Enough responses for the AI synthesis to be meaningful. */
  enoughForAnalysis: boolean;
  needed: number;
}

export function coverageOf(p: CoverageLike): Coverage {
  const percent = p.invited === 0 ? 0 : Math.round((p.submitted / p.invited) * 100);
  return {
    invited: p.invited,
    submitted: p.submitted,
    percent,
    enoughForAnalysis: p.submitted >= MINIMUM_FOR_ANALYSIS,
    needed: Math.max(0, MINIMUM_FOR_ANALYSIS - p.submitted),
  };
}

/**
 * The banner above any mid-round picture.
 *
 * It always says what it is based on. A provisional analysis that does not
 * announce itself is the one failure mode that matters here: it gets quoted in
 * a meeting as though the committee had finished.
 */
export function provisionalBanner(c: Coverage, roundClosed: boolean): string {
  if (c.submitted === 0) {
    return 'No responses yet. This will fill in as members submit.';
  }
  if (roundClosed) {
    return `Based on all ${c.submitted} response${c.submitted === 1 ? '' : 's'} received.`;
  }
  const base = `PROVISIONAL — based on ${c.submitted} of ${c.invited} invited `
    + `(${c.percent}%). It updates as each response arrives.`;
  return c.enoughForAnalysis
    ? base
    : `${base} Too few for a reliable reading: ${c.needed} more needed.`;
}

export interface StalenessInput {
  /** Submissions counted when the AI analysis last ran. */
  submittedAtRun: number | null;
  submittedNow: number;
  lastRunAt: Date | string | null;
}

export interface Staleness {
  hasRun: boolean;
  newSince: number;
  stale: boolean;
  message: string;
}

/**
 * How far the stored AI analysis has fallen behind the responses.
 *
 * This is what makes a mid-round run safe to read. Without it, an analysis of
 * seven responses sits on the screen looking current while eleven more arrive,
 * and nothing on the page distinguishes the two.
 */
export function stalenessOf(input: StalenessInput): Staleness {
  if (input.submittedAtRun === null || !input.lastRunAt) {
    return {
      hasRun: false,
      newSince: input.submittedNow,
      stale: false,
      message: 'The AI synthesis has not been run for this round yet.',
    };
  }

  const newSince = Math.max(0, input.submittedNow - input.submittedAtRun);
  if (newSince === 0) {
    return {
      hasRun: true,
      newSince: 0,
      stale: false,
      message: `Up to date with all ${input.submittedNow} response`
        + `${input.submittedNow === 1 ? '' : 's'}.`,
    };
  }

  return {
    hasRun: true,
    newSince,
    stale: true,
    message: `${newSince} further response${newSince === 1 ? ' has' : 's have'} arrived since `
      + `this analysis ran — it reflects ${input.submittedAtRun} of ${input.submittedNow}. `
      + 'Run it again before relying on it.',
  };
}

/**
 * Whether it is worth offering to re-run the paid analysis yet.
 *
 * Deliberately a SUGGESTION, never an automatic trigger. The run costs money
 * per press and the route exists on the principle that nothing spends it
 * without the Chairman choosing to; a threshold that quietly re-ran on every
 * third submission would be that rule removed by the back door.
 */
export function worthRerunning(s: Staleness, c: Coverage, minNew = 3): boolean {
  if (!c.enoughForAnalysis) return false;
  if (!s.hasRun) return true;
  return s.newSince >= minNew;
}

/** One line for the top of the live panel. */
export function liveSummary(sections: SectionLike[], c: Coverage): string {
  if (c.submitted === 0) return 'Nothing to summarise yet.';

  const ranked = rankSections(sections);
  const divided = ranked.filter((s) => s.signal === 'DIVIDED').length;
  const contested = ranked.filter((s) => s.signal === 'CONTESTED').length;
  const settled = ranked.filter((s) => s.signal === 'SETTLED').length;
  const thin = ranked.filter((s) => s.signal === 'THIN').length;
  const safety = sections.reduce((n, s) => n + s.patientSafety, 0);

  const parts = [
    `${settled} section${settled === 1 ? '' : 's'} agreed so far`,
    `${contested} with changes requested`,
    `${divided} opposed`,
  ];
  if (thin > 0) parts.push(`${thin} with too few views yet`);

  const line = `${parts.join(', ')}.`;
  return safety > 0
    ? `${line} ${safety} patient-safety concern${safety === 1 ? '' : 's'} raised — read those first.`
    : line;
}
