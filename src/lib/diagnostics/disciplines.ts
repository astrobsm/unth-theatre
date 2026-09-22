// ============================================================
// Which bench a test belongs to
// ------------------------------------------------------------
// The laboratory is not one queue. A haematology scientist verifying a full
// blood count, a chemical pathologist releasing electrolytes and a
// microbiologist reporting a culture are three people doing three jobs, and a
// worklist that shows all of it to all of them is a worklist nobody owns —
// everyone assumes somebody else has it.
//
// Tests arrive already labelled, but labelled three different ways: the
// emergency workup uses its own category enum, the elective investigation uses
// free text somebody typed, and a result uploaded directly names only itself.
// This maps all three onto one discipline so the bench sees its own work.
//
// WHEN IT CANNOT TELL, IT SAYS SO. An unrecognised test goes to OTHER and
// appears on a list somebody looks at, rather than being guessed into a
// discipline where it would sit unread until the case was cancelled for want
// of a result that was on the wrong screen all along.
// ============================================================

export type LabDiscipline =
  | 'HAEMATOLOGY'
  | 'CHEMICAL_PATHOLOGY'
  | 'MICROBIOLOGY_IMMUNOLOGY'
  | 'BLOOD_BANK'
  | 'HISTOPATHOLOGY'
  | 'OTHER';

export const LAB_DISCIPLINES: LabDiscipline[] = [
  'HAEMATOLOGY',
  'CHEMICAL_PATHOLOGY',
  'MICROBIOLOGY_IMMUNOLOGY',
  'BLOOD_BANK',
  'HISTOPATHOLOGY',
  'OTHER',
];

export const DISCIPLINE_LABEL: Record<LabDiscipline, string> = {
  HAEMATOLOGY: 'Haematology',
  CHEMICAL_PATHOLOGY: 'Chemical pathology',
  MICROBIOLOGY_IMMUNOLOGY: 'Microbiology and immunology',
  BLOOD_BANK: 'Blood bank',
  HISTOPATHOLOGY: 'Histopathology',
  OTHER: 'Other / unsorted',
};

/**
 * Which discipline each role answers for.
 *
 * A scientist sees their own bench. LABORATORY_STAFF and the technicians see
 * everything, because they receive samples for all of it and somebody has to
 * be able to find a specimen that was logged to the wrong bench.
 */
export const ROLE_DISCIPLINES: Record<string, LabDiscipline[] | 'ALL'> = {
  HAEMATOLOGY_SCIENTIST: ['HAEMATOLOGY', 'BLOOD_BANK'],
  CHEMICAL_PATHOLOGY_SCIENTIST: ['CHEMICAL_PATHOLOGY'],
  MICROBIOLOGY_SCIENTIST: ['MICROBIOLOGY_IMMUNOLOGY', 'HISTOPATHOLOGY'],
  BLOODBANK_STAFF: ['BLOOD_BANK'],
  LABORATORY_STAFF: 'ALL',
  LABORATORY_TECHNICIAN: 'ALL',
  EMERGENCY_LAB_SCIENTIST: 'ALL',
};

/** The benches this person works. Empty means they are not laboratory staff. */
export function disciplinesFor(role: string | null | undefined): LabDiscipline[] {
  const entry = ROLE_DISCIPLINES[(role ?? '').toUpperCase()];
  if (!entry) return [];
  return entry === 'ALL' ? LAB_DISCIPLINES.slice() : entry.slice();
}

/** May this person release a result on this bench? */
export function mayReport(role: string | null | undefined, discipline: string): boolean {
  return disciplinesFor(role).includes(discipline as LabDiscipline);
}

/**
 * Only a scientist verifies. A technician receives samples, runs the analyser
 * and enters a figure; releasing it as fit to operate on is a different act and
 * belongs to somebody qualified to be answerable for it.
 */
const VERIFYING_ROLES = [
  'HAEMATOLOGY_SCIENTIST', 'CHEMICAL_PATHOLOGY_SCIENTIST', 'MICROBIOLOGY_SCIENTIST',
  'EMERGENCY_LAB_SCIENTIST', 'LABORATORY_STAFF', 'BLOODBANK_STAFF',
];

export function mayVerify(role: string | null | undefined, discipline: string): boolean {
  const r = (role ?? '').toUpperCase();
  return VERIFYING_ROLES.includes(r) && mayReport(r, discipline);
}

/**
 * The category codes the emergency workup already uses, onto a discipline.
 *
 * Exhaustive over EmergencyLabTestCategory. RADIOLOGY and ECG are in that enum
 * and are not laboratory work at all; they map to OTHER rather than being
 * silently dropped, because a request filed under them still exists and still
 * needs somebody to see it.
 */
const CATEGORY_MAP: Record<string, LabDiscipline> = {
  HEMATOLOGY: 'HAEMATOLOGY',
  HAEMATOLOGY: 'HAEMATOLOGY',
  COAGULATION: 'HAEMATOLOGY',
  BIOCHEMISTRY: 'CHEMICAL_PATHOLOGY',
  BLOOD_GAS: 'CHEMICAL_PATHOLOGY',
  URINALYSIS: 'CHEMICAL_PATHOLOGY',
  MICROBIOLOGY: 'MICROBIOLOGY_IMMUNOLOGY',
  SEROLOGY: 'MICROBIOLOGY_IMMUNOLOGY',
  IMMUNOLOGY: 'MICROBIOLOGY_IMMUNOLOGY',
  CROSS_MATCH: 'BLOOD_BANK',
  HISTOPATHOLOGY: 'HISTOPATHOLOGY',
  RADIOLOGY: 'OTHER',
  ECG: 'OTHER',
  OTHER: 'OTHER',
  // The discipline values themselves. A request made through the investigation
  // screen stores the discipline as its category, and without these it would
  // come straight back as OTHER — the bench would never see its own work.
  CHEMICAL_PATHOLOGY: 'CHEMICAL_PATHOLOGY',
  MICROBIOLOGY_IMMUNOLOGY: 'MICROBIOLOGY_IMMUNOLOGY',
  BLOOD_BANK: 'BLOOD_BANK',
};

/**
 * Test names that identify a bench on their own.
 *
 * Matched on whole words, with the ordinary plural allowed, so "Electrolytes"
 * and "Liver function tests" match while "urea" still does not match
 * "urealyticum" — the word boundary is what stops a stem swallowing a longer
 * word. The list is short on purpose: it covers what a theatre actually
 * orders, and everything else goes to OTHER where a person sorts it.
 */
const NAME_HINTS: Array<{ re: RegExp; discipline: LabDiscipline }> = [
  { re: /\b(fbc|full blood count|packed cell volume|haemoglobin|hemoglobin|\bhb\b|platelet|wbc|pcv|haematocrit|erythrocyte sedimentation rate|esr|inr|\bpt\b|aptt|clotting|coagulation|sickling|genotype|blood film)(?:s|es)?\b/i, discipline: 'HAEMATOLOGY' },
  { re: /\b(u&e|urea|creatinine|electrolyte|sodium|potassium|chloride|bicarbonate|calcium|magnesium|phosphate|glucose|lft|liver function|bilirubin|albumin|protein|amylase|lipase|\balt\b|\bast\b|\balp\b|arterial blood gas|blood gas|lactate|troponin|lipid|cholesterol|hba1c|thyroid|\btsh\b|\bpsa\b)(?:s|es)?\b/i, discipline: 'CHEMICAL_PATHOLOGY' },
  { re: /\b(culture|sensitivity|\bm\/c\/s\b|mcs|microscopy|gram stain|zn stain|afb|\bhiv\b|hbsag|\bhcv\b|hepatitis|vdrl|serology|antibody|antigen|immunoglobulin|malaria|widal|covid|swab|urinalysis \(micro\)|wound swab)(?:s|es)?\b/i, discipline: 'MICROBIOLOGY_IMMUNOLOGY' },
  { re: /\b(group and (save|screen)|cross ?match|grouping|blood group|coombs|transfusion)(?:s|es)?\b/i, discipline: 'BLOOD_BANK' },
  { re: /\b(histology|histopathology|biopsy|cytology|frozen section|specimen)(?:s|es)?\b/i, discipline: 'HISTOPATHOLOGY' },
];

/**
 * The bench for a test, from whatever the caller happens to know.
 *
 * The explicit category wins where there is one — somebody chose it. The name
 * is only consulted when there is no category, or the category was the
 * catch-all, because a name is a guess and a chosen category is not.
 */
export function disciplineOf(input: {
  category?: string | null;
  testName?: string | null;
}): LabDiscipline {
  const cat = (input.category ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  const fromCategory = CATEGORY_MAP[cat];
  if (fromCategory && fromCategory !== 'OTHER') return fromCategory;

  const name = (input.testName ?? '').trim();
  if (name) {
    const hit = NAME_HINTS.find((h) => h.re.test(name));
    if (hit) return hit.discipline;
  }

  // A category that mapped to OTHER is still a choice somebody made; keep it
  // rather than returning the same value by a different route.
  return fromCategory ?? 'OTHER';
}

export const isDiscipline = (v: unknown): v is LabDiscipline =>
  typeof v === 'string' && (LAB_DISCIPLINES as string[]).includes(v);
