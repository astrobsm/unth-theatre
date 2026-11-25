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
  // Combinations, which a catalogue writes one way and the Authority another.
  'amoxicillin clavulanate': 'amoxycillin plus clavulanic acid co amoxiclav',
  'amoxycillin clavulanate': 'amoxycillin plus clavulanic acid co amoxiclav',
  'co amoxiclav': 'amoxycillin plus clavulanic acid co amoxiclav',
  'augmentin': 'amoxycillin plus clavulanic acid co amoxiclav',
  'fortum': 'ceftazidime',
  'furosemide': 'frusemide',
  'lasix': 'frusemide',
  'dextrose water': 'glucose dextrose',
  'dextrous water': 'glucose dextrose',
  'dextrose': 'glucose dextrose',
  'glucose': 'glucose dextrose',
  'd w': 'glucose dextrose',
  'dextrous saline': 'dextrose sodium chloride',
  'd s': 'dextrose sodium chloride',
  'darrow': 'darrows solution',
  'kcl': 'potassium chloride',
  'sofratulle gauze': 'framycetin',
  'sofratulle': 'framycetin',
  'sulfratulle gauze': 'framycetin',
  'bactigras': 'framycetin',
  'silver sulfadiazine cream': 'silver sulphadiazine',
  'silver sulfadiazine': 'silver sulphadiazine',
  'dermazine cream': 'silver sulphadiazine',
  'dermazine': 'silver sulphadiazine',
  'otrivine xylometazoline': 'xylometazoline',
  'otrivine': 'xylometazoline',
  'gentamicin ear eye cream': 'gentamicin',
  'plain xylocaine lidocaine 2 plain urology': 'lidocaine',
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
    // Hyphen and plus become spaces, so "Povidone-iodine" and "Povidone
    // iodine" are one name and "Co-trimoxazole" survives on both sides.
    .replace(/[-+\u2013\u2014]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (base === '') return '';
  const kept = base.split(' ').filter((w) => !FORM_WORDS.has(w));
  // A name that is NOTHING but form words ("injection") keeps its words, so
  // it fails to match rather than matching the empty string.
  return (kept.length ? kept : base.split(' ')).join(' ').trim();
}


/**
 * Pulling the medicine out of a catalogue line.
 *
 * THIS IS WHERE THE MATCH RATE LIVES. A catalogue here does not say
 * "Paracetamol". It says "Paracetamol 1 g IV (100 ml) (1 g IV)", because the
 * line was written to be read by a nurse at a trolley. The NHIA list says
 * "Paracetamol" with the strength in its own column, because it was written
 * to be read by an accountant. Measured on this hospital's catalogue, 19 of
 * 90 pharmacy items matched before this function existed.
 *
 * THE STRENGTH IS NOT THROWN AWAY, it is moved. Everything stripped out of
 * the name is handed back as a strength hint and used to choose between
 * rows of the same drug -- which is the only safe way to do this, because
 * "Ceftriaxone 1g" and "Ceftriaxone 250mg" are different lines at different
 * prices.
 *
 * WHAT IT REFUSES TO DO is touch a word that could be part of a drug's name.
 * Only bracketed asides, and tokens that are a NUMBER followed by a unit,
 * are removed. "Vitamin B Complex" keeps its B; "Lidocaine 2%" loses only
 * the 2%.
 */
/** A unit, standing alone. "1 g" is two tokens; "1g" is one. Both go. */
const UNIT_WORD = new Set([
  '%', 'mg', 'mcg', 'g', 'kg', 'ml', 'mls', 'l', 'litre', 'litres', 'iu',
  'unit', 'units', 'mmol', 'mu', 'w/v', 'v/v', 'strength',
]);
const NUMBER = /^\d+(?:[.,]\d+)?%?$/;
const NUMBER_WITH_UNIT =
  /^\d+(?:[.,]\d+)?\s*(?:%|mg|mcg|g|kg|ml|mls|l|litre|litres|iu|units?|mmol|mu)$/;
const DOSE_WORDS = new Set([
  'stat', 'daily', 'bd', 'tds', 'qds', 'prn', 'per', 'case', 'max', 'titrate',
  'apply', 'topically', 'cycles', 'min', 'each', 'bp', 'bpc',
]);

export function splitNameAndStrength(
  raw: string | null | undefined,
): { name: string; strength: string } {
  const text = String(raw ?? '');
  // Everything in brackets is an aside: a presentation, a dose, an
  // instruction. None of it is the medicine's name.
  const asides: string[] = [];
  const withoutAsides = text.replace(/\(([^()]*)\)/g, (_m, inner: string) => {
    asides.push(String(inner));
    return ' ';
  });

  const words = withoutAsides.split(/[\s/]+/).map((w) => w.trim()).filter(Boolean);
  const kept: string[] = [];
  const dropped: string[] = [];
  for (let i = 0; i < words.length; i += 1) {
    const bare = words[i].replace(/[(),.;:]+$/g, '');
    const low = bare.toLowerCase();
    const nextLow = (words[i + 1] ?? '').replace(/[(),.;:]+$/g, '').toLowerCase();

    // "1 g", "1.2 g", "100 ml" — a number and the unit after it, together.
    if (NUMBER.test(low) && UNIT_WORD.has(nextLow)) {
      dropped.push(bare, words[i + 1]);
      i += 1;
      continue;
    }
    if (NUMBER_WITH_UNIT.test(low) || NUMBER.test(low)) { dropped.push(bare); continue; }
    if (DOSE_WORDS.has(low)) { dropped.push(bare); continue; }
    kept.push(words[i]);
  }

  // A line that is NOTHING but numbers and units keeps its original text, so
  // it fails to match rather than matching the empty string.
  const name = kept.join(' ').trim() || text.trim();
  return { name, strength: [...dropped, ...asides].join(' ').trim() };
}


/**
 * Which dosage form a catalogue line is talking about.
 *
 * WHY THIS MATTERS MORE THAN THE STRENGTH. The first run matched
 * "Frusemide 20 mg / 2 ml (Ampoule)" to the 40mg TABLET at twenty-nine naira,
 * and "Diclofenac 75 mg IM (Ampoule)" to the 50mg tablet at thirty-five.
 * Right drug, right coverage, wrong row -- and the row carries the price the
 * NHIA desk reads. A strength that does not line up falls back to the
 * cheapest row, and the cheapest row is almost always the tablet.
 *
 * The words below are the ones stripped out of the name by
 * normaliseDrugName, which is exactly why they have to be read off the
 * ORIGINAL text before that happens.
 */
const FORM_HINTS: Array<[RegExp, string[]]> = [
  [/\b(injection|inj|i\.?v|i\.?m|ampoule|amp|vial)\b/i, ['injection', 'ampoule', 'vial', 'amp']],
  [/\b(infusion|drip)\b/i, ['infusion']],
  [/\b(nebule|nebuliser|nebulizer)\b/i, ['nebule']],
  [/\b(suppositor\w*)\b/i, ['suppository', 'supp']],
  [/\b(pessar\w*|ovule)\b/i, ['pessary', 'ovule']],
  [/\b(cream|ointment|gel|paste)\b/i, ['cream', 'ointment', 'gel', 'tube']],
  [/\b(gauze|dressing)\b/i, ['gauze', 'dressing']],
  [/\b(eye|ear|nasal)\s*drops?\b/i, ['drops']],
  [/\b(spray|aerosol|inhal\w*)\b/i, ['spray', 'inhalation', 'aerosol']],
  [/\b(syrup|suspension|elixir|solution|mixture)\b/i, ['syrup', 'suspension', 'solution', 'mixture']],
  [/\b(capsule|caps)\b/i, ['capsule', 'caps']],
  [/\b(tablet|tabs?)\b/i, ['tablet', 'tab']],
];

export function formHint(raw: string | null | undefined): string[] {
  const text = String(raw ?? '');
  for (const [re, words] of FORM_HINTS) if (re.test(text)) return words;
  return [];
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
  const whole = normaliseDrugName(name);
  if (whole === '') return NO_MATCH;

  // THREE ATTEMPTS, narrowest first, and none of them guesses.
  //   1. the name exactly as the catalogue writes it
  //   2. that name under a spelling this file knows
  //   3. the name with its strengths and bracketed asides moved aside
  // The third is what makes "Paracetamol 1 g IV (100 ml)" find paracetamol,
  // and the strength it removed is used below to choose between rows.
  const split = splitNameAndStrength(name);
  const stripped = normaliseDrugName(split.name);
  const hint = [strength ?? '', split.strength].join(' ').trim();

  // CANDIDATES FROM EVERY ROUTE, UNIONED, and then narrowed. Taking the
  // first route that returns anything was wrong in a way the Authority's own
  // document causes: it spells the gentamicin INJECTION "Gentamycin" at
  // 6.7 and the ointment "Gentamicin" at 14.1. An exact match on the
  // catalogue's "Gentamicin 80 mg (Ampoule)" therefore found the ointment
  // and stopped, and never tried the alias that leads to the injection.
  // An alias asserts the two names are the same drug, so rows reached
  // through it belong in the same pile, and the strength decides.
  const candidates = new Map<string, NhiaItem>();
  let how: MatchHow = 'NONE';
  const take = (rows: NhiaItem[] | undefined, via: MatchHow) => {
    if (!rows) return;
    for (const r of rows) if (!candidates.has(r.code)) candidates.set(r.code, r);
    if (how === 'NONE' || (how === 'ALIAS' && via === 'EXACT')) how = via;
  };

  take(BY_NAME.get(whole), 'EXACT');
  if (NHIA_ALIASES[whole]) take(BY_NAME.get(normaliseDrugName(NHIA_ALIASES[whole])), 'ALIAS');
  if (stripped !== whole) {
    take(BY_NAME.get(stripped), 'EXACT');
    if (NHIA_ALIASES[stripped]) take(BY_NAME.get(normaliseDrugName(NHIA_ALIASES[stripped])), 'ALIAS');
  }

  let rows = Array.from(candidates.values());
  if (rows.length === 0) return NO_MATCH;
  if (rows.length === 1) return { how, item: rows[0], alternatives: rows };

  // ── FORM FIRST, then strength ──────────────────────────────────────────
  // An ampoule is not a tablet. Where the line says which it is and some
  // candidate says the same, the others are not candidates at all -- and
  // that is decided BEFORE the cheapest-row fallback, which is what put
  // frusemide ampoules on a twenty-nine-naira tablet.
  const wantedForms = formHint(name);
  if (wantedForms.length) {
    const sameForm = rows.filter((r) => {
      const said = [r.form, r.presentation].filter(Boolean).join(' ').toLowerCase();
      return said !== '' && wantedForms.some((w) => said.includes(w));
    });
    if (sameForm.length === 1) return { how, item: sameForm[0], alternatives: rows };
    if (sameForm.length > 1) rows = sameForm;
  }

  // Narrowed against the strength AND the form and presentation, because
  // "80 mg (Ampoule)" tells the two gentamicins apart where the strength
  // alone does not.
  const want = hint.toLowerCase().replace(/\s+/g, '');
  if (want !== '') {
    const describes = (r: NhiaItem) =>
      [r.strength, r.form, r.presentation].filter(Boolean).join(' ')
        .toLowerCase().replace(/\s+/g, '');
    // SCORED, NOT FILTERED. Filtering on "any hint word appears" kept both
    // the 750mg and the 250mg cefuroxime vial, because both say "vial", and
    // the cheapest-row fallback then chose the 250. Counting how many of the
    // hint's words a row accounts for lets "750" break that tie, which is
    // the whole reason the strength was carried this far.
    const words = hint.toLowerCase().split(/[\s/]+/)
      .map((w) => w.replace(/[(),.;:]/g, ''))
      .filter((w) => w.length > 1);
    const score = (r: NhiaItem) => {
      const have = describes(r);
      if (have === '') return -1;
      if (have.includes(want) || want.includes(have)) return 1000;
      return words.filter((w) => have.includes(w)).length;
    };
    const best = Math.max(...rows.map(score));
    if (best > 0) {
      const narrowed = rows.filter((r) => score(r) === best);
      if (narrowed.length === 1) return { how, item: narrowed[0], alternatives: rows };
      const cheapestOf = [...narrowed].sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0];
      return { how, item: cheapestOf, alternatives: rows };
    }
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
