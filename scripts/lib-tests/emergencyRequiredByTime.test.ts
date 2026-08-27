import { describe, it, expect } from 'vitest';
import { checkRequiredByTime } from '../../src/lib/emergency/requiredByTime';

// The case this exists for: on 27 August 2026 a panfacial reconstruction was
// booked as an emergency and required-by 20 August. Nothing rejected it, the
// radio announced it, and no list could show it.
const NOW = new Date('2026-08-27T15:24:00.000Z'); // 16:24 WAT

describe('checkRequiredByTime', () => {
  it('rejects the day that actually got through', () => {
    const v = checkRequiredByTime('2026-08-20T09:00', NOW);
    expect(v.ok).toBe(false);
    if (!v.ok && v.reason === 'IN_PAST') {
      expect(v.day).toBe('2026-08-20');
      expect(v.today).toBe('2026-08-27');
    } else {
      throw new Error('expected IN_PAST');
    }
  });

  it('accepts today', () => {
    expect(checkRequiredByTime('2026-08-27T18:00', NOW).ok).toBe(true);
  });

  it('accepts the future', () => {
    expect(checkRequiredByTime('2026-08-28T09:00', NOW).ok).toBe(true);
  });

  // Late is not wrong. A case needed at 09:00 and entered at 16:24 is exactly
  // what booking-while-coping looks like; rejecting it would block real
  // emergencies at their most urgent.
  it('accepts a time earlier TODAY', () => {
    expect(checkRequiredByTime('2026-08-27T09:00', NOW).ok).toBe(true);
  });

  it('accepts one minute past midnight today', () => {
    expect(checkRequiredByTime('2026-08-27T00:01', NOW).ok).toBe(true);
  });

  it('rejects one minute before midnight yesterday', () => {
    const v = checkRequiredByTime('2026-08-26T23:59', NOW);
    expect(v.ok).toBe(false);
  });

  // The day boundary is WAT, not UTC. 23:30 UTC on the 26th is 00:30 WAT on
  // the 27th — today — and must be accepted. Comparing in UTC would reject a
  // night emergency, which is the worst set of cases to lose.
  it('uses the WAT day boundary, not UTC', () => {
    const now = new Date('2026-08-27T01:00:00.000Z'); // 02:00 WAT on the 27th
    expect(checkRequiredByTime('2026-08-26T23:30:00.000Z', now).ok).toBe(true);
  });

  it('accepts an absent value — the caller defaults it to now', () => {
    expect(checkRequiredByTime(undefined, NOW).ok).toBe(true);
    expect(checkRequiredByTime(null, NOW).ok).toBe(true);
    expect(checkRequiredByTime('', NOW).ok).toBe(true);
  });

  it('rejects something that is not a date at all', () => {
    const v = checkRequiredByTime('not a date', NOW);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('INVALID');
  });

  it('accepts a Date object as well as a string', () => {
    expect(checkRequiredByTime(new Date('2026-08-28T09:00:00.000Z'), NOW).ok).toBe(true);
    expect(checkRequiredByTime(new Date('2026-08-20T09:00:00.000Z'), NOW).ok).toBe(false);
  });

  it('explains what to do instead of just refusing', () => {
    const v = checkRequiredByTime('2026-08-20T09:00', NOW);
    if (v.ok) throw new Error('expected rejection');
    expect(v.message).toMatch(/2026-08-20/);
    expect(v.message).toMatch(/2026-08-27/);
  });
});
