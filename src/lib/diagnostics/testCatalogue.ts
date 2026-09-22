// ============================================================
// What a theatre actually orders before an operation
// ------------------------------------------------------------
// A blank "test name" box produces thirty spellings of the same investigation,
// and then nothing can be counted and the laboratory cannot route the request
// to a bench. This is the short list a surgical patient is actually worked up
// with, grouped by the bench that reports it.
//
// NOT A PROTOCOL. It is a list of things that can be ordered, not a statement
// of what any patient needs — that is the surgeon's and the anaesthetist's
// decision, and nothing here pre-ticks anything or refuses an order. Anything
// not on the list is typed free-hand and still reaches the right bench through
// the name matching, which is why the list can stay short.
// ============================================================

import type { LabDiscipline } from './disciplines';

export interface CatalogueTest {
  /** As it should be written on the request and read on the worklist. */
  name: string;
  discipline: LabDiscipline;
  /** Shown beneath the name where the reason for ordering it is not obvious. */
  note?: string;
}

export const TEST_CATALOGUE: CatalogueTest[] = [
  // ── Haematology ──
  { name: 'Full blood count', discipline: 'HAEMATOLOGY' },
  { name: 'Packed cell volume', discipline: 'HAEMATOLOGY' },
  { name: 'Clotting screen (PT, INR, APTT)', discipline: 'HAEMATOLOGY' },
  { name: 'Erythrocyte sedimentation rate', discipline: 'HAEMATOLOGY' },
  { name: 'Haemoglobin genotype', discipline: 'HAEMATOLOGY' },
  { name: 'Sickling test', discipline: 'HAEMATOLOGY' },

  // ── Chemical pathology ──
  { name: 'Serum electrolytes, urea and creatinine', discipline: 'CHEMICAL_PATHOLOGY' },
  { name: 'Random blood glucose', discipline: 'CHEMICAL_PATHOLOGY' },
  { name: 'Fasting blood glucose', discipline: 'CHEMICAL_PATHOLOGY' },
  { name: 'Liver function tests', discipline: 'CHEMICAL_PATHOLOGY' },
  { name: 'Serum calcium, magnesium and phosphate', discipline: 'CHEMICAL_PATHOLOGY' },
  { name: 'Serum amylase', discipline: 'CHEMICAL_PATHOLOGY' },
  { name: 'Arterial blood gas', discipline: 'CHEMICAL_PATHOLOGY' },

  // ── Microbiology and immunology ──
  { name: 'HIV screening', discipline: 'MICROBIOLOGY_IMMUNOLOGY', note: 'With counselling and consent.' },
  { name: 'Hepatitis B surface antigen (HBsAg)', discipline: 'MICROBIOLOGY_IMMUNOLOGY' },
  { name: 'Hepatitis C antibody', discipline: 'MICROBIOLOGY_IMMUNOLOGY' },
  { name: 'Urine microscopy, culture and sensitivity', discipline: 'MICROBIOLOGY_IMMUNOLOGY' },
  { name: 'Wound swab microscopy, culture and sensitivity', discipline: 'MICROBIOLOGY_IMMUNOLOGY' },
  { name: 'Blood culture', discipline: 'MICROBIOLOGY_IMMUNOLOGY' },
  { name: 'Malaria parasite', discipline: 'MICROBIOLOGY_IMMUNOLOGY' },

  // ── Blood bank ──
  { name: 'Blood group and save', discipline: 'BLOOD_BANK' },
  { name: 'Cross match', discipline: 'BLOOD_BANK', note: 'Say how many units in the reason.' },

  // ── Histopathology ──
  { name: 'Histology of specimen', discipline: 'HISTOPATHOLOGY' },
  { name: 'Frozen section', discipline: 'HISTOPATHOLOGY', note: 'Tell the laboratory before the list starts.' },
];

/** The catalogue grouped for a picker, in the order the benches are listed. */
export function catalogueByDiscipline(): Array<{ discipline: LabDiscipline; tests: CatalogueTest[] }> {
  const order: LabDiscipline[] = [
    'HAEMATOLOGY', 'CHEMICAL_PATHOLOGY', 'MICROBIOLOGY_IMMUNOLOGY',
    'BLOOD_BANK', 'HISTOPATHOLOGY', 'OTHER',
  ];
  return order
    .map((discipline) => ({
      discipline,
      tests: TEST_CATALOGUE.filter((t) => t.discipline === discipline),
    }))
    .filter((g) => g.tests.length > 0);
}

/**
 * The category string stored on the investigation.
 *
 * PreoperativeInvestigation.testCategory is free text that predates the
 * discipline enum, and existing rows use words like HEMATOLOGY. The discipline
 * is written straight into it so old and new rows sort onto the same benches —
 * the mapping in disciplines.ts reads both spellings.
 */
export function categoryFor(test: CatalogueTest | { discipline: LabDiscipline }): string {
  return test.discipline;
}
