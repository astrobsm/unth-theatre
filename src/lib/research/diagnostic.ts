// ============================================================
// ROC curves, and the agreement statistics
// ------------------------------------------------------------
// TWO QUESTIONS THAT LOOK ALIKE AND ARE NOT.
//
//   "How well does this number predict that outcome?" is a ROC curve. It asks
//   whether a continuous measure — an Aldrete score, a risk score, a
//   haemoglobin — separates the patients who had the event from those who did
//   not, at EVERY possible cut-off rather than at the one somebody chose.
//
//   "Do these two observers agree?" is kappa. It is not a correlation and not
//   a percentage: two people who both record "no complication" ninety-five
//   per cent of the time agree ninety-five per cent of the time by doing
//   nothing at all, and kappa is what removes the agreement that chance alone
//   would produce.
//
// THE CUT-OFF IS OFFERED, NOT PRESCRIBED. Youden's index picks the point that
// maximises sensitivity plus specificity, which weights a missed case and a
// false alarm equally. In a theatre they are almost never equal — missing a
// deteriorating patient is not the same as calling one back unnecessarily —
// so the figure is reported as what it is, and the sensitivity and specificity
// at every threshold are returned so a clinician can choose their own.
//
// AN AUC OF 0.5 IS A COIN TOSS and the module says so in those words, because
// "0.52, 95% CI 0.44 to 0.60" is routinely written up as a positive finding.
// ============================================================

export interface RocPoint {
  threshold: number;
  sensitivity: number;
  specificity: number;
  /** Sensitivity + specificity - 1. Highest is Youden's cut-off. */
  youden: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
}

export interface RocResult {
  ok: boolean;
  detail?: string;
  /** Area under the curve. 0.5 is chance. */
  auc: number | null;
  ci95Lower: number | null;
  ci95Upper: number | null;
  pValue: number | null;
  points: RocPoint[];
  bestCutoff: RocPoint | null;
  n: number;
  positives: number;
  negatives: number;
  /** What the number means, in words. */
  interpretation: string;
}

const normalUpper = (z: number): number => {
  const a = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * a);
  const d = 0.3989422804014327 * Math.exp(-(a * a) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478
    + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? p : 1 - p;
};

/** How an AUC is described, on the conventional bands. */
export function describeAuc(auc: number): string {
  if (auc < 0.6) return 'no better than chance';
  if (auc < 0.7) return 'poor';
  if (auc < 0.8) return 'fair';
  if (auc < 0.9) return 'good';
  return 'excellent';
}

/**
 * The ROC curve for one continuous predictor against one binary outcome.
 *
 * `higherIsPositive` says which direction predicts the event: a risk score
 * predicts it going UP, a haemoglobin or an Aldrete score going DOWN. Getting
 * it backwards produces an AUC below 0.5, which reads as a useless test when
 * the truth is a useful one pointed the wrong way — so it is an explicit
 * argument rather than something inferred.
 */
export function rocCurve(input: {
  scores: Array<number | null | undefined>;
  outcome: Array<boolean | null | undefined>;
  higherIsPositive?: boolean;
}): RocResult {
  const higher = input.higherIsPositive !== false;
  const rows: Array<{ s: number; y: boolean }> = [];
  for (let i = 0; i < Math.min(input.scores.length, input.outcome.length); i += 1) {
    const s = input.scores[i];
    const y = input.outcome[i];
    if (typeof s !== 'number' || !Number.isFinite(s)) continue;
    if (y !== true && y !== false) continue;
    rows.push({ s: higher ? s : -s, y });
  }

  const n = rows.length;
  const positives = rows.filter((r) => r.y).length;
  const negatives = n - positives;

  const refuse = (detail: string): RocResult => ({
    ok: false, detail, auc: null, ci95Lower: null, ci95Upper: null, pValue: null,
    points: [], bestCutoff: null, n, positives, negatives, interpretation: detail,
  });

  if (positives === 0 || negatives === 0) {
    return refuse(
      'Every case has the same outcome, so there is nothing for the score to separate.',
    );
  }
  if (n < 10) return refuse(`Only ${n} complete cases. Too few for a curve worth reading.`);

  // AUC as the Mann-Whitney statistic: the probability that a randomly chosen
  // case with the event scores higher than one without. Ties count a half,
  // which is what makes an all-ties predictor come out at exactly 0.5 rather
  // than at 0 or 1.
  const pos = rows.filter((r) => r.y).map((r) => r.s);
  const neg = rows.filter((r) => !r.y).map((r) => r.s);
  let wins = 0;
  pos.forEach((p) => neg.forEach((q) => {
    if (p > q) wins += 1; else if (p === q) wins += 0.5;
  }));
  const auc = wins / (positives * negatives);

  // Hanley and McNeil's standard error.
  const q1 = auc / (2 - auc);
  const q2 = (2 * auc * auc) / (1 + auc);
  const variance = (auc * (1 - auc)
    + (positives - 1) * (q1 - auc * auc)
    + (negatives - 1) * (q2 - auc * auc)) / (positives * negatives);
  const se = variance > 0 ? Math.sqrt(variance) : 0;
  const z = se > 0 ? (auc - 0.5) / se : 0;

  const thresholds = Array.from(new Set(rows.map((r) => r.s))).sort((a, b) => b - a);
  const points: RocPoint[] = thresholds.map((t) => {
    const tp = rows.filter((r) => r.y && r.s >= t).length;
    const fp = rows.filter((r) => !r.y && r.s >= t).length;
    const fn = positives - tp;
    const tn = negatives - fp;
    const sensitivity = tp / positives;
    const specificity = tn / negatives;
    return {
      // Reported in the caller's own units, undoing the sign flip.
      threshold: higher ? t : -t,
      sensitivity: Math.round(sensitivity * 1000) / 1000,
      specificity: Math.round(specificity * 1000) / 1000,
      youden: Math.round((sensitivity + specificity - 1) * 1000) / 1000,
      truePositives: tp, falsePositives: fp, trueNegatives: tn, falseNegatives: fn,
    };
  });

  const best = points.reduce((a, b) => (b.youden > a.youden ? b : a), points[0]);
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const band = describeAuc(auc);

  return {
    ok: true,
    auc: r3(auc),
    ci95Lower: r3(Math.max(0, auc - 1.96 * se)),
    ci95Upper: r3(Math.min(1, auc + 1.96 * se)),
    pValue: Math.round(Math.min(1, 2 * normalUpper(Math.abs(z))) * 10000) / 10000,
    points,
    bestCutoff: best,
    n, positives, negatives,
    interpretation:
      `An area of ${r3(auc)} means that for a randomly chosen pair — one case that had the `
      + `event and one that did not — the score ranks them correctly ${Math.round(auc * 100)}% `
      + `of the time. That is ${band}.`
      + (auc < 0.6
        ? ' An area this close to 0.5 is a coin toss, whatever the p-value says.'
        : ` Youden's cut-off is ${r3(best.threshold)}, giving ${Math.round(best.sensitivity * 100)}% `
          + `sensitivity and ${Math.round(best.specificity * 100)}% specificity — but that point `
          + 'weights a missed case and a false alarm equally, which in a theatre they rarely are.'),
  };
}

export interface AgreementResult {
  ok: boolean;
  detail?: string;
  /** Cohen's kappa: agreement beyond what chance would give. */
  kappa: number | null;
  ci95Lower: number | null;
  ci95Upper: number | null;
  /** Raw agreement, which is the figure people quote and should not. */
  observedAgreement: number | null;
  expectedAgreement: number | null;
  n: number;
  categories: string[];
  /** Landis and Koch's bands, named. */
  strength: string;
  interpretation: string;
}

/** Landis and Koch's conventional bands for kappa. */
export function describeKappa(k: number): string {
  if (k < 0) return 'worse than chance';
  if (k < 0.21) return 'slight';
  if (k < 0.41) return 'fair';
  if (k < 0.61) return 'moderate';
  if (k < 0.81) return 'substantial';
  return 'almost perfect';
}

/**
 * Cohen's kappa for two observers rating the same cases.
 *
 * WHY NOT JUST THE PERCENTAGE THEY AGREED. Two people who both write "no
 * complication" ninety-five times in a hundred agree ninety-five per cent of
 * the time without looking at a single patient. Kappa subtracts the agreement
 * chance alone would produce, and on a rare finding it is routinely far lower
 * than the raw percentage — which is the honest answer and the one that
 * surprises people.
 *
 * The high-agreement-low-kappa paradox is real and is explained in the
 * interpretation rather than left to look like an error.
 */
export function cohensKappa(
  a: Array<string | null | undefined>,
  b: Array<string | null | undefined>,
): AgreementResult {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const x = a[i];
    const y = b[i];
    if (x === null || x === undefined || x === '') continue;
    if (y === null || y === undefined || y === '') continue;
    pairs.push([String(x), String(y)]);
  }

  const n = pairs.length;
  const categories = Array.from(new Set(pairs.flat())).sort();
  const refuse = (detail: string): AgreementResult => ({
    ok: false, detail, kappa: null, ci95Lower: null, ci95Upper: null,
    observedAgreement: null, expectedAgreement: null, n, categories,
    strength: '', interpretation: detail,
  });

  if (n < 10) return refuse(`Only ${n} cases rated by both. Too few for a kappa worth reading.`);
  if (categories.length < 2) {
    return refuse('Both observers used only one category, so there is no agreement to measure.');
  }

  const agreed = pairs.filter(([x, y]) => x === y).length;
  const po = agreed / n;

  // Expected agreement from the marginals.
  let pe = 0;
  categories.forEach((c) => {
    const pa = pairs.filter(([x]) => x === c).length / n;
    const pb = pairs.filter(([, y]) => y === c).length / n;
    pe += pa * pb;
  });

  if (pe >= 1) {
    return refuse(
      'Both observers used the same single category for essentially every case, so chance '
      + 'alone explains all the agreement and kappa is undefined.',
    );
  }

  const kappa = (po - pe) / (1 - pe);
  const se = Math.sqrt((po * (1 - po)) / (n * (1 - pe) ** 2));
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const strength = describeKappa(kappa);

  const paradox = po > 0.8 && kappa < 0.4;

  return {
    ok: true,
    kappa: r3(kappa),
    ci95Lower: r3(kappa - 1.96 * se),
    ci95Upper: r3(kappa + 1.96 * se),
    observedAgreement: r3(po),
    expectedAgreement: r3(pe),
    n,
    categories,
    strength,
    interpretation:
      `The two observers agreed on ${Math.round(po * 100)}% of ${n} cases, but chance alone `
      + `would have produced ${Math.round(pe * 100)}%. Kappa of ${r3(kappa)} is ${strength} `
      + 'agreement.'
      + (paradox
        ? ' The raw percentage looks high and the kappa does not, which is not an error: when '
          + 'almost every case falls in one category, two observers agree most of the time by '
          + 'doing nothing. The kappa is the figure to report.'
        : ''),
  };
}
