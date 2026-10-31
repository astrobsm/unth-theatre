import { describe, it, expect } from 'vitest';
import {
  buildDutyBrief,
  dayBefore,
  foldRoster,
  isEveDuty,
  rosterWindowFor,
  sortTeam,
  type DutyTeamMember,
} from '../../src/lib/dutyPerformance/dutyTeam';
import { DUTIES, DUTY_KEYS, type DutyPerformance } from '../../src/lib/dutyPerformance/types';

// This module decides WHO receives a message about a duty. The failure that
// prompted it was real and visible to a department head: a chase about
// pharmacy drug packing presented against the name of an anaesthetist. Every
// way of being wrong here puts a hospital's request in front of somebody who
// has no part in the work, which costs more credibility than the message buys.

const PERF = (over: Partial<DutyPerformance> = {}): DutyPerformance => ({
  personId: 'u1',
  name: 'Pharm A',
  units: [],
  total: 10,
  done: 8,
  outstanding: 2,
  late: 1,
  onTime: 7,
  completionRate: 0.8,
  punctualityRate: 0.875,
  medianMarginMinutes: 30,
  perfect: false,
  ranked: true,
  commendable: false,
  ...over,
});

const MEMBER = (over: Partial<DutyTeamMember> = {}): DutyTeamMember => ({
  userId: 'u1',
  name: 'Person',
  role: 'PHARMACIST',
  phone: '08030000000',
  days: [],
  shifts: [],
  eves: 0,
  source: 'role',
  performance: null,
  ...over,
});

describe('every duty names the people who perform it', () => {
  // The whole point. A duty with no roles declared has no legitimate
  // recipient, and the board would be back to writing to whoever is on screen.
  it('declares at least one role for every duty', () => {
    DUTY_KEYS.forEach((k) => {
      expect(DUTIES[k].roles.length, `${k} has no roles`).toBeGreaterThan(0);
    });
  });

  it('never gives a duty to a role that belongs to another department', () => {
    expect(DUTIES.PHARMACY_PACKING.roles).not.toContain('ANAESTHETIST');
    expect(DUTIES.PHARMACY_PACKING.roles).toContain('PHARMACIST');
    expect(DUTIES.CONSUMABLE_PACKING.roles).toContain('CONSUMABLE_PACK_PROVIDER');
    expect(DUTIES.CONSUMABLE_PACKING.roles).not.toContain('PHARMACIST');
    expect(DUTIES.PREOP_REVIEW.roles).toContain('ANAESTHETIST');
    expect(DUTIES.PREOP_REVIEW.roles).not.toContain('PHARMACIST');
  });

  it('tells every duty where its screen is, and how to work it', () => {
    DUTY_KEYS.forEach((k) => {
      expect(DUTIES[k].where.length, `${k} has no screen named`).toBeGreaterThan(0);
      expect(DUTIES[k].steps.length, `${k} has no steps`).toBeGreaterThan(1);
    });
  });
});

describe('the day a duty is actually discharged', () => {
  it('counts back one calendar day, across a month boundary', () => {
    expect(dayBefore('2026-11-01')).toBe('2026-10-31');
    expect(dayBefore('2026-01-01')).toBe('2025-12-31');
    expect(dayBefore('2026-03-01')).toBe('2026-02-28');
  });

  it('knows which duties happen the evening before', () => {
    expect(isEveDuty('PHARMACY_PACKING')).toBe(true);
    expect(isEveDuty('CONSUMABLE_PACKING')).toBe(true);
    expect(isEveDuty('PREOP_REVIEW')).toBe(true);
    // Acknowledging an alert and recording an operation's times happen on the
    // day. Shifting their roster window back would ask the wrong shift.
    expect(isEveDuty('EMERGENCY_ACK')).toBe(false);
    expect(isEveDuty('SURGERY_TIMING')).toBe(false);
  });

  it('widens the roster window for an eve duty so the first day has an owner', () => {
    expect(rosterWindowFor('PHARMACY_PACKING', '2026-10-01', '2026-10-31'))
      .toEqual({ from: '2026-09-30', to: '2026-10-30' });
    expect(rosterWindowFor('EMERGENCY_ACK', '2026-10-01', '2026-10-31'))
      .toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });
});

describe('folding a roster into people', () => {
  it('counts a person once however many rows they have', () => {
    const folded = foldRoster([
      { userId: 'u1', name: 'Pharm A', date: '2026-10-01', shift: 'NIGHT' },
      { userId: 'u1', name: 'Pharm A', date: '2026-10-01', shift: 'MORNING' },
      { userId: 'u1', name: 'Pharm A', date: '2026-10-02', shift: 'NIGHT' },
    ]);
    expect(folded.size).toBe(1);
    expect(folded.get('u1')!.days).toEqual(['2026-10-01', '2026-10-02']);
    expect(folded.get('u1')!.shifts).toEqual(['MORNING', 'NIGHT']);
  });

  it('drops a row with no user attached rather than inventing a recipient', () => {
    const folded = foldRoster([
      { userId: '', name: 'Somebody', date: '2026-10-01', shift: 'NIGHT' },
      { userId: 'u2', name: '   ', date: '2026-10-01', shift: 'NIGHT' },
    ]);
    expect(folded.size).toBe(0);
  });

  it('counts only the days that were an eve of work due', () => {
    const folded = foldRoster(
      [
        { userId: 'u1', name: 'A', date: '2026-10-01', shift: 'NIGHT' },
        { userId: 'u1', name: 'A', date: '2026-10-04', shift: 'NIGHT' },
      ],
      ['2026-10-01'],
    );
    expect(folded.get('u1')!.days.length).toBe(2);
    expect(folded.get('u1')!.eves).toBe(1);
  });
});

describe('the order people are written to in', () => {
  it('puts the worst record first, and people with no record after them', () => {
    const sorted = sortTeam([
      MEMBER({ userId: 'none', name: 'No record' }),
      MEMBER({ userId: 'good', name: 'Good', performance: PERF({ total: 10, done: 10, late: 0 }) }),
      MEMBER({ userId: 'bad', name: 'Bad', performance: PERF({ total: 10, done: 3, late: 1 }) }),
    ]);
    expect(sorted.map((m) => m.userId)).toEqual(['bad', 'good', 'none']);
  });

  it('prefers somebody known to have been on the roster over a bare role match', () => {
    const sorted = sortTeam([
      MEMBER({ userId: 'role', name: 'Zed', source: 'role' }),
      MEMBER({ userId: 'rota', name: 'Zoe', source: 'roster', days: ['2026-10-01'] }),
    ]);
    expect(sorted[0].userId).toBe('rota');
  });
});

describe('the appeal somebody is sent', () => {
  const base = {
    duty: 'PHARMACY_PACKING' as const,
    personName: 'Pharm A',
    periodLabel: '1–31 October 2026',
    departmentTotal: 39,
    departmentDone: 0,
    departmentOnTime: 0,
    daysOnDuty: 6,
    eves: 4,
  };

  it('names the person and the period, and asks rather than accuses', () => {
    const msg = buildDutyBrief(base);
    expect(msg).toContain('Dear Pharm A');
    expect(msg).toContain('1–31 October 2026');
    expect(msg).toContain('appeal, not an accusation');
  });

  it('ends with the steps, naming the screen', () => {
    const msg = buildDutyBrief(base);
    expect(msg).toContain(DUTIES.PHARMACY_PACKING.where);
    DUTIES.PHARMACY_PACKING.steps.forEach((s) => expect(msg).toContain(s));
  });

  // The figure that prompted all of this: 39 due, 0 recorded. Reading that as
  // "pharmacy did nothing" would be wrong and everybody receiving it knows it
  // is wrong, which is how a board loses a department.
  it('reads a department-wide zero as a recording problem, not a working one', () => {
    const msg = buildDutyBrief(base);
    expect(msg).toContain('recording problem rather than a working one');
  });

  it('quotes the person’s own record when there is one', () => {
    const msg = buildDutyBrief({ ...base, own: PERF({ total: 12, done: 9, late: 2 }) });
    expect(msg).toContain('9 of 12');
    expect(msg).toContain('Your own record');
  });

  it('does not accuse somebody with no record of having done nothing', () => {
    const msg = buildDutyBrief(base);
    expect(msg).toContain('not assuming the work was not done');
  });

  it('offers to walk them through the screen', () => {
    const msg = buildDutyBrief(base);
    expect(msg).toContain('If you cannot find the screen');
  });

  it('works for every duty', () => {
    DUTY_KEYS.forEach((duty) => {
      const msg = buildDutyBrief({ ...base, duty });
      expect(msg).toContain(DUTIES[duty].label.toLowerCase());
      expect(msg).toContain(DUTIES[duty].where);
      expect(msg).toContain('Theatre Management, UNTH Ituku-Ozalla');
    });
  });
});
