// Lightweight statistics helpers for the Theatre Research & Analytics module.
// Pure functions, no dependencies — safe to run on the server inside API routes.
// Covers the descriptive-statistics suite plus a few inferential tests that the
// captured theatre data can support (t-test, Mann-Whitney U, chi-square).

export interface DescriptiveStats {
  n: number;
  mean: number | null;
  median: number | null;
  mode: number | null;
  sd: number | null; // sample standard deviation
  variance: number | null; // sample variance
  min: number | null;
  max: number | null;
  range: number | null;
  q1: number | null;
  q3: number | null;
  iqr: number | null;
  ci95Lower: number | null; // 95% confidence interval for the mean
  ci95Upper: number | null;
  sum: number;
}

function clean(values: Array<number | null | undefined>): number[] {
  return values.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
}

// Linear-interpolation percentile (p in [0,1]) on a sorted ascending array.
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

export function describe(input: Array<number | null | undefined>): DescriptiveStats {
  const values = clean(input);
  const n = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  if (n === 0) {
    return {
      n: 0, mean: null, median: null, mode: null, sd: null, variance: null,
      min: null, max: null, range: null, q1: null, q3: null, iqr: null,
      ci95Lower: null, ci95Upper: null, sum: 0,
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sum / n;
  const variance = n > 1 ? values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  const sd = Math.sqrt(variance);
  const median = percentile(sorted, 0.5);
  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);

  // Mode: most frequent value (first one wins on ties).
  const freq = new Map<number, number>();
  let mode = sorted[0];
  let best = 0;
  for (const v of sorted) {
    const c = (freq.get(v) || 0) + 1;
    freq.set(v, c);
    if (c > best) {
      best = c;
      mode = v;
    }
  }

  const se = n > 1 ? sd / Math.sqrt(n) : 0;
  const tCrit = tCritical95(n - 1);
  const ci95Lower = n > 1 ? mean - tCrit * se : mean;
  const ci95Upper = n > 1 ? mean + tCrit * se : mean;

  return {
    n,
    mean,
    median,
    mode,
    sd,
    variance,
    min: sorted[0],
    max: sorted[n - 1],
    range: sorted[n - 1] - sorted[0],
    q1,
    q3,
    iqr: q3 - q1,
    ci95Lower,
    ci95Upper,
    sum,
  };
}

export function percentileOf(input: Array<number | null | undefined>, p: number): number | null {
  const sorted = clean(input).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  return percentile(sorted, p);
}

// Approximate two-sided 95% t critical value for given degrees of freedom.
function tCritical95(df: number): number {
  if (df <= 0) return 12.706;
  const table: Record<number, number> = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365,
    8: 2.306, 9: 2.262, 10: 2.228, 12: 2.179, 15: 2.131, 20: 2.086, 25: 2.06,
    30: 2.042, 40: 2.021, 60: 2.0, 120: 1.98,
  };
  if (table[df]) return table[df];
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  for (const k of keys) if (df < k) return table[k];
  return 1.96; // large-sample normal approximation
}

// Standard normal CDF (Abramowitz & Stegun 7.1.26 approximation).
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let prob =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) prob = 1 - prob;
  return prob;
}

export interface TestResult {
  test: string;
  statistic: number | null;
  pValue: number | null;
  detail?: string;
}

// Welch's two-sample t-test (unequal variances). Returns two-sided p-value via
// a normal approximation of the t distribution (adequate for audit reporting).
export function welchTTest(
  a: Array<number | null | undefined>,
  b: Array<number | null | undefined>
): TestResult {
  const sa = describe(a);
  const sb = describe(b);
  if (!sa.n || !sb.n || sa.n < 2 || sb.n < 2 || sa.mean == null || sb.mean == null) {
    return { test: "Welch's t-test", statistic: null, pValue: null, detail: 'Insufficient data' };
  }
  const va = (sa.sd as number) ** 2 / sa.n;
  const vb = (sb.sd as number) ** 2 / sb.n;
  const denom = Math.sqrt(va + vb);
  if (denom === 0) return { test: "Welch's t-test", statistic: null, pValue: null, detail: 'Zero variance' };
  const t = (sa.mean - sb.mean) / denom;
  const p = 2 * (1 - normalCdf(Math.abs(t)));
  return {
    test: "Welch's t-test",
    statistic: t,
    pValue: p,
    detail: `mean A=${sa.mean.toFixed(2)} (n=${sa.n}), mean B=${sb.mean.toFixed(2)} (n=${sb.n})`,
  };
}

// Mann-Whitney U test (rank-sum) with normal approximation, two-sided.
export function mannWhitneyU(
  a: Array<number | null | undefined>,
  b: Array<number | null | undefined>
): TestResult {
  const ca = clean(a);
  const cb = clean(b);
  const n1 = ca.length;
  const n2 = cb.length;
  if (n1 < 3 || n2 < 3) {
    return { test: 'Mann-Whitney U', statistic: null, pValue: null, detail: 'Insufficient data' };
  }
  const combined = [
    ...ca.map((v) => ({ v, g: 0 })),
    ...cb.map((v) => ({ v, g: 1 })),
  ].sort((x, y) => x.v - y.v);
  // Assign average ranks (ties handled).
  const ranks = new Array(combined.length);
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j + 1 < combined.length && combined[j + 1].v === combined[i].v) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[k] = avgRank;
    i = j + 1;
  }
  let r1 = 0;
  combined.forEach((item, idx) => {
    if (item.g === 0) r1 += ranks[idx];
  });
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const u2 = n1 * n2 - u1;
  const u = Math.min(u1, u2);
  const mu = (n1 * n2) / 2;
  const sigma = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  if (sigma === 0) return { test: 'Mann-Whitney U', statistic: u, pValue: null };
  const z = (u - mu) / sigma;
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  return { test: 'Mann-Whitney U', statistic: u, pValue: p, detail: `n1=${n1}, n2=${n2}` };
}

// Pearson chi-square test of independence on a contingency matrix.
export function chiSquare(matrix: number[][]): TestResult {
  const rows = matrix.length;
  const cols = rows > 0 ? matrix[0].length : 0;
  if (rows < 2 || cols < 2) {
    return { test: 'Chi-square', statistic: null, pValue: null, detail: 'Need a 2x2 or larger table' };
  }
  const rowTotals = matrix.map((r) => r.reduce((a, b) => a + b, 0));
  const colTotals = matrix[0].map((_, c) => matrix.reduce((a, r) => a + r[c], 0));
  const grand = rowTotals.reduce((a, b) => a + b, 0);
  if (grand === 0) return { test: 'Chi-square', statistic: null, pValue: null, detail: 'Empty table' };
  let chi = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const expected = (rowTotals[r] * colTotals[c]) / grand;
      if (expected > 0) chi += (matrix[r][c] - expected) ** 2 / expected;
    }
  }
  const df = (rows - 1) * (cols - 1);
  const p = chiSquarePValue(chi, df);
  return { test: 'Chi-square', statistic: chi, pValue: p, detail: `df=${df}` };
}

// Survival-function of the chi-square distribution (upper-tail p-value).
function chiSquarePValue(x: number, df: number): number {
  if (x <= 0) return 1;
  // Use the regularized upper incomplete gamma Q(df/2, x/2).
  return gammaincUpper(df / 2, x / 2);
}

// Regularized upper incomplete gamma function Q(a, x) via series/continued
// fraction (Numerical Recipes style).
function gammaincUpper(a: number, x: number): number {
  if (x < 0 || a <= 0) return 1;
  if (x === 0) return 1;
  const gln = logGamma(a);
  if (x < a + 1) {
    // Series representation for P(a,x); Q = 1 - P.
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 0; n < 200; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
    }
    const p = sum * Math.exp(-x + a * Math.log(x) - gln);
    return 1 - p;
  }
  // Continued fraction for Q(a,x).
  const tiny = 1e-30;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h;
}

// Lanczos approximation of ln(Gamma(x)).
function logGamma(x: number): number {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += c[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

// Pearson correlation coefficient between paired series.
export function pearson(
  xs: Array<number | null | undefined>,
  ys: Array<number | null | undefined>
): number | null {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    const x = xs[i];
    const y = ys[i];
    if (typeof x === 'number' && typeof y === 'number' && !Number.isNaN(x) && !Number.isNaN(y)) {
      pairs.push([x, y]);
    }
  }
  if (pairs.length < 3) return null;
  const n = pairs.length;
  const mx = pairs.reduce((a, [x]) => a + x, 0) / n;
  const my = pairs.reduce((a, [, y]) => a + y, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (const [x, y] of pairs) {
    num += (x - mx) * (y - my);
    dx += (x - mx) ** 2;
    dy += (y - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? null : num / den;
}
