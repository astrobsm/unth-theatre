// ============================================================
// "Is this person already registered?" — asked loosely, on purpose
// ------------------------------------------------------------
// identity.ts answers the strict question: are these two identifiers THE SAME,
// once whitespace and case are set aside. That answer blocks a registration, so
// it has to be certain, and it deliberately refuses to strip punctuation —
// treating "12/345" as "12345" could merge two people, which is worse than
// failing to merge one. That reasoning is right and nothing here changes it.
//
// This module asks the other question: does this look ENOUGH like somebody
// already on file that a human should look before a second record is made. It
// is allowed to be wrong, because it never decides anything — it shows the
// candidates and a person chooses.
//
// WHY IT WAS NEEDED. The strict guard went in on 20 August. Between then and
// 15 September ten more duplicate pairs were created straight through it, and
// they say exactly what it cannot see:
//
//     555202        and  PT-555202      a prefix and a hyphen
//     531886        and  PT531886       a prefix
//     r534992       and  Pr534992       one letter
//     2722491       and  272491         a dropped digit
//     PT443076      and  PT44307        a dropped digit
//     Pt228817      and  Pt22881        a dropped digit
//     PT 535856     and  534856         a wrong digit
//     914282        and  pt521935       nothing in common but the patient
//
// Every one is the same event: somebody searched, did not find the patient
// because the number was written differently the first time, and registered
// again. Eleven of the resulting pairs now carry the SAME operation twice.
//
// The last line is why identifier comparison alone is not enough, and why name
// and age are matched too.
// ============================================================

import { normaliseIdentifier } from './identity';

export interface PatientLike {
  id: string;
  name: string;
  folderNumber?: string | null;
  ptNumber?: string | null;
  age?: number | null;
  ageUnit?: string | null;
  gender?: string | null;
  ward?: string | null;
}

/** What the person at the desk has typed so far. */
export interface Candidate {
  name?: string | null;
  folderNumber?: string | null;
  ptNumber?: string | null;
  age?: number | null;
  ageUnit?: string | null;
  gender?: string | null;
}

/**
 * How sure we are, and therefore what the application does about it.
 *
 *   'exact'    — the strict guard already refuses this; included so one module
 *                can describe every outcome.
 *   'strong'   — registration is held until somebody says these are different
 *                people. Overridable in one click, and the override is recorded.
 *   'possible' — shown as a question. Never holds anything up.
 */
export type MatchLevel = 'exact' | 'strong' | 'possible';

export interface NearMatch {
  patient: PatientLike;
  level: MatchLevel;
  /** Plain sentences, shown to whoever has to decide. */
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Normalising
// ---------------------------------------------------------------------------

/** Letters and digits only, upper-cased. For WARNING comparisons only. */
export function looseIdentifier(value: string | null | undefined): string {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * The number inside a folder number, with the hospital's decoration removed.
 *
 * "PT-555202", "pt 555202" and "555202" are one folder number written three
 * ways, and "UNTH/2026/914840" carries a year that is not part of the patient's
 * identity at all. Taking the LONGEST run of digits gets all of those right,
 * and ties break to the last run so a leading year loses to the folder itself.
 *
 * Returns '' when there is no digit run of a useful length — an identifier of
 * three digits or fewer is not distinctive enough to match people on.
 */
export function identifierCore(value: string | null | undefined): string {
  // Whitespace goes first, so "914 954" reads as one number. Punctuation is
  // KEPT at this point, because it is what separates the year from the folder
  // in "UNTH/2026/914840" — stripping it first joins them into 2026914840 and
  // the patient becomes unfindable.
  const compact = (value ?? '').toUpperCase().replace(/\s+/g, '');
  const runs = compact.match(/\d+/g);
  if (!runs) return '';
  let best = '';
  for (const run of runs) {
    if (run.length >= best.length) best = run;
  }
  return best.length >= 4 ? best : '';
}

/**
 * A name reduced to the set of words in it, in a fixed order.
 *
 * "NWAKAMA BRIDGET EZIAKU" and "Bridget Eziaku Nwakama" are one person whose
 * name was entered surname-first once and given-name-first the next time. Both
 * orders are used in this hospital's records, so comparing the strings as
 * written finds nothing.
 */
export function nameKey(value: string | null | undefined): string {
  return (value ?? '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .sort()
    .join(' ');
}

/**
 * Levenshtein distance, abandoned once it passes `cap`.
 *
 * The cap is not only speed. A distance of five between two folder numbers is
 * no more interesting than a distance of fifty, so there is nothing to gain by
 * computing it exactly.
 */
export function editDistance(a: string, b: string, cap = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      row.push(value);
      if (value < best) best = value;
    }
    if (best > cap) return cap + 1;
    prev = row;
  }
  return prev[b.length];
}

/** Age in years, so a 6-month-old is not compared with a 6-year-old. */
function ageInYears(age: number | null | undefined, unit: string | null | undefined): number | null {
  if (age === null || age === undefined || !Number.isFinite(Number(age))) return null;
  const n = Number(age);
  const u = (unit ?? 'YEARS').toUpperCase();
  if (u.startsWith('MONTH')) return n / 12;
  if (u.startsWith('DAY') || u.startsWith('WEEK')) return 0;
  return n;
}

// ---------------------------------------------------------------------------
// Comparing
// ---------------------------------------------------------------------------

/**
 * How alike one typed candidate and one existing patient are.
 *
 * Returns null when they are not alike enough to be worth a person's attention,
 * which is the answer for almost every pair in the database.
 */
export function compareToExisting(input: Candidate, existing: PatientLike): NearMatch | null {
  const reasons: string[] = [];
  let level: MatchLevel | null = null;

  const raise = (next: MatchLevel) => {
    const rank = { possible: 0, strong: 1, exact: 2 };
    if (level === null || rank[next] > rank[level]) level = next;
  };

  // ---- Identifiers -------------------------------------------------------
  const inputIds = [input.folderNumber, input.ptNumber];
  const existingIds = [existing.folderNumber, existing.ptNumber];

  // Cross-compared deliberately: a folder number typed into the PT field, and
  // the reverse, are both ordinary and both produce a duplicate.
  for (const a of inputIds) {
    for (const b of existingIds) {
      const strictA = normaliseIdentifier(a);
      const strictB = normaliseIdentifier(b);
      if (strictA && strictA === strictB) {
        raise('exact');
        reasons.push(`Identifier ${a} is already on this record.`);
        continue;
      }

      const looseA = looseIdentifier(a);
      const looseB = looseIdentifier(b);
      if (looseA && looseA === looseB) {
        raise('strong');
        reasons.push(`${a} and ${b} differ only in punctuation.`);
        continue;
      }

      const coreA = identifierCore(a);
      const coreB = identifierCore(b);
      if (!coreA || !coreB) continue;

      if (coreA === coreB) {
        raise('strong');
        reasons.push(`${a} and ${b} are the same number with a different prefix.`);
        continue;
      }
      if (editDistance(coreA, coreB, 1) <= 1) {
        raise('possible');
        reasons.push(`${a} and ${b} differ by a single character — one may be a typing slip.`);
      }
    }
  }

  // ---- Name and age ------------------------------------------------------
  const keyA = nameKey(input.name);
  const keyB = nameKey(existing.name);
  const sameName = !!keyA && keyA === keyB;
  const nearName = !sameName && !!keyA && !!keyB && editDistance(keyA, keyB, 2) <= 2;

  const ageA = ageInYears(input.age, input.ageUnit);
  const ageB = ageInYears(existing.age, existing.ageUnit);
  const ageGap = ageA !== null && ageB !== null ? Math.abs(ageA - ageB) : null;
  // An age recorded months apart can honestly differ by one.
  const ageAgrees = ageGap !== null && ageGap <= 1;
  const ageConflicts = ageGap !== null && ageGap > 2;

  if (sameName) {
    if (ageAgrees) {
      raise('strong');
      reasons.push(`Same name, and the age matches (${existing.age} ${String(existing.ageUnit ?? 'YEARS').toLowerCase()}).`);
    } else if (ageConflicts) {
      raise('possible');
      reasons.push(`Same name, but the recorded age is ${existing.age} rather than ${input.age} — this may be a different person.`);
    } else {
      raise('possible');
      reasons.push('Same name.');
    }
  } else if (nearName && ageAgrees) {
    raise('possible');
    reasons.push(`The name is close to "${existing.name}" and the age matches.`);
  }

  if (level === null) return null;

  // A conflicting age never lets a match stand as 'strong'. Two people who
  // share a name and nothing else must not have their registration held up,
  // and this hospital has several — Okeke Bridget aged 92 and another aged 31.
  if (ageConflicts && level === 'strong') {
    level = 'possible';
    reasons.push('Held back from a firm match because the ages disagree.');
  }

  return { patient: existing, level, reasons };
}

/**
 * The existing patients worth showing, strongest first.
 *
 * `limit` is a display decision, not a safety one: a list of twenty candidates
 * is not read, and the strongest is the one that matters.
 */
export function findNearMatches(
  input: Candidate,
  existing: PatientLike[],
  limit = 5,
): NearMatch[] {
  const rank = { exact: 0, strong: 1, possible: 2 };
  const found: NearMatch[] = [];
  for (const patient of existing) {
    const match = compareToExisting(input, patient);
    if (match) found.push(match);
  }
  return found.sort((a, b) => rank[a.level] - rank[b.level]).slice(0, limit);
}

/** Whether registration should pause and ask. */
export function shouldHoldRegistration(matches: NearMatch[]): boolean {
  return matches.some((m) => m.level === 'exact' || m.level === 'strong');
}

/** One sentence for the top of the warning. */
export function summarise(matches: NearMatch[]): string {
  if (!matches.length) return '';
  const strong = matches.filter((m) => m.level === 'exact' || m.level === 'strong').length;
  if (strong === 1) return 'This patient looks like somebody already registered.';
  if (strong > 1) return `${strong} existing records look like this patient.`;
  return matches.length === 1
    ? 'One existing record is similar enough to be worth checking.'
    : `${matches.length} existing records are similar enough to be worth checking.`;
}
