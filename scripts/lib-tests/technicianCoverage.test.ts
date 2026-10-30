import { describe, it, expect } from 'vitest';
import {
  classifyTechnicianRow,
  specialtyKey,
  coversSpecialty,
  bucketTechnicianRoster,
  technicianForSpecialty,
  type TechRosterRow,
} from '../../src/lib/technicianCoverage';

const row = (over: Partial<TechRosterRow> = {}): TechRosterRow => ({
  userId: 'u1', shift: 'MORNING', subRole: null, ...over,
});

describe('what a technician roster row means', () => {
  it('reads NIGHT CALL as night, not day', () => {
    // "NIGHT CALL (emergency cover)" also contains "call". The other order
    // files the night technician as day cover, and a 2 a.m. emergency then
    // calls someone who is at home asleep and not expecting it.
    expect(classifyTechnicianRow(row({ subRole: 'NIGHT CALL (emergency cover)' })).duty).toBe('NIGHT_CALL');
    expect(classifyTechnicianRow(row({ subRole: 'DAY CALL (emergency cover)' })).duty).toBe('DAY_CALL');
  });

  it('reads ICU', () => {
    expect(classifyTechnicianRow(row({ subRole: 'ICU' })).duty).toBe('ICU');
  });

  it('reads anything else as the specialty covered', () => {
    const c = classifyTechnicianRow(row({ subRole: 'Neurosurgery' }));
    expect(c.duty).toBe('SPECIALTY');
    expect(c.specialty).toBe('Neurosurgery');
  });

  it('falls back to the shift when no assignment was given', () => {
    // 505 of the 506 live technician rows are exactly this — a shift and no
    // assignment. The fallback is the normal case, not an edge case.
    expect(classifyTechnicianRow(row({ shift: 'NIGHT' })).duty).toBe('NIGHT_CALL');
    expect(classifyTechnicianRow(row({ shift: 'CALL' })).duty).toBe('DAY_CALL');
    expect(classifyTechnicianRow(row({ shift: 'MORNING' })).duty).toBe('UNASSIGNED');
  });
});

describe('matching a booking to a rostered specialty', () => {
  it('matches the same specialty spelled the same way', () => {
    expect(coversSpecialty('Neurosurgery', 'Neurosurgery')).toBe(true);
    expect(coversSpecialty('Orthopaedics', 'Neurosurgery')).toBe(false);
  });

  it('matches the unit abbreviations bookings actually use', () => {
    // These are live values. Without them 28 of the 568 cases booked in the
    // last sixty days would show as having no technician while one is rostered.
    for (const [booked, rostered] of [
      ['GS Unit II', 'General Surgery'],
      ['Neuro Unit III', 'Neurosurgery'],
      ['O&G Firm 5', 'Obstetrics & Gynaecology'],
      ['Paedo Unit I', 'Paediatric Surgery'],
      ['Uro Unit I', 'Urology'],
      ['Maxillo Unit I', 'Maxillofacial Surgery'],
      ['Ortho Unit I', 'Orthopaedics'],
      ['Tuesday Unit (Ophthalmology)', 'Ophthalmology'],
    ] as const) {
      expect(coversSpecialty(rostered, booked), `${booked} should be covered by ${rostered}`).toBe(true);
    }
  });

  it('does not treat "neuro" as "uro"', () => {
    // 'uro' is short enough to be matched as a whole word only. If it were a
    // substring, every neurosurgical case would be covered by the urology
    // technician.
    expect(specialtyKey('Neuro Unit III')).toBe('Neurosurgery');
    expect(coversSpecialty('Urology', 'Neuro Unit III')).toBe(false);
  });

  it('never matches on a blank field', () => {
    // A missing specialty must read as uncovered, not as covering everything.
    expect(coversSpecialty('Neurosurgery', null)).toBe(false);
    expect(coversSpecialty(null, 'Neurosurgery')).toBe(false);
    expect(coversSpecialty('', '  ')).toBe(false);
  });
});

describe('bucketing a day of roster rows', () => {
  const rows: TechRosterRow[] = [
    { userId: 'a', shift: 'MORNING', subRole: 'Neurosurgery' },
    { userId: 'b', shift: 'MORNING', subRole: 'Neuro Unit III' }, // same specialty, spelled as a unit
    { userId: 'c', shift: 'MORNING', subRole: 'Orthopaedics' },
    { userId: 'd', shift: 'CALL', subRole: 'DAY CALL (emergency cover)' },
    { userId: 'e', shift: 'NIGHT', subRole: null }, // no assignment, night shift
    { userId: 'f', shift: 'MORNING', subRole: 'ICU' },
    { userId: 'a', shift: 'MORNING', subRole: 'Neurosurgery' }, // double-booked
  ];

  const b = bucketTechnicianRoster(rows, (r) => ({ userId: r.userId }));

  it('files the two spellings of one specialty together', () => {
    const neuro = b.bySpecialty.get(specialtyKey('Neurosurgery')!);
    expect(neuro?.technicians.map((t) => t.userId).sort()).toEqual(['a', 'b']);
  });

  it('counts a person rostered twice to one specialty once', () => {
    const neuro = b.bySpecialty.get(specialtyKey('Neurosurgery')!);
    expect(neuro?.technicians.filter((t) => t.userId === 'a')).toHaveLength(1);
  });

  it('keeps call and ICU out of the specialty buckets', () => {
    expect(b.dayCall.map((t) => t.userId)).toEqual(['d']);
    expect(b.nightCall.map((t) => t.userId)).toEqual(['e']);
    expect(b.icu.map((t) => t.userId)).toEqual(['f']);
    expect(b.bySpecialty.size).toBe(2); // Neurosurgery, Orthopaedics
  });
});

// ── The name the unit card shows ───────────────────────────────────────
//
// The card read TheatreAllocation and nothing else, so a published
// Anaesthetic Technicians Roster changed nothing and every unit said
// "Technician — Not yet assigned" however carefully the week was rostered.
// The roster was being kept and then ignored.

describe('which technician a unit card should name', () => {
  const tech = (userId: string) => ({ userId, name: userId.toUpperCase(), phone: null });
  const build = (rows: TechRosterRow[]) => bucketTechnicianRoster(rows, (r) => tech(r.userId));

  it('names the technician rostered to the list’s specialty', () => {
    const b = build([
      row({ userId: 'a', subRole: 'Neurosurgery' }),
      row({ userId: 'b', subRole: 'Orthopaedics' }),
    ]);
    const got = technicianForSpecialty(b, 'Neurosurgery');
    expect(got?.technician.userId).toBe('a');
    expect(got?.source).toBe('specialty');
  });

  it('reconciles the spellings a booking actually uses', () => {
    // The roster dropdown says "Orthopaedics"; the unit is "Ortho Unit III".
    // specialtyKey already exists to settle this, and the card must use the
    // same reconciliation as the coverage board or the two will disagree.
    const b = build([row({ userId: 'a', subRole: 'Orthopaedics' })]);
    expect(technicianForSpecialty(b, 'Orthopaedics')?.technician.userId).toBe('a');
  });

  it('falls back to day call, and says that is what it did', () => {
    // Somebody has to be rung. But cover and an assignment are different
    // facts, and a card that shows them identically sends a person to chase
    // the wrong technician at 7am.
    const b = build([
      row({ userId: 'oncall', shift: 'CALL', subRole: 'DAY CALL' }),
      row({ userId: 'other', subRole: 'Neurosurgery' }),
    ]);
    const got = technicianForSpecialty(b, 'Urology');
    expect(got?.technician.userId).toBe('oncall');
    expect(got?.source).toBe('day-call');
  });

  it('never offers the night technician for a daytime list', () => {
    // An elective card naming the night technician sends a 9am call to
    // somebody who has just gone to bed.
    const b = build([row({ userId: 'night', shift: 'NIGHT', subRole: 'NIGHT CALL' })]);
    expect(technicianForSpecialty(b, 'Urology')).toBeNull();
  });

  it('says nothing rather than guessing when nobody is rostered', () => {
    expect(technicianForSpecialty(build([]), 'Urology')).toBeNull();
  });

  it('does not match a unit whose specialty was never stated', () => {
    // A blank specialty is "not stated", never a wildcard. Treating it as one
    // would report a list as covered because a field was left empty.
    const b = build([row({ userId: 'a', subRole: 'Neurosurgery' })]);
    expect(technicianForSpecialty(b, null)).toBeNull();
    expect(technicianForSpecialty(b, '')).toBeNull();
  });
});
