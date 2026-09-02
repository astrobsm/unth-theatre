import { describe, it, expect } from 'vitest';
import {
  PACU_LIMITS,
  abnormalVitalReasons,
  isAbnormal,
  describeAbnormal,
  stableForDischarge,
  stabilisationNoteProblem,
  STABILISATION_NOTE_MIN,
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
