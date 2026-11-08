/**
 * Interpretations for the analyses that do not reduce to one p-value.
 *
 * `interpret()` next door takes a test, a statistic and a p-value and says
 * what they support. A model is not that shape: a logistic regression has one
 * line per predictor, a Kaplan-Meier curve may have no p-value at all, and the
 * diagnostic engines write their own sentence because the number's meaning is
 * in the clinical question, not in the arithmetic. Each function here returns
 * the same `Interpretation` the rest of the module returns, so one component
 * can render every result.
 *
 * The rules from interpret.ts hold here too: a non-significant term is never
 * "no association", only "none was detected"; nothing "causes" anything; and
 * the cautions are never empty for a real analysis.
 */
import { ALPHA, type Interpretation } from './interpret';
import { MIN_EVENTS_PER_PREDICTOR, type LogisticResult } from './regression';
import type { SurvivalCurve } from './survival';
import type { RocResult, AgreementResult } from './diagnostic';

const fmtP = (p: number): string => (p < 0.001 ? 'p < 0.001'
  : `p = ${p < 0.01 ? p.toFixed(4) : p.toFixed(3)}`);

const or = (x: number): string => x.toFixed(2);

/** What `logisticRegression` calls the baseline term. */
const INTERCEPT = '(Intercept)';

const REFUSED = (test: string, detail: string): Interpretation => ({
  headline: `${test} was not run.`,
  plain: detail,
  cautions: ['Nothing can be concluded from an analysis that did not run.'],
  reporting: detail,
  significant: null,
});

/** The observational caution, in the words the module uses everywhere. */
const OBSERVATIONAL = 'These are routinely collected theatre records, not a trial. '
  + 'An association here describes the cases that came through this theatre and the way they '
  + 'were documented; it is not evidence of cause.';

export function interpretLogistic(
  res: LogisticResult,
  opts: {
    outcomeLabel: string;
    references?: Array<{ field: string; reference: string }>;
  } = { outcomeLabel: 'the outcome' },
): Interpretation {
  if (!res.ok) {
    return REFUSED('Logistic regression', res.detail ?? 'The model could not be fitted.');
  }

  // The intercept is the baseline odds, not a finding. It is almost always
  // significant, and reporting it as a predictor would put a spurious odds
  // ratio at the top of every model. `logisticRegression` names it
  // '(Intercept)', as R does.
  const terms = res.terms.filter((t) => t.name !== INTERCEPT);
  const significant = terms.filter((t) => t.pValue < ALPHA);
  const cautions: string[] = [];

  // Events per variable is the real limit on a model like this, and it is the
  // first thing a reviewer checks.
  const epv = terms.length > 0 ? res.events / terms.length : res.events;
  if (epv < MIN_EVENTS_PER_PREDICTOR) {
    cautions.push(
      `There are ${res.events} events for ${terms.length} predictor`
      + `${terms.length === 1 ? '' : 's'} — about ${epv.toFixed(1)} per predictor, below the `
      + `usual minimum of ${MIN_EVENTS_PER_PREDICTOR}. Odds ratios from a model this thin are `
      + 'unstable, and the intervals are too narrow rather than too wide.',
    );
  }
  res.warnings.forEach((w) => cautions.push(w));
  if (res.n > 0) {
    cautions.push(
      `The model used ${res.n} cases with every variable recorded. Cases missing any one of `
      + 'them were dropped, so the model describes the better-documented part of the cohort.',
    );
  }
  (opts.references ?? []).forEach((r) => cautions.push(
    `${r.field} is compared against "${r.reference}" — every odds ratio for that variable is `
    + 'relative to it, and changing the reference changes the numbers without changing the model.',
  ));
  cautions.push(OBSERVATIONAL);
  cautions.push(
    'Each odds ratio is adjusted for the other variables in the model and for nothing else. '
    + 'A confounder that was not entered is not accounted for.',
  );

  const headline = significant.length === 0
    ? `No predictor of ${opts.outcomeLabel} reached significance in this model.`
    : significant
      .map((t) => `${t.name}: adjusted OR ${or(t.oddsRatio)} `
        + `(95% CI ${or(t.ci95Lower)}-${or(t.ci95Upper)}, ${fmtP(t.pValue)})`)
      .join('; ');

  const plain = significant.length === 0
    ? `With ${res.events} events among ${res.n} cases, none of the ${terms.length} variable`
      + `${terms.length === 1 ? '' : 's'} entered showed an association with ${opts.outcomeLabel} `
      + 'at the conventional threshold. That is not evidence that none exists — a model this '
      + 'size can miss a real effect.'
    : `Adjusting for the other variables entered, ${significant.length} of ${terms.length} `
      + `showed an association with ${opts.outcomeLabel}. An odds ratio above 1 means higher `
      + 'odds of the outcome; below 1, lower. An interval that crosses 1 is compatible with '
      + 'no difference in either direction.';

  const r2 = res.pseudoR2 === null ? '' : ` Nagelkerke R-squared = ${res.pseudoR2.toFixed(3)}.`;
  const lines = significant.length === 0
    ? 'No predictor reached statistical significance.'
    : `${significant.map((t) => `${t.name} aOR ${or(t.oddsRatio)} `
      + `(95% CI ${or(t.ci95Lower)}-${or(t.ci95Upper)}, ${fmtP(t.pValue)})`).join('; ')}.`;
  const reporting = `Multivariable logistic regression was fitted for ${opts.outcomeLabel} `
    + `(${res.events} events among ${res.n} complete cases, ${terms.length} predictors).${r2} `
    + lines;

  return { headline, plain, cautions, reporting, significant: significant.length > 0 };
}

export function interpretSurvival(input: {
  curves: readonly SurvivalCurve[];
  pValue: number | null;
  statistic?: number | null;
  outcomeLabel: string;
  groupLabel?: string | null;
  timeUnit?: string | null;
}): Interpretation {
  const curves = input.curves ?? [];
  if (curves.length === 0) {
    return REFUSED('Kaplan-Meier', 'No case had both a follow-up time and an outcome recorded.');
  }

  const unit = input.timeUnit ? ` ${input.timeUnit}` : '';
  const cautions: string[] = [];
  const censored = curves.reduce((a, c) => a + (c.n - c.events), 0);
  const total = curves.reduce((a, c) => a + c.n, 0);

  cautions.push(
    `${censored} of ${total} cases were censored — still event-free when last seen. A curve `
    + 'treats censoring as uninformative; if cases were lost to follow-up because they were '
    + 'doing badly, the curve is optimistic.',
  );
  const noMedian = curves.filter((c) => c.medianSurvival === null).map((c) => c.label);
  if (noMedian.length > 0) {
    cautions.push(
      `The curve${noMedian.length === 1 ? '' : 's'} for ${noMedian.join(', ')} never reached 50%, `
      + 'so no median can be quoted. The longest follow-up is not a median.',
    );
  }
  cautions.push(
    'Survival beyond the last follow-up time is not estimated and must not be read off the '
    + 'end of the curve.',
  );
  cautions.push(OBSERVATIONAL);

  const describe = (c: SurvivalCurve): string => `${c.label} (n=${c.n}, ${c.events} events`
    + `${c.medianSurvival === null ? ', median not reached'
      : `, median ${c.medianSurvival}${unit}`})`;

  if (input.pValue === null) {
    const c = curves[0];
    const median = c.medianSurvival === null ? 'was not reached'
      : `was ${c.medianSurvival}${unit}`;
    return {
      headline: `${c.n} cases, ${c.events} events; median ${median}.`,
      plain: `This is a single curve describing time to ${input.outcomeLabel}. Name a grouping `
        + 'variable to compare curves with the log-rank test.',
      cautions,
      reporting: `Time to ${input.outcomeLabel} was estimated by the Kaplan-Meier method `
        + `(${c.n} cases, ${c.events} events). ${describe(c)}.`,
      significant: null,
    };
  }

  const sig = input.pValue < ALPHA;
  const names = curves.map(describe).join('; ');
  if (curves.length > 2) {
    cautions.push(
      `${curves.length} curves were compared in one test. A significant log-rank says the `
      + 'curves are not all the same; it does not say which pair differs.',
    );
  }
  cautions.push(
    'The log-rank test assumes the difference between curves runs in one direction throughout. '
    + 'Where curves cross, it can report no difference although the groups differ early or late.',
  );

  const group = input.groupLabel ?? 'the groups';
  return {
    headline: sig
      ? `The curves for ${group} differ (log-rank ${fmtP(input.pValue)}).`
      : `No difference between the curves for ${group} was detected `
        + `(log-rank ${fmtP(input.pValue)}).`,
    plain: `${names}. `
      + (sig
        ? `Time to ${input.outcomeLabel} differed between the groups somewhere along the `
          + 'curves. Read where they separate from the curve itself, not from the p-value.'
        : 'No difference was detected. With this many events the test can miss a real '
          + 'difference, so this is not evidence that the groups are alike.'),
    cautions,
    reporting: `Time to ${input.outcomeLabel} was compared between groups by the Kaplan-Meier `
      + `method and the log-rank test (${fmtP(input.pValue)}). ${names}.`,
    significant: sig,
  };
}

/**
 * ROC and kappa write their own sentence — `rocCurve` explains what an AUC of
 * this size means for the clinical question, and `cohensKappa` explains the
 * high-agreement/low-kappa paradox when it arises. This wraps that sentence in
 * the same shape, and adds the cautions a reader of either needs.
 */
export function interpretDiagnostic(
  res: RocResult | AgreementResult,
  opts: { outcomeLabel: string; scoreLabel?: string | null },
): Interpretation {
  if (!res.ok) {
    return REFUSED('The analysis', res.detail ?? 'There were not enough recorded values.');
  }

  const cautions: string[] = [OBSERVATIONAL];

  if ('auc' in res) {
    const auc = res.auc ?? 0.5;
    const score = opts.scoreLabel ?? 'the score';
    cautions.unshift(
      `The cut-off shown is the one that fits these ${res.n} cases best. A cut-off chosen on `
      + 'the same data it is tested on always looks better than it will in practice; it has to '
      + 'be checked on a separate cohort before it is used.',
    );
    cautions.push(
      `Sensitivity and specificity do not depend on how common ${opts.outcomeLabel} is, but the `
      + 'predictive values a clinician actually uses do. At a different rate of the outcome, the '
      + 'same cut-off gives different answers at the bedside.',
    );
    if (res.positives < 10 || res.negatives < 10) {
      cautions.push(
        `There were ${res.positives} with the outcome and ${res.negatives} without. An AUC from `
        + 'numbers this small moves a long way on one or two cases.',
      );
    }
    const ci = res.ci95Lower === null || res.ci95Upper === null ? ''
      : ` (95% CI ${res.ci95Lower.toFixed(3)}-${res.ci95Upper.toFixed(3)})`;
    const p = res.pValue === null ? '' : `, ${fmtP(res.pValue)}`;
    const cut = res.bestCutoff
      ? ` At a cut-off of ${res.bestCutoff.threshold}, sensitivity was `
        + `${(res.bestCutoff.sensitivity * 100).toFixed(1)}% and specificity `
        + `${(res.bestCutoff.specificity * 100).toFixed(1)}%.`
      : '';
    return {
      headline: `AUC ${auc.toFixed(3)}${ci} — ${res.interpretation}`,
      plain: `${res.interpretation} The area is the chance that a randomly chosen case with `
        + `${opts.outcomeLabel} has a higher ${score} than one without. 0.5 is a coin toss.`,
      cautions,
      reporting: `${score} discriminated ${opts.outcomeLabel} with an area under the ROC curve `
        + `of ${auc.toFixed(3)}${ci}${p}, on ${res.n} cases (${res.positives} with the `
        + `outcome).${cut}`,
      significant: res.pValue === null ? null : res.pValue < ALPHA,
    };
  }

  const k = res.kappa ?? 0;
  const obs = res.observedAgreement === null ? null : (res.observedAgreement * 100).toFixed(1);
  cautions.unshift(
    'Kappa measures agreement beyond chance between two records of the same thing. It says '
    + 'nothing about which of the two is right — two observers can agree perfectly and both '
    + 'be wrong.',
  );
  if (res.categories.length > 2) {
    cautions.push(
      `There are ${res.categories.length} categories, counted as all-or-nothing. Two raters one `
      + 'category apart score the same as two at opposite ends; a weighted kappa would not.',
    );
  }
  if (res.n < 30) {
    cautions.push(`Only ${res.n} pairs were compared. The interval is wide.`);
  }
  const ci = res.ci95Lower === null || res.ci95Upper === null ? ''
    : ` (95% CI ${res.ci95Lower.toFixed(2)}-${res.ci95Upper.toFixed(2)})`;
  return {
    headline: `kappa = ${k.toFixed(2)}${ci} — ${res.strength.toLowerCase()} agreement.`,
    plain: res.interpretation,
    cautions,
    reporting: `Agreement between the two records was `
      + `${obs === null ? 'not estimable' : `${obs}%`}, with Cohen's kappa = ${k.toFixed(2)}`
      + `${ci} on ${res.n} pairs (${res.strength.toLowerCase()}).`,
    significant: null,
  };
}
