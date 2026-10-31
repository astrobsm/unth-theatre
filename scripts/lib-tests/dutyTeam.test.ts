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
import { memberCaseload } from '../../src/lib/dutyPerformance/caseload';
import { DUTIES, DUTY_KEYS, type DutyEvent, type DutyPerformance } from '../../src/lib/dutyPerformance/types';

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
  // A pharmacist on three nights, with the cases from those nights unpacked.
  // This is the shape of the real complaint: the old message quoted 39 cases
  // at somebody who was on duty for eleven of them.
  const EV = (over: Partial<DutyEvent> = {}): DutyEvent => ({
    id: 'e1',
    personId: null,
    personName: null,
    unit: 'General Surgery',
    label: 'Propofol — Mrs A (12345) — laparotomy',
    dueAt: new Date('2026-10-08T07:00:00Z'),
    doneAt: null,
    dutyDay: '2026-10-07',
    ...over,
  });

  const events = [
    EV(),
    EV({ id: 'e2', label: 'Atracurium — Mr B (23456) — hernia repair' }),
    EV({ id: 'e3', dutyDay: '2026-10-14', label: 'Suxamethonium — Mrs C — caesarean' }),
    EV({ id: 'e4', dutyDay: '2026-10-14', label: 'Ketamine — Mr D — debridement' }),
    // Another night's work, somebody else's.
    EV({ id: 'e5', dutyDay: '2026-10-28', personId: 'other' }),
  ];

  const rosterDays = ['2026-10-07', '2026-10-14'];
  const caseload = memberCaseload({
    duty: 'PHARMACY_PACKING', userId: 'pharm1', rosteredDays: rosterDays, events,
  });

  const base = {
    duty: 'PHARMACY_PACKING' as const,
    personName: 'Pharm A',
    periodLabel: '1–31 October 2026',
    caseload,
    rosterDays,
    daysOnDuty: rosterDays.length,
    eves: 2,
    departmentTotal: 39,
    departmentDone: 0,
    departmentOnTime: 0,
  };

  it('names the person, their nights and their own cases', () => {
    const msg = buildDutyBrief(base);
    expect(msg).toContain('Dear Pharm A');
    expect(msg).toContain('7 Oct');
    expect(msg).toContain('14 Oct');
    expect(msg).toContain('4 cases were yours');
  });

  // THE WHOLE POINT OF THE REWRITE. Staff objected that the figures were not
  // theirs, and they were not: the department's total was being quoted to
  // everybody who held the role.
  it('does not quote the department’s total at somebody with cases of their own', () => {
    const msg = buildDutyBrief(base);
    expect(msg).not.toContain('39');
  });

  it('lists the cases with nothing recorded, by day and by patient', () => {
    const msg = buildDutyBrief(base);
    expect(msg).toContain('Nothing recorded for:');
    expect(msg).toContain('Mrs A');
    expect(msg).toContain('…and 1 more.');
  });

  it('never claims a case a colleague handled on another night', () => {
    expect(buildDutyBrief(base)).not.toContain('5 cases');
  });

  it('says where the screen is and what to press, in one line', () => {
    const msg = buildDutyBrief(base);
    expect(msg).toContain(DUTIES.PHARMACY_PACKING.ask);
    expect(msg).toContain(DUTIES.PHARMACY_PACKING.whyShort);
  });

  it('offers to show them the screen rather than only reporting them', () => {
    expect(buildDutyBrief(base)).toContain('could not record it');
  });

  // Short enough to read on a phone between cases. The old one ran past
  // twenty lines and was, by its own account, mostly explanation.
  it('fits on a phone screen', () => {
    const msg = buildDutyBrief(base);
    expect(msg.split('\n').length).toBeLessThan(26);
    expect(msg.length).toBeLessThan(1000);
  });

  it('works for every duty', () => {
    DUTY_KEYS.forEach((duty) => {
      const msg = buildDutyBrief({ ...base, duty });
      expect(msg).toContain(DUTIES[duty].label.toLowerCase());
      expect(msg).toContain(DUTIES[duty].ask);
      expect(msg).toContain('Theatre Management, UNTH Ituku-Ozalla');
    });
  });

  describe('when nothing was theirs', () => {
    const none = memberCaseload({
      duty: 'PHARMACY_PACKING', userId: 'nobody', rosteredDays: [], events,
    });

    // The honest answer to the complaint. If the roster does not have them,
    // the message says the roster does not have them — which is a fact
    // somebody can go and correct, unlike a shortfall they do not recognise.
    it('says the roster shows them nowhere, and asks them to correct it', () => {
      const msg = buildDutyBrief({
        ...base, caseload: none, rosterDays: [], daysOnDuty: 0, eves: 0,
      });
      expect(msg).toContain('no night in this period');
      expect(msg).toContain('the roster does not show it');
      expect(msg).not.toContain('Nothing recorded for:');
    });

    it('does not chase somebody whose rostered nights carried no cases', () => {
      const quiet = memberCaseload({
        duty: 'PHARMACY_PACKING', userId: 'pharm2', rosteredDays: ['2026-10-21'], events,
      });
      const msg = buildDutyBrief({
        ...base, caseload: quiet, rosterDays: ['2026-10-21'], daysOnDuty: 1, eves: 1,
      });
      expect(msg).toContain('nothing is outstanding for you');
      expect(msg).not.toContain('Nothing recorded for:');
    });
  });

  describe('a duty the seniors owe and the juniors do', () => {
    const preop = { ...base, duty: 'PREOP_REVIEW' as const };

    it('asks the senior to get their residents to record it', () => {
      const msg = buildDutyBrief(preop);
      expect(msg).toContain('ask them to enter the review on the ORM');
      expect(msg).toContain('under their own login');
    });

    it('says none of that to a duty nobody delegates', () => {
      expect(buildDutyBrief(base)).not.toContain('residents');
    });
  });
});
