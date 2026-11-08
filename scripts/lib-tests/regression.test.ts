// Logistic regression and the matrix solver under it.
//
// A REGRESSION THAT IS WRONG LOOKS EXACTLY LIKE ONE THAT IS RIGHT. It returns
// coefficients either way, they are plausible either way, and nobody finds out
// until a number has been presented. So every fit here is checked against a
// result that can be derived without this code: an odds ratio that equals the
// 2x2 cross-product, a matrix whose inverse multiplies back to the identity,
// and a separation case whose true answer is "infinity" and must therefore be
// refused rather than reported.
import { describe, it, expect } from 'vitest';
import { invert, multiply, transpose, diagonal, zeros } from '../../src/lib/research/matrix';
import {
  logisticRegression, indicatorColumns, MIN_EVENTS_PER_PREDICTOR,
} from '../../src/lib/research/regression';

describe('the matrix solver', () => {
  it('inverts a matrix whose inverse is known by hand', () => {
    // [[4,7],[2,6]] has inverse [[0.6,-0.7],[-0.2,0.4]].
    const inv = invert([[4, 7], [2, 6]])!;
    expect(inv[0][0]).toBeCloseTo(0.6, 10);
    expect(inv[0][1]).toBeCloseTo(-0.7, 10);
    expect(inv[1][0]).toBeCloseTo(-0.2, 10);
    expect(inv[1][1]).toBeCloseTo(0.4, 10);
  });

  it('multiplies an inverse back to the identity', () => {
    const a = [[2, 1, 1], [1, 3, 2], [1, 0, 0]];
    const product = multiply(a, invert(a)!)!;
    product.forEach((row, i) => row.forEach((v, j) => {
      expect(v).toBeCloseTo(i === j ? 1 : 0, 10);
    }));
  });

  it('survives a zero on the diagonal by pivoting', () => {
    // Without partial pivoting this divides by zero and every later row is NaN.
    const a = [[0, 1], [1, 0]];
    const inv = invert(a)!;
    expect(inv).toEqual([[0, 1], [1, 0]]);
  });

  it('returns NULL for a singular matrix rather than infinities', () => {
    // The second row is twice the first: no inverse exists.
    expect(invert([[1, 2], [2, 4]])).toBeNull();
  });

  it('refuses a non-square matrix', () => {
    expect(invert([[1, 2, 3], [4, 5, 6]])).toBeNull();
  });

  it('transposes and multiplies to the right shapes', () => {
    expect(transpose([[1, 2, 3], [4, 5, 6]])).toEqual([[1, 4], [2, 5], [3, 6]]);
    expect(multiply([[1, 2]], [[3], [4]])).toEqual([[11]]);
    // Shapes that do not meet give null, not a wrong answer.
    expect(multiply([[1, 2]], [[3, 4]])).toBeNull();
  });

  it('reads a diagonal and builds zeros', () => {
    expect(diagonal([[1, 9], [9, 2]])).toEqual([1, 2]);
    expect(zeros(2, 3)).toEqual([[0, 0, 0], [0, 0, 0]]);
  });
});

/** Build a cohort from a 2x2 table: exposed/unexposed by outcome/no outcome. */
function cohort(a: number, b: number, c: number, d: number) {
  const outcome: boolean[] = [];
  const exposure: number[] = [];
  const push = (n: number, x: number, y: boolean) => {
    for (let i = 0; i < n; i += 1) { exposure.push(x); outcome.push(y); }
  };
  push(a, 1, true); push(b, 1, false);
  push(c, 0, true); push(d, 0, false);
  return { outcome, exposure };
}

describe('logistic regression with one binary predictor', () => {
  it('reproduces the 2x2 odds ratio exactly', () => {
    // With a single binary predictor the fitted odds ratio IS the
    // cross-product ratio: (20x20)/(10x10) = 4. If this does not come out at
    // 4, the solver is wrong, and nothing else in this file can be trusted.
    const { outcome, exposure } = cohort(20, 10, 10, 20);
    const fit = logisticRegression({
      outcome, predictors: [{ name: 'exposed', values: exposure }],
    });
    expect(fit.ok).toBe(true);
    const term = fit.terms.find((t) => t.name === 'exposed')!;
    expect(term.oddsRatio).toBeCloseTo(4, 3);
    expect(term.ci95Lower).toBeLessThan(4);
    expect(term.ci95Upper).toBeGreaterThan(4);
    expect(term.pValue).toBeLessThan(0.05);
  });

  it('gets the intercept right too', () => {
    // Unexposed: 10 events of 30, odds 10/20 = 0.5, log odds = -0.693.
    const { outcome, exposure } = cohort(20, 10, 10, 20);
    const fit = logisticRegression({
      outcome, predictors: [{ name: 'exposed', values: exposure }],
    });
    const intercept = fit.terms.find((t) => t.name === '(Intercept)')!;
    expect(intercept.coefficient).toBeCloseTo(Math.log(0.5), 3);
  });

  it('gives an odds ratio of 1 when exposure makes no difference', () => {
    const { outcome, exposure } = cohort(15, 15, 15, 15);
    const fit = logisticRegression({
      outcome, predictors: [{ name: 'exposed', values: exposure }],
    });
    const term = fit.terms.find((t) => t.name === 'exposed')!;
    expect(term.oddsRatio).toBeCloseTo(1, 6);
    expect(term.pValue).toBeGreaterThan(0.9);
    // And the interval straddles 1, which is what tells a reader there is
    // nothing here.
    expect(term.ci95Lower).toBeLessThan(1);
    expect(term.ci95Upper).toBeGreaterThan(1);
  });

  it('counts the cases and the events it actually used', () => {
    const { outcome, exposure } = cohort(20, 10, 10, 20);
    const fit = logisticRegression({
      outcome, predictors: [{ name: 'exposed', values: exposure }],
    });
    expect(fit.n).toBe(60);
    expect(fit.events).toBe(30);
    expect(fit.iterations).toBeGreaterThan(0);
    expect(fit.deviance).not.toBeNull();
  });
});

describe('what it refuses, and why that matters', () => {
  it('REFUSES a perfectly separating predictor instead of printing infinity', () => {
    // Every exposed case had the outcome and no unexposed case did. The true
    // odds ratio is infinite. A package that prints 10^8 with an interval
    // from zero to infinity has told you nothing except that your table has
    // a zero in it.
    const { outcome, exposure } = cohort(20, 0, 0, 20);
    const fit = logisticRegression({
      outcome, predictors: [{ name: 'countDiscrepancy', values: exposure }],
    });
    expect(fit.ok).toBe(false);
    expect(fit.detail).toContain('separates the outcome perfectly');
    expect(fit.detail).toContain('countDiscrepancy');
    expect(fit.terms).toEqual([]);
  });

  it('refuses when two predictors carry the same information', () => {
    const { outcome, exposure } = cohort(20, 10, 10, 20);
    const fit = logisticRegression({
      outcome,
      predictors: [
        { name: 'ageYears', values: exposure },
        // The same variable in different units: perfectly collinear.
        { name: 'ageMonths', values: exposure.map((v) => v * 12) },
      ],
    });
    expect(fit.ok).toBe(false);
    expect(fit.detail).toContain('same information');
  });

  it('refuses when every case has the same outcome', () => {
    const fit = logisticRegression({
      outcome: new Array(40).fill(false),
      predictors: [{ name: 'x', values: new Array(40).fill(0).map((_, i) => i) }],
    });
    expect(fit.ok).toBe(false);
    expect(fit.detail).toContain('nothing to model');
  });

  it('refuses with fewer cases than parameters', () => {
    const fit = logisticRegression({
      outcome: [true, false],
      predictors: [
        { name: 'a', values: [1, 2] }, { name: 'b', values: [3, 4] },
        { name: 'c', values: [5, 6] },
      ],
    });
    expect(fit.ok).toBe(false);
    expect(fit.detail).toContain('Too few to fit');
  });

  it('refuses when given no predictors', () => {
    expect(logisticRegression({ outcome: [true, false], predictors: [] }).ok).toBe(false);
  });
});

describe('adjustment — the reason this model exists', () => {
  it('pulls a confounded crude effect back towards the truth', () => {
    // A worked confounding example. Consultants operate on the sick cases.
    // Crude: consultants look WORSE. Adjusted for sickness, the effect goes.
    const outcome: boolean[] = [];
    const consultant: number[] = [];
    const sick: number[] = [];
    const add = (n: number, c: number, s: number, bad: number) => {
      for (let i = 0; i < n; i += 1) {
        consultant.push(c); sick.push(s); outcome.push(i < bad);
      }
    };
    // Sick patients: 80% go to consultants, and 50% do badly whoever operates.
    add(80, 1, 1, 40); add(20, 0, 1, 10);
    // Well patients: 20% go to consultants, and 10% do badly whoever operates.
    add(20, 1, 0, 2); add(80, 0, 0, 8);

    const crude = logisticRegression({
      outcome, predictors: [{ name: 'consultant', values: consultant }],
    });
    const adjusted = logisticRegression({
      outcome,
      predictors: [
        { name: 'consultant', values: consultant },
        { name: 'sick', values: sick },
      ],
    });

    const crudeOr = crude.terms.find((t) => t.name === 'consultant')!.oddsRatio;
    const adjOr = adjusted.terms.find((t) => t.name === 'consultant')!.oddsRatio;

    // Crude says consultants do worse; adjusted says there is no difference.
    expect(crudeOr).toBeGreaterThan(1.8);
    expect(adjOr).toBeCloseTo(1, 1);
    // And sickness is the thing that actually predicts the outcome.
    expect(adjusted.terms.find((t) => t.name === 'sick')!.pValue).toBeLessThan(0.01);
  });

  it('warns when there are too few events for the predictors', () => {
    const outcome = new Array(60).fill(false).map((_, i) => i < 5);
    const fit = logisticRegression({
      outcome,
      predictors: [
        { name: 'a', values: outcome.map((_, i) => i % 3) },
        { name: 'b', values: outcome.map((_, i) => i % 5) },
      ],
    });
    expect(fit.warnings.join(' ')).toContain('ten per predictor');
    expect(MIN_EVENTS_PER_PREDICTOR).toBe(10);
  });

  it('drops incomplete rows and says how many it used', () => {
    const { outcome, exposure } = cohort(20, 10, 10, 20);
    const withGaps = exposure.map((v, i) => (i % 10 === 0 ? null : v));
    const fit = logisticRegression({
      outcome, predictors: [{ name: 'exposed', values: withGaps }],
    });
    expect(fit.n).toBeLessThan(60);
    expect(fit.warnings.join(' ')).toContain('of 60 cases');
    expect(fit.warnings.join(' ')).toContain('describes documentation');
  });
});

describe('turning a category into indicator columns', () => {
  const values = [
    ...new Array(50).fill('ELECTIVE'),
    ...new Array(30).fill('EMERGENCY'),
    ...new Array(20).fill('URGENT'),
  ];

  it('uses the commonest level as the reference, and says which', () => {
    // An odds ratio with no stated reference is uninterpretable: "emergency
    // 2.1" means nothing until you know it is against elective.
    const out = indicatorColumns('type', values);
    expect(out.reference).toBe('ELECTIVE');
    expect(out.columns.map((c) => c.name)).toEqual([
      'type: EMERGENCY vs ELECTIVE', 'type: URGENT vs ELECTIVE',
    ]);
  });

  it('honours a reference the caller names', () => {
    const out = indicatorColumns('type', values, 'URGENT');
    expect(out.reference).toBe('URGENT');
    expect(out.columns.map((c) => c.name)).toContain('type: ELECTIVE vs URGENT');
  });

  it('codes only the two levels being compared, leaving the rest out', () => {
    const out = indicatorColumns('type', values);
    const emergency = out.columns[0].values;
    // Elective is 0, emergency is 1, and urgent is NaN so those rows drop out
    // of THAT comparison rather than being silently lumped with the reference.
    expect(emergency[0]).toBe(0);
    expect(emergency[50]).toBe(1);
    expect(Number.isNaN(emergency[80])).toBe(true);
  });

  it('gives nothing back for a variable with one level', () => {
    const out = indicatorColumns('x', new Array(20).fill('SAME'));
    expect(out.reference).toBeNull();
    expect(out.columns).toEqual([]);
  });
});
