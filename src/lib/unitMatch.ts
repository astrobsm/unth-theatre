/**
 * Deciding whether two spellings mean the same surgical unit.
 *
 * The hospital writes a unit's name three different ways depending on which
 * screen you are standing in front of.
 *
 *   surgical_units (the registry, and what a booked case carries)
 *       "O&G Firm 2"   "GS Unit I"   "Neuro Unit III"   "CTU Unit I"
 *
 *   the theatre allocation form
 *       "O/G FIRM 2"   "GENERAL SURGERY UNIT 1"   "NEUROSURGERY UNIT 3"   "CTU 1"
 *
 *   free text, typed by whoever was on the phone
 *       "O and G firm 2"   "Gen Surg 1"
 *
 * Not one value in the first two lists is equal to its counterpart in the
 * other, so a strict `a === b` between an allocation and a case matched
 * NOTHING: the theatre manager allocated a scrub nurse to O/G Firm 2 and the
 * unit's card went on saying "Nursing — not yet assigned" all morning.
 *
 * The fix is a key rather than a rename. Renaming loses history — every
 * allocation already written keeps the spelling it was written with — and a
 * key repairs those rows on read, today, with no migration.
 *
 * A key is `<specialty> <distinguishing words> <number>`:
 *
 *   "O&G Firm 2"              -> "og 2"
 *   "O/G FIRM 2"              -> "og 2"
 *   "GS Unit I"               -> "gs 1"
 *   "GENERAL SURGERY UNIT 1"  -> "gs 1"
 *   "Monday Unit (Ophthalmology)" -> "ophthal monday"
 *
 * The number is normalised across roman and arabic because the registry counts
 * general surgery in roman and the form counts it in arabic. The
 * distinguishing words are kept for the units that have no number — the
 * ophthalmology lists are named by weekday, and collapsing them all to
 * "ophthal" would hand Monday's nurses to Thursday's patients.
 */

/**
 * Long specialty names and their registry abbreviations, most specific first.
 *
 * General surgery is LAST on purpose. It is the only entry whose bare
 * abbreviation is likely to appear inside another unit's words, and matching
 * it early would file "Paediatric Surgery" under general surgery.
 */
const SPECIALTY_ALIASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bo\s*[&/+]\s*g\b|\bo\s+and\s+g\b|\bobs?\s*(?:and|&)\s*gyn\w*|\bobstetric\w*|\bgyn(?:a)?ecolog\w*/, 'og'],
  [/\bcardio\s*-?\s*thoracic\w*|\bctu\b|\bcts\b/, 'ctu'],
  [/\bneuro\s*-?\s*surg\w*|\bneuro\b/, 'neuro'],
  [/\bpa?ed(?:iatric|o)\w*\s*surg\w*|\bpaedo\b|\bpa?eds?\b/, 'paedo'],
  [/\bplastic\w*(?:\s*(?:and|&)\s*reconstructive)?\s*surg\w*|\bps\b/, 'ps'],
  [/\borthop(?:a)?edic\w*|\bortho\b/, 'ortho'],
  [/\bmaxillo\s*-?\s*facial\w*|\bmaxillo\b|\bomfs\b/, 'maxillo'],
  [/\burolog\w*|\buro\b/, 'uro'],
  [/\bophthalmolog\w*|\bophthal\w*/, 'ophthal'],
  [/\bent\b|\botorhinolaryngolog\w*/, 'ent'],
  [/\bgeneral\s*surg\w*|\bgen\s*surg\w*|\bgs\b/, 'gs'],
];

/**
 * Words that carry no identity. "GS Unit I" and "GS I" are the same unit; so
 * are "CTU 1" and "CTU Unit I", which is the whole reason "unit" is dropped
 * rather than kept as a distinguishing word.
 */
const NOISE = new Set([
  'unit', 'units', 'firm', 'firms', 'team', 'teams',
  'theatre', 'theater', 'suite', 'room', 'list',
  'surgery', 'surgical', 'service', 'no', 'number', 'the', 'and', 'of',
]);

const ROMAN: Readonly<Record<string, number>> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
  xi: 11, xii: 12,
};

/**
 * The comparable identity of a unit name, or null when there is nothing to
 * compare. Two names naming the same unit produce the same key.
 */
export function unitKey(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // Punctuation is spelling, not identity: "O&G", "O/G" and "O and G" are one
  // unit written by three people.
  let rest = raw.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!rest) return null;

  // Re-join the ampersand/slash forms that the substitution above split into
  // two single letters, so "o g firm 2" is still recognised as O&G.
  rest = rest.replace(/\bo\s+g\b/g, 'og');

  let specialty: string | null = null;
  for (const [pattern, token] of SPECIALTY_ALIASES) {
    const m = rest.match(pattern);
    if (!m) continue;
    specialty = token;
    rest = (rest.slice(0, m.index) + ' ' + rest.slice(m.index! + m[0].length)).trim();
    break;
  }
  // "og" survives the punctuation strip as a word of its own and no alias
  // pattern above will have consumed it in that form.
  if (specialty === null && /\bog\b/.test(rest)) {
    specialty = 'og';
    rest = rest.replace(/\bog\b/, ' ').trim();
  }

  let number: number | null = null;
  const words: string[] = [];
  for (const word of rest.split(/\s+/).filter(Boolean)) {
    if (NOISE.has(word)) continue;
    if (/^\d+$/.test(word)) { number = parseInt(word, 10); continue; }
    if (word in ROMAN) { number = ROMAN[word]; continue; }
    words.push(word);
  }

  const parts = [
    ...(specialty ? [specialty] : []),
    ...words,
    ...(number === null ? [] : [String(number)]),
  ];
  return parts.length ? parts.join(' ') : null;
}

/** Do these two names mean the same surgical unit? */
export function sameUnit(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  if (a.trim() === b.trim()) return true;
  const ka = unitKey(a);
  const kb = unitKey(b);
  return ka !== null && ka === kb;
}

/**
 * Pick the entry whose unit name means `unit`, exact spelling preferred.
 *
 * Exact first so that a hospital which does spell both sides the same way is
 * never subject to the fuzzier key — the key is a repair for the mismatch, not
 * a replacement for agreement.
 */
export function findByUnit<T>(
  items: readonly T[],
  unit: string,
  nameOf: (item: T) => string | null | undefined,
): T | undefined {
  const exact = items.find((i) => (nameOf(i) ?? '').trim() === unit.trim());
  if (exact) return exact;
  const key = unitKey(unit);
  if (!key) return undefined;
  return items.find((i) => unitKey(nameOf(i)) === key);
}
