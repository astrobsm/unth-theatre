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
  | 'citation-outside-decision-item'
  | 'stance-count-mismatch'
  | 'should-be-insufficient'
  | 'wrongly-declared-insufficient'
  | 'support-exceeds-citations';
  /** In words, for the owner's screen. */
  detail: string;
  where?: string;
}

export interface Correction {
  kind: 'forced-clinical-review';
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
 * Check one section's analysis.
 *
 * Returns the analysis with corrections applied, or the list of violations. The
 * caller stores a violating run as FAILED_VALIDATION and shows the reasons
 * rather than retrying silently: a prompt that has started inventing support is
 * something the owner needs to know about, not something to paper over.
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

  const checkIds = (ids: string[], where: string) => {
    for (const id of ids) {
      if (!facts.responseIds.has(id)) {
        violations.push({
          kind: 'fabricated-response-id',
          detail: `Cites response "${id}", which is not one of the responses to this section.`,
          where,
        });
      }
    }
  };

  analysis.themes.forEach((theme, i) => checkIds(theme.response_ids, `theme ${i + 1}`));
  analysis.critical_concerns.forEach((c, i) => checkIds(c.response_ids, `concern ${i + 1}`));
  analysis.unit_conflicts.forEach((c, i) => checkIds(c.response_ids, `conflict ${i + 1}`));
  analysis.proposed_changes.forEach((c, i) => checkIds(c.response_ids, `proposed change ${i + 1}`));

  analysis.decision_items.forEach((item, i) => {
    const where = `decision item ${i + 1}`;
    if (!facts.decisionItemIds.has(item.decision_item_id)) {
      violations.push({
        kind: 'fabricated-decision-item-id',
        detail:
          `Reports on open value "${item.decision_item_id}", which is not in this section.`,
        where,
      });
      return;
    }

    const allowed = facts.responseIdsByDecisionItem.get(item.decision_item_id)
      ?? new Set<string>();

    item.proposals.forEach((proposal, j) => {
      const place = `${where}, proposal ${j + 1}`;
      checkIds(proposal.response_ids, place);

      for (const id of proposal.response_ids) {
        // A citation that exists but answered a DIFFERENT open value is the
        // subtle version of inventing support: the id checks out, and the
        // person never expressed a view on this value at all.
        if (facts.responseIds.has(id) && !allowed.has(id)) {
          violations.push({
            kind: 'citation-outside-decision-item',
            detail:
              `Cites response "${id}" in support of "${proposal.value}", but that `
              + 'response did not answer this open value.',
            where: place,
          });
        }
      }

      // Support claimed beyond the citations is inflated support, and it is the
      // number the committee would read off the page.
      if (proposal.support > proposal.response_ids.length) {
        violations.push({
          kind: 'support-exceeds-citations',
          detail:
            `Claims ${proposal.support} reviewers proposed "${proposal.value}" but `
            + `cites ${proposal.response_ids.length}.`,
          where: place,
        });
      }
    });
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

  // ── Corrections ────────────────────────────────────────────────────────
  const corrected: SectionAnalysis = {
    ...analysis,
    proposed_changes: analysis.proposed_changes.map((change, i) => {
      if (change.clinical_review_required) return change;

      const citedSafety = change.response_ids.some((id) => facts.safetyResponseIds.has(id));
      const readsClinical = touchesClinicalSafety(change.current_text, change.proposed_text);
      if (!citedSafety && !readsClinical) return change;

      corrections.push({
        kind: 'forced-clinical-review',
        detail: citedSafety
          ? 'Flagged for clinical review: it rests on a response that raised a '
            + 'patient-safety concern.'
          : 'Flagged for clinical review: the wording touches a clinical '
            + 'provision or threshold.',
        where: `proposed change ${i + 1}`,
      });
      return { ...change, clinical_review_required: true };
    }),
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
