import { describe, it, expect } from 'vitest';
import { unitKey, sameUnit, findByUnit } from '../../src/lib/unitMatch';

/**
 * The pairs that mattered: left is the name the theatre allocation form sends,
 * right is the name the registry holds and a booked case therefore carries.
 * Every one of these was a strict-equality miss, and every miss showed as
 * "Nursing — not yet assigned" on a unit that had a scrub nurse allocated.
 */
const FORM_TO_REGISTRY: Array<[string, string]> = [
  ['O/G FIRM 2', 'O&G Firm 2'],
  ['O/G FIRM 5', 'O&G Firm 5'],
  ['GENERAL SURGERY UNIT 1', 'GS Unit I'],
  ['GENERAL SURGERY UNIT 4', 'GS Unit IV'],
  ['NEUROSURGERY UNIT 3', 'Neuro Unit III'],
  ['UROLOGY UNIT 2', 'Uro Unit II'],
  ['ENT UNIT 3', 'ENT Unit III'],
  ['PAEDIATRIC SURGERY UNIT 1', 'Paedo Unit I'],
  ['PLASTIC SURGERY UNIT 2', 'PS Unit 2'],
  ['ORTHOPEDIC SURGERY UNIT 1', 'Ortho Unit I'],
  ['MAXILLOFACIAL UNIT 2', 'Maxillo Unit II'],
  ['CTU 1', 'CTU Unit I'],
];

describe('reconciling the two ways a unit is spelled', () => {
  for (const [formName, registryName] of FORM_TO_REGISTRY) {
    it(`matches "${formName}" to "${registryName}"`, () => {
      expect(sameUnit(formName, registryName)).toBe(true);
    });
  }

  it('accepts the spellings people type by hand', () => {
    expect(sameUnit('O and G firm 2', 'O&G Firm 2')).toBe(true);
    expect(sameUnit('Gen Surg 1', 'GS Unit I')).toBe(true);
    expect(sameUnit('  o/g   firm  2  ', 'O&G Firm 2')).toBe(true);
  });
});

describe('units that must NOT be confused for one another', () => {
  it('keeps the firms apart', () => {
    expect(sameUnit('O/G FIRM 2', 'O&G Firm 3')).toBe(false);
    expect(sameUnit('GS Unit I', 'GS Unit II')).toBe(false);
    expect(sameUnit('CTU 1', 'CTU Unit III')).toBe(false);
  });

  it('keeps the specialties apart', () => {
    expect(sameUnit('GENERAL SURGERY UNIT 1', 'Paedo Unit I')).toBe(false);
    expect(sameUnit('PS Unit 1', 'GS Unit I')).toBe(false);
    expect(sameUnit('Neuro Unit I', 'ENT Unit I')).toBe(false);
  });

  it('keeps the weekday ophthalmology lists apart', () => {
    // These have no number, so a key of the bare specialty would collapse all
    // five of them into one and hand Monday's nurses to Thursday's patients.
    expect(sameUnit('Monday Unit (Ophthalmology)', 'Thursday Unit (Ophthalmology)')).toBe(false);
    expect(unitKey('Monday Unit (Ophthalmology)')).toBe('ophthal monday');
  });

  it('reads O&G Firm 4 and O&G Unit 4 as the same unit', () => {
    // The registry holds "O&G Unit 4" where the others are firms. "Unit" and
    // "firm" are the same word here — the department numbers its firms once.
    expect(sameUnit('O/G FIRM 4', 'O&G Unit 4')).toBe(true);
  });
});

describe('unitKey on nothing', () => {
  it('is null rather than an empty key that matches everything', () => {
    expect(unitKey(null)).toBeNull();
    expect(unitKey('')).toBeNull();
    expect(unitKey('   ')).toBeNull();
    expect(unitKey('Unit')).toBeNull();
    expect(sameUnit(null, 'GS Unit I')).toBe(false);
    expect(sameUnit('', '')).toBe(false);
  });
});

describe('findByUnit', () => {
  const allocations = [
    { surgicalUnit: 'O/G FIRM 2', nurse: 'Adaeze' },
    { surgicalUnit: 'O&G Firm 3', nurse: 'Ngozi' },
    { surgicalUnit: null, nurse: 'nobody' },
  ];

  it('finds the allocation whose unit was spelled the other way', () => {
    expect(findByUnit(allocations, 'O&G Firm 2', (a) => a.surgicalUnit)?.nurse).toBe('Adaeze');
  });

  it('prefers an exact spelling over a keyed one', () => {
    const rows = [
      { surgicalUnit: 'GENERAL SURGERY UNIT 1', nurse: 'keyed' },
      { surgicalUnit: 'GS Unit I', nurse: 'exact' },
    ];
    expect(findByUnit(rows, 'GS Unit I', (r) => r.surgicalUnit)?.nurse).toBe('exact');
  });

  it('returns nothing rather than the first row when no unit matches', () => {
    expect(findByUnit(allocations, 'Neuro Unit II', (a) => a.surgicalUnit)).toBeUndefined();
  });
});
