import { describe, it, expect } from 'vitest';
import {
  bookingLateness, lateBookingCutoff, formatBookedAt, formatBookedAtShort,
  LATE_CUTOFF_HOUR, WAT_OFFSET_MINUTES,
} from '../../src/lib/bookingLateness';

// Times below are written as UTC instants with the WAT (UTC+1) equivalent in a
// comment, because that offset is where this rule goes wrong if it goes wrong.

const surgeryOn = new Date('2026-08-12T00:00:00Z'); // Wed 12 Aug

describe('lateBookingCutoff', () => {
  it('is 15:00 WAT on the day before surgery', () => {
    // 15:00 WAT on 11 Aug == 14:00 UTC on 11 Aug.
    expect(lateBookingCutoff(surgeryOn).toISOString()).toBe('2026-08-11T14:00:00.000Z');
  });

  it('uses WAT, not UTC, for the cut-off hour', () => {
    // The bug this guards: comparing a UTC timestamp against a naive 15:00 would
    // treat 14:00-15:00 WAT bookings as on time when they are late — an hour of
    // late bookings quietly reported as compliant.
    const cutoff = lateBookingCutoff(surgeryOn);
    expect(cutoff.getUTCHours()).toBe(LATE_CUTOFF_HOUR - WAT_OFFSET_MINUTES / 60);
  });

  it('handles a surgery on the first of a month', () => {
    // Day-before crosses into the previous month.
    expect(lateBookingCutoff(new Date('2026-09-01T00:00:00Z')).toISOString())
      .toBe('2026-08-31T14:00:00.000Z');
  });

  it('handles a surgery on the first of January', () => {
    expect(lateBookingCutoff(new Date('2026-01-01T00:00:00Z')).toISOString())
      .toBe('2025-12-31T14:00:00.000Z');
  });

  it('handles a leap-year boundary', () => {
    expect(lateBookingCutoff(new Date('2028-03-01T00:00:00Z')).toISOString())
      .toBe('2028-02-29T14:00:00.000Z');
  });

  it('reads a scheduled date as a WAT calendar day', () => {
    // Stored as midnight UTC, which is 01:00 WAT the same day — still that day
    // to the theatre.
    expect(lateBookingCutoff(new Date('2026-08-12T00:00:00Z')).toISOString())
      .toBe(lateBookingCutoff(new Date('2026-08-12T10:30:00Z')).toISOString());
  });
});

describe('bookingLateness — elective', () => {
  const late = (bookedAt: string) =>
    bookingLateness({ scheduledDate: surgeryOn, bookedAt, surgeryType: 'ELECTIVE' });

  it('is on time when booked days ahead', () => {
    expect(late('2026-08-05T09:00:00Z').isLate).toBe(false);
  });

  it('is on time at exactly the cut-off', () => {
    // 15:00:00 WAT exactly. "After 15:00" means after, so this is not late.
    expect(late('2026-08-11T14:00:00Z').isLate).toBe(false);
  });

  it('is late one minute after the cut-off', () => {
    expect(late('2026-08-11T14:01:00Z').isLate).toBe(true);
  });

  it('is late for a 16:32 WAT booking the day before', () => {
    // 15:32 UTC == 16:32 WAT.
    const r = late('2026-08-11T15:32:00Z');
    expect(r.isLate).toBe(true);
    expect(r.hoursLate).toBeCloseTo(1.53, 1);
  });

  it('catches the WAT window that a naive comparison would miss', () => {
    // 14:30 UTC is 15:30 WAT — late. A naive check against 15:00 UTC would call
    // this on time.
    expect(late('2026-08-11T14:30:00Z').isLate).toBe(true);
  });

  it('is late when booked on the morning of surgery', () => {
    const r = late('2026-08-12T07:00:00Z');
    expect(r.isLate).toBe(true);
    expect(r.hoursLate).toBeGreaterThan(16);
  });

  it('reports days when very late', () => {
    const r = late('2026-08-13T09:00:00Z');
    expect(r.reason).toMatch(/d past the cut-off/);
  });

  it('reports hours when just late', () => {
    expect(late('2026-08-11T16:00:00Z').reason).toMatch(/h past the cut-off/);
  });

  it('gives a reason that can be checked, not just a flag', () => {
    expect(late('2026-08-11T16:00:00Z').reason).toMatch(/after 15:00 on the day before/);
  });
});

describe('bookingLateness — never flags what could not be booked earlier', () => {
  it('exempts emergency cases', () => {
    // Flagging these would train people to ignore the flag entirely.
    const r = bookingLateness({
      scheduledDate: surgeryOn, bookedAt: '2026-08-12T07:00:00Z', surgeryType: 'EMERGENCY',
    });
    expect(r.isLate).toBe(false);
    expect(r.reason).toMatch(/Emergency/);
  });

  it('exempts urgent cases', () => {
    const r = bookingLateness({
      scheduledDate: surgeryOn, bookedAt: '2026-08-12T07:00:00Z', surgeryType: 'URGENT',
    });
    expect(r.isLate).toBe(false);
    expect(r.reason).toMatch(/Urgent/);
  });

  it('is silent when the booking time was never recorded', () => {
    // An unflagged case can be checked; a wrongly flagged one damages trust in
    // every other flag.
    const r = bookingLateness({
      scheduledDate: surgeryOn, bookedAt: null, surgeryType: 'ELECTIVE',
    });
    expect(r.isLate).toBe(false);
    expect(r.reason).toMatch(/not recorded/);
  });

  it('is silent on an unparseable date', () => {
    expect(bookingLateness({
      scheduledDate: surgeryOn, bookedAt: 'not a date', surgeryType: 'ELECTIVE',
    }).isLate).toBe(false);
  });

  it('defaults a missing type to elective', () => {
    // Most cases are elective; treating unknown as exempt would hide real
    // lateness.
    expect(bookingLateness({
      scheduledDate: surgeryOn, bookedAt: '2026-08-11T16:00:00Z', surgeryType: null,
    }).isLate).toBe(true);
  });

  it('accepts a lower-case type', () => {
    expect(bookingLateness({
      scheduledDate: surgeryOn, bookedAt: '2026-08-12T07:00:00Z', surgeryType: 'emergency',
    }).isLate).toBe(false);
  });

  it('accepts Date objects as well as strings', () => {
    expect(bookingLateness({
      scheduledDate: surgeryOn, bookedAt: new Date('2026-08-11T16:00:00Z'), surgeryType: 'ELECTIVE',
    }).isLate).toBe(true);
  });
});

describe('formatBookedAt', () => {
  it('renders in WAT, not UTC', () => {
    // 15:32 UTC is 4:32 PM in Enugu. Showing 3:32 PM would have staff disputing
    // a flag that is actually correct.
    expect(formatBookedAt('2026-08-11T15:32:00Z')).toBe('11 Aug 2026, 4:32 PM');
  });

  it('renders midnight as 12 AM', () => {
    // 23:00 UTC == 00:00 WAT the next day.
    expect(formatBookedAt('2026-08-11T23:00:00Z')).toBe('12 Aug 2026, 12:00 AM');
  });

  it('renders noon as 12 PM', () => {
    expect(formatBookedAt('2026-08-11T11:00:00Z')).toBe('11 Aug 2026, 12:00 PM');
  });

  it('pads minutes', () => {
    expect(formatBookedAt('2026-08-11T15:05:00Z')).toBe('11 Aug 2026, 4:05 PM');
  });

  it('shows a dash for nothing recorded', () => {
    expect(formatBookedAt(null)).toBe('—');
    expect(formatBookedAt(undefined)).toBe('—');
    expect(formatBookedAt('rubbish')).toBe('—');
  });
});

describe('formatBookedAtShort', () => {
  it('drops the year for a narrow column', () => {
    expect(formatBookedAtShort('2026-08-11T15:32:00Z')).toBe('11 Aug, 4:32 PM');
  });

  it('still shows a dash for nothing', () => {
    expect(formatBookedAtShort(null)).toBe('—');
  });
});
