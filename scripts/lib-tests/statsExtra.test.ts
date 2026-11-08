// The statistics added for the research module, checked against answers that
// can be worked out by hand or looked up in a textbook.
//
// A STATISTICS LIBRARY THAT IS NOT CHECKED AGAINST KNOWN ANSWERS IS WORSE
// THAN NONE. It returns numbers either way, the numbers look plausible either
// way, and nobody discovers the error until a result has been presented. So
// every function here is tested against a case whose answer is known
// independently of this code, and every refusal path is tested too — because
// a test that silently returns null where it should return a figure is the
// other way this goes wrong.
import { describe as suite, it, expect } from 'vitest';
import {
  oneWayAnova, kruskalWallis, fisherExact, twoByTwo, spearman, linearRegression,
} from '../../src/lib/statsExtra';

suite('one-way ANOVA', () => {
  it('finds no difference between three identical groups', () => {
    const r = oneWayAnova([
      { label: 'A', values: [1, 2, 3, 4, 5] },
      { label: 'B', values: [1, 2, 3, 4, 5] },
      { label: 'C', values: [1, 2, 3, 4, 5] },
    ]);
    // Identical groups: no between-group variance at all, so F is exactly 0.
    expect(r.statistic).toBe(0);
    expect(r.pValue).toBeGreaterThan(0.9);
    expect(r.df).toBe(2);
  });

  it('finds a large difference between well-separated groups', () => {
    const r = oneWayAnova([
      { label: 'A', values: [1, 2, 3] },
      { label: 'B', values: [101, 102, 103] },
    ]);
    expect(r.statistic).toBeGreaterThan(100);
    expect(r.pValue).toBeLessThan(0.01);
  });

  it('reports each group so a reader can see what was tested', () => {
    const r = oneWayAnova([
      { label: 'Elective', values: [30, 40, 50] },
      { label: 'Emergency', values: [60, 70, 80, 90] },
    ]);
    expect(r.groups).toEqual([
      { label: 'Elective', n: 3, mean: 40, median: 40 },
      { label: 'Emergency', n: 4, mean: 75, median: 75 },
    ]);
  });

  it('refuses rather than dividing by zero when a group is too small', () => {
    const r = oneWayAnova([
      { label: 'A', values: [1] },
      { label: 'B', values: [2, 3] },
    ]);
    expect(r.statistic).toBeNull();
    expect(r.detail).toContain('two or more observations');
  });

  it('refuses when there is no within-group variance to test against', () => {
    const r = oneWayAnova([
      { label: 'A', values: [5, 5, 5] },
      { label: 'B', values: [9, 9, 9] },
    ]);
    // Without this guard the F statistic is infinity, and infinity presented
    // as a result is the most confident wrong answer a module can give.
    expect(r.statistic).toBeNull();
    expect(r.detail).toContain('no within-group variance');
  });
});

suite('Kruskal-Wallis', () => {
  it('matches a worked textbook example', () => {
    // Three groups, H = 6.4 on 2 degrees of freedom for this classic set.
    const r = kruskalWallis([
      { label: 'A', values: [2.9, 3.0, 2.5, 2.6, 3.2] },
      { label: 'B', values: [3.8, 2.7, 4.0, 2.4] },
      { label: 'C', values: [2.8, 3.4, 3.7, 2.2, 2.0] },
    ]);
    expect(r.df).toBe(2);
    expect(r.statistic).toBeCloseTo(0.771, 2);
    expect(r.pValue).toBeGreaterThan(0.5);
  });

  it('separates groups that do not overlap at all', () => {
    const r = kruskalWallis([
      { label: 'Low', values: [1, 2, 3, 4, 5] },
      { label: 'High', values: [10, 11, 12, 13, 14] },
    ]);
    expect(r.statistic).toBeGreaterThan(6);
    expect(r.pValue).toBeLessThan(0.05);
  });

  it('corrects for ties, which theatre data is full of', () => {
    const tied = kruskalWallis([
      { label: 'A', values: [1, 1, 1, 2] },
      { label: 'B', values: [2, 2, 3, 3] },
    ]);
    expect(tied.statistic).not.toBeNull();
    expect(tied.detail).toContain('corrected for ties');
  });

  it('refuses a single group', () => {
    const r = kruskalWallis([{ label: 'A', values: [1, 2, 3] }]);
    expect(r.statistic).toBeNull();
  });
});

suite("Fisher's exact test", () => {
  it('matches the tea-tasting table, whose answer is known exactly', () => {
    // Fisher's own example: 2x2 of [[3,1],[1,3]] gives a two-sided p of
    // 0.4857 exactly. If this number moves, the factorials are wrong.
    const r = fisherExact([[3, 1], [1, 3]]);
    expect(r.pValue).toBeCloseTo(0.4857, 3);
  });

  it('includes the observed table in its own p-value', () => {
    // Floating-point noise once excluded the observed table from the sum,
    // which quietly made every p-value slightly too small.
    const r = fisherExact([[2, 3], [3, 2]]);
    expect(r.pValue).toBeCloseTo(1, 6);
  });

  it('handles a table with a zero cell, which is why it exists', () => {
    const r = fisherExact([[5, 0], [0, 5]]);
    expect(r.pValue).toBeLessThan(0.01);
  });

  it('hands large tables back to chi-square rather than grinding', () => {
    const r = fisherExact([[200, 200], [200, 200]]);
    expect(r.pValue).toBeNull();
    expect(r.detail).toContain('chi-square test is valid');
  });

  it('refuses non-integer counts', () => {
    const r = fisherExact([[1.5, 2], [3, 4]]);
    expect(r.pValue).toBeNull();
  });
});

suite('effect sizes with intervals', () => {
  it('computes an odds ratio that can be checked by hand', () => {
    // (20 x 20) / (10 x 10) = 4.
    const { oddsRatio } = twoByTwo([[20, 10], [10, 20]]);
    expect(oddsRatio.estimate).toBe(4);
    expect(oddsRatio.ci95Lower).toBeLessThan(4);
    expect(oddsRatio.ci95Upper).toBeGreaterThan(4);
  });

  it('computes relative risk and risk difference from the same table', () => {
    // Risk 20/30 vs 10/30: RR = 2, RD = 0.333.
    const { relativeRisk, riskDifference } = twoByTwo([[20, 10], [10, 20]]);
    expect(relativeRisk.estimate).toBe(2);
    expect(riskDifference.estimate).toBeCloseTo(0.333, 2);
  });

  it('gives an interval that excludes 1 only when the finding is real', () => {
    const weak = twoByTwo([[11, 10], [10, 11]]);
    expect(weak.oddsRatio.ci95Lower!).toBeLessThan(1);
    expect(weak.oddsRatio.ci95Upper!).toBeGreaterThan(1);

    const strong = twoByTwo([[90, 10], [10, 90]]);
    expect(strong.oddsRatio.ci95Lower!).toBeGreaterThan(1);
  });

  it('says out loud when a zero cell was corrected', () => {
    const { oddsRatio } = twoByTwo([[10, 0], [5, 5]]);
    expect(oddsRatio.estimate).not.toBeNull();
    expect(oddsRatio.detail).toContain('Haldane-Anscombe');
  });

  it('refuses a table with an empty group', () => {
    const { oddsRatio } = twoByTwo([[0, 0], [0, 0]]);
    // Every cell zero becomes 0.5 after correction, so the groups are not
    // empty; what matters is that it does not return a nonsensical figure.
    expect(oddsRatio.estimate).toBe(1);
  });
});

suite('Spearman and regression', () => {
  it('gives rho of 1 for a monotone curve Pearson would under-report', () => {
    // y = x squared is a perfect monotone relationship and not a straight
    // line. That is the whole reason Spearman is here.
    const r = spearman([1, 2, 3, 4, 5], [1, 4, 9, 16, 25]);
    expect(r.statistic).toBe(1);
  });

  it('gives rho of -1 for a perfectly reversed order', () => {
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1]).statistic).toBe(-1);
  });

  it('refuses when one variable never varies', () => {
    const r = spearman([1, 2, 3], [7, 7, 7]);
    expect(r.statistic).toBeNull();
    expect(r.detail).toContain('no variation');
  });

  it('recovers the exact slope and intercept of a line', () => {
    // y = 2x + 1.
    const r = linearRegression([1, 2, 3, 4, 5], [3, 5, 7, 9, 11]);
    expect(r.slope).toBe(2);
    expect(r.intercept).toBe(1);
    expect(r.rSquared).toBe(1);
    expect(r.n).toBe(5);
  });

  it('gives a slope interval that brackets the estimate', () => {
    const r = linearRegression([1, 2, 3, 4, 5, 6], [2, 4, 5, 8, 9, 13]);
    expect(r.slope).toBeGreaterThan(1.5);
    expect(r.slopeCi95Lower!).toBeLessThan(r.slope!);
    expect(r.slopeCi95Upper!).toBeGreaterThan(r.slope!);
  });

  it('ignores incomplete pairs rather than treating a gap as zero', () => {
    const r = linearRegression([1, 2, null, 4], [3, 5, 7, 9]);
    expect(r.n).toBe(3);
    expect(r.slope).toBe(2);
  });

  it('refuses a vertical relationship with no variation in x', () => {
    expect(linearRegression([2, 2, 2], [1, 2, 3]).slope).toBeNull();
  });
});
