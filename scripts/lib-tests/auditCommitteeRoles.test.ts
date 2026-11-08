import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { AUDIT_COMMITTEE_ROLES, CMD_ROLES } from '../../src/lib/emergencyEscalation';
import { ONBOARDING_ROLES } from '../../src/lib/onboarding-roles';
import { MODULES, canAccessPath } from '../../src/lib/modules';

/**
 * The Theatre Audit Committee sees the emergencies that never started.
 *
 * It is named by ROLE rather than by a list of people, so the membership has to
 * be real roles, every one of them selectable when somebody registers, and each
 * able to reach the page. A committee role that cannot be assigned to anybody,
 * or that is assigned and then cannot open the board, is a seat nobody fills.
 */
const REPO = path.join(__dirname, '..', '..');
const schema = fs.readFileSync(path.join(REPO, 'prisma', 'schema.prisma'), 'utf8');

/** The UserRole enum as the database actually defines it. */
const dbRoles = (() => {
  const m = schema.match(/enum\s+UserRole\s*\{([\s\S]*?)\n\}/);
  if (!m) throw new Error('UserRole enum not found');
  return m[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//') && !l.startsWith('///'));
})();

describe('every committee role is a real role', () => {
  it('exists in the database enum', () => {
    // A role in this list that the column cannot store is a seat nobody fills.
    for (const r of AUDIT_COMMITTEE_ROLES) {
      expect(dbRoles, `${r} missing from UserRole`).toContain(r);
    }
  });

  /**
   * The executive seats are NOT self-registerable, deliberately. Anyone who
   * could pick "Chief Medical Director" on the registration form could grant
   * themselves the top of the escalation ladder; those accounts are created by
   * an administrator instead.
   */
  const ADMIN_CREATED_ONLY = ['CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC'];

  it('can be chosen when somebody registers, except the executive seats', () => {
    const selectable = new Set(ONBOARDING_ROLES.map((r) => r.value));
    for (const r of AUDIT_COMMITTEE_ROLES) {
      if (ADMIN_CREATED_ONLY.includes(r)) continue;
      expect(selectable, `${r} cannot be selected at registration`).toContain(r);
    }
  });

  it('does not let anybody register as an executive', () => {
    const selectable = new Set(ONBOARDING_ROLES.map((r) => r.value));
    for (const r of ADMIN_CREATED_ONLY) {
      expect(selectable, `${r} must not be self-registerable`).not.toContain(r);
    }
  });

  /**
   * Bulk upload keeps its OWN hardcoded role list, separate from
   * ONBOARDING_ROLES, so the two can drift apart without anything noticing.
   * It matters more than the registration form, not less: the route admits a
   * THEATRE_MANAGER, so an executive seat reachable there could be filled by
   * somebody well below the officer whose seat it is.
   */
  it('cannot be created by bulk upload either', () => {
    const route = fs.readFileSync(
      path.join(REPO, 'src/app/api/users/bulk-upload/route.ts'), 'utf8',
    );
    const list = /const validRoles = \[([\s\S]*?)\];/.exec(route);
    expect(list, 'validRoles not found in the bulk-upload route').toBeTruthy();
    for (const r of ADMIN_CREATED_ONLY) {
      expect(list![1], `${r} must not be bulk-uploadable`).not.toContain(`'${r}'`);
    }
    // And the guard is only worth anything if the list is really being read.
    expect(list![1]).toContain("'SURGEON'");
  });

  /**
   * The one path that MAY create these accounts. If the script ever widened to
   * ADMIN or SYSTEM_ADMINISTRATOR it would be a back door with a helpful
   * comment on it, so the set it accepts is pinned here.
   */
  it('is created only by the executive-accounts script, and only these three', () => {
    const script = fs.readFileSync(
      path.join(REPO, 'scripts/create-executive-accounts.ts'), 'utf8',
    );
    const m = /const EXECUTIVE_ROLES = \[([\s\S]*?)\] as const;/.exec(script);
    expect(m, 'EXECUTIVE_ROLES not found in the script').toBeTruthy();
    const allowed = (m![1].match(/'([A-Z_]+)'/g) ?? []).map((x) => x.replace(/'/g, ''));
    expect(allowed.sort()).toEqual([...ADMIN_CREATED_ONLY].sort());
    // It must refuse anything else rather than fall through to creating it.
    expect(script).toContain('is not an executive seat');
    // And never quietly promote an existing account into the seat.
    expect(script).toContain('will not change an existing non-executive account');
  });

  it('has a distinct staff-code prefix', () => {
    // Two roles sharing a prefix makes staff codes ambiguous.
    const prefixes = ONBOARDING_ROLES.map((r) => r.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});

describe('the committee can actually open the board', () => {
  const PATH = '/dashboard/emergency-escalations';

  it('has a module covering the page', () => {
    const mod = MODULES.find((m) => m.paths.includes(PATH));
    expect(mod, 'no module grants access to the delayed-emergencies page').toBeTruthy();
  });

  for (const role of AUDIT_COMMITTEE_ROLES) {
    it(`${role} may open it`, () => {
      expect(canAccessPath(role, [], PATH)).toBe(true);
    });
  }

  it('a scrub nurse may not', () => {
    // The committee is a committee, not everybody.
    expect(canAccessPath('SCRUB_NURSE', [], PATH)).toBe(false);
    expect(canAccessPath('PORTER', [], PATH)).toBe(false);
  });
});

describe('seeing is not sending', () => {
  const api = fs.readFileSync(
    path.join(REPO, 'src/app/api/emergency-escalation/invitations/route.ts'),
    'utf8',
  );

  it('the committee may read the board', () => {
    expect(api).toContain('VIEWER_ROLES');
    expect(api).toContain('AUDIT_COMMITTEE_ROLES');
  });

  it('but only administrators may mark an invitation sent', () => {
    // A committee that can summon its own witnesses with no administrator's
    // hand on it is a different thing from a committee.
    const post = api.slice(api.indexOf('export async function POST'));
    expect(post).toContain('SENDER_ROLES.includes(role)');
    expect(post).not.toContain('VIEWER_ROLES');
  });
});

describe('who the second rung tells', () => {
  it('is the Chief Medical Director', () => {
    expect(CMD_ROLES).toContain('CHIEF_MEDICAL_DIRECTOR');
    for (const r of CMD_ROLES) expect(dbRoles).toContain(r);
  });
});

describe('the services a delayed case waits on are represented', () => {
  it('covers anaesthesia, surgery, O&G, pharmacy, CSSD, oxygen, works, power and packs', () => {
    // A delay is as often oxygen, power, sterile supply or a missing pack as it
    // is a surgeon, and the point of the committee seeing it is that the cause
    // is usually theirs to fix.
    for (const r of [
      'HEAD_OF_ANAESTHESIA', 'HEAD_OF_SURGERY', 'HEAD_OF_OBSTETRICS_GYNAECOLOGY', 'HEAD_OF_PHARMACY',
      'CSSD_SUPERVISOR', 'OXYGEN_UNIT_SUPERVISOR', 'WORKS_SUPERVISOR', 'POWER_PLANT_OPERATOR',
      'CONSUMABLE_PACK_PROVIDER', 'CMAC',
    ]) {
      expect(AUDIT_COMMITTEE_ROLES as readonly string[]).toContain(r);
    }
  });
});
