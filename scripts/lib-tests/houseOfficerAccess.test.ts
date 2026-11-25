/**
 * House officers have a surgeon's access, and may close a case.
 *
 * On instruction, 25 November 2026: "grant access for house officers to make
 * cases as completed and to have same access as surgeons."
 *
 * WHY THIS FILE IS MOSTLY ABOUT ONE LINE. The grant is a single entry in
 * ROLE_INHERITS -- HOUSE_OFFICER: ['SURGEON'] -- and it only works because
 * every role gate that names SURGEON now asks roleAllowed(), which expands
 * that map. Fifty-five of those gates were written as a bare
 * `ALLOWED.includes(session.user.role)`, which cannot see inheritance; they
 * were converted in the same change. The last test here is the one that
 * matters six months from now: it fails if somebody writes a new SURGEON gate
 * the old way, because that gate would lock house officers out of one screen
 * and nothing else would notice.
 *
 * WHAT IS DELIBERATELY NOT GRANTED. A house officer is not a surgeon, only
 * given a surgeon's reach. They stay out of SURGEON_ROLES, so they are not
 * offered in the operating-surgeon picker, are not recorded as the surgeon on
 * a case they create, and are not counted as a surgeon in the research
 * figures. Tests for each, below -- because "same access as surgeons" read
 * loosely would have put a house officer's name in the Surgeon column of a
 * report that goes to Management.
 */
import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  ROLE_INHERITS,
  SURGEON_ROLES,
  effectiveRoles,
  isSurgeonRole,
  roleAllowed,
  roleSatisfies,
  seniorityLabel,
} from '../../src/lib/roleGroups';
import { MODULES, resolveAllowedModuleIds } from '../../src/lib/modules';
import { DUTY_SHEETS } from '../../src/lib/workflowDuties';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('a house officer stands in for a surgeon', () => {
  it('inherits SURGEON, in the one place that decides it', () => {
    expect(ROLE_INHERITS.HOUSE_OFFICER).toEqual(['SURGEON']);
    expect(effectiveRoles('HOUSE_OFFICER')).toContain('SURGEON');
    expect(roleSatisfies('HOUSE_OFFICER', 'SURGEON')).toBe(true);
  });

  it('is a real role in the schema, not a string somebody hoped for', () => {
    const schema = read('prisma/schema.prisma');
    const enumBlock = schema.slice(
      schema.indexOf('enum UserRole'),
      schema.indexOf('}', schema.indexOf('enum UserRole')),
    );
    expect(enumBlock).toContain('HOUSE_OFFICER');
  });

  it('opens every module a surgeon opens', () => {
    // THE INSTRUCTION, measured. Before this change a house officer was named
    // in 13 of the 26 modules a surgeon is named in -- so they could book a
    // case and then not open the checklist, the holding area or the theatre
    // reception screen for it.
    const surgeon = resolveAllowedModuleIds('SURGEON', []);
    const houseOfficer = resolveAllowedModuleIds('HOUSE_OFFICER', []);
    const missing = [...surgeon].filter((m) => !houseOfficer.has(m));
    expect(missing).toEqual([]);
    expect(surgeon.size).toBeGreaterThan(20);
  });

  it('does not thereby open the whole application', () => {
    // Proof that this is parity and not a blanket grant. None of these name
    // SURGEON, so a house officer must not reach them either.
    const houseOfficer = resolveAllowedModuleIds('HOUSE_OFFICER', []);
    for (const id of ['users', 'settings', 'audit-logs']) {
      const mod = MODULES.find((m) => m.id === id);
      if (!mod) continue; // Module renamed; the ones that exist still hold.
      expect(
        (mod.defaultRoles as readonly string[]).includes('*')
          || !houseOfficer.has(mod.id),
      ).toBe(true);
    }
  });

  it('reaches nothing that is consultant-only', () => {
    // Inheritance points one way. A house officer stands in for SURGEON and
    // SURGEON does not stand in for CONSULTANT_SURGEON, so the consultant-only
    // gates stay shut -- which is what surgeon parity means.
    expect(roleAllowed('HOUSE_OFFICER', ['CONSULTANT_SURGEON'])).toBe(false);
    const analytics = read('src/app/api/theatre-ops/analytics/route.ts');
    const canView = analytics.slice(
      analytics.indexOf('const CAN_VIEW'),
      analytics.indexOf('];', analytics.indexOf('const CAN_VIEW')),
    );
    expect(canView).toContain('CONSULTANT_SURGEON');
    expect(canView).not.toContain("'SURGEON'");
  });
});

describe('closing a case', () => {
  const route = read('src/app/api/surgeries/[id]/complete/route.ts');

  it('is decided by roleAllowed, so inheritance is seen', () => {
    expect(route).toContain('roleAllowed(session.user.role, ALLOWED)');
    expect(route).not.toContain('ALLOWED.includes(');
  });

  it('admits a house officer through the surgeon entry in that list', () => {
    const list = route.slice(
      route.indexOf('const ALLOWED = ['),
      route.indexOf('];', route.indexOf('const ALLOWED = [')),
    );
    expect(list).toContain("'SURGEON'");
    // Re-stated as behaviour, not just as the presence of a word: this is the
    // actual function the route calls, on the actual list it calls it with.
    const roles = Array.from(list.matchAll(/'([A-Z_]+)'/g)).map((m) => m[1]);
    expect(roleAllowed('HOUSE_OFFICER', roles)).toBe(true);
    expect(roleAllowed('HEAD_OF_SURGERY', roles)).toBe(true);
    // Not everybody: a porter still cannot close a case.
    expect(roleAllowed('PORTER', roles)).toBe(false);
    expect(roleAllowed('CLEANER', roles)).toBe(false);
  });

  it('shows the button to the people the route would accept', () => {
    // A button that 403s is worse than no button. Both surgery screens decide
    // it the same way the route does.
    for (const page of [
      'src/app/dashboard/surgeries/page.tsx',
      'src/app/dashboard/surgeries/[id]/page.tsx',
    ]) {
      const src = read(page);
      const line = src.split('\n').find((l) => l.includes('canCompleteSurgery'));
      expect(line, page).toContain('roleAllowed(');
    }
  });

  it('tells a house officer it is their job', () => {
    const sheet = DUTY_SHEETS.find((s) => s.roles.includes('HOUSE_OFFICER'));
    expect(sheet).toBeTruthy();
    const tasks = sheet!.duties.map((d) => d.task.toLowerCase()).join(' | ');
    expect(tasks).toContain('completed');
  });
});

describe('a house officer is still not a surgeon', () => {
  it('is not offered as the operating surgeon', () => {
    expect((SURGEON_ROLES as readonly string[])).not.toContain('HOUSE_OFFICER');
    expect(isSurgeonRole('HOUSE_OFFICER')).toBe(false);
  });

  it('is not recorded as the surgeon on a case they open', () => {
    // isSurgeonRole decides whose name goes in the surgeon column when an
    // emergency booking is created by the person at the screen.
    for (const p of [
      'src/app/api/emergency-booking/route.ts',
      'src/app/api/emergency-alerts/route.ts',
    ]) {
      expect(read(p)).toContain('isSurgeonRole(session.user.role)');
    }
  });

  it('carries no seniority label, because the grade is its own', () => {
    expect(seniorityLabel('HOUSE_OFFICER')).toBeNull();
    expect(seniorityLabel('SURGEON')).toBe('Resident');
  });
});

describe('a house officer account can actually be created', () => {
  it('can be registered, bulk-uploaded, assigned by an admin, and read about', () => {
    // The four lists that have drifted apart before. A role missing from the
    // second cannot be uploaded a cohort at a time, which is the only way
    // house officers ever arrive.
    expect(read('src/lib/onboarding-roles.ts')).toContain('HOUSE_OFFICER');
    expect(read('src/app/api/users/bulk-upload/route.ts')).toContain("'HOUSE_OFFICER'");
    expect(read('src/app/dashboard/users/page.tsx')).toContain('HOUSE_OFFICER');
    expect(read('src/app/role-guide/page.tsx')).toContain("id: 'HOUSE_OFFICER'");
  });
});

/**
 * THE REGRESSION GUARD, and the reason this file is worth its runtime.
 *
 * A role gate written as `LIST.includes(role)` cannot see ROLE_INHERITS. Every
 * such gate whose list names SURGEON is therefore a screen a house officer --
 * and a Head of Surgery -- is locked out of, with nothing on any screen to say
 * so. Fifty-five of them existed. This fails on the fifty-sixth.
 */
describe('no SURGEON gate may be written so that inheritance is ignored', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel, out);
      else if (/\.tsx?$/.test(entry.name)) out.push(rel);
    }
    return out;
  }

  it('finds none', () => {
    const offenders: string[] = [];
    for (const rel of walk('src')) {
      const src = read(rel);
      if (!src.includes('SURGEON') || !src.includes('.includes(')) continue;

      for (const m of src.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\.includes\(/g)) {
        const name = m[1];
        const decl = new RegExp(
          `(?:const|let|var)\\s+${name}\\b[^=]*=\\s*([\\s\\S]{0,900}?);`,
        ).exec(src);
        if (decl && decl[1].includes('SURGEON')) {
          offenders.push(`${rel}: ${name}.includes(...)`);
        }
      }
      // And the same written inline.
      for (const m of src.matchAll(/\[[^[\]]*['"]SURGEON['"][^[\]]*\]\s*\.includes\(/g)) {
        offenders.push(`${rel}: ${m[0].slice(0, 60)}…`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
