// ============================================================
// Procedure names — tidying them, and telling them apart
// ------------------------------------------------------------
// The booking form lets a surgeon add a procedure that is not in the list, and
// it is then in the list for everybody, forever. That is the useful part and
// also the dangerous part: without care the catalogue fills up with
//
//     Appendicectomy
//     appendicectomy
//     Appendectomy
//     APPENDICECTOMY
//
// and the dropdown becomes worse than the free-text box it replaced.
//
// So every name is reduced to a SLUG for comparison — lowercased, accents
// folded, punctuation dropped, spacing collapsed, and a small set of spelling
// variants unified. Two names with the same slug are the same procedure, and
// the database's unique constraint on (subspecialty, slug) refuses the second.
//
// The DISPLAY name is kept as the person typed it, minus obvious tidying. We
// correct spacing and stray punctuation; we do not correct clinicians.
// ============================================================

/**
 * British and American spellings of the same operation, plus the handful of
 * abbreviations that are genuinely universal in a Nigerian theatre.
 *
 * Only entries that unambiguously mean one thing. "TAH" is a total abdominal
 * hysterectomy everywhere; "AP" could be several things and is not here.
 */
const SYNONYMS: Record<string, string> = {
  appendectomy: 'appendicectomy',
  oesophagectomy: 'esophagectomy',
  oesophagoscopy: 'esophagoscopy',
  oesophagus: 'esophagus',
  haemorrhoidectomy: 'hemorrhoidectomy',
  haematoma: 'hematoma',
  haemorrhage: 'hemorrhage',
  paediatric: 'pediatric',
  orthopaedic: 'orthopedic',
  anaesthesia: 'anesthesia',
  caesarean: 'cesarean',
  caesarian: 'cesarean',
  cesarian: 'cesarean',
  // Shorthand a theatre uses out loud every day.
  cs: 'cesarean section',
  eua: 'examination under anesthesia',
  ercp: 'endoscopic retrograde cholangiopancreatography',
  turp: 'transurethral resection prostate',
  turbt: 'transurethral resection bladder tumour',
  tah: 'total abdominal hysterectomy',
  orif: 'open reduction internal fixation',
  evd: 'external ventricular drain',
  vp: 'ventriculoperitoneal',
};

/**
 * Multi-word shorthand, matched as whole phrases.
 *
 * NOTE what is deliberately absent from SYNONYMS above: single letters.
 * Mapping "d" to "dilatation" so that "D&C" folds correctly would also turn
 * "Type C repair" into "Type curettage repair".
 *
 * The word boundaries here are load-bearing for the same reason. Without the
 * leading one, the first pattern matches the "d ... c" inside "debridement
 * and closure" and rewrites the middle of the phrase.
 */
const PHRASES: [RegExp, string][] = [
  [/\bd\s*(?:and|&|\+)?\s*c\b/g, 'dilatation curettage'],
  [/\bi\s*(?:and|&|\+)\s*d\b/g, 'incision drainage'],
];

/** Words that carry no meaning for comparison. */
const NOISE = new Set(['the', 'of', 'a', 'an', 'and', 'with', 'for', 'to']);

/**
 * Strip accents and anything that is not a letter, digit or space.
 *
 * Digits and roman numerals are KEPT — "Type II" and "Type III" tympanoplasty
 * are different operations, and folding the numbers away would silently merge
 * them into one catalogue entry.
 */
function fold(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The comparison key for a procedure name.
 *
 * Deliberately aggressive: it exists to catch the same operation typed twice,
 * not to be reversible. Never show it to anybody.
 */
export function procedureSlug(name: string): string {
  let folded = fold(name);
  for (const [pattern, replacement] of PHRASES) folded = folded.replace(pattern, replacement);

  const words = folded
    .split(' ')
    .map((w) => SYNONYMS[w] ?? w)
    .join(' ')
    .split(' ')
    .filter((w) => w && !NOISE.has(w));

  // A trailing plural adds nothing: "hernia repairs" is "hernia repair".
  const singular = words.map((w) =>
    w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w
  );

  return singular.join('-');
}

/** Do two names refer to the same procedure? */
export function isSameProcedure(a: string, b: string): boolean {
  const slug = procedureSlug(a);
  return slug !== '' && slug === procedureSlug(b);
}

/**
 * Tidy a name for display without editing the clinician's words.
 *
 * Collapses whitespace, trims stray punctuation at the ends, and fixes a name
 * typed entirely in capitals — hospital forms produce a lot of shouting and it
 * is hard to read in a dropdown. Mixed case is left exactly alone, because a
 * surgeon who wrote "EUA and biopsy" meant those capitals.
 */
export function tidyProcedureName(input: string): string {
  const collapsed = (input || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^\w(]+/, '')
    .replace(/[^\w)]+$/, '');

  const letters = collapsed.replace(/[^a-zA-Z]/g, '');
  const allCaps = letters.length >= 4 && letters === letters.toUpperCase();
  if (!allCaps) return collapsed;

  return collapsed
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    // Roman numerals read wrongly after title-casing: "Type Ii" -> "Type II".
    .replace(/\b(i{1,3}|iv|vi{0,3}|ix|xi{0,2})\b/gi, (m) => m.toUpperCase());
}

export interface NameCheck {
  ok: boolean;
  error?: string;
}

export const MIN_NAME_LENGTH = 4;
export const MAX_NAME_LENGTH = 160;

/** Answers to the form rather than names of operations. */
const NON_ANSWERS = /^(other|others|misc|miscellaneous|nil|none|n\/?a|na|unknown|tbd|test|surgery|operation|procedure)$/i;

/**
 * Is this fit to go into the catalogue for everybody else?
 *
 * Stricter than a free-text box would be, deliberately. A free-text entry is
 * one surgeon's record of one case; a catalogue entry is a choice every
 * surgeon after them will be offered.
 */
export function checkProcedureName(input: string): NameCheck {
  const tidy = tidyProcedureName(input);

  if (!tidy) return { ok: false, error: 'Enter the name of the procedure.' };
  if (tidy.length < MIN_NAME_LENGTH) {
    return {
      ok: false,
      error: `That is too short to be a procedure name (at least ${MIN_NAME_LENGTH} characters).`,
    };
  }
  if (tidy.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      error: `That is too long for a procedure name (at most ${MAX_NAME_LENGTH} characters).`,
    };
  }
  if (!/[a-zA-Z]{3}/.test(tidy)) {
    return { ok: false, error: 'A procedure name needs actual words.' };
  }
  if (!procedureSlug(tidy)) {
    return { ok: false, error: 'That does not read as a procedure name.' };
  }
  if (NON_ANSWERS.test(tidy)) {
    return { ok: false, error: 'Name the actual procedure — this goes into the list for everyone.' };
  }
  return { ok: true };
}

/**
 * Rank catalogue entries for a dropdown: most-used first, then alphabetical.
 *
 * A theatre does twenty operations most of the time and four hundred rarely.
 * Sorting purely alphabetically buries the twenty and makes the dropdown feel
 * worse than the typing it replaced.
 */
export function pickerOrder<T extends { name: string; usageCount: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.usageCount !== b.usageCount) return b.usageCount - a.usageCount;
    return a.name.localeCompare(b.name);
  });
}

/** Match a typed fragment against a name, ignoring case and punctuation. */
export function matchesQuery(name: string, query: string): boolean {
  const q = fold(query);
  if (!q) return true;
  const haystack = fold(name);
  return q.split(' ').every((term) => haystack.includes(term));
}
