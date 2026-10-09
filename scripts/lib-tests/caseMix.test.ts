/**
 * Case mix: counting the hospital's workload by the size of the operation.
 *
 * The arithmetic is simple. What is not simple is that ORM holds two different
 * answers to "how big was this operation", and they disagree about coverage
 * and about banding:
 *
 *   complexityClass — four bands including Supermajor, derived from an
 *   eight-criterion score, captured at the END of the post-operative note. It
 *   exists only for cases somebody finished writing up.
 *
 *   magnitude — three bands, no Supermajor, captured at BOOKING to size the
 *   consumable pack. Nearly every case has one.
 *
 * The failure this suite exists to prevent is a report that quietly drops
 * every case it cannot band. A theatre assessing complexity on a third of its
 * work would then appear, in its own audit report, to perform a third as many
 * operations as it does — and the figure would look entirely plausible to
 * whoever read it.
 *
 * So: every case is counted, every case says where its band came from, and
 * Unclassified is a band like the others rather than an omission.
 */
import { describe, expect, it } from 'vitest';

import {
  classifyCase, fromMagnitude, fromComplexityClass, buildCaseMix, monthKey, monthLabel,
  BANDS, UNCLASSIFIED, type CaseMixInput,
} from '../../src/lib/analytics/caseMix';

const onCase = (over: Partial<CaseMixInput> = {}): CaseMixInput => ({
  scheduledDate: '2026-03-15T08:30:00Z',
  subspecialty: 'Neurosurgery',
  unit: 'Neuro Unit IV',
  complexityClass: null,
  magnitude: null,
  ...over,
});

describe('reading the two sources', () => {
  it('takes the assessed class when there is one', () => {
    const c = classifyCase({ complexityClass: 'Supermajor', magnitude: 'MINOR' });
    expect(c.band).toBe('Supermajor');
    expect(c.source).toBe('assessed');
  });

  it('falls back to the booking magnitude', () => {
    const c = classifyCase({ complexityClass: null, magnitude: 'MAJOR' });
    expect(c.band).toBe('Major');
    expect(c.source).toBe('booking');
  });

  it('never promotes a booking MAJOR to Supermajor', () => {
    // Supermajor is a judgement about what the operation turned out to be —
    // over four hours, over a litre of blood, ICU expected. None of that is
    // known at booking, and inventing it would conjure the hospital's most
    // serious workload out of nothing.
    expect(fromMagnitude('MAJOR')).toBe('Major');
    expect(fromMagnitude('MAJOR')).not.toBe('Supermajor');
  });

  it('is unclassified when neither exists, rather than guessed', () => {
    const c = classifyCase({});
    expect(c.band).toBe(UNCLASSIFIED);
    expect(c.source).toBe('none');
  });

  it('tolerates the casing each source actually stores', () => {
    expect(fromComplexityClass('supermajor')).toBe('Supermajor');
    expect(fromComplexityClass('  Major ')).toBe('Major');
    expect(fromMagnitude('minor')).toBe('Minor');
    expect(fromMagnitude(' Intermediate ')).toBe('Intermediate');
  });

  it('rejects a value it does not recognise instead of inventing a band', () => {
    expect(fromMagnitude('ENORMOUS')).toBeNull();
    expect(fromComplexityClass('Grade 4')).toBeNull();
    expect(classifyCase({ magnitude: 'ENORMOUS' }).band).toBe(UNCLASSIFIED);
  });
});

describe('the totals', () => {
  it('counts every case exactly once', () => {
    // The property the whole report rests on. Any case that classifies into
    // nothing must still appear in the total, or the hospital under-reports
    // its own workload.
    const rows = [
      onCase({ complexityClass: 'Major' }),
      onCase({ magnitude: 'MINOR' }),
      onCase({}),                                   // neither
      onCase({ complexityClass: 'Supermajor' }),
    ];
    const r = buildCaseMix(rows);

    expect(r.total).toBe(4);
    const summed = BANDS.reduce((s, b) => s + r.counts[b], 0) + r.counts[UNCLASSIFIED];
    expect(summed).toBe(4);
  });

  it('says how many came from each source', () => {
    // So "142 Major" can be read as 20 assessed and 122 assumed, rather than
    // taken for 142 measured.
    const r = buildCaseMix([
      onCase({ complexityClass: 'Major' }),
      onCase({ magnitude: 'MAJOR' }),
      onCase({ magnitude: 'MAJOR' }),
      onCase({}),
    ]);
    expect(r.counts.Major).toBe(3);
    expect(r.provenance).toEqual({ assessed: 1, booking: 2, none: 1 });
  });

  it('keeps unclassified visible rather than dropping it', () => {
    const r = buildCaseMix([onCase({}), onCase({})]);
    expect(r.total).toBe(2);
    expect(r.counts[UNCLASSIFIED]).toBe(2);
  });

  it('handles an empty window without dividing by anything', () => {
    const r = buildCaseMix([]);
    expect(r.total).toBe(0);
    expect(r.byMonth).toEqual([]);
    expect(r.counts[UNCLASSIFIED]).toBe(0);
  });
});

describe('the breakdowns', () => {
  const rows = [
    onCase({ scheduledDate: '2026-01-10T08:00:00Z', subspecialty: 'Urology', unit: 'Uro I', complexityClass: 'Minor' }),
    onCase({ scheduledDate: '2026-03-02T08:00:00Z', subspecialty: 'Neurosurgery', unit: 'Neuro IV', complexityClass: 'Major' }),
    onCase({ scheduledDate: '2026-03-20T08:00:00Z', subspecialty: 'Neurosurgery', unit: 'Neuro IV', magnitude: 'MAJOR' }),
    onCase({ scheduledDate: '2026-02-05T08:00:00Z', subspecialty: 'Neurosurgery', unit: 'Neuro II', complexityClass: 'Supermajor' }),
  ];

  it('orders months chronologically, so a trend reads left to right', () => {
    const r = buildCaseMix(rows);
    expect(r.byMonth.map((m) => m.key)).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('orders subspecialties by volume, busiest first', () => {
    const r = buildCaseMix(rows);
    expect(r.bySubspecialty[0].key).toBe('Neurosurgery');
    expect(r.bySubspecialty[0].total).toBe(3);
  });

  it('splits units apart even within one subspecialty', () => {
    const r = buildCaseMix(rows);
    const neuroIV = r.byUnit.find((u) => u.key === 'Neuro IV');
    expect(neuroIV?.total).toBe(2);
    expect(neuroIV?.counts.Major).toBe(2);
  });

  it('every breakdown sums to the same grand total', () => {
    // Three views of one set of cases. If they disagree, one of them is
    // dropping rows — and a reader comparing two tables would have no way to
    // tell which.
    const r = buildCaseMix(rows);
    const sum = (g: { total: number }[]) => g.reduce((s, x) => s + x.total, 0);
    expect(sum(r.byMonth)).toBe(r.total);
    expect(sum(r.bySubspecialty)).toBe(r.total);
    expect(sum(r.byUnit)).toBe(r.total);
  });

  it('labels a missing subspecialty or unit rather than leaving it blank', () => {
    const r = buildCaseMix([onCase({ subspecialty: null, unit: '   ' })]);
    expect(r.bySubspecialty[0].key).toBe('Not recorded');
    expect(r.byUnit[0].key).toBe('Not recorded');
  });
});

describe('months', () => {
  it('keys on YYYY-MM so string order is date order', () => {
    expect(monthKey('2026-03-15T08:30:00Z')).toBe('2026-03');
    expect(['2026-10', '2026-02', '2026-01'].sort()).toEqual(['2026-01', '2026-02', '2026-10']);
  });

  it('reads as a month and year in a heading', () => {
    expect(monthLabel('2026-09')).toBe('September 2026');
  });

  it('does not mangle a key it cannot parse', () => {
    expect(monthLabel('not-a-month')).toBe('not-a-month');
  });
});
