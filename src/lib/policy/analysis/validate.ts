// ============================================================
// Checking the analysis against the database before anybody reads it
// ------------------------------------------------------------
// This file is the reason the module may use a model at all.
//
// `ConflictAnalysis` in this schema records a deliberate decision against
// model-written prose in a permanent institutional record, "because a model's
// summary in a permanent institutional record cannot be traced to source
// responses." That objection is answered here rather than overridden: every
// theme, concern, conflict, proposal and recommendation must cite response ids,
// and this checks that each cited id was actually in the input and that the
// counts reported match what the database holds.
//
// TWO FAILURE MODES, TWO DIFFERENT ANSWERS, and the distinction is the whole
// design:
//
//   A FABRICATED CITATION IS REJECTED. Support that does not exist is the one
//   thing that must never reach the Chairman, because it reads exactly like
//   support that does. The run is stored FAILED_VALIDATION with its reasons and
//   is never rendered as findings.
//
//   A MISSING SAFETY FLAG IS CORRECTED, not rejected. The flag is protective,
//   so the safe direction is to set it. Rejecting the whole run because one
//   change was not flagged would discard twenty good findings to punish a
//   missing boolean, and the likely next step would be re-running until it
//   passed -- which is worse than setting the flag.
//
//   SUPPORT FOUND IN THE WRONG BOX IS RECORDED, not rejected. A reviewer who
//   wrote "make it 14:00" in the comment box, rather than typing 14:00 into
//   the open value's own field, holds that view every bit as much as the one
//   who used the field. Which box they used is an artifact of the form, not a
//   fact about the committee. So a proposal that cites a response from
//   elsewhere in THIS SECTION'S OWN INPUT is kept, and the citation is noted
//   on the Chairman's screen so he can read the words for himself.
//
//   It used to fail the whole run, and on 28 November 2026 it did: eight such
//   citations threw away the findings for all eighty sections, after every one
//   of them had been paid for. The guard that actually matters is untouched --
//   an id that was NOT in the input is still a refusal, and support claimed
//   beyond the citations is still a refusal -- so the number of supporters on
//   the page can still never exceed the responses standing behind it.
//
// Pure, so every one of these can be exercised without a database or an API
// key. That matters: these are the checks nobody will think to test by hand,
// because when they are working there is nothing to see.
// ============================================================

import {
  MINIMUM_FOR_ANALYSIS,
  type CrossSectionAnalysis,
  type SectionAnalysis,
  type Synthesis,
} from './schema';

export interface SectionFacts {
  sectionId: string;
  /** Every response id sent for this section. Nothing else may be cited. */
  responseIds: ReadonlySet<string>;
  decisionItemIds: ReadonlySet<string>;
  /** Which response ids answered each decision item. */
  responseIdsByDecisionItem: ReadonlyMap<string, ReadonlySet<string>>;
  /** The counts, computed from the rows. */
  stanceCounts: {
    agree: number;
    agree_with_changes: number;
    disagree: number;
    not_my_area: number;
  };
  /**
   * Responses that engage with the section — everything except NOT_MY_AREA.
   * Three people saying a section is not their business is not three views
   * on it.
   */
  engagedCount: number;
  /** Responses whose own concern type is patient safety. */
  safetyResponseIds: ReadonlySet<string>;
}

export interface Violation {
  kind:
  | 'wrong-section'
  | 'fabricated-response-id'
  | 'fabricated-decision-item-id'
  | 'stance-count-mismatch'
  | 'should-be-insufficient'
  | 'wrongly-declared-insufficient'
  | 'support-exceeds-citations';
  /** In words, for the owner's screen. */
  detail: string;
  where?: string;
}

export interface Correction {
  kind: 'forced-clinical-review' | 'citation-outside-decision-item' | 'repaired-citation';
  detail: string;
  where: string;
}

export type ValidationResult =
  | { ok: true; analysis: SectionAnalysis; corrections: Correction[] }
  | { ok: false; violations: Violation[]; corrections: Correction[] };

/**
 * Language that marks a provision this policy must not quietly weaken.
 *
 * Deliberately broad and deliberately dumb. A false positive costs a change an
 * extra "clinical review required" badge, which the Chairman clears in one
 * click. A false negative lets a change to who may decline an unsafe case
 * through as ordinary wording. Those costs are not symmetric, so this errs
 * heavily towards flagging.
 */
const SAFETY_LANGUAGE = [
  'safety', 'unsafe', 'safely',
  'decline', 'refuse', 'cancel the case', 'stop the case',
  'consent', 'identity', 'wrong site', 'wrong patient',
  'fasting', 'nil by mouth', 'nbm',
  'anaesthetic risk', 'asa', 'airway',
  'haemoglobin', 'hb ', 'potassium', 'blood pressure', 'crossmatch', 'cross-match',
  'threshold', 'contraindicat',
  'resuscitat', 'emergency', 'life-threatening',
  'sepsis', 'allergy', 'allergic',
];

/** Does this text touch something clinical enough to need a clinician's eye? */
export function touchesClinicalSafety(...texts: Array<string | null | undefined>): boolean {
  const haystack = texts.filter(Boolean).join(' \n ').toLowerCase();
  return SAFETY_LANGUAGE.some((phrase) => haystack.includes(phrase));
}

/**
 * Longest run of mistyped characters tolerated in a copied response id.
 *
 * WHY THIS NUMBER IS NOT ZERO. On 28 November 2026 a run of eighty sections
 * was refused for one citation: "e6aa71-7441-4ac5-8bfa-c2ddb45843bb". That is
 * a real response whose first group lost two of its eight characters on the
 * way out of the model. The support existed, the reviewer existed, the row
 * existed; thirty-four characters of a thirty-six character name were right.
 * Refusing it discarded all eighty sections, and no amount of re-running
 * would reliably stop a model dropping a character out of a UUID.
 *
 * WHY IT IS NOT LARGER, EITHER. The repair is accepted only when exactly ONE
 * real id is within this distance. A random id invented whole is not two
 * edits from anything, and two real ids of this section are not two edits
 * from each other, so the guard against fabrication survives intact: a
 * stranger is still a stranger, and an ambiguous near-miss is refused rather
 * than guessed.
 */
const MAX_ID_TYPOS = 2;

/** Is `a` reachable from `b` in at most `max` edits? Early-exits. */
function withinTypos(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  if (a === b) return true;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  let cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    cur[0] = i;
    let best = cur[0];
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return false;
    const swap = prev; prev = cur; cur = swap;
  }
  return prev[n] <= max;
}

/**
 * Which real response did this citation mean?
 *
 * Exact match, or the single real id a couple of typos away. Null when it
 * names nothing, or when it is equally close to two things -- a guess between
 * two reviewers is worse than a refusal.
 */
export function resolveCitation(
  id: string,
  candidates: ReadonlySet<string>,
): { id: string; repaired: boolean } | null {
  if (candidates.has(id)) return { id, repaired: false };
  // Copied into an array first: this project's TypeScript target cannot
  // iterate a Set directly, and a Set of a section's responses is small.
  const list: string[] = [];
  candidates.forEach((candidate) => list.push(candidate));
  let hit: string | null = null;
  for (const candidate of list) {
    if (!withinTypos(id, candidate, MAX_ID_TYPOS)) continue;
    if (hit !== null) return null;
    hit = candidate;
  }
  return hit === null ? null : { id: hit, repaired: true };
}

/**
 * Check one section's analysis.
 *
 * Returns the analysis with corrections applied, or the list of violations. The
 * caller stores a violating run as FAILED_VALIDATION and shows the reasons
 * rather than retrying silently: a prompt that has started inventing support is
 * something the owner needs to know about, not something to paper over.
 *
 * The analysis it returns has every citation RESOLVED to the real id, so what
 * is stored and shown to the committee is the row itself and never the
 * model's spelling of it.
 */
export function validateSectionAnalysis(
  analysis: SectionAnalysis,
  facts: SectionFacts,
): ValidationResult {
  const violations: Violation[] = [];
  const corrections: Correction[] = [];

  if (analysis.section_id !== facts.sectionId) {
    violations.push({
      kind: 'wrong-section',
      detail:
        `The analysis is labelled "${analysis.section_id}" but was asked about `
        + `"${facts.sectionId}".`,
    });
  }

  /** Resolve a cited list, repairing near-misses and refusing strangers. */
  const mapIds = (ids: string[], where: string): string[] => {
    const out: string[] = [];
    for (const id of ids) {
      const hit = resolveCitation(id, facts.responseIds);
      if (hit === null) {
        violations.push({
          kind: 'fabricated-response-id',
          detail: `Cites response "${id}", which is not one of the responses to this section.`,
          where,
        });
        continue;
      }
      if (hit.repaired) {
        corrections.push({
          kind: 'repaired-citation',
          detail:
            `Cited response "${id}", which is not a response to this section but is within `
            + `two characters of exactly one that is, "${hit.id}". Read as that one.`,
          where,
        });
      }
      out.push(hit.id);
    }
    return out;
  };

  const themes = analysis.themes.map((theme, i) => ({
    ...theme,
    response_ids: mapIds(theme.response_ids, `theme ${i + 1}`),
  }));
  const criticalConcerns = analysis.critical_concerns.map((c, i) => ({
    ...c,
    response_ids: mapIds(c.response_ids, `concern ${i + 1}`),
  }));
  const unitConflicts = analysis.unit_conflicts.map((c, i) => ({
    ...c,
    response_ids: mapIds(c.response_ids, `conflict ${i + 1}`),
  }));

  const decisionItems = analysis.decision_items.map((item, i) => {
    const where = `decision item ${i + 1}`;
    if (!facts.decisionItemIds.has(item.decision_item_id)) {
      violations.push({
        kind: 'fabricated-decision-item-id',
        detail:
          `Reports on open value "${item.decision_item_id}", which is not in this section.`,
        where,
      });
      return item;
    }

    const allowed = facts.responseIdsByDecisionItem.get(item.decision_item_id)
      ?? new Set<string>();

    const proposals = item.proposals.map((proposal, j) => {
      const place = `${where}, proposal ${j + 1}`;
      const ids = mapIds(proposal.response_ids, place);

      for (const id of ids) {
        // Support drawn from a section comment rather than from this open
        // value's own box. Noted, not refused -- see the third failure mode
        // at the top of this file. The id is real and belongs to this
        // section, so the Chairman can open it and read what was said.
        if (!allowed.has(id)) {
          corrections.push({
            kind: 'citation-outside-decision-item',
            detail:
              `Support for "${proposal.value}" rests on response "${id}", which is a `
              + "comment on this section rather than an answer typed into this open value's "
              + 'own box. Open it to read what was actually said.',
            where: place,
          });
        }
      }

      // Support claimed beyond the citations is inflated support, and it is the
      // number the committee would read off the page.
      if (proposal.support > ids.length) {
        violations.push({
          kind: 'support-exceeds-citations',
          detail:
            `Claims ${proposal.support} reviewers proposed "${proposal.value}" but `
            + `cites ${ids.length}.`,
          where: place,
        });
      }

      return { ...proposal, response_ids: ids };
    });

    return { ...item, proposals };
  });

  const counts = analysis.stance_counts;
  const expected = facts.stanceCounts;
  const mismatched = (['agree', 'agree_with_changes', 'disagree', 'not_my_area'] as const)
    .filter((key) => counts[key] !== expected[key]);
  if (mismatched.length > 0) {
    violations.push({
      kind: 'stance-count-mismatch',
      detail:
        'The stance counts do not match the responses on file: '
        + mismatched
          .map((key) => `${key} reported as ${counts[key]}, actually ${expected[key]}`)
          .join('; ')
        + '.',
    });
  }

  if (facts.engagedCount < MINIMUM_FOR_ANALYSIS && analysis.verdict !== 'insufficient_input') {
    violations.push({
      kind: 'should-be-insufficient',
      detail:
        `Only ${facts.engagedCount} reviewer(s) engaged with this section, which is `
        + `below ${MINIMUM_FOR_ANALYSIS}, but the verdict is "${analysis.verdict}". `
        + 'A recommendation drawn from one or two voices is not a committee view.',
    });
  }

  if (facts.engagedCount >= MINIMUM_FOR_ANALYSIS && analysis.verdict === 'insufficient_input') {
    // Over-caution is not harmless here: it silently drops what the committee
    // did say, and the dashboard would show a section nobody had analysed
    // despite the responses sitting right there.
    violations.push({
      kind: 'wrongly-declared-insufficient',
      detail:
        `${facts.engagedCount} reviewers engaged with this section, which is enough to `
        + 'analyse, but it was reported as having insufficient input.',
    });
  }

  // -- Corrections --------------------------------------------------------
  const proposedChanges = analysis.proposed_changes.map((change, i) => {
    const where = `proposed change ${i + 1}`;
    const ids = mapIds(change.response_ids, where);
    const mapped = { ...change, response_ids: ids };
    if (mapped.clinical_review_required) return mapped;

    const citedSafety = ids.some((id) => facts.safetyResponseIds.has(id));
    const readsClinical = touchesClinicalSafety(change.current_text, change.proposed_text);
    if (!citedSafety && !readsClinical) return mapped;

    corrections.push({
      kind: 'forced-clinical-review',
      detail: citedSafety
        ? 'Flagged for clinical review: it rests on a response that raised a '
          + 'patient-safety concern.'
        : 'Flagged for clinical review: the wording touches a clinical '
          + 'provision or threshold.',
      where,
    });
    return { ...mapped, clinical_review_required: true };
  });

  const corrected: SectionAnalysis = {
    ...analysis,
    themes,
    critical_concerns: criticalConcerns,
    unit_conflicts: unitConflicts,
    decision_items: decisionItems,
    proposed_changes: proposedChanges,
  };

  if (violations.length > 0) return { ok: false, violations, corrections };
  return { ok: true, analysis: corrected, corrections };
}


/** The cross-section pass may only name sections it was given. */
export function validateCrossSection(
  analysis: CrossSectionAnalysis,
  knownSectionIds: ReadonlySet<string>,
): { ok: true } | { ok: false; violations: Violation[] } {
  const violations: Violation[] = [];
  analysis.inconsistencies.forEach((item, i) => {
    for (const id of item.section_ids) {
      if (!knownSectionIds.has(id)) {
        violations.push({
          kind: 'wrong-section',
          detail: `Names section "${id}", which is not in this policy.`,
          where: `inconsistency ${i + 1}`,
        });
      }
    }
  });
  return violations.length > 0 ? { ok: false, violations } : { ok: true };
}

/**
 * The synthesis may only name sections and open values it was given.
 *
 * It is fed the already-validated per-section findings rather than the raw
 * responses, so it cannot cite a response at all — which is why this checks
 * section and decision-item ids instead.
 */
export function validateSynthesis(
  synthesis: Synthesis,
  known: { sectionIds: ReadonlySet<string>; decisionItemIds: ReadonlySet<string> },
): { ok: true } | { ok: false; violations: Violation[] } {
  const violations: Violation[] = [];

  const checkSections = (ids: Array<string | null>, where: string) => {
    for (const id of ids) {
      if (id === null) continue;
      if (!known.sectionIds.has(id)) {
        violations.push({
          kind: 'wrong-section',
          detail: `Names section "${id}", which is not in this policy.`,
          where,
        });
      }
    }
  };

  synthesis.contested_issues.forEach((item, i) =>
    checkSections(item.section_ids, `contested issue ${i + 1}`));
  synthesis.critical_concerns.forEach((item, i) =>
    checkSections([item.section_id], `critical concern ${i + 1}`));

  synthesis.recommended_decision_values.forEach((item, i) => {
    if (!known.decisionItemIds.has(item.decision_item_id)) {
      violations.push({
        kind: 'fabricated-decision-item-id',
        detail: `Recommends a value for "${item.decision_item_id}", which is not an open value in this policy.`,
        where: `recommended value ${i + 1}`,
      });
    }
  });

  return violations.length > 0 ? { ok: false, violations } : { ok: true };
}
