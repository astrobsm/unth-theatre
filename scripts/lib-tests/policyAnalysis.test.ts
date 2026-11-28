import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import {
  touchesClinicalSafety,
  validateCrossSection,
  validateSectionAnalysis,
  validateSynthesis,
  type SectionFacts,
} from '../../src/lib/policy/analysis/validate';
import { MINIMUM_FOR_ANALYSIS } from '../../src/lib/policy/analysis/schema';
import {
  buildFinalProposal,
  renderChangeLog,
  type AcceptedChange,
  type SectionForProposal,
} from '../../src/lib/policy/finalProposal';

// The analysis, and the checks that make it usable in an institutional record.
//
// `ConflictAnalysis` in this schema records a decision AGAINST model-written
// prose in a permanent record, "because a model's summary ... cannot be traced
// to source responses". The whole of validate.ts is the answer to that
// objection, and these are the tests that make the answer real rather than
// asserted. They are also the tests nobody would think to do by hand, because
// when the checks are working there is nothing to see.

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const codeOf = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[\t ]*\/\/.*$/gm, '');

/** A section with four engaged reviewers and one open value. */
function facts(over: Partial<SectionFacts> = {}): SectionFacts {
  return {
    sectionId: 'sec-5',
    responseIds: new Set(['r1', 'r2', 'r3', 'r4', 'ir1', 'ir2']),
    decisionItemIds: new Set(['item-1']),
    responseIdsByDecisionItem: new Map([['item-1', new Set(['ir1', 'ir2'])]]),
    stanceCounts: { agree: 1, agree_with_changes: 2, disagree: 1, not_my_area: 0 },
    engagedCount: 4,
    safetyResponseIds: new Set<string>(),
    ...over,
  };
}

/** A clean analysis of that section. */
function analysis(over: Record<string, unknown> = {}) {
  return {
    section_id: 'sec-5',
    stance_counts: { agree: 1, agree_with_changes: 2, disagree: 1, not_my_area: 0 },
    verdict: 'contested' as const,
    themes: [{ summary: 'The upload time is too early.', response_ids: ['r1', 'r2'], units: ['Laboratory'] }],
    critical_concerns: [],
    unit_conflicts: [{
      between: ['Anaesthesia', 'Laboratory'],
      issue: 'Whether results can be uploaded before 11:00.',
      response_ids: ['r2', 'r3'],
    }],
    decision_items: [{
      decision_item_id: 'item-1',
      current_value: '11:00',
      proposals: [{ value: '14:00', support: 2, response_ids: ['ir1', 'ir2'] }],
      recommended_value: '14:00',
      rationale: 'Two of four asked for it and nobody opposed.',
      status: 'recommended' as const,
    }],
    proposed_changes: [{
      type: 'value' as const,
      current_text: '[11:00]',
      proposed_text: '14:00',
      rationale: 'Two reviewers asked for a later deadline.',
      support_strength: 'moderate' as const,
      response_ids: ['ir1', 'ir2'],
      clinical_review_required: false,
    }],
    ...over,
  };
}

describe('a clean analysis passes', () => {
  it('accepts findings that all trace back to real responses', () => {
    const result = validateSectionAnalysis(analysis() as never, facts());
    expect(result.ok).toBe(true);
  });
});

describe('invented support is REFUSED', () => {
  it('rejects a theme citing a response that does not exist', () => {
    // The headline case. Support that does not exist reads exactly like
    // support that does, which is why this is a refusal and not a warning.
    const result = validateSectionAnalysis(
      analysis({
        themes: [{ summary: 'Everyone agrees.', response_ids: ['r1', 'r99'], units: [] }],
      }) as never,
      facts(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations[0].kind).toBe('fabricated-response-id');
    expect(result.violations[0].detail).toContain('r99');
  });

  it('rejects a fabricated id wherever it appears', () => {
    for (const field of ['critical_concerns', 'unit_conflicts', 'proposed_changes'] as const) {
      const base = analysis() as Record<string, unknown>;
      const items = base[field] as Array<Record<string, unknown>>;
      const poisoned = items.length > 0
        ? [{ ...items[0], response_ids: ['ghost'] }]
        : [{
          type: 'patient_safety', summary: 'x', response_ids: ['ghost'],
        }];
      const result = validateSectionAnalysis(
        analysis({ [field]: poisoned }) as never,
        facts(),
      );
      expect(result.ok, field).toBe(false);
    }
  });

  it('still rejects an invented id inside a proposal for an open value', () => {
    // The proposals are where support turns into a number on the page, so a
    // citation to nothing at all has to die here as surely as anywhere else.
    const result = validateSectionAnalysis(
      analysis({
        decision_items: [{
          decision_item_id: 'item-1',
          current_value: '11:00',
          proposals: [{ value: '14:00', support: 1, response_ids: ['ghost'] }],
          recommended_value: '14:00',
          rationale: 'x',
          status: 'recommended',
        }],
      }) as never,
      facts(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations.map((v) => v.kind)).toContain('fabricated-response-id');
  });

  it('rejects support claimed beyond the citations', () => {
    // Inflated support is the number the committee would read off the page.
    const result = validateSectionAnalysis(
      analysis({
        decision_items: [{
          decision_item_id: 'item-1',
          current_value: '11:00',
          proposals: [{ value: '14:00', support: 9, response_ids: ['ir1'] }],
          recommended_value: '14:00',
          rationale: 'x',
          status: 'recommended',
        }],
      }) as never,
      facts(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations.map((v) => v.kind)).toContain('support-exceeds-citations');
  });

  it('rejects an open value that is not in this section', () => {
    const result = validateSectionAnalysis(
      analysis({
        decision_items: [{
          decision_item_id: 'item-elsewhere',
          current_value: 'x',
          proposals: [],
          recommended_value: null,
          rationale: null,
          status: 'committee_decision_needed',
        }],
      }) as never,
      facts(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations[0].kind).toBe('fabricated-decision-item-id');
  });

  it('rejects an analysis labelled with the wrong section', () => {
    const result = validateSectionAnalysis(
      analysis({ section_id: 'sec-9' }) as never,
      facts(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations[0].kind).toBe('wrong-section');
  });
});

describe('counts must match the database exactly', () => {
  it('rejects a stance count that disagrees with the rows', () => {
    const result = validateSectionAnalysis(
      analysis({
        stance_counts: { agree: 3, agree_with_changes: 2, disagree: 1, not_my_area: 0 },
      }) as never,
      facts(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations[0].kind).toBe('stance-count-mismatch');
    expect(result.violations[0].detail).toContain('agree reported as 3, actually 1');
  });

  it('names every field that disagrees, not just the first', () => {
    const result = validateSectionAnalysis(
      analysis({
        stance_counts: { agree: 9, agree_with_changes: 9, disagree: 1, not_my_area: 0 },
      }) as never,
      facts(),
    );
    if (result.ok) throw new Error('expected a violation');
    expect(result.violations[0].detail).toContain('agree reported as 9');
    expect(result.violations[0].detail).toContain('agree_with_changes reported as 9');
  });
});

describe('too few voices is not a committee view', () => {
  it(`refuses a recommendation below ${MINIMUM_FOR_ANALYSIS} engaged reviewers`, () => {
    const result = validateSectionAnalysis(
      analysis({
        stance_counts: { agree: 1, agree_with_changes: 1, disagree: 0, not_my_area: 0 },
      }) as never,
      facts({
        engagedCount: 2,
        stanceCounts: { agree: 1, agree_with_changes: 1, disagree: 0, not_my_area: 0 },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations.map((v) => v.kind)).toContain('should-be-insufficient');
  });

  it('accepts insufficient_input when that is genuinely the case', () => {
    const result = validateSectionAnalysis(
      {
        ...analysis({
          verdict: 'insufficient_input',
          stance_counts: { agree: 1, agree_with_changes: 0, disagree: 0, not_my_area: 0 },
          decision_items: [],
          proposed_changes: [],
          themes: [],
          unit_conflicts: [],
        }),
      } as never,
      facts({
        engagedCount: 1,
        stanceCounts: { agree: 1, agree_with_changes: 0, disagree: 0, not_my_area: 0 },
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('also refuses over-caution, because it silently drops what WAS said', () => {
    const result = validateSectionAnalysis(
      analysis({ verdict: 'insufficient_input' }) as never,
      facts(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations.map((v) => v.kind)).toContain('wrongly-declared-insufficient');
  });

  it('does not count "not my area" as engagement', () => {
    // Three people saying a section is not their business is not three views.
    const f = facts({
      stanceCounts: { agree: 0, agree_with_changes: 0, disagree: 0, not_my_area: 4 },
      engagedCount: 0,
    });
    const result = validateSectionAnalysis(
      analysis({
        verdict: 'insufficient_input',
        stance_counts: { agree: 0, agree_with_changes: 0, disagree: 0, not_my_area: 4 },
        themes: [], unit_conflicts: [], decision_items: [], proposed_changes: [],
      }) as never,
      f,
    );
    expect(result.ok).toBe(true);
  });
});

describe('support given in prose is RECORDED, not refused', () => {
  // This is what failed the real run of 28 November 2026. Eight citations of
  // this kind, out of eighty sections, discarded every finding in all eighty
  // after the whole analysis had been paid for.

  it('keeps a proposal whose support came from a section comment', () => {
    const result = validateSectionAnalysis(
      analysis({
        decision_items: [{
          decision_item_id: 'item-1',
          current_value: '11:00',
          // r1 is a comment on the section, not an answer typed into the box.
          proposals: [{ value: '14:00', support: 1, response_ids: ['r1'] }],
          recommended_value: '14:00',
          rationale: 'x',
          status: 'recommended',
        }],
      }) as never,
      facts(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.corrections.map((c) => c.kind))
      .toContain('citation-outside-decision-item');
  });

  it('names the response and the place, so the Chairman can go and read it', () => {
    const result = validateSectionAnalysis(
      analysis({
        decision_items: [{
          decision_item_id: 'item-1',
          current_value: '11:00',
          proposals: [{ value: '14:00', support: 2, response_ids: ['ir1', 'r2'] }],
          recommended_value: '14:00',
          rationale: 'x',
          status: 'recommended',
        }],
      }) as never,
      facts(),
    );
    if (!result.ok) throw new Error('expected this to pass');
    const noted = result.corrections.find((c) => c.kind === 'citation-outside-decision-item');
    expect(noted?.detail).toContain('r2');
    expect(noted?.detail).toContain('14:00');
    expect(noted?.where).toBe('decision item 1, proposal 1');
    // The one that DID answer the box is not reported as anything.
    expect(result.corrections.filter((c) => c.detail.includes('ir1'))).toHaveLength(0);
  });

  it('does not let the recorded citation inflate the number on the page', () => {
    // The guard that survives: support beyond the citations is still refused,
    // so a proposal can never claim more backing than it names.
    const result = validateSectionAnalysis(
      analysis({
        decision_items: [{
          decision_item_id: 'item-1',
          current_value: '11:00',
          proposals: [{ value: '14:00', support: 5, response_ids: ['r1'] }],
          recommended_value: '14:00',
          rationale: 'x',
          status: 'recommended',
        }],
      }) as never,
      facts(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations.map((v) => v.kind)).toContain('support-exceeds-citations');
  });

  it('tells the model which ids answered each open value', () => {
    // The prompt asks and the input shows. Without the second, the model had
    // to infer from two undifferentiated id lists which belonged where.
    const input = read('src/lib/policy/analysis/input.ts');
    expect(input).toContain('answered in its own box by');
    const prompt = read('src/lib/policy/analysis/prompt.ts');
    expect(prompt).toContain('answered it in its own box');
    expect(prompt).toContain('never to a larger number');
  });
});

describe('a missing safety flag is CORRECTED, not refused', () => {
  it('flags a change that rests on a patient-safety response', () => {
    // Rejecting the run would discard twenty good findings to punish a missing
    // boolean, and the likely next move would be re-running until it passed.
    const result = validateSectionAnalysis(
      analysis({
        proposed_changes: [{
          type: 'wording',
          current_text: 'The list is agreed on Thursday.',
          proposed_text: 'The list is agreed on Friday.',
          rationale: 'x',
          support_strength: 'weak',
          response_ids: ['r1'],
          clinical_review_required: false,
        }],
      }) as never,
      facts({ safetyResponseIds: new Set(['r1']) }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.proposed_changes[0].clinical_review_required).toBe(true);
    expect(result.corrections[0].kind).toBe('forced-clinical-review');
  });

  it('flags a change whose wording touches a clinical provision', () => {
    const result = validateSectionAnalysis(
      analysis({
        proposed_changes: [{
          type: 'wording',
          current_text: 'The anaesthetist may decline an unsafe case.',
          proposed_text: 'The anaesthetist should discuss concerns with the manager.',
          rationale: 'x',
          support_strength: 'weak',
          response_ids: ['r1'],
          clinical_review_required: false,
        }],
      }) as never,
      facts(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.proposed_changes[0].clinical_review_required).toBe(true);
  });

  it('leaves an already-flagged change alone', () => {
    const result = validateSectionAnalysis(
      analysis({
        proposed_changes: [{
          type: 'wording',
          current_text: 'Consent must be signed.',
          proposed_text: 'Consent must be signed and witnessed.',
          rationale: 'x',
          support_strength: 'strong',
          response_ids: ['r1'],
          clinical_review_required: true,
        }],
      }) as never,
      facts(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.corrections).toHaveLength(0);
  });

  it('recognises the clinical language it is meant to catch', () => {
    for (const phrase of [
      'the surgeon may decline the case',
      'haemoglobin below the threshold',
      'nil by mouth from midnight',
      'consent and patient identity',
      'the airway assessment',
      'contraindicated in this patient',
    ]) {
      expect(touchesClinicalSafety(phrase), phrase).toBe(true);
    }
  });

  it('does not flag ordinary administrative wording', () => {
    for (const phrase of [
      'the list is circulated on Thursday afternoon',
      'the booking officer enters the folder number',
      'rosters are published weekly',
    ]) {
      expect(touchesClinicalSafety(phrase), phrase).toBe(false);
    }
  });
});

describe('the later passes may only name what they were given', () => {
  it('rejects a cross-section finding about a section not in the policy', () => {
    const result = validateCrossSection(
      { inconsistencies: [{ summary: 'x', section_ids: ['sec-5', 'sec-ghost'], conflicting_values: [] }] },
      new Set(['sec-5']),
    );
    expect(result.ok).toBe(false);
  });

  it('accepts an empty finding list rather than demanding a concern', () => {
    expect(validateCrossSection({ inconsistencies: [] }, new Set(['sec-5'])).ok).toBe(true);
  });

  it('rejects a synthesis naming an unknown section or open value', () => {
    const base = {
      executive_summary: 'x',
      areas_of_agreement: [],
      contested_issues: [],
      critical_concerns: [],
      unit_barriers: [],
      recommended_decision_values: [],
      for_the_meeting: [],
    };
    const known = { sectionIds: new Set(['sec-5']), decisionItemIds: new Set(['item-1']) };

    expect(validateSynthesis(
      { ...base, contested_issues: [{ summary: 'x', section_ids: ['nope'] }] } as never,
      known,
    ).ok).toBe(false);

    expect(validateSynthesis(
      {
        ...base,
        recommended_decision_values: [{ decision_item_id: 'nope', recommended_value: '1', note: null }],
      } as never,
      known,
    ).ok).toBe(false);

    expect(validateSynthesis(base as never, known).ok).toBe(true);
  });

  it('allows a critical concern with no section attached', () => {
    const result = validateSynthesis(
      {
        executive_summary: 'x',
        areas_of_agreement: [],
        contested_issues: [],
        critical_concerns: [{ type: 'feasibility', summary: 'x', section_id: null }],
        unit_barriers: [],
        recommended_decision_values: [],
        for_the_meeting: [],
      } as never,
      { sectionIds: new Set(['sec-5']), decisionItemIds: new Set() },
    );
    expect(result.ok).toBe(true);
  });
});

describe('building the revised policy', () => {
  const sections: SectionForProposal[] = [
    { id: 's1', number: '1', title: 'Purpose', parentId: null, order: 0, body: 'This policy covers booking.', isAppendix: false },
    { id: 's3', number: '3', title: 'Roles', parentId: null, order: 1, body: 'Everyone has a part.', isAppendix: false },
    { id: 's3a', number: '3.1', title: 'The surgeon', parentId: 's3', order: 0, body: 'The surgeon books by [15:30].', isAppendix: false },
  ];

  const change = (over: Partial<AcceptedChange> = {}): AcceptedChange => ({
    id: 'c1',
    sectionId: 's1',
    type: 'WORDING',
    currentText: 'This policy covers booking.',
    finalText: 'This policy covers booking and cancellation.',
    rationale: 'Four reviewers asked for cancellation to be in scope.',
    supportingResponseIds: ['r1', 'r2'],
    clinicalReviewRequired: false,
    ...over,
  });

  it('applies an accepted wording change', () => {
    const out = buildFinalProposal({
      policyTitle: 'Theatre Policy', version: '0.3', sections, changes: [change()], settledValues: [],
    });
    expect(out.body).toContain('This policy covers booking and cancellation.');
    expect(out.applied).toBe(1);
    expect(out.unapplied).toBe(0);
  });

  it('REPORTS an accepted change it could not apply, instead of swallowing it', () => {
    // The failure this generator is built around. A silent no-op hands the
    // Chairman a document that does not contain the change he accepted, and he
    // takes it to Management believing it does.
    const out = buildFinalProposal({
      policyTitle: 'Theatre Policy',
      version: '0.3',
      sections,
      changes: [change({ currentText: 'Wording that is no longer there.' })],
      settledValues: [],
    });
    expect(out.applied).toBe(0);
    expect(out.unapplied).toBe(1);
    expect(out.changeLog[0].applied).toBe(false);
    expect(out.changeLog[0].reason).toMatch(/not in the section as it now stands/i);
    expect(out.body).not.toContain('cancellation');
  });

  it('tolerates a quote that differs only by whitespace', () => {
    const out = buildFinalProposal({
      policyTitle: 'T', version: '0.3', sections,
      changes: [change({ currentText: 'This policy   covers\nbooking.' })],
      settledValues: [],
    });
    expect(out.applied).toBe(1);
    expect(out.body).toContain('booking and cancellation');
  });

  it('substitutes a settled open value', () => {
    const out = buildFinalProposal({
      policyTitle: 'T', version: '0.3', sections, changes: [],
      settledValues: [{
        decisionItemId: 'd1', sectionId: 's3a', placeholder: '[15:30]',
        finalValue: '16:00', rationale: 'Five of nine asked for it.',
      }],
    });
    expect(out.body).toContain('The surgeon books by 16:00.');
    expect(out.body).not.toContain('[15:30]');
    expect(out.changeLog[0].applied).toBe(true);
  });

  it('reports a settled value whose placeholder has gone', () => {
    const out = buildFinalProposal({
      policyTitle: 'T', version: '0.3', sections, changes: [],
      settledValues: [{
        decisionItemId: 'd1', sectionId: 's3a', placeholder: '[09:00]',
        finalValue: '10:00', rationale: null,
      }],
    });
    expect(out.unapplied).toBe(1);
    expect(out.changeLog[0].reason).toMatch(/no longer in this section/i);
  });

  it('settles values BEFORE applying wording changes', () => {
    // A wording change may quote a sentence that still contains a placeholder;
    // substituting afterwards would miss the replacement the Chairman accepted.
    const out = buildFinalProposal({
      policyTitle: 'T', version: '0.3', sections,
      changes: [change({
        sectionId: 's3a',
        currentText: 'The surgeon books by 16:00.',
        finalText: 'The surgeon books the case by 16:00.',
      })],
      settledValues: [{
        decisionItemId: 'd1', sectionId: 's3a', placeholder: '[15:30]',
        finalValue: '16:00', rationale: null,
      }],
    });
    expect(out.unapplied).toBe(0);
    expect(out.body).toContain('The surgeon books the case by 16:00.');
  });

  it('removes text on a REMOVE and appends on an ADD', () => {
    const removed = buildFinalProposal({
      policyTitle: 'T', version: '0.3', sections,
      changes: [change({ type: 'REMOVE', finalText: '' })],
      settledValues: [],
    });
    expect(removed.body).not.toContain('This policy covers booking.');

    const added = buildFinalProposal({
      policyTitle: 'T', version: '0.3', sections,
      changes: [change({ type: 'ADD', currentText: null, finalText: 'Cancellations are audited monthly.' })],
      settledValues: [],
    });
    expect(added.body).toContain('Cancellations are audited monthly.');
    expect(added.applied).toBe(1);
  });

  it('keeps the section tree, so 3.1 follows 3', () => {
    const out = buildFinalProposal({
      policyTitle: 'T', version: '0.3', sections, changes: [], settledValues: [],
    });
    expect(out.body.indexOf('## 3 Roles')).toBeLessThan(out.body.indexOf('### 3.1 The surgeon'));
    expect(out.body.indexOf('## 1 Purpose')).toBeLessThan(out.body.indexOf('## 3 Roles'));
  });

  it('records every change in the log, applied or not', () => {
    const out = buildFinalProposal({
      policyTitle: 'T', version: '0.3', sections,
      changes: [change(), change({ id: 'c2', currentText: 'missing' })],
      settledValues: [],
    });
    expect(out.changeLog).toHaveLength(2);
    expect(out.changeLog.map((e) => e.changeId)).toEqual(['c1', 'c2']);
    expect(out.changeLog.map((e) => e.applied)).toEqual([true, false]);
  });

  it('carries the rationale and the supporting responses into the log', () => {
    const out = buildFinalProposal({
      policyTitle: 'T', version: '0.3', sections, changes: [change()], settledValues: [],
    });
    expect(out.changeLog[0].rationale).toContain('Four reviewers');
    expect(out.changeLog[0].supportingResponseIds).toEqual(['r1', 'r2']);
  });

  it('renders a change log that cannot break its own table', () => {
    const log = renderChangeLog([{
      changeId: 'c1', sectionId: 's1', sectionLabel: '1. Purpose | scope',
      type: 'WORDING', applied: true, reason: null,
      before: 'a', after: 'b | c', rationale: 'because | reasons',
      supportingResponseIds: ['r1'], clinicalReviewRequired: false,
    }]);
    expect(log).toContain('1. Purpose \\| scope');
    expect(log).toContain('b \\| c');
    expect(log.split('\n')[0]).toContain('| Section |');
  });

  it('says so plainly when nothing was accepted', () => {
    expect(renderChangeLog([])).toMatch(/no changes were accepted/i);
  });
});

describe('the decisions that must not quietly change', () => {
  it('sends no reviewer NAMES to the model, only role and unit', () => {
    // The spec permits names; this narrows it. A name adds nothing the
    // analysis can use, and the report should say "the Head of Anaesthesia".
    const input = codeOf('src/lib/policy/analysis/input.ts');
    expect(input).not.toContain('inviteeName');
    expect(input).toContain('inviteeRole');
    expect(input).toContain('inviteeUnit');
  });

  it('sets no temperature, because the parameter is rejected outright', () => {
    const run = codeOf('src/lib/policy/analysis/run.ts');
    expect(run).not.toContain('temperature');
    expect(run).toContain("effort: 'high'");
  });

  it('counts tokens with the API before it spends anything', () => {
    const run = codeOf('src/lib/policy/analysis/run.ts');
    expect(run).toContain('countTokens');
    expect(run).toContain('POLICY_ANALYSIS_MAX_CENTS');
  });

  it('stores a failed run rather than retrying it quietly', () => {
    const run = codeOf('src/lib/policy/analysis/run.ts');
    expect(run).toContain('FAILED_VALIDATION');
    expect(run).toContain('validationErrors');
  });

  it('applies ACCEPTED and EDITED changes only', () => {
    const route = codeOf('src/app/api/policy/rounds/[id]/final-proposal/route.ts');
    expect(route).toContain("ownerDecision: { in: ['ACCEPTED', 'EDITED'] }");
  });

  it('bumps the prompt version alongside the prompt', () => {
    const prompt = read('src/lib/policy/analysis/prompt.ts');
    expect(prompt).toMatch(/PROMPT_VERSION = 'policy-analysis-v\d+'/);
  });
});

describe('the run survives being cut off, without paying twice', () => {
  // An eighty-section policy at high effort does not finish inside one
  // function invocation however long it is allowed. A single-shot run would be
  // killed every time on the cloud node, after paying for whatever had
  // completed. These pin the things that make that safe.

  const run = codeOf('src/lib/policy/analysis/run.ts');
  const route = codeOf('src/app/api/policy/rounds/[id]/analysis/route.ts');
  const page = codeOf('src/app/dashboard/policy-review/[id]/analysis/page.tsx');

  it('declares the longest duration the PLAN allows, not the Hobby limit', () => {
    // This said 60 and was pinned at 60 by this very test, which is how a
    // wrong assumption survived review. 60 is the Hobby ceiling; the account
    // is on Pro, where 300 is allowed. On 27 Nov 2026 production logged
    // "Vercel Runtime Timeout Error: Task timed out after 60 seconds" against
    // this route twice, with nothing banked and the run stuck at RUNNING.
    expect(route).toContain('maxDuration = 300');
    expect(route).not.toContain('maxDuration = 60');
    // 800 is the Fluid-compute ceiling, not this one.
    expect(route).not.toContain('maxDuration = 800');
  });

  it('hands back BEFORE the function is killed, with time left to save', () => {
    // A soft deadline equal to the hard one banks nothing, which was exactly
    // the shipped failure. The gap pays for the calls still in flight and for
    // writing what came back.
    const soft = run.match(/const SOFT_DEADLINE_MS = ([\d_]+);/);
    expect(soft).not.toBeNull();
    const softMs = Number(soft![1].replace(/_/g, ''));
    const hardMs = Number(route.match(/maxDuration = (\d+)/)![1]) * 1000;
    expect(softMs).toBeLessThan(hardMs);
    expect(hardMs - softMs).toBeGreaterThanOrEqual(45_000);
  });

  it('gives each CALL a deadline, not just the pass', () => {
    // The pass deadline only stops a call STARTING. One already in flight runs
    // until the platform kills the function and takes every finished section
    // with it. That is the bug; this is the fix.
    expect(run).toContain('timeout: Math.max(MIN_CALL_MS, deadline - Date.now())');
  });

  it('treats a call that ran out of time as skipped, not as a failed run', () => {
    // Otherwise one slow section throws, the pooled pass rejects, and the
    // sections that DID come back are thrown away unbanked.
    expect(run).toContain('ranOutOfTime');
    expect(run).toContain('APIConnectionTimeoutError');
    expect(run).toContain('APIUserAbortError');
    expect(run).toContain('if (!ranOutOfTime(err)) throw err;');
  });

  it('keeps saying it is alive, so the concurrency guard still means something', () => {
    // The guard reads updatedAt fresh within 20s. A slice that works for four
    // minutes and writes only at the end looks abandoned throughout, and the
    // production logs show overlapping slices really do happen.
    expect(run).toContain('HEARTBEAT_MS');
    expect(run).toContain('const heartbeat = setInterval(');
    expect(run).toContain('clearInterval(heartbeat);');
    const beat = Number(run.match(/const HEARTBEAT_MS = ([\d_]+);/)![1].replace(/_/g, ''));
    // Two missed beats inside the route's twenty-second window.
    expect(beat * 2).toBeLessThanOrEqual(20_000);
  });

  it('stops the heartbeat on EVERY exit, including a refusal', () => {
    // A finally, not a line at the happy end: a run that returns FAILED_API
    // must not keep the next press locked out for twenty seconds.
    expect(run).toMatch(/\}\s*finally\s*\{[\s\S]*clearInterval\(heartbeat\);[\s\S]*\}/);
  });

  it('banks the expensive pass BEFORE the cheap ones can fail', () => {
    // The per-section calls are the bill. If the cross-section or synthesis
    // call is cut off, those must already be stored.
    // The USE site, not the import at the top of the file — which is what an
    // earlier version of this test measured, and why it failed on correct code.
    const bankAt = run.indexOf('partial: true');
    const crossAt = run.indexOf('system: CROSS_SECTION_PROMPT');
    expect(bankAt).toBeGreaterThan(0);
    expect(crossAt).toBeGreaterThan(0);
    expect(bankAt).toBeLessThan(crossAt);
  });

  it('resumes the earlier run by its input snapshot, and skips what is done', () => {
    expect(run).toContain("status: 'RUNNING'");
    expect(run).toContain('inputSnapshotHash: snapshot');
    expect(run).toContain('alreadyDone');
    expect(run).toContain('!alreadyDone.has(i.sectionId)');
  });

  it('carries the spend forward, so the ceiling bounds the whole analysis', () => {
    // Otherwise a run resumed five times could spend five times the cap with
    // no single slice noticing.
    expect(run).toContain('inputTokens: run.inputTokens ?? 0');
    expect(run).toContain('spend() + centsFor(');
  });

  it('stops starting calls past the deadline rather than after', () => {
    // A call started past the deadline gets killed mid-flight and billed anyway.
    expect(run).toContain('if (Date.now() > deadline) return undefined;');
  });

  it('lets the caller come back, but refuses two slices at once', () => {
    // Refusing a RUNNING run outright would block the very mechanism that
    // makes progress; allowing concurrency would double the bill.
    expect(route).toContain('updatedAt: { gt: new Date(Date.now() - 20_000) }');
    expect(route).toContain('status: 409');
  });

  it('bounds the client loop, because an endless one spends real money', () => {
    expect(page).toContain('MAX_SLICES');
    expect(page).toMatch(/slice < MAX_SLICES/);
  });
});
