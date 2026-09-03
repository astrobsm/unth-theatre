import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { mergeManageable } from '../../src/lib/rosterSupervisors';
import { ROSTER_ADMIN_ROLES, ROSTER_DEPARTMENTS, canManageRosterDept, getRosterDept } from '../../src/lib/rosterDepartments';

/**
 * A departmental supervisor may edit and publish ONE roster.
 *
 * Before this, authority was role-only, so the only way to let somebody run the
 * porters' rota was to make them a THEATRE_MANAGER — handing over every other
 * theatre-manager power in the system as the price of one duty roster.
 *
 * This is a permission, so the parts that can be proved are proved, and the
 * parts that cannot (they need a database) are pinned by reading the source:
 * the routes were edited mechanically across six files and a missed call site
 * would be an authorisation hole rather than a cosmetic bug.
 */
const REPO = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8');

describe('which departments a person may manage', () => {
  const known = ROSTER_DEPARTMENTS.map((d) => d.slug);

  it('adds supervised departments to the ones the role already gives', () => {
    expect(mergeManageable(['pharmacy'], ['porters'], known).sort()).toEqual(['pharmacy', 'porters']);
  });

  it('never removes what the role already allowed', () => {
    // This may only ever ADD authority. A theatre manager who supervises
    // nothing must still manage everything they did before.
    const byRole = ROSTER_DEPARTMENTS.filter((d) => canManageRosterDept(d, 'THEATRE_MANAGER')).map((d) => d.slug);
    expect(byRole.length).toBeGreaterThan(0);
    expect(mergeManageable(byRole, [], known).sort()).toEqual([...byRole].sort());
  });

  it('does not list a department twice', () => {
    const out = mergeManageable(['porters'], ['porters'], known);
    expect(out).toEqual(['porters']);
  });

  it('drops a grant whose department no longer exists', () => {
    // Departments live in code. One can be renamed out from under a grant, and
    // returning the dead slug would send the person to a 404 with no clue why.
    expect(mergeManageable([], ['a-department-that-was-renamed'], known)).toEqual([]);
    expect(getRosterDept('a-department-that-was-renamed')).toBeUndefined();
  });

  it('gives an unprivileged person nothing without a grant', () => {
    expect(mergeManageable([], [], known)).toEqual([]);
    expect(canManageRosterDept(getRosterDept('porters'), 'PORTER')).toBe(false);
  });
});

describe('every roster route asks about the person, not just the role', () => {
  const ROUTES = [
    'src/app/api/roster/departments/[dept]/route.ts',
    'src/app/api/roster/departments/[dept]/bulk/route.ts',
    'src/app/api/roster/departments/[dept]/copy/route.ts',
    'src/app/api/roster/departments/[dept]/publish/route.ts',
    'src/app/api/roster/departments/[dept]/template/route.ts',
    'src/app/api/roster/departments/[dept]/versions/route.ts',
  ];

  for (const r of ROUTES) {
    it(`${r.split('/').slice(-2).join('/')} uses the supervisor-aware check`, () => {
      const src = read(r);
      expect(src).toContain('canManageRosterDeptFor');
      // A leftover role-only guard is an authorisation hole: the supervisor is
      // refused on that one action with no indication why.
      expect(/canManageRosterDept\(/.test(src.replace(/canManageRosterDeptFor\(/g, ''))).toBe(false);
    });
  }

  it('the supervisor-aware check is awaited everywhere it is used', () => {
    // A forgotten await yields a Promise, which is truthy, which would let
    // ANYONE past the guard. That is the worst available failure here.
    for (const r of ROUTES) {
      const src = read(r);
      for (const m of src.matchAll(/(.{8})canManageRosterDeptFor\(/g)) {
        expect(m[1], `${r}: unawaited call`).toMatch(/await\s*$|await\s\(?$/);
      }
    }
  });
});

describe('who may appoint a supervisor', () => {
  const api = read('src/app/api/roster/supervisors/route.ts');

  it('is restricted to the roster admins', () => {
    expect(api).toContain('ASSIGNER_ROLES = ROSTER_ADMIN_ROLES');
    expect(ROSTER_ADMIN_ROLES).toContain('ADMIN');
    expect(ROSTER_ADMIN_ROLES).toContain('THEATRE_MANAGER');
  });

  it('does not let a supervisor appoint further supervisors', () => {
    // An authority that can grant itself onward is not a delegation, it is a
    // second admin role with a quieter name.
    expect(api).not.toContain('canManageRosterDeptFor');
  });

  it('records both appointment and removal', () => {
    expect(api).toContain('ROSTER_SUPERVISOR_ASSIGNED');
    expect(api).toContain('ROSTER_SUPERVISOR_REMOVED');
  });
});

describe('the new table replicates the way permissions must', () => {
  it('is classified, and classified as cloud-authoritative', () => {
    const policy = read('src/lib/sync/syncPolicy.ts');
    expect(policy).toContain("table: 'roster_supervisors', cls: 'CLOUD_AUTHORITATIVE'");
  });

  it('captures on the cloud only, so a local grant cannot travel upward', () => {
    // The same construction identity uses: the theatre server never journals
    // the table, so it has nothing to send, so a privilege written on the node
    // with weaker physical security cannot reach the cloud.
    const migration = read('prisma/migrations/20260903090000_roster_supervisors/migration.sql');
    expect(migration).toContain("IF this_node = 'cloud' THEN");
    expect(migration).toContain("sync_enable_table('roster_supervisors')");
  });
});
