// ============================================================
// Describing what this hospital actually does
// ------------------------------------------------------------
// The structured note exists so that questions can be asked of it: which
// preparation solutions are used, how often a drain goes in without a removal
// instruction, whether one unit closes differently from another. This module
// does the counting and, just as importantly, decides how far the counting is
// allowed to be spoken about.
//
// THREE RULES, AND THEY ARE THE POINT OF THE FILE.
//
// 1. NOTHING HERE CLAIMS A CAUSE. These are observational counts from routine
//    records. They can show that practice varies, that one practice is more
//    common than another, and that an outcome is more frequent alongside one
//    of them. They cannot show that the practice produced the outcome, and no
//    string in this module says or implies that it does. If somebody wants a
//    causal claim they need a study design, not a dashboard.
//
// 2. A SMALL DENOMINATOR IS NOT A FINDING. A surgeon with three cases who used
//    povidone iodine in all of them has not got a 100% rate; they have three
//    cases. Groups below MIN_CASES are counted in the totals and excluded from
//    every comparison, because the alternative is a league table built on noise
//    — and one that names individuals.
//
// 3. MISSING IS ITS OWN ANSWER. A field nobody filled in is reported as not
//    recorded, never folded into the commonest value and never dropped from
//    the denominator. Most of what this hospital will learn in the first year
//    is about its own documentation, and that is only visible if the gaps are
//    counted.
// ============================================================

import { labelOf } from './vocabulary';

/**
 * Below this, a group is not compared with other groups.
 *
 * Twenty is a judgement, not a calculation. It is low enough that a unit doing
 * one list a week appears within a few months, and high enough that a single
 * unusual case cannot move a percentage by more than five points.
 */
export const MIN_CASES = 20;

export interface Count {
  value: string;
  count: number;
}

export interface DistributionItem {
  value: string;
  label: string;
  count: number;
  /** Of the total, including the not-recorded share. One decimal place. */
  percent: number;
}

export interface Distribution {
  /** The field this describes, as a person would say it. */
  title: string;
  /** Every note considered, whether or not it answered. */
  total: number;
  /** How many left it blank. Reported, never hidden. */
  notRecorded: number;
  items: DistributionItem[];
}

const pct = (n: number, of: number): number => (of <= 0 ? 0 : Math.round((n / of) * 1000) / 10);

/**
 * One field's distribution across a set of notes.
 *
 * `total` is every note in scope, not the sum of the counts — those differ
 * whenever a field was left blank, and the difference is the thing worth
 * knowing.
 */
export function distribution(
  title: string,
  catalogue: string,
  counts: Count[],
  total: number,
): Distribution {
  const answered = counts.reduce((sum, c) => sum + c.count, 0);
  const items = counts
    .map((c) => ({
      value: c.value,
      label: labelOf(catalogue, c.value),
      count: c.count,
      percent: pct(c.count, total),
    }))
    .sort((a, b) => b.count - a.count);

  return { title, total, notRecorded: Math.max(0, total - answered), items };
}

/**
 * A multi-select distribution, where one note contributes to several options.
 *
 * The percentages deliberately sum to more than 100, and the label says "of
 * notes" rather than "of selections" — an operation using diathermy AND suture
 * ligation used both, and reporting them as competing shares of one pie would
 * misrepresent every case that used two methods.
 */
export function multiDistribution(
  title: string,
  catalogue: string,
  counts: Count[],
  total: number,
): Distribution & { overlapping: true } {
  return { ...distribution(title, catalogue, counts, total), overlapping: true };
}

export interface GroupSeries {
  /** The surgeon, unit or period being compared. */
  group: string;
  /** Cases in this group, the denominator for its shares. */
  cases: number;
  /** How often each option was used within the group. */
  counts: Count[];
}

export interface VariationFinding {
  value: string;
  label: string;
  /** Lowest share among the compared groups, as a percentage. */
  lowest: number;
  /** Highest share among them. */
  highest: number;
  /** highest - lowest. The size of the variation, in percentage points. */
  spread: number;
  /** How many groups were large enough to be compared. */
  groupsCompared: number;
  /** Plain words, framed as variation and nothing more. */
  statement: string;
}

/**
 * How much a practice varies between surgeons, units or periods.
 *
 * Returns the options whose share differs most across groups. The wording is
 * fixed here rather than in the UI so that the constraint on what may be
 * claimed lives with the arithmetic that licenses it.
 */
export function practiceVariation(
  catalogue: string,
  groups: GroupSeries[],
  options: { minCases?: number; minSpread?: number } = {},
): VariationFinding[] {
  const minCases = options.minCases ?? MIN_CASES;
  const minSpread = options.minSpread ?? 20;

  const comparable = groups.filter((g) => g.cases >= minCases);
  if (comparable.length < 2) return [];

  const seen = new Set<string>();
  for (const g of comparable) for (const c of g.counts) seen.add(c.value);
  const values = Array.from(seen);

  const findings: VariationFinding[] = [];
  for (const value of values) {
    const shares = comparable.map((g) => {
      const hit = g.counts.find((c) => c.value === value);
      return pct(hit?.count ?? 0, g.cases);
    });
    const lowest = Math.min(...shares);
    const highest = Math.max(...shares);
    const spread = Math.round((highest - lowest) * 10) / 10;
    if (spread < minSpread) continue;

    const label = labelOf(catalogue, value);
    findings.push({
      value,
      label,
      lowest,
      highest,
      spread,
      groupsCompared: comparable.length,
      statement:
        `${label} was recorded in ${lowest}% of cases in one group and ${highest}% in another, ` +
        `across ${comparable.length} groups with at least ${minCases} cases each. ` +
        'This describes variation in practice, not a difference in outcome.',
    });
  }

  return findings.sort((a, b) => b.spread - a.spread);
}

export interface OutcomeAssociation {
  practice: string;
  practiceLabel: string;
  withPractice: { cases: number; events: number; percent: number };
  withoutPractice: { cases: number; events: number; percent: number };
  /** Percentage points. Signed: positive means more frequent WITH the practice. */
  difference: number;
  /** Whether both arms cleared MIN_CASES. Below that nothing is stated. */
  comparable: boolean;
  statement: string;
}

/**
 * How often an outcome occurred alongside a practice, and without it.
 *
 * THIS IS THE MOST DANGEROUS FUNCTION IN THE MODULE and it is written to be
 * boring. It reports two frequencies and their difference. It does not
 * calculate significance, it does not rank practices by outcome, and its
 * statement says "alongside" rather than "because of" or even "associated with
 * better" — because the cases are not randomised and the confounding is
 * enormous. A dirty wound is debrided AND gets infected; the debridement did
 * not cause the infection, the contamination caused both.
 *
 * Where the arms are too small to say anything, it says that instead.
 */
export function outcomeAssociation(
  catalogue: string,
  practice: string,
  withPractice: { cases: number; events: number },
  withoutPractice: { cases: number; events: number },
  outcomeName: string,
  minCases = MIN_CASES,
): OutcomeAssociation {
  const a = { ...withPractice, percent: pct(withPractice.events, withPractice.cases) };
  const b = { ...withoutPractice, percent: pct(withoutPractice.events, withoutPractice.cases) };
  const comparable = a.cases >= minCases && b.cases >= minCases;
  const label = labelOf(catalogue, practice);

  const statement = comparable
    ? `${outcomeName} was recorded in ${a.percent}% of ${a.cases} cases where ${label.toLowerCase()} ` +
      `was used, and ${b.percent}% of ${b.cases} cases where it was not. These are routine records, ` +
      'not a trial: the two groups differ in many ways besides this one, and the difference must not ' +
      'be read as an effect of the practice.'
    : `Too few cases to compare — ${a.cases} with ${label.toLowerCase()} and ${b.cases} without, ` +
      `against a minimum of ${minCases} in each. No comparison is stated.`;

  return {
    practice,
    practiceLabel: label,
    withPractice: a,
    withoutPractice: b,
    difference: comparable ? Math.round((a.percent - b.percent) * 10) / 10 : 0,
    comparable,
    statement,
  };
}

export interface CompletenessItem {
  field: string;
  title: string;
  recorded: number;
  total: number;
  percent: number;
}

/**
 * How much of the note is actually being filled in.
 *
 * The first thing worth measuring, and for a year or so probably the only thing
 * that can honestly be measured. A field completed in 12% of notes cannot
 * support any finding at all, and reporting its completeness beside every
 * distribution is what stops somebody quoting a percentage computed from
 * eleven cases out of six hundred.
 */
export function completeness(
  fields: { field: string; title: string; recorded: number }[],
  total: number,
): CompletenessItem[] {
  return fields
    .map((f) => ({ ...f, total, percent: pct(f.recorded, total) }))
    .sort((a, b) => a.percent - b.percent);
}
