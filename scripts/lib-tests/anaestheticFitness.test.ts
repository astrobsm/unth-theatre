/**
 * Fitness for the proposed anaesthesia.
 *
 * The rule with the sharpest edge in the review: a patient declared unfit must
 * stay unfit until an anaesthetist says otherwise. Every plausible way of
 * lifting that flag by accident is tested below, because each of them is a
 * patient reaching a theatre somebody had already decided they should not
 * reach.
 */
import { describe, expect, it } from 'vitest';

import {
  MIN_ACTION_LENGTH,
  blocksReadyForTheatre,
  canCompleteReview,
  canDeclareFit,
  fitnessLabel,
  outstandingRequirements,
  type OptimisationRequirement,
} from './anaesthesia/fitness';

const REVIEWER = 'anaes-1';

const requirement = (over: Partial<OptimisationRequirement> = {}): OptimisationRequirement => ({
  category: 'HAEMOGLOBIN_OPTIMISATION',
  action: 'Transfuse two units and repeat the full blood count before the list.',
  responsible: 'Ward team',
  priority: 'HIGH',
  status: 'OUTSTANDING',
  ...over,
});

describe('the review cannot end without a decision', () => {
  it('refuses a review with no fitness decision', () => {
    // The free-text era: everybody downstream left to infer the answer.
    const r = canCompleteReview({ decision: null, reviewerId: REVIEWER });
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toContain('fit for the proposed anaesthesia');
  });

  it('accepts a straightforward FIT', () => {
    expect(canCompleteReview({ decision: 'FIT', reviewerId: REVIEWER }).ok).toBe(true);
  });

  it('refuses a review with no identified reviewer', () => {
    // Taken from the session, never the body. Without it there is nobody to
    // ask about the decision afterwards.
    expect(canCompleteReview({ decision: 'FIT', reviewerId: null }).ok).toBe(false);
  });
});

describe('NOT FIT must say what would change the answer', () => {
  it('refuses NOT FIT with no requirements at all', () => {
    // A dead end: the case stalls with nobody knowing what would move it.
    const r = canCompleteReview({ decision: 'NOT_FIT', requirements: [], reviewerId: REVIEWER });
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toContain('at least one requirement');
  });

  it('accepts NOT FIT with a specific action', () => {
    const r = canCompleteReview({
      decision: 'NOT_FIT', requirements: [requirement()], reviewerId: REVIEWER,
    });
    expect(r.ok).toBe(true);
  });

  it('refuses a requirement that is only a category', () => {
    // "Haemoglobin optimisation required" tells the ward nothing it can act on.
    const r = canCompleteReview({
      decision: 'NOT_FIT', requirements: [requirement({ action: 'Hb low' })], reviewerId: REVIEWER,
    });
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toContain('not an instruction');
    expect('Hb low'.length).toBeLessThan(MIN_ACTION_LENGTH);
  });

  it('names which requirement is at fault', () => {
    const r = canCompleteReview({
      decision: 'NOT_FIT',
      requirements: [requirement(), requirement({ action: 'x' })],
      reviewerId: REVIEWER,
    });
    expect(r.problems.join(' ')).toContain('Requirement 2');
  });
});

describe('a case cannot reach the theatre while the patient is unfit', () => {
  it('blocks readiness outright when NOT FIT', () => {
    const msg = blocksReadyForTheatre({ decision: 'NOT_FIT', requirements: [requirement()] });
    expect(msg).toContain('not fit for the proposed anaesthesia');
  });

  it('still blocks when every requirement has been done', () => {
    // THE assertion. Completing the tasks is evidence for a reassessment, not
    // a substitute for one — a patient must not become fit by arithmetic.
    const msg = blocksReadyForTheatre({
      decision: 'NOT_FIT',
      requirements: [requirement({ status: 'VERIFIED' }), requirement({ status: 'VERIFIED' })],
    });
    expect(msg).not.toBe(null);
    expect(msg).toContain('reassess');
  });

  it('does not treat COMPLETED as settled', () => {
    // The person who did the work says COMPLETED; somebody checking says
    // VERIFIED. Collapsing the two leaves the only evidence being the word of
    // whoever was asked to do it.
    const outstanding = outstandingRequirements([
      requirement({ status: 'COMPLETED' }),
      requirement({ status: 'VERIFIED' }),
    ]);
    expect(outstanding).toHaveLength(1);
  });

  it('blocks a case nobody has reviewed', () => {
    expect(blocksReadyForTheatre({ decision: null })).toContain('has not been recorded');
  });

  it('permits a case declared fit', () => {
    expect(blocksReadyForTheatre({ decision: 'FIT' })).toBe(null);
  });
});

describe('who may lift the flag', () => {
  it('allows an anaesthetist and a consultant anaesthetist', () => {
    expect(canDeclareFit({ role: 'ANAESTHETIST' })).toBe(true);
    expect(canDeclareFit({ role: 'CONSULTANT_ANAESTHETIST' })).toBe(true);
  });

  it('refuses everybody else, including the surgeon and the theatre manager', () => {
    // The people most motivated to get the case moving are exactly the ones
    // who must not be able to overrule the decision.
    for (const role of ['SURGEON', 'CONSULTANT_SURGEON', 'THEATRE_MANAGER', 'ADMIN', 'SCRUB_NURSE']) {
      expect(canDeclareFit({ role }), role).toBe(false);
    }
    expect(canDeclareFit(null)).toBe(false);
  });
});

describe('what a board shows', () => {
  it('counts what is still outstanding', () => {
    expect(fitnessLabel({
      decision: 'NOT_FIT',
      requirements: [requirement(), requirement({ status: 'VERIFIED' })],
    })).toBe('NOT FIT — 1 REQUIREMENT OUTSTANDING');
  });

  it('says plainly when the wait is for a person, not a task', () => {
    expect(fitnessLabel({
      decision: 'NOT_FIT', requirements: [requirement({ status: 'VERIFIED' })],
    })).toBe('NOT FIT — AWAITING REASSESSMENT');
  });

  it('distinguishes not-yet-reviewed from unfit', () => {
    // Two very different things that a single "not fit" badge would merge.
    expect(fitnessLabel({ decision: null })).toBe('NOT YET REVIEWED');
    expect(fitnessLabel({ decision: 'FIT' })).toBe('FIT FOR PROPOSED ANAESTHESIA');
  });
});
