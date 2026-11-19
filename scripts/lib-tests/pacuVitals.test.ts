import { describe, it, expect } from 'vitest';
import {
  PACU_LIMITS,
  PACU_AGE_BANDS,
  abnormalVitalReasons,
  isAbnormal,
  describeAbnormal,
  stableForDischarge,
  stabilisationNoteProblem,
  STABILISATION_NOTE_MIN,
  bandForAge,
  limitsForAge,
  heartRateRangeText,
} from '../../src/lib/pacu/vitals';

/**
 * A patient whose observations went abnormal once could never leave recovery.
 *
 * redAlertTriggered is a latch: abnormal vitals set it and nothing ever cleared
 * it, so one low saturation at 09:05 blocked discharge at 14:00 with the
 * patient awake and stable. The recovery nurse had no way out of it at all.
 *
 * These rules decide whether somebody may leave recovery, so they are proved
 * rather than read.
 */
describe('what raises a red alert', () => {
  it('flags the four things the recovery room watches', () => {
    expect(isAbnormal({ heartRate: 45 })).toBe(true);
    expect(isAbnormal({ heartRate: 130 })).toBe(true);
    expect(isAbnormal({ oxygenSaturation: 88 })).toBe(true);
    expect(isAbnormal({ consciousnessLevel: 'UNRESPONSIVE' })).toBe(true);
    expect(isAbnormal({ painScore: 9 })).toBe(true);
  });

  it('leaves normal observations alone, including at the boundaries', () => {
    expect(isAbnormal({ heartRate: PACU_LIMITS.heartRateLow })).toBe(false);      // 50 is allowed
    expect(isAbnormal({ heartRate: PACU_LIMITS.heartRateHigh })).toBe(false);     // 120 is allowed
    expect(isAbnormal({ oxygenSaturation: PACU_LIMITS.oxygenSaturationLow })).toBe(false); // 92 is allowed
    expect(isAbnormal({ painScore: PACU_LIMITS.painScoreHigh })).toBe(false);     // 8 is allowed
    expect(isAbnormal({ heartRate: 78, oxygenSaturation: 98, painScore: 2, consciousnessLevel: 'ALERT' })).toBe(false);
  });

  it('does not treat a missing reading as an abnormal one', () => {
    // Recording a pulse and no saturation must not read as a desaturation.
    expect(isAbnormal({})).toBe(false);
    expect(isAbnormal({ heartRate: 80, oxygenSaturation: null })).toBe(false);
  });

  it('names every problem, so the alert says what is wrong', () => {
    const reasons = abnormalVitalReasons({ heartRate: 140, oxygenSaturation: 85, painScore: 10 });
    expect(reasons).toEqual(['HR 140 bpm', 'SpO2 85%', 'Severe pain (10/10)']);
    expect(describeAbnormal({ oxygenSaturation: 85 })).toBe('Abnormal vital signs detected: SpO2 85%');
  });
});

describe('when a patient may leave despite an earlier alert', () => {
  const wellObs = { heartRate: 78, oxygenSaturation: 98, painScore: 2, consciousnessLevel: 'ALERT' };

  it('lets a recovered patient go on their most recent normal observations', () => {
    // THE WHOLE POINT. The earlier alert does not decide this; the latest
    // observations do.
    expect(stableForDischarge(wellObs)).toEqual({ stable: true, reasons: [] });
  });

  it('still refuses a patient who is not yet stable, and says why', () => {
    const v = stableForDischarge({ heartRate: 78, oxygenSaturation: 85 });
    expect(v.stable).toBe(false);
    expect(v.reasons.join(' ')).toContain('SpO2 85%');
  });

  it('refuses when nothing has been recorded since the alert', () => {
    const v = stableForDischarge(null);
    expect(v.stable).toBe(false);
    expect(v.reasons[0]).toContain('No observations have been recorded');
  });

  it('demands the two readings that actually evidence stability', () => {
    // An empty form is not a well patient: discharging over a red alert needs
    // positive evidence, not merely the absence of a bad number.
    expect(stableForDischarge({ oxygenSaturation: 98 }).stable).toBe(false);
    expect(stableForDischarge({ oxygenSaturation: 98 }).reasons.join(' ')).toContain('No heart rate');
    expect(stableForDischarge({ heartRate: 78 }).stable).toBe(false);
    expect(stableForDischarge({ heartRate: 78 }).reasons.join(' ')).toContain('No oxygen saturation');
  });

  it('does not demand pain and consciousness, which are not always retaken', () => {
    // Requiring them would recreate the original dead end in a new place.
    expect(stableForDischarge({ heartRate: 78, oxygenSaturation: 98 }).stable).toBe(true);
  });
});


describe('a child is not a small adult', () => {
  /**
   * The heart rate limits were an adult's: 50-120. A healthy six-month-old
   * runs at 150, so every infant in recovery raised a red alert and the room
   * learned to read a paediatric alert as noise. The false alarm is the cheap
   * half of that. The expensive half is the real alert nobody looks at.
   *
   * It failed the other way too: an infant at 70 bpm is minutes from arrest
   * and raised nothing at all, because 70 is a perfectly good adult pulse.
   */

  const newborn = { age: 10, ageUnit: 'DAYS' };
  const infant = { age: 6, ageUnit: 'MONTHS' };
  const toddler = { age: 2, ageUnit: 'YEARS' };
  const preschool = { age: 4, ageUnit: 'YEARS' };
  const schoolAge = { age: 8, ageUnit: 'YEARS' };
  const adult = { age: 45, ageUnit: 'YEARS' };

  it('stops flagging the well infant who tripped the adult ceiling every time', () => {
    // 150 bpm: an emergency at 45, an ordinary afternoon at six months.
    expect(isAbnormal({ heartRate: 150 }, adult)).toBe(true);
    expect(isAbnormal({ heartRate: 150 }, infant)).toBe(false);
    expect(isAbnormal({ heartRate: 150 }, newborn)).toBe(false);
  });

  it('starts flagging the bradycardic infant the adult floor let through', () => {
    // THE DANGEROUS HALF. 70 bpm is a fine adult pulse and a peri-arrest baby.
    expect(isAbnormal({ heartRate: 70 }, adult)).toBe(false);
    expect(isAbnormal({ heartRate: 70 }, infant)).toBe(true);
    expect(isAbnormal({ heartRate: 70 }, newborn)).toBe(true);
  });

  it('puts each age in its own band', () => {
    expect(bandForAge(newborn).band.key).toBe('NEONATE');
    expect(bandForAge(infant).band.key).toBe('INFANT');
    expect(bandForAge(toddler).band.key).toBe('TODDLER');
    expect(bandForAge(preschool).band.key).toBe('PRESCHOOL');
    expect(bandForAge(schoolAge).band.key).toBe('SCHOOL_AGE');
    expect(bandForAge(adult).band.key).toBe('ADULT');
  });

  it('does not let an age given in years fall short of its own boundary', () => {
    // A year is 365.25 days on both sides of the comparison, or `3 YEARS`
    // lands at 1095.75 against a boundary of 1096 and a three-year-old is
    // judged as a toddler.
    expect(bandForAge({ age: 1, ageUnit: 'YEARS' }).band.key).toBe('TODDLER');
    expect(bandForAge({ age: 12, ageUnit: 'MONTHS' }).band.key).toBe('TODDLER');
    expect(bandForAge({ age: 11, ageUnit: 'MONTHS' }).band.key).toBe('INFANT');
    expect(bandForAge({ age: 3, ageUnit: 'YEARS' }).band.key).toBe('PRESCHOOL');
    expect(bandForAge({ age: 6, ageUnit: 'YEARS' }).band.key).toBe('SCHOOL_AGE');
    expect(bandForAge({ age: 12, ageUnit: 'YEARS' }).band.key).toBe('ADULT');
  });

  it('reads a bare 0 years as an infant, not a newborn', () => {
    // It is what gets typed for any baby under one and says nothing about
    // which. The infant band is the narrower of the two, so an age that could
    // be either is judged by the stricter.
    expect(bandForAge({ age: 0, ageUnit: 'YEARS' }).band.key).toBe('INFANT');
  });

  it('falls back to adult limits when there is no age, and says it is a fallback', () => {
    // The honest fallback -- but a screen must be able to SAY so rather than
    // quietly applying an adult's limits to a baby.
    expect(bandForAge(null).band.key).toBe('ADULT');
    expect(bandForAge(null).known).toBe(false);
    expect(bandForAge({ age: null, ageUnit: 'MONTHS' }).known).toBe(false);
    expect(bandForAge(infant).known).toBe(true);
  });

  it('judges an adult by exactly the numbers it always did', () => {
    // Nothing about an adult patient changed when children got their own band.
    const limits = limitsForAge(adult);
    expect(limits.heartRateLow).toBe(PACU_LIMITS.heartRateLow);
    expect(limits.heartRateHigh).toBe(PACU_LIMITS.heartRateHigh);
    expect(abnormalVitalReasons({ heartRate: 140 }, adult)).toEqual(['HR 140 bpm']);
    // ...and so is a caller that passes no age at all, which is every caller
    // that existed before this change.
    expect(abnormalVitalReasons({ heartRate: 140 })).toEqual(['HR 140 bpm']);
  });

  it('names the band in the alert, so it can be argued with at the bedside', () => {
    expect(abnormalVitalReasons({ heartRate: 210 }, infant)).toEqual([
      'HR 210 bpm (above 180 for an infant)',
    ]);
    expect(abnormalVitalReasons({ heartRate: 70 }, infant)).toEqual([
      'HR 70 bpm (below 90 for an infant)',
    ]);
    expect(describeAbnormal({ heartRate: 210 }, infant)).toBe(
      'Abnormal vital signs detected: HR 210 bpm (above 180 for an infant)',
    );
  });

  it('does not move the limits that do not move with age', () => {
    // A desaturation is a desaturation at any age, and a pain score is already
    // scaled 0-10 whichever tool recorded it.
    for (const who of [newborn, infant, toddler, preschool, schoolAge, adult]) {
      expect(limitsForAge(who).oxygenSaturationLow).toBe(PACU_LIMITS.oxygenSaturationLow);
      expect(limitsForAge(who).painScoreHigh).toBe(PACU_LIMITS.painScoreHigh);
      expect(isAbnormal({ oxygenSaturation: 85 }, who)).toBe(true);
      expect(isAbnormal({ oxygenSaturation: 98 }, who)).toBe(false);
      expect(isAbnormal({ consciousnessLevel: 'UNRESPONSIVE' }, who)).toBe(true);
    }
  });

  it('keeps the discharge check in step with the alert that blocked it', () => {
    // THE LATCH BUG IN A NEW HAT. If discharge used an adult ceiling the alert
    // never applied, an infant at 150 would be blocked by the alert and
    // cleared by the discharge screen -- or worse, the reverse.
    const obs = { heartRate: 150, oxygenSaturation: 98 };
    expect(isAbnormal(obs, infant)).toBe(false);
    expect(stableForDischarge(obs, infant).stable).toBe(true);

    const sick = { heartRate: 70, oxygenSaturation: 98 };
    expect(isAbnormal(sick, infant)).toBe(true);
    expect(stableForDischarge(sick, infant).stable).toBe(false);
    expect(stableForDischarge(sick, infant).reasons.join(' ')).toContain('below 90 for an infant');
  });

  it('leaves no gap and no overlap between the bands', () => {
    // A band list maintained by hand is a band list with a hole in it. Every
    // age from one day to a hundred years must land in exactly one band.
    for (let days = 0; days < 36525; days += 1) {
      const matches = PACU_AGE_BANDS.filter((b) => days < b.underDays);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0]).toBe(PACU_AGE_BANDS.find((b) => days < b.underDays));
    }
    // and the bounds themselves are sane
    for (const band of PACU_AGE_BANDS) {
      expect(band.heartRateLow).toBeLessThan(band.heartRateHigh);
    }
  });

  it('prints a range a nurse can read', () => {
    expect(heartRateRangeText(bandForAge(infant).band)).toBe('90\u2013180 bpm');
    expect(heartRateRangeText(bandForAge(adult).band)).toBe('50\u2013120 bpm');
    expect(bandForAge(infant).ageText).toBe('6 months');
    expect(bandForAge({ age: 1, ageUnit: 'DAYS' }).ageText).toBe('1 day');
  });
});
describe('the explanation the nurse must give', () => {
  it('requires one', () => {
    expect(stabilisationNoteProblem(null)).toContain('Explain how they were stabilised');
    expect(stabilisationNoteProblem('   ')).toContain('Explain how they were stabilised');
  });

  it('rejects a token entry', () => {
    expect(stabilisationNoteProblem('ok')).toContain(String(STABILISATION_NOTE_MIN));
  });

  it('accepts a real account of what was done', () => {
    expect(stabilisationNoteProblem('Oxygen 4L via mask, saturation 98% held for 30 minutes, patient awake')).toBeNull();
  });
});
