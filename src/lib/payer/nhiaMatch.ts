// ============================================================
// Matching this hospital's catalogue to the NHIA list
// ------------------------------------------------------------
// CONSERVATIVE ON PURPOSE, and this is the whole design. A wrong match marks
// an item covered that is not, which sends it to a counter that will refuse
// it with the patient already on the list — and the patient is then told at
// the theatre door that they must buy it after all. An unmatched item simply
// stays as it is: routed where it goes today, flagged for the NHIA desk to
// look at. One failure is a wasted minute; the other is a cancelled case.
//
// So: an EXACT normalised name, or a spelling this file names explicitly.
// Nothing else. There is no fuzzy scoring, no "closest match", no substring
// rule — "Ceftriaxone/Sulbactam" must not match "Ceftriaxone", and
// "Amoxycillin plus Clavulanic Acid" must not match "Amoxycillin".
//
// WHAT NORMALISATION DOES AND DOES NOT DO. It lowercases, removes
// punctuation, and strips the dosage-form words a catalogue tacks onto a
// name ("Ceftriaxone injection" and "Ceftriaxone" are one drug). It does NOT
// strip strengths: "Ceftriaxone 1g" and "Ceftriaxone 250mg" are different
// lines at different prices, and the strength lives in its own column here.
// ============================================================

import { NHIA_PRICE_LIST, type NhiaItem } from './nhiaPriceList';

/** Words a catalogue appends to a drug name that the NHIA list keeps apart. */
const FORM_WORDS = new Set([
  'injection', 'inj', 'tablet', 'tablets', 'tab', 'tabs', 'capsule', 'capsules',
  'caps', 'cap', 'syrup', 'suspension', 'solution', 'infusion', 'ampoule', 'amp',
  'vial', 'sachet', 'suppository', 'pessary', 'cream', 'ointment', 'gel', 'drops',
  'spray', 'powder', 'iv', 'im', 'oral',
]);

/**
 * The same medicine under another name.
 *
 * EVERY ENTRY IS A CLINICAL EQUIVALENCE SOMEBODY CAN CHECK, not a convenience.
 * Left is what a catalogue here might say; right is the NHIA list's spelling.
 * British and American spellings, the two names for adrenaline, and the
 * Nigerian theatre's habitual shorthand.
 */
export const NHIA_ALIASES: Record<string, string> = {
  // Spelling
  amoxicillin: 'amoxycillin',
  lignocaine: 'lidocaine',
  xylocaine: 'lidocaine',
  acetaminophen: 'paracetamol',
  cetirizine: 'cetrizine',
  gentamicin: 'gentamycin',
  epinephrine: 'epinephrine adrenaline',
  adrenaline: 'epinephrine adrenaline',
  noradrenaline: 'epinephrine adrenaline',
  phytomenadione: 'phytomenadione vitamin k1',
  'vitamin k': 'phytomenadione vitamin k1',
  'vitamin k1': 'phytomenadione vitamin k1',
  // Theatre shorthand
  scoline: 'suxamethonium',
  succinylcholine: 'suxamethonium',
  'normal saline': 'sodium chloride',
  saline: 'sodium chloride',
  'n saline': 'sodium chloride',
  'hartmanns solution': 'ringers lactate',
  hartmanns: 'ringers lactate',
  'ringer lactate': 'ringers lactate',
  'ringers lactate solution': 'ringers lactate',
  'dextrose saline': 'dextrose sodium chloride',
  'darrows solution': 'darrows solution',
  'water for inj': 'water for injection',
  wfi: 'water for injection',
  // Products named for what they are
  'examination gloves': 'latex examination gloves',
  'latex gloves': 'latex examination gloves',
  'surgical glove': 'surgical gloves',
  'urinary catheter': 'foleys catheter',
  'foley catheter': 'foleys catheter',
  'nasogastric tube': 'ng tube',
  'giving set': 'infusion set',
  'branula': 'iv cannula',
  cannula: 'iv cannula',
};

/** Lowercase, strip punctuation and dosage-form words; keep strengths. */
export function normaliseDrugName(raw: string | null | undefined): string {
  const base = String(raw ?? '')
    .toLowerCase()
    // Apostrophes are REMOVED, not spaced: "Ringer's lactate" is two
    // words, not three, and "ringer s lactate" matches nothing anybody
    // would ever type into a catalogue.
    .replace(/['’`]/g, '')
    .replace(/[(),.;:/\\[\]{}"]/g, ' ')
    .replace(/[+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (base === '') return '';
  const kept = base.split(' ').filter((w) => !FORM_WORDS.has(w));
  // A name that is NOTHING but form words ("injection") keeps its words, so
  // it fails to match rather than matching the empty string.
  return (kept.length ? kept : base.split(' ')).join(' ').trim();
}

export type MatchHow = 'EXACT' | 'ALIAS' | 'NONE';

export interface NhiaMatch {
  how: MatchHow;
  item: NhiaItem | null;
  /** Where one name matches several list rows — different strengths of the
   *  same drug. The caller picks, or leaves it for a person. */
  alternatives: NhiaItem[];
}

const NO_MATCH: NhiaMatch = { how: 'NONE', item: null, alternatives: [] };

/** Built once: normalised NHIA name -> the rows under it. */
const BY_NAME: Map<string, NhiaItem[]> = (() => {
  const m = new Map<string, NhiaItem[]>();
  for (const item of NHIA_PRICE_LIST) {
    const key = normaliseDrugName(item.name);
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(item);
  }
  return m;
})();

/**
 * The NHIA row for a catalogue item, or nothing.
 *
 * `strength` narrows between rows of one drug where the caller has it. It is
 * compared loosely — "500mg" against "500mg in 100ml bottle" — because the
 * list writes a strength as a sentence and a catalogue writes it as a token.
 * Where it does not narrow to one, every candidate is returned and the
 * decision is a person's.
 */
export function matchNhia(
  name: string | null | undefined,
  strength?: string | null,
): NhiaMatch {
  const key = normaliseDrugName(name);
  if (key === '') return NO_MATCH;

  let how: MatchHow = 'EXACT';
  let rows = BY_NAME.get(key);

  if (!rows) {
    const alias = NHIA_ALIASES[key];
    if (alias) {
      rows = BY_NAME.get(normaliseDrugName(alias));
      how = 'ALIAS';
    }
  }
  if (!rows || rows.length === 0) return NO_MATCH;
  if (rows.length === 1) return { how, item: rows[0], alternatives: rows };

  const want = String(strength ?? '').toLowerCase().replace(/\s+/g, '');
  if (want !== '') {
    const narrowed = rows.filter((r) => {
      const have = String(r.strength ?? '').toLowerCase().replace(/\s+/g, '');
      return have !== '' && (have.includes(want) || want.includes(have));
    });
    if (narrowed.length === 1) return { how, item: narrowed[0], alternatives: rows };
  }

  // Several strengths and nothing to choose between them. The CHEAPEST is
  // returned so an automatic run never overstates what the scheme owes, and
  // every candidate is handed back so a person can correct it.
  const cheapest = [...rows].sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0];
  return { how, item: cheapest, alternatives: rows };
}

/** True where the scheme pays something towards this item. */
export function isCoveredByNhia(m: NhiaMatch): boolean {
  return !!m.item && (m.item.coverage === 'FULL' || m.item.coverage === 'PARTIAL');
}
