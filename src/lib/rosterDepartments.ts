/**
 * Department roster configuration — one entry per standing duty-roster
 * department. Drives the standalone department roster pages (/dashboard/roster/
 * dept/[dept] and the /roster/[dept] alias), their staff dropdowns, and the
 * RBAC that decides who may create/edit/publish each department's roster.
 *
 * Departments map onto the existing `StaffCategory` values so the whole
 * draft/publish layer reuses the current `Roster` table and on-duty resolver.
 */

/** A shift as offered in one department's UI. `value` is the stored DutyShift. */
export interface ShiftOption {
  value: 'MORNING' | 'CALL' | 'NIGHT';
  label: string;
}

export interface RosterDept {
  slug: string;
  label: string;
  category: string; // a StaffCategory value
  subRoles?: string[];
  seniorityLevels?: string[];
  userRoles: string[]; // User.role values eligible to be ASSIGNED in this dept
  managerRoles: string[]; // User.role values allowed to MANAGE this dept's roster
  /**
   * Shifts this department actually works, and how they are named to its users.
   * The stored `value` stays a DutyShift, so the on-duty resolver, meal counts,
   * anaesthetist-coverage and booking auto-assign all keep matching — only the
   * wording changes. Omit for the default MORNING / CALL / NIGHT.
   */
  shiftOptions?: ShiftOption[];
  /**
   * Where the `subRole` dropdown gets its options. 'SURGICAL_SPECIALTY' pulls the
   * live surgical subspecialties out of the SurgicalUnit table (via
   * /api/roster/specialties) instead of using the static `subRoles` list.
   */
  subRoleSource?: 'SURGICAL_SPECIALTY';
  /** Field label for `subRole` where the generic "Sub-role" is wrong for the dept. */
  subRoleLabel?: string;
}

// Roles that can manage ANY department's roster.
export const ROSTER_ADMIN_ROLES = ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'];

export const SHIFTS = ['MORNING', 'CALL', 'NIGHT'] as const;
export const LOCATIONS = ['MAIN_THEATRE', 'A_AND_E', 'EYE_THEATRE', 'CTU_THEATRE', 'ICU'] as const;

// Default shift wording, used by every department that doesn't override it.
export const DEFAULT_SHIFT_OPTIONS: ShiftOption[] = [
  { value: 'MORNING', label: 'MORNING' },
  { value: 'CALL', label: 'CALL' },
  { value: 'NIGHT', label: 'NIGHT' },
];

// The on-call anaesthetist covers every specialty's emergencies rather than one
// elective list, so this stands in for a subspecialty on CALL rows. Kept here so
// the web form and the bulk-upload template offer the exact same string.
export const ON_CALL_ALL_SPECIALTIES = 'ALL EMERGENCIES (on-call)';

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
    // Anaesthetists don't work a morning/night rota: they either cover an elective
    // list or they're on call for emergencies. MORNING/CALL remain the stored
    // values so /api/roster/anaesthetist-coverage keeps reading CALL as on-call.
    shiftOptions: [
      { value: 'MORNING', label: 'ELECTIVES' },
      { value: 'CALL', label: 'CALL/EMERGENCIES' },
    ],
    // On an elective day an anaesthetist covers a surgical subspecialty, so the
    // assignment dropdown is the live specialty list from the SurgicalUnit table.
    subRoleSource: 'SURGICAL_SPECIALTY',
    subRoleLabel: 'Surgical Specialty',
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

/** The shifts a department offers, falling back to MORNING / CALL / NIGHT. */
export const getShiftOptions = (dept: RosterDept | undefined): ShiftOption[] =>
  dept?.shiftOptions?.length ? dept.shiftOptions : DEFAULT_SHIFT_OPTIONS;

/** How a department names a stored DutyShift; the raw value if it doesn't rename it. */
export const getShiftLabel = (dept: RosterDept | undefined, shift: string): string =>
  getShiftOptions(dept).find((s) => s.value === shift)?.label ?? shift;
