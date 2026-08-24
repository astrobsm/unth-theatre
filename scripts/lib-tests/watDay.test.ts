import { describe, it, expect } from 'vitest';

import {
  watDay, watToday, watDayRange,
  watClock, watMinutesOfDay, watDayOfWeek, watInstantFrom,
} from '../../src/lib/watDay';

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

// ---------------------------------------------------------------------------
// The radio schedule read the HOST clock, and the host is UTC.
// ---------------------------------------------------------------------------

describe('reading a wall clock in WAT', () => {
  it('gives the time the theatre reads, not the time the server holds', () => {
    // 15:00Z is 16:00 in Enugu.
    const instant = new Date('2026-05-11T15:00:00Z');
    expect(watClock(instant)).toBe('16:00');
    expect(watMinutesOfDay(instant)).toBe(16 * 60);
  });

  it('a broadcast set for 18:00 matches at 18:00 WAT, not 18:00 UTC', () => {
    // What the queue used to compare against (UTC) versus what it must.
    const atSixWat = new Date('2026-05-11T17:00:00Z');
    expect(watClock(atSixWat)).toBe('18:00');
    // An hour later — when the old code would finally have fired it.
    expect(watClock(new Date('2026-05-11T18:00:00Z'))).toBe('19:00');
  });

  it('names the WAT day of week across the midnight seam', () => {
    // 23:30Z Saturday is already 00:30 Sunday in Enugu.
    const sat = new Date('2026-08-22T23:30:00Z');
    expect(sat.getUTCDay()).toBe(6);      // Saturday in UTC
    expect(watDayOfWeek(sat)).toBe(0);    // Sunday in WAT
  });
});

describe('building an instant from a typed date and time', () => {
  it('treats the typed time as theatre time regardless of the device', () => {
    // An admin typing 15:00 means 15:00 in Enugu — 14:00Z.
    const d = watInstantFrom('2026-05-11', '15:00');
    expect(d?.toISOString()).toBe('2026-05-11T14:00:00.000Z');
  });

  it('round-trips through the readers', () => {
    const d = watInstantFrom('2026-05-11', '08:15')!;
    expect(watDay(d)).toBe('2026-05-11');
    expect(watClock(d)).toBe('08:15');
  });

  it('rejects malformed input rather than inventing a time', () => {
    expect(watInstantFrom('not-a-date', '08:00')).toBeNull();
    expect(watInstantFrom('2026-05-11', '25:00')).toBeNull();
    expect(watInstantFrom('2026-05-11', '')).toBeNull();
  });
});

describe('the daily-drift bug', () => {
  it('same WAT day means it has already played today', () => {
    // Both instants are 23 August in Enugu, so a DAILY announcement that
    // played at the first must NOT fire again at the second.
    const played = new Date('2026-08-23T09:36:00Z'); // 10:36 WAT
    const later = new Date('2026-08-23T15:00:00Z');  // 16:00 WAT
    expect(watDay(played)).toBe(watDay(later));
  });

  it('and the next WAT day is a fresh one even before midnight UTC', () => {
    const played = new Date('2026-08-23T09:36:00Z');
    const nextDay = new Date('2026-08-23T23:30:00Z'); // 00:30 WAT on the 24th
    expect(watDay(played)).not.toBe(watDay(nextDay));
  });
});
