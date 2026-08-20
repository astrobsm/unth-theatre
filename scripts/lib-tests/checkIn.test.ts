/**
 * Team check-in and the site geofence.
 *
 * The geofence assertions matter most. A check-in sends a position; what gets
 * KEPT is a verdict and a coarse distance, and the raw fix is discarded. If a
 * refactor ever starts returning coordinates from assessFix, these tests are
 * what should notice.
 */
import { describe, expect, it } from 'vitest';

import {
  CHECK_IN_STATUSES,
  checkInMeta,
  isCheckInStatus,
  readiness,
  requiresReason,
  requiresReplacement,
  summarise,
} from '../../src/lib/theatreOps/checkIn';
import {
  assessFix,
  corroboratesPresence,
  HOSPITAL_CENTRE,
  MAX_USABLE_ACCURACY_METRES,
  SITE_RADIUS_METRES,
} from '../../src/lib/theatreOps/geofence';

describe('the statuses the specification asks for', () => {
  it('offers all five', () => {
    expect([...CHECK_IN_STATUSES]).toEqual(['PRESENT', 'EN_ROUTE', 'DELAYED', 'UNAVAILABLE', 'REPLACED']);
  });

  it('gives each one the indicator the dashboard shows', () => {
    expect(checkInMeta('PRESENT').indicator).toBe('🟢');
    expect(checkInMeta('EN_ROUTE').indicator).toBe('🟡');
    expect(checkInMeta('DELAYED').indicator).toBe('🟠');
    expect(checkInMeta('UNAVAILABLE').indicator).toBe('🔴');
  });

  it('treats no response as its own thing, not as present', () => {
    expect(checkInMeta(null).label).toBe('No response');
    expect(checkInMeta(null).counted).toBe(false);
    expect(checkInMeta('SOMETHING_ELSE').counted).toBe(false);
  });

  it('recognises its own statuses and nothing else', () => {
    expect(isCheckInStatus('PRESENT')).toBe(true);
    expect(isCheckInStatus('present')).toBe(false);
    expect(isCheckInStatus(null)).toBe(false);
  });
});

describe('answers that need explaining', () => {
  it('asks why for delayed, unavailable and replaced', () => {
    expect(requiresReason('DELAYED')).toBe(true);
    expect(requiresReason('UNAVAILABLE')).toBe(true);
    expect(requiresReason('REPLACED')).toBe(true);
  });

  it('does not interrogate someone who is simply present', () => {
    expect(requiresReason('PRESENT')).toBe(false);
    expect(requiresReason('EN_ROUTE')).toBe(false);
  });

  it('insists a replacement names who is coming instead', () => {
    expect(requiresReplacement('REPLACED')).toBe(true);
    expect(requiresReplacement('UNAVAILABLE')).toBe(false);
  });
});

const m = (userId: string, roleOnCase: string, status: any) => ({ userId, name: userId, roleOnCase, status });

describe('reading a team at a glance', () => {
  it('counts a full team as ready', () => {
    const r = readiness([
      m('a', 'Surgeon', 'PRESENT'),
      m('b', 'Anaesthetist', 'PRESENT'),
      m('c', 'Scrub Nurse', 'EN_ROUTE'),
    ]);
    expect(r.ready).toBe(true);
    expect(r.present).toBe(2);
    expect(r.enRoute).toBe(1);
    expect(r.gaps).toEqual([]);
  });

  it('is NOT ready because nobody said otherwise', () => {
    // Silence is the commonest state and the most dangerous to treat as
    // consent. A team is not ready because nobody complained.
    const r = readiness([m('a', 'Surgeon', 'PRESENT'), m('b', 'Anaesthetist', null)]);
    expect(r.ready).toBe(false);
    expect(r.silent).toBe(1);
    expect(r.gaps).toEqual(['Anaesthetist']);
  });

  it('names the role that has nobody coming', () => {
    const r = readiness([m('a', 'Surgeon', 'PRESENT'), m('b', 'Anaesthetist', 'UNAVAILABLE')]);
    expect(r.ready).toBe(false);
    expect(r.gaps).toEqual(['Anaesthetist']);
  });

  it('counts a delayed person as still coming', () => {
    // Late is not absent. The case may still run; it needs a decision, not a
    // replacement.
    const r = readiness([m('a', 'Surgeon', 'DELAYED')]);
    expect(r.delayed).toBe(1);
    expect(r.gaps).toEqual([]);
    expect(r.ready).toBe(true);
  });

  it('treats a replaced person as a gap until the replacement checks in', () => {
    const r = readiness([m('a', 'Scrub Nurse', 'REPLACED')]);
    expect(r.gaps).toEqual(['Scrub Nurse']);
    expect(r.ready).toBe(false);
  });

  it('does not call an empty team ready', () => {
    const r = readiness([]);
    expect(r.ready).toBe(false);
    expect(summarise(r)).toBe('No team assigned');
  });
});

describe('the one-line summary a coordinator scans', () => {
  it('leads with the thing that needs doing', () => {
    expect(summarise(readiness([m('a', 'Anaesthetist', 'UNAVAILABLE'), m('b', 'Surgeon', null)])))
      .toContain('cover needed');
  });

  it('reports silence when nothing is broken yet', () => {
    expect(summarise(readiness([m('a', 'Surgeon', 'PRESENT'), m('b', 'Anaesthetist', null)])))
      .toBe('1 of 2 yet to respond');
  });

  it('says so plainly when the team is in', () => {
    expect(summarise(readiness([m('a', 'Surgeon', 'PRESENT')]))).toBe('All 1 present');
  });
});

// ---------------------------------------------------------------------------

/** A point `metres` north of the hospital centre. */
const northOf = (metres: number) => ({
  latitude: HOSPITAL_CENTRE.latitude + metres / 111_320,
  longitude: HOSPITAL_CENTRE.longitude,
});

describe('validating a check-in against the site', () => {
  it('places someone at the theatre on site', () => {
    const a = assessFix({ ...northOf(50), accuracyM: 15 });
    expect(a.verdict).toBe('ON_SITE');
    expect(corroboratesPresence(a.verdict)).toBe(true);
  });

  it('places someone across town off site', () => {
    const a = assessFix({ ...northOf(12_000), accuracyM: 20 });
    expect(a.verdict).toBe('OFF_SITE');
    expect(corroboratesPresence(a.verdict)).toBe(false);
  });

  it('covers the whole campus, not just the theatre block', () => {
    // Car park to theatre is most of a kilometre at Ituku-Ozalla. A radius
    // that reported staff demonstrably at work as off site would be worse
    // than no check at all.
    expect(SITE_RADIUS_METRES).toBeGreaterThanOrEqual(800);
    expect(assessFix({ ...northOf(SITE_RADIUS_METRES - 50), accuracyM: 20 }).verdict).toBe('ON_SITE');
  });

  it('refuses to place anyone from a vague fix', () => {
    // Indoor network positioning is routinely accurate to a kilometre. Calling
    // that "off site" would put staff on either side of the fence at random.
    const a = assessFix({ ...northOf(50), accuracyM: MAX_USABLE_ACCURACY_METRES + 1 });
    expect(a.verdict).toBe('IMPRECISE');
    expect(a.distanceM).toBe(null);
  });

  it('says nothing at all when there is no fix', () => {
    expect(assessFix(null).verdict).toBe('NO_FIX');
    expect(assessFix({}).verdict).toBe('NO_FIX');
    expect(assessFix({ latitude: null, longitude: null }).verdict).toBe('NO_FIX');
  });

  it('does not believe a fix in the Gulf of Guinea', () => {
    expect(assessFix({ latitude: 0, longitude: 0, accuracyM: 10 }).verdict).toBe('NO_FIX');
  });

  it('NEVER returns the coordinates it was given', () => {
    // The whole design: the position is checked and thrown away. If this ever
    // fails, a refactor has started storing where staff physically are.
    const a = assessFix({ ...northOf(200), accuracyM: 10 }) as Record<string, unknown>;
    expect(Object.keys(a).sort()).toEqual(['distanceM', 'label', 'verdict']);
    expect(JSON.stringify(a)).not.toContain(String(HOSPITAL_CENTRE.latitude).slice(0, 5));
  });

  it('blurs the distance it does keep', () => {
    // A distance from a known centre is a circle, not a point — and rounded to
    // 10 m it is a wide one. Enough to say "twenty minutes out", not enough to
    // say which house.
    const a = assessFix({ ...northOf(237), accuracyM: 10 });
    expect(a.distanceM! % 10).toBe(0);
  });

  it('does not treat a missing accuracy as a bad one', () => {
    // Plenty of devices report a position without an accuracy figure. That is
    // not a reason to discard it.
    expect(assessFix({ ...northOf(100) }).verdict).toBe('ON_SITE');
  });
});
