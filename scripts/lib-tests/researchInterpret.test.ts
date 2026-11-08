// Turning a statistical result into words, without saying more than it means.
//
// THE TEST THAT MATTERS MOST: a non-significant result must never be reported
// as "no difference". A study of forty cases will fail to detect a difference
// that matters enormously, and writing that up as "there was no difference
// between the groups" is the commonest statistical error in the surgical
// literature. A module that generates that sentence automatically would put
// it into a great many more papers than a human would.
import { describe, it, expect } from 'vitest';
import { interpret, cautionsFor, ALPHA } from '../../src/lib/research/interpret';

const base = {
  test: 'One-way ANOVA',
  outcomeLabel: 'operating time',
  groupLabel: 'specialty',
  n: 400,
  recorded: 400,
};

describe('a result that reached the threshold', () => {
  const r = interpret({ ...base, pValue: 0.003, groupCount: 4 });

  it('says a difference was found, with the p-value', () => {
    expect(r.significant).toBe(true);
    expect(r.headline).toContain('operating time differed by specialty');
    expect(r.headline).toContain('p = 0.003');
  });

  it('separates statistical detectability from clinical importance', () => {
    expect(r.plain).toContain('matters clinically is a separate question');
  });

  it('gives a sentence that can go straight into a results section', () => {
    expect(r.reporting).toContain('differed significantly');
    expect(r.reporting).toContain('n = 400');
  });
});

describe('a result that did not reach the threshold', () => {
  const r = interpret({ ...base, pValue: 0.42, recorded: 40, n: 40 });

  it('says a difference was NOT DETECTED, never that there is none', () => {
    expect(r.significant).toBe(false);
    expect(r.headline).toContain('was detected');
    expect(r.plain).toContain('did not detect');
    expect(r.plain).toContain('not the same as showing there is none');
  });

  it('never produces the phrase "no difference between"', () => {
    // The exact wording that misleads. Asserted on every surface the module
    // generates, because one of the three is the one that gets copied.
    [r.headline, r.plain, r.reporting].forEach((text) => {
      expect(text.toLowerCase()).not.toContain('there is no difference');
      expect(text.toLowerCase()).not.toContain('no difference between');
    });
  });

  it('uses the guarded form a journal expects in the reporting sentence', () => {
    expect(r.reporting).toContain('no statistically significant difference');
  });
});

describe('what it will not claim', () => {
  it('never says caused, proves or demonstrates', () => {
    [
      interpret({ ...base, pValue: 0.0001, groupCount: 2 }),
      interpret({ ...base, pValue: 0.9 }),
    ].forEach((r) => {
      const all = `${r.headline} ${r.plain} ${r.reporting}`.toLowerCase();
      ['caused', 'proves', 'demonstrates that', 'because of'].forEach((word) => {
        expect(all, `found "${word}"`).not.toContain(word);
      });
    });
  });

  it('always attaches the observational caution', () => {
    const r = interpret({ ...base, pValue: 0.01 });
    expect(r.cautions.length).toBeGreaterThan(0);
    expect(r.cautions[r.cautions.length - 1]).toContain('not allocated at random');
  });
});

describe('the cautions', () => {
  it('reports missing data as a proportion of the cohort', () => {
    const c = cautionsFor({ test: 't', n: 300, recorded: 100 });
    expect(c[0]).toContain('100 of 300');
    expect(c[0]).toContain('33%');
    expect(c[0]).toContain('measures documentation');
  });

  it('warns about a small series', () => {
    const c = cautionsFor({ test: 't', n: 18, recorded: 18 });
    expect(c.join(' ')).toContain('small series');
  });

  it('warns about multiple comparisons only when there are more than two groups', () => {
    expect(cautionsFor({ test: 't', n: 100, recorded: 100, groupCount: 2 }).join(' '))
      .not.toContain('groups were compared');
    expect(cautionsFor({ test: 't', n: 100, recorded: 100, groupCount: 5 }).join(' '))
      .toContain('5 groups were compared');
  });

  it('notices when a ratio interval spans one', () => {
    const c = cautionsFor({
      test: 'x', n: 100, recorded: 100,
      effect: { measure: 'Odds ratio', estimate: 1.2, ci95Lower: 0.8, ci95Upper: 1.9 },
    });
    expect(c.join(' ')).toContain('includes the value that means');
  });

  it('does not raise that caution when the interval excludes one', () => {
    const c = cautionsFor({
      test: 'x', n: 100, recorded: 100,
      effect: { measure: 'Odds ratio', estimate: 3.1, ci95Lower: 1.8, ci95Upper: 5.2 },
    });
    expect(c.join(' ')).not.toContain('includes the value that means');
  });
});

describe('a test that refused', () => {
  it('says so and says why, rather than printing a blank', () => {
    const r = interpret({
      test: "Fisher's exact test", pValue: null,
      detail: 'This needs a 2x2 table.', n: 50, recorded: 50,
    });
    expect(r.significant).toBeNull();
    expect(r.headline).toContain('could not be computed');
    expect(r.plain).toContain('This needs a 2x2 table.');
  });
});

describe('the effect size', () => {
  it('reports the estimate and its interval in the same breath as the p', () => {
    const r = interpret({
      ...base, pValue: 0.004, test: 'Chi-square',
      effect: { measure: 'Odds ratio', estimate: 2.4, ci95Lower: 1.3, ci95Upper: 4.4 },
    });
    expect(r.plain).toContain('Odds ratio 2.4 (95% CI 1.3 to 4.4)');
    expect(r.reporting).toContain('Odds ratio 2.4');
  });

  it('formats a very small p-value the way a journal does', () => {
    expect(interpret({ ...base, pValue: 0.00001 }).headline).toContain('p < 0.001');
  });

  it('uses the conventional threshold, named once', () => {
    expect(ALPHA).toBe(0.05);
    expect(interpret({ ...base, pValue: 0.049 }).significant).toBe(true);
    expect(interpret({ ...base, pValue: 0.051 }).significant).toBe(false);
  });
});
