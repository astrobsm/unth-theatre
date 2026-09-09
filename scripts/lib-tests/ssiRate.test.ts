import { describe, it, expect } from 'vitest';
import { ssiRates, followUpDue, type SurveillanceRow } from '../../src/lib/ipc/ssiRate';

const row = (
  status: SurveillanceRow['status'],
  woundClass: SurveillanceRow['woundClass'] = 'CLEAN',
): SurveillanceRow => ({ status, woundClass });

describe('what an SSI rate is actually divided by', () => {
  it('divides infections by the cases that were followed to a conclusion', () => {
    const { overall } = ssiRates([
      row('CLOSED_INFECTION'),
      row('CLOSED_NO_INFECTION'),
      row('CLOSED_NO_INFECTION'),
      row('CLOSED_NO_INFECTION'),
    ]);
    expect(overall.evaluable).toBe(4);
    expect(overall.infections).toBe(1);
    expect(overall.ratePercent).toBe(25);
  });

  it('does NOT count a patient lost to follow-up as an absence of infection', () => {
    // The single easiest way to make a rate look good. One infection in two
    // evaluable cases is 50%, not 25% — the two unreachable patients are not
    // evidence of anything.
    const { overall } = ssiRates([
      row('CLOSED_INFECTION'),
      row('CLOSED_NO_INFECTION'),
      row('LOST_TO_FOLLOW_UP'),
      row('LOST_TO_FOLLOW_UP'),
    ]);
    expect(overall.evaluable).toBe(2);
    expect(overall.ratePercent).toBe(50);
    expect(overall.lostToFollowUp).toBe(2);
  });

  it('excludes cases still being followed, rather than assuming them clean', () => {
    const { overall } = ssiRates([
      row('CLOSED_INFECTION'),
      row('CLOSED_NO_INFECTION'),
      row('OPEN'),
      row('OPEN'),
    ]);
    expect(overall.evaluable).toBe(2);
    expect(overall.stillOpen).toBe(2);
    expect(overall.ratePercent).toBe(50);
  });

  it('reports how much of the cohort actually reached a conclusion', () => {
    // A rate computed from a third of the cases is not wrong, but it is a
    // different claim, and this is the number that says so.
    const { overall } = ssiRates([
      row('CLOSED_INFECTION'),
      row('OPEN'),
      row('LOST_TO_FOLLOW_UP'),
    ]);
    expect(overall.total).toBe(3);
    expect(overall.followUpPercent).toBe(33.3);
  });

  it('gives no rate at all rather than a misleading zero', () => {
    const { overall } = ssiRates([row('OPEN'), row('LOST_TO_FOLLOW_UP')]);
    expect(overall.ratePercent).toBeNull();
    expect(ssiRates([]).overall.ratePercent).toBeNull();
  });

  it('rounds to one decimal, not four', () => {
    const rows = [row('CLOSED_INFECTION'), ...Array(6).fill(row('CLOSED_NO_INFECTION'))];
    // 1/7 = 14.2857…
    expect(ssiRates(rows).overall.ratePercent).toBe(14.3);
  });
});

describe('splitting by wound class', () => {
  it('keeps each class to its own denominator', () => {
    // The comparison that matters: a dirty case becoming infected is expected,
    // a clean one becoming infected is a question for the theatre.
    const { byWoundClass, overall } = ssiRates([
      row('CLOSED_INFECTION', 'DIRTY_INFECTED'),
      row('CLOSED_NO_INFECTION', 'DIRTY_INFECTED'),
      row('CLOSED_NO_INFECTION', 'CLEAN'),
      row('CLOSED_NO_INFECTION', 'CLEAN'),
      row('CLOSED_NO_INFECTION', 'CLEAN'),
      row('CLOSED_NO_INFECTION', 'CLEAN'),
    ]);
    expect(byWoundClass.DIRTY_INFECTED.ratePercent).toBe(50);
    expect(byWoundClass.CLEAN.ratePercent).toBe(0);
    expect(byWoundClass.CLEAN.evaluable).toBe(4);
    // The overall figure still counts every case.
    expect(overall.evaluable).toBe(6);
  });

  it('reports a class with nothing in it as no rate, not as zero percent', () => {
    const { byWoundClass } = ssiRates([row('CLOSED_NO_INFECTION', 'CLEAN')]);
    expect(byWoundClass.CONTAMINATED.total).toBe(0);
    expect(byWoundClass.CONTAMINATED.ratePercent).toBeNull();
  });

  it('does not throw on an unrecognised wound class', () => {
    // A null column in one old row must not take the whole report down.
    const rows = [{ status: 'CLOSED_INFECTION', woundClass: 'NONSENSE' } as unknown as SurveillanceRow];
    const { overall } = ssiRates(rows);
    expect(overall.total).toBe(1);
    expect(overall.infections).toBe(1);
  });
});

describe('when follow-up closes', () => {
  it('is thirty days for an ordinary operation', () => {
    const due = followUpDue(new Date('2026-09-01T00:00:00Z'), false);
    expect(due.toISOString().slice(0, 10)).toBe('2026-10-01');
  });

  it('is ninety days where an implant was placed', () => {
    // A deep infection around a prosthesis routinely declares itself months
    // later; closing at thirty days would call it clean.
    const due = followUpDue(new Date('2026-09-01T00:00:00Z'), true);
    expect(due.toISOString().slice(0, 10)).toBe('2026-11-30');
  });

  it('does not modify the date it was given', () => {
    const op = new Date('2026-09-01T00:00:00Z');
    followUpDue(op, true);
    expect(op.toISOString().slice(0, 10)).toBe('2026-09-01');
  });
});
