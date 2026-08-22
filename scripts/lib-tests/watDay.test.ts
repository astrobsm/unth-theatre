import { describe, it, expect } from 'vitest';

import { watDay, watToday, watDayRange } from '../../src/lib/watDay';

// The theatre is on WAT (UTC+1) and the server runs Etc/UTC. Everything below
// is about the one-hour seam between them, which is where night emergencies
// live.

describe('the bug this exists to fix', () => {
  it('a case at 00:30 WAT belongs to that day, not the one before', () => {
    // 23:30 UTC on the 22nd IS 00:30 WAT on the 23rd.
    const instant = new Date('2026-08-22T23:30:00Z');

    // What the old code did:
    expect(instant.toISOString().slice(0, 10)).toBe('2026-08-22');
    // What it should do:
    expect(watDay(instant)).toBe('2026-08-23');
  });

  it('and one at 23:30 WAT stays on its own day', () => {
    expect(watDay(new Date('2026-08-22T22:30:00Z'))).toBe('2026-08-22');
  });

  it('midnight WAT exactly rolls over', () => {
    expect(watDay(new Date('2026-08-22T23:00:00Z'))).toBe('2026-08-23');
  });

  it('one minute before midnight WAT does not', () => {
    expect(watDay(new Date('2026-08-22T22:59:59Z'))).toBe('2026-08-22');
  });
});

describe('watDay', () => {
  it('handles a plain daytime instant', () => {
    expect(watDay(new Date('2026-08-22T09:00:00Z'))).toBe('2026-08-22');
  });

  it('accepts a string', () => {
    expect(watDay('2026-08-22T23:30:00Z')).toBe('2026-08-23');
  });

  it('crosses a month boundary', () => {
    expect(watDay(new Date('2026-08-31T23:30:00Z'))).toBe('2026-09-01');
  });

  it('crosses a year boundary', () => {
    expect(watDay(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });

  it('returns empty string for a bad date rather than throwing', () => {
    // This runs inside a .filter() on a live board; a throw would blank the page.
    expect(watDay('not a date')).toBe('');
  });
});

describe('watToday', () => {
  it('is the WAT day, not the UTC one', () => {
    expect(watToday(new Date('2026-08-22T23:30:00Z'))).toBe('2026-08-23');
  });
});

describe('watDayRange', () => {
  it('a WAT day starts at 23:00 UTC the previous day', () => {
    const { start, end } = watDayRange('2026-08-23');
    expect(start.toISOString()).toBe('2026-08-22T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-23T23:00:00.000Z');
  });

  it('is exactly 24 hours long', () => {
    const { start, end } = watDayRange('2026-08-23');
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('round-trips: every instant in the range has that WAT day', () => {
    const day = '2026-08-23';
    const { start, end } = watDayRange(day);
    expect(watDay(start)).toBe(day);
    expect(watDay(new Date(end.getTime() - 1))).toBe(day);
    // And the instant just outside does not.
    expect(watDay(new Date(start.getTime() - 1))).not.toBe(day);
    expect(watDay(end)).not.toBe(day);
  });
});
