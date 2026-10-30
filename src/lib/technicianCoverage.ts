/**
 * Which anaesthetic technician covers which case.
 *
 * Technicians used to be rostered to a THEATRE, and coverage matched a case's
 * theatre — which the case rarely states directly, so it was derived from the
 * surgical unit's theatre-for-that-weekday, and failing that from the free-text
 * location. Three hops, any of which can be blank.
 *
 * They are now rostered to a SURGICAL SPECIALTY, exactly as the anaesthetists
 * are. The specialty is on the booking itself: all 568 cases in the last sixty
 * days have one. That is the difference between matching on a field people fill
 * in and matching on one the system infers.
 *
 * Day call, night call and ICU are not specialties, so they stay a separate
 * bucket — the coverage route sends an emergency to the day or the night
 * technician depending on the hour.
 *
 * Pure and free of Prisma so the rules can be tested rather than read. Both the
 * coverage board and the gap alert use it: they had two copies of the bucketing
 * and could disagree about whether a day was covered.
 */

import { canonicalSubspecialty } from '@/lib/subspecialtyMatch';

export interface TechRosterRow {
  userId: string;
  /** MORNING | CALL | NIGHT */
  shift: string;
  /** The surgical specialty covered — or DAY CALL / NIGHT CALL / ICU. */
  subRole: string | null;
}

export type TechDuty = 'DAY_CALL' | 'NIGHT_CALL' | 'ICU' | 'SPECIALTY' | 'UNASSIGNED';

// The wording written by the roster form and the upload template; see
// TECHNICIAN_SPECIAL_ASSIGNMENTS in @/lib/rosterDepartments.
const NIGHT_CALL_RE = /night\s*call/i;
const DAY_CALL_RE = /day\s*call/i;
const ICU_RE = /\bicu\b/i;

/**
 * What this roster row means.
 *
 * NIGHT CALL IS TESTED FIRST because "NIGHT CALL (emergency cover)" also
 * contains "call"; the other order would file the night technician as day
 * cover, and a 2 a.m. emergency would call the wrong person.
 *
 * A row with no assignment at all falls back to its shift. 505 of the 506 live
 * technician rows are exactly that — no assignment, just a shift — so this
 * fallback is not an edge case, it is currently the normal case.
 */
export function classifyTechnicianRow(row: TechRosterRow): { duty: TechDuty; specialty: string | null } {
  const sub = (row.subRole || '').trim();

  if (NIGHT_CALL_RE.test(sub)) return { duty: 'NIGHT_CALL', specialty: null };
  if (DAY_CALL_RE.test(sub)) return { duty: 'DAY_CALL', specialty: null };
  if (ICU_RE.test(sub)) return { duty: 'ICU', specialty: null };
  if (sub) return { duty: 'SPECIALTY', specialty: sub };

  if (row.shift === 'NIGHT') return { duty: 'NIGHT_CALL', specialty: null };
  if (row.shift === 'CALL') return { duty: 'DAY_CALL', specialty: null };
  return { duty: 'UNASSIGNED', specialty: null };
}

/**
 * A comparable key for a specialty, from either the roster or a booking.
 *
 * Bookings do not all spell the specialty the way the roster dropdown does:
 * alongside "General Surgery" there is "GS Unit II", "Neuro Unit III",
 * "O&G Firm 5". canonicalSubspecialty already exists to reconcile exactly this,
 * and it resolves all but a handful. Where it cannot, the normalised raw string
 * is used, so two rows that agree literally still match — that is strictly
 * better than dropping them.
 */
export function specialtyKey(value: string | null | undefined): string | null {
  const raw = (value || '').trim();
  if (!raw) return null;
  return canonicalSubspecialty(raw) ?? raw.toLowerCase().replace(/\s+/g, ' ');
}

/** Does a technician rostered to `rostered` cover a case booked as `booked`? */
export function coversSpecialty(
  rostered: string | null | undefined,
  booked: string | null | undefined,
): boolean {
  const a = specialtyKey(rostered);
  const b = specialtyKey(booked);
  // Null means "not stated", which is never a match. Treating it as a wildcard
  // would report a case as covered because a field was left blank.
  return a !== null && b !== null && a === b;
}

export interface TechBuckets<T> {
  /** Keyed by specialtyKey, so lookups use the same reconciliation. */
  bySpecialty: Map<string, { specialty: string; technicians: T[] }>;
  dayCall: T[];
  nightCall: T[];
  icu: T[];
}

/**
 * Sort a day's published technician roster into the buckets coverage reads.
 *
 * @param toTech how to render a row as whatever the caller wants to show.
 */
export function bucketTechnicianRoster<T extends { userId: string }>(
  rows: readonly TechRosterRow[],
  toTech: (row: TechRosterRow) => T,
): TechBuckets<T> {
  const out: TechBuckets<T> = { bySpecialty: new Map(), dayCall: [], nightCall: [], icu: [] };

  for (const row of rows) {
    const tech = toTech(row);
    const { duty, specialty } = classifyTechnicianRow(row);

    if (duty === 'NIGHT_CALL') { out.nightCall.push(tech); continue; }
    if (duty === 'DAY_CALL') { out.dayCall.push(tech); continue; }
    if (duty === 'ICU') { out.icu.push(tech); continue; }
    if (duty === 'SPECIALTY' && specialty) {
      const key = specialtyKey(specialty);
      if (!key) continue;
      const bucket = out.bySpecialty.get(key) ?? { specialty, technicians: [] };
      // The same person rostered twice to one specialty is one person.
      if (!bucket.technicians.some((t) => t.userId === tech.userId)) bucket.technicians.push(tech);
      out.bySpecialty.set(key, bucket);
    }
  }

  return out;
}

/**
 * The technician a unit's list should expect, from the published roster.
 *
 * WHY THIS EXISTS. The unit cards on the surgeries page read their
 * anaesthetists from the allocation AND, failing that, from the published
 * anaesthetists' roster. The technician row had only the first half: it read
 * TheatreAllocation and nothing else. So a published Anaesthetic Technicians
 * Roster changed nothing on the card, and every unit read "Technician — Not
 * yet assigned" however carefully the week had been rostered. The roster was
 * being kept and then ignored.
 *
 * SPECIALTY FIRST, THEN DAY CALL. A technician rostered to the case's
 * specialty is the answer. Day call is cover, not an assignment, so it is
 * offered — somebody has to be rung — but reported as what it is. Night call
 * is deliberately NOT used here: these are elective daytime lists, and naming
 * the night technician on a 9am card would send a 9am call to somebody asleep.
 */
export function technicianForSpecialty<T>(
  buckets: TechBuckets<T>,
  subspecialty: string | null | undefined,
): { technician: T; source: 'specialty' | 'day-call' } | null {
  const key = specialtyKey(subspecialty);
  if (key) {
    const bucket = buckets.bySpecialty.get(key);
    if (bucket && bucket.technicians.length > 0) {
      return { technician: bucket.technicians[0], source: 'specialty' };
    }
  }
  if (buckets.dayCall.length > 0) {
    return { technician: buckets.dayCall[0], source: 'day-call' };
  }
  return null;
}
