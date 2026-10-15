/**
 * The two things the review watch gets wrong silently.
 *
 * This suite does not touch a database. It guards the two assumptions the
 * runner makes about the schema, both of which fail invisibly:
 *
 *   A STATUS THAT IS NOT A STATUS. The first draft of the runner filtered on
 *   'CONFIRMED' and 'POSTPONED', neither of which is a SurgeryStatus. A cast
 *   to never[] hid it from the compiler, and the query would have thrown on
 *   the first night it ran — at 9pm, unattended, with nobody watching.
 *
 *   A GAP BETWEEN WATCHED AND SETTLED. The runner only looks at watched
 *   statuses; the rules only stand down for settled ones. A status in neither
 *   list is a case the watch never examines and never explains. A status in
 *   both is a case it examines and then immediately ignores.
 *
 * The schema is read from prisma/schema.prisma rather than from the generated
 * client, so the test fails when somebody adds a status, not when somebody
 * next regenerates.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

import { SETTLED_STATUSES } from '../../src/lib/anaesthesia/reviewWatch';
import { targetDay } from '../../src/lib/anaesthesia/reviewWatchRunner';

const SCHEMA = path.join(__dirname, '../../prisma/schema.prisma');

/** The members of an enum as the schema declares them. */
function enumMembers(name: string): string[] {
  const sql = fs.readFileSync(SCHEMA, 'utf8');
  const m = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(sql);
  if (!m) throw new Error(`enum ${name} not found in schema`);
  return m[1]
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .filter((l) => /^[A-Z_]+$/.test(l));
}

/**
 * Re-read from the runner's source rather than exported, because exporting it
 * purely to be tested would invite somebody to widen it from elsewhere.
 */
function watchedStatuses(): string[] {
  const src = fs.readFileSync(
    path.join(__dirname, '../../src/lib/anaesthesia/reviewWatchRunner.ts'), 'utf8',
  );
  const m = /const WATCHED_STATUSES = \[([^\]]*)\]/.exec(src);
  if (!m) throw new Error('WATCHED_STATUSES not found');
  return Array.from(m[1].matchAll(/'([A-Z_]+)'/g)).map((x) => x[1]);
}

describe('the statuses the watch filters on', () => {
  const all = enumMembers('SurgeryStatus');
  const watched = watchedStatuses();
  const settled = SETTLED_STATUSES as readonly string[];

  it('reads the schema at all', () => {
    expect(all).toContain('SCHEDULED');
    expect(all.length).toBeGreaterThan(3);
  });

  it('every watched status is a real SurgeryStatus', () => {
    // THE ONE THAT MATTERS. An invented literal here is a query that throws
    // at 9pm with nobody watching.
    expect(watched.filter((s) => !all.includes(s))).toEqual([]);
  });

  it('every settled status is a real SurgeryStatus', () => {
    expect(settled.filter((s) => !all.includes(s))).toEqual([]);
  });

  it('watched and settled do not overlap', () => {
    expect(watched.filter((s) => settled.includes(s))).toEqual([]);
  });

  it('watched and settled together cover every status', () => {
    // A status in neither list is a case the watch silently never examines.
    const covered = new Set([...watched, ...settled]);
    expect(all.filter((s) => !covered.has(s))).toEqual([]);
  });
});

describe('which day the watch looks at', () => {
  /** A WAT wall-clock moment as the UTC instant it really is. */
  const wat = (iso: string) => new Date(`${iso}+01:00`);

  it('looks at tomorrow when it runs in the evening', () => {
    expect(targetDay(wat('2026-10-14T19:00:00'))).toBe('2026-10-15');
    expect(targetDay(wat('2026-10-14T21:00:00'))).toBe('2026-10-15');
  });

  it('uses the WAT day, not the UTC one', () => {
    // 21:00 WAT on the 14th is 20:00Z the same day, so this one agrees either
    // way. 00:30 WAT on the 15th is 23:30Z on the 14th, and a UTC reading
    // would target the 15th when it should target the 16th.
    expect(targetDay(new Date('2026-10-14T23:30:00.000Z'))).toBe('2026-10-16');
  });

  it('rolls over a month end', () => {
    expect(targetDay(wat('2026-10-31T21:00:00'))).toBe('2026-11-01');
  });

  it('rolls over a year end', () => {
    expect(targetDay(wat('2026-12-31T21:00:00'))).toBe('2027-01-01');
  });

  it('handles a leap day', () => {
    expect(targetDay(wat('2028-02-28T21:00:00'))).toBe('2028-02-29');
    expect(targetDay(wat('2028-02-29T21:00:00'))).toBe('2028-03-01');
  });
});
