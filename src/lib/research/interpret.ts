// ============================================================
// Saying what a result means, in words, without saying more than it means
// ------------------------------------------------------------
// Asked for on 8 November: "add a functionality for data and test
// interpretations".
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE. A p-value above the threshold
// means the study did not DETECT a difference. It does not mean there is no
// difference, and the two are not close: a study of forty cases will fail to
// detect a difference that matters enormously, and reporting that as "no
// difference between the groups" is the commonest statistical error in the
// surgical literature. Every sentence this module generates for a
// non-significant result says "did not detect", and a test fails if the
// phrase "no difference" ever reaches the output.
//
// IT ALWAYS REPORTS THE SIZE, NOT ONLY THE p. With enough cases, a difference
// of ninety seconds in operating time is significant and means nothing. The
// effect size and its interval are what tell a reader whether to care, so
// they go in the same sentence as the p-value wherever they exist.
//
// AND IT ALWAYS SAYS WHAT WAS MISSING. A rate computed where two thirds of
// the cases have no value recorded is not a rate, it is a description of who
// fills in forms. The denominator is part of the interpretation, not a
// footnote to it.
//
// WHAT IT WILL NOT DO. It will not say "caused", "proves", or "demonstrates".
// Everything in this database is observational: the patients were not
// allocated, the surgeons chose their cases, and the sickest patients go to
// the most experienced hands. An association is all that is available here,
// and a module that wrote "caused" would be putting a claim in a clinician's
// mouth that their own data cannot support.
// ============================================================

export interface InterpretationInput {
  test: string;
  statistic?: number | null;
  pValue?: number | null;
  /** How many cases the analysis actually ran on. */
  n?: number | null;
  /** How many had the value recorded, where that is smaller than n. */
  recorded?: number | null;
  /** What was compared, in the clinician's words. */
  outcomeLabel?: string | null;
  groupLabel?: string | null;
  /** How many groups were compared. Drives the multiple-comparison caution. */
  groupCount?: number | null;
  /** An effect size with an interval, where the test produced one. */
  effect?: {
    measure: string; estimate: number | null;
    ci95Lower: number | null; ci95Upper: number | null; unit?: string | null;
  } | null;
  /** The test's own refusal, where it refused. */
  detail?: string | null;
}

export interface Interpretation {
  /** One line. What a reader takes away. */
  headline: string;
  /** Two or three sentences a clinician can read without a statistician. */
  plain: string;
  /** What would weaken this result. Never empty for a real analysis. */
  cautions: string[];
  /** A sentence in the form a methods or results section uses. */
  reporting: string;
  /** Whether the result reached the conventional threshold. */
  significant: boolean | null;
}

/** The conventional threshold, named once. */
export const ALPHA = 0.05;

const fmtP = (p: number): string => {
  if (p < 0.001) return 'p < 0.001';
  return `p = ${p < 0.01 ? p.toFixed(4) : p.toFixed(3)}`;
};

const fmtEffect = (e: NonNullable<InterpretationInput['effect']>): string | null => {
  if (e.estimate === null) return null;
  const unit = e.unit ? ` ${e.unit}` : '';
  const ci = e.ci95Lower !== null && e.ci95Upper !== null
    ? ` (95% CI ${e.ci95Lower}${unit} to ${e.ci95Upper}${unit})`
    : '';
  return `${e.measure} ${e.estimate}${unit}${ci}`;
};

/**
 * What would weaken this result.
 *
 * Never returns an empty list for a real analysis. Every figure out of this
 * database has at least one caution attached to it, and a result presented
 * with none reads as more certain than anything observational can be.
 */
export function cautionsFor(input: InterpretationInput): string[] {
  const out: string[] = [];
  const n = input.n ?? 0;
  const recorded = input.recorded ?? n;

  if (n > 0 && recorded < n) {
    const pct = Math.round((recorded / n) * 100);
    out.push(
      `Only ${recorded} of ${n} cases (${pct}%) had this recorded. Where a value is missing `
      + 'more often in one group than another, the comparison measures documentation as much '
      + 'as it measures the patient.',
    );
  }

  if (recorded > 0 && recorded < 30) {
    out.push(
      `${recorded} observations is a small series. A difference that matters can easily go `
      + 'undetected at this size, and an apparent difference can easily be chance.',
    );
  }

  if ((input.groupCount ?? 0) > 2) {
    out.push(
      `${input.groupCount} groups were compared at once. This single test is correct for that, `
      + 'but following it with a separate test for every pair inflates the false-positive rate '
      + 'with each comparison.',
    );
  }

  if (input.effect && input.effect.estimate !== null
    && input.effect.ci95Lower !== null && input.effect.ci95Upper !== null) {
    const spansNull = input.effect.measure.toLowerCase().includes('ratio')
      ? input.effect.ci95Lower < 1 && input.effect.ci95Upper > 1
      : input.effect.ci95Lower < 0 && input.effect.ci95Upper > 0;
    if (spansNull) {
      out.push(
        'The confidence interval includes the value that means "no effect", so the direction '
        + 'of the difference is not settled by this data.',
      );
    }
  }

  // The caution that applies to everything in this database, always last so
  // it reads as the standing condition rather than as a specific objection.
  out.push(
    'These cases were not allocated at random. Sicker patients go to more experienced '
    + 'surgeons and to longer operations, so an association here is not evidence of cause.',
  );

  return out;
}

/**
 * The result in words.
 *
 * Reads the p-value, the effect and the denominators, and says what they
 * support — and only that.
 */
export function interpret(input: InterpretationInput): Interpretation {
  const outcome = input.outcomeLabel ?? 'the outcome';
  const group = input.groupLabel ?? 'the groups';
  const p = input.pValue;
  const effectText = input.effect ? fmtEffect(input.effect) : null;

  // A test that refused. Say so, and say why, rather than printing a blank.
  if (p === null || p === undefined || !Number.isFinite(p)) {
    const why = input.detail ?? 'The data did not support this test.';
    return {
      headline: `${input.test} could not be computed.`,
      plain: `${input.test} was not computed on this cohort. ${why}`,
      cautions: cautionsFor(input),
      reporting: `${input.test} was not performed: ${why.toLowerCase()}`,
      significant: null,
    };
  }

  const sig = p < ALPHA;
  const pText = fmtP(p);

  const headline = sig
    ? `${outcome} differed by ${group} (${pText}).`
    // NEVER "no difference". See the header.
    : `No difference in ${outcome} by ${group} was detected (${pText}).`;

  const plain = sig
    ? `${input.test} found a difference in ${outcome} between ${group} that is unlikely to be `
      + `chance alone (${pText}).`
      + (effectText ? ` The size of it: ${effectText}.` : '')
      + ' Whether a difference of that size matters clinically is a separate question from '
      + 'whether it is statistically detectable, and this test does not answer it.'
    : `${input.test} did not detect a difference in ${outcome} between ${group} (${pText}). `
      + 'That is not the same as showing there is none: a study this size can miss a '
      + 'difference that matters.'
      + (effectText ? ` The estimate was ${effectText}, and the interval is what tells you how much is still possible.` : '');

  const reporting = sig
    ? `${outcome} differed significantly between ${group} (${input.test}, ${pText}`
      + `${effectText ? `; ${effectText}` : ''}`
      + `${input.recorded ? `; n = ${input.recorded}` : ''}).`
    : `There was no statistically significant difference in ${outcome} between ${group} `
      + `(${input.test}, ${pText}${input.recorded ? `; n = ${input.recorded}` : ''}).`;

  return { headline, plain, cautions: cautionsFor(input), reporting, significant: sig };
}
