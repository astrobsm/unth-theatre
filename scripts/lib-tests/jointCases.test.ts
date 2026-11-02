import { describe, it, expect } from 'vitest';
import {
  addDays, dayLabel, jointHeadline, sortJointCases, summariseJoint, unitsLine,
  watToday, type JointCase,
} from '../../src/lib/surgery/jointCases';

// What an invited surgeon is told about a case somebody else booked with their
// name on it. The ways of getting it wrong are burying tomorrow's case under
// next week's, telling somebody they are on a case without saying what for,
// and a date label that is off by one for the half-hour either side of
// midnight in Enugu.

const c = (over: Partial<JointCase> = {}): JointCase => ({
  id: 's1',
  patientName: 'Eneh Abigail',
  folderNumber: 'F/1234',
  procedureName: 'Excision of retroperitoneal mass',
  bookingUnit: 'General Surgery',
  leadSurgeonName: 'Val Ugwu',
  scheduledDate: '2026-11-05',
  scheduledTime: '09:00',
  theatre: 'Theatre 4',
  status: 'SCHEDULED',
  surgeryType: 'ELECTIVE',
  myUnit: 'Cardiothoracic',
  myRole: 'vascular control',
  note: null,
  units: ['Cardiothoracic'],
  ...over,
});

describe('the order an invited surgeon reads them in', () => {
  it('puts the soonest case first, whatever else is true about it', () => {
    // The only action available to an invited surgeon is to clear their
    // diary, and that gets harder every hour.
    const sorted = sortJointCases([
      c({ id: 'next-week', scheduledDate: '2026-11-12' }),
      c({ id: 'tomorrow', scheduledDate: '2026-11-03' }),
      c({ id: 'friday', scheduledDate: '2026-11-06' }),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(['tomorrow', 'friday', 'next-week']);
  });

  it('orders a single day by theatre time', () => {
    const sorted = sortJointCases([
      c({ id: 'afternoon', scheduledTime: '14:00' }),
      c({ id: 'first', scheduledTime: '08:00' }),
    ]);
    expect(sorted[0].id).toBe('first');
  });

  it('does not mutate what it was given', () => {
    const list = [c({ id: 'b', scheduledDate: '2026-11-09' }), c({ id: 'a', scheduledDate: '2026-11-03' })];
    sortJointCases(list);
    expect(list[0].id).toBe('b');
  });
});

describe('the day label', () => {
  const today = '2026-11-02';

  it('names today and tomorrow rather than dating them', () => {
    expect(dayLabel('2026-11-02', today)).toBe('Today');
    expect(dayLabel('2026-11-03', today)).toBe('Tomorrow');
  });

  it('dates anything further out', () => {
    expect(dayLabel('2026-11-06', today)).toMatch(/6 Nov/);
  });

  it('steps a month end without tripping', () => {
    expect(dayLabel('2026-12-01', '2026-11-30')).toBe('Tomorrow');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('the window is read in WAT', () => {
  it('reads the calendar day in Enugu, not UTC', () => {
    // 00:30 WAT on 2 November is still 23:30 UTC on 1 November. A card that
    // used the UTC day would call tomorrow's case "today" for that half hour
    // — on the one card whose whole purpose is the day before.
    expect(watToday(new Date('2026-11-01T23:30:00Z'))).toBe('2026-11-02');
    expect(watToday(new Date('2026-11-01T22:30:00Z'))).toBe('2026-11-01');
  });
});

describe('the line at the top of the card', () => {
  const today = '2026-11-02';

  it('leads with tomorrow, because that is what changes somebody’s plans', () => {
    const line = jointHeadline(summariseJoint([
      c({ scheduledDate: '2026-11-03' }),
      c({ id: 's2', scheduledDate: '2026-11-09' }),
    ], today));
    expect(line).toMatch(/2 joint cases/);
    expect(line).toMatch(/1 tomorrow/);
  });

  it('counts today and tomorrow separately', () => {
    const s = summariseJoint([
      c({ scheduledDate: '2026-11-02' }),
      c({ id: 's2', scheduledDate: '2026-11-03' }),
      c({ id: 's3', scheduledDate: '2026-11-20' }),
    ], today);
    expect(s.today).toBe(1);
    expect(s.tomorrow).toBe(1);
    expect(s.imminent).toBe(2);
    expect(s.total).toBe(3);
  });

  it('says plainly when nothing is imminent', () => {
    const line = jointHeadline(summariseJoint([c({ scheduledDate: '2026-11-20' })], today));
    expect(line).toMatch(/none before the day after tomorrow/);
  });

  it('says nobody has asked rather than reporting zero', () => {
    expect(jointHeadline(summariseJoint([], today)))
      .toMatch(/No other unit has asked you onto a case/);
  });

  it('counts one case as a case, not cases', () => {
    const line = jointHeadline(summariseJoint([c({ scheduledDate: '2026-11-03' })], today));
    expect(line).toMatch(/1 joint case —/);
  });
});

describe('who else is on the case', () => {
  it('names the booking unit and mine when mine is the only other', () => {
    expect(unitsLine(c({ units: ['Cardiothoracic'] })))
      .toBe('General Surgery and Cardiothoracic');
  });

  it('names a third unit between them', () => {
    expect(unitsLine(c({ units: ['Cardiothoracic', 'Plastic Surgery'] })))
      .toBe('General Surgery, Plastic Surgery and Cardiothoracic');
  });

  it('never lists me twice', () => {
    const line = unitsLine(c({ units: ['Cardiothoracic', 'Urology'] }));
    expect(line.match(/Cardiothoracic/g)).toHaveLength(1);
  });

  it('reads correctly with four units on the table', () => {
    expect(unitsLine(c({ units: ['Cardiothoracic', 'Urology', 'Plastic Surgery'] })))
      .toBe('General Surgery, Urology, Plastic Surgery and Cardiothoracic');
  });
});
