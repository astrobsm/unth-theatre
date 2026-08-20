/**
 * Theatre list scheduling.
 *
 * The rule being enforced: 20 minutes between cases for the patient to leave,
 * the theatre to be cleaned and the next patient to be brought in. Booking the
 * second case for the moment the first is due to finish books it for a time
 * that cannot happen.
 */
import { describe, expect, it } from 'vitest';

import {
  checkSlot,
  endOf,
  END_OF_DAY_MINUTES,
  nextAvailableStart,
  planList,
  toClock,
  toMinutes,
  TURNOVER_MINUTES,
} from '../../src/lib/theatreOps/scheduling';

const c = (scheduledTime: string, estimatedDuration: number, id?: string) => ({ scheduledTime, estimatedDuration, id });

describe('the turnover is twenty minutes', () => {
  it('is what the hospital asked for', () => {
    expect(TURNOVER_MINUTES).toBe(20);
  });
});

describe('reading and writing times', () => {
  it('converts both ways', () => {
    expect(toMinutes('09:00')).toBe(540);
    expect(toClock(540)).toBe('09:00');
    expect(toClock(825)).toBe('13:45');
  });

  it('accepts a single-digit hour', () => {
    expect(toMinutes('9:30')).toBe(570);
  });

  it('refuses nonsense rather than guessing', () => {
    expect(toMinutes('25:00')).toBeNull();
    expect(toMinutes('09:75')).toBeNull();
    expect(toMinutes('morning')).toBeNull();
    expect(toMinutes(null)).toBeNull();
  });

  it('knows when a case ends', () => {
    expect(endOf(c('09:00', 90))).toBe(630); // 10:30
  });
});

describe('where the next case goes', () => {
  it('an empty list starts at 09:00', () => {
    expect(toClock(nextAvailableStart([]))).toBe('09:00');
  });

  it('the second case starts twenty minutes after the first ends', () => {
    // 09:00 + 90 min = 10:30, + 20 turnover = 10:50.
    expect(toClock(nextAvailableStart([c('09:00', 90)]))).toBe('10:50');
  });

  it('a third case follows the second', () => {
    const list = [c('09:00', 90), c('10:50', 60)];
    // 10:50 + 60 = 11:50, + 20 = 12:10.
    expect(toClock(nextAvailableStart(list))).toBe('12:10');
  });

  it('follows the case that finishes LAST, not the one booked last', () => {
    // A long case booked first, then a short one added earlier in the day:
    // sorting by start time alone would put the next case in the middle of the
    // long one.
    const list = [c('09:00', 300), c('08:00', 30)];
    expect(toClock(nextAvailableStart(list))).toBe('14:20'); // 09:00+300=14:00, +20
  });

  it('ignores a case whose time cannot be read', () => {
    expect(toClock(nextAvailableStart([c('later', 60)]))).toBe('09:00');
  });
});

describe('checking a chosen time', () => {
  const existing = [c('09:00', 90, 'first')]; // ends 10:30

  it('accepts a time that clears the turnover', () => {
    expect(checkSlot({ scheduledTime: '10:50', estimatedDuration: 60, existing }).ok).toBe(true);
  });

  it('REFUSES a case booked for the moment the previous one ends', () => {
    // The exact mistake this exists to prevent: no time to clean or move.
    const r = checkSlot({ scheduledTime: '10:30', estimatedDuration: 60, existing });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('OVERLAP');
  });

  it('refuses one that overlaps outright', () => {
    expect(checkSlot({ scheduledTime: '09:30', estimatedDuration: 60, existing }).ok).toBe(false);
  });

  it('offers the earliest time that would work', () => {
    const r = checkSlot({ scheduledTime: '10:00', estimatedDuration: 60, existing });
    expect(r.suggestedStart).toBe('10:50');
  });

  it('explains why, in minutes a person can act on', () => {
    const r = checkSlot({ scheduledTime: '10:30', estimatedDuration: 60, existing });
    expect(r.message).toContain('20 minutes');
    expect(r.message).toContain('10:50');
  });

  it('refuses a case that would run past the cutoff', () => {
    const r = checkSlot({ scheduledTime: '16:00', estimatedDuration: 120, existing: [] });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('PAST_CUTOFF');
    expect(r.message).toContain('another day');
  });

  it('accepts a case finishing exactly at the cutoff', () => {
    expect(checkSlot({ scheduledTime: '16:00', estimatedDuration: 60, existing: [] }).ok).toBe(true);
    expect(END_OF_DAY_MINUTES).toBe(17 * 60);
  });

  it('requires a duration', () => {
    const r = checkSlot({ scheduledTime: '09:00', estimatedDuration: 0, existing: [] });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_DURATION');
  });

  it('requires a readable start time', () => {
    const r = checkSlot({ scheduledTime: 'morning', estimatedDuration: 60, existing: [] });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_TIME');
  });

  it('does not clash a booking with itself when it is being edited', () => {
    const r = checkSlot({ scheduledTime: '09:00', estimatedDuration: 90, existing, ignoreId: 'first' });
    expect(r.ok).toBe(true);
  });

  it('protects the turnover on BOTH sides', () => {
    // A case slotted just before an existing one still needs time after it.
    const r = checkSlot({ scheduledTime: '08:00', estimatedDuration: 55, existing }); // ends 08:55, only 5 min before 09:00
    expect(r.ok).toBe(false);
  });
});

describe('the day at a glance', () => {
  it('lists the cases in order with their end times', () => {
    const plan = planList([c('10:50', 60, 'b'), c('09:00', 90, 'a')]);
    expect(plan.cases.map((x) => x.id)).toEqual(['a', 'b']);
    expect(plan.cases[0].end).toBe('10:30');
  });

  it('offers where the next case would go', () => {
    expect(planList([c('09:00', 90)]).suggestedStart).toBe('10:50');
  });

  it('counts committed theatre time including the turnovers', () => {
    // 90 + 60 operating, plus one 20-minute turnover between them.
    expect(planList([c('09:00', 90), c('10:50', 60)]).committedMinutes).toBe(170);
  });

  it('says when the day is full', () => {
    const full = planList([c('09:00', 420)]); // ends 16:00, next would be 16:20
    expect(full.roomForAnother).toBe(false);
  });

  it('says when there is still room', () => {
    expect(planList([c('09:00', 90)]).roomForAnother).toBe(true);
  });

  it('an empty day offers 09:00 and has room', () => {
    const plan = planList([]);
    expect(plan.suggestedStart).toBe('09:00');
    expect(plan.roomForAnother).toBe(true);
    expect(plan.committedMinutes).toBe(0);
  });
});
