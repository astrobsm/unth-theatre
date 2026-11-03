/**
 * Grouping the day's list by subspecialty, and opening the form on one case.
 *
 * Two requests from the theatre on 3 November, and one of them was a bug:
 *
 *   "group the cases to be reviewed based on subspecialties"
 *
 *   "modify such that when i click on open review form, it fetched the
 *   patients detail against which i have clicked for the form to be opened
 *   ready for review"
 *
 * The unit and subspecialty strings below are the shapes this hospital's
 * booking table actually holds — they are here because they are the reason
 * this cannot be a one-line groupBy: half the rows carry a unit name in the
 * subspecialty column. No patient is named anywhere in this file; the cases
 * are lettered, because a test fixture is not a place for a folder number.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  subspecialtyGroupOf,
  groupCasesBySubspecialty,
} from '../../src/lib/anaesthesia/caseGrouping';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

/** One day's list, in the shapes the live table uses. */
const A_DAY = [
  { id: 'a', unit: 'GS Unit II', subspecialty: 'General Surgery' },
  { id: 'b', unit: 'ENT Unit I', subspecialty: 'ENT (Otorhinolaryngology)' },
  { id: 'c', unit: 'ENT Unit I', subspecialty: 'ENT (Otorhinolaryngology)' },
  { id: 'd', unit: 'CTU Unit II', subspecialty: 'Cardiothoracic Surgery' },
  { id: 'e', unit: 'Maxillo Unit I', subspecialty: 'Maxillofacial Surgery' },
  { id: 'f', unit: 'O&G Firm 3', subspecialty: 'Obstetrics & Gynaecology' },
  // These two carry the UNIT NAME in the subspecialty column, as live rows do.
  { id: 'g', unit: 'Neuro Unit III', subspecialty: 'Neuro Unit III' },
  { id: 'h', unit: 'GS Unit III', subspecialty: 'GS Unit III' },
];

describe('which heading a case belongs under', () => {
  it('reads a real subspecialty straight off the booking', () => {
    expect(subspecialtyGroupOf({ subspecialty: 'Cardiothoracic Surgery', unit: 'CTU Unit II' }))
      .toBe('Cardiothoracic Surgery');
  });

  it('resolves a unit name sitting in the subspecialty column', () => {
    // Many of this hospital's rows look like this, and a plain groupBy would
    // produce "Neuro Unit III" and "Neurosurgery" as two separate specialties
    // on the same list.
    expect(subspecialtyGroupOf({ subspecialty: 'Neuro Unit III', unit: 'Neuro Unit III' }))
      .toBe('Neurosurgery');
    expect(subspecialtyGroupOf({ subspecialty: 'GS Unit III', unit: 'GS Unit III' }))
      .toBe('General Surgery');
  });

  it('falls back to the unit when the subspecialty is blank', () => {
    expect(subspecialtyGroupOf({ subspecialty: null, unit: 'Uro Unit II' })).toBe('Urology');
    expect(subspecialtyGroupOf({ subspecialty: '   ', unit: 'O&G Firm 3' }))
      .toBe('Obstetrics & Gynaecology');
  });

  it('keeps the raw text rather than inventing an "Other" bucket', () => {
    // A heading of "Dental Unit" tells an anaesthetist whose cases those are.
    // "Other" tells them nothing, and is where a case goes to be overlooked.
    expect(subspecialtyGroupOf({ subspecialty: 'Dental Unit', unit: 'Dental Unit' }))
      .toBe('Dental Unit');
  });

  it('never returns an empty heading', () => {
    expect(subspecialtyGroupOf({ subspecialty: null, unit: null })).toBe('Unassigned');
    expect(subspecialtyGroupOf({ subspecialty: '', unit: '' })).toBe('Unassigned');
  });
});

describe("the day's list", () => {
  const groups = groupCasesBySubspecialty(A_DAY, (c) => c.id === 'b');

  it('loses nothing', () => {
    // A grouping that drops a case is worse than none, because the list still
    // looks complete.
    const total = groups.reduce((n, g) => n + g.cases.length, 0);
    expect(total).toBe(A_DAY.length);
    const ids = groups.flatMap((g) => g.cases.map((c) => c.id)).sort();
    expect(ids).toEqual(A_DAY.map((c) => c.id).sort());
  });

  it('puts the two ENT cases together under one heading', () => {
    const ent = groups.find((g) => g.name === 'ENT (Otorhinolaryngology)');
    expect(ent?.cases.map((c) => c.id)).toEqual(['b', 'c']);
  });

  it('files the two General Surgery cases under one heading, not two', () => {
    // 'General Surgery' and 'GS Unit III' are the same specialty.
    const names = groups.map((g) => g.name);
    expect(names.filter((n) => n === 'General Surgery')).toHaveLength(1);
    expect(groups.find((g) => g.name === 'General Surgery')?.cases).toHaveLength(2);
    expect(names).not.toContain('GS Unit III');
  });

  it('counts what is still to be reviewed, which is what the reader wants', () => {
    const ent = groups.find((g) => g.name === 'ENT (Otorhinolaryngology)');
    expect(ent?.cases).toHaveLength(2);
    expect(ent?.outstanding).toBe(1); // 'b' is reviewed
    expect(groups.find((g) => g.name === 'Neurosurgery')?.outstanding).toBe(1);
  });

  it('keeps the order the theatre runs in, inside each group', () => {
    // The caller has already sorted by theatre, unit, list order and time.
    // Grouping must not shuffle that.
    const ent = groups.find((g) => g.name === 'ENT (Otorhinolaryngology)');
    expect(ent?.cases[0].id).toBe('b');
    expect(ent?.cases[1].id).toBe('c');
  });

  it('lists the specialties alphabetically', () => {
    expect(groups.map((g) => g.name)).toEqual([...groups.map((g) => g.name)].sort());
  });

  it('survives an empty day', () => {
    expect(groupCasesBySubspecialty([], () => false)).toEqual([]);
  });
});

describe('Open Review Form opens on the case it was pressed against', () => {
  const page = read('src/app/dashboard/preop-reviews/new/page.tsx');

  it('fetches the named case by id rather than hunting the dropdown list', () => {
    // THE BUG. This used to look the id up in the form's own list, fetched as
    // ?status=SCHEDULED. The case in the report was COMPLETED, because the
    // list the button sits on shows every case booked for the day whatever
    // its status. So the id was never in the list and the effect did nothing:
    // no selection, no message, no clue.
    expect(page).toMatch(/\/api\/surgeries\?id=\$\{encodeURIComponent\(preselectedSurgeryId\)\}/);
  });

  it('adds the case to the options so it can be seen as well as selected', () => {
    const effect = page.slice(page.indexOf('if (!preselectedSurgeryId) return;'));
    expect(effect.slice(0, 2500)).toContain('setSurgeries((prev)');
    expect(effect.slice(0, 2500)).toContain('setSelectedSurgeryId(one.id)');
  });

  it('says so when the case cannot be opened, instead of an empty dropdown', () => {
    // An empty "-- Select a surgery --" where a patient was expected reads as
    // a broken page: there is no way to tell whether to wait or start again.
    expect(page).toMatch(/That case could not be opened/);
    expect(page).toMatch(/That case could not be loaded/);
  });

  it('does not re-fetch a case the list already holds', () => {
    const effect = page.slice(page.indexOf('if (!preselectedSurgeryId) return;'));
    const head = effect.slice(0, 600);
    expect(head).toContain('surgeries.find((s) => s.id === preselectedSurgeryId)');
    expect(head).toContain('return;');
  });
});

describe('the list page groups what it shows', () => {
  const page = read('src/app/dashboard/preop-reviews/page.tsx');

  it('uses the shared rule rather than a second copy of it', () => {
    expect(page).toContain("from '@/lib/anaesthesia/caseGrouping'");
    expect(page).toContain('groupCasesBySubspecialty(bookedSurgeries');
  });

  it('asks the server for the field it groups on', () => {
    // The API already returns subspecialty; the page's own type did not
    // declare it, so it was being thrown away on the way in.
    expect(page).toMatch(/subspecialty\?: string \| null;/);
  });
});
