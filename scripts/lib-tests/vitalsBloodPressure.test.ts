/**
 * Blood pressure, judged by the patient's age.
 *
 * WHAT THESE TESTS ARE PROTECTING, AND WHY THEY ARE WORTH THE LINES.
 *
 * Recovery has demanded a blood pressure on every single observation since
 * the module was written and never once looked at the answer. Theatre did
 * look, through a hard-coded `systolic < 90`, which is an adult's number and
 * fails in both directions at once: a well two-year-old runs around 90 and
 * was hypotensive from the first cuff cycle, while a fifteen-year-old at 85
 * -- shocked by any paediatric standard -- sat just below the same line the
 * toddler had been failing all afternoon, inside an alert nobody still read.
 *
 * The thresholds below are clinical, so they are pinned to their sources
 * rather than to whatever the code currently returns:
 *
 *   Hypotension    PALS: <60 term newborn, <70 infant, <70 + 2 x age (1-10y),
 *                  <90 from ten. The 1-10 line moves every birthday.
 *   Normal ranges  AHA PALS 2020, via San Francisco EMS Agency paediatric
 *                  vital signs protocol 14.1 (effective 01/10/25).
 *   Ceiling        normal-for-age + 30, the AAP's line for concern about
 *                  acute target-organ damage.
 *
 * A test that merely re-states the implementation would let the next edit
 * move a threshold and stay green. These assert the published numbers.
 */
import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  PACU_AGE_BANDS,
  PACU_LIMITS,
  abnormalVitalReasons,
  hypertensionSystolic,
  hypotensionSystolic,
  isAbnormal,
  limitsForAge,
  parseBloodPressure,
  stableForDischarge,
  systolicRangeText,
} from '../../src/lib/pacu/vitals';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const years = (n: number) => ({ age: n, ageUnit: 'YEARS' });
const months = (n: number) => ({ age: n, ageUnit: 'MONTHS' });
const days = (n: number) => ({ age: n, ageUnit: 'DAYS' });

describe('the hypotension floor (PALS)', () => {
  it('is 60 for a term newborn', () => {
    expect(hypotensionSystolic(days(2))).toBe(60);
    expect(hypotensionSystolic(days(27))).toBe(60);
  });

  it('is 70 for an infant', () => {
    expect(hypotensionSystolic(days(30))).toBe(70);
    expect(hypotensionSystolic(months(6))).toBe(70);
    expect(hypotensionSystolic(months(11))).toBe(70);
  });

  it('MOVES WITH EVERY BIRTHDAY from one to ten', () => {
    // The whole reason this is a formula and not a band. Flattening these to
    // one number per band would hand a nine-year-old a toddler's threshold.
    expect(hypotensionSystolic(years(1))).toBe(72);
    expect(hypotensionSystolic(years(2))).toBe(74);
    expect(hypotensionSystolic(years(5))).toBe(80);
    expect(hypotensionSystolic(years(6))).toBe(82);
    expect(hypotensionSystolic(years(9))).toBe(88);
  });

  it('is 90 from ten years up, and for adults', () => {
    expect(hypotensionSystolic(years(10))).toBe(90);
    expect(hypotensionSystolic(years(15))).toBe(90);
    expect(hypotensionSystolic(years(47))).toBe(90);
    expect(hypotensionSystolic(years(90))).toBe(90);
  });

  it('falls back to the adult floor when there is no age', () => {
    // Honest, and stated on screen. It must not read as a newborn's 60.
    expect(hypotensionSystolic(null)).toBe(PACU_LIMITS.systolicLow);
    expect(hypotensionSystolic({ age: null, ageUnit: null })).toBe(90);
  });
});

describe('the hypertension ceiling', () => {
  it('is normal-for-age plus 30 in a child', () => {
    expect(hypertensionSystolic(months(6))).toBe(104 + 30);
    expect(hypertensionSystolic(years(4))).toBe(112 + 30);
    expect(hypertensionSystolic(years(8))).toBe(120 + 30);
  });

  it('leaves the adult ceiling exactly where theatre has always had it', () => {
    expect(hypertensionSystolic(years(40))).toBe(180);
    expect(hypertensionSystolic(null)).toBe(180);
    expect(PACU_LIMITS.systolicHigh).toBe(180);
  });

  it('is always above the floor, in every band', () => {
    for (const band of PACU_AGE_BANDS) {
      expect(band.systolicNormalHigh).toBeGreaterThan(band.systolicNormalLow);
    }
    for (const age of [days(1), months(3), years(2), years(7), years(14), years(60)]) {
      expect(hypertensionSystolic(age)).toBeGreaterThan(hypotensionSystolic(age));
    }
  });
});

describe('what the two failures used to look like', () => {
  it('no longer calls a well two-year-old hypotensive', () => {
    // 90 systolic in a toddler is a normal pressure. The old rule raised
    // HYPOTENSION on it, every reading, all afternoon.
    expect(isAbnormal({ systolicBP: 90 }, years(2))).toBe(false);
    expect(isAbnormal({ systolicBP: 86 }, years(2))).toBe(false);
  });

  it('DOES catch the shocked toddler the old rule also caught', () => {
    expect(isAbnormal({ systolicBP: 70 }, years(2))).toBe(true);
  });

  it('catches a shocked fifteen-year-old the old rule caught too', () => {
    expect(isAbnormal({ systolicBP: 85 }, years(15))).toBe(true);
  });

  it('catches the hypertensive child the old ceiling never saw', () => {
    // 150 systolic in a four-year-old is a hypertensive emergency and sailed
    // under a ceiling of 180 without a word.
    expect(isAbnormal({ systolicBP: 150 }, years(4))).toBe(true);
    expect(isAbnormal({ systolicBP: 150 }, years(40))).toBe(false);
  });

  it('judges an adult by the numbers it always has', () => {
    expect(isAbnormal({ systolicBP: 95 }, years(40))).toBe(false);
    expect(isAbnormal({ systolicBP: 89 }, years(40))).toBe(true);
    expect(isAbnormal({ systolicBP: 181 }, years(40))).toBe(true);
  });
});

describe('the words the alert uses', () => {
  it('names the limit and the age it came from', () => {
    const [reason] = abnormalVitalReasons({ systolicBP: 60, diastolicBP: 35 }, years(4));
    expect(reason).toBe('BP 60/35 mmHg (systolic below 78 for a child of 3–5)');
  });

  it('names the limit for an adult too, since there is no older wording to keep', () => {
    const [reason] = abnormalVitalReasons({ systolicBP: 80, diastolicBP: 50 }, years(40));
    expect(reason).toBe('BP 80/50 mmHg (systolic below 90)');
  });

  it('reads a pressure with no diastolic rather than printing a stray slash', () => {
    const [reason] = abnormalVitalReasons({ systolicBP: 80 }, years(40));
    expect(reason).toBe('BP 80 mmHg (systolic below 90)');
  });

  it('prints the range for a form to show', () => {
    expect(systolicRangeText(years(4))).toBe('78–142 mmHg');
    expect(systolicRangeText(years(40))).toBe('90–180 mmHg');
  });
});

describe('reading the pressure off the record', () => {
  it('splits the string recovery actually stores', () => {
    expect(parseBloodPressure('120/80')).toEqual({ systolic: 120, diastolic: 80 });
    expect(parseBloodPressure('120 / 80')).toEqual({ systolic: 120, diastolic: 80 });
    expect(parseBloodPressure('90-60')).toEqual({ systolic: 90, diastolic: 60 });
  });

  it('keeps a lone systolic, which is better than nothing in a hurry', () => {
    expect(parseBloodPressure('95')).toEqual({ systolic: 95, diastolic: null });
  });

  it('returns nulls, never zeros, for anything it cannot read', () => {
    // A blank pressure is not a pressure of nothing. Zero would read as the
    // deepest shock there is and alert on every empty field.
    expect(parseBloodPressure('')).toEqual({ systolic: null, diastolic: null });
    expect(parseBloodPressure(null)).toEqual({ systolic: null, diastolic: null });
    expect(parseBloodPressure('not recorded')).toEqual({ systolic: null, diastolic: null });
  });

  it('judges the stored string, so recovery observations are covered', () => {
    // The route stores one column. If the rule could only read integers, the
    // recovery room would have gained nothing at all.
    expect(isAbnormal({ bloodPressure: '70/40' }, years(40))).toBe(true);
    expect(isAbnormal({ bloodPressure: '120/80' }, years(40))).toBe(false);
  });

  it('prefers the integers when a caller sends both', () => {
    expect(abnormalVitalReasons({ systolicBP: 70, bloodPressure: '120/80' }, years(40))[0])
      .toContain('BP 70');
  });
});

describe('a missing pressure', () => {
  it('is not an abnormal one', () => {
    expect(isAbnormal({ heartRate: 80 }, years(40))).toBe(false);
    expect(isAbnormal({ systolicBP: null, bloodPressure: null }, years(40))).toBe(false);
  });

  it('does not block a discharge, unlike the pulse and the saturation', () => {
    // Judged if recorded. Making it REQUIRED would strand every patient whose
    // last observation set was taken before today.
    expect(stableForDischarge({ heartRate: 80, oxygenSaturation: 98 }, years(40)).stable).toBe(true);
  });

  it('blocks a discharge when it IS recorded and it is wrong', () => {
    const shocked = { heartRate: 80, oxygenSaturation: 98, bloodPressure: '70/40' };
    const verdict = stableForDischarge(shocked, years(40));
    expect(verdict.stable).toBe(false);
    expect(verdict.reasons.join(' ')).toContain('BP 70/40');
  });

  it('clears the same patient once the pressure comes up', () => {
    const recovered = { heartRate: 80, oxygenSaturation: 98, bloodPressure: '110/70' };
    expect(stableForDischarge(recovered, years(40)).stable).toBe(true);
  });
});

describe('theatre and recovery apply the same rule', () => {
  it('hands both of them the same numbers', () => {
    const limits = limitsForAge(years(4));
    expect(limits.systolicLow).toBe(hypotensionSystolic(years(4)));
    expect(limits.systolicHigh).toBe(hypertensionSystolic(years(4)));
  });

  it('leaves no hard-coded adult pressure in the anaesthesia route', () => {
    // The literal 90 and 180 that every child on the table was judged by.
    const route = read('src/app/api/surgeries/[id]/anesthesia/vitals/route.ts');
    expect(route).not.toMatch(/systolicBP\s*<\s*90/);
    expect(route).not.toMatch(/systolicBP\s*>\s*180/);
    expect(route).toContain('limits.systolicLow');
    expect(route).toContain('limits.systolicHigh');
  });

  it('passes the pressure into the recovery alert at all', () => {
    const route = read('src/app/api/pacu/[id]/vitals/route.ts');
    expect(route).toContain('systolicBP: systolic');
    expect(route).toContain('bloodPressure,');
  });

  it('shows the anaesthetist which band is in use before they type', () => {
    const page = read('src/app/dashboard/surgeries/[id]/anesthesia/page.tsx');
    expect(page).toContain('Paediatric limits in use');
    expect(page).toContain('No age on this record');
    expect(page).toContain('systolicRangeText');
  });

  it('shows the recovery nurse the same thing', () => {
    const page = read('src/app/dashboard/pacu/[id]/page.tsx');
    expect(page).toContain('systolicRangeText');
    expect(page).toContain('Hypotensive');
  });

  it('reads the pressure column that exists, not the two that never did', () => {
    // The card and the history table read systolicBP / diastolicBP off a PACU
    // observation, which has neither, and printed "undefined/undefined mmHg".
    const page = read('src/app/dashboard/pacu/[id]/page.tsx');
    expect(page).not.toContain('{latestVitals.systolicBP}');
    expect(page).not.toContain('{vital.systolicBP}');
  });

  it('keeps one blood-pressure parser, not one per screen', () => {
    const chart = read('src/components/PACUVitalsTrendChart.tsx');
    expect(chart).toContain('parseBloodPressure');
    expect(chart).not.toContain('function parseBP');
  });
});
