/**
 * The crash that blanked the staff availability board.
 *
 *   TypeError: Cannot read properties of undefined (reading 'replace')
 *     at Array.map  ->  roles.map((r) => ... r.replace(/_/g, ' '))
 *
 * `roles` is derived — Array.from(new Set(staff.map(s => s.role))) — so it
 * contains exactly what the API sent. One row arrived without a role, the map
 * threw, and React unmounted the WHOLE PAGE. Not the row: the page. The board
 * that tells a theatre who is available showed nothing at all.
 *
 * User.role is non-null in the schema, which is precisely why this was not
 * caught: the type said it could not happen, so nothing guarded it, and the
 * guarantee did not survive the round trip to the browser.
 *
 * The rule these tests hold: a list DERIVED from fetched data and then fed to
 * a string method must drop the values that are not strings. A filter short by
 * one entry is a smaller loss than a blank screen, and a page that renders
 * only while every row is perfect will go blank again for the next reason.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8');

const AVAILABILITY = read('src/app/dashboard/staff-availability/page.tsx');
const ACCESS = read('src/app/dashboard/admin/access/page.tsx');

/** The fix, as the pages implement it. */
const derive = (rows: { role?: string | null }[]) =>
  Array.from(
    new Set(rows.map((r) => r.role).filter((r): r is string => typeof r === 'string' && r !== '')),
  ).sort();

describe('deriving a role list from fetched rows', () => {
  it('survives a row that arrived without a role', () => {
    // The production case. Before the fix this threw on the next .replace().
    const rows = [{ role: 'SCRUB_NURSE' }, {}, { role: 'ANAESTHETIST' }];
    const roles = derive(rows);
    expect(roles).toEqual(['ANAESTHETIST', 'SCRUB_NURSE']);
    expect(() => roles.map((r) => r.replace(/_/g, ' '))).not.toThrow();
  });

  it('survives null and empty string too', () => {
    // null comes from a column that drifted nullable; '' from a blank import.
    expect(derive([{ role: null }, { role: '' }, { role: 'PORTER' }])).toEqual(['PORTER']);
  });

  it('keeps every real role exactly once', () => {
    expect(derive([{ role: 'A' }, { role: 'A' }, { role: 'B' }])).toEqual(['A', 'B']);
  });

  it('returns nothing rather than throwing when no row has a role', () => {
    expect(derive([{}, { role: null }])).toEqual([]);
  });
});

describe('the two pages that derive such a list', () => {
  it('filter before the list reaches a string method', () => {
    for (const [name, src] of [
      ['staff availability', AVAILABILITY],
      ['module access admin', ACCESS],
    ] as const) {
      expect(src, name).toContain(".filter((r): r is string => typeof r === 'string' && r !== '')");
    }
  });

  it('no longer map an unfiltered set straight off the rows', () => {
    // The exact expression that crashed, in both places it appeared.
    expect(AVAILABILITY).not.toContain('Array.from(new Set(staff.map((s) => s.role))).sort()');
    expect(ACCESS).not.toContain('Array.from(new Set(users.map((u) => u.role))).sort()');
  });

  it('show a row with no role rather than hiding or crashing on it', () => {
    // Blank would be worse than wrong: nobody can fix a record they cannot
    // see is broken.
    expect(AVAILABILITY).toContain("'Role not recorded'");
  });

  it('stop the type claiming a guarantee the page cannot rely on', () => {
    // The schema's NOT NULL is true of the database, not of what reaches the
    // browser. A type that insists otherwise only stops the compiler helping.
    expect(AVAILABILITY).toMatch(/role\?: string \| null;/);
    expect(ACCESS).toContain('function formatRole(role: string | null | undefined)');
  });
});
