/**
 * What the counting is allowed to say.
 *
 * The arithmetic here is easy and almost not worth testing. What is worth
 * testing — and what these tests are really for — is the three rules that stop
 * a dashboard built on routine records from making claims it cannot support:
 *
 *   No causal language, anywhere. These are observational counts from case
 *   notes. They can show that practice varies and that an outcome occurred
 *   alongside a practice; they cannot show that the practice caused it.
 *
 *   A small denominator is not a finding. Three cases is three cases, not a
 *   100% rate, and a comparison built on it is noise — published, in a hospital,
 *   against named groups.
 *
 *   A field nobody filled in is counted as not recorded. Never folded into the
 *   commonest value, never dropped from the denominator.
 *
 * A future change that quietly relaxes any of these would look like an
 * improvement in a diff. It would fail here.
 */
import { describe, expect, it } from 'vitest';

import {
  distribution, multiDistribution, practiceVariation, outcomeAssociation,
  completeness, MIN_CASES,
} from '../../src/lib/postop/analytics';

/** Words that would turn a description of practice into a claim about effect. */
const CAUSAL = /\bcaus|\bbecause of\b|\bleads to\b|\bresults in\b|\bdue to\b|\bprevents\b|\bbetter than\b|\bsafer\b|\beffective\b/i;

describe('a distribution', () => {
  it('reports what was recorded, as labels and shares', () => {
    const d = distribution('Hair removal', 'HAIR_REMOVAL_STATUS', [
      { value: 'PERFORMED', count: 30 },
      { value: 'NOT_PERFORMED', count: 10 },
    ], 50);
    expect(d.items[0].label).toBe('Performed');
    expect(d.items[0].percent).toBe(60);
  });

  it('counts what nobody answered, rather than hiding it', () => {
    // The difference between the total and the answers IS the finding, for the
    // first year at least.
    const d = distribution('Wound class', 'WOUND_CLASSES', [{ value: 'CLEAN', count: 20 }], 100);
    expect(d.notRecorded).toBe(80);
  });

  it('never divides by the answered count, which would hide the gap', () => {
    const d = distribution('Wound class', 'WOUND_CLASSES', [{ value: 'CLEAN', count: 20 }], 100);
    expect(d.items[0].percent).toBe(20);
  });

  it('orders by how common it is', () => {
    const d = distribution('Wound class', 'WOUND_CLASSES', [
      { value: 'CLEAN', count: 5 },
      { value: 'CONTAMINATED', count: 25 },
    ], 30);
    expect(d.items[0].value).toBe('CONTAMINATED');
  });

  it('copes with no notes at all rather than dividing by zero', () => {
    const d = distribution('Wound class', 'WOUND_CLASSES', [], 0);
    expect(d.items).toHaveLength(0);
    expect(d.notRecorded).toBe(0);
  });

  it('marks a multi-select as overlapping, so nobody reads it as a pie', () => {
    // An operation using diathermy AND suture ligation used both. Presenting
    // these as competing shares of one whole misrepresents every such case.
    const d = multiDistribution('Haemostasis', 'HAEMOSTASIS_METHODS', [
      { value: 'DIATHERMY_BIPOLAR', count: 80 },
      { value: 'SUTURE_LIGATION', count: 70 },
    ], 100);
    expect(d.overlapping).toBe(true);
    expect(d.items[0].percent + d.items[1].percent).toBeGreaterThan(100);
  });
});

describe('practice variation', () => {
  const groups = (a: number, b: number) => ([
    { group: 'Unit A', cases: 100, counts: [{ value: 'DIATHERMY_BIPOLAR', count: a }] },
    { group: 'Unit B', cases: 100, counts: [{ value: 'DIATHERMY_BIPOLAR', count: b }] },
  ]);

  it('reports the range across groups', () => {
    const f = practiceVariation('HAEMOSTASIS_METHODS', groups(90, 20));
    expect(f).toHaveLength(1);
    expect(f[0].highest).toBe(90);
    expect(f[0].lowest).toBe(20);
    expect(f[0].spread).toBe(70);
  });

  it('says nothing when the groups broadly agree', () => {
    expect(practiceVariation('HAEMOSTASIS_METHODS', groups(60, 55))).toHaveLength(0);
  });

  it('excludes a group too small to compare', () => {
    const f = practiceVariation('HAEMOSTASIS_METHODS', [
      { group: 'Big', cases: 100, counts: [{ value: 'DIATHERMY_BIPOLAR', count: 90 }] },
      { group: 'Tiny', cases: 3, counts: [{ value: 'DIATHERMY_BIPOLAR', count: 0 }] },
    ]);
    // Only one comparable group remains, so there is nothing to compare.
    expect(f).toHaveLength(0);
  });

  it('will not compare a single group with itself', () => {
    expect(practiceVariation('HAEMOSTASIS_METHODS', [
      { group: 'Only', cases: 100, counts: [{ value: 'DIATHERMY_BIPOLAR', count: 90 }] },
    ])).toHaveLength(0);
  });

  it('says how many groups the statement rests on', () => {
    const f = practiceVariation('HAEMOSTASIS_METHODS', groups(90, 20));
    expect(f[0].groupsCompared).toBe(2);
    expect(f[0].statement).toContain('2 groups');
    expect(f[0].statement).toContain(String(MIN_CASES));
  });

  it('describes variation and disclaims any difference in outcome', () => {
    const f = practiceVariation('HAEMOSTASIS_METHODS', groups(90, 20));
    expect(f[0].statement).toMatch(/variation in practice, not a difference in outcome/);
    expect(f[0].statement).not.toMatch(CAUSAL);
  });

  it('puts the widest variation first', () => {
    const f = practiceVariation('HAEMOSTASIS_METHODS', [
      { group: 'A', cases: 100, counts: [{ value: 'DIATHERMY_BIPOLAR', count: 90 }, { value: 'TOURNIQUET', count: 50 }] },
      { group: 'B', cases: 100, counts: [{ value: 'DIATHERMY_BIPOLAR', count: 10 }, { value: 'TOURNIQUET', count: 25 }] },
    ]);
    expect(f[0].value).toBe('DIATHERMY_BIPOLAR');
  });
});

describe('an outcome alongside a practice', () => {
  it('reports both frequencies and their difference', () => {
    const a = outcomeAssociation('PREP_AGENTS', 'POVIDONE_IODINE',
      { cases: 200, events: 10 }, { cases: 100, events: 10 }, 'Surgical site infection');
    expect(a.withPractice.percent).toBe(5);
    expect(a.withoutPractice.percent).toBe(10);
    expect(a.difference).toBe(-5);
    expect(a.comparable).toBe(true);
  });

  it('refuses to compare when either arm is too small', () => {
    const a = outcomeAssociation('PREP_AGENTS', 'POVIDONE_IODINE',
      { cases: 200, events: 10 }, { cases: 4, events: 2 }, 'Surgical site infection');
    expect(a.comparable).toBe(false);
    expect(a.difference).toBe(0);
    expect(a.statement).toMatch(/Too few cases to compare/);
  });

  it('warns that the groups differ in other ways', () => {
    // The confounding is enormous: a dirty wound is debrided AND gets infected.
    const a = outcomeAssociation('PREP_AGENTS', 'POVIDONE_IODINE',
      { cases: 200, events: 10 }, { cases: 100, events: 10 }, 'Surgical site infection');
    expect(a.statement).toMatch(/not a trial/);
    expect(a.statement).toMatch(/differ in many ways/);
    expect(a.statement).toMatch(/must not\s+be read as an effect/);
  });

  it('uses no causal language in either branch', () => {
    const comparable = outcomeAssociation('PREP_AGENTS', 'CETRIMIDE',
      { cases: 200, events: 10 }, { cases: 100, events: 10 }, 'Surgical site infection');
    const tooSmall = outcomeAssociation('PREP_AGENTS', 'CETRIMIDE',
      { cases: 2, events: 1 }, { cases: 100, events: 10 }, 'Surgical site infection');
    expect(comparable.statement).not.toMatch(CAUSAL);
    expect(tooSmall.statement).not.toMatch(CAUSAL);
  });

  it('does not rank or judge — it has no field in which to do so', () => {
    const a = outcomeAssociation('PREP_AGENTS', 'CETRIMIDE',
      { cases: 200, events: 5 }, { cases: 200, events: 40 }, 'Surgical site infection');
    const keys = Object.keys(a);
    expect(keys).not.toContain('better');
    expect(keys).not.toContain('recommended');
    expect(keys).not.toContain('significant');
    expect(keys).not.toContain('pValue');
  });
});

describe('completeness', () => {
  it('shows the worst-completed fields first', () => {
    const c = completeness([
      { field: 'a', title: 'A', recorded: 90 },
      { field: 'b', title: 'B', recorded: 12 },
    ], 100);
    expect(c[0].field).toBe('b');
    expect(c[0].percent).toBe(12);
  });

  it('copes with no notes rather than dividing by zero', () => {
    expect(completeness([{ field: 'a', title: 'A', recorded: 0 }], 0)[0].percent).toBe(0);
  });
});
