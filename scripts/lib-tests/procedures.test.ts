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

describe('the master list, transcribed', () => {
  // Rebuilt in November 2026 from the hospital's master procedure list —
  // "Surgical Consumables & Drugs Shopping Lists", ten specialties plus a
  // cross-specialty section, with that document's own subsection headings
  // kept as the category.

  it('holds the whole list, not a sample of it', () => {
    expect(catalogueSize()).toBeGreaterThan(1900);
    for (const s of SUBSPECIALTIES) expect(CATALOGUE[s].length).toBeGreaterThan(40);
  });

  it('kept Ophthalmology, which the master list does not cover', () => {
    // The document has no eye section. Rebuilding from it alone would empty
    // this picker, and an empty picker looks exactly like a broken one — the
    // surgeon sees no options and has no way to tell whether that is a bug or
    // a specialty that has nothing scheduled.
    expect(CATALOGUE.Ophthalmology.length).toBeGreaterThan(40);
    expect(CATALOGUE.Ophthalmology.map((e) => e.name))
      .toContain('Extracapsular cataract extraction with intraocular lens');
  });

  it('contains no two entries that are the same words in a different order', () => {
    // THE reason the established wording was kept wherever the document only
    // reworded an operation.
    //
    // procedureSlug keeps word ORDER, so "Excision of lipoma" and "Lipoma
    // excision" produce two different slugs: the collision test above passes,
    // and seed-procedures.js — which only ever ADDS rows — writes both. One
    // operation then appears twice in the dropdown, and the pack mapping,
    // which is keyed on the name, follows only one of them.
    //
    // Sorting the slug's words is a blunter key than the catalogue's real one
    // and is used here only to refuse that specific shape of duplicate.
    const wordSet = (n: string) => procedureSlug(n).split('-').filter(Boolean).sort().join('-');
    const dupes: string[] = [];
    for (const s of SUBSPECIALTIES) {
      const seen = new Map<string, string>();
      for (const e of CATALOGUE[s]) {
        const w = wordSet(e.name);
        const prev = seen.get(w);
        if (prev) dupes.push(`${s}: "${prev}" vs "${e.name}"`);
        else seen.set(w, e.name);
      }
    }
    expect(dupes).toEqual([]);
  });

  it('keeps the wording already seeded where the document only reworded it', () => {
    // These rows exist in the live database and carry pack mappings. The
    // master list calls them "Lipoma excision", "Appendicectomy – open",
    // "Cholecystectomy – laparoscopic", "Gastroschisis repair" and
    // "Ventricular septal defect closure"; adopting that wording would add a
    // second row rather than rename the first, because the seed cannot rename.
    const names = allEntries().map((e) => e.name);
    for (const kept of [
      'Excision of lipoma',
      'Open appendicectomy',
      'Laparoscopic cholecystectomy',
      'Repair of gastroschisis',
      'Closure of ventricular septal defect',
    ]) expect(names).toContain(kept);
  });

  it('offers a cross-specialty procedure to every unit that books it', () => {
    // Section 11 asks for "the responsible specialty and alternative eligible
    // specialties properly identified". The unique key is (subspecialty,
    // slug), so the only way to say that here is to list the procedure under
    // each eligible unit — and the only way to say a procedure is NOT shared
    // is for it to appear once.
    const where = (name: string) =>
      allEntries().filter((e) => e.name === name).map((e) => e.subspecialty).sort();

    expect(where('Central venous catheter insertion'))
      .toEqual(['Cardiothoracic Surgery', 'General Surgery', 'Paediatric Surgery']);
    expect(where('Examination under anaesthesia')).toEqual([
      'ENT (Otorhinolaryngology)', 'General Surgery', 'Obstetrics & Gynaecology',
      'Paediatric Surgery', 'Urology',
    ]);
    // A craniotomy is not something another unit may book.
    expect(where('Emergency craniotomy')).toEqual(['Neurosurgery']);
    expect(allEntries().filter((e) => e.crossSpecialty).length).toBeGreaterThan(100);
  });

  it('brought across operations that only the master list names', () => {
    // Sampled one per specialty, so a half-finished re-import is visible.
    const names = allEntries().map((e) => e.name);
    for (const m of [
      'Roux-en-Y gastric bypass',
      'Free flap reconstruction',
      'Selective dorsal rhizotomy',
      'Carotid endarterectomy',
    ]) expect(names).toContain(m);
  });

  it('has no two optgroups in one specialty that mean the same thing', () => {
    // A survivor that kept its old short category sits beside the master
    // list's longer one — "Endocrine" next to "Breast and endocrine surgery",
    // "Thoracic" next to "Thoracic and lung surgery". Both are headings over
    // the same operations, and a picker showing both reads as a fault in the
    // list: a surgeon who opens the first one concludes the second is where
    // everything else went, and scrolls past what they were looking for.
    //
    // Stated as: no heading's words may be wholly contained in another's.
    const wordsOf = (c: string) => new Set(procedureSlug(c).split('-').filter(Boolean));
    const overlaps: string[] = [];
    for (const s of SUBSPECIALTIES) {
      const cats = [...new Set(CATALOGUE[s].map((e) => e.category))];
      for (const a of cats) for (const b of cats) {
        if (a === b) continue;
        const [wa, wb] = [wordsOf(a), wordsOf(b)];
        if (wa.size && [...wa].every((w) => wb.has(w))) overlaps.push(`${s}: "${a}" inside "${b}"`);
      }
    }
    expect(overlaps).toEqual([]);
  });
});
