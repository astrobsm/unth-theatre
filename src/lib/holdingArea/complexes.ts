/**
 * Every theatre complex has its own holding area.
 *
 * The holding area was built as though there were one of them. A nurse named
 * to "the holding area" was named to all of them at once, and a chase sent to
 * "the holding area nurse" went to whoever happened to be on that single list
 * — which, for a patient waiting outside the Eye Theatre, is somebody standing
 * in a different building. Professor Ojukwu, the Eye Theatre, A&E and the
 * Cardiothoracic Centre each receive, verify and hand over their own patients,
 * so each needs its own named staff and its own chase.
 *
 * STORED IN `Roster.location`, NOT IN A NEW COLUMN. The roster already carries
 * a location per row, and a holding-area row is always read with
 * `subRole: 'HOLDING_AREA'` — so within that subRole the column means "which
 * complex", unambiguously, while the nursing-post rows next door keep their own
 * MAIN_THEATRE / A_AND_E meaning. A second column would have been a second
 * answer to the same question.
 *
 * ROWS WRITTEN BEFORE THIS CHANGE all say `MAIN_THEATRE`, because that is what
 * the allocate route hardcoded. They are read as the main complex rather than
 * dropped: those are real people who really stood in the main holding area,
 * and making yesterday's allocations vanish would be a worse answer than
 * placing them where they in fact were.
 */

import { LOCATIONS, CANONICAL_THEATRES, type Location } from '@/lib/constants';

export interface HoldingAreaComplex {
  /** Canonical label, stored verbatim in Roster.location. */
  key: Location;
  /** Short form for a chip or a column heading. */
  short: string;
}

/**
 * The complexes, in the order the screens list them: the main one first,
 * because most of the floor is there, then the rest as `LOCATIONS` has them.
 */
export const HOLDING_AREA_COMPLEXES: readonly HoldingAreaComplex[] = [
  { key: 'Professor Ojukwu Theatre Complex', short: 'Professor Ojukwu' },
  { key: 'Eye Theatre', short: 'Eye Theatre' },
  { key: 'A&E', short: 'A&E' },
  { key: 'Cardiothoracic Centre', short: 'Cardiothoracic (CTU)' },
];

/** Where an allocation goes when nothing says otherwise. */
export const DEFAULT_COMPLEX: Location = 'Professor Ojukwu Theatre Complex';

/**
 * What the allocate route used to write, before a holding area had a complex.
 * Kept as a read-time alias so historical rows still resolve.
 */
const LEGACY_LOCATION_ALIASES: Record<string, Location> = {
  MAIN_THEATRE: 'Professor Ojukwu Theatre Complex',
  MAIN: 'Professor Ojukwu Theatre Complex',
  A_AND_E: 'A&E',
  AE: 'A&E',
  'A & E': 'A&E',
  'ACCIDENT & EMERGENCY': 'A&E',
  CTU: 'Cardiothoracic Centre',
  'CTU THEATRE': 'Cardiothoracic Centre',
  'CARDIOTHORACIC THEATRE': 'Cardiothoracic Centre',
  EYE: 'Eye Theatre',
  OJUKWU: 'Professor Ojukwu Theatre Complex',
};

export const isComplex = (v: unknown): v is Location =>
  typeof v === 'string' && (LOCATIONS as readonly string[]).includes(v);

/**
 * Read a stored or submitted value as a complex.
 *
 * Returns null for anything it cannot place. A guess here would quietly chase
 * the wrong building, which is the failure this whole module exists to stop —
 * so an unrecognised value is handed back to the caller to resolve, not
 * rounded to the main complex.
 */
export function normaliseComplex(raw: unknown): Location | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  if (isComplex(s)) return s;

  const upper = s.toUpperCase();
  if (LEGACY_LOCATION_ALIASES[upper]) return LEGACY_LOCATION_ALIASES[upper];

  // Case and spacing only — never a partial or fuzzy match.
  const exact = LOCATIONS.find((l) => l.toUpperCase() === upper);
  return exact ?? null;
}

/**
 * The complex a stored holding-area row belongs to.
 *
 * Unlike `normaliseComplex`, this one does fall back to the main complex,
 * because a row that is already on file names a real person who was really on
 * duty. Losing them from the list is worse than placing a pre-change row where
 * the route that wrote it meant to put them.
 */
export function complexOfRow(storedLocation: unknown): Location {
  return normaliseComplex(storedLocation) ?? DEFAULT_COMPLEX;
}

/** The canonical theatre list, as a name → complex map. */
const THEATRE_TO_COMPLEX = new Map<string, Location>(
  CANONICAL_THEATRES.map((t) => [t.name.toUpperCase(), t.location]),
);

/**
 * Which holding area serves this theatre.
 *
 * `suiteLocation` is `TheatreSuite.location` where the caller has it — the
 * database is the better authority, since a theatre can be added without
 * touching the canonical list. The name is the fallback.
 *
 * Returns null when neither places the theatre. The caller must then ask
 * rather than assume: a chase sent to the main holding area for a case in the
 * Eye Theatre reaches somebody who cannot see the patient.
 */
export function complexForTheatre(
  theatreName: string | null | undefined,
  suiteLocation?: string | null,
): Location | null {
  const fromSuite = normaliseComplex(suiteLocation);
  if (fromSuite) return fromSuite;

  if (typeof theatreName === 'string' && theatreName.trim()) {
    const direct = THEATRE_TO_COMPLEX.get(theatreName.trim().toUpperCase());
    if (direct) return direct;
    // A theatre whose name IS a complex, such as "Eye Theatre".
    const asComplex = normaliseComplex(theatreName);
    if (asComplex) return asComplex;
  }
  return null;
}

/** The label to print for a complex, short form. */
export function shortComplex(key: Location | string | null | undefined): string {
  const c = normaliseComplex(key);
  if (!c) return 'Unplaced';
  return HOLDING_AREA_COMPLEXES.find((x) => x.key === c)?.short ?? c;
}
