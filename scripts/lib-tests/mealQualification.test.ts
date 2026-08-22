import { describe, it, expect } from 'vitest';

import {
  creditForCheckIn,
  bestCheckInCredit,
  checkInReason,
} from '../../src/lib/mealQualification';
import { CHECK_IN_STATUSES, CHECK_IN_META } from '../../src/lib/theatreOps/checkIn';

// Lunch is for people who worked. These tests hold the line between "said they
// were coming" and "was here", because that line is the whole reason the meal
// board has three states instead of two.

describe('what each check-in is worth', () => {
  it('present counts as work', () => {
    expect(creditForCheckIn('PRESENT')).toBe('QUALIFYING');
  });

  it('on the way is expected, not verified', () => {
    // Someone who set off and never arrived must not collect a meal on the
    // strength of having set off.
    expect(creditForCheckIn('EN_ROUTE')).toBe('EXPECTED');
  });

  it('delayed is expected, not verified', () => {
    expect(creditForCheckIn('DELAYED')).toBe('EXPECTED');
  });

  it('unavailable earns nothing', () => {
    expect(creditForCheckIn('UNAVAILABLE')).toBe('NONE');
  });

  it('replaced earns nothing — somebody else did the case', () => {
    expect(creditForCheckIn('REPLACED')).toBe('NONE');
  });

  it('no check-in earns nothing, and does not throw', () => {
    expect(creditForCheckIn(null)).toBe('NONE');
    expect(creditForCheckIn(undefined)).toBe('NONE');
    expect(creditForCheckIn('SOMETHING_NEW')).toBe('NONE');
  });

  it('every real status has a defined credit', () => {
    for (const s of CHECK_IN_STATUSES) {
      expect(['QUALIFYING', 'EXPECTED', 'NONE']).toContain(creditForCheckIn(s));
    }
  });
});

describe('this is NOT the readiness "counted" flag', () => {
  // counted answers "is this person expected in theatre?" — right for a
  // readiness board, wrong for a meal, because it treats a promise to come and
  // an arrival as the same thing. If someone ever collapses the two, this
  // fails and says why.
  it('en route is counted for readiness but only expected for a meal', () => {
    expect(CHECK_IN_META.EN_ROUTE.counted).toBe(true);
    expect(creditForCheckIn('EN_ROUTE')).not.toBe('QUALIFYING');
  });

  it('delayed likewise', () => {
    expect(CHECK_IN_META.DELAYED.counted).toBe(true);
    expect(creditForCheckIn('DELAYED')).not.toBe('QUALIFYING');
  });

  it('but both agree that unavailable is out', () => {
    expect(CHECK_IN_META.UNAVAILABLE.counted).toBe(false);
    expect(creditForCheckIn('UNAVAILABLE')).toBe('NONE');
  });
});

describe('somebody on more than one case', () => {
  it('takes the best answer of the day', () => {
    // Unavailable for the morning list, present for the afternoon one. They
    // worked. Punishing the honest answer about the first case is how you
    // teach people to stop giving it.
    expect(bestCheckInCredit(['UNAVAILABLE', 'PRESENT'])).toBe('QUALIFYING');
  });

  it('expected beats nothing', () => {
    expect(bestCheckInCredit(['REPLACED', 'EN_ROUTE'])).toBe('EXPECTED');
  });

  it('nothing but refusals earns nothing', () => {
    expect(bestCheckInCredit(['UNAVAILABLE', 'REPLACED'])).toBe('NONE');
  });

  it('an empty day earns nothing', () => {
    expect(bestCheckInCredit([])).toBe('NONE');
  });
});

describe('the counter is told why', () => {
  it('explains an approval', () => {
    expect(checkInReason('PRESENT')).toContain('present');
  });

  it('tells the server to confirm arrival for a promise', () => {
    expect(checkInReason('EN_ROUTE')).toContain('confirm they arrived');
    expect(checkInReason('DELAYED')).toContain('confirm they arrived');
  });

  it('explains a refusal without accusing anybody', () => {
    expect(checkInReason('UNAVAILABLE')).toContain('unavailable');
    expect(checkInReason(null)).toContain('No check-in');
  });
});
