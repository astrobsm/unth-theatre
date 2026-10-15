/**
 * A scheduled broadcast that nobody was polling for.
 *
 * The old test was `b.timeOfDay === hhmm` — fire only if a poll lands inside
 * the one minute the broadcast is due. The queue is polled by whichever
 * browsers happen to have the radio page open, so that minute is promised to
 * nobody. Close the last laptop at 17:58, open the next at 18:02, and the
 * 18:00 broadcast did not fire late; it did not fire at all.
 *
 * These tests pin both halves of the fix:
 *
 *   A DUE TIME STAYS DUE, so a late poll still reads it out.
 *   IT DOES NOT STAY DUE FOREVER, so the 6am call is not read out at 10pm.
 *
 * And they pin the thing that makes "stays due" safe: once fired, it is done
 * until tomorrow, however many times the queue is polled in between.
 */
import { describe, expect, it } from 'vitest';

import {
  broadcastDue, minutesLate, CATCH_UP_MINUTES,
} from '../../src/lib/radio/broadcastDue';

/** A WAT wall-clock moment as the UTC instant it really is. WAT is UTC+1. */
const wat = (iso: string) => new Date(`${iso}+01:00`);

describe('a broadcast due at a time of day', () => {
  const b = { timeOfDay: '18:00', lastTriggered: null };

  it('waits until its time', () => {
    expect(broadcastDue(b, wat('2026-10-15T17:59:00'))).toBe('waiting');
  });

  it('fires on the minute', () => {
    expect(broadcastDue(b, wat('2026-10-15T18:00:00'))).toBe('due');
  });

  it('STILL fires when the first poll is minutes late', () => {
    // The whole point. Nobody had the page open at 18:00.
    expect(broadcastDue(b, wat('2026-10-15T18:02:00'))).toBe('due');
    expect(broadcastDue(b, wat('2026-10-15T19:30:00'))).toBe('due');
  });

  it('gives up once it is too late to mean anything', () => {
    expect(broadcastDue(b, wat('2026-10-15T20:00:00'))).toBe('due');   // exactly 2h
    expect(broadcastDue(b, wat('2026-10-15T20:01:00'))).toBe('missed');
    expect(broadcastDue(b, wat('2026-10-15T23:30:00'))).toBe('missed');
  });

  it('says MISSED rather than DONE when it was never read out', () => {
    // Two different facts. A queue that cannot tell them apart cannot report
    // that the morning call was silently dropped.
    expect(broadcastDue(b, wat('2026-10-15T22:00:00'))).toBe('missed');
    expect(broadcastDue(
      { timeOfDay: '18:00', lastTriggered: wat('2026-10-15T18:00:30') },
      wat('2026-10-15T22:00:00'),
    )).toBe('done');
  });

  it('honours the stated window', () => {
    expect(CATCH_UP_MINUTES).toBe(120);
  });
});

describe('not firing twice', () => {
  it('is done once it has been read out, however often the queue is polled', () => {
    const fired = { timeOfDay: '18:00', lastTriggered: wat('2026-10-15T18:00:10') };
    for (const t of ['18:00:20', '18:01:00', '18:45:00', '19:59:00']) {
      expect(broadcastDue(fired, wat(`2026-10-15T${t}`)), t).toBe('done');
    }
  });

  it('comes round again the next day', () => {
    const fired = { timeOfDay: '18:00', lastTriggered: wat('2026-10-15T18:00:10') };
    expect(broadcastDue(fired, wat('2026-10-16T18:00:00'))).toBe('due');
  });

  it('is not blocked by a firing from EARLIER the same day', () => {
    // An interval broadcast switched to a fixed time, or a manual trigger at
    // noon, must not swallow the 18:00 reading.
    const earlier = { timeOfDay: '18:00', lastTriggered: wat('2026-10-15T12:00:00') };
    expect(broadcastDue(earlier, wat('2026-10-15T18:00:00'))).toBe('due');
  });

  it('is waiting, not done, before its time even if it fired yesterday', () => {
    const yesterday = { timeOfDay: '18:00', lastTriggered: wat('2026-10-14T18:00:05') };
    expect(broadcastDue(yesterday, wat('2026-10-15T09:00:00'))).toBe('waiting');
  });
});

describe('the WAT clock', () => {
  it('reads the due time in Enugu, not in UTC', () => {
    // 18:00 WAT is 17:00 UTC. Reading the host clock fired this an hour late
    // every single day, which is the fault watDay was written to end.
    const b = { timeOfDay: '18:00', lastTriggered: null };
    expect(broadcastDue(b, new Date('2026-10-15T17:00:00.000Z'))).toBe('due');
    expect(broadcastDue(b, new Date('2026-10-15T16:59:00.000Z'))).toBe('waiting');
  });

  it('handles a broadcast due late in the WAT evening', () => {
    // 23:30 WAT is 22:30 UTC the same day — the hour where the UTC day and
    // the WAT day disagree is 23:00–24:00 WAT.
    const b = { timeOfDay: '23:30', lastTriggered: null };
    expect(broadcastDue(b, wat('2026-10-15T23:30:00'))).toBe('due');
    expect(broadcastDue(b, wat('2026-10-15T23:00:00'))).toBe('waiting');
  });
});

describe('a broadcast on an interval', () => {
  it('fires immediately if it has never fired', () => {
    expect(broadcastDue({ intervalMins: 30, lastTriggered: null }, new Date())).toBe('due');
  });

  it('waits out the interval', () => {
    const b = { intervalMins: 30, lastTriggered: wat('2026-10-15T18:00:00') };
    expect(broadcastDue(b, wat('2026-10-15T18:29:00'))).toBe('waiting');
    expect(broadcastDue(b, wat('2026-10-15T18:30:00'))).toBe('due');
  });

  it('is ignored when a time of day is also set', () => {
    // timeOfDay wins, as it always did.
    const b = { timeOfDay: '18:00', intervalMins: 5, lastTriggered: wat('2026-10-15T17:00:00') };
    expect(broadcastDue(b, wat('2026-10-15T17:30:00'))).toBe('waiting');
  });
});

describe('a broadcast with no schedule at all', () => {
  it('never fires', () => {
    expect(broadcastDue({}, new Date())).toBe('unscheduled');
    expect(broadcastDue({ intervalMins: 0 }, new Date())).toBe('unscheduled');
    expect(broadcastDue({ timeOfDay: '' }, new Date())).toBe('unscheduled');
  });

  it('refuses a time it cannot parse rather than guessing', () => {
    // Guessing would put a broadcast on the corridor speaker at an hour
    // nobody chose.
    for (const bad of ['6pm', '25:00', 'noon', '18', '18:99']) {
      expect(broadcastDue({ timeOfDay: bad }, new Date()), bad).toBe('unscheduled');
    }
  });
});

describe('how late a firing is', () => {
  it('counts the minutes, for the record', () => {
    expect(minutesLate({ timeOfDay: '18:00' }, wat('2026-10-15T18:17:00'))).toBe(17);
  });

  it('never goes negative', () => {
    expect(minutesLate({ timeOfDay: '18:00' }, wat('2026-10-15T17:00:00'))).toBe(0);
  });

  it('says nothing about an interval broadcast', () => {
    expect(minutesLate({ intervalMins: 30 }, new Date())).toBeNull();
  });
});
