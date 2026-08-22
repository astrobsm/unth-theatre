import { describe, it, expect } from 'vitest';

import {
  assessFix,
  corroboratesPresence,
  HOSPITAL_CENTRE,
  SITE_RADIUS_METRES,
  MAX_USABLE_ACCURACY_METRES,
} from '../../src/lib/theatreOps/geofence';

// Every coordinate below was read out of anesthesia_setup_logs in production.
// They are real positions recorded by real anaesthetic technicians standing in
// the theatre complex while setting up.
//
// This file exists because "13.37 km from UNTH — far from facility" was
// reported TWICE. The first time, the hospital's reference coordinates were
// out by thirteen kilometres. The second time the reference was right and the
// distance was a stale value the browser had computed months earlier and
// written into the row. A test pinned to real captures would have caught both.
const REAL_TECHNICIAN_FIXES: ReadonlyArray<[string, number, number, number]> = [
  // label,            latitude,  longitude, accuracy m
  ['19 Aug 15:13', 6.300137, 7.459104, 20],
  ['07 Aug 08:04', 6.299959, 7.459165, 16],
  ['07 Aug 08:02', 6.299139, 7.457991, 17],
  ['06 Aug 10:02', 6.300033, 7.459061, 17],
  ['05 Aug 10:09', 6.299798, 7.459015, 120],
  ['04 Aug 09:17', 6.299939, 7.459168, 20],
];

describe('a technician standing in the theatre complex', () => {
  for (const [label, latitude, longitude, accuracyM] of REAL_TECHNICIAN_FIXES) {
    it(`${label} reads as on site`, () => {
      const fix = assessFix({ latitude, longitude, accuracyM });
      expect(fix.verdict).toBe('ON_SITE');
      expect(corroboratesPresence(fix.verdict)).toBe(true);
    });

    it(`${label} is metres from the centre, not kilometres`, () => {
      // The bug reported it as 13 370 m. Anything above the site radius here
      // means the reference point has moved again.
      const fix = assessFix({ latitude, longitude, accuracyM });
      expect(fix.distanceM).not.toBeNull();
      expect(fix.distanceM!).toBeLessThan(SITE_RADIUS_METRES);
      expect(fix.distanceM!).toBeLessThan(200);
    });
  }
});

describe('the reference point is where the hospital actually is', () => {
  it('sits within the cluster of real captures', () => {
    // 144 captures average 6.3088 / 7.4616, pulled toward the mean by a handful
    // of genuine off-site fixes. The theatre complex itself is the tight
    // cluster around 6.2999 / 7.4591.
    expect(HOSPITAL_CENTRE.latitude).toBeGreaterThan(6.29);
    expect(HOSPITAL_CENTRE.latitude).toBeLessThan(6.31);
    expect(HOSPITAL_CENTRE.longitude).toBeGreaterThan(7.45);
    expect(HOSPITAL_CENTRE.longitude).toBeLessThan(7.47);
  });

  it('is NOT the old wrong one', () => {
    // 6.4041 / 7.5199 was used for months and is thirteen kilometres out.
    expect(HOSPITAL_CENTRE.latitude).not.toBeCloseTo(6.4041, 3);
    expect(HOSPITAL_CENTRE.longitude).not.toBeCloseTo(7.5199, 3);
  });
});

describe('the site radius covers the campus', () => {
  it('a fix at the far edge of the campus is still on site', () => {
    // ~700 m north of centre: wards, car park, the gate.
    const fix = assessFix({
      latitude: HOSPITAL_CENTRE.latitude + 0.0063,
      longitude: HOSPITAL_CENTRE.longitude,
      accuracyM: 20,
    });
    expect(fix.verdict).toBe('ON_SITE');
  });

  it('a fix well beyond it is not', () => {
    // The 21 Aug capture, 1.7 km out — a real position, genuinely away.
    const fix = assessFix({ latitude: 6.303770, longitude: 7.473806, accuracyM: 30 });
    expect(fix.verdict).toBe('OFF_SITE');
  });
});

describe('a vague fix is not a location', () => {
  it('a kilometre-wide fix is IMPRECISE, not off site', () => {
    // Indoors, phone-network positioning is routinely this bad. Calling it
    // "off site" would accuse somebody standing in theatre of being absent.
    const fix = assessFix({
      latitude: HOSPITAL_CENTRE.latitude,
      longitude: HOSPITAL_CENTRE.longitude,
      accuracyM: MAX_USABLE_ACCURACY_METRES + 1,
    });
    expect(fix.verdict).toBe('IMPRECISE');
    expect(fix.distanceM).toBeNull();
  });

  it('and does not corroborate presence either way', () => {
    expect(corroboratesPresence('IMPRECISE')).toBe(false);
    expect(corroboratesPresence('NO_FIX')).toBe(false);
  });
});

describe('no fix is not a judgement about the person', () => {
  it('a missing position is NO_FIX', () => {
    expect(assessFix(null).verdict).toBe('NO_FIX');
    expect(assessFix({}).verdict).toBe('NO_FIX');
  });

  it('0,0 is the Gulf of Guinea, not a staff member at sea', () => {
    expect(assessFix({ latitude: 0, longitude: 0, accuracyM: 10 }).verdict).toBe('NO_FIX');
  });
});

describe('the stored distance is coarse on purpose', () => {
  it('rounds to 10 m, because the extra digits identify', () => {
    const fix = assessFix({ latitude: 6.300137, longitude: 7.459104, accuracyM: 20 });
    expect(fix.distanceM! % 10).toBe(0);
  });
});
