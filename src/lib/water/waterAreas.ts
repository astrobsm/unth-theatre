// ============================================================
// Which rooms the water report covers
// ------------------------------------------------------------
// The water status form asked about Theatre 1, 2, 3 and 4, and three shared
// rooms. The hospital operates in thirteen rooms across four locations: the
// Professor Ojukwu complex (Theatres 1-5 and Suites 1-3), the Eye Theatre,
// the A&E theatres and the Cardiothoracic Centre. Nine of them had no line on
// the form, so a report saying "water OK" said nothing whatever about the
// list running in the Eye Theatre that morning.
//
// WHY THIS READS THE THEATRE TABLE INSTEAD OF A LONGER HARD-CODED LIST. A
// fixed list of thirteen is wrong the day a room is added or renamed, and it
// is wrong silently: the room simply never appears, and nobody filling the
// form can tell that it is missing. TheatreSuite is where theatres are
// created, so that is what the form asks.
//
// WHY A LOG STORES NAMES AND NOT ONLY IDS. These rows are a record of what
// somebody checked on a particular morning. If a theatre is later renamed or
// struck off, the old log must still read the way it read when it was signed;
// resolving names at display time would quietly rewrite history. So each
// logged area carries its own name and location, and the id is kept beside
// them only to line one shift up with the next.
// ============================================================

/** What a plumber can say about a room. */
export const AREA_STATUSES = ['OK', 'LOW_PRESSURE', 'NO_WATER', 'LEAK'] as const;
export type AreaStatus = (typeof AREA_STATUSES)[number];

export const AREA_STATUS_LABEL: Record<string, string> = {
  OK: 'OK',
  LOW_PRESSURE: 'Low pressure',
  NO_WATER: 'No water',
  LEAK: 'Leak',
};

export interface WaterArea {
  /** `theatre:<suite id>` or `support:<slug>`; `legacy:<column>` for old rows. */
  key: string;
  name: string;
  /** Empty for the shared rooms and for rows logged before this existed. */
  location: string;
  status: string;
}

/** A row of TheatreSuite, as /api/theatres returns it. */
export interface TheatreRow {
  id: string;
  name: string;
  location?: string | null;
  isOperatingRoom?: boolean;
}

/**
 * The rooms that are not theatres but have always been on this report.
 *
 * They are not in TheatreSuite -- the scrub area is not somewhere a case is
 * booked -- so they stay declared here, and they keep the column each one was
 * stored in so an old log and a new one agree about what they mean.
 */
export const SUPPORT_AREAS: { key: string; name: string; legacyColumn: string }[] = [
  { key: 'support:scrub', name: 'Scrub Area', legacyColumn: 'scrubAreaStatus' },
  { key: 'support:recovery', name: 'Recovery Area (PACU)', legacyColumn: 'recoveryAreaStatus' },
  { key: 'support:sterilization', name: 'Sterilization Area (CSSD)', legacyColumn: 'sterilizationAreaStatus' },
];

/** The four theatres that had a column of their own, by the name they had. */
export const LEGACY_THEATRE_COLUMNS: { name: string; column: string }[] = [
  { name: 'Theatre 1', column: 'theatre1Status' },
  { name: 'Theatre 2', column: 'theatre2Status' },
  { name: 'Theatre 3', column: 'theatre3Status' },
  { name: 'Theatre 4', column: 'theatre4Status' },
];

/** Shown above the rooms whose location nothing records. */
export const UNPLACED_HEADING = 'Shared areas';
/** Shown above an old log's four theatres, which were stored without one. */
export const LEGACY_HEADING = 'Recorded before the full theatre list';

const asStatus = (v: unknown): string =>
  typeof v === 'string' && (AREA_STATUSES as readonly string[]).includes(v) ? v : 'OK';

/**
 * Every room this shift has to be asked about, in a stable order.
 *
 * Locations are alphabetical rather than ranked. Ranking them would mean
 * deciding here which theatre complex matters most, and a new location added
 * tomorrow would land wherever the list did not mention it -- usually last,
 * where a tired plumber at the end of a shift stops reading.
 */
export function buildWaterAreas(
  theatres: readonly TheatreRow[],
  previous?: readonly WaterArea[] | null,
): WaterArea[] {
  const carried = new Map((previous ?? []).map((a) => [a.key, a.status]));

  const rooms = theatres
    .filter((t) => t.isOperatingRoom !== false)
    .map((t) => ({
      key: `theatre:${t.id}`,
      name: t.name,
      location: (t.location ?? '').trim(),
    }))
    .sort((a, b) => a.location.localeCompare(b.location) || a.name.localeCompare(b.name));

  const shared = SUPPORT_AREAS.map((s) => ({ key: s.key, name: s.name, location: '' }));

  return [...rooms, ...shared].map((a) => ({ ...a, status: asStatus(carried.get(a.key) ?? 'OK') }));
}

/** The areas under their location headings, in the order buildWaterAreas gave. */
export function groupAreasByLocation(
  areas: readonly WaterArea[],
): { location: string; areas: WaterArea[] }[] {
  const out: { location: string; areas: WaterArea[] }[] = [];
  areas.forEach((area) => {
    const heading = area.location
      || (area.key.startsWith('legacy:') ? LEGACY_HEADING : UNPLACED_HEADING);
    const last = out[out.length - 1];
    if (last && last.location === heading) last.areas.push(area);
    else out.push({ location: heading, areas: [area] });
  });
  return out;
}

/**
 * What was stored on a water status row, whatever shape it was stored in.
 *
 * No index signature: the callers pass a Prisma row or the page's own
 * interface, and requiring one of those to declare `[k: string]: unknown`
 * would mean giving up type checking on every other field it has.
 */
export interface StoredAreas {
  areaStatuses?: string | null;
}

/**
 * The areas a logged row recorded.
 *
 * Falls back to the seven old columns when a row predates areaStatuses. Those
 * rows are real history -- months of shifts -- and a report that showed them
 * as empty would read as though nobody had checked anything.
 */
export function readWaterAreas(row: StoredAreas | null | undefined): WaterArea[] {
  if (!row) return [];
  const columns = row as unknown as Record<string, unknown>;

  if (typeof row.areaStatuses === 'string' && row.areaStatuses.trim()) {
    try {
      const parsed = JSON.parse(row.areaStatuses);
      if (Array.isArray(parsed)) {
        const areas = parsed
          .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
          .map((a) => ({
            key: String(a.key ?? ''),
            name: String(a.name ?? ''),
            location: String(a.location ?? ''),
            status: asStatus(a.status),
          }))
          .filter((a) => a.key && a.name);
        if (areas.length > 0) return areas;
      }
    } catch {
      // A row whose JSON will not parse falls through to the old columns
      // rather than showing nothing. Half a report beats a blank one.
    }
  }

  const legacy: WaterArea[] = LEGACY_THEATRE_COLUMNS.map((t) => ({
    key: `legacy:${t.column}`,
    name: t.name,
    location: '',
    status: asStatus(columns[t.column]),
  }));
  const shared: WaterArea[] = SUPPORT_AREAS.map((s) => ({
    key: s.key,
    name: s.name,
    location: '',
    status: asStatus(columns[s.legacyColumn]),
  }));
  return [...legacy, ...shared];
}

/**
 * The seven old columns, filled in from the areas where a name still matches.
 *
 * The columns are not dropped and are not left to rot. Anything still reading
 * theatre3Status -- an export, a query somebody runs by hand -- goes on
 * getting the truth about Theatre 3 rather than a default of OK, which is the
 * most dangerous thing a water column can say.
 */
export function legacyColumnsFor(areas: readonly WaterArea[]): Record<string, string> {
  const byName = new Map(areas.map((a) => [a.name.trim().toLowerCase(), a.status]));
  const byKey = new Map(areas.map((a) => [a.key, a.status]));
  const out: Record<string, string> = {};
  LEGACY_THEATRE_COLUMNS.forEach((t) => {
    out[t.column] = byName.get(t.name.toLowerCase()) ?? 'OK';
  });
  SUPPORT_AREAS.forEach((s) => {
    out[s.legacyColumn] = byKey.get(s.key) ?? 'OK';
  });
  return out;
}

/** The rooms with something wrong, which is the whole point of the report. */
export function areasNotOk(areas: readonly WaterArea[]): WaterArea[] {
  return areas.filter((a) => a.status !== 'OK');
}

/**
 * One line for a log table: "All 16 areas OK" or the rooms that are not.
 *
 * Named, not counted. "3 areas affected" tells a theatre manager to go and
 * open the record; "Eye Theatre, Suite 2" tells them whether this morning's
 * list can run.
 */
export function summariseAreas(areas: readonly WaterArea[], maxNamed = 3): string {
  if (areas.length === 0) return 'Not recorded';
  const bad = areasNotOk(areas);
  if (bad.length === 0) return `All ${areas.length} areas OK`;
  const named = bad.slice(0, maxNamed)
    .map((a) => `${a.name} (${AREA_STATUS_LABEL[a.status] ?? a.status})`);
  const rest = bad.length - named.length;
  return rest > 0 ? `${named.join(', ')} +${rest} more` : named.join(', ');
}

/**
 * The places a plumbing fault can be reported against.
 *
 * Every theatre by name, then the rooms that are not theatres. The old list
 * stopped at Theatre 4, so a leak in the Eye Theatre had to be filed as
 * "Other" -- and "Other" is not something a works supervisor can dispatch
 * anybody to.
 */
export const NON_THEATRE_FAULT_LOCATIONS = [
  'Scrub Area', 'Recovery Area (PACU)', 'Sterilization Area (CSSD)',
  'Holding Area', 'Storage Room', 'Corridor', 'Restroom', 'Staff Room', 'Other',
];

export function faultLocations(theatres: readonly TheatreRow[]): string[] {
  const named = buildWaterAreas(theatres)
    .filter((a) => a.key.startsWith('theatre:'))
    .map((a) => (a.location ? `${a.name} — ${a.location}` : a.name));
  return [...named, ...NON_THEATRE_FAULT_LOCATIONS];
}
