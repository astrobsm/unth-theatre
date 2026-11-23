/**
 * The Ward Nurse-in-Charge role, and the things that decide whether it is a
 * role or just an enum value.
 *
 * A role is only real when every one of these holds: the column can store it,
 * somebody can be given it, the holder can open the page the job is done on,
 * and the holder cannot open anything else. Miss one and you get a seat nobody
 * fills — which this repo has already produced eleven times over, and which the
 * audit-committee and booking-officer suites exist for the same reason.
 *
 * The role also needs one thing those two did not: a WARD. It is scoped to a
 * single ward, the scope is nullable, and an unset scope must resolve to NO
 * cases rather than to every ward. The permissive reading is the convenient
 * one, so most of what follows pins the restrictive one in place.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  WARD_NURSE_IN_CHARGE,
  WARD_NURSE_PREFIX,
  isWardNurseInCharge,
  normaliseWard,
  wardsMatch,
  wardScopeOf,
  canActOnWardCase,
  WARD_DESK_DUTIES,
  CLINICAL_HEALTH_ASSISTANT,
  HEALTH_ASSISTANT_PREFIX,
  WARD_POSTED_ROLES,
  isWardPostedRole,
  canReleasePatient,
} from '../../src/lib/ward/nurseInCharge';
import { ONBOARDING_ROLES } from '../../src/lib/onboarding-roles';
import { resolveAllowedModuleIds, isFullAccessRole, canAccessPath } from '../../src/lib/modules';
import { sheetsForRole, criticalCount } from '../../src/lib/workflowDuties';

const REPO = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');

/**
 * Source with comment lines stripped, for assertions about ABSENCE.
 *
 * Every one of these files explains in prose what it does NOT do, so an
 * assertion over the raw text would match the rationale beside the code it is
 * checking and pass while the code was wrong. That has happened in this repo
 * often enough to be the first thing to get right in a source-reading test.
 */
const codeOf = (rel: string) =>
  read(rel)
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
        && !t.startsWith('{/*');
    })
    .join('\n');

// ===========================================================================
// The ward, as a piece of arithmetic
// ===========================================================================

describe('normaliseWard', () => {
  it('ignores case and inner spacing, because ward names are free text', () => {
    // Patient.ward is a String, the booking form offers "OTHERS (SPECIFY)",
    // and custom wards are rows in another table. The same ward therefore
    // arrives spelled three ways.
    expect(normaliseWard('WARD 6B')).toBe('WARD 6B');
    expect(normaliseWard('Ward 6b')).toBe('WARD 6B');
    expect(normaliseWard('  ward   6B ')).toBe('WARD 6B');
  });

  it('returns empty for nothing, which callers must treat as unknown', () => {
    expect(normaliseWard(null)).toBe('');
    expect(normaliseWard(undefined)).toBe('');
    expect(normaliseWard('   ')).toBe('');
  });
});

describe('wardsMatch', () => {
  it('matches the same ward spelled differently', () => {
    expect(wardsMatch('WARD 6B', 'ward 6b')).toBe(true);
    expect(wardsMatch('Labour Ward', 'LABOUR  WARD')).toBe(true);
  });

  it('does not match different wards', () => {
    expect(wardsMatch('WARD 6A', 'WARD 6B')).toBe(false);
  });

  it('NEVER matches when either side is blank', () => {
    // This is the whole safety property. A blank ward that matched anything
    // would turn "posting not set" into "every ward", silently.
    expect(wardsMatch('', 'WARD 6B')).toBe(false);
    expect(wardsMatch('WARD 6B', null)).toBe(false);
    expect(wardsMatch(null, undefined)).toBe(false);
    expect(wardsMatch('  ', '  ')).toBe(false);
  });
});

describe('wardScopeOf', () => {
  it('gives the ward when one is set, normalised', () => {
    const scope = wardScopeOf({ role: WARD_NURSE_IN_CHARGE, wardAssignment: ' ward 6b ' });
    expect(scope.assigned).toBe(true);
    expect(scope.assigned && scope.ward).toBe('WARD 6B');
  });

  it('reports the unset case explicitly rather than returning a ward of null', () => {
    // A `string | null` return would be read as "any ward" at some call site
    // eventually. The discriminated union makes that a type error instead.
    for (const wardAssignment of [null, undefined, '', '   ']) {
      const scope = wardScopeOf({ role: WARD_NURSE_IN_CHARGE, wardAssignment });
      expect(scope.assigned, String(wardAssignment)).toBe(false);
      expect(scope.ward).toBeNull();
      expect(scope.assigned === false && scope.reason.length).toBeGreaterThan(20);
    }
  });

  it('handles a missing user at all', () => {
    expect(wardScopeOf(null).assigned).toBe(false);
    expect(wardScopeOf(undefined).assigned).toBe(false);
  });
});

describe('canActOnWardCase', () => {
  const nurse = { role: WARD_NURSE_IN_CHARGE, wardAssignment: 'WARD 6B' };

  it('lets a ward nurse act on her own ward, however it is spelled', () => {
    expect(canActOnWardCase(nurse, 'ward 6b').ok).toBe(true);
    expect(canActOnWardCase(nurse, ' WARD 6B ').ok).toBe(true);
  });

  it('refuses another ward, and says which ward the patient is on', () => {
    const verdict = canActOnWardCase(nurse, 'WARD 6A');
    expect(verdict.ok).toBe(false);
    // The nurse has to be able to tell a mis-click from a bug.
    expect(!verdict.ok && verdict.reason).toContain('WARD 6A');
    expect(!verdict.ok && verdict.reason).toContain('WARD 6B');
  });

  it('refuses everything when the posting is not set', () => {
    const unposted = { role: WARD_NURSE_IN_CHARGE, wardAssignment: null };
    expect(canActOnWardCase(unposted, 'WARD 6B').ok).toBe(false);
    expect(canActOnWardCase(unposted, null).ok).toBe(false);
  });

  it('refuses a case with no ward recorded', () => {
    // Not "allow it, the ward is probably right". An unknown ward is unknown.
    expect(canActOnWardCase(nurse, null).ok).toBe(false);
    expect(canActOnWardCase(nurse, '').ok).toBe(false);
  });

  it('does not narrow anybody else', () => {
    // The holding-area nurses already reach the escort log for every ward.
    // This function exists to confine the NEW role, not to re-gate theirs.
    for (const role of ['SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', 'THEATRE_MANAGER', 'ADMIN']) {
      expect(canActOnWardCase({ role, wardAssignment: null }, 'WARD 9').ok, role).toBe(true);
    }
  });

  it('knows its own role name', () => {
    expect(isWardNurseInCharge(WARD_NURSE_IN_CHARGE)).toBe(true);
    expect(isWardNurseInCharge('SCRUB_NURSE')).toBe(false);
    expect(isWardNurseInCharge(null)).toBe(false);
  });
});

// ===========================================================================
// Is it a real role?
// ===========================================================================

describe('the role exists everywhere it has to', () => {
  it('is a value the column can store', () => {
    const schema = read('prisma/schema.prisma');
    const m = schema.match(/enum\s+UserRole\s*\{([\s\S]*?)\n\}/);
    expect(m, 'UserRole enum not found').toBeTruthy();
    const roles = m![1]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//') && !l.startsWith('///'));
    expect(roles).toContain(WARD_NURSE_IN_CHARGE);
  });

  it('has a migration that adds the enum value AND the ward column', () => {
    // The schema alone does not change a live database, and this role is
    // useless without somewhere to put the posting.
    const sql = read('prisma/migrations/20261115090000_ward_nurse_in_charge/migration.sql');
    expect(sql).toContain(`ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS '${WARD_NURSE_IN_CHARGE}'`);
    expect(sql).toMatch(/ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "wardAssignment" TEXT/);
    // `///` is Prisma doc syntax and invalid SQL. It once broke migrate deploy
    // and left P3009 blocking every deploy for a day.
    expect(sql).not.toContain('///');
  });

  it('declares the column in the Prisma model too, or migrate diff reads it as drift', () => {
    expect(read('prisma/schema.prisma')).toMatch(/wardAssignment\s+String\?/);
  });

  it('can be chosen when somebody registers, with its own staff-code prefix', () => {
    const def = ONBOARDING_ROLES.find((r) => r.value === WARD_NURSE_IN_CHARGE);
    expect(def, 'the role must appear in the onboarding dropdown').toBeTruthy();
    expect(def!.prefix).toBe(WARD_NURSE_PREFIX);
    // Distinct prefixes are what keep generated staff codes from colliding.
    const prefixes = ONBOARDING_ROLES.map((r) => r.prefix);
    expect(prefixes.filter((p) => p === WARD_NURSE_PREFIX)).toHaveLength(1);
  });

  it('can be bulk-uploaded, because wards are onboarded a ward at a time', () => {
    const list = /const validRoles = \[([\s\S]*?)\];/
      .exec(read('src/app/api/users/bulk-upload/route.ts'));
    expect(list, 'validRoles not found').toBeTruthy();
    expect(list![1]).toContain(`'${WARD_NURSE_IN_CHARGE}'`);
    // The guard is only worth anything if the list is really being read.
    expect(list![1]).toContain("'SURGEON'");
  });

  it('can be assigned from the admin screen', () => {
    // A role missing from this list cannot be moved INTO from the users page,
    // which is how a working enum value stays unreachable.
    expect(read('src/app/dashboard/users/page.tsx')).toContain(`'${WARD_NURSE_IN_CHARGE}',`);
  });
});

// ===========================================================================
// What it can and cannot reach
// ===========================================================================

describe('what the ward role can reach', () => {
  const modules = resolveAllowedModuleIds(WARD_NURSE_IN_CHARGE);

  it('can open the page the job is done on', () => {
    expect(modules.has('ward-desk')).toBe(true);
    expect(canAccessPath(WARD_NURSE_IN_CHARGE, [], '/dashboard/ward-desk')).toBe(true);
  });

  it('is not a full-access role', () => {
    expect(isFullAccessRole(WARD_NURSE_IN_CHARGE)).toBe(false);
  });

  it('cannot book a case', () => {
    // Booking is the surgeon's or the booking officer's. A ward nurse who can
    // reach /dashboard/surgeries/new is a ward nurse who will be asked to.
    expect(canAccessPath(WARD_NURSE_IN_CHARGE, [], '/dashboard/surgeries/new')).toBe(false);
    expect(modules.has('surgeries')).toBe(false);
  });

  it('is refused the pages it has no business on', () => {
    for (const p of [
      '/dashboard/pacu',
      '/dashboard/holding-area',
      '/dashboard/inventory',
      '/dashboard/users',
      '/dashboard/imprest',
      '/dashboard/patients',
    ]) {
      expect(canAccessPath(WARD_NURSE_IN_CHARGE, [], p), p).toBe(false);
    }
  });

  it('reaches fewer modules than a perioperative nurse', () => {
    // The point of a narrow role is that it can be handed to every ward in the
    // hospital. The moment it reaches everything it stops being safe to give out.
    expect(modules.size).toBeLessThan(resolveAllowedModuleIds('SCRUB_NURSE').size);
  });

  it('does not put a permanently empty page in a theatre nurse\'s sidebar', () => {
    // The desk is scoped to the holder's own ward and a theatre nurse has no
    // ward, so granting them this module would show them a page that is always
    // empty. The Ward Escort Log is the theatre's view of the same record.
    for (const role of ['SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', 'PORTER']) {
      expect(resolveAllowedModuleIds(role).has('ward-desk'), role).toBe(false);
    }
    expect(resolveAllowedModuleIds('SCRUB_NURSE').has('ward-entries')).toBe(true);
  });

  it('states its duties somewhere the holder will see them', () => {
    // A role handed out with no statement of its duties becomes whatever the
    // first holder assumes it is.
    expect(WARD_DESK_DUTIES.length).toBeGreaterThanOrEqual(3);
    for (const d of WARD_DESK_DUTIES) expect(d.detail.length).toBeGreaterThan(30);
    expect(codeOf('src/app/dashboard/ward-desk/page.tsx')).toContain('WARD_DESK_DUTIES');
  });
});

// ===========================================================================
// The ward posting cannot be skipped, and cannot be guessed
// ===========================================================================

describe('a ward nurse without a ward', () => {
  it('cannot be created through the registration form', () => {
    const code = codeOf('src/app/api/onboarding/submit/route.ts');
    expect(code).toContain('isWardPostedRole(role) && !wardAssignment');
    expect(code).toContain('errors.push(');
    // And the ward is normalised before it is stored, or "Ward 6b" typed at
    // registration never finds WARD 6B on a patient.
    expect(code).toContain('normaliseWard(clean(body.wardAssignment, 120))');
  });

  it('is refused by the bulk upload rather than created unscoped', () => {
    // Import fifty with the column blank and you get fifty accounts that sign
    // in to an empty desk with nothing saying why. The spreadsheet is still
    // open at the moment of the refusal.
    const code = codeOf('src/app/api/users/bulk-upload/route.ts');
    expect(code).toContain('isWardPostedRole(user.role) && !wardAssignment');
    expect(code).toContain('continue;');
  });

  it('is gated in JavaScript on the form, not only by the required attribute', () => {
    // A `required` control the browser cannot focus is not validated and not
    // reported: the form silently refuses to submit, with the explanation in
    // the console only. That cost this repo a whole feature once.
    const code = codeOf('src/app/onboarding/page.tsx');
    expect(code).toContain('isWardPostedRole(data.role) && !data.wardAssignment');
    expect(code).toContain('errs.wardAssignment');
  });

  it('can be given a ward afterwards by an administrator', () => {
    // The registration form promises exactly this, so without it that promise
    // is empty.
    const route = codeOf('src/app/api/users/[id]/route.ts');
    expect(route).toContain('wardAssignment: z.string()');
    expect(route).toContain('data.wardAssignment = normaliseWard(');
    // And the admin screen has to show the current posting, because an editor
    // that saves a field it never displayed clears it.
    const page = codeOf('src/app/dashboard/users/page.tsx');
    expect(page).toContain('editIsWardPosted');
    expect(read('src/app/api/users/route.ts')).toContain('wardAssignment: true');
  });

  it('is told why the desk is empty instead of being shown every ward', () => {
    const page = codeOf('src/app/dashboard/ward-desk/page.tsx');
    expect(page).toContain("viewingAs === 'none'");
    expect(page).toContain('No ward is set on your account');
  });
});

// ===========================================================================
// The ward desk API
// ===========================================================================

describe('the ward desk reads its scope from the database', () => {
  const api = codeOf('src/app/api/ward-desk/route.ts');

  it('looks the posting up per request rather than trusting the session', () => {
    // wardAssignment is deliberately NOT on the JWT. A token lives until it is
    // refreshed, so a posting corrected this morning would go on scoping the
    // desk to the old ward until the nurse signed out and in again -- and she
    // would have no way to tell.
    expect(api).toContain('prisma.user.findUnique(');
    expect(api).toContain('wardAssignment: true');
    expect(api).not.toContain('session.user.wardAssignment');
  });

  it('gates on the module, not on a hardcoded role list', () => {
    // So that access granted in the admin access editor actually takes effect
    // server-side, the same way the rest of this codebase does it.
    expect(api).toContain("hasModuleAccess(session.user.role, session.user.extraModules, 'ward-desk')");
  });

  it('confines a ward nurse to her own ward whatever the query string says', () => {
    // On 23 November the desk gained a ward chooser, for ADMINISTRATORS. This
    // test is what stops that chooser reaching ward nurses, so it now checks
    // the BEHAVIOUR of the posted branch rather than one spelling of the call
    // that opens it: the branch must be decided by isWardPostedRole, must
    // assign the posting, and must not read the query string at all.
    expect(api).toContain('isWardPostedRole(me.role)');

    const start = api.indexOf('if (posted) {');
    expect(start).toBeGreaterThan(-1);
    const branch = api.slice(start, api.indexOf('} else if', start));

    expect(branch).toContain('ward = scope.ward;');
    expect(branch).toContain("viewingAs = 'own'");
    // The two names the query string arrives under. Neither may be consulted
    // here, or a nurse could read another ward's handovers.
    expect(branch).not.toContain('asked');
    expect(branch).not.toContain('wantsAll');
  });

  it('returns no cases when there is no ward, rather than all of them', () => {
    expect(api).toContain("viewingAs: 'none'");
    expect(api).toContain('cases: [],');
  });

  it('matches the ward with wardsMatch, not with a WHERE clause', () => {
    // `{ equals: ward, mode: 'insensitive' }` folds case but NOT inner
    // whitespace, and Patient.ward is free text behind an "OTHERS (SPECIFY)"
    // option. One typed "WARD  6B" would never match a posting of "WARD 6B",
    // and the nurse would read the omission as "no cases today".
    expect(api).toContain('wardsMatch(s.patient?.ward, ward)');
    expect(api).not.toContain("mode: 'insensitive'");
  });

  it('uses the SAME comparison on the read and the write path', () => {
    // Two ways of comparing ward names is a desk that lists a case and then
    // refuses the handover for it.
    expect(api).toContain('wardsMatch(');
    expect(codeOf('src/lib/ward/nurseInCharge.ts'))
      .toContain('if (!wardsMatch(scope.ward, caseWard))');
  });
});

describe('what the ward may write', () => {
  const api = codeOf('src/app/api/ward-desk/[id]/route.ts');

  it('writes the one thing nothing else in the app writes', () => {
    // PATIENT_EN_ROUTE and patientEnRouteAt are read by the journey timeline,
    // the PACU discharge summary and the holding-area chase, and were written
    // by no route at all -- so that row was blank on every patient.
    expect(api).toContain("data.status = 'PATIENT_EN_ROUTE';");
    expect(api).toContain('data.patientEnRouteAt =');
  });

  it('only ever moves the status forwards', () => {
    // A call-up at PATIENT_ARRIVED has already been received in the holding
    // area. The ward marking it en route afterwards would replace a later
    // truth with an earlier one and make the timeline read backwards.
    expect(api).toContain("if (callUp.status === 'INVITED') {");
    expect(api).toContain('status: 409');
  });

  it('never claims a signature on a printout that does not exist', () => {
    // wardNurseSignaturePresent means "the holding-area nurse confirms a
    // signature is on the printout". There is no printout in this flow.
    // wardEntriesRecordedById names the account, which is the stronger record.
    expect(api).not.toContain('wardNurseSignaturePresent');
    expect(api).toContain('wardEntriesRecordedById: me.id');
  });

  it('refuses a case on another ward', () => {
    expect(api).toContain('canActOnWardCase(me, callUp.ward)');
    expect(api).toContain('status: 403');
  });

  it('will not record the patient leaving before the porter arrived', () => {
    // Compared against what is STORED, not only against each other, so sending
    // one of the two cannot produce a pair that reads backwards.
    expect(api).toContain('effDeparted < effArrived');
    expect(api).toContain('callUp.theatrePorterArrivedAtWardTime');
  });

  it('leaves a field alone when the form did not send it', () => {
    // A form that posts only what changed must not blank the rest.
    expect(api).toContain('if (raw === undefined) return undefined;');
    expect(api).toContain('if (arrived !== undefined)');
  });
});

// ===========================================================================
// The Clinical Health Assistant: the second ward posting
// ===========================================================================

describe('the clinical health assistant', () => {
  const modules = resolveAllowedModuleIds(CLINICAL_HEALTH_ASSISTANT);

  it('is a value the column can store, with its own migration', () => {
    const schema = read('prisma/schema.prisma');
    const roles = schema.match(/enum\s+UserRole\s*\{([\s\S]*?)\n\}/)![1]
      .split('\n').map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//') && !l.startsWith('///'));
    expect(roles).toContain(CLINICAL_HEALTH_ASSISTANT);

    const sql = read('prisma/migrations/20261115093000_clinical_health_assistant/migration.sql');
    expect(sql).toContain(
      `ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS '${CLINICAL_HEALTH_ASSISTANT}'`,
    );
    expect(sql).not.toContain('///');
    // It needs no new column: it shares the nurse's posting.
    expect(sql).not.toMatch(/ADD COLUMN/);
  });

  it('can be registered and bulk-uploaded, with a unique prefix', () => {
    const def = ONBOARDING_ROLES.find((r) => r.value === CLINICAL_HEALTH_ASSISTANT);
    expect(def, 'the role must appear in the onboarding dropdown').toBeTruthy();
    expect(def!.prefix).toBe(HEALTH_ASSISTANT_PREFIX);
    const prefixes = ONBOARDING_ROLES.map((r) => r.prefix);
    expect(prefixes.filter((p) => p === HEALTH_ASSISTANT_PREFIX)).toHaveLength(1);
    // No two roles may share a prefix, or generated staff codes collide.
    expect(new Set(prefixes).size).toBe(prefixes.length);

    const list = /const validRoles = \[([\s\S]*?)\];/
      .exec(read('src/app/api/users/bulk-upload/route.ts'));
    expect(list![1]).toContain(`'${CLINICAL_HEALTH_ASSISTANT}'`);
    expect(read('src/app/dashboard/users/page.tsx')).toContain(`'${CLINICAL_HEALTH_ASSISTANT}'`);
  });

  it('shares the ward desk with the nurse-in-charge', () => {
    expect(modules.has('ward-desk')).toBe(true);
    expect(canAccessPath(CLINICAL_HEALTH_ASSISTANT, [], '/dashboard/ward-desk')).toBe(true);
  });

  it('is as narrow as the nurse-in-charge, and no wider', () => {
    expect(isFullAccessRole(CLINICAL_HEALTH_ASSISTANT)).toBe(false);
    for (const p of [
      '/dashboard/surgeries/new', '/dashboard/pacu', '/dashboard/holding-area',
      '/dashboard/inventory', '/dashboard/users', '/dashboard/patients',
    ]) {
      expect(canAccessPath(CLINICAL_HEALTH_ASSISTANT, [], p), p).toBe(false);
    }
  });

  it('is posted to one ward, and refused every other ward', () => {
    const assistant = { role: CLINICAL_HEALTH_ASSISTANT, wardAssignment: 'WARD 9' };
    expect(canActOnWardCase(assistant, 'ward 9').ok).toBe(true);
    expect(canActOnWardCase(assistant, 'WARD 10').ok).toBe(false);
    // And an unset posting resolves to nothing, exactly as for the nurse.
    expect(canActOnWardCase({ role: CLINICAL_HEALTH_ASSISTANT, wardAssignment: null }, 'WARD 9').ok)
      .toBe(false);
  });

  it('cannot be registered without a ward either', () => {
    // The gates test the ROLE SET, not a named role, so a third posting added
    // later is covered without finding every check again.
    expect(isWardPostedRole(CLINICAL_HEALTH_ASSISTANT)).toBe(true);
    expect(isWardPostedRole(WARD_NURSE_IN_CHARGE)).toBe(true);
    expect(isWardPostedRole('SCRUB_NURSE')).toBe(false);
    expect(WARD_POSTED_ROLES).toEqual([WARD_NURSE_IN_CHARGE, CLINICAL_HEALTH_ASSISTANT]);

    for (const rel of [
      'src/app/api/onboarding/submit/route.ts',
      'src/app/api/users/bulk-upload/route.ts',
      'src/app/onboarding/page.tsx',
    ]) {
      expect(codeOf(rel), rel).toContain('isWardPostedRole(');
    }
  });
});

describe('releasing a patient is the nurse-in-charge\'s', () => {
  it('is refused to the assistant, with a reason that says what they CAN do', () => {
    // A refusal that only says no teaches people the app is broken.
    const verdict = canReleasePatient(CLINICAL_HEALTH_ASSISTANT);
    expect(verdict.ok).toBe(false);
    expect(!verdict.ok && verdict.reason).toMatch(/porter arrived|patient left/);
  });

  it('is allowed to the nurse-in-charge, and to whoever else reaches the desk', () => {
    expect(canReleasePatient(WARD_NURSE_IN_CHARGE).ok).toBe(true);
    // A theatre manager or admin reaching the desk is not blocked by a rule
    // written about ward support staff.
    expect(canReleasePatient('THEATRE_MANAGER').ok).toBe(true);
    expect(canReleasePatient('ADMIN').ok).toBe(true);
    expect(canReleasePatient(null).ok).toBe(true);
  });

  it('is enforced on the server, not only hidden on the page', () => {
    // A button that is merely not drawn is not a rule.
    const api = codeOf('src/app/api/ward-desk/[id]/route.ts');
    expect(api).toContain('const release = canReleasePatient(me.role);');
    expect(api).toContain('if (!release.ok) {');
    const gate = api.slice(api.indexOf('const release = canReleasePatient'));
    expect(gate.slice(0, 220)).toContain('status: 403');
    // And it sits INSIDE the markSent branch, so recording the times is
    // untouched by it.
    expect(api.indexOf('if (body.markSent === true) {'))
      .toBeLessThan(api.indexOf('const release = canReleasePatient'));
  });

  it('hides the button on the page and prints the reason in its place', () => {
    const page = codeOf('src/app/dashboard/ward-desk/page.tsx');
    expect(page).toContain('const release = canReleasePatient(data?.role);');
    expect(page).toContain("cu.status === 'INVITED' && release.ok &&");
    expect(page).toContain("cu.status === 'INVITED' && !release.ok &&");
    expect(page).toContain('{release.reason}');
  });

  it('still lets the assistant record both porter times', () => {
    // The whole point of the role on this desk. If this ever stops being true
    // the role has no reason to reach the page at all.
    const api = codeOf('src/app/api/ward-desk/[id]/route.ts');
    const gateAt = api.indexOf('const release = canReleasePatient');
    expect(api.indexOf('if (arrived !== undefined) data.theatrePorterArrivedAtWardTime'))
      .toBeLessThan(gateAt);
    expect(api.indexOf('if (departed !== undefined) data.theatrePorterDepartedWardTime'))
      .toBeLessThan(gateAt);
  });
});

describe('both ward roles are explained to the people being asked to use them', () => {
  // /role-guide is the public page somebody reads BEFORE registering. A role
  // absent from it is a role whose holders are told to sign up for something
  // nobody has described to them.
  //
  // NOTE: that page does not cover every registerable role today -- the
  // booking officer, the clinical heads and the laboratory disciplines are all
  // missing. This is not a general guard, which would fail on those; it pins
  // only that the two roles added here were not born with the same gap.
  const guide = read('src/app/role-guide/page.tsx');

  for (const role of [WARD_NURSE_IN_CHARGE, CLINICAL_HEALTH_ASSISTANT]) {
    it(`has a role-guide entry for ${role}`, () => {
      expect(guide).toContain(`id: '${role}'`);
    });
  }

  it('tells the assistant why there is no release button, rather than leaving them hunting', () => {
    const entry = guide.slice(guide.indexOf(`id: '${CLINICAL_HEALTH_ASSISTANT}'`));
    expect(entry.slice(0, 2600)).toMatch(/will not see a .patient has gone/);
  });

  it('gives both of them a duty sheet with at least one critical duty', () => {
    for (const role of [WARD_NURSE_IN_CHARGE, CLINICAL_HEALTH_ASSISTANT]) {
      const sheets = sheetsForRole(role);
      expect(sheets.length, role).toBeGreaterThan(0);
      expect(sheets.some((s) => criticalCount(s) > 0), role).toBe(true);
    }
  });

  it('never tells the assistant to do the one thing the app will refuse', () => {
    // A flyer that instructs somebody to press a button they do not have is
    // how a role becomes "the app is broken".
    const sheet = sheetsForRole(CLINICAL_HEALTH_ASSISTANT)[0];
    const prose = sheet.duties.map((d) => `${d.task} ${d.why}`).join(' ').toLowerCase();
    expect(prose).not.toMatch(/press .patient has gone|release the patient to theatre'/);
    // It does say who to tell instead.
    expect(prose).toContain('nurse-in-charge');
  });
});
