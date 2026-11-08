// Putting a MODEL into words — a logistic regression, a survival curve, an
// AUC, a kappa — without saying more than it means.
//
// The rule from researchInterpret.test.ts carries over: a non-significant
// result is never "no association", only "none was detected". It matters more
// here, not less. A logistic regression prints one line per predictor, and a
// clinician reading six lines of which one has p < 0.05 will write up the
// other five as "no association" unless the words in front of them say
// otherwise. These interpreters are fed by the real engines, not by
// hand-written fixtures, so a change in an engine that breaks the wording
// shows up here.
import { describe, it, expect } from 'vitest';
import { logisticRegression, indicatorColumns } from '../../src/lib/research/regression';
import { kaplanMeierByGroup, logRank } from '../../src/lib/research/survival';
import { rocCurve, cohensKappa } from '../../src/lib/research/diagnostic';
import {
  interpretLogistic, interpretSurvival, interpretDiagnostic,
} from '../../src/lib/research/interpretModel';

/** Words that claim more than an observational analysis can support. */
const FORBIDDEN = /\b(proves?|proven|caused|causes|demonstrates?|confirms?)\b/i;

const allText = (i: { headline: string; plain: string; reporting: string; cautions: string[] }) =>
  [i.headline, i.plain, i.reporting, ...i.cautions].join(' ');

// ── A cohort with a real, strong association ───────────────────────
// 200 cases. Emergency cases have a much higher complication rate.
const strongCohort = () => {
  const outcome: boolean[] = [];
  const emergency: number[] = [];
  for (let i = 0; i < 100; i += 1) {
    emergency.push(1);
    outcome.push(i < 50);          // 50% of emergencies
  }
  for (let i = 0; i < 100; i += 1) {
    emergency.push(0);
    outcome.push(i < 10);          // 10% of electives
  }
  return { outcome, emergency };
};

// A cohort where the predictor carries no signal at all.
const flatCohort = () => {
  const outcome: boolean[] = [];
  const asa: number[] = [];
  // One of each ASA grade in every block of four, and whole blocks carry the
  // event — so the rate is identical in all four grades. (An outcome keyed off
  // `i` directly is NOT flat: i % 10 === 0 lands only on even values of i % 4.)
  for (let i = 0; i < 200; i += 1) {
    asa.push(i % 4 + 1);
    outcome.push(Math.floor(i / 4) % 10 === 0);   // 10% in every grade
  }
  return { outcome, asa };
};

describe('interpretLogistic', () => {
  it('reports a real association with its adjusted odds ratio and interval', () => {
    const { outcome, emergency } = strongCohort();
    const res = logisticRegression({
      outcome,
      predictors: [{ name: 'Emergency case', values: emergency }],
    });
    expect(res.ok).toBe(true);

    const i = interpretLogistic(res, { outcomeLabel: 'a complication' });
    expect(i.significant).toBe(true);
    expect(i.headline).toContain('Emergency case');
    expect(i.headline).toContain('adjusted OR');
    expect(i.headline).toContain('95% CI');
    // The odds ratio is (50/50)/(10/90) = 9.0, and it must be the number shown.
    expect(i.headline).toContain('9.0');
    expect(i.reporting).toContain('logistic regression');
    expect(FORBIDDEN.test(allText(i))).toBe(false);
  });

  it('never calls a non-significant predictor "no association"', () => {
    const { outcome, asa } = flatCohort();
    const res = logisticRegression({
      outcome,
      predictors: [{ name: 'ASA grade', values: asa }],
    });
    expect(res.ok).toBe(true);

    const i = interpretLogistic(res, { outcomeLabel: 'a complication' });
    expect(i.significant).toBe(false);
    expect(i.headline).toContain('No predictor');
    expect(i.headline).toContain('reached significance');
    // The forbidden claim, in any of its forms.
    expect(i.headline).not.toMatch(/no association|no effect|no difference between/i);
    expect(i.plain).toContain('not evidence that none exists');
    expect(i.reporting).toContain('No predictor reached statistical significance');
  });

  it('warns when there are too few events for the number of predictors', () => {
    // 60 cases, 6 events, 3 predictors — two events per predictor.
    const outcome: boolean[] = [];
    const a: number[] = [];
    const b: number[] = [];
    const c: number[] = [];
    for (let i = 0; i < 60; i += 1) {
      outcome.push(i < 6);
      a.push(i % 3);
      b.push(i % 5);
      c.push(i % 7);
    }
    const res = logisticRegression({
      outcome,
      predictors: [
        { name: 'A', values: a }, { name: 'B', values: b }, { name: 'C', values: c },
      ],
    });

    const i = interpretLogistic(res, { outcomeLabel: 'death' });
    const epv = i.cautions.find((x) => x.includes('per predictor'));
    expect(epv).toBeDefined();
    expect(epv).toContain('6 events for 3 predictors');
    expect(epv).toContain('below the');
    // The direction of the error is the part people get backwards.
    expect(epv).toContain('too narrow rather than too wide');
  });

  it('names the reference level, because the odds ratios are relative to it', () => {
    const { outcome } = strongCohort();
    const specialties = outcome.map((_, idx) => (idx < 100 ? 'General surgery' : 'Urology'));
    const expanded = indicatorColumns('Specialty', specialties);
    const res = logisticRegression({
      outcome,
      predictors: expanded.columns,
    });
    expect(expanded.reference).toBeTruthy();

    const i = interpretLogistic(res, {
      outcomeLabel: 'a complication',
      references: [{ field: 'Specialty', reference: expanded.reference! }],
    });
    const ref = i.cautions.find((x) => x.includes('compared against'));
    expect(ref).toBeDefined();
    expect(ref).toContain(expanded.reference!);
    expect(ref).toContain('changing the reference changes the numbers');
  });

  it('says a refused model was not run, and claims nothing from it', () => {
    const res = logisticRegression({
      outcome: [true, true, true, false, false],
      predictors: [{ name: 'Separated', values: [1, 1, 1, 0, 0] }],
    });
    expect(res.ok).toBe(false);

    const i = interpretLogistic(res, { outcomeLabel: 'death' });
    expect(i.headline).toContain('was not run');
    expect(i.significant).toBe(null);
    expect(i.cautions.join(' ')).toContain('Nothing can be concluded');
    expect(i.headline).not.toContain('OR');
  });

  it('always carries the observational caution and the unmeasured-confounder caution', () => {
    const { outcome, emergency } = strongCohort();
    const res = logisticRegression({
      outcome, predictors: [{ name: 'Emergency case', values: emergency }],
    });
    const i = interpretLogistic(res, { outcomeLabel: 'a complication' });
    const text = i.cautions.join(' ');
    expect(text).toContain('not a trial');
    expect(text).toContain('not evidence of cause');
    expect(text).toContain('A confounder that was not entered is not accounted for');
    expect(i.cautions.length).toBeGreaterThan(2);
  });
});

describe('interpretSurvival', () => {
  // Group A fails early, group B does not.
  const twoGroups = () => {
    const obs: Array<{ time: number; event: boolean; group: string }> = [];
    for (let i = 0; i < 40; i += 1) obs.push({ time: 2 + (i % 5), event: true, group: 'Open' });
    for (let i = 0; i < 40; i += 1) {
      obs.push({ time: 20 + (i % 5), event: i < 8, group: 'Laparoscopic' });
    }
    return obs;
  };

  it('describes a single curve and asks for a grouping before testing anything', () => {
    const obs = twoGroups().map((o) => ({ ...o, group: null }));
    const curves = kaplanMeierByGroup(obs);
    const i = interpretSurvival({
      curves, pValue: null, outcomeLabel: 'wound failure', timeUnit: 'days',
    });
    expect(i.significant).toBe(null);
    expect(i.plain).toContain('single curve');
    expect(i.plain).toContain('log-rank');
    expect(i.headline).not.toContain('differ');
  });

  it('reports a genuine difference between two curves', () => {
    const obs = twoGroups();
    const curves = kaplanMeierByGroup(obs);
    const lr = logRank(obs);
    expect(lr.pValue).not.toBeNull();

    const i = interpretSurvival({
      curves, pValue: lr.pValue, statistic: lr.statistic,
      outcomeLabel: 'wound failure', groupLabel: 'approach', timeUnit: 'days',
    });
    expect(i.significant).toBe(true);
    expect(i.headline).toContain('approach');
    expect(i.headline).toContain('log-rank');
    expect(i.plain).toContain('Read where they separate from the curve itself');
    expect(FORBIDDEN.test(allText(i))).toBe(false);
  });

  it('writes "was detected", not "there was no difference", when the test is negative', () => {
    // Identical groups.
    const obs: Array<{ time: number; event: boolean; group: string }> = [];
    for (let i = 0; i < 30; i += 1) {
      obs.push({ time: 5 + (i % 7), event: i % 3 === 0, group: 'Theatre 1' });
      obs.push({ time: 5 + (i % 7), event: i % 3 === 0, group: 'Theatre 2' });
    }
    const lr = logRank(obs);
    const i = interpretSurvival({
      curves: kaplanMeierByGroup(obs), pValue: lr.pValue,
      outcomeLabel: 'readmission', groupLabel: 'theatre', timeUnit: 'days',
    });
    expect(i.significant).toBe(false);
    expect(i.headline).toContain('was detected');
    expect(i.plain).toContain('not evidence that the groups are alike');
  });

  it('refuses to let a median be read off a curve that never reached half', () => {
    // Almost everybody is censored: the curve stays well above 50%.
    const obs = Array.from({ length: 50 }, (_, i) => ({
      time: 10 + i, event: i < 3, group: 'All cases',
    }));
    const curves = kaplanMeierByGroup(obs);
    expect(curves[0].medianSurvival).toBe(null);

    const i = interpretSurvival({
      curves, pValue: null, outcomeLabel: 'recurrence', timeUnit: 'months',
    });
    expect(i.headline).toContain('median was not reached');
    const note = i.cautions.find((x) => x.includes('never reached 50%'));
    expect(note).toBeDefined();
    expect(note).toContain('The longest follow-up is not a median');
  });

  it('says what censoring assumes, and refuses to extrapolate past follow-up', () => {
    const obs = twoGroups();
    const i = interpretSurvival({
      curves: kaplanMeierByGroup(obs), pValue: logRank(obs).pValue,
      outcomeLabel: 'wound failure', groupLabel: 'approach',
    });
    const text = i.cautions.join(' ');
    expect(text).toContain('censored');
    expect(text).toContain('the curve is optimistic');
    expect(text).toContain('must not be read off the');
  });

  it('warns that a significant log-rank across three curves does not name the pair', () => {
    const obs: Array<{ time: number; event: boolean; group: string }> = [];
    ['A', 'B', 'C'].forEach((g, gi) => {
      for (let i = 0; i < 30; i += 1) {
        obs.push({ time: 3 + gi * 10 + (i % 4), event: true, group: g });
      }
    });
    const lr = logRank(obs);
    const i = interpretSurvival({
      curves: kaplanMeierByGroup(obs), pValue: lr.pValue,
      outcomeLabel: 'failure', groupLabel: 'unit',
    });
    const note = i.cautions.find((x) => x.includes('in one test'));
    expect(note).toBeDefined();
    expect(note).toContain('does not say which pair differs');
  });

  it('says nothing at all when no case had a time and an outcome', () => {
    const i = interpretSurvival({ curves: [], pValue: null, outcomeLabel: 'death' });
    expect(i.significant).toBe(null);
    expect(i.headline).toContain('was not run');
  });
});

describe('interpretDiagnostic — ROC', () => {
  const scored = () => {
    const scores: number[] = [];
    const outcome: boolean[] = [];
    for (let i = 0; i < 60; i += 1) { scores.push(10 + i); outcome.push(i > 40); }
    return { scores, outcome };
  };

  it('leads with the AUC and its interval, and carries the engine\'s own sentence', () => {
    const { scores, outcome } = scored();
    const res = rocCurve({ scores, outcome, higherIsPositive: true });
    expect(res.ok).toBe(true);

    const i = interpretDiagnostic(res, {
      outcomeLabel: 'a complication', scoreLabel: 'estimated blood loss',
    });
    expect(i.headline).toContain('AUC');
    expect(i.headline).toContain('95% CI');
    expect(i.headline).toContain(res.interpretation);
    expect(i.plain).toContain('0.5 is a coin toss');
    expect(i.reporting).toContain('area under the ROC curve');
    expect(i.reporting).toContain('estimated blood loss');
    expect(FORBIDDEN.test(allText(i))).toBe(false);
  });

  it('warns first that the cut-off was chosen on the same data it is scored on', () => {
    const { scores, outcome } = scored();
    const i = interpretDiagnostic(rocCurve({ scores, outcome }), {
      outcomeLabel: 'a complication', scoreLabel: 'blood loss',
    });
    // This is the caution that stops a cut-off going straight into practice,
    // so it must be the first thing read, not the last.
    expect(i.cautions[0]).toContain('fits these');
    expect(i.cautions[0]).toContain('checked on a separate cohort before it is used');
  });

  it('says that predictive values move with how common the outcome is', () => {
    const { scores, outcome } = scored();
    const i = interpretDiagnostic(rocCurve({ scores, outcome }), {
      outcomeLabel: 'a complication', scoreLabel: 'blood loss',
    });
    const note = i.cautions.find((x) => x.includes('predictive values'));
    expect(note).toBeDefined();
    expect(note).toContain('different answers at the bedside');
  });

  it('flags a thin outcome count', () => {
    const scores = Array.from({ length: 40 }, (_, i) => i);
    const outcome = scores.map((_, i) => i > 36);   // 3 positives
    const i = interpretDiagnostic(rocCurve({ scores, outcome }), {
      outcomeLabel: 'death', scoreLabel: 'score',
    });
    const note = i.cautions.find((x) => x.includes('with the outcome and'));
    expect(note).toBeDefined();
    expect(note).toContain('moves a long way on one or two cases');
  });

  it('claims nothing from a refused ROC', () => {
    const res = rocCurve({ scores: [1, 2, 3], outcome: [true, true, true] });
    expect(res.ok).toBe(false);
    const i = interpretDiagnostic(res, { outcomeLabel: 'death' });
    expect(i.headline).toContain('was not run');
    expect(i.headline).not.toContain('AUC');
    expect(i.significant).toBe(null);
  });
});

describe('interpretDiagnostic — agreement', () => {
  const pairs = (n: number, disagreeEvery: number) => {
    const a: string[] = [];
    const b: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const v = i % 3 === 0 ? 'Clean' : i % 3 === 1 ? 'Clean-contaminated' : 'Contaminated';
      a.push(v);
      b.push(i % disagreeEvery === 0 ? 'Clean' : v);
    }
    return { a, b };
  };

  it('leads with kappa, not with the raw agreement people quote', () => {
    const { a, b } = pairs(90, 7);
    const res = cohensKappa(a, b);
    expect(res.ok).toBe(true);

    const i = interpretDiagnostic(res, { outcomeLabel: 'wound class' });
    expect(i.headline).toContain('kappa =');
    expect(i.headline).toContain(res.strength.toLowerCase());
    // Raw agreement belongs in the write-up, with kappa beside it.
    expect(i.reporting).toContain('Agreement between the two records was');
    expect(i.reporting).toContain("Cohen's kappa");
    expect(FORBIDDEN.test(allText(i))).toBe(false);
  });

  it('says first that agreement is not correctness', () => {
    const { a, b } = pairs(90, 7);
    const i = interpretDiagnostic(cohensKappa(a, b), { outcomeLabel: 'wound class' });
    expect(i.cautions[0]).toContain('nothing about which of the two is right');
    expect(i.cautions[0]).toContain('both');
  });

  it('warns that an unweighted kappa treats a near miss as a total miss', () => {
    const { a, b } = pairs(90, 7);
    const res = cohensKappa(a, b);
    expect(res.categories.length).toBeGreaterThan(2);
    const i = interpretDiagnostic(res, { outcomeLabel: 'wound class' });
    const note = i.cautions.find((x) => x.includes('all-or-nothing'));
    expect(note).toBeDefined();
    expect(note).toContain('a weighted kappa would not');
  });

  it('flags a small number of pairs', () => {
    const { a, b } = pairs(14, 5);
    const i = interpretDiagnostic(cohensKappa(a, b), { outcomeLabel: 'ASA grade' });
    expect(i.cautions.join(' ')).toContain('pairs were compared');
  });

  it('passes the paradox explanation through untouched', () => {
    // Nearly everything is one category: agreement is high, kappa is not.
    const a = Array.from({ length: 100 }, (_, i) => (i < 97 ? 'No' : 'Yes'));
    const b = Array.from({ length: 100 }, (_, i) => (i < 96 ? 'No' : 'Yes'));
    const res = cohensKappa(a, b);
    const i = interpretDiagnostic(res, { outcomeLabel: 'mortality' });
    expect(i.plain).toBe(res.interpretation);
  });
});
