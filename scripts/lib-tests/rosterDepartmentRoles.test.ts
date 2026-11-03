import { describe, it, expect } from 'vitest';
import { ROSTER_DEPARTMENTS, getRosterDept } from '../../src/lib/rosterDepartments';

// Reported from theatre: the Nurse Anaesthetists / Recovery roster offered
// physician anaesthetists in its staff picker. userRoles decides three
// things at once -- who appears in that dropdown, who the bulk upload will
// accept, and who the CSV template lists -- so a stray role is wrong in
// three places and only noticeable in one.

describe('the recovery roster offers only recovery nurses', () => {
  const dept = getRosterDept('nurse-anaesthetists');

  it('exists', () => {
    expect(dept).toBeTruthy();
  });

  it('does not offer physician anaesthetists', () => {
    // 40 approved ANAESTHETISTs against 17 RECOVERY_ROOM_NURSEs: the people
    // the roster is for were outnumbered two to one in their own dropdown.
    expect(dept!.userRoles).toEqual(['RECOVERY_ROOM_NURSE']);
    expect(dept!.userRoles).not.toContain('ANAESTHETIST');
    expect(dept!.userRoles).not.toContain('CONSULTANT_ANAESTHETIST');
  });

  it('still lets a consultant anaesthetist MANAGE it', () => {
    // Who may edit the roster is a different question from who may appear on
    // it, and removing the one must not quietly remove the other.
    expect(dept!.managerRoles).toContain('CONSULTANT_ANAESTHETIST');
  });
});

describe('no department offers staff from another department', () => {
  // A roster whose picker contains the wrong grades is how the wrong person
  // gets rostered, and nobody notices until the day.
  const ROLES_BY_SLUG: Record<string, string[]> = {
    anaesthetists: ['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'],
    'nurse-anaesthetists': ['RECOVERY_ROOM_NURSE'],
    'anaesthetic-technicians': ['ANAESTHETIC_TECHNICIAN'],
    porters: ['PORTER'],
    cleaners: ['CLEANER'],
    pharmacy: ['PHARMACIST'],
  };

  Object.keys(ROLES_BY_SLUG).forEach((slug) => {
    it(`${slug} offers exactly its own grades`, () => {
      const d = getRosterDept(slug);
      expect(d, slug).toBeTruthy();
      expect(d!.userRoles.slice().sort()).toEqual(ROLES_BY_SLUG[slug].slice().sort());
    });
  });

  it('never leaves a department with nobody to roster', () => {
    // An empty userRoles means an empty picker, which looks exactly like a
    // broken page. The route returns [] for it rather than every user in the
    // hospital, so the failure is silent.
    ROSTER_DEPARTMENTS.forEach((d) => {
      expect(d.userRoles.length, d.slug).toBeGreaterThan(0);
    });
  });

  it('never puts a management-only role in the staff list', () => {
    // THEATRE_MANAGER and the admins manage rosters; they are not rostered
    // onto theatre shifts, and offering them is how an administrator ends up
    // listed as the recovery nurse on a Tuesday.
    const ADMIN_ONLY = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];
    ROSTER_DEPARTMENTS.forEach((d) => {
      ADMIN_ONLY.forEach((r) => {
        expect(d.userRoles, `${d.slug} offers ${r}`).not.toContain(r);
      });
    });
  });
});
