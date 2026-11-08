// The baseline characteristics table.
//
// THE THREE THINGS THIS TABLE GETS WRONG IN PRINT, and which these tests pin
// down: a mean reported for a skewed variable, a percentage computed over
// cases that had no value recorded, and a p-value printed for the variable the
// groups were defined by.
import { describe, it, expect } from 'vitest';
import { buildTableOne } from '../../src/lib/research/tableOne';
import { variable } from '../../src/lib/research/variables';

const V = {
  type: variable('surgeryType')!,
  age: variable('ageYears')!,
  sex: variable('sex')!,
  blood: variable('bloodLossMl')!,
};

/** A cohort of plain records, the shape the query builder produces. */
function cohort(n: number, make: (i: number) => Record<string, unknown>) {
  return Array.from({ length: n }, (_, i) => make(i)) as never;
}

describe('splitting the cohort', () => {
  const cases = cohort(100, (i) => ({
    surgeryType: i < 60 ? 'ELECTIVE' : 'EMERGENCY',
    ageYears: 20 + (i % 50),
    sex: i % 2 === 0 ? 'Male' : 'Female',
  }));

  it('makes one column per group, largest first', () => {
    const t = buildTableOne(cases, V.type, [V.age, V.sex]);
    expect(t.groups).toEqual([
      { label: 'ELECTIVE', n: 60 }, { label: 'EMERGENCY', n: 40 },
    ]);
    expect(t.overallN).toBe(100);
  });

  it('COUNTS cases with no grouping value rather than dropping them', () => {
    const withGaps = cohort(100, (i) => ({
      surgeryType: i < 10 ? null : (i < 60 ? 'ELECTIVE' : 'EMERGENCY'),
      ageYears: 40,
    }));
    const t = buildTableOne(withGaps, V.type, [V.age]);
    expect(t.ungrouped).toBe(10);
    expect(t.groups.reduce((a, g) => a + g.n, 0)).toBe(90);
    // And it says so under the table, because the columns do not add up.
    expect(t.footnotes.join(' ')).toContain('no value for');
  });
});

describe('how a continuous variable is reported', () => {
  const skewed = cohort(60, (i) => ({
    surgeryType: i < 30 ? 'ELECTIVE' : 'EMERGENCY',
    // A long right tail, as operating times and blood loss actually have.
    bloodLossMl: i < 55 ? 100 : 5000,
  }));

  it('reports a MEDIAN and IQR by default, not a mean', () => {
    const t = buildTableOne(skewed, V.type, [V.blood]);
    const row = t.rows.find((r) => r.key === 'bloodLossMl')!;
    // The median is 100; a mean would be about 500 and describe nobody.
    expect(row.overall.display).toContain('100');
    expect(row.overall.display).toContain('[');
    expect(row.test).toBe('Kruskal-Wallis H');
  });

  it('says why in the footnote', () => {
    const t = buildTableOne(skewed, V.type, [V.blood]);
    expect(t.footnotes[0]).toContain('median');
    expect(t.footnotes[0]).toContain('a mean does not');
  });

  it('switches to mean (SD) and ANOVA when asked', () => {
    const t = buildTableOne(skewed, V.type, [V.blood], { parametric: true });
    const row = t.rows.find((r) => r.key === 'bloodLossMl')!;
    expect(row.overall.display).toContain('(');
    expect(row.test).toBe('One-way ANOVA');
    expect(t.footnotes[0]).toContain('mean (SD)');
  });
});

describe('how a categorical variable is reported', () => {
  const cases = cohort(100, (i) => ({
    surgeryType: i < 50 ? 'ELECTIVE' : 'EMERGENCY',
    sex: i % 4 === 0 ? 'Female' : 'Male',
  }));

  it('gives a heading row and one indented row per level', () => {
    const t = buildTableOne(cases, V.type, [V.sex]);
    const heading = t.rows.find((r) => r.key === 'sex')!;
    const levels = t.rows.filter((r) => r.isLevel);
    expect(heading.isLevel).toBeUndefined();
    expect(levels.map((r) => r.label).sort()).toEqual(['Female', 'Male']);
  });

  it('puts the p-value on the heading row, not on each level', () => {
    const t = buildTableOne(cases, V.type, [V.sex]);
    expect(t.rows.find((r) => r.key === 'sex')!.test).toBeTruthy();
    t.rows.filter((r) => r.isLevel).forEach((r) => expect(r.pValue).toBeNull());
  });

  it('computes percentages over the cases that HAD a value', () => {
    // Half the cohort has no sex recorded. A percentage over 100 would be
    // half the real figure and would be wrong in a way nobody notices.
    const half = cohort(100, (i) => ({
      surgeryType: i < 50 ? 'ELECTIVE' : 'EMERGENCY',
      sex: i < 50 ? 'Male' : null,
    }));
    const t = buildTableOne(half, V.type, [V.sex]);
    const male = t.rows.find((r) => r.isLevel && r.label === 'Male')!;
    expect(male.overall.display).toBe('50 (100%)');
    expect(male.overall.recorded).toBe(50);
    expect(male.overall.total).toBe(100);
  });

  it('reports how many had nothing recorded', () => {
    const half = cohort(100, (i) => ({
      surgeryType: i < 50 ? 'ELECTIVE' : 'EMERGENCY',
      sex: i < 50 ? 'Male' : null,
    }));
    const t = buildTableOne(half, V.type, [V.sex]);
    expect(t.rows.find((r) => r.key === 'sex')!.missing).toBe(50);
  });
});

describe('the tests chosen, and the one refused', () => {
  it('REFUSES a p-value for the variable the groups were defined by', () => {
    // Testing whether the emergency group has more emergencies is a
    // tautology that gets printed more often than it should.
    const cases = cohort(100, (i) => ({
      surgeryType: i < 50 ? 'ELECTIVE' : 'EMERGENCY', ageYears: 40,
    }));
    const t = buildTableOne(cases, V.type, [V.type, V.age]);
    const self = t.rows.find((r) => r.key === 'surgeryType' && !r.isLevel)!;
    expect(self.pValue).toBeNull();
    expect(self.pNote).toContain('groups are defined by this variable');
  });

  it('uses Fisher’s exact test on a sparse 2x2 instead of chi-square', () => {
    // Chi-square is not valid with a cell below five and will return a
    // p-value anyway, which is the trap.
    const sparse = cohort(24, (i) => ({
      surgeryType: i < 12 ? 'ELECTIVE' : 'EMERGENCY',
      sex: i === 0 || i === 12 ? 'Female' : 'Male',
    }));
    const t = buildTableOne(sparse, V.type, [V.sex]);
    expect(t.rows.find((r) => r.key === 'sex')!.test).toBe("Fisher's exact test");
  });

  it('uses chi-square when the table is big enough', () => {
    const big = cohort(200, (i) => ({
      surgeryType: i < 100 ? 'ELECTIVE' : 'EMERGENCY',
      sex: i % 2 === 0 ? 'Female' : 'Male',
    }));
    expect(buildTableOne(big, V.type, [V.sex]).rows.find((r) => r.key === 'sex')!.test)
      .toContain('Chi');
  });

  it('finds a real difference and reports it', () => {
    const cases = cohort(200, (i) => ({
      surgeryType: i < 100 ? 'ELECTIVE' : 'EMERGENCY',
      // Emergencies are much older in this made-up cohort.
      ageYears: i < 100 ? 30 + (i % 10) : 70 + (i % 10),
    }));
    const t = buildTableOne(cases, V.type, [V.age]);
    expect(t.rows.find((r) => r.key === 'ageYears')!.pValue!).toBeLessThan(0.001);
  });

  it('leaves out a variable nothing was recorded for', () => {
    const cases = cohort(50, (i) => ({
      surgeryType: i < 25 ? 'ELECTIVE' : 'EMERGENCY', ageYears: null, sex: 'Male',
    }));
    const t = buildTableOne(cases, V.type, [V.age, V.sex]);
    expect(t.rows.find((r) => r.key === 'ageYears')).toBeUndefined();
    expect(t.rows.find((r) => r.key === 'sex')).toBeTruthy();
  });

  it('carries the footnotes a reader needs to read the table', () => {
    const cases = cohort(40, (i) => ({
      surgeryType: i < 20 ? 'ELECTIVE' : 'EMERGENCY', ageYears: 40,
    }));
    const notes = buildTableOne(cases, V.type, [V.age]).footnotes.join(' ');
    expect(notes).toContain('of the cases that had the value RECORDED');
    expect(notes).toContain('measures documentation');
  });
});
