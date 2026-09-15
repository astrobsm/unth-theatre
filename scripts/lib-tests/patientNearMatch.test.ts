/**
 * The duplicates that got past the strict identifier guard.
 *
 * A duplicate-detection rule is easy to write and easy to fool yourself about,
 * so this suite is built from actual pairs in this hospital's database rather
 * than from invented examples. Of 37 duplicate pairs found on 15 September
 * 2026, ten were created AFTER the strict guard went in on 20 August — each by
 * somebody who searched for the patient, did not find them because the number
 * had been written differently the first time, and registered again. Eleven of
 * the 37 now carry the SAME operation twice.
 *
 * Eight of those ten are below. The remaining two are identity cases where the
 * ages disagree so far that they are probably two people, and this module
 * deliberately does not assert they are one.
 *
 * The rest of the file matters as much as the first part. A warning that fires
 * on everything gets clicked through, and is then worse than no warning at all
 * — so the false-positive cases are also real pairs from the same database,
 * which must NOT be treated as one person.
 */
import { describe, expect, it } from 'vitest';

import {
  compareToExisting, findNearMatches, shouldHoldRegistration,
  identifierCore, looseIdentifier, nameKey, editDistance, summarise,
  type PatientLike,
} from '../../src/lib/patients/nearMatch';

const patient = (over: Partial<PatientLike> = {}): PatientLike => ({
  id: 'existing-1',
  name: 'A PATIENT',
  folderNumber: '000000',
  ptNumber: null,
  age: 40,
  ageUnit: 'YEARS',
  gender: 'Female',
  ward: 'WARD 1',
  ...over,
});

const level = (a: Parameters<typeof compareToExisting>[0], b: PatientLike) =>
  compareToExisting(a, b)?.level ?? null;

describe('the ten that got through', () => {
  it('NWOJI CHIZARAM — 555202 and PT-555202', () => {
    expect(level(
      { name: 'NWOJI CHIZARAM', folderNumber: 'PT-555202', age: 6 },
      patient({ name: 'NWOJI CHIZARAM', folderNumber: '555202', age: 6 }),
    )).toBe('strong');
  });

  it('IBEKIE DESTINY — 531886 and PT531886', () => {
    expect(level(
      { name: 'IBEKIE DESTINY', folderNumber: 'PT531886', age: 6 },
      patient({ name: 'IBEKIE DESTINY', folderNumber: '531886', age: 6 }),
    )).toBe('strong');
  });

  it('OTOKPA CECILIA — r534992 and Pr534992', () => {
    expect(level(
      { name: 'OTOKPA CECILIA', folderNumber: 'Pr534992', age: 83 },
      patient({ name: 'OTOKPA CECILIA', folderNumber: 'r534992', age: 83 }),
    )).toBe('strong');
  });

  it('IHEANYI MICHAEL — 2722491 and 272491, a dropped digit', () => {
    expect(level(
      { name: 'IHEANYI MICHAEL', folderNumber: '272491', age: 55 },
      patient({ name: 'IHEANYI MICHAEL', folderNumber: '2722491', age: 55 }),
    )).toBe('strong');
  });

  it('NWOKE NGOZI ANN — PT443076 and PT44307', () => {
    expect(level(
      { name: 'NWOKE NGOZI ANN', folderNumber: 'PT44307', age: 41 },
      patient({ name: 'NWOKE NGOZI ANN', folderNumber: 'PT443076', age: 41 }),
    )).toBe('strong');
  });

  it('EDEANI FERDINAND — Pt228817 and Pt22881', () => {
    expect(level(
      { name: 'EDEANI FERDINAND', folderNumber: 'Pt22881', age: 28 },
      patient({ name: 'EDEANI FERDINAND', folderNumber: 'Pt228817', age: 28 }),
    )).toBe('strong');
  });

  it('ANIKPOTA CHIDUBEM — PT 535856 and 534856, a wrong digit', () => {
    expect(level(
      { name: 'ANIKPOTA CHIDUBEM', folderNumber: '534856', age: 40 },
      patient({ name: 'ANIKPOTA CHIDUBEM', folderNumber: 'PT 535856', age: 40 }),
    )).toBe('strong');
  });

  it('AYOGU GRACE — 914282 and pt521935, nothing in common but the patient', () => {
    // The case identifier comparison alone can never catch, and the reason
    // name and age are matched at all.
    expect(level(
      { name: 'AYOGU GRACE', folderNumber: 'pt521935', age: 54 },
      patient({ name: 'AYOGU GRACE', folderNumber: '914282', ptNumber: '521925', age: 54 }),
    )).toBe('strong');
  });

  it('holds registration for every one of them', () => {
    const pairs: [string, string, string, number][] = [
      ['NWOJI CHIZARAM', 'PT-555202', '555202', 6],
      ['IBEKIE DESTINY', 'PT531886', '531886', 6],
      ['OTOKPA CECILIA', 'Pr534992', 'r534992', 83],
      ['IHEANYI MICHAEL', '272491', '2722491', 55],
      ['NWOKE NGOZI ANN', 'PT44307', 'PT443076', 41],
      ['EDEANI FERDINAND', 'Pt22881', 'Pt228817', 28],
      ['ANIKPOTA CHIDUBEM', '534856', 'PT 535856', 40],
    ];
    for (const [name, typed, onFile, age] of pairs) {
      const matches = findNearMatches(
        { name, folderNumber: typed, age },
        [patient({ name, folderNumber: onFile, age })],
      );
      expect(shouldHoldRegistration(matches)).toBe(true);
    }
  });
});

describe('what the strict guard already refuses', () => {
  // These are real July pairs, created BEFORE the identifier guard went in on
  // 20 August. They differ only in case or whitespace, which normaliseIdentifier
  // handles — so they come back as 'exact' and registration is refused outright
  // rather than merely questioned. Recorded here so the boundary between the
  // strict layer and this one stays visible.
  it('OBI CHIALUKALUM — a leading space and a capital letter', () => {
    expect(level(
      { name: 'OBI CHIALUKALUM', folderNumber: 'Pt508148', age: 20 },
      patient({ name: 'OBI CHIALUKALUM', folderNumber: ' PT508148', age: 20 }),
    )).toBe('exact');
  });

  it('OHIA THERESA — PT531300 and Pt531300', () => {
    expect(level(
      { name: 'OHIA THERESA', folderNumber: 'Pt531300', age: 71 },
      patient({ name: 'OHIA THERESA', folderNumber: 'PT531300', age: 71 }),
    )).toBe('exact');
  });

  it('holds registration for an exact collision even when the ages disagree', () => {
    // UWAZURIKE JOEL: the same folder number on a 29-year-old and a 3-year-old.
    // One of those records is wrong, and it is not for a form to guess which —
    // but it must not quietly make a third.
    const m = compareToExisting(
      { name: 'UWAZURIKE JOEL', folderNumber: 'PT526641', age: 3 },
      patient({ name: 'UWAZURIKE JOEL', folderNumber: 'Pt526641', age: 29 }),
    );
    expect(m?.level).toBe('exact');
    expect(shouldHoldRegistration(m ? [m] : [])).toBe(true);
  });
});

describe('what must NOT be held up', () => {
  it('lets an unrelated patient through', () => {
    expect(level(
      { name: 'CHUKWUEMEKA EMMANUEL', folderNumber: '915259', age: 22 },
      patient({ name: 'OHAIKE STELLA', folderNumber: '9877', age: 55 }),
    )).toBeNull();
  });

  it('does not hold two people who share a name but not an age', () => {
    // Both are real rows here: Okeke Bridget aged 92, and another aged 31.
    const m = compareToExisting(
      { name: 'Okeke Bridget', folderNumber: '600001', age: 31 },
      patient({ name: 'Okeke Bridget', folderNumber: '914763', age: 92 }),
    );
    expect(m?.level).toBe('possible');
    expect(shouldHoldRegistration(m ? [m] : [])).toBe(false);
  });

  it('does not hold a child against an adult who merely share a name', () => {
    // Two people called Uwazurike Joel, aged 29 and 3, with UNRELATED folder
    // numbers. Nothing but the name is shared, so nothing is held up.
    const m = compareToExisting(
      { name: 'UWAZURIKE JOEL', folderNumber: '700456', age: 3 },
      patient({ name: 'UWAZURIKE JOEL', folderNumber: '526641', age: 29 }),
    );
    expect(m?.level).toBe('possible');
    expect(m?.reasons.join(' ')).toMatch(/may be a different person/);
    expect(shouldHoldRegistration(m ? [m] : [])).toBe(false);
  });

  it('keeps two siblings with adjacent folder numbers apart', () => {
    // A single-digit difference with a DIFFERENT name is a question, not a
    // finding: families are registered together and their numbers run on.
    const m = compareToExisting(
      { name: 'OKEKE CHIDI', folderNumber: '531887', age: 8 },
      patient({ name: 'OKEKE NGOZI', folderNumber: '531886', age: 6 }),
    );
    expect(m?.level).toBe('possible');
    expect(shouldHoldRegistration(m ? [m] : [])).toBe(false);
  });

  it('does not match on a short identifier', () => {
    // "9877" is a real folder number here. Three digits or fewer is not
    // distinctive enough to accuse anybody of being already registered.
    expect(identifierCore('PT-12')).toBe('');
    expect(level(
      { name: 'SOMEBODY ELSE', folderNumber: 'A-99', age: 30 },
      patient({ name: 'ANOTHER PERSON', folderNumber: 'B/99', age: 30 }),
    )).toBeNull();
  });

  it('does not treat two blank identifiers as a match', () => {
    expect(level(
      { name: 'SOMEBODY', folderNumber: '', age: 30 },
      patient({ name: 'SOMEBODY ELSE ENTIRELY', folderNumber: '', age: 77 }),
    )).toBeNull();
  });
});

describe('a name written the other way round', () => {
  it('recognises surname-first against given-name-first', () => {
    // The patient at the centre of this: NWAKAMA BRIDGET EZIAKU.
    expect(nameKey('NWAKAMA BRIDGET EZIAKU')).toBe(nameKey('Bridget Eziaku Nwakama'));
  });

  it('matches on it, with the age agreeing', () => {
    expect(level(
      { name: 'Bridget Eziaku Nwakama', folderNumber: '600123', age: 29 },
      patient({ name: 'NWAKAMA BRIDGET EZIAKU', folderNumber: '496076', age: 29 }),
    )).toBe('strong');
  });

  it('ignores punctuation and initials in a name', () => {
    expect(nameKey('Okonkwo, C. A.')).toBe('OKONKWO');
  });
});

describe('the identifier core', () => {
  it('strips a prefix', () => {
    expect(identifierCore('PT-555202')).toBe('555202');
    expect(identifierCore('pt 555202')).toBe('555202');
    expect(identifierCore('Pr534992')).toBe('534992');
  });

  it('takes the folder number out of a UNTH reference, not the year', () => {
    expect(identifierCore('UNTH/2026/914840')).toBe('914840');
  });

  it('leaves a plain number alone', () => {
    expect(identifierCore('914954')).toBe('914954');
    expect(identifierCore('914 954')).toBe('914954');
  });

  it('answers empty when there is nothing to key on', () => {
    expect(identifierCore('')).toBe('');
    expect(identifierCore(null)).toBe('');
    expect(identifierCore('PT')).toBe('');
  });
});

describe('cross-field comparison', () => {
  it('finds a folder number typed into the PT field', () => {
    // ABEH MARIA: one record has folder "PT 531453", the other put the same
    // number in ptNumber as "pt531453".
    expect(level(
      { name: 'ABEH MARIA', folderNumber: '408802', ptNumber: 'pt531453', age: 78 },
      patient({ name: 'ABEH MARIA', folderNumber: 'PT 531453', ptNumber: 'PT 531453', age: 78 }),
    )).toBe('exact');
  });
});

describe('supporting pieces', () => {
  it('measures edit distance and gives up past the cap', () => {
    expect(editDistance('531886', '531886')).toBe(0);
    expect(editDistance('2722491', '272491', 1)).toBe(1);
    expect(editDistance('abcdef', 'zzzzzz', 2)).toBe(3);
  });

  it('strips everything but letters and digits', () => {
    expect(looseIdentifier('PT-529930')).toBe('PT529930');
    expect(looseIdentifier(' pt 508148 ')).toBe('PT508148');
  });

  it('sorts the strongest match first', () => {
    const matches = findNearMatches(
      { name: 'NWOJI CHIZARAM', folderNumber: 'PT-555202', age: 6 },
      [
        patient({ id: 'weak', name: 'NWOJI CHIZARAM', folderNumber: '999999', age: 30 }),
        patient({ id: 'strong', name: 'NWOJI CHIZARAM', folderNumber: '555202', age: 6 }),
      ],
    );
    expect(matches[0].patient.id).toBe('strong');
  });

  it('says how many, in words somebody can act on', () => {
    expect(summarise([])).toBe('');
    const one = findNearMatches(
      { name: 'OHIA THERESA', folderNumber: 'Pt531300', age: 71 },
      [patient({ name: 'OHIA THERESA', folderNumber: 'PT531300', age: 71 })],
    );
    expect(summarise(one)).toMatch(/looks like somebody already registered/);
  });

  it('compares a baby in months against a child in years', () => {
    // 6 months and 6 years must not read as the same age.
    const m = compareToExisting(
      { name: 'BABY OKEKE', folderNumber: '700001', age: 6, ageUnit: 'MONTHS' },
      patient({ name: 'BABY OKEKE', folderNumber: '700002', age: 6, ageUnit: 'YEARS' }),
    );
    expect(m?.level).toBe('possible');
  });
});
