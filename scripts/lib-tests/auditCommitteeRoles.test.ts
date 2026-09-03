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
