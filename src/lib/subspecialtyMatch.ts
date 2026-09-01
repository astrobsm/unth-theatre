// ============================================================
// Matching a surgeon's department to a surgery's subspecialty
// ------------------------------------------------------------
// These are two different vocabularies for the same idea, and nobody ever sat
// down and reconciled them. Staff records say "Surgery (Ophthalmic)"; bookings
// say "Ophthalmology". Of the eleven subspecialties, exactly one — Obstetrics
// & Gynaecology — is spelled the same way in both.
//
// So filtering the surgeon dropdown on string equality would empty it for ten
// of eleven subspecialties, and a booking screen with no selectable surgeon is
// worse than one with too many. Hence a real mapping, kept pure and tested.
//
// Keyword-based rather than a fixed lookup table, because departments are
// free text on the user record: somebody will type "Surgery (Paediatric) Unit
// II" one day, and that should still land on Paediatric Surgery instead of
// silently matching nothing.
// ============================================================

import { SUBSPECIALTIES, type Subspecialty } from '@/lib/procedures/catalogue';

/**
 * Distinctive tokens per subspecialty, MOST SPECIFIC FIRST.
 *
 * Order is load-bearing. "Surgery (Paediatric)" contains both "paediatric" and
 * "surgery"; listing Paediatric above General is what stops every paediatric
 * surgeon being filed under General Surgery.
 *
 * Tokens are matched against a normalised string (lowercased, punctuation
 * flattened to spaces), so "Plastic / Reconstructive" becomes
 * "plastic reconstructive" and matches on either half.
 */
// The short unit abbreviations — 'gs', 'uro', 'paedo', 'maxillo' — are how the
// theatre lists name a firm: "GS Unit II", "Paedo Unit I", "Uro Unit I". 28 of
// the 568 cases booked in the last sixty days are spelled that way, and without
// these they resolve to nothing, so a case shows as having no anaesthetist and
// no technician while both are rostered. 'gs' and 'uro' are short enough that
// hasToken requires a whole word, so "neuro" cannot match "uro".
const TOKENS: ReadonlyArray<readonly [Subspecialty, readonly string[]]> = [
  ['Obstetrics & Gynaecology', ['obstetric', 'gynaec', 'gynec', 'o g', 'og']],
  ['Cardiothoracic Surgery', ['cardiothoracic', 'cardio', 'thoracic']],
  ['Maxillofacial Surgery', ['maxillofacial', 'maxfax', 'oral maxillo', 'maxillo']],
  ['Paediatric Surgery', ['paediatric', 'pediatric', 'paeds', 'paedo', 'pedo']],
  ['Plastic Surgery', ['plastic', 'reconstruct', 'burns']],
  ['Orthopaedics', ['orthopaedic', 'orthopedic', 'orthopa', 'ortho', 'trauma']],
  ['Ophthalmology', ['ophthalm', 'eye']],
  ['Neurosurgery', ['neuro']],
  ['Urology', ['urolog', 'uro']],
  ['ENT (Otorhinolaryngology)', ['otorhino', 'otolaryng', 'ent']],
  ['General Surgery', ['general', 'gs']],
];

/**
 * Lowercase, and flatten anything that is not a letter or digit to a single
 * space — brackets, slashes, ampersands and hyphens are all just noise here.
 * Padded with spaces so a token can be matched at a word boundary.
 */
function normalise(s: string): string {
  return ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

/**
 * "ent" is the dangerous one: it is a substring of "department", "dental" and
 * a dozen other words. Short tokens must match a whole word; longer ones may
 * match a prefix, so "orthopaedics" and "orthopaedic" both work.
 */
function hasToken(haystack: string, token: string): boolean {
  const t = normalise(token).trim();
  if (t.length <= 3) return haystack.includes(` ${t} `);
  return haystack.includes(t);
}

/**
 * The canonical subspecialty for a department string, or null when it does not
 * correspond to one — "Other", "Anaesthesia", an empty field.
 *
 * Null means "we do not know", NOT "no match" — callers must not use it to
 * hide somebody. See surgeonMatchesSubspecialty.
 */
export function canonicalSubspecialty(
  department: string | null | undefined,
): Subspecialty | null {
  if (!department) return null;
  const hay = normalise(department);
  if (hay.trim() === '') return null;

  for (const [subspecialty, tokens] of TOKENS) {
    for (const token of tokens) {
      if (hasToken(hay, token)) return subspecialty;
    }
  }
  return null;
}

/**
 * Should this surgeon appear when this subspecialty is selected?
 *
 * Deliberately generous in two directions:
 *
 *  - No subspecialty chosen yet — everybody shows. The filter narrows a list;
 *    it does not gate one.
 *  - Department blank or unrecognised — the surgeon still shows. Roughly one
 *    in a hundred staff records says "Other", and a locum whose department was
 *    never filled in must not become unbookable because of a data-entry gap.
 *    A slightly long list is a nuisance; a surgeon who cannot be selected at
 *    all stops a case.
 *
 * The only people hidden are those who positively belong to a DIFFERENT
 * subspecialty — which is the whole point of the request.
 */
export function surgeonMatchesSubspecialty(
  department: string | null | undefined,
  subspecialty: string | null | undefined,
): boolean {
  if (!subspecialty) return true;
  const theirs = canonicalSubspecialty(department);
  if (theirs === null) return true;

  const wanted = canonicalSubspecialty(subspecialty) ?? subspecialty;
  return theirs === wanted;
}

/** Exported for the test that proves every subspecialty is reachable. */
export const ALL_SUBSPECIALTIES = SUBSPECIALTIES;
