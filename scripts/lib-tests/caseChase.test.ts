import { describe, it, expect } from 'vitest';
import {
  caseGaps, hasConsent, hoursLate, listGaps, fixableGaps, CASE_GAPS, GAP_CODES,
} from '../../src/lib/caseChase/gaps';
import { groupBy, unattributed, type ChaseCase } from '../../src/lib/caseChase/collect';
import {
  buildSurgeonCaseChase, buildConsultantCaseChase, caseLine, chaseHeadline,
  gapsPresent, patientLabel, shortDay, worthSending, MAX_CASES_LISTED,
} from '../../src/lib/caseChase/messages';

// The ways this can be wrong, in order of how much damage they do:
//
//   telling a surgeon a consent is missing when it was uploaded yesterday —
//   the message is disproved once and every later one is ignored;
//
//   saying "not done" when what we know is "not on the ORM" — a surgeon who
//   has the signed paper in the folder is being told they are negligent;
//
//   chasing an emergency case for being booked late, which nobody could have
//   booked earlier;
//
//   and attributing a case to the wrong person, which is how two people each
//   conclude the message was meant for somebody else.

// A case booked at 14:00 the day before: inside the 15:00 cut-off.
const ON_TIME_BOOKING = {
  scheduledDate: new Date('2026-11-10T00:00:00Z'),
  bookedAt: new Date('2026-11-09T13:00:00Z'), // 14:00 WAT
  surgeryType: 'ELECTIVE',
};

const CASE = (over: Partial<ChaseCase> = {}): ChaseCase => ({
  id: 'c1',
  procedureName: 'Exploratory laparotomy',
  scheduledDay: '2026-11-10',
  scheduledTime: '08:00',
  surgeryType: 'ELECTIVE',
  status: 'SCHEDULED',
  patientName: 'Mrs Okeke',
  folderNumber: '12345',
  unit: 'General Surgery',
  surgeonId: 's1',
  surgeonName: 'Dr Eze',
  consultantId: 'k1',
  consultantName: 'Prof Nwosu',
  bookedById: 'r1',
  bookedByName: 'Dr Resident',
  gaps: ['CONSENT'],
  hoursLate: null,
  ...over,
});

describe('what is missing from a case', () => {
  it('finds nothing wrong with a complete case', () => {
    expect(caseGaps({
      ...ON_TIME_BOOKING,
      consentFileName: 'consent.pdf',
      prescriptionCount: 4,
      consumableCount: 9,
    })).toEqual([]);
  });

  // The failure that would end the usefulness of the whole feature.
  it('accepts a consent in any of the forms the theatre can actually see', () => {
    const base = { ...ON_TIME_BOOKING, prescriptionCount: 1, consumableCount: 1 };
    expect(caseGaps({ ...base, consentFileName: 'scan.jpg' })).toEqual([]);
    expect(caseGaps({ ...base, consentUploadedAt: new Date() })).toEqual([]);
    expect(caseGaps({ ...base, consentSignedElectronically: true })).toEqual([]);
    expect(caseGaps({ ...base, consentCompletedAt: new Date() })).toEqual([]);
    expect(caseGaps(base)).toEqual(['CONSENT']);
  });

  it('names an empty pharmacy list and an empty pack list separately', () => {
    const base = { ...ON_TIME_BOOKING, consentFileName: 'c.pdf' };
    expect(caseGaps({ ...base, prescriptionCount: 0, consumableCount: 3 }))
      .toEqual(['PRESCRIPTION']);
    expect(caseGaps({ ...base, prescriptionCount: 3, consumableCount: 0 }))
      .toEqual(['CONSUMABLES']);
    expect(caseGaps({ ...base, prescriptionCount: 0, consumableCount: 0 }))
      .toEqual(['PRESCRIPTION', 'CONSUMABLES']);
  });

  it('flags an elective case booked after the cut-off', () => {
    const late = {
      scheduledDate: new Date('2026-11-10T00:00:00Z'),
      bookedAt: new Date('2026-11-09T19:00:00Z'), // 20:00 WAT, five hours late
      surgeryType: 'ELECTIVE',
      consentFileName: 'c.pdf',
      prescriptionCount: 1,
      consumableCount: 1,
    };
    expect(caseGaps(late)).toEqual(['LATE_BOOKING']);
    expect(Math.round(hoursLate(late) ?? 0)).toBe(5);
  });

  // An emergency booked at 2am could not have been booked at 3pm the day
  // before. A flag that fires on those is a flag nobody reads on the cases
  // that matter.
  it('never calls an emergency late', () => {
    const emergency = {
      scheduledDate: new Date('2026-11-10T00:00:00Z'),
      bookedAt: new Date('2026-11-10T01:00:00Z'),
      surgeryType: 'EMERGENCY',
      consentFileName: 'c.pdf',
      prescriptionCount: 1,
      consumableCount: 1,
    };
    expect(caseGaps(emergency)).toEqual([]);
    expect(hoursLate(emergency)).toBeNull();
  });

  it('orders the gaps the way somebody would work through them', () => {
    const everything = {
      scheduledDate: new Date('2026-11-10T00:00:00Z'),
      bookedAt: new Date('2026-11-09T20:00:00Z'),
      surgeryType: 'ELECTIVE',
      prescriptionCount: 0,
      consumableCount: 0,
    };
    expect(caseGaps(everything))
      .toEqual(['LATE_BOOKING', 'CONSENT', 'PRESCRIPTION', 'CONSUMABLES']);
  });

  it('separates what can still be closed from what cannot', () => {
    expect(fixableGaps(['LATE_BOOKING', 'CONSENT'])).toEqual(['CONSENT']);
    expect(fixableGaps(['LATE_BOOKING'])).toEqual([]);
  });

  it('has something to say about every gap it can report', () => {
    GAP_CODES.forEach((code) => {
      expect(CASE_GAPS[code].label.length).toBeGreaterThan(3);
      expect(CASE_GAPS[code].consequence.length).toBeGreaterThan(80);
      expect(CASE_GAPS[code].fix.length).toBeGreaterThan(30);
    });
  });

  it('says plainly when there is no consent to be seen', () => {
    expect(hasConsent({ ...ON_TIME_BOOKING })).toBe(false);
    expect(listGaps(['CONSENT', 'PRESCRIPTION']))
      .toBe('no consent on the ORM and no pharmacy prescription');
  });
});

describe('whose cases they are', () => {
  it('groups by the surgeon and by the consultant from one pass', () => {
    const cases = [
      CASE({ id: 'a' }),
      CASE({ id: 'b', surgeonId: 's2', surgeonName: 'Dr Obi' }),
      CASE({ id: 'c', gaps: ['PRESCRIPTION', 'CONSUMABLES'] }),
    ];
    const bySurgeon = groupBy(cases, (c) => ({ id: c.surgeonId, name: c.surgeonName }));
    expect(bySurgeon.map((g) => g.personId)).toEqual(['s1', 's2']);
    expect(bySurgeon[0].cases.length).toBe(2);
    expect(bySurgeon[0].counts.CONSENT).toBe(1);
    expect(bySurgeon[0].counts.PRESCRIPTION).toBe(1);

    const byConsultant = groupBy(cases, (c) => ({ id: c.consultantId, name: c.consultantName }));
    expect(byConsultant.length).toBe(1);
    expect(byConsultant[0].cases.length).toBe(3);
  });

  // A case filed under "Unrecorded" is a tally nobody can act on, and it
  // quietly makes the board look complete when it is not.
  it('never files a case under a placeholder name', () => {
    const cases = [CASE({ surgeonId: null, surgeonName: null })];
    expect(groupBy(cases, (c) => ({ id: c.surgeonId, name: c.surgeonName }))).toEqual([]);
    expect(unattributed(cases).noSurgeon.length).toBe(1);
  });

  // A list headed by somebody whose only mark is three late bookings nobody
  // can now un-book puts the unactionable at the top.
  it('ranks by what can still be fixed, not by the raw count', () => {
    const fixable = CASE({ id: 'f', surgeonId: 'fix', surgeonName: 'Dr Fix', gaps: ['CONSENT'] });
    const historic = [1, 2, 3].map((n) => CASE({
      id: `h${n}`, surgeonId: 'hist', surgeonName: 'Dr Hist', gaps: ['LATE_BOOKING'],
    }));
    const groups = groupBy(historic.concat([fixable]), (c) => ({
      id: c.surgeonId, name: c.surgeonName,
    }));
    expect(groups[0].personId).toBe('fix');
    expect(groups[1].lateCount).toBe(3);
    expect(groups[1].fixable).toBe(0);
  });

  it('records which units a person’s cases came from', () => {
    const groups = groupBy(
      [CASE(), CASE({ id: 'z', unit: 'Paediatric Surgery' })],
      (c) => ({ id: c.surgeonId, name: c.surgeonName }),
    );
    expect(groups[0].units).toEqual(['General Surgery', 'Paediatric Surgery']);
  });
});

describe('the letter to the surgeon', () => {
  const group = groupBy(
    [
      CASE({ id: 'a', gaps: ['CONSENT'] }),
      CASE({ id: 'b', gaps: ['PRESCRIPTION', 'CONSUMABLES'], patientName: 'Mr Ani', folderNumber: '777' }),
    ],
    (c) => ({ id: c.surgeonId, name: c.surgeonName }),
  )[0];

  const msg = buildSurgeonCaseChase({
    personName: 'Dr Eze',
    roleLabel: 'Surgeon',
    periodLabel: '10–16 November 2026',
    group,
  });

  it('names the patients, so the surgeon can go and look them up', () => {
    expect(msg).toContain('Mrs Okeke (12345)');
    expect(msg).toContain('Mr Ani (777)');
    expect(msg).toContain('Dear Dr Eze,');
    expect(msg).toContain('As a surgeon');
  });

  it('counts each kind of gap separately', () => {
    expect(msg).toContain('1 with no consent on the ORM');
    expect(msg).toContain('1 with no pharmacy prescription');
    expect(msg).toContain('1 with no consumable pack request');
  });

  // The whole point of the request, in the user's words: a plea to speak to
  // their residents.
  it('asks them to speak to their residents', () => {
    expect(msg).toMatch(/residents/i);
    expect(msg).toMatch(/house officers/i);
    expect(msg).toContain('is the consent and the pharmacy list on the ORM?');
  });

  it('asks a consultant the consultant’s version of that question', () => {
    const asConsultant = buildSurgeonCaseChase({
      personName: 'Prof Nwosu',
      roleLabel: 'Consultant Surgeon',
      periodLabel: '10–16 November 2026',
      group,
      isConsultant: true,
    });
    expect(asConsultant).toContain('working with you');
    expect(asConsultant).toMatch(/word from you on the round/i);
  });

  // We know what the ORM holds. We do not know what is in the folder.
  it('never claims the work was not done', () => {
    expect(msg).not.toMatch(/not done|failed to|negligen|you did not/i);
    expect(msg).toContain('no consent on the ORM');
    expect(msg).toMatch(/what we can see is the ORM, not the folder/i);
  });

  it('reads as a request between colleagues', () => {
    expect(msg).toMatch(/not a reprimand/i);
    expect(msg).toMatch(/Thank you/i);
    expect(msg).toContain('Theatre Management, UNTH Ituku-Ozalla');
  });

  it('only explains the gaps this person actually has', () => {
    const consentOnly = groupBy([CASE({ gaps: ['CONSENT'] })], (c) => ({
      id: c.surgeonId, name: c.surgeonName,
    }))[0];
    const m = buildSurgeonCaseChase({
      personName: 'Dr Eze', roleLabel: 'Surgeon', periodLabel: 'today', group: consentOnly,
    });
    expect(m).not.toContain('No consumable pack request.');
    expect(m).not.toContain('No pharmacy prescription.');
  });

  it('stops listing cases before it becomes a wall of text', () => {
    const many = Array.from({ length: 20 }, (_, i) => CASE({ id: `m${i}` }));
    const g = groupBy(many, (c) => ({ id: c.surgeonId, name: c.surgeonName }))[0];
    const m = buildSurgeonCaseChase({
      personName: 'Dr Eze', roleLabel: 'Surgeon', periodLabel: 'this week', group: g,
    });
    expect(m).toContain(`…and ${20 - MAX_CASES_LISTED} more`);
    expect(m.length).toBeLessThan(4000);
  });
});

describe('the letter to the unit consultant', () => {
  const cases = [
    CASE({ id: 'a', gaps: ['CONSENT'], bookedByName: 'Dr Resident' }),
    CASE({ id: 'b', gaps: ['CONSENT'], bookedByName: 'Dr Resident' }),
    CASE({ id: 'c', gaps: ['PRESCRIPTION'], bookedByName: 'Dr Other' }),
  ];
  const group = groupBy(cases, (c) => ({ id: c.consultantId, name: c.consultantName }))[0];

  const msg = buildConsultantCaseChase({
    personName: 'Prof Nwosu',
    unitLabel: 'General Surgery',
    periodLabel: '10–16 November 2026',
    group,
    byBooker: [
      { name: 'Dr Resident', cases: [cases[0], cases[1]] },
      { name: 'Dr Other', cases: [cases[2]] },
    ],
  });

  it('asks for the one thing only a consultant can do', () => {
    expect(msg).toMatch(/word with the residents/i);
    expect(msg).toMatch(/expect it of them/i);
    // Not asked to do the clerical work themselves.
    expect(msg).toMatch(/we are not asking you to do it/i);
  });

  it('shows who entered the bookings, named and counted', () => {
    expect(msg).toContain('Dr Resident — 2 cases');
    expect(msg).toContain('Dr Other — 1 case');
  });

  it('names the unit in the heading', () => {
    expect(msg).toContain('General Surgery: cases awaiting paperwork');
  });

  it('is explicit that nothing has been escalated', () => {
    expect(msg).toMatch(/Nothing here is a disciplinary matter/i);
    expect(msg).toMatch(/nothing has been copied/i);
  });

  it('tells them the three things to ask for', () => {
    expect(msg).toMatch(/consent is on/i);
    expect(msg).toMatch(/pharmacy prescription is entered/i);
    expect(msg).toMatch(/consumable pack request is entered/i);
  });
});

describe('the short forms', () => {
  it('summarises a person’s standing in one line', () => {
    const g = groupBy(
      [CASE({ gaps: ['CONSENT'] }), CASE({ id: 'b', gaps: ['LATE_BOOKING', 'PRESCRIPTION'] })],
      (c) => ({ id: c.surgeonId, name: c.surgeonName }),
    )[0];
    expect(chaseHeadline(g))
      .toBe('2 cases: 1 without consent, 1 without a pharmacy list, 1 booked late');
    expect(worthSending(g)).toBe(true);
  });

  it('writes a case line the way a list is read aloud', () => {
    expect(caseLine(CASE())).toBe(
      '• 10 Nov 08:00 — Mrs Okeke (12345) — Exploratory laparotomy — no consent on the ORM',
    );
    expect(shortDay('2026-01-31')).toBe('31 Jan');
    expect(patientLabel(CASE({ patientName: null }))).toBe('a patient');
  });

  it('lists which gaps appear in a set, in the canonical order', () => {
    expect(gapsPresent([CASE({ gaps: ['CONSUMABLES'] }), CASE({ gaps: ['LATE_BOOKING'] })]))
      .toEqual(['LATE_BOOKING', 'CONSUMABLES']);
  });
});
