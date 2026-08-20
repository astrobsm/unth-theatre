/**
 * Delay detection and classification.
 *
 * The behaviour this suite exists to protect is the proposal's own stated
 * philosophy: a delay that has been EXPLAINED must never escalate. If
 * documenting a problem is what gets a theatre flagged, people stop
 * documenting problems, and the module destroys the thing it was built to
 * collect.
 */
import { describe, expect, it } from 'vitest';

import {
  assessDelay,
  assessEmergency,
  categoriesInGroup,
  CATEGORY_BY_CODE,
  CATEGORY_GROUPS,
  DELAY_CATEGORIES,
  EMERGENCY_THRESHOLD_MINUTES,
  notifiedBy,
  shouldRaiseUnexplained,
  STAGE_ONE_MINUTES,
  STAGE_TWO_MINUTES,
  summariseDelays,
} from '../../src/lib/theatreOps/delays';

const SCHEDULED = new Date('2026-08-04T09:00:00Z');
const at = (minutesAfter: number) => new Date(SCHEDULED.getTime() + minutesAfter * 60_000);

describe('before anything is late', () => {
  it('says nothing while the case is still due', () => {
    const a = assessDelay({ scheduledStart: SCHEDULED, now: at(-10) });
    expect(a.stage).toBe('NONE');
    expect(a.message).toBeNull();
  });

  it('warns quietly in the last ten minutes before the reminder', () => {
    // So a theatre can act BEFORE it is formally late, rather than being told
    // once it already is.
    const a = assessDelay({ scheduledStart: SCHEDULED, now: at(22) });
    expect(a.stage).toBe('APPROACHING');
    expect(a.message).toContain('30');
  });
});

describe('stage one — the reminder at 30 minutes', () => {
  it('warns once the threshold is passed', () => {
    const a = assessDelay({ scheduledStart: SCHEDULED, now: at(STAGE_ONE_MINUTES) });
    expect(a.stage).toBe('WARNING');
    expect(a.minutesLate).toBe(30);
  });

  it('tells the theatre what to do and by when', () => {
    const a = assessDelay({ scheduledStart: SCHEDULED, now: at(35) });
    expect(a.message).toContain('Record one');
    expect(a.message).toContain(String(STAGE_TWO_MINUTES));
  });

  it('raises nothing yet', () => {
    expect(shouldRaiseUnexplained(assessDelay({ scheduledStart: SCHEDULED, now: at(35) }))).toBe(false);
  });
});

describe('stage two — 45 minutes with nothing recorded', () => {
  it('flags the case as unexplained', () => {
    const a = assessDelay({ scheduledStart: SCHEDULED, now: at(STAGE_TWO_MINUTES) });
    expect(a.stage).toBe('UNEXPLAINED');
    expect(shouldRaiseUnexplained(a)).toBe(true);
  });

  it('names Quality Assurance, not a person', () => {
    const a = assessDelay({ scheduledStart: SCHEDULED, now: at(50) });
    expect(a.message).toContain('Quality Assurance');
  });
});

describe('a documented delay never escalates — the whole point', () => {
  it('stays a warning at 45 minutes when a reason has been recorded', () => {
    const a = assessDelay({ scheduledStart: SCHEDULED, documented: true, now: at(STAGE_TWO_MINUTES) });
    expect(a.stage).toBe('WARNING');
    expect(shouldRaiseUnexplained(a)).toBe(false);
  });

  it('still never escalates hours later', () => {
    // A theatre that explained itself has done what was asked, however long
    // the blocking issue takes to clear.
    const a = assessDelay({ scheduledStart: SCHEDULED, documented: true, now: at(240) });
    expect(a.stage).toBe('WARNING');
    expect(shouldRaiseUnexplained(a)).toBe(false);
  });

  it('but the delay itself is still reported — it is not erased', () => {
    const a = assessDelay({ scheduledStart: SCHEDULED, documented: true, now: at(240) });
    expect(a.minutesLate).toBe(240);
    expect(a.message).toContain('reason has been recorded');
  });
});

describe('a case that has started', () => {
  it('is no longer late, whatever happened', () => {
    const a = assessDelay({ scheduledStart: SCHEDULED, startedAt: at(90), now: at(300) });
    expect(a.stage).toBe('NONE');
    expect(shouldRaiseUnexplained(a)).toBe(false);
  });
});

describe('a case with no committed start time', () => {
  it('cannot be late, and is reported as unknown rather than on time', () => {
    const a = assessDelay({ scheduledStart: null, now: at(300) });
    expect(a.stage).toBe('NONE');
    expect(a.minutesLate).toBeNull();
    expect(shouldRaiseUnexplained(a)).toBe(false);
  });
});

describe('emergencies — measured from booking, not a scheduled time', () => {
  const BOOKED = new Date('2026-08-04T14:00:00Z');
  const after = (m: number) => new Date(BOOKED.getTime() + m * 60_000);

  it('is quiet early on', () => {
    expect(assessEmergency({ bookedAt: BOOKED, now: after(20) }).stage).toBe('NONE');
  });

  it('warns as the hour approaches', () => {
    expect(assessEmergency({ bookedAt: BOOKED, now: after(50) }).stage).toBe('APPROACHING');
  });

  it('is critical at sixty minutes with nothing recorded', () => {
    const a = assessEmergency({ bookedAt: BOOKED, now: after(EMERGENCY_THRESHOLD_MINUTES) });
    expect(a.stage).toBe('UNEXPLAINED');
    expect(a.message).toContain('CRITICAL');
  });

  it('is suspended when a blocking issue has been recorded', () => {
    const a = assessEmergency({ bookedAt: BOOKED, documented: true, now: after(90) });
    expect(a.stage).toBe('WARNING');
    expect(shouldRaiseUnexplained(a)).toBe(false);
  });

  it('stops entirely once the case starts', () => {
    expect(assessEmergency({ bookedAt: BOOKED, startedAt: after(40), now: after(200) }).stage).toBe('NONE');
  });
});

describe('the taxonomy', () => {
  it('covers every group the proposal lists', () => {
    for (const g of ['Patient', 'Surgical team', 'Anaesthesia', 'Instruments & CSSD', 'Equipment', 'Pharmacy', 'Facility', 'Administrative', 'Other']) {
      expect(CATEGORY_GROUPS).toContain(g);
    }
  });

  it('every category routes to somebody', () => {
    // A category nobody is notified about changes nothing.
    for (const c of DELAY_CATEGORIES) {
      expect(c.notifies.length > 0).toBe(true);
    }
  });

  it('routes an instrument pack to CSSD and the theatre manager', () => {
    expect(notifiedBy('PACK_UNAVAILABLE')).toContain('CSSD_STAFF');
    expect(notifiedBy('PACK_UNAVAILABLE')).toContain('THEATRE_MANAGER');
  });

  it('routes blood to the blood bank and drugs to pharmacy', () => {
    expect(notifiedBy('BLOOD_UNAVAILABLE')).toContain('BLOODBANK_STAFF');
    expect(notifiedBy('DRUGS_UNAVAILABLE')).toContain('PHARMACIST');
  });

  it('routes a power failure to the power house and works', () => {
    expect(notifiedBy('POWER_OUTAGE')).toContain('POWER_PLANT_OPERATOR');
  });

  it('falls back to the theatre manager for an unknown code', () => {
    expect(notifiedBy('SOMETHING_NEW')).toEqual(['THEATRE_MANAGER']);
  });

  it('does not mark clinical events as avoidable', () => {
    // A difficult airway or a sudden deterioration is not somebody's fault.
    expect(CATEGORY_BY_CODE.DIFFICULT_AIRWAY.avoidable).toBe(false);
    expect(CATEGORY_BY_CODE.PATIENT_UNSTABLE.avoidable).toBe(false);
    expect(CATEGORY_BY_CODE.POWER_OUTAGE.avoidable).toBe(false);
  });

  it('does not mark "Other" avoidable', () => {
    // Something the taxonomy has no word for should not count against a
    // theatre until a person has read what actually happened.
    expect(CATEGORY_BY_CODE.OTHER.avoidable).toBe(false);
  });

  it('groups cleanly', () => {
    expect(categoriesInGroup('Pharmacy').length).toBeGreaterThan(0);
    expect(categoriesInGroup('Nonexistent')).toHaveLength(0);
  });
});

describe('the bottleneck summary', () => {
  const records = [
    { categoryCode: 'PACK_UNAVAILABLE', minutesLate: 40 },
    { categoryCode: 'PACK_UNAVAILABLE', minutesLate: 60 },
    { categoryCode: 'DIFFICULT_AIRWAY', minutesLate: 30 },
  ];

  it('ranks the commonest cause first', () => {
    const s = summariseDelays(records);
    expect(s.categories[0].code).toBe('PACK_UNAVAILABLE');
    expect(s.categories[0].count).toBe(2);
  });

  it('averages the minutes lost per category', () => {
    expect(summariseDelays(records).categories[0].averageMinutes).toBe(50);
  });

  it('separates avoidable from unavoidable without blaming anyone', () => {
    const s = summariseDelays(records);
    expect(s.totals.avoidableDelays).toBe(2);
    expect(s.totals.avoidableMinutes).toBe(100);
    expect(s.totals.minutesLost).toBe(130);
  });

  it('handles a month with no delays at all', () => {
    const s = summariseDelays([]);
    expect(s.categories).toHaveLength(0);
    expect(s.totals.minutesLost).toBe(0);
  });
});
