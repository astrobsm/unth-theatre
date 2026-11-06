/**
 * Does the water report cover every theatre the hospital operates in?
 *
 * Asked for on 5 November:
 *
 *   "kindly ensure that all the theatres in this database is fully
 *    represented in the water status report and logs, all theatre locations,
 *    a/e to eye theatre, professor ojukwu theatre etc"
 *
 * The form asked about Theatre 1 to Theatre 4 and three shared rooms. The
 * database holds thirteen operating rooms across four locations, so nine of
 * them — the Eye Theatre, the three A&E theatres, CTU TH1, Theatre 5 and the
 * three Ojukwu suites — had been asked about by nobody, and a shift could be
 * signed off as OK while the Eye Theatre had no water at all.
 *
 * The ways this can go wrong, worst first:
 *
 *   a room silently missing from the form, which looks exactly like a room
 *   that is fine;
 *
 *   an old log rendering as blank once the storage shape changes, so months
 *   of real shifts read as though nobody had checked anything;
 *
 *   and a renamed theatre rewriting what last March's record says.
 *
 * No patient is named here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  AREA_STATUS_LABEL,
  LEGACY_HEADING,
  SUPPORT_AREAS,
  UNPLACED_HEADING,
  areasNotOk,
  buildWaterAreas,
  faultLocations,
  groupAreasByLocation,
  legacyColumnsFor,
  readWaterAreas,
  summariseAreas,
  type TheatreRow,
  type WaterArea,
} from '../../src/lib/water/waterAreas';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

/** The rooms the live database actually holds, as of 5 November 2026. */
const THEATRES: TheatreRow[] = [
  { id: 't1', name: 'Theatre 1', location: 'Professor Ojukwu Theatre Complex' },
  { id: 't2', name: 'Theatre 2', location: 'Professor Ojukwu Theatre Complex' },
  { id: 't3', name: 'Theatre 3', location: 'Professor Ojukwu Theatre Complex' },
  { id: 't4', name: 'Theatre 4', location: 'Professor Ojukwu Theatre Complex' },
  { id: 't5', name: 'Theatre 5', location: 'Professor Ojukwu Theatre Complex' },
  { id: 's1', name: 'Suite 1', location: 'Professor Ojukwu Theatre Complex' },
  { id: 's2', name: 'Suite 2', location: 'Professor Ojukwu Theatre Complex' },
  { id: 's3', name: 'Suite 3', location: 'Professor Ojukwu Theatre Complex' },
  { id: 'eye', name: 'Eye Theatre', location: 'Eye Theatre' },
  { id: 'ae1', name: 'A&E Theatre', location: 'A&E' },
  { id: 'ae2', name: 'A&E North Wing Suite', location: 'A&E' },
  { id: 'ae3', name: 'A&E South Wing Suite', location: 'A&E' },
  { id: 'ctu', name: 'CTU TH1', location: 'Cardiothoracic Centre' },
  // Entered as a theatre years ago; no operation happens in it.
  { id: 'hold', name: 'Holding area', location: 'Professor Ojukwu Theatre Complex', isOperatingRoom: false },
];

describe('every room gets a line on the form', () => {
  const areas = buildWaterAreas(THEATRES);

  it('covers all thirteen operating rooms, not the first four', () => {
    const names = areas.map((a) => a.name);
    ['Theatre 1', 'Theatre 5', 'Suite 3', 'Eye Theatre', 'A&E Theatre',
      'A&E North Wing Suite', 'CTU TH1'].forEach((n) => expect(names).toContain(n));
    expect(areas.filter((a) => a.key.startsWith('theatre:'))).toHaveLength(13);
  });

  it('keeps the three shared rooms the report always had', () => {
    const names = areas.map((a) => a.name);
    SUPPORT_AREAS.forEach((s) => expect(names).toContain(s.name));
    expect(areas).toHaveLength(13 + SUPPORT_AREAS.length);
  });

  it('leaves out the room that is not a theatre', () => {
    // The holding area was entered in the theatre table and is flagged out of
    // every picker in the system. Asking a plumber about its water pressure
    // alongside the theatres would make the form longer and no truer.
    expect(areas.map((a) => a.name)).not.toContain('Holding area');
  });

  it('starts everything at OK, which is what a shift with nothing wrong looks like', () => {
    expect(areas.every((a) => a.status === 'OK')).toBe(true);
  });

  it('keeps what the user has already picked when the theatre list arrives late', () => {
    // The form seeds itself from a fetch. If a slow link delivered the list
    // after somebody had marked the Eye Theatre dry, rebuilding would quietly
    // reset it to OK — the one error that cannot be seen on screen.
    const half = buildWaterAreas([THEATRES[8]]);
    const edited = half.map((a) => (a.name === 'Eye Theatre' ? { ...a, status: 'NO_WATER' } : a));
    const full = buildWaterAreas(THEATRES, edited);
    expect(full.find((a) => a.name === 'Eye Theatre')?.status).toBe('NO_WATER');
    expect(full.find((a) => a.name === 'Theatre 1')?.status).toBe('OK');
  });
});

describe('grouped by location, because that is how the hospital is laid out', () => {
  const groups = groupAreasByLocation(buildWaterAreas(THEATRES));

  it('gives each location one heading', () => {
    expect(groups.map((g) => g.location)).toEqual([
      'A&E',
      'Cardiothoracic Centre',
      'Eye Theatre',
      'Professor Ojukwu Theatre Complex',
      UNPLACED_HEADING,
    ]);
  });

  it('files each room under its own location', () => {
    const ae = groups.find((g) => g.location === 'A&E');
    expect(ae?.areas.map((a) => a.name)).toEqual([
      'A&E North Wing Suite', 'A&E South Wing Suite', 'A&E Theatre',
    ]);
    expect(groups.find((g) => g.location === 'Professor Ojukwu Theatre Complex')?.areas)
      .toHaveLength(8);
  });

  it('loses nothing to the grouping', () => {
    expect(groups.reduce((n, g) => n + g.areas.length, 0)).toBe(16);
  });
});

describe('reading a logged row back', () => {
  const logged: WaterArea[] = [
    { key: 'theatre:eye', name: 'Eye Theatre', location: 'Eye Theatre', status: 'NO_WATER' },
    { key: 'theatre:t1', name: 'Theatre 1', location: 'Professor Ojukwu Theatre Complex', status: 'OK' },
    { key: 'support:scrub', name: 'Scrub Area', location: '', status: 'LOW_PRESSURE' },
  ];

  it('returns what was written, name and location included', () => {
    const back = readWaterAreas({ areaStatuses: JSON.stringify(logged) });
    expect(back).toEqual(logged);
  });

  it('reports the name the room had when it was checked', () => {
    // A log is a record of a morning. Resolving names from the theatre table
    // at display time would let a rename next year rewrite what this says.
    const back = readWaterAreas({ areaStatuses: JSON.stringify(logged) });
    expect(back[0].name).toBe('Eye Theatre');
  });

  it('falls back to the old columns for a row logged before this existed', () => {
    // Months of real shifts live in those seven columns. Showing them as
    // blank would read as though nobody had checked anything.
    const old = {
      areaStatuses: null,
      theatre1Status: 'OK',
      theatre2Status: 'LEAK',
      theatre3Status: 'OK',
      theatre4Status: 'OK',
      scrubAreaStatus: 'OK',
      recoveryAreaStatus: 'NO_WATER',
      sterilizationAreaStatus: 'OK',
    };
    const back = readWaterAreas(old);
    expect(back).toHaveLength(7);
    expect(back.find((a) => a.name === 'Theatre 2')?.status).toBe('LEAK');
    expect(back.find((a) => a.name === 'Recovery Area (PACU)')?.status).toBe('NO_WATER');
    expect(groupAreasByLocation(back)[0].location).toBe(LEGACY_HEADING);
  });

  it('falls back rather than showing nothing when the JSON will not parse', () => {
    const back = readWaterAreas({ areaStatuses: '{not json', theatre2Status: 'LEAK' });
    expect(back.find((a) => a.name === 'Theatre 2')?.status).toBe('LEAK');
  });

  it('refuses a status it does not recognise instead of printing it', () => {
    const back = readWaterAreas({
      areaStatuses: JSON.stringify([{ key: 'k', name: 'Theatre 9', location: '', status: 'ON FIRE' }]),
    });
    expect(back[0].status).toBe('OK');
  });

  it('says nothing about a row that does not exist', () => {
    expect(readWaterAreas(null)).toEqual([]);
  });
});

describe('the old columns are still written', () => {
  it('fills them from the areas whose names still match', () => {
    // Anything still reading theatre3Status — an export, a query run by hand
    // — must get the truth about Theatre 3, not a default of OK.
    const areas = buildWaterAreas(THEATRES).map((a) =>
      (a.name === 'Theatre 3' ? { ...a, status: 'NO_WATER' } : a));
    const cols = legacyColumnsFor(areas);
    expect(cols.theatre3Status).toBe('NO_WATER');
    expect(cols.theatre1Status).toBe('OK');
    expect(cols.scrubAreaStatus).toBe('OK');
  });

  it('carries the shared rooms across by key, not by name', () => {
    const areas = buildWaterAreas(THEATRES).map((a) =>
      (a.key === 'support:sterilization' ? { ...a, status: 'LEAK' } : a));
    expect(legacyColumnsFor(areas).sterilizationAreaStatus).toBe('LEAK');
  });

  it('does not invent a status for a theatre that no longer has a column', () => {
    const areas: WaterArea[] = [
      { key: 'theatre:eye', name: 'Eye Theatre', location: 'Eye Theatre', status: 'NO_WATER' },
    ];
    const cols = legacyColumnsFor(areas);
    expect(Object.keys(cols)).toHaveLength(7);
    expect(cols.theatre1Status).toBe('OK');
  });
});

describe('what the log table says in one line', () => {
  const areas = buildWaterAreas(THEATRES);

  it('says so plainly when everything is fine', () => {
    expect(summariseAreas(areas)).toBe('All 16 areas OK');
  });

  it('names the rooms rather than counting them', () => {
    // "3 areas affected" sends a theatre manager to open the record. "Eye
    // Theatre (No water)" tells them whether this morning's list can run.
    const bad = areas.map((a) => (
      a.name === 'Eye Theatre' ? { ...a, status: 'NO_WATER' }
        : a.name === 'Suite 2' ? { ...a, status: 'LEAK' } : a));
    expect(summariseAreas(bad)).toBe('Eye Theatre (No water), Suite 2 (Leak)');
  });

  it('caps the list and counts the rest', () => {
    const bad = areas.map((a) => (a.key.startsWith('theatre:') ? { ...a, status: 'LEAK' } : a));
    expect(summariseAreas(bad, 2)).toMatch(/\+11 more$/);
  });

  it('does not claim a clean report when nothing was recorded', () => {
    expect(summariseAreas([])).toBe('Not recorded');
  });

  it('picks out the rooms that need somebody', () => {
    const bad = areas.map((a) => (a.name === 'CTU TH1' ? { ...a, status: 'LOW_PRESSURE' } : a));
    expect(areasNotOk(bad).map((a) => a.name)).toEqual(['CTU TH1']);
    expect(AREA_STATUS_LABEL.LOW_PRESSURE).toBe('Low pressure');
  });
});

describe('a fault can be reported against any theatre', () => {
  const places = faultLocations(THEATRES);

  it('offers every theatre, with its location, so a plumber can be sent there', () => {
    // The old list stopped at Theatre 4, so a leak in the Eye Theatre had to
    // be filed as "Other" — and nobody can be dispatched to Other.
    expect(places).toContain('Eye Theatre — Eye Theatre');
    expect(places).toContain('A&E Theatre — A&E');
    expect(places).toContain('CTU TH1 — Cardiothoracic Centre');
    expect(places).toContain('Theatre 5 — Professor Ojukwu Theatre Complex');
  });

  it('keeps the rooms that are not theatres', () => {
    ['Scrub Area', 'Holding Area', 'Corridor', 'Other'].forEach((p) => expect(places).toContain(p));
  });
});

describe('the page and the API', () => {
  const page = read('src/app/dashboard/plumbing-water-supply/page.tsx');
  const api = read('src/app/api/plumbing-water-supply/route.ts');
  const schema = read('prisma/schema.prisma');

  it('asks the database for the theatre list instead of listing them here', () => {
    expect(page).toContain("fetch('/api/theatres')");
    expect(page).toContain('buildWaterAreas(theatres, prev)');
    // The four hard-coded dropdowns are gone from the form.
    expect(page).not.toContain("{ key: 'theatre1Status', label: 'Theatre 1' }");
  });

  it('sends every area with the log', () => {
    expect(page).toContain('areaStatuses: statusAreas');
  });

  it('shows the rooms grouped by location, in the form and in the report', () => {
    expect(page.match(/groupAreasByLocation\(/g) ?? []).toHaveLength(2);
  });

  it('names the affected rooms in the log table', () => {
    expect(page).toContain('Theatres &amp; areas');
    expect(page).toContain('summariseAreas(areas, 2)');
  });

  it('stores the areas and still writes the old columns', () => {
    expect(api).toContain('areaStatuses: areas.length > 0 ? JSON.stringify(areas) : null');
    expect(api).toContain('legacyColumnsFor(areas)');
    expect(schema).toContain('areaStatuses String?');
  });

  it('accepts a log from a client that has not been reloaded yet', () => {
    // A plumber mid-shift with the old page open must not meet a validation
    // error; the seven fields they do send still stand.
    expect(api).toMatch(/\}\)\)\.optional\(\),/);
  });

  it('names the rooms in the critical alert', () => {
    // "Water supply is CRITICAL" does not tell a theatre manager reading it
    // at 6am whether their list can run. Since 6 November this alert fires
    // only where no individual room was faulted -- the escalation names them
    // otherwise -- so what it reports is that every room was checked and
    // found OK, which is the useful thing to say about a supply-level alarm.
    expect(api).toContain('Rooms: ${summariseAreas(areas, 6)}');
  });
});
