import { describe, it, expect } from 'vitest';
import { memberCaseload, shortDay, listDays, trimLabel } from '../../src/lib/dutyPerformance/caseload';
import type { DutyEvent } from '../../src/lib/dutyPerformance/types';

// Staff told us the messages did not describe their duty, and they were right:
// the figure quoted was the department's, because nothing in the data named an
// individual. This module is the fix, and the way it can be wrong is specific —
// claiming a case was somebody's when it was not. That is worse than the
// original complaint, because it is precise and false.

const EV = (over: Partial<DutyEvent> = {}): DutyEvent => ({
  id: 'e1',
  personId: null,
  personName: null,
  unit: 'General Surgery',
  label: 'Propofol — Mrs A (12345) — laparotomy',
  // Pharmacy: due at the list start on the 8th, so the packing was the 7th.
  dueAt: new Date('2026-10-08T07:00:00Z'),
  doneAt: null,
  dutyDay: '2026-10-07',
  ...over,
});

describe('the cases that were actually this person’s', () => {
  it('counts the unclaimed work that fell on a night they were rostered', () => {
    const c = memberCaseload({
      duty: 'PHARMACY_PACKING',
      userId: 'pharm1',
      rosteredDays: ['2026-10-07'],
      events: [EV(), EV({ id: 'e2' })],
    });
    expect(c.total).toBe(2);
    expect(c.outstanding).toBe(2);
    expect(c.onRoster).toBe(2);
    expect(c.basis).toBe('roster');
  });

  it('ignores the nights they were not on', () => {
    const c = memberCaseload({
      duty: 'PHARMACY_PACKING',
      userId: 'pharm1',
      rosteredDays: ['2026-10-07'],
      events: [EV(), EV({ id: 'e2', dutyDay: '2026-10-14' })],
    });
    expect(c.total).toBe(1);
  });

  // The failure that would destroy the board's credibility faster than the
  // original complaint: telling two people the same case was theirs.
  it('does not claim a case a colleague already did on that night', () => {
    const c = memberCaseload({
      duty: 'PHARMACY_PACKING',
      userId: 'pharm1',
      rosteredDays: ['2026-10-07'],
      events: [EV({ personId: 'pharm2', doneAt: new Date('2026-10-07T20:00:00Z') })],
    });
    expect(c.total).toBe(0);
    expect(c.basis).toBe('none');
  });

  it('counts what the record names them on, rostered or not', () => {
    const c = memberCaseload({
      duty: 'PHARMACY_PACKING',
      userId: 'pharm1',
      rosteredDays: [],
      events: [EV({ personId: 'pharm1', doneAt: new Date('2026-10-07T20:00:00Z') })],
    });
    expect(c.total).toBe(1);
    expect(c.done).toBe(1);
    expect(c.named).toBe(1);
    expect(c.basis).toBe('named');
  });

  it('says plainly when nothing was theirs', () => {
    const c = memberCaseload({
      duty: 'PHARMACY_PACKING', userId: 'pharm1', rosteredDays: [], events: [EV()],
    });
    expect(c.total).toBe(0);
    expect(c.basis).toBe('none');
  });

  it('applies the duty’s own grace before calling anything late', () => {
    // Pharmacy has 30 minutes. Fifteen minutes past the list start is not late.
    const near = memberCaseload({
      duty: 'PHARMACY_PACKING',
      userId: 'p',
      events: [EV({ personId: 'p', doneAt: new Date('2026-10-08T07:15:00Z') })],
    });
    expect(near.late).toBe(0);
    expect(near.onTime).toBe(1);

    const far = memberCaseload({
      duty: 'PHARMACY_PACKING',
      userId: 'p',
      events: [EV({ personId: 'p', doneAt: new Date('2026-10-08T09:00:00Z') })],
    });
    expect(far.late).toBe(1);
  });

  it('names the outstanding ones, soonest first', () => {
    const c = memberCaseload({
      duty: 'PHARMACY_PACKING',
      userId: 'p',
      rosteredDays: ['2026-10-07', '2026-10-14', '2026-10-21'],
      events: [
        EV({ id: 'c', dutyDay: '2026-10-21', label: 'Third' }),
        EV({ id: 'a', dutyDay: '2026-10-07', label: 'First' }),
        EV({ id: 'b', dutyDay: '2026-10-14', label: 'Second' }),
      ],
      limit: 2,
    });
    expect(c.missing.map((m) => m.label)).toEqual(['First', 'Second']);
    expect(c.outstanding).toBe(3);
    expect(c.days).toEqual(['2026-10-07', '2026-10-14', '2026-10-21']);
  });

  // An event whose collector could not work out the day must not be matched to
  // a roster line by accident — that is how somebody gets told a case on a day
  // they were at home was theirs.
  it('will not match an event with no duty day to a roster day', () => {
    const c = memberCaseload({
      duty: 'PHARMACY_PACKING',
      userId: 'p',
      rosteredDays: ['2026-10-07'],
      events: [EV({ dutyDay: null })],
    });
    expect(c.total).toBe(0);
  });
});

describe('putting dates in a message', () => {
  it('writes a date the way somebody says it', () => {
    expect(shortDay('2026-10-07')).toBe('7 Oct');
    expect(shortDay('2026-01-31')).toBe('31 Jan');
    expect(shortDay(null)).toBe('');
  });

  it('lists a few days and counts the rest', () => {
    expect(listDays(['2026-09-30', '2026-10-07'])).toBe('30 Sep and 7 Oct');
    expect(listDays(['2026-10-01', '2026-10-02', '2026-10-03'], 2))
      .toBe('1 Oct, 2 Oct and 1 more');
    expect(listDays([])).toBe('');
  });

  it('cuts a label rather than wrapping a phone screen three times', () => {
    const long = trimLabel('x'.repeat(200));
    expect(long.length).toBeLessThanOrEqual(64);
    expect(trimLabel('  Propofol   —  Mrs A ')).toBe('Propofol — Mrs A');
  });
});
