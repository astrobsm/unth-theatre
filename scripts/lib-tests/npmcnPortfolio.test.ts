// The NPMCN Faculty of Surgery Resident's Portfolio, as the College published
// it and as this module reproduces it.
//
// EVERY ASSERTION HERE IS AGAINST THE DOCUMENT, not against a convention.
// Before the portfolio arrived this module guessed four participation codes,
// withheld the patient's name, and presented the book as one flat list. All
// three were wrong, and all three would have been wrong in a way a trainee
// only discovers at an examination. These tests are what stops that drifting
// back.
import { describe, it, expect } from 'vitest';
import {
  NPMCN_PART_1, NPMCN_SUBSPECIALTIES, NPMCN_NEUROSURGERY_COURSES,
  NPMCN_PART_1_SECTION, classifyNpmcn, flattenCategories,
} from '../../src/lib/logbook/npmcn';
import {
  collegeProfile, NPMCN_LEVELS, NPMCN_SURGERY_COLUMNS,
} from '../../src/lib/logbook/colleges';
import { codeFor, labelFor, categoriseForNpmcn } from '../../src/lib/logbook/build';

const npmcn = collegeProfile('npmcn-surgery')!;

describe('the three codes, in the College’s own words', () => {
  it('has THREE codes, not four — there is no observed code', () => {
    // The document: "Assisting a senior - A; Assisted by a consultant (or
    // senior) - S; As surgeon in charge - P." A trainee who only watched has
    // nothing to enter, which is the College's position.
    expect(NPMCN_LEVELS).toHaveLength(3);
    expect(NPMCN_LEVELS.map((l) => l.code)).toEqual(['A', 'S', 'P']);
    expect(NPMCN_LEVELS.map((l) => l.key)).not.toContain('OBSERVED');
  });

  it('keeps the College’s wording, which is not the generic wording', () => {
    const byCode = Object.fromEntries(NPMCN_LEVELS.map((l) => [l.code, l.label]));
    expect(byCode.A).toBe('Assisting a senior');
    expect(byCode.S).toBe('Assisted by a consultant (or senior)');
    expect(byCode.P).toBe('As surgeon in charge');
  });

  it('records that S means the TRAINEE operated, which reads backwards', () => {
    // The single most misreadable letter in the book. "Assisted by a
    // consultant" means the consultant assisted YOU.
    const s = NPMCN_LEVELS.find((l) => l.code === 'S')!;
    expect(s.help.toUpperCase()).toContain('YOU OPERATED');
  });

  it('uses those codes when the book is built, not the generic ones', () => {
    expect(codeFor('SUPERVISED', NPMCN_LEVELS)).toBe('S');
    expect(codeFor('INDEPENDENT', NPMCN_LEVELS)).toBe('P');
    expect(labelFor('INDEPENDENT', NPMCN_LEVELS)).toBe('As surgeon in charge');
    // And the generic default still answers for a College with no own codes.
    expect(labelFor('INDEPENDENT')).toBe('Performed independently');
  });

  it('attaches those codes to the NPMCN profile', () => {
    expect(npmcn.levels).toBe(NPMCN_LEVELS);
  });
});

describe('the columns, in the portfolio’s own order', () => {
  it('reproduces the eleven headings exactly', () => {
    expect(NPMCN_SURGERY_COLUMNS.map((c) => c.header)).toEqual([
      'S/No.', "Patient's Names", 'Hospital No.', 'Age', 'Sex', 'Diagnosis',
      'Operation', 'A.S.P', 'Complications', 'Names/Signature of Consultant', 'Date',
    ]);
  });

  it('carries the patient name column, because the College asks for it', () => {
    expect(npmcn.patientNameColumn).toBe(true);
    expect(NPMCN_SURGERY_COLUMNS.map((c) => c.key)).toContain('patientName');
  });

  it('keeps Age and Sex apart, and puts Date last', () => {
    // Not tidied into "Age / Sex" and a leading date. A trainee transcribes
    // column by column into the printed book.
    const keys = NPMCN_SURGERY_COLUMNS.map((c) => c.key);
    expect(keys.indexOf('age') + 1).toBe(keys.indexOf('sex'));
    expect(keys[keys.length - 1]).toBe('date');
  });
});

describe('Part 1 — the eighteen tables every trainee fills', () => {
  it('lists all eighteen, in the portfolio’s order', () => {
    expect(NPMCN_PART_1.map((c) => c.label)).toEqual([
      'Groin hernia', 'Trauma laparotomy', 'Laparotomy for sepsis', 'Appendicectomy',
      'Intestinal obstruction', 'Gastric and duodenal surgery', 'Anorectal',
      'Hepato-biliary', 'Breast surgery', 'Endocrine/exocrine', 'GI endoscopy',
      'Paediatric surgery', 'Chest tube insertion', 'Plastic surgery', 'Urology',
      'Orthopaedics', 'Diagnostic procedures', 'Lump excisions (excl. breast)',
    ]);
  });

  it('gives every table something to match on', () => {
    NPMCN_PART_1.forEach((c) => expect(c.match.length).toBeGreaterThan(0));
  });
});

describe('Part 2 — the subspecialties', () => {
  it('offers the six the portfolio prints', () => {
    expect(NPMCN_SUBSPECIALTIES.map((s) => s.label)).toEqual([
      'General Surgery', 'Urology', 'Burns & Plastic', 'Paediatric Surgery',
      'Cardio-thoracic Surgery', 'Neurosurgery',
    ]);
  });

  it('carries a substantial table list for each', () => {
    NPMCN_SUBSPECIALTIES.forEach((s) => {
      expect(flattenCategories(s.sections).length, s.label).toBeGreaterThan(10);
    });
  });

  it('keeps the paediatric lettered groups the College uses', () => {
    const paed = NPMCN_SUBSPECIALTIES.find((s) => s.key === 'paediatric')!;
    expect(paed.sections.map((x) => x.label)).toEqual([
      'A. General Paediatric Surgery', 'B. Neonatal Procedures',
      'C. Gastrointestinal/Hepatobiliary Procedures', 'D. Urologic Procedures',
      'E. Oncology',
    ]);
  });

  it('gives every category a unique key within its section', () => {
    NPMCN_SUBSPECIALTIES.forEach((s) => {
      s.sections.forEach((section) => {
        const keys = section.categories.map((c) => c.key);
        expect(new Set(keys).size, `${s.label} / ${section.label}`).toBe(keys.length);
      });
    });
  });
});

describe('the one number the College actually published', () => {
  it('is the hands-on course requirement, not an operative count', () => {
    expect(NPMCN_NEUROSURGERY_COURSES.requirement)
      .toBe('Must attend at least 1 each year of training');
    expect(NPMCN_NEUROSURGERY_COURSES.courses).toHaveLength(6);
    expect(NPMCN_NEUROSURGERY_COURSES.courses).toContain('Skull Base Course');
  });

  it('asserts NO operative minimum anywhere, because none is printed', () => {
    // The document heads the neurosurgery section "Minimum Operative
    // Requirement" and then prints blank tables. A number invented here
    // would be quoted at an examiner.
    expect(npmcn.totalRequired).toBeNull();
    expect(npmcn.quotasVerified).toBe(false);
    expect(npmcn.quotas).toEqual([]);
    expect(npmcn.sourceNote).toContain('NO minimum numbers');
  });
});

describe('the College’s instructions', () => {
  it('quotes the rule trainees are actually caught by', () => {
    const all = (npmcn.guidance ?? []).join(' ');
    expect(all).toContain('completed in a rush in the last days of the posting');
    expect(all).toContain('AT THE TIME');
  });

  it('states whose responsibility the entries are', () => {
    expect(npmcn.requirement).toContain('Resident');
    expect(npmcn.requirement).toContain('each case he manages and/or operates on');
  });
});

const row = (over: Record<string, unknown> = {}) => ({
  serial: 1, caseId: 'c1', date: '2026-03-04', hospitalNumber: 'PT1',
  patientName: null, age: '40', sex: 'Male', specialty: 'General Surgery',
  diagnosis: null, procedure: null, anaesthesia: null, asa: null,
  comorbidities: null, urgency: 'ELECTIVE', role: 'Surgeon', roleCode: 'P',
  level: 'INDEPENDENT' as const, levelBasis: '', complications: null,
  outcome: null, supervisor: null, ...over,
}) as never;

describe('sorting cases into the portfolio’s tables', () => {
  const general = NPMCN_SUBSPECIALTIES.find((s) => s.key === 'general')!;

  it('puts a case in the table its OPERATION names', () => {
    const book = categoriseForNpmcn(
      [row({ procedure: 'Open appendicectomy', diagnosis: 'Acute abdomen' })],
      general.sections,
    );
    const filled = book.tables.filter((t) => t.rows.length > 0);
    expect(filled).toHaveLength(1);
    expect(filled[0].categoryLabel).toBe('Appendicectomy');
    expect(book.unclassified).toHaveLength(0);
  });

  it('falls back to the diagnosis when the operation says nothing', () => {
    const book = categoriseForNpmcn(
      [row({ procedure: 'Exploration', diagnosis: 'Right inguinal hernia' })],
      general.sections,
    );
    expect(book.tables.find((t) => t.rows.length > 0)!.categoryLabel).toBe('Groin hernia');
  });

  it('places a case in ONE table only, never two', () => {
    // "Laparoscopic cholecystectomy" matches hepato-biliary in Part 1 and
    // Lap. Cholecystectomy in Part 2. Counting it twice would inflate every
    // total in the book.
    const book = categoriseForNpmcn(
      [row({ procedure: 'Laparoscopic cholecystectomy', diagnosis: 'Cholelithiasis' })],
      general.sections,
    );
    const total = book.tables.reduce((a, t) => a + t.rows.length, 0);
    expect(total).toBe(1);
  });

  it('prefers Part 1, which is the order a trainee fills the book in', () => {
    const book = categoriseForNpmcn(
      [row({ procedure: 'Laparoscopic cholecystectomy' })],
      general.sections,
    );
    expect(book.tables.find((t) => t.rows.length > 0)!.part).toBe(1);
  });

  it('SHOWS what it could not place rather than hiding it', () => {
    // A keyword list is a sorting aid, not a coding system. A case silently
    // filed in the wrong table is worse than one left visibly unfiled.
    const book = categoriseForNpmcn(
      [row({ procedure: 'Something nobody has heard of', diagnosis: 'Also unusual' })],
      general.sections,
    );
    expect(book.unclassified).toHaveLength(1);
    expect(book.tables.every((t) => t.rows.length === 0)).toBe(true);
  });

  it('leaves a case with no operation and no diagnosis unclassified', () => {
    const book = categoriseForNpmcn([row()], general.sections);
    expect(book.unclassified).toHaveLength(1);
  });

  it('builds a table for every category the subspecialty has', () => {
    const book = categoriseForNpmcn([], general.sections);
    expect(book.tables.length)
      .toBe(NPMCN_PART_1_SECTION.categories.length + flattenCategories(general.sections).length);
    // And none of them claims a target.
    expect(book.tables.every((t) => t.required === null)).toBe(true);
  });

  it('sorts a neurosurgical case into the neurosurgery tables', () => {
    const neuro = NPMCN_SUBSPECIALTIES.find((s) => s.key === 'neurosurgery')!;
    const book = categoriseForNpmcn(
      [row({ procedure: 'Burr hole drainage', diagnosis: 'Chronic subdural haematoma' })],
      neuro.sections,
    );
    const filled = book.tables.find((t) => t.rows.length > 0)!;
    expect(filled.categoryLabel).toContain('Burr hole');
    expect(filled.group).toBe('Neurosurgery');
  });

  it('classifyNpmcn returns null rather than guessing', () => {
    expect(classifyNpmcn(NPMCN_PART_1, null, null)).toBeNull();
    expect(classifyNpmcn(NPMCN_PART_1, 'zzz', 'zzz')).toBeNull();
  });
});
