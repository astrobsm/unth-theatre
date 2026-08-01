/**
 * Staff location arithmetic.
 *
 * The behaviour this suite really protects: a bad fix must never be presented
 * as a good one. A phone indoors routinely reports accuracy of two kilometres,
 * and a confident marker drawn from that gets the wrong anaesthetist called.
 */
import { describe, expect, it } from 'vitest';

import {
  describePosition,
  distanceMetres,
  fixQuality,
  formatDistance,
  freshnessOf,
  hasPosition,
  isMappable,
  mapLink,
  nearest,
  timeAgo,
} from './staffLocation';

const NOW = new Date('2026-08-03T10:00:00Z');
// UNTH Ituku-Ozalla, near enough for a distance fixture.
const THEATRE = { latitude: 6.4213, longitude: 7.5248 };

describe('does this record carry a position at all', () => {
  it('accepts a real coordinate', () => {
    expect(hasPosition({ latitude: 6.42, longitude: 7.52 })).toBe(true);
  });

  it('rejects a missing one', () => {
    expect(hasPosition({})).toBe(false);
    expect(hasPosition({ latitude: 6.42 })).toBe(false);
    expect(hasPosition(null)).toBe(false);
  });

  it('rejects 0,0 — a failed fix, not a staff member in the Gulf of Guinea', () => {
    // Treating this as real puts a marker hundreds of kilometres out to sea.
    expect(hasPosition({ latitude: 0, longitude: 0 })).toBe(false);
  });

  it('rejects NaN', () => {
    expect(hasPosition({ latitude: Number.NaN, longitude: 7.5 })).toBe(false);
  });
});

describe('distance', () => {
  it('is zero for the same point', () => {
    expect(distanceMetres(THEATRE, THEATRE)).toBe(0);
  });

  it('measures a short campus distance sensibly', () => {
    // ~111 m per 0.001° of latitude.
    const d = distanceMetres(THEATRE, { latitude: THEATRE.latitude + 0.001, longitude: THEATRE.longitude });
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(118);
  });

  it('is symmetric', () => {
    const a = THEATRE;
    const b = { latitude: 6.43, longitude: 7.53 };
    expect(distanceMetres(a, b)).toBe(distanceMetres(b, a));
  });

  it('reads in metres up close and kilometres far off', () => {
    expect(formatDistance(240)).toBe('240 m');
    expect(formatDistance(1500)).toBe('1.5 km');
    expect(formatDistance(42_000)).toBe('42 km');
  });
});

describe('how much a position is still worth', () => {
  const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000);

  it('is live for the first couple of minutes', () => {
    expect(freshnessOf(at(0), NOW)).toBe('LIVE');
    expect(freshnessOf(at(2), NOW)).toBe('LIVE');
  });

  it('becomes recent, then stale, then out of date', () => {
    expect(freshnessOf(at(10), NOW)).toBe('RECENT');
    expect(freshnessOf(at(30), NOW)).toBe('STALE');
    expect(freshnessOf(at(180), NOW)).toBe('OLD');
  });

  it('says so plainly when nothing was ever shared', () => {
    expect(freshnessOf(null, NOW)).toBe('UNKNOWN');
  });

  it('tolerates a device clock running fast rather than reporting nonsense', () => {
    expect(freshnessOf(new Date(NOW.getTime() + 30_000), NOW)).toBe('LIVE');
  });
});

describe('time ago, as a person reads it', () => {
  const at = (m: number) => new Date(NOW.getTime() - m * 60_000);

  it('reads naturally at each scale', () => {
    expect(timeAgo(at(0), NOW)).toBe('just now');
    expect(timeAgo(at(1), NOW)).toBe('1 minute ago');
    expect(timeAgo(at(6), NOW)).toBe('6 minutes ago');
    expect(timeAgo(at(60), NOW)).toBe('1 hour ago');
    expect(timeAgo(at(180), NOW)).toBe('3 hours ago');
    expect(timeAgo(at(60 * 24), NOW)).toBe('yesterday');
  });

  it('says never when there is nothing', () => {
    expect(timeAgo(null, NOW)).toBe('never');
  });
});

describe('how much to trust the fix', () => {
  it('grades a satellite fix as precise', () => {
    expect(fixQuality(8)).toBe('PRECISE');
  });

  it('grades a typical indoor fix honestly', () => {
    expect(fixQuality(80)).toBe('APPROXIMATE');
    expect(fixQuality(600)).toBe('VAGUE');
  });

  it('calls a two-kilometre fix what it is', () => {
    // This is the common case for a phone inside a building, and the one that
    // must never be drawn as a confident marker.
    expect(fixQuality(2000)).toBe('UNUSABLE');
  });

  it('treats a missing accuracy as unusable rather than perfect', () => {
    expect(fixQuality(null)).toBe('UNUSABLE');
    expect(fixQuality(undefined)).toBe('UNUSABLE');
  });

  it('will not map an unusable fix', () => {
    expect(isMappable({ latitude: 6.42, longitude: 7.52, accuracyM: 5 })).toBe(true);
    expect(isMappable({ latitude: 6.42, longitude: 7.52, accuracyM: 3000 })).toBe(false);
    expect(isMappable({ latitude: 6.42, longitude: 7.52 })).toBe(false);
  });
});

describe('the map link', () => {
  it('is a plain URL anyone can open', () => {
    expect(mapLink({ latitude: 6.42, longitude: 7.52 })).toContain('6.42,7.52');
  });

  it('is null when there is nothing to point at', () => {
    expect(mapLink({})).toBeNull();
  });
});

describe('who is nearest', () => {
  const staff = [
    { id: 'close', latitude: 6.4215, longitude: 7.5249, accuracyM: 10, capturedAt: NOW },
    { id: 'far', latitude: 6.44, longitude: 7.55, accuracyM: 10, capturedAt: NOW },
    { id: 'middle', latitude: 6.4225, longitude: 7.5255, accuracyM: 10, capturedAt: NOW },
  ];

  it('orders by distance', () => {
    const r = nearest(THEATRE, staff, { now: NOW });
    expect(r.map((x) => x.staff.id)).toEqual(['close', 'middle', 'far']);
  });

  it('EXCLUDES anyone with no usable position rather than listing them last', () => {
    // A list that trails off into people whose whereabouts are unknown invites
    // somebody to ring the bottom of it believing they are merely far away.
    const withUnknowns = [
      ...staff,
      { id: 'no-fix', accuracyM: 10, capturedAt: NOW },
      { id: 'useless-fix', latitude: 6.42, longitude: 7.52, accuracyM: 5000, capturedAt: NOW },
    ];
    const r = nearest(THEATRE, withUnknowns, { now: NOW });
    expect(r.map((x) => x.staff.id)).toEqual(['close', 'middle', 'far']);
  });

  it('can be limited to a radius', () => {
    const r = nearest(THEATRE, staff, { now: NOW, maxMetres: 200 });
    expect(r.every((x) => x.metres <= 200)).toBe(true);
    expect(r.length).toBeLessThan(staff.length);
  });

  it('carries freshness and quality alongside, without folding them into a score', () => {
    // One number blending "close" with "recent" cannot be reasoned about at 3am.
    const stale = [{ id: 'stale', latitude: 6.4215, longitude: 7.5249, accuracyM: 200, capturedAt: new Date(NOW.getTime() - 90 * 60_000) }];
    const r = nearest(THEATRE, stale, { now: NOW });
    expect(r[0].freshness).toBe('OLD');
    expect(r[0].quality).toBe('VAGUE');
    expect(r[0].metres).toBeGreaterThanOrEqual(0);
  });

  it('returns nothing when nobody has shared a position', () => {
    expect(nearest(THEATRE, [{ id: 'a' } as never], { now: NOW })).toHaveLength(0);
  });
});

describe('describing a position in one sentence', () => {
  it('says when nothing was shared', () => {
    expect(describePosition({}, NOW)).toBe('No location shared');
  });

  it('states the accuracy rather than hiding it', () => {
    const d = describePosition({ latitude: 6.42, longitude: 7.52, accuracyM: 12, capturedAt: NOW }, NOW);
    expect(d).toContain('12 m');
    expect(d).toContain('just now');
  });

  it('is explicit that a bad fix could not be placed', () => {
    const d = describePosition({ latitude: 6.42, longitude: 7.52, accuracyM: 4000, capturedAt: NOW }, NOW);
    expect(d).toContain('too imprecise');
  });
});

// ---------------------------------------------------------------------------

import { capturesLocation, LOCATABLE_STATUSES, AVAILABILITY_STATUSES } from './staffAvailability';

describe('which statuses may carry a position at all', () => {
  it('records a position for someone who is at work and findable', () => {
    expect(capturesLocation('AVAILABLE')).toBe(true);
    expect(capturesLocation('IN_THEATRE')).toBe(true);
    expect(capturesLocation('ON_EMERGENCY_CASE')).toBe(true);
    expect(capturesLocation('BREAK')).toBe(true);
  });

  it('records NOTHING for someone who has gone home', () => {
    // Recording where somebody is after they have marked themselves off duty
    // is not a workforce board — it is tracking them in their own time.
    expect(capturesLocation('OFF_DUTY')).toBe(false);
    expect(capturesLocation('ON_LEAVE')).toBe(false);
    expect(capturesLocation('UNAVAILABLE')).toBe(false);
  });

  it('records nothing when no status has been chosen', () => {
    expect(capturesLocation(null)).toBe(false);
    expect(capturesLocation('')).toBe(false);
    expect(capturesLocation('NOT_A_STATUS')).toBe(false);
  });

  it('every locatable status is a real status', () => {
    // Guards against a typo silently disabling capture for a whole status.
    for (const s of LOCATABLE_STATUSES) {
      expect((AVAILABILITY_STATUSES as readonly string[]).includes(s)).toBe(true);
    }
  });

  it('every status is decided one way or the other', () => {
    // A new status added without a decision would default to "no location",
    // which is the safe direction — this asserts the split stays deliberate.
    const undecided = (AVAILABILITY_STATUSES as readonly string[]).filter(
      (s) => !capturesLocation(s) && !['OFF_DUTY', 'ON_LEAVE', 'UNAVAILABLE'].includes(s)
    );
    expect(undecided.join(', ')).toBe('');
  });
});
