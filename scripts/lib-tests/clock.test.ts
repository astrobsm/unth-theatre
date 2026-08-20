/**
 * Reading a theatre list in the timezone it was written in.
 *
 * This suite exists because of a bug that was invisible in development. The
 * routes built `new Date(scheduledDate).setHours(hh, mm)`, which reads the
 * HOST's timezone. On a laptop in Enugu that is UTC+1 and the answer is right.
 * On Vercel it is UTC and every case in the hospital was an hour out — late
 * cases judged late an hour after they were, and preoperative alerts due to
 * fire an hour after the case should have started.
 *
 * Every assertion below is therefore written in absolute UTC instants, and the
 * suite sets TZ to something hostile so a regression cannot hide behind a
 * developer machine that happens to sit at the right offset.
 */
process.env.TZ = 'America/New_York'; // deliberately not WAT, and DST-observing

import { describe, expect, it } from 'vitest';

import {
  CLINIC_UTC_OFFSET_MINUTES,
  clinicClock,
  clinicDateKey,
  isClockTime,
  queryElectiveTime,
  scheduledInstant,
} from '../../src/lib/theatreOps/clock';

describe('the clinic runs on West Africa Time', () => {
  it('is UTC+1', () => {
    expect(CLINIC_UTC_OFFSET_MINUTES).toBe(60);
  });
});

describe('recognising a time of day', () => {
  it('accepts what the booking form produces', () => {
    expect(isClockTime('09:00')).toBe(true);
    expect(isClockTime('9:05')).toBe(true);
    expect(isClockTime('23:59')).toBe(true);
    expect(isClockTime('00:00')).toBe(true);
  });

  it('rejects a time that does not exist', () => {
    expect(isClockTime('24:00')).toBe(false);
    expect(isClockTime('09:60')).toBe(false);
  });

  it('rejects rubbish rather than guessing', () => {
    expect(isClockTime('')).toBe(false);
    expect(isClockTime(null)).toBe(false);
    expect(isClockTime('morning')).toBe(false);
    expect(isClockTime('0900')).toBe(false);
  });
});

describe('turning a booking into an instant', () => {
  const day = new Date('2026-08-03T00:00:00.000Z');

  it('reads 09:00 on the list as 08:00 UTC', () => {
    // THE assertion. A case listed for nine in the morning in Enugu happens at
    // 08:00Z. If this ever reads 09:00Z the host timezone has leaked back in.
    expect(scheduledInstant(day, '09:00')?.toISOString()).toBe('2026-08-03T08:00:00.000Z');
  });

  it('gives the same answer whatever the host timezone is', () => {
    const before = process.env.TZ;
    const answers = new Set<string>();
    for (const tz of ['UTC', 'Africa/Lagos', 'Asia/Kolkata', 'Pacific/Auckland']) {
      process.env.TZ = tz;
      answers.add(scheduledInstant(day, '09:00')?.toISOString() as string);
    }
    process.env.TZ = before;
    expect(answers.size).toBe(1);
  });

  it('takes the booked day from a row stored with a time on it', () => {
    // Some bookings store midnight UTC, others an instant on the booked day.
    // Both mean the third of August.
    const withTime = new Date('2026-08-03T09:00:00.000Z');
    expect(scheduledInstant(withTime, '11:25')?.toISOString()).toBe('2026-08-03T10:25:00.000Z');
  });

  it('rolls back across midnight for an early-hours case', () => {
    // 00:30 in Enugu is 23:30 the previous day in UTC.
    expect(scheduledInstant(day, '00:30')?.toISOString()).toBe('2026-08-02T23:30:00.000Z');
  });

  it('handles the last minute of the day', () => {
    expect(scheduledInstant(day, '23:59')?.toISOString()).toBe('2026-08-03T22:59:00.000Z');
  });

  it('refuses an unreadable time instead of calling it midnight', () => {
    // Treating a malformed time as 00:00 would report every such case as
    // hours late, which is worse than leaving it out of the figures.
    expect(scheduledInstant(day, 'to be confirmed')).toBe(null);
    expect(scheduledInstant(day, null)).toBe(null);
    expect(scheduledInstant(day, '25:00')).toBe(null);
  });

  it('has nothing to say about a missing date', () => {
    expect(scheduledInstant(null, '09:00')).toBe(null);
  });
});

describe('reading an instant back in clinic time', () => {
  it('names the day a late-evening case belongs to', () => {
    // 23:30 WAT on the 3rd is 22:30Z on the 3rd — same day either way.
    expect(clinicDateKey(new Date('2026-08-03T22:30:00.000Z'))).toBe('2026-08-03');
  });

  it('keeps a case just after midnight on the right day', () => {
    // 00:30 WAT on the 4th is 23:30Z on the 3rd. In UTC terms it looks like
    // the 3rd; the ward and the list both call it the 4th.
    expect(clinicDateKey(new Date('2026-08-03T23:30:00.000Z'))).toBe('2026-08-04');
  });

  it('reads the wall clock the theatre would read', () => {
    expect(clinicClock(new Date('2026-08-03T08:00:00.000Z'))).toBe('09:00');
  });

  it('round-trips a booked time', () => {
    const i = scheduledInstant(new Date('2026-08-03T00:00:00.000Z'), '14:45') as Date;
    expect(clinicClock(i)).toBe('14:45');
    expect(clinicDateKey(i)).toBe('2026-08-03');
  });
});

describe('an elective time that looks like an AM/PM slip', () => {
  // Both of these are real bookings from the list of 17 August 2026, saved by
  // a phone whose time picker opens on AM.
  it('questions a myomectomy booked for a quarter past two in the morning', () => {
    const q = queryElectiveTime('02:15', 'ELECTIVE');
    expect(q).not.toBe(null);
    expect(q!.didYouMean).toBe('14:15');
  });

  it('questions a case booked for twenty to one in the morning', () => {
    const q = queryElectiveTime('00:40', 'ELECTIVE');
    expect(q!.didYouMean).toBe('12:40');
    // Named back in 12-hour terms, because "00:40" is precisely the notation
    // the person misread in the first place.
    expect(q!.message).toContain('12:40 in the morning');
  });

  it('says nothing about an ordinary list time', () => {
    for (const t of ['07:00', '09:00', '11:20', '14:30', '18:00']) {
      expect(queryElectiveTime(t, 'ELECTIVE'), t).toBe(null);
    }
  });

  it('never questions an emergency', () => {
    // For an emergency, 02:15 is simply Tuesday.
    expect(queryElectiveTime('02:15', 'EMERGENCY')).toBe(null);
    expect(queryElectiveTime('02:15', 'URGENT')).toBe(null);
  });

  it('queries a late evening start but offers no mirror for it', () => {
    // Adding twelve hours to 21:00 would suggest 09:00 the following morning,
    // which is a different day and not a correction anybody asked for.
    const q = queryElectiveTime('21:00', 'ELECTIVE');
    expect(q).not.toBe(null);
    expect(q!.didYouMean).toBe(null);
  });

  it('leaves an unreadable time to the validator', () => {
    // Not this function's job to reject it, and returning a query for it would
    // put a "did you mean" beside a value that cannot be saved at all.
    expect(queryElectiveTime('25:70', 'ELECTIVE')).toBe(null);
    expect(queryElectiveTime('', 'ELECTIVE')).toBe(null);
    expect(queryElectiveTime(null)).toBe(null);
  });

  it('treats an unstated surgery type as elective', () => {
    // The booking form defaults to ELECTIVE, so an absent type is the common
    // case and must still be checked.
    expect(queryElectiveTime('02:15')).not.toBe(null);
  });
});
