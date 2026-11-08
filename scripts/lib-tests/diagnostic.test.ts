// ROC curves and Cohen's kappa.
//
// BOTH OF THESE ARE ROUTINELY MISREPORTED IN PRINT, and in both cases the
// error looks like a result. An AUC of 0.52 with a significant p-value gets
// written up as a predictor; a 95% raw agreement gets written up as excellent
// when the kappa is 0.1. So the tests here check the arithmetic against cases
// whose answer is known exactly — a perfect separator must give 1.0, a useless
// one exactly 0.5 — and they check that the module SAYS the uncomfortable
// thing rather than leaving the reader to spot it.
import { describe, it, expect } from 'vitest';
import {
  rocCurve, cohensKappa, describeAuc, describeKappa,
} from '../../src/lib/research/diagnostic';

describe('the ROC curve', () => {
  it('gives an AUC of exactly 1 for a perfect separator', () => {
    const scores = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const outcome = scores.map((s) => s > 6);
    const roc = rocCurve({ scores, outcome });
    expect(roc.ok).toBe(true);
    expect(roc.auc).toBe(1);
    expect(roc.bestCutoff!.sensitivity).toBe(1);
    expect(roc.bestCutoff!.specificity).toBe(1);
  });

  it('gives exactly 0.5 for a score that carries no information', () => {
    // Every score identical: ties count a half, which is what makes this come
    // out at 0.5 rather than at 0 or 1.
    const scores = new Array(20).fill(5);
    const outcome = scores.map((_, i) => i % 2 === 0);
    const roc = rocCurve({ scores, outcome });
    expect(roc.auc).toBe(0.5);
  });

  it('says a coin toss is a coin toss, whatever the p-value', () => {
    const scores = new Array(40).fill(0).map((_, i) => i % 3);
    const outcome = scores.map((_, i) => i % 2 === 0);
    const roc = rocCurve({ scores, outcome });
    expect(roc.auc).toBeLessThan(0.6);
    expect(roc.interpretation).toContain('coin toss');
  });

  it('handles a score where LOWER predicts the event', () => {
    // An Aldrete score or a haemoglobin: low is bad. Pointed the wrong way
    // this comes out below 0.5 and reads as a useless test.
    const scores = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const outcome = scores.map((s) => s <= 6);
    const wrongWay = rocCurve({ scores, outcome });
    const rightWay = rocCurve({ scores, outcome, higherIsPositive: false });
    expect(wrongWay.auc).toBe(0);
    expect(rightWay.auc).toBe(1);
  });

  it('reports the cut-off in the caller’s own units', () => {
    const scores = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const outcome = scores.map((s) => s <= 6);
    const roc = rocCurve({ scores, outcome, higherIsPositive: false });
    // Not the negated value the maths worked in.
    expect(roc.bestCutoff!.threshold).toBeGreaterThan(0);
    expect(roc.bestCutoff!.threshold).toBeLessThanOrEqual(12);
  });

  it('warns that Youden weights a miss and a false alarm equally', () => {
    const scores = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const roc = rocCurve({ scores, outcome: scores.map((s) => s > 6) });
    expect(roc.interpretation).toContain('rarely are');
  });

  it('gives a confidence interval that stays inside 0 and 1', () => {
    const scores = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const roc = rocCurve({ scores, outcome: scores.map((s) => s > 6) });
    expect(roc.ci95Lower!).toBeGreaterThanOrEqual(0);
    expect(roc.ci95Upper!).toBeLessThanOrEqual(1);
  });

  it('refuses when every case has the same outcome', () => {
    const roc = rocCurve({
      scores: new Array(20).fill(0).map((_, i) => i),
      outcome: new Array(20).fill(true),
    });
    expect(roc.ok).toBe(false);
    expect(roc.detail).toContain('nothing for the score to separate');
  });

  it('refuses a series too small to read', () => {
    const roc = rocCurve({ scores: [1, 2, 3], outcome: [true, false, true] });
    expect(roc.ok).toBe(false);
    expect(roc.detail).toContain('Too few');
  });

  it('bands the AUC the conventional way', () => {
    expect(describeAuc(0.55)).toBe('no better than chance');
    expect(describeAuc(0.65)).toBe('poor');
    expect(describeAuc(0.75)).toBe('fair');
    expect(describeAuc(0.85)).toBe('good');
    expect(describeAuc(0.95)).toBe('excellent');
  });
});

describe("Cohen's kappa", () => {
  it('gives 1 for two observers who agree on everything', () => {
    const a = ['Yes', 'No', 'Yes', 'No', 'Yes', 'No', 'Yes', 'No', 'Yes', 'No', 'Yes', 'No'];
    const k = cohensKappa(a, [...a]);
    expect(k.ok).toBe(true);
    expect(k.kappa).toBe(1);
    expect(k.observedAgreement).toBe(1);
    expect(k.strength).toBe('almost perfect');
  });

  it('gives about 0 when agreement is no better than chance', () => {
    // Balanced marginals, agreement at the chance rate.
    const a = ['Y', 'Y', 'N', 'N', 'Y', 'Y', 'N', 'N', 'Y', 'Y', 'N', 'N'];
    const b = ['Y', 'N', 'Y', 'N', 'Y', 'N', 'Y', 'N', 'Y', 'N', 'Y', 'N'];
    const k = cohensKappa(a, b);
    expect(Math.abs(k.kappa!)).toBeLessThan(0.2);
  });

  it('goes NEGATIVE when they disagree more than chance would', () => {
    const a = new Array(12).fill(0).map((_, i) => (i % 2 === 0 ? 'Y' : 'N'));
    const b = a.map((v) => (v === 'Y' ? 'N' : 'Y'));
    const k = cohensKappa(a, b);
    expect(k.kappa).toBeLessThan(0);
    expect(k.strength).toBe('worse than chance');
  });

  it('EXPLAINS the high-agreement, low-kappa paradox instead of hiding it', () => {
    // The finding that surprises people and is routinely misreported. Both
    // observers say "no complication" almost always, so they agree 90% of the
    // time by doing nothing.
    const a = new Array(100).fill('No');
    const b = new Array(100).fill('No');
    for (let i = 0; i < 5; i += 1) a[i] = 'Yes';
    for (let i = 5; i < 10; i += 1) b[i] = 'Yes';
    const k = cohensKappa(a, b);
    expect(k.observedAgreement!).toBeGreaterThan(0.85);
    expect(k.kappa!).toBeLessThan(0.4);
    expect(k.interpretation).toContain('not an error');
    expect(k.interpretation).toContain('doing nothing');
  });

  it('reports both the raw agreement and the chance rate', () => {
    const a = ['Y', 'Y', 'N', 'N', 'Y', 'N', 'Y', 'N', 'Y', 'N', 'Y', 'N'];
    const k = cohensKappa(a, [...a]);
    expect(k.observedAgreement).not.toBeNull();
    expect(k.expectedAgreement).not.toBeNull();
    expect(k.n).toBe(12);
    expect(k.categories).toEqual(['N', 'Y']);
  });

  it('ignores pairs where either observer recorded nothing', () => {
    const a = ['Y', 'N', null, 'Y', 'N', 'Y', 'N', 'Y', 'N', 'Y', 'N', 'Y', 'N'];
    const b = ['Y', 'N', 'Y', undefined, 'N', 'Y', 'N', 'Y', 'N', 'Y', 'N', 'Y', 'N'];
    const k = cohensKappa(a, b);
    expect(k.n).toBe(11);
  });

  it('refuses too few paired ratings', () => {
    const k = cohensKappa(['Y', 'N'], ['Y', 'N']);
    expect(k.ok).toBe(false);
    expect(k.detail).toContain('Too few');
  });

  it('refuses when only one category was ever used', () => {
    const k = cohensKappa(new Array(20).fill('No'), new Array(20).fill('No'));
    expect(k.ok).toBe(false);
    expect(k.detail).toContain('one category');
  });

  it('bands kappa the Landis and Koch way', () => {
    expect(describeKappa(-0.1)).toBe('worse than chance');
    expect(describeKappa(0.1)).toBe('slight');
    expect(describeKappa(0.3)).toBe('fair');
    expect(describeKappa(0.5)).toBe('moderate');
    expect(describeKappa(0.7)).toBe('substantial');
    expect(describeKappa(0.9)).toBe('almost perfect');
  });
});
