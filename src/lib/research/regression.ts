// ============================================================
// Logistic regression: the model a surgical outcome paper actually uses
// ------------------------------------------------------------
// Everything in the statistics module so far compares ONE thing at a time.
// That is not how a surgical outcome is argued, because the things that
// predict it travel together: emergency cases are sicker, sicker patients go
// to consultants, consultants take the longer operations. A crude odds ratio
// for "operated by a consultant" in that world measures case mix, not skill,
// and reporting it as though it measured skill is how an audit ends up
// accusing the best surgeon in the department.
//
// Adjusting for the other variables is the only honest answer, and this is
// the model that does it.
//
// FITTED BY ITERATIVELY REWEIGHTED LEAST SQUARES, which is what every
// statistical package uses for this: start at zero, compute the fitted
// probabilities, reweight, solve, repeat until the coefficients stop moving.
//
// IT REFUSES MORE OFTEN THAN IT RETURNS, and that is deliberate:
//
//   SEPARATION. If a predictor perfectly splits the outcome — every case
//   with a count discrepancy had a complication, say — the coefficient runs
//   away to infinity and the odds ratio comes back as 10^8 with an interval
//   from nothing to everything. A package that prints that number has told
//   you nothing except that your table has a zero in it. This detects it and
//   says so.
//
//   TOO FEW EVENTS. The usual rule is ten outcome events per predictor. A
//   model with four predictors and six deaths is fitting noise, and its
//   intervals are fiction. It still fits, because sometimes that is all the
//   data there is, but the warning travels with the result.
//
//   A SINGULAR DESIGN. Two predictors carrying the same information cannot
//   both be estimated. Null, with the reason, rather than coefficients.
// ============================================================

import { invert, multiply, transpose, diagonal, type Matrix } from './matrix';

/** Upper-tail normal probability, for the Wald tests. */
function normalUpper(z: number): number {
  const a = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * a);
  const d = 0.3989422804014327 * Math.exp(-(a * a) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478
    + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? p : 1 - p;
}
const twoSided = (z: number) => Math.min(1, 2 * normalUpper(Math.abs(z)));

export interface LogisticTerm {
  name: string;
  coefficient: number;
  standardError: number;
  /** exp(coefficient) — the adjusted odds ratio. */
  oddsRatio: number;
  ci95Lower: number;
  ci95Upper: number;
  z: number;
  pValue: number;
}

export interface LogisticResult {
  ok: boolean;
  /** Why it could not be fitted, where it could not. */
  detail?: string;
  terms: LogisticTerm[];
  /** Cases used — complete rows only. */
  n: number;
  /** Outcome events among them. The real limit on what can be estimated. */
  events: number;
  iterations: number;
  /** -2 log likelihood. */
  deviance: number | null;
  /** Nagelkerke pseudo R-squared. */
  pseudoR2: number | null;
  /** Things that weaken the fit but did not stop it. */
  warnings: string[];
}

const EMPTY = (detail: string): LogisticResult => ({
  ok: false, detail, terms: [], n: 0, events: 0, iterations: 0,
  deviance: null, pseudoR2: null, warnings: [],
});

/** How far a coefficient may run before it is called separation. */
const SEPARATION_BETA = 15;
/** The usual events-per-variable rule of thumb. */
export const MIN_EVENTS_PER_PREDICTOR = 10;

/**
 * Fit a logistic regression of `outcome` on `predictors`.
 *
 * `predictors` are already numeric — a categorical variable must be turned
 * into indicator columns by the caller, which is where the reference level is
 * chosen and where it has to be visible.
 */
export function logisticRegression(input: {
  outcome: Array<boolean | number | null | undefined>;
  predictors: Array<{ name: string; values: Array<number | null | undefined> }>;
  maxIterations?: number;
}): LogisticResult {
  const { predictors } = input;
  if (predictors.length === 0) return EMPTY('No predictors were given.');

  // Complete rows only. Dropping incomplete ones is what every package does,
  // and it is reported, because a model fitted on half the cohort is a model
  // of whoever had their forms filled in.
  const rows: Array<{ y: number; x: number[] }> = [];
  const n0 = input.outcome.length;
  for (let i = 0; i < n0; i += 1) {
    const raw = input.outcome[i];
    const y = raw === true ? 1 : raw === false ? 0
      : (typeof raw === 'number' && (raw === 0 || raw === 1) ? raw : null);
    if (y === null) continue;
    const x: number[] = [1];
    let ok = true;
    for (const p of predictors) {
      const v = p.values[i];
      if (typeof v !== 'number' || !Number.isFinite(v)) { ok = false; break; }
      x.push(v);
    }
    if (ok) rows.push({ y, x });
  }

  const n = rows.length;
  const events = rows.filter((r) => r.y === 1).length;
  const p = predictors.length + 1;

  if (n < p + 1) return EMPTY(`Only ${n} complete cases for ${p} parameters. Too few to fit.`);
  if (events === 0 || events === n) {
    return EMPTY('Every case has the same outcome, so there is nothing to model.');
  }

  const warnings: string[] = [];
  if (n < n0) {
    warnings.push(
      `${n} of ${n0} cases had every variable recorded and were used. Where a value is `
      + 'missing more often in one group than another, the model describes documentation as '
      + 'much as it describes the patient.',
    );
  }
  const minEvents = Math.min(events, n - events);
  if (minEvents < MIN_EVENTS_PER_PREDICTOR * predictors.length) {
    warnings.push(
      `${minEvents} events for ${predictors.length} predictors. The usual rule is ten per `
      + 'predictor; below it the intervals are optimistic and the coefficients unstable.',
    );
  }

  const X: Matrix = rows.map((r) => r.x);
  const y = rows.map((r) => r.y);
  const Xt = transpose(X);

  let beta = new Array<number>(p).fill(0);
  let iterations = 0;
  const maxIterations = input.maxIterations ?? 50;
  let xtwx: Matrix | null = null;

  for (; iterations < maxIterations; iterations += 1) {
    const eta = X.map((xi) => xi.reduce((a, v, j) => a + v * beta[j], 0));
    const mu = eta.map((e) => 1 / (1 + Math.exp(-e)));
    // Weights are mu(1-mu); clamped away from zero so a fitted probability of
    // essentially 0 or 1 does not make the matrix singular on the way to
    // telling us the model has separated.
    const w = mu.map((m) => Math.max(m * (1 - m), 1e-10));
    const z = eta.map((e, i) => e + (y[i] - mu[i]) / w[i]);

    const XtW: Matrix = Xt.map((col) => col.map((v, i) => v * w[i]));
    xtwx = multiply(XtW, X);
    const XtWz = multiply(XtW, z.map((v) => [v]));
    if (!xtwx || !XtWz) return EMPTY('The design matrix could not be formed.');

    const inv = invert(xtwx);
    if (!inv) {
      return EMPTY(
        'Two or more predictors carry the same information, so the model cannot be fitted. '
        + 'Check for a variable included twice in different units, or a group with no cases.',
      );
    }
    const next = multiply(inv, XtWz);
    if (!next) return EMPTY('The model could not be solved.');

    const updated = next.map((r) => r[0]);
    const shift = updated.reduce((a, v, j) => Math.max(a, Math.abs(v - beta[j])), 0);
    beta = updated;
    if (!beta.every((b) => Number.isFinite(b))) {
      return EMPTY('The fit did not converge: a coefficient became infinite, which is separation.');
    }
    if (shift < 1e-8) { iterations += 1; break; }
  }

  // Separation: a coefficient this large is not an effect, it is a zero cell.
  const runaway = beta.findIndex((b, j) => j > 0 && Math.abs(b) > SEPARATION_BETA);
  if (runaway > 0) {
    return EMPTY(
      `"${predictors[runaway - 1].name}" separates the outcome perfectly — every case at one `
      + 'level had the same result. The odds ratio is infinite, which is a fact about your '
      + 'table rather than about the patients. Report the counts instead, or drop the variable.',
    );
  }

  const cov = xtwx ? invert(xtwx) : null;
  if (!cov) return EMPTY('Standard errors could not be computed.');
  const se = diagonal(cov).map((v) => (v > 0 ? Math.sqrt(v) : NaN));

  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const names = ['(Intercept)', ...predictors.map((x) => x.name)];
  const terms: LogisticTerm[] = beta.map((b, j) => {
    const s = se[j];
    const z = Number.isFinite(s) && s > 0 ? b / s : NaN;
    return {
      name: names[j],
      coefficient: r3(b),
      standardError: Number.isFinite(s) ? r3(s) : NaN,
      oddsRatio: r3(Math.exp(b)),
      ci95Lower: Number.isFinite(s) ? r3(Math.exp(b - 1.96 * s)) : NaN,
      ci95Upper: Number.isFinite(s) ? r3(Math.exp(b + 1.96 * s)) : NaN,
      z: Number.isFinite(z) ? r3(z) : NaN,
      pValue: Number.isFinite(z) ? Math.round(twoSided(z) * 10000) / 10000 : NaN,
    };
  });

  // Deviance and a pseudo R-squared, for a methods section.
  const eta = X.map((xi) => xi.reduce((a, v, j) => a + v * beta[j], 0));
  const mu = eta.map((e) => 1 / (1 + Math.exp(-e)));
  const clamp = (m: number) => Math.min(1 - 1e-12, Math.max(1e-12, m));
  const logLik = y.reduce((a, yi, i) =>
    a + yi * Math.log(clamp(mu[i])) + (1 - yi) * Math.log(1 - clamp(mu[i])), 0);
  const base = events / n;
  const logLik0 = y.reduce((a, yi) =>
    a + yi * Math.log(clamp(base)) + (1 - yi) * Math.log(1 - clamp(base)), 0);
  const coxSnell = 1 - Math.exp((2 / n) * (logLik0 - logLik));
  const maxR2 = 1 - Math.exp((2 / n) * logLik0);

  return {
    ok: true,
    terms,
    n,
    events,
    iterations,
    deviance: r3(-2 * logLik),
    pseudoR2: maxR2 > 0 ? r3(coxSnell / maxR2) : null,
    warnings,
  };
}

/**
 * Turn a categorical variable into indicator columns.
 *
 * THE REFERENCE LEVEL IS RETURNED, not hidden. Every odds ratio from a
 * categorical predictor is against some other level, and a table that does
 * not say which one is a table nobody can interpret — "emergency: OR 2.1"
 * means nothing until you know it is against elective.
 *
 * The reference defaults to the COMMONEST level, which gives the other
 * estimates the narrowest intervals; a caller may name a different one where
 * the clinical comparison demands it.
 */
export function indicatorColumns(
  name: string,
  values: Array<string | null | undefined>,
  reference?: string,
): { reference: string | null; columns: Array<{ name: string; values: number[] }> } {
  const counts = new Map<string, number>();
  values.forEach((v) => {
    if (v === null || v === undefined || v === '') return;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  });
  if (counts.size < 2) return { reference: null, columns: [] };

  const byFrequency = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const ref = reference && counts.has(reference) ? reference : byFrequency[0][0];

  const levels = byFrequency.map(([k]) => k).filter((k) => k !== ref);
  return {
    reference: ref,
    columns: levels.map((level) => ({
      name: `${name}: ${level} vs ${ref}`,
      values: values.map((v) => {
        if (v === null || v === undefined || v === '') return NaN;
        return v === level ? 1 : (v === ref ? 0 : NaN);
      }),
    })),
  };
}
