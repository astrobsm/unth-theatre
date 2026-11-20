/**
 * Which units operate at which site.
 *
 * Every other site belongs to the units based there: the Eye Theatre is
 * Ophthalmology's, the Cardiothoracic Centre is CTU's. A&E is not like the
 * others — it is the twenty-four-hour emergency theatre and takes cases from
 * EVERY surgical unit, which is the Theatre Users Committee's own position
 * (prayer 5: all emergency surgical cases there, with four recorded
 * exceptions, and those send cases AWAY rather than restricting who may come).
 *
 * Filtering on `unit.location === 'A&E'` therefore returns the handful of units
 * whose HOME is recorded as A&E, which is nobody's definition of who operates
 * there. On the planned-cases form it left the unit dropdown empty, and a form
 * that cannot be completed is a case that gets planned on paper.
 */
import { describe, expect, it } from 'vitest';
import { isOpenToEveryUnit, isAneLocation, unitsForSite } from '../../src/lib/theatre/sites';
import { LOCATIONS } from '../../src/lib/constants';

const UNITS = [
  { name: 'GS Unit I', location: 'Professor Ojukwu Theatre Complex' },
  { name: 'Ortho Unit I', location: 'Professor Ojukwu Theatre Complex' },
  { name: 'Ophthalmology Unit', location: 'Eye Theatre' },
  { name: 'CTU I', location: 'Cardiothoracic Centre' },
  { name: 'Emergency Unit', location: 'A&E' },
];

describe('the site that takes every unit', () => {
  it('recognises A&E however it was written down', () => {
    // The canonical label is 'A&E', but the same place is written 'A & E' and
    // 'Accident and Emergency' across seeds, rosters and things people typed.
    // A rule that knows one spelling stops applying the first time somebody
    // uses another.
    expect(isOpenToEveryUnit('A&E')).toBe(true);
    expect(isOpenToEveryUnit('A & E')).toBe(true);
    expect(isOpenToEveryUnit('Accident and Emergency')).toBe(true);
    expect(isOpenToEveryUnit('a&e theatre')).toBe(true);
    expect(isOpenToEveryUnit('A&E North Wing Suite')).toBe(true);
  });

  it('is the only one of the four sites that is', () => {
    // If a second site ever becomes open to every unit, this fails and
    // somebody decides deliberately rather than by accident.
    const open = LOCATIONS.filter((l) => isOpenToEveryUnit(l));
    expect(open).toEqual(['A&E']);
  });

  it('does not mistake the other sites for it', () => {
    expect(isOpenToEveryUnit('Eye Theatre')).toBe(false);
    expect(isOpenToEveryUnit('Cardiothoracic Centre')).toBe(false);
    expect(isOpenToEveryUnit('Professor Ojukwu Theatre Complex')).toBe(false);
    expect(isOpenToEveryUnit('')).toBe(false);
    expect(isOpenToEveryUnit(null)).toBe(false);
  });

  it('is still callable by the name the booking form uses', () => {
    // Renaming a working rule while moving it is two changes to review as one.
    expect(isAneLocation).toBe(isOpenToEveryUnit);
  });
});

describe('the units a form should offer', () => {
  it('offers every unit at A&E, not only the ones based there', () => {
    // THE WHOLE FIX. Narrowing to location === 'A&E' returned one unit out of
    // five and left the dropdown effectively empty.
    const offered = unitsForSite(UNITS, 'A&E');
    expect(offered).toHaveLength(UNITS.length);
    expect(offered.map((u) => u.name)).toContain('Ortho Unit I');
    expect(offered.map((u) => u.name)).toContain('Ophthalmology Unit');
  });

  it('narrows to the site for everywhere else', () => {
    expect(unitsForSite(UNITS, 'Eye Theatre').map((u) => u.name)).toEqual(['Ophthalmology Unit']);
    expect(unitsForSite(UNITS, 'Cardiothoracic Centre').map((u) => u.name)).toEqual(['CTU I']);
    expect(unitsForSite(UNITS, 'Professor Ojukwu Theatre Complex')).toHaveLength(2);
  });

  it('offers everything when no site has been chosen', () => {
    // The honest answer to "I have not said where yet", and the one the form
    // opens on.
    expect(unitsForSite(UNITS, '')).toHaveLength(UNITS.length);
    expect(unitsForSite(UNITS, null)).toHaveLength(UNITS.length);
    expect(unitsForSite(UNITS, '   ')).toHaveLength(UNITS.length);
  });

  it('does not drop a unit whose location was never recorded', () => {
    // Only when a site is actually chosen. A unit with no home still belongs
    // to the hospital, and losing it from every dropdown would be worse than
    // showing it under a site it may not use.
    const withBlank = [...UNITS, { name: 'New Unit', location: null }];
    expect(unitsForSite(withBlank, '')).toHaveLength(6);
    expect(unitsForSite(withBlank, 'A&E')).toHaveLength(6);
    expect(unitsForSite(withBlank, 'Eye Theatre')).toHaveLength(1);
  });

  it('returns the same objects, not copies', () => {
    // Callers key dropdowns on identity and on fields this module never reads.
    const [first] = unitsForSite(UNITS, 'Eye Theatre');
    expect(first).toBe(UNITS[2]);
  });
});
