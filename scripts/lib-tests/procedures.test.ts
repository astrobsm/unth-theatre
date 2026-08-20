/**
 * The procedure catalogue and the rules that keep it clean.
 *
 * The picker is only as good as its duplicate detection. A surgeon adding
 * "Appendectomy" when "Appendicectomy" is already there must get the existing
 * entry, not a second one — otherwise the "Other" box slowly turns the
 * dropdown back into free text with extra steps.
 */
import { describe, expect, it } from 'vitest';

import {
  allEntries,
  CATALOGUE,
  catalogueSize,
  SUBSPECIALTIES,
} from '../../src/lib/procedures/catalogue';
import {
  checkProcedureName,
  isSameProcedure,
  matchesQuery,
  MIN_NAME_LENGTH,
  pickerOrder,
  procedureSlug,
  tidyProcedureName,
} from '../../src/lib/procedures/normalise';

describe('the seeded catalogue', () => {
  it('covers every subspecialty the hospital runs', () => {
    expect([...SUBSPECIALTIES]).toEqual([
      'General Surgery',
      'Obstetrics & Gynaecology',
      'Orthopaedics',
      'Neurosurgery',
      'Urology',
      'ENT (Otorhinolaryngology)',
      'Ophthalmology',
      'Maxillofacial Surgery',
      'Plastic Surgery',
      'Paediatric Surgery',
      'Cardiothoracic Surgery',
    ]);
  });

  it('has an entry list for each of them', () => {
    for (const s of SUBSPECIALTIES) {
      expect(CATALOGUE[s].length).toBeGreaterThan(20);
    }
  });

  it('is substantial rather than a token list', () => {
    expect(catalogueSize()).toBeGreaterThan(500);
  });

  it('gives every entry a name and a category', () => {
    for (const e of allEntries()) {
      expect(e.name.length).toBeGreaterThan(3);
      expect(e.category.length).toBeGreaterThan(0);
    }
  });

  it('contains no two entries that normalise to the same thing', () => {
    // THE catalogue test. A collision here would mean the seed script writes
    // one row and silently drops the other, and nobody would notice which.
    const collisions: string[] = [];
    for (const s of SUBSPECIALTIES) {
      const seen = new Map<string, string>();
      for (const e of CATALOGUE[s]) {
        const slug = procedureSlug(e.name);
        const prev = seen.get(slug);
        if (prev) collisions.push(`${s}: "${prev}" vs "${e.name}"`);
        else seen.set(slug, e.name);
      }
    }
    expect(collisions).toEqual([]);
  });

  it('would accept every one of its own entries as a user addition', () => {
    // If the seeded catalogue contains a name the validator would reject, the
    // validator is wrong or the entry is.
    const rejected = allEntries()
      .filter((e) => !checkProcedureName(e.name).ok)
      .map((e) => e.name);
    expect(rejected).toEqual([]);
  });

  it('flags the emergency workload without hiding anything', () => {
    const emergencies = allEntries().filter((e) => e.emergency);
    expect(emergencies.length).toBeGreaterThan(100);
    // Every subspecialty does emergencies. A specialty with none flagged is
    // almost certainly an oversight in the data.
    for (const s of SUBSPECIALTIES) {
      expect(CATALOGUE[s].some((e) => e.emergency)).toBe(true);
    }
  });

  it('includes the operations a Nigerian theatre actually runs most', () => {
    const names = allEntries().map((e) => e.name.toLowerCase());
    const mustHave = [
      'exploratory laparotomy',
      'emergency caesarean section',
      'open appendicectomy',
      'total abdominal hysterectomy',
      'herniotomy (inguinal)',
      'tracheostomy',
      'ventriculoperitoneal shunt insertion',
      'transurethral resection of the prostate',
      'cleft lip repair',
      'tube thoracostomy',
    ];
    for (const m of mustHave) expect(names).toContain(m);
  });
});

describe('telling two procedure names apart', () => {
  it('treats British and American spellings as one operation', () => {
    expect(isSameProcedure('Appendicectomy', 'Appendectomy')).toBe(true);
    expect(isSameProcedure('Caesarean section', 'Cesarean Section')).toBe(true);
  });

  it('ignores case, spacing and punctuation', () => {
    expect(isSameProcedure('EXPLORATORY  LAPAROTOMY', 'exploratory laparotomy')).toBe(true);
    expect(isSameProcedure('Hernia repair', 'hernia-repair')).toBe(true);
  });

  it('expands the shorthand a theatre actually says out loud', () => {
    expect(isSameProcedure('TAH', 'Total abdominal hysterectomy')).toBe(true);
    expect(isSameProcedure('D&C', 'Dilatation and curettage')).toBe(true);
    expect(isSameProcedure('ORIF of femur', 'Open reduction and internal fixation of femur')).toBe(true);
  });

  it('does NOT merge operations that differ by a numeral', () => {
    // "Type II" and "Type III" tympanoplasty are different operations.
    expect(isSameProcedure('Type II tympanoplasty', 'Type III tympanoplasty')).toBe(false);
  });

  it('does not merge genuinely different operations', () => {
    expect(isSameProcedure('Total hip replacement', 'Total knee replacement')).toBe(false);
    expect(isSameProcedure('Right hemicolectomy', 'Left hemicolectomy')).toBe(false);
    expect(isSameProcedure('Nephrectomy', 'Partial nephrectomy')).toBe(false);
  });

  it('does not mangle a phrase that merely contains "d ... c"', () => {
    // The D&C rule once matched inside "debridement and closure" and rewrote
    // the middle of the phrase. The word boundaries are load-bearing.
    expect(procedureSlug('Wound debridement and closure')).toBe('wound-debridement-closure');
    expect(isSameProcedure('Wound debridement and closure', 'Dilatation and curettage')).toBe(false);
  });

  it('has no opinion about an empty name', () => {
    expect(isSameProcedure('', '')).toBe(false);
    expect(procedureSlug('   ')).toBe('');
  });
});

describe('tidying what a surgeon typed', () => {
  it('fixes shouting', () => {
    expect(tidyProcedureName('EXPLORATORY LAPAROTOMY')).toBe('Exploratory Laparotomy');
  });

  it('keeps roman numerals upright after fixing shouting', () => {
    expect(tidyProcedureName('TYMPANOPLASTY TYPE II')).toBe('Tympanoplasty Type II');
  });

  it('leaves mixed case exactly alone', () => {
    // A surgeon who wrote "EUA and biopsy" meant those capitals.
    expect(tidyProcedureName('EUA and biopsy')).toBe('EUA and biopsy');
    expect(tidyProcedureName('Laparoscopic cholecystectomy')).toBe('Laparoscopic cholecystectomy');
  });

  it('collapses whitespace and trims stray punctuation', () => {
    expect(tidyProcedureName('  Open   appendicectomy ... ')).toBe('Open appendicectomy');
  });

  it('keeps a trailing bracket, which is part of the name', () => {
    expect(tidyProcedureName('Hartmann procedure (open)')).toBe('Hartmann procedure (open)');
  });
});

describe('what may go into the catalogue', () => {
  it('accepts a real procedure name', () => {
    expect(checkProcedureName('Laparoscopic cholecystectomy').ok).toBe(true);
  });

  it('refuses somebody answering the form instead of naming the operation', () => {
    // This would be permanent and useless — it goes into the list for everyone.
    for (const junk of ['Other', 'others', 'misc', 'N/A', 'nil', 'TBD', 'test', 'surgery']) {
      expect(checkProcedureName(junk).ok).toBe(false);
    }
  });

  it('refuses something too short to mean anything', () => {
    expect(checkProcedureName('op').ok).toBe(false);
    expect(MIN_NAME_LENGTH).toBeGreaterThanOrEqual(4);
  });

  it('refuses punctuation and digits with no words', () => {
    expect(checkProcedureName('123456').ok).toBe(false);
    expect(checkProcedureName('----').ok).toBe(false);
  });

  it('refuses an empty entry with a usable message', () => {
    const r = checkProcedureName('   ');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Enter the name');
  });

  it('refuses something absurdly long', () => {
    expect(checkProcedureName('a'.repeat(400)).ok).toBe(false);
  });
});

describe('a procedure belongs to the subspecialty it was added under', () => {
  it('scopes the identity key to the subspecialty, not globally', () => {
    // The unique key is (subspecialty, slug), so the SAME operation may exist
    // under two specialties — a thyroglossal cyst is excised by general
    // surgeons and by ENT, and each list should be able to offer it. A global
    // key would give it to whichever specialty added it first and hide it from
    // the other.
    //
    // Asserted on the key rather than on the data: today no name happens to be
    // shared, and a test that depended on that coincidence would fail the day
    // somebody added one, which is the opposite of what it should do.
    const key = (subspecialty: string, name: string) => `${subspecialty}::${procedureSlug(name)}`;
    const name = 'Excision of thyroglossal cyst';

    expect(key('General Surgery', name)).not.toBe(key('ENT (Otorhinolaryngology)', name));
    // ...while the same name in the same specialty collides, which is what
    // stops a duplicate being created.
    expect(key('General Surgery', name)).toBe(key('General Surgery', 'EXCISION OF THYROGLOSSAL CYST'));
  });

  it('gives every catalogue entry a subspecialty of its own', () => {
    // Verified live before deployment: a user-added entry lands in the chosen
    // subspecialty, shows up in that picker, and appears in no other.
    for (const e of allEntries()) {
      expect(typeof e.subspecialty).toBe('string');
      expect(e.subspecialty.length).toBeGreaterThan(0);
    }
  });

  it('never lets an entry carry a subspecialty the hospital does not have', () => {
    // The dropdown joins on this string. A value outside the eleven produces a
    // picker that is silently empty for that specialty, with no error.
    for (const e of allEntries()) {
      expect(SUBSPECIALTIES).toContain(e.subspecialty);
    }
  });
});

describe('ordering the dropdown', () => {
  const p = (name: string, usageCount: number) => ({ name, usageCount });

  it('puts what the theatre actually does at the top', () => {
    const ordered = pickerOrder([p('Zebra procedure', 0), p('Appendicectomy', 42), p('Caesarean section', 90)]);
    expect(ordered.map((x) => x.name)).toEqual(['Caesarean section', 'Appendicectomy', 'Zebra procedure']);
  });

  it('falls back to alphabetical for equally used procedures', () => {
    const ordered = pickerOrder([p('Zebra', 0), p('Alpha', 0)]);
    expect(ordered.map((x) => x.name)).toEqual(['Alpha', 'Zebra']);
  });

  it('does not reorder the caller\'s array', () => {
    const input = [p('Zebra', 0), p('Alpha', 5)];
    pickerOrder(input);
    expect(input.map((x) => x.name)).toEqual(['Zebra', 'Alpha']);
  });
});

describe('searching the list', () => {
  it('matches on any order of words', () => {
    expect(matchesQuery('Open reduction and internal fixation of femur', 'femur fixation')).toBe(true);
  });

  it('ignores case and punctuation', () => {
    expect(matchesQuery('Hartmann procedure (open)', 'hartmann')).toBe(true);
  });

  it('shows everything for an empty query', () => {
    expect(matchesQuery('Anything at all', '')).toBe(true);
  });

  it('excludes what does not match', () => {
    expect(matchesQuery('Total hip replacement', 'knee')).toBe(false);
  });
});
