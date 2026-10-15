/**
 * Pooling a week's cancellations, and keeping the room small enough to work.
 *
 * Two things here go wrong quietly.
 *
 * THE WEEK BOUNDARY. A case cancelled at 00:30 on Monday is a Monday
 * cancellation in Enugu and a Sunday one in UTC. Read the wrong way it falls
 * into the week that has already been audited and is never discussed by
 * anybody. Sunday is the other trap: it ends a week, it does not begin one.
 *
 * THE SIZE OF THE ROOM. The temptation is to summon everybody who might be
 * relevant. A sitting of thirty people where twenty-six have nothing to
 * answer for stops being attended, and then the four who did are not there
 * either. So the tests below are as much about who is NOT called.
 */
import { describe, expect, it } from 'vitest';

import {
  auditWeekOf,
  previousAuditWeek,
  describeWeek,
  serviceRoleFor,
  targetsForCase,
  groupByPerson,
} from '../../src/lib/audit/cancellationPool';

/** A WAT wall-clock moment as the UTC instant it really is. */
const wat = (iso: string) => new Date(`${iso}+01:00`);

describe('which week a cancellation falls in', () => {
  it('runs Monday to Sunday', () => {
    // Thursday 15 October 2026.
    const w = auditWeekOf(wat('2026-10-15T10:00:00'));
    expect(w.start).toBe('2026-10-12');
    expect(w.end).toBe('2026-10-18');
  });

  it('puts Monday at the start of its own week, not the end of the last', () => {
    const w = auditWeekOf(wat('2026-10-12T08:00:00'));
    expect(w.start).toBe('2026-10-12');
  });

  it('puts Sunday at the END of the week that began six days earlier', () => {
    // The off-by-one that would file every Sunday cancellation into a week
    // that has not happened yet.
    const w = auditWeekOf(wat('2026-10-18T22:00:00'));
    expect(w.start).toBe('2026-10-12');
    expect(w.end).toBe('2026-10-18');
  });

  it('reads the week in WAT, not UTC', () => {
    // 00:30 Monday in Enugu is 23:30 Sunday in UTC. Read as UTC this lands in
    // the previous week — one that has already been audited, so the case is
    // never discussed by anybody.
    const w = auditWeekOf(new Date('2026-10-11T23:30:00.000Z'));
    expect(w.start).toBe('2026-10-12');
  });

  it('gives a half-open range that tiles without gap or overlap', () => {
    const a = auditWeekOf(wat('2026-10-15T10:00:00'));
    const b = auditWeekOf(wat('2026-10-22T10:00:00'));
    expect(a.to.getTime()).toBe(b.from.getTime());
    expect(a.to.getTime() - a.from.getTime()).toBe(7 * 24 * 3_600_000);
  });

  it('starts the range at midnight WAT, which is 23:00 UTC the day before', () => {
    const w = auditWeekOf(wat('2026-10-15T10:00:00'));
    expect(w.from.toISOString()).toBe('2026-10-11T23:00:00.000Z');
  });

  it('steps back a whole week for the sitting that reviews the last one', () => {
    const p = previousAuditWeek(wat('2026-10-15T10:00:00'));
    expect(p.start).toBe('2026-10-05');
    expect(p.end).toBe('2026-10-11');
  });

  it('crosses a year end', () => {
    const w = auditWeekOf(wat('2027-01-01T10:00:00')); // a Friday
    expect(w.start).toBe('2026-12-28');
    expect(w.end).toBe('2027-01-03');
  });
});

describe('how a week reads on the notice', () => {
  it('names the month once when it does not change', () => {
    expect(describeWeek('2026-10-12', '2026-10-18')).toBe('12–18 October 2026');
  });

  it('names both months across a boundary', () => {
    expect(describeWeek('2026-09-28', '2026-10-04'))
      .toBe('28 September – 4 October 2026');
  });

  it('names both years across a new year', () => {
    expect(describeWeek('2026-12-28', '2027-01-03'))
      .toBe('28 December 2026 – 3 January 2027');
  });
});

describe('which service the category calls in', () => {
  it('calls the engineer for equipment', () => {
    expect(serviceRoleFor('EQUIPMENT_FAILURE')).toBe('BIOMEDICAL_ENGINEER');
  });

  it('calls the theatre manager for administrative and displaced cases', () => {
    expect(serviceRoleFor('ADMINISTRATIVE')).toBe('THEATRE_MANAGER');
    expect(serviceRoleFor('EMERGENCY_PRIORITY')).toBe('THEATRE_MANAGER');
  });

  it('calls nobody extra when the category is about the patient or the team', () => {
    // Nobody runs a service called "the patient was unwell". Summoning a
    // department for it is summoning them for nothing, and that is how a
    // meeting loses the people who should be there.
    for (const c of ['PATIENT_CONDITION', 'PATIENT_REQUEST', 'STAFF_UNAVAILABILITY', 'OTHER']) {
      expect(serviceRoleFor(c), c).toBeNull();
    }
  });

  it('calls nobody for a category it has never heard of', () => {
    expect(serviceRoleFor('SOMETHING_NEW')).toBeNull();
  });
});

describe('who is called for one case', () => {
  const full = {
    surgeryId: 's1',
    category: 'EQUIPMENT_FAILURE',
    surgeonId: 'u-surgeon',
    anaesthetistId: 'u-anaes',
    bookedById: 'u-clerk',
    cancelledById: 'u-manager',
  };

  it('calls the four people who had the case', () => {
    const t = targetsForCase(full);
    expect(t.map((x) => x.userId)).toEqual(['u-surgeon', 'u-anaes', 'u-clerk', 'u-manager']);
    expect(t.map((x) => x.roleOnCase)).toEqual([
      'Surgeon', 'Anaesthetist', 'Booked the case', 'Recorded the cancellation',
    ]);
  });

  it('calls one person once when they played several parts', () => {
    // A surgeon who booked their own case and then cancelled it. Three
    // summonses to one person for one case is the sort of thing that gets
    // the whole scheme laughed at.
    const t = targetsForCase({
      ...full, bookedById: 'u-surgeon', cancelledById: 'u-surgeon',
    });
    expect(t.map((x) => x.userId)).toEqual(['u-surgeon', 'u-anaes']);
    // Described by the first part they played, which is the senior one.
    expect(t[0].roleOnCase).toBe('Surgeon');
  });

  it('skips the slots nobody filled', () => {
    const t = targetsForCase({
      surgeryId: 's2', category: 'OTHER',
      surgeonId: 'u-surgeon', anaesthetistId: null,
      bookedById: undefined, cancelledById: 'u-manager',
    });
    expect(t.map((x) => x.userId)).toEqual(['u-surgeon', 'u-manager']);
  });

  it('calls nobody when the case names nobody', () => {
    expect(targetsForCase({ surgeryId: 's3', category: 'OTHER' })).toEqual([]);
  });

  it('never returns the same person twice', () => {
    const ids = targetsForCase(full).map((x) => x.userId);
    expect(ids.length).toBe(new Set(ids).size);
  });
});

describe('one person, one notice', () => {
  it('gathers a week of matters per person', () => {
    const grouped = groupByPerson([
      { userId: 'a', surgeryId: 's1' },
      { userId: 'b', surgeryId: 's1' },
      { userId: 'a', surgeryId: 's2' },
      { userId: 'a', surgeryId: 's3' },
    ]);
    expect(grouped.get('a')).toHaveLength(3);
    expect(grouped.get('b')).toHaveLength(1);
    expect(grouped.size).toBe(2);
  });

  it('keeps the order the matters were pooled in', () => {
    const grouped = groupByPerson([
      { userId: 'a', surgeryId: 's1' },
      { userId: 'a', surgeryId: 's2' },
    ]);
    expect(grouped.get('a')!.map((x) => x.surgeryId)).toEqual(['s1', 's2']);
  });

  it('handles an empty week', () => {
    expect(groupByPerson([]).size).toBe(0);
  });
});
