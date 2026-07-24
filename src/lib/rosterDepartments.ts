/**
 * Department roster configuration — one entry per standing duty-roster
 * department. Drives the standalone department roster pages (/dashboard/roster/
 * dept/[dept] and the /roster/[dept] alias), their staff dropdowns, and the
 * RBAC that decides who may create/edit/publish each department's roster.
 *
 * Departments map onto the existing `StaffCategory` values so the whole
 * draft/publish layer reuses the current `Roster` table and on-duty resolver.
 */

export interface RosterDept {
  slug: string;
  label: string;
  category: string; // a StaffCategory value
  subRoles?: string[];
  seniorityLevels?: string[];
  userRoles: string[]; // User.role values eligible to be ASSIGNED in this dept
  managerRoles: string[]; // User.role values allowed to MANAGE this dept's roster
}

// Roles that can manage ANY department's roster.
export const ROSTER_ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];

export const SHIFTS = ['MORNING', 'CALL', 'NIGHT'] as const;
export const LOCATIONS = ['MAIN_THEATRE', 'A_AND_E', 'EYE_THEATRE', 'CTU_THEATRE', 'ICU'] as const;

export const ROSTER_DEPARTMENTS: RosterDept[] = [
  {
    slug: 'nursing', label: 'Perioperative Nursing', category: 'NURSES',
    subRoles: ['SCRUB', 'CIRCULATING', 'HOLDING_AREA', 'SUPERVISING'],
    userRoles: ['SCRUB_NURSE'],
    managerRoles: [...ROSTER_ADMIN_ROLES],
  },
  {
    slug: 'anaesthetists', label: 'Anaesthetists', category: 'ANAESTHETISTS',
    seniorityLevels: ['CONSULTANT', 'SENIOR_REGISTRAR', 'REGISTRAR'],
    userRoles: ['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'],
    managerRoles: [...ROSTER_ADMIN_ROLES, 'CONSULTANT_ANAESTHETIST'],
  },
  {
    slug: 'nurse-anaesthetists', label: 'Nurse Anaesthetists / Recovery', category: 'RECOVERY_NURSES',
    userRoles: ['RECOVERY_ROOM_NURSE', 'ANAESTHETIST'],
    managerRoles: [...ROSTER_ADMIN_ROLES, 'CONSULTANT_ANAESTHETIST'],
  },
  {
    slug: 'anaesthetic-technicians', label: 'Anaesthetic Technicians', category: 'ANAESTHETIC_TECHNICIANS',
    seniorityLevels: ['CONSULTANT', 'SENIOR_REGISTRAR', 'REGISTRAR'],
    userRoles: ['ANAESTHETIC_TECHNICIAN'],
    managerRoles: [...ROSTER_ADMIN_ROLES],
  },
  {
    slug: 'porters', label: 'Porters', category: 'PORTERS',
    userRoles: ['PORTER'],
    managerRoles: [...ROSTER_ADMIN_ROLES],
  },
  {
    slug: 'cleaners', label: 'Cleaners', category: 'CLEANERS',
    userRoles: ['CLEANER'],
    managerRoles: [...ROSTER_ADMIN_ROLES],
  },
  {
    slug: 'pharmacy', label: 'Pharmacy', category: 'PHARMACISTS',
    userRoles: ['PHARMACIST'],
    managerRoles: [...ROSTER_ADMIN_ROLES, 'PHARMACIST'],
  },
];

export const getRosterDept = (slug: string): RosterDept | undefined =>
  ROSTER_DEPARTMENTS.find((d) => d.slug === slug);

export const canManageRosterDept = (dept: RosterDept | undefined, role: string | undefined | null): boolean =>
  !!dept && !!role && dept.managerRoles.includes(role);
