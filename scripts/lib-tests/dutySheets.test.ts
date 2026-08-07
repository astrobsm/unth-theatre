/**
 * The duty sheets — one printable page per staff group.
 *
 * These exist because the workflow was not being followed: two patient
 * movements recorded in a fortnight, across a hospital running full lists.
 * The sheets are only useful if they are TRUE and COMPLETE, and both
 * properties rot silently:
 *
 *   A role added to the schema gets no sheet, and nobody notices until that
 *   group is the one not recording anything.
 *
 *   A sheet naming a role that does not exist matches nobody. That had
 *   already happened once — the Ward Nurse sheet listed 'NURSE' and
 *   'WARD_NURSE', neither of which is in UserRole, so it silently reached
 *   no one.
 *
 *   A sheet pointing at a screen its own group cannot open is worse than one
 *   that names no screen at all. That had happened too: the cleaner sheet
 *   sent cleaners to Theatre Reception, which CLEANER did not have.
 *
 * Nothing here checks wording. It checks the three things that go wrong
 * without anybody seeing them.
 */
import { describe, expect, it } from 'vitest';
// Namespace imports: the test harness transpiles without esModuleInterop, so
// a default import of a node builtin lands as undefined.
import * as fs from 'fs';
import * as path from 'path';

import { criticalCount, DUTY_SHEETS, sheetById, sheetsForRole } from './workflowDuties';
import { MODULES, FULL_ACCESS_ROLES } from './modules';

const ROOT = path.resolve(__dirname, '..', '..');

/** Every role the application actually has, read from the schema. */
function schemaRoles(): string[] {
  const schema = fs.readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
  const block = /enum UserRole \{([\s\S]*?)\n\}/.exec(schema);
  if (!block) throw new Error('UserRole enum not found in schema.prisma');
  return block[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'))
    .map((l) => l.split(/\s/)[0]);
}

const ROLES = schemaRoles();

describe('coverage', () => {
  it('gives every role in the schema a sheet', () => {
    const covered = new Set(DUTY_SHEETS.flatMap((s) => s.roles));
    const missing = ROLES.filter((r) => !covered.has(r));
    expect(missing).toEqual([]);
  });

  it('names no role that does not exist', () => {
    const bogus = [...new Set(DUTY_SHEETS.flatMap((s) => s.roles))].filter(
      (r) => !ROLES.includes(r)
    );
    expect(bogus).toEqual([]);
  });

  it('leaves exactly one sheet unmatched to a login, and it is the ward one', () => {
    // Ward staff work from the call-up printout, not from an account. The
    // sheet is printed FOR them. Any OTHER sheet with no roles is a mistake.
    const unmatched = DUTY_SHEETS.filter((s) => s.roles.length === 0).map((s) => s.id);
    expect(unmatched).toEqual(['ward-nurse']);
  });

  it('finds a sheet for any role somebody can actually log in as', () => {
    for (const role of ROLES) {
      expect(sheetsForRole(role).length).toBeGreaterThan(0);
    }
  });
});

describe('the shape of a sheet', () => {
  it('has no duplicate ids', () => {
    const ids = DUTY_SHEETS.map((s) => s.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('gives every duty a when and a why', () => {
    for (const sheet of DUTY_SHEETS) {
      for (const duty of sheet.duties) {
        expect(duty.task.length).toBeGreaterThan(0);
        expect(duty.when.length).toBeGreaterThan(0);
        // The reason is the part that changes behaviour. A flyer of bare
        // imperatives is ignored by exactly the staff who most need it.
        expect(duty.why.length).toBeGreaterThan(20);
      }
    }
  });

  it('keeps every sheet to what fits on one page', () => {
    // The generator steps the type down and trims reasoning rather than
    // spilling onto a second page, but past roughly seven duties even that
    // fails. A second page is a page nobody reads.
    for (const sheet of DUTY_SHEETS) {
      expect(sheet.duties.length).toBeGreaterThanOrEqual(3);
      expect(sheet.duties.length).toBeLessThanOrEqual(7);
    }
  });

  it('marks at least one duty critical on every sheet', () => {
    // If nothing on a sheet is critical, the group has been given a list of
    // suggestions rather than a duty.
    for (const sheet of DUTY_SHEETS) {
      expect(criticalCount(sheet)).toBeGreaterThan(0);
    }
  });

  it('looks a sheet up by id', () => {
    expect(sheetById('porter')?.title).toBe('Porter');
    expect(sheetById('no-such-sheet')).toBeUndefined();
  });
});

describe('where the flyers send people', () => {
  const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  /** The module a "where" refers to, matched on its leading label. */
  function moduleFor(where: string) {
    const head = normalise(where.split('→')[0].replace(/,.*/, ''));
    return (
      MODULES.find((m) => normalise(m.label) === head) ??
      MODULES.find((m) => normalise(m.label).includes(head) || head.includes(normalise(m.label)))
    );
  }

  it('names a real screen every time', () => {
    const unknown: string[] = [];
    for (const sheet of DUTY_SHEETS) {
      for (const duty of sheet.duties) {
        if (duty.where && !moduleFor(duty.where)) unknown.push(`${sheet.id}: ${duty.where}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('never sends a group to a screen its own role cannot open', () => {
    const denied: string[] = [];
    for (const sheet of DUTY_SHEETS) {
      for (const duty of sheet.duties) {
        if (!duty.where) continue;
        const mod = moduleFor(duty.where);
        if (!mod) continue;
        if (mod.defaultRoles.includes('*')) continue;
        for (const role of sheet.roles) {
          const allowed =
            mod.defaultRoles.includes(role) ||
            (FULL_ACCESS_ROLES as readonly string[]).includes(role);
          if (!allowed) denied.push(`${sheet.id}: ${role} cannot open ${mod.label}`);
        }
      }
    }
    expect(denied).toEqual([]);
  });
});
