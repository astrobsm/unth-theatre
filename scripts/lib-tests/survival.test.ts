// Kaplan-Meier and the log-rank test.
//
// THE CENSORING IS THE WHOLE THING. A patient operated on last week and alive
// today has not survived — they have not been followed. Counting them as a
// success inflates the figure; dropping them loses the newest cases, which
// are usually the ones being asked about. These tests are built on a worked
// example small enough to check the arithmetic by hand, precisely so that the
// censoring behaviour is verifiable rather than assumed.
import { describe, it, expect } from 'vitest';
import {
  kaplanMeier, kaplanMeierByGroup, logRank, survivalAt,
} from '../../src/lib/research/survival';

const obs = (time: number, event: boolean, group?: string) => ({ time, event, group });

describe('the Kaplan-Meier estimate', () => {
  it('steps down only at event times, by d/n each time', () => {
    // Six patients, events at 2 and 6, censored at 4.
    // t=2: 1 of 6 → S = 5/6 = 0.8333
    // t=6: at risk is 4 (two left at 4 and 5 censored), 1 event → S = 0.8333 x 3/4 = 0.625
    const curve = kaplanMeier([
      obs(2, true), obs(4, false), obs(5, false),
      obs(6, true), obs(8, false), obs(9, false),
    ]);
    expect(curve.points).toHaveLength(2);
    expect(curve.points[0].time).toBe(2);
    expect(curve.points[0].atRisk).toBe(6);
    expect(curve.points[0].survival).toBeCloseTo(0.8333, 3);
    expect(curve.points[1].time).toBe(6);
    expect(curve.points[1].atRisk).toBe(3);
    expect(curve.points[1].survival).toBeCloseTo(0.5556, 3);
  });

  it('does NOT step down at a censoring time', () => {
    // The mechanism that makes this honest: a censored patient leaves the
    // risk set without moving the curve.
    const curve = kaplanMeier([obs(1, false), obs(2, false), obs(3, true)]);
    expect(curve.points).toHaveLength(1);
    expect(curve.points[0].time).toBe(3);
  });

  it('counts events and censored cases separately', () => {
    const curve = kaplanMeier([obs(1, true), obs(2, false), obs(3, true)]);
    expect(curve.n).toBe(3);
    expect(curve.events).toBe(2);
    expect(curve.censored).toBe(1);
  });

  it('gives an interval that narrows as the numbers grow', () => {
    const small = kaplanMeier(Array.from({ length: 10 }, (_, i) => obs(i + 1, i < 5)));
    const large = kaplanMeier(Array.from({ length: 200 }, (_, i) => obs((i % 10) + 1, i % 2 === 0)));
    const sWidth = small.points[0].ci95Upper - small.points[0].ci95Lower;
    const lWidth = large.points[0].ci95Upper - large.points[0].ci95Lower;
    expect(lWidth).toBeLessThan(sWidth);
  });

  it('never reports a survival probability outside 0 to 1', () => {
    const curve = kaplanMeier(Array.from({ length: 8 }, (_, i) => obs(i + 1, true)));
    curve.points.forEach((p) => {
      expect(p.survival).toBeGreaterThanOrEqual(0);
      expect(p.ci95Lower).toBeGreaterThanOrEqual(0);
      expect(p.ci95Upper).toBeLessThanOrEqual(1);
    });
  });
});

describe('the median, and refusing to invent one', () => {
  it('finds the median when the curve crosses a half', () => {
    const curve = kaplanMeier([
      obs(1, true), obs(2, true), obs(3, true), obs(4, false),
      obs(5, false), obs(6, false),
    ]);
    expect(curve.medianSurvival).toBe(3);
    expect(curve.medianNote).toContain('Half the patients');
  });

  it('REFUSES a median when fewer than half had the event', () => {
    // The common error is to report the longest follow-up instead, which
    // says the opposite of the truth.
    const curve = kaplanMeier([
      obs(1, true), obs(2, false), obs(3, false), obs(4, false),
      obs(50, false),
    ]);
    expect(curve.medianSurvival).toBeNull();
    expect(curve.medianNote).toContain('Median not reached');
    expect(curve.medianNote).toContain('must not be quoted as one');
    // The longest follow-up is still available, but it is not the median.
    expect(curve.maxFollowUp).toBe(50);
  });

  it('says so plainly when nothing happened at all', () => {
    const curve = kaplanMeier([obs(5, false), obs(6, false)]);
    expect(curve.events).toBe(0);
    expect(curve.points).toEqual([]);
    expect(curve.medianNote).toContain('No events occurred');
  });

  it('says so plainly when there is nothing usable', () => {
    const curve = kaplanMeier([
      { time: null, event: true }, { time: 5, event: null },
      { time: -1, event: true },
    ]);
    expect(curve.n).toBe(0);
    expect(curve.medianNote).toContain('No usable observations');
  });
});

describe('the log-rank test', () => {
  it('finds no difference between two identical groups', () => {
    const rows = [
      ...Array.from({ length: 20 }, (_, i) => obs(i + 1, i < 10, 'A')),
      ...Array.from({ length: 20 }, (_, i) => obs(i + 1, i < 10, 'B')),
    ];
    const r = logRank(rows);
    expect(r.pValue!).toBeGreaterThan(0.5);
    expect(r.df).toBe(1);
    expect(r.groups).toHaveLength(2);
  });

  it('finds a difference when one group does much worse', () => {
    const rows = [
      // A: everyone has the event early.
      ...Array.from({ length: 25 }, (_, i) => obs(i + 1, true, 'A')),
      // B: almost nobody does, and late.
      ...Array.from({ length: 25 }, (_, i) => obs(i + 30, i > 22, 'B')),
    ];
    const r = logRank(rows);
    expect(r.pValue!).toBeLessThan(0.01);
    // A observed more events than expected; B fewer.
    const a = r.groups.find((g) => g.label === 'A')!;
    expect(a.observed).toBeGreaterThan(a.expected);
  });

  it('refuses a single group', () => {
    const r = logRank([obs(1, true, 'A'), obs(2, false, 'A')]);
    expect(r.statistic).toBeNull();
    expect(r.detail).toContain('at least two groups');
  });

  it('refuses when nothing happened in any group', () => {
    const r = logRank([obs(1, false, 'A'), obs(2, false, 'B')]);
    expect(r.statistic).toBeNull();
    expect(r.detail).toContain('No events occurred');
  });

  it('splits into one curve per group, largest first', () => {
    const curves = kaplanMeierByGroup([
      ...Array.from({ length: 5 }, (_, i) => obs(i + 1, true, 'Small')),
      ...Array.from({ length: 15 }, (_, i) => obs(i + 1, i < 8, 'Large')),
    ]);
    expect(curves.map((c) => c.label)).toEqual(['Large', 'Small']);
    expect(curves[0].n).toBe(15);
  });
});

describe('survival at a named time', () => {
  const curve = kaplanMeier([
    obs(10, true), obs(20, true), obs(30, true),
    obs(40, false), obs(50, false), obs(60, false),
  ]);

  it('reads the curve at that point', () => {
    expect(survivalAt(curve, 5)).toBe(1);
    expect(survivalAt(curve, 10)).toBeCloseTo(0.8333, 3);
    expect(survivalAt(curve, 25)).toBeCloseTo(0.6667, 3);
  });

  it('REFUSES to extrapolate past the longest follow-up', () => {
    // Beyond the data there is no estimate, only a guess, and a 90-day
    // survival quoted from 60 days of follow-up is exactly that.
    expect(survivalAt(curve, 100)).toBeNull();
  });

  it('gives nothing for an empty curve', () => {
    expect(survivalAt(kaplanMeier([]), 10)).toBeNull();
  });
});
