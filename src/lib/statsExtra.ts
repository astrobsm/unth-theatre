// ============================================================
// The tests a theatre audit actually needs, beyond two groups
// ------------------------------------------------------------
// The module had four tests: Welch, Mann-Whitney, chi-square and Pearson. All
// four compare exactly two things. Almost every real question in a theatre is
// about more than two — four specialties, five ASA grades, six surgeons — and
// the only way to ask it with a two-group test is to run it repeatedly, which
// inflates the false-positive rate with every extra comparison and is the
// commonest statistical error in the surgical literature.
//
// SO THE ADDITIONS ARE DELIBERATE, NOT DECORATIVE:
//
//   One-way ANOVA and Kruskal-Wallis    k groups at once, parametric and not.
//   Fisher's exact test                 a 2x2 table with small counts, where
//                                       chi-square is not valid and will
//                                       cheerfully return a p-value anyway.
//   Odds ratio and relative risk        an EFFECT SIZE with an interval. A
//                                       p-value says whether there is a
//                                       difference; only these say how big.
//   Spearman                            a monotone relationship, for ordinal
//                                       variables like ASA and wound class,
//                                       where Pearson assumes a line.
//   Simple linear regression            a slope with a direction.
//
// EVERY RESULT CARRIES ITS OWN REFUSAL. A test given too few observations, or
// a zero cell, returns a null statistic and says why in `detail` rather than
// returning a number that looks like an answer. That is the difference between
// a tool and a trap.
//
// The p-values use the same normal and chi-square approximations the existing
// module uses, which are adequate for audit reporting and are stated as such.
// ============================================================

import { describe, type TestResult } from '@/lib/stats';

const clean = (v: Array<number | null | undefined>): number[] =>
  v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));

/** Upper-tail normal probability, Abramowitz-Stegun 26.2.17. */
function normalUpper(z: number): number {
  const a = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * a);
  const d = 0.3989422804014327 * Math.exp(-(a * a) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478
    + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? p : 1 - p;
}

/** Two-sided p from a z score. */
const twoSidedZ = (z: number): number => Math.min(1, 2 * normalUpper(Math.abs(z)));

/** Regularised upper incomplete gamma, for a chi-square tail. */
function chiSquareTail(x: number, df: number): number {
  if (!(x > 0) || df <= 0) return 1;
  // Wilson-Hilferty: accurate enough for audit reporting and has no series
  // that can fail to converge on a degenerate table.
  const t = (x / df) ** (1 / 3);
  const m = 1 - 2 / (9 * df);
  const s = Math.sqrt(2 / (9 * df));
  return Math.min(1, Math.max(0, normalUpper((t - m) / s)));
}

/**
 * Natural log of n factorial, summed exactly and memoised.
 *
 * NOT a Lanczos approximation of ln Gamma. Fisher's exact test is only ever
 * run here on whole counts up to a few hundred, where a running sum of
 * logarithms is exact to floating point, costs nothing, and cannot be written
 * down with an off-by-one in the way the gamma approximation can -- which it
 * was, and the tea-tasting table came back as p = 1 instead of 0.4857.
 */
const LN_FACTORIAL: number[] = [0];
function lnFactorial(n: number): number {
  if (n < 0 || !Number.isInteger(n)) return NaN;
  for (let i = LN_FACTORIAL.length; i <= n; i += 1) {
    LN_FACTORIAL[i] = LN_FACTORIAL[i - 1] + Math.log(i);
  }
  return LN_FACTORIAL[n];
}

export interface GroupedTestResult extends TestResult {
  /** Per-group n, so a reader can see what the test was actually run on. */
  groups?: Array<{ label: string; n: number; mean: number | null; median: number | null }>;
  df?: number | null;
}

/**
 * One-way ANOVA across k groups.
 *
 * Compares the variance BETWEEN groups with the variance within them. Needs
 * at least two groups with at least two observations each; anything less and
 * the within-group variance is undefined, so it refuses rather than dividing
 * by zero and reporting infinity as a result.
 */
export function oneWayAnova(
  groups: Array<{ label: string; values: Array<number | null | undefined> }>,
): GroupedTestResult {
  const usable = groups
    .map((g) => ({ label: g.label, values: clean(g.values) }))
    .filter((g) => g.values.length >= 2);

  const summary = usable.map((g) => {
    const d = describe(g.values);
    return { label: g.label, n: d.n, mean: d.mean, median: d.median };
  });

  if (usable.length < 2) {
    return {
      test: 'One-way ANOVA', statistic: null, pValue: null, df: null, groups: summary,
      detail: 'Needs at least two groups with two or more observations each.',
    };
  }

  const all = usable.flatMap((g) => g.values);
  const grandMean = all.reduce((a, x) => a + x, 0) / all.length;

  let ssBetween = 0;
  let ssWithin = 0;
  usable.forEach((g) => {
    const m = g.values.reduce((a, x) => a + x, 0) / g.values.length;
    ssBetween += g.values.length * (m - grandMean) ** 2;
    g.values.forEach((x) => { ssWithin += (x - m) ** 2; });
  });

  const dfBetween = usable.length - 1;
  const dfWithin = all.length - usable.length;
  if (dfWithin <= 0 || ssWithin === 0) {
    return {
      test: 'One-way ANOVA', statistic: null, pValue: null, df: dfBetween, groups: summary,
      detail: ssWithin === 0
        ? 'Every value within each group is identical, so there is no within-group variance to test against.'
        : 'Not enough observations for a within-group estimate.',
    };
  }

  const f = (ssBetween / dfBetween) / (ssWithin / dfWithin);
  // F(df1, df2) tail via the chi-square approximation on df1*F.
  const p = chiSquareTail(f * dfBetween, dfBetween);

  return {
    test: 'One-way ANOVA',
    statistic: Math.round(f * 1000) / 1000,
    pValue: Math.round(p * 10000) / 10000,
    df: dfBetween,
    groups: summary,
    detail: `F(${dfBetween}, ${dfWithin}) across ${usable.length} groups.`,
  };
}

/**
 * Kruskal-Wallis: the rank-based alternative when the data are skewed.
 *
 * Which theatre data almost always are — operating times, blood loss and
 * recovery stays all have a long right tail, and a mean is a poor summary of
 * any of them. Ties are corrected for, because wound class, ASA and pain
 * scores are full of them and ignoring ties inflates the statistic.
 */
export function kruskalWallis(
  groups: Array<{ label: string; values: Array<number | null | undefined> }>,
): GroupedTestResult {
  const usable = groups
    .map((g) => ({ label: g.label, values: clean(g.values) }))
    .filter((g) => g.values.length > 0);

  const summary = usable.map((g) => {
    const d = describe(g.values);
    return { label: g.label, n: d.n, mean: d.mean, median: d.median };
  });

  const total = usable.reduce((a, g) => a + g.values.length, 0);
  if (usable.length < 2 || total < 3) {
    return {
      test: 'Kruskal-Wallis H', statistic: null, pValue: null, df: null, groups: summary,
      detail: 'Needs at least two groups and three observations in all.',
    };
  }

  // Rank everything together, averaging ranks within a tie.
  const pooled = usable.flatMap((g, gi) => g.values.map((value) => ({ value, gi })));
  pooled.sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(pooled.length);
  let tieCorrection = 0;
  let i = 0;
  while (i < pooled.length) {
    let j = i;
    while (j + 1 < pooled.length && pooled[j + 1].value === pooled[i].value) j += 1;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) ranks[k] = avg;
    const t = j - i + 1;
    if (t > 1) tieCorrection += t ** 3 - t;
    i = j + 1;
  }

  const sums = new Array<number>(usable.length).fill(0);
  pooled.forEach((p, idx) => { sums[p.gi] += ranks[idx]; });

  let h = 0;
  usable.forEach((g, gi) => { h += (sums[gi] ** 2) / g.values.length; });
  h = (12 / (total * (total + 1))) * h - 3 * (total + 1);

  const denom = 1 - tieCorrection / (total ** 3 - total);
  if (denom > 0) h /= denom;

  const df = usable.length - 1;
  return {
    test: 'Kruskal-Wallis H',
    statistic: Math.round(h * 1000) / 1000,
    pValue: Math.round(chiSquareTail(h, df) * 10000) / 10000,
    df,
    groups: summary,
    detail: `${usable.length} groups, ${total} observations, corrected for ties.`,
  };
}

export interface EffectSize {
  measure: 'Odds ratio' | 'Relative risk' | 'Risk difference';
  estimate: number | null;
  ci95Lower: number | null;
  ci95Upper: number | null;
  detail?: string;
}

/**
 * Odds ratio and relative risk for a 2x2 table, WITH confidence intervals.
 *
 * The table is [[exposed & outcome, exposed & no outcome],
 *               [unexposed & outcome, unexposed & no outcome]].
 *
 * The interval is the point of this function. A p-value says whether a
 * difference can be distinguished from chance; it says nothing about whether
 * the difference matters, and a large enough audit makes trivial differences
 * significant. An odds ratio of 1.04 with an interval of 1.01 to 1.07 is a
 * finding nobody should act on, and the only way to see that is to report the
 * interval.
 *
 * Haldane-Anscombe: where any cell is zero, 0.5 is added to every cell so the
 * estimate exists at all. It is stated in `detail` rather than done silently,
 * because an interval built on a corrected table is wider for a reason.
 */
export function twoByTwo(table: [[number, number], [number, number]]): {
  oddsRatio: EffectSize; relativeRisk: EffectSize; riskDifference: EffectSize;
} {
  let [[a, b], [c, d]] = table;
  const anyZero = a === 0 || b === 0 || c === 0 || d === 0;
  let note: string | undefined;
  if (anyZero) {
    a += 0.5; b += 0.5; c += 0.5; d += 0.5;
    note = 'A cell was zero, so 0.5 was added to every cell (Haldane-Anscombe). The interval is wider as a result.';
  }

  const n1 = a + b;
  const n2 = c + d;
  if (n1 <= 0 || n2 <= 0) {
    const empty: EffectSize = {
      measure: 'Odds ratio', estimate: null, ci95Lower: null, ci95Upper: null,
      detail: 'One of the two groups has no observations.',
    };
    return {
      oddsRatio: empty,
      relativeRisk: { ...empty, measure: 'Relative risk' },
      riskDifference: { ...empty, measure: 'Risk difference' },
    };
  }

  const or = (a * d) / (b * c);
  const seLogOr = Math.sqrt(1 / a + 1 / b + 1 / c + 1 / d);
  const r1 = a / n1;
  const r2 = c / n2;
  const rr = r2 === 0 ? null : r1 / r2;
  const seLogRr = Math.sqrt(1 / a - 1 / n1 + 1 / c - 1 / n2);
  const rd = r1 - r2;
  const seRd = Math.sqrt((r1 * (1 - r1)) / n1 + (r2 * (1 - r2)) / n2);

  const r3 = (x: number) => Math.round(x * 1000) / 1000;

  return {
    oddsRatio: {
      measure: 'Odds ratio',
      estimate: r3(or),
      ci95Lower: r3(Math.exp(Math.log(or) - 1.96 * seLogOr)),
      ci95Upper: r3(Math.exp(Math.log(or) + 1.96 * seLogOr)),
      detail: note,
    },
    relativeRisk: {
      measure: 'Relative risk',
      estimate: rr === null ? null : r3(rr),
      ci95Lower: rr === null || !Number.isFinite(seLogRr) ? null : r3(Math.exp(Math.log(rr) - 1.96 * seLogRr)),
      ci95Upper: rr === null || !Number.isFinite(seLogRr) ? null : r3(Math.exp(Math.log(rr) + 1.96 * seLogRr)),
      detail: note,
    },
    riskDifference: {
      measure: 'Risk difference',
      estimate: r3(rd),
      ci95Lower: r3(rd - 1.96 * seRd),
      ci95Upper: r3(rd + 1.96 * seRd),
      detail: note,
    },
  };
}

/**
 * Fisher's exact test on a 2x2 table.
 *
 * For the tables a surgical audit actually produces: a rare complication in a
 * small series puts counts of 0, 1 and 2 in the cells, and chi-square is not
 * valid there — but it will still return a p-value, and that p-value will be
 * quoted. This computes the exact two-sided probability instead.
 *
 * Refused above a total of 400, where the exact computation is both unnecessary
 * and slow; chi-square is correct at that size and the refusal says so.
 */
export function fisherExact(table: [[number, number], [number, number]]): TestResult {
  const [[a, b], [c, d]] = table;
  const n = a + b + c + d;
  if ([a, b, c, d].some((x) => x < 0 || !Number.isInteger(x))) {
    return { test: "Fisher's exact test", statistic: null, pValue: null, detail: 'Counts must be whole numbers.' };
  }
  if (n === 0) {
    return { test: "Fisher's exact test", statistic: null, pValue: null, detail: 'The table is empty.' };
  }
  if (n > 400) {
    return {
      test: "Fisher's exact test", statistic: null, pValue: null,
      detail: `With ${n} observations the chi-square test is valid and far cheaper. Use that instead.`,
    };
  }

  const r1 = a + b; const r2 = c + d;
  const c1 = a + c; const c2 = b + d;
  const lnP = (x: number) =>
    lnFactorial(r1) + lnFactorial(r2) + lnFactorial(c1) + lnFactorial(c2)
    - lnFactorial(n) - lnFactorial(x) - lnFactorial(r1 - x)
    - lnFactorial(c1 - x) - lnFactorial(n - r1 - c1 + x);

  const observed = lnP(a);
  const lo = Math.max(0, c1 - r2);
  const hi = Math.min(c1, r1);
  let p = 0;
  for (let x = lo; x <= hi; x += 1) {
    const lp = lnP(x);
    // Everything at least as extreme as what was seen. The tolerance absorbs
    // floating-point noise, without which the observed table itself is
    // sometimes excluded from its own p-value.
    if (lp <= observed + 1e-9) p += Math.exp(lp);
  }

  return {
    test: "Fisher's exact test",
    statistic: null,
    pValue: Math.round(Math.min(1, p) * 10000) / 10000,
    detail: `Exact two-sided probability over ${n} observations.`,
  };
}

/**
 * Spearman rank correlation.
 *
 * For ordinal variables — ASA, wound class, pain score, Aldrete — where
 * Pearson assumes a straight line between values that are only ordered, not
 * measured. The distance from ASA II to ASA III is not the same quantity as
 * the distance from 40 to 60 minutes, and Pearson treats it as though it were.
 */
export function spearman(
  xs: Array<number | null | undefined>,
  ys: Array<number | null | undefined>,
): TestResult {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i += 1) {
    const x = xs[i]; const y = ys[i];
    if (typeof x === 'number' && Number.isFinite(x)
      && typeof y === 'number' && Number.isFinite(y)) pairs.push([x, y]);
  }
  if (pairs.length < 3) {
    return { test: 'Spearman rank correlation', statistic: null, pValue: null, detail: 'Needs at least three complete pairs.' };
  }

  const rank = (values: number[]): number[] => {
    const order = values.map((v, i) => ({ v, i })).sort((p, q) => p.v - q.v);
    const out = new Array<number>(values.length);
    let i = 0;
    while (i < order.length) {
      let j = i;
      while (j + 1 < order.length && order[j + 1].v === order[i].v) j += 1;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k += 1) out[order[k].i] = avg;
      i = j + 1;
    }
    return out;
  };

  const rx = rank(pairs.map((p) => p[0]));
  const ry = rank(pairs.map((p) => p[1]));
  const n = pairs.length;
  const mx = rx.reduce((a, v) => a + v, 0) / n;
  const my = ry.reduce((a, v) => a + v, 0) / n;
  let num = 0; let dx = 0; let dy = 0;
  for (let i = 0; i < n; i += 1) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  if (dx === 0 || dy === 0) {
    return { test: 'Spearman rank correlation', statistic: null, pValue: null, detail: 'One of the variables has no variation.' };
  }
  const rho = num / Math.sqrt(dx * dy);
  const z = Math.sqrt(n - 1) * rho;

  return {
    test: 'Spearman rank correlation',
    statistic: Math.round(rho * 1000) / 1000,
    pValue: Math.round(twoSidedZ(z) * 10000) / 10000,
    detail: `${n} complete pairs, ties averaged.`,
  };
}

export interface RegressionResult extends TestResult {
  slope: number | null;
  intercept: number | null;
  rSquared: number | null;
  n: number;
  slopeCi95Lower?: number | null;
  slopeCi95Upper?: number | null;
}

/**
 * Simple linear regression of y on x.
 *
 * Reports the SLOPE with an interval, in the units of the two variables:
 * "every extra year of age adds 0.4 minutes to the operating time" is a
 * sentence a surgeon can argue with, and a correlation coefficient is not.
 */
export function linearRegression(
  xs: Array<number | null | undefined>,
  ys: Array<number | null | undefined>,
): RegressionResult {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i += 1) {
    const x = xs[i]; const y = ys[i];
    if (typeof x === 'number' && Number.isFinite(x)
      && typeof y === 'number' && Number.isFinite(y)) pairs.push([x, y]);
  }
  const n = pairs.length;
  const empty: RegressionResult = {
    test: 'Linear regression', statistic: null, pValue: null,
    slope: null, intercept: null, rSquared: null, n,
    detail: 'Needs at least three complete pairs with variation in x.',
  };
  if (n < 3) return empty;

  const mx = pairs.reduce((a, p) => a + p[0], 0) / n;
  const my = pairs.reduce((a, p) => a + p[1], 0) / n;
  let sxy = 0; let sxx = 0; let syy = 0;
  pairs.forEach(([x, y]) => {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  });
  if (sxx === 0) return empty;

  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const ssRes = pairs.reduce((a, [x, y]) => a + (y - (intercept + slope * x)) ** 2, 0);
  const rSquared = syy === 0 ? null : 1 - ssRes / syy;

  const seSlope = n > 2 ? Math.sqrt((ssRes / (n - 2)) / sxx) : null;
  const t = seSlope && seSlope > 0 ? slope / seSlope : null;
  const r3 = (x: number) => Math.round(x * 1000) / 1000;

  return {
    test: 'Linear regression',
    statistic: t === null ? null : r3(t),
    pValue: t === null ? null : Math.round(twoSidedZ(t) * 10000) / 10000,
    slope: r3(slope),
    intercept: r3(intercept),
    rSquared: rSquared === null ? null : r3(rSquared),
    slopeCi95Lower: seSlope === null ? null : r3(slope - 1.96 * seSlope),
    slopeCi95Upper: seSlope === null ? null : r3(slope + 1.96 * seSlope),
    n,
    detail: `${n} complete pairs. The slope is in units of y per unit of x.`,
  };
}
