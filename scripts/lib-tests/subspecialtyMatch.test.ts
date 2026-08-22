import { describe, it, expect } from 'vitest';

import {
  canonicalSubspecialty,
  surgeonMatchesSubspecialty,
  ALL_SUBSPECIALTIES,
} from '../../src/lib/subspecialtyMatch';

// Every department string below was read out of the production users table on
// 22 August 2026, with the number of approved surgeons carrying it. They are
// not invented examples — if this mapping is wrong, that many real people
// vanish from the booking screen.
const PRODUCTION_DEPARTMENTS: ReadonlyArray<[string, string | null, number]> = [
  ['Obstetrics & Gynaecology', 'Obstetrics & Gynaecology', 62],
  ['Surgery (Ophthalmic)', 'Ophthalmology', 22],
  ['Surgery (Urology)', 'Urology', 16],
  ['Surgery (General)', 'General Surgery', 14],
  ['Surgery (Maxillofacial)', 'Maxillofacial Surgery', 14],
  ['Surgery (Neuro)', 'Neurosurgery', 13],
  ['Surgery (Cardiothoracic)', 'Cardiothoracic Surgery', 12],
  ['Surgery (Orthopaedic)', 'Orthopaedics', 11],
  ['Surgery (ENT)', 'ENT (Otorhinolaryngology)', 10],
  ['Surgery (Paediatric)', 'Paediatric Surgery', 10],
  ['Surgery (Plastic / Reconstructive)', 'Plastic Surgery', 9],
  ['Other', null, 1],
];

describe('the real departments in the users table', () => {
  for (const [department, expected, count] of PRODUCTION_DEPARTMENTS) {
    it(`${department} → ${expected ?? 'unknown'} (${count} surgeons)`, () => {
      expect(canonicalSubspecialty(department)).toBe(expected);
    });
  }

  it('covers all but one of the 194 approved surgeons', () => {
    const mapped = PRODUCTION_DEPARTMENTS
      .filter(([d]) => canonicalSubspecialty(d) !== null)
      .reduce((n, [, , c]) => n + c, 0);
    expect(mapped).toBe(193);
  });
});

describe('every subspecialty in the booking dropdown is reachable', () => {
  // A subspecialty no department can ever map to would show an empty surgeon
  // list forever, and nobody would find out until somebody tried to book one.
  for (const s of ALL_SUBSPECIALTIES) {
    it(`${s} maps to itself`, () => {
      expect(canonicalSubspecialty(s)).toBe(s);
    });
  }
});

describe('ENT is not matched inside other words', () => {
  // "ent" is a substring of department, dental, general... a naive
  // includes() would file half the hospital under ENT.
  it('does not match "Department of Surgery"', () => {
    expect(canonicalSubspecialty('Department of Surgery')).not.toBe('ENT (Otorhinolaryngology)');
  });

  it('does not match Dental', () => {
    expect(canonicalSubspecialty('Dental')).not.toBe('ENT (Otorhinolaryngology)');
  });

  it('still matches a standalone ENT', () => {
    expect(canonicalSubspecialty('Surgery (ENT)')).toBe('ENT (Otorhinolaryngology)');
  });

  it('and the long form', () => {
    expect(canonicalSubspecialty('Otorhinolaryngology')).toBe('ENT (Otorhinolaryngology)');
  });
});

describe('specificity beats the generic word', () => {
  it('paediatric surgery is not general surgery', () => {
    expect(canonicalSubspecialty('Surgery (Paediatric)')).toBe('Paediatric Surgery');
  });

  it('a unit suffix does not break the match', () => {
    // Somebody will type this. It should not fall through to null.
    expect(canonicalSubspecialty('Surgery (Paediatric) Unit II')).toBe('Paediatric Surgery');
  });

  it('plastic matches on the reconstructive half too', () => {
    expect(canonicalSubspecialty('Reconstructive Surgery')).toBe('Plastic Surgery');
  });
});

describe('who is shown in the dropdown', () => {
  it('everybody, before a subspecialty is chosen', () => {
    expect(surgeonMatchesSubspecialty('Surgery (Neuro)', '')).toBe(true);
    expect(surgeonMatchesSubspecialty('Surgery (Neuro)', null)).toBe(true);
  });

  it('a matching surgeon, across the two vocabularies', () => {
    // The entire point: these two strings are not equal, and must match.
    expect(surgeonMatchesSubspecialty('Surgery (Ophthalmic)', 'Ophthalmology')).toBe(true);
  });

  it('not a surgeon from a different subspecialty', () => {
    expect(surgeonMatchesSubspecialty('Surgery (Neuro)', 'Urology')).toBe(false);
  });

  it('a surgeon with NO department recorded is still shown', () => {
    // A locum whose record was never filled in must not become unbookable.
    // A long list is a nuisance; an unselectable surgeon stops a case.
    expect(surgeonMatchesSubspecialty(null, 'Urology')).toBe(true);
    expect(surgeonMatchesSubspecialty('', 'Urology')).toBe(true);
    expect(surgeonMatchesSubspecialty('Other', 'Urology')).toBe(true);
  });

  it('an unrecognised subspecialty hides nobody who is recognised elsewhere', () => {
    // A legacy subspecialty string on an old booking falls back to equality,
    // so it shows only surgeons we cannot place — never an empty list of one.
    expect(surgeonMatchesSubspecialty('Other', 'Vascular Surgery')).toBe(true);
  });
});
