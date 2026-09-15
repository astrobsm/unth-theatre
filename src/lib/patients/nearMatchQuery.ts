// ============================================================
// Finding the handful of patients worth comparing against
// ------------------------------------------------------------
// nearMatch.ts does the judging and is pure, so it can be tested against the
// duplicates this hospital has actually created. This module is the half that
// needs a database: narrowing 600-odd patients down to the few that could
// plausibly be the person at the desk.
//
// SHORTLIST GENEROUSLY, JUDGE STRICTLY. Everything this query lets through is
// examined properly afterwards, so a loose WHERE costs a little time and no
// accuracy. A tight one costs a duplicate nobody catches.
//
// It lives here, and not in either route, because the registration endpoint and
// the as-you-type check must ask the same question. Two copies of this SQL
// would drift, and the drift would show up as a form that says the patient is
// new and a server that then refuses to create them.
// ============================================================

import prisma from '@/lib/prisma';
import {
  findNearMatches, identifierCore, looseIdentifier, nameKey,
  type Candidate, type NearMatch, type PatientLike,
} from './nearMatch';

export interface NearMatchOptions {
  /** Editing an existing patient: never match them against themselves. */
  excludeId?: string | null;
  limit?: number;
}

/**
 * Existing patients that resemble the one being registered.
 *
 * Returns an empty list — never throws — when the query fails. A patient at a
 * desk must not be turned away because a duplicate check could not run; the
 * exact guard on the create still stands behind this one.
 */
export async function findRegistrationNearMatches(
  input: Candidate,
  options: NearMatchOptions = {},
): Promise<NearMatch[]> {
  const cores = unique([identifierCore(input.folderNumber), identifierCore(input.ptNumber)]);
  const looses = unique([looseIdentifier(input.folderNumber), looseIdentifier(input.ptNumber)]);
  // Two letters or fewer matches half the hospital; initials are not evidence.
  const words = nameKey(input.name).split(' ').filter((w) => w.length > 2);

  if (!cores.length && !looses.length && !words.length) return [];

  const clauses: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    clauses.push(sql.replace('$?', `$${params.length}`));
  };

  for (const core of cores) {
    // The first four digits OR the last four, not the whole number and not a
    // stem. A dropped digit is the commonest of these mistakes and it can fall
    // anywhere: "2722491" and "272491" share no run of five, but they share
    // the last four (2491), and "PT443076" and "PT44307" share the first four
    // (4430). One of the two ends survives almost every single-character slip.
    //
    // Everything this lets through is judged properly afterwards, so a loose
    // net here costs a little time and no accuracy.
    const head = core.slice(0, 4);
    const tail = core.slice(-4);
    for (const fragment of Array.from(new Set([head, tail]))) {
      add(`regexp_replace(upper("folderNumber"), '[^0-9]', '', 'g') LIKE $?`, `%${fragment}%`);
      add(`regexp_replace(upper(coalesce("ptNumber", '')), '[^0-9]', '', 'g') LIKE $?`, `%${fragment}%`);
    }
  }
  for (const loose of looses) {
    add(`regexp_replace(upper("folderNumber"), '[^A-Z0-9]', '', 'g') = $?`, loose);
    add(`regexp_replace(upper(coalesce("ptNumber", '')), '[^A-Z0-9]', '', 'g') = $?`, loose);
  }
  for (const word of words) {
    add(`upper("name") LIKE $?`, `%${word}%`);
  }

  let shortlist: PatientLike[] = [];
  try {
    shortlist = await prisma.$queryRawUnsafe<PatientLike[]>(
      `SELECT id, name, "folderNumber", "ptNumber", age, "ageUnit", gender, ward
         FROM patients
        WHERE (${clauses.join(' OR ')})
        LIMIT 60`,
      ...params,
    );
  } catch (e) {
    console.error('[patients] near-match shortlist failed:', e);
    return [];
  }

  const candidates = options.excludeId
    ? shortlist.filter((p) => p.id !== options.excludeId)
    : shortlist;

  return findNearMatches(input, candidates, options.limit ?? 5);
}

function unique(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v)));
}
