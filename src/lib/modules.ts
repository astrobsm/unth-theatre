// Single source of truth for application modules and role-based access.
//
// Each MODULE represents a feature/page (or a small group of related pages)
// that can be granted to a user. The dashboard sidebar and the per-user
// access editor both read from this catalog.
//
// Access rules:
//   1. FULL_ACCESS_ROLES see every module, always.
//   2. Otherwise: a user can see a module if their role is in `defaultRoles`
//      OR if the admin has explicitly granted that module to them
//      (UserModuleGrant rows -> session.user.extraModules).

export type ModuleId = string;

export interface AppModule {
  id: ModuleId;          // stable key, persisted in DB grants
  label: string;         // human label (used in the access editor)
  paths: string[];       // path prefixes this module covers
  defaultRoles: string[]; // roles that get this module by default
  category?: string;
}

// Roles that always see every module — cannot be revoked via grants UI.
export const FULL_ACCESS_ROLES = [
  'ADMIN',
  'SYSTEM_ADMINISTRATOR',
  'THEATRE_MANAGER',
  'THEATRE_CHAIRMAN',
] as const;

// Convenience role groupings used by defaultRoles below.
const CLINICAL_CORE = [
  'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC',
  'SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST',
  'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE',
  'ANAESTHETIC_TECHNICIAN',
];

const ADMIN_VIEWERS = ['CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC'];

// NOTE: Roles in FULL_ACCESS_ROLES are intentionally omitted from
// `defaultRoles` arrays — they bypass the check entirely.
export const MODULES: AppModule[] = [
  // Overview
  { id: 'dashboard', label: 'Dashboard (Home)', paths: ['/dashboard'], defaultRoles: ['*'], category: 'Overview' },
  { id: 'emergency-booking', label: '🚨 Emergency Booking', paths: ['/dashboard/emergency-booking'], defaultRoles: [...CLINICAL_CORE, 'HOUSE_OFFICER', 'PORTER', 'BLOODBANK_STAFF', 'LABORATORY_STAFF', 'PHARMACIST'], category: 'Overview' },

  // Patient Registration & Scheduling
  { id: 'patients', label: 'Patients', paths: ['/dashboard/patients'], defaultRoles: [...CLINICAL_CORE, 'HOUSE_OFFICER'], category: 'Patient' },
  { id: 'surgeries', label: 'Surgeries', paths: ['/dashboard/surgeries'], defaultRoles: [...CLINICAL_CORE, 'HOUSE_OFFICER'], category: 'Patient' },
  { id: 'cancellations', label: 'Cancellations', paths: ['/dashboard/cancellations'], defaultRoles: CLINICAL_CORE, category: 'Patient' },

  // Pre-operative
  { id: 'pre-operative-visit', label: 'Pre-Op Visit', paths: ['/dashboard/pre-operative-visit'], defaultRoles: ['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'SURGEON', 'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE'], category: 'Pre-Op' },
  { id: 'patient-payment-guide', label: 'Patient Payment Guide', paths: ['/dashboard/patient-payment-guide'], defaultRoles: ['SURGEON', 'CONSULTANT_ANAESTHETIST', 'ANAESTHETIST', 'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', ...ADMIN_VIEWERS], category: 'Pre-Op' },
  { id: 'anaesthetist-board', label: 'Anaesthetist Review Board', paths: ['/dashboard/anaesthetist-board'], defaultRoles: ['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'], category: 'Pre-Op' },
  { id: 'preop-reviews', label: 'Pre-op Reviews', paths: ['/dashboard/preop-reviews'], defaultRoles: ['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'SURGEON'], category: 'Pre-Op' },
  { id: 'prescription-approvals', label: 'Rx Approvals', paths: ['/dashboard/prescription-approvals'], defaultRoles: ['CONSULTANT_ANAESTHETIST', 'PHARMACIST'], category: 'Pre-Op' },
  { id: 'prescriptions', label: 'Pharmacy', paths: ['/dashboard/prescriptions'], defaultRoles: ['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'PHARMACIST'], category: 'Pre-Op' },
  { id: 'blood-bank', label: 'Blood Bank', paths: ['/dashboard/blood-bank'], defaultRoles: ['BLOODBANK_STAFF', 'SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'], category: 'Pre-Op' },
  { id: 'anesthesia-setup', label: 'Anesthesia Setup', paths: ['/dashboard/anesthesia-setup'], defaultRoles: ['ANAESTHETIC_TECHNICIAN', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'], category: 'Pre-Op' },

  // Day-of-surgery logistics
  { id: 'roster', label: 'Duty Roster', paths: ['/dashboard/roster'], defaultRoles: [...CLINICAL_CORE, 'THEATRE_CAFETERIA_MANAGER'], category: 'Logistics' },
  { id: 'theatres', label: 'Theatre Allocation', paths: ['/dashboard/theatres'], defaultRoles: CLINICAL_CORE, category: 'Logistics' },
  { id: 'theatre-setup', label: 'Theatre Setup', paths: ['/dashboard/theatre-setup'], defaultRoles: ['SCRUB_NURSE', 'ANAESTHETIC_TECHNICIAN', 'THEATRE_STORE_KEEPER'], category: 'Logistics' },
  { id: 'theatre-readiness', label: 'Theatre Readiness', paths: ['/dashboard/theatre-readiness'], defaultRoles: ['*'], category: 'Logistics' },
  { id: 'call-for-patient', label: 'Call for Patient', paths: ['/dashboard/call-for-patient'], defaultRoles: ['PORTER', 'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE'], category: 'Logistics' },

  // Intra-operative
  { id: 'theatre-reception', label: 'Theatre Reception', paths: ['/dashboard/theatre-reception'], defaultRoles: ['SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', 'SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'], category: 'Intra-Op' },
  { id: 'holding-area', label: 'Holding Area', paths: ['/dashboard/holding-area'], defaultRoles: ['SCRUB_NURSE', 'PORTER', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'SURGEON'], category: 'Intra-Op' },
  { id: 'ward-entries', label: 'Ward Escort Log', paths: ['/dashboard/holding-area/ward-entries'], defaultRoles: ['SCRUB_NURSE', 'RECOVERY_ROOM_NURSE'], category: 'Intra-Op' },
  { id: 'checklists', label: 'WHO Checklists', paths: ['/dashboard/checklists'], defaultRoles: ['SCRUB_NURSE', 'SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'], category: 'Intra-Op' },
  { id: 'equipment-checkout', label: 'Equipment Checkout', paths: ['/dashboard/equipment-checkout'], defaultRoles: ['THEATRE_STORE_KEEPER', 'SCRUB_NURSE', 'ANAESTHETIC_TECHNICIAN'], category: 'Intra-Op' },
  { id: 'medication-tracking', label: 'Med Tracking', paths: ['/dashboard/medication-tracking'], defaultRoles: ['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'PHARMACIST'], category: 'Intra-Op' },
  { id: 'consumable-pack-provider', label: 'Consumable Packs', paths: ['/dashboard/consumable-pack-provider'], defaultRoles: ['CONSUMABLE_PACK_PROVIDER', 'THEATRE_STORE_KEEPER'], category: 'Intra-Op' },

  // Handover
  { id: 'nurse-handover', label: 'Nurse Handover', paths: ['/dashboard/nurse-handover'], defaultRoles: ['SCRUB_NURSE', 'RECOVERY_ROOM_NURSE'], category: 'Handover' },

  // Post-operative
  { id: 'pacu', label: 'PACU (Recovery)', paths: ['/dashboard/pacu'], defaultRoles: ['RECOVERY_ROOM_NURSE', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'], category: 'Post-Op' },
  { id: 'transfers', label: 'Patient Transfers', paths: ['/dashboard/transfers'], defaultRoles: ['PORTER', 'RECOVERY_ROOM_NURSE'], category: 'Post-Op' },

  // Lab
  { id: 'emergency-lab-workup', label: 'Emergency Lab Workup', paths: ['/dashboard/emergency-lab-workup'], defaultRoles: ['LABORATORY_STAFF', 'EMERGENCY_LAB_SCIENTIST', 'SURGEON', 'ANAESTHETIST'], category: 'Lab' },

  // Facility & support services
  { id: 'plumbing-water-supply', label: 'Plumbing & Water', paths: ['/dashboard/plumbing-water-supply'], defaultRoles: ['PLUMBER', 'PLUMBING_SUPERVISOR', 'WATER_SUPPLY_SUPERVISOR', 'WORKS_SUPERVISOR'], category: 'Facility' },
  { id: 'power-house', label: 'Power House', paths: ['/dashboard/power-house'], defaultRoles: ['POWER_PLANT_OPERATOR', 'WORKS_SUPERVISOR'], category: 'Facility' },
  { id: 'cssd', label: 'CSSD', paths: ['/dashboard/cssd'], defaultRoles: ['CSSD_STAFF', 'CSSD_SUPERVISOR'], category: 'Facility' },
  { id: 'laundry', label: 'Laundry', paths: ['/dashboard/laundry', '/dashboard/laundry-supervisor'], defaultRoles: ['LAUNDRY_STAFF', 'LAUNDRY_SUPERVISOR'], category: 'Facility' },
  { id: 'oxygen-control', label: 'Oxygen Control', paths: ['/dashboard/oxygen-control', '/dashboard/oxygen-supervisor'], defaultRoles: ['OXYGEN_UNIT_SUPERVISOR'], category: 'Facility' },
  { id: 'works-supervisor', label: 'Works Supervisor', paths: ['/dashboard/works-supervisor'], defaultRoles: ['WORKS_SUPERVISOR', 'PLUMBER', 'POWER_PLANT_OPERATOR'], category: 'Facility' },

  // Alerts & safety
  { id: 'alerts', label: 'Alerts', paths: ['/dashboard/alerts'], defaultRoles: ['*'], category: 'Alerts' },
  { id: 'radio', label: 'Theatre Radio', paths: ['/dashboard/radio'], defaultRoles: ['*'], category: 'Alerts' },
  { id: 'fault-alerts', label: 'Fault Alerts', paths: ['/dashboard/fault-alerts'], defaultRoles: ['BIOMEDICAL_ENGINEER', 'WORKS_SUPERVISOR', 'PLUMBER'], category: 'Alerts' },
  { id: 'emergency-alerts', label: 'Emergency Alerts', paths: ['/dashboard/emergency-alerts'], defaultRoles: [...CLINICAL_CORE], category: 'Alerts' },
  { id: 'mortality', label: 'Mortality Registry', paths: ['/dashboard/mortality'], defaultRoles: [...ADMIN_VIEWERS, 'SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'], category: 'Alerts' },
  { id: 'anonymous-tips', label: 'Anonymous Tips (Submit)', paths: ['/dashboard/anonymous-tips'], defaultRoles: ['*'], category: 'Alerts' },
  { id: 'security-reports', label: 'Security Reports (Submit)', paths: ['/dashboard/security-reports'], defaultRoles: ['*'], category: 'Alerts' },

  // Inventory
  { id: 'inventory', label: 'Inventory', paths: ['/dashboard/inventory'], defaultRoles: ['THEATRE_STORE_KEEPER', 'PROCUREMENT_OFFICER', 'SCRUB_NURSE'], category: 'Inventory' },
  { id: 'sub-stores', label: 'Sub-Stores', paths: ['/dashboard/sub-stores'], defaultRoles: ['THEATRE_STORE_KEEPER', 'PROCUREMENT_OFFICER'], category: 'Inventory' },

  // Reports & administration
  { id: 'announcements', label: 'Announcements', paths: ['/dashboard/announcements'], defaultRoles: ['*'], category: 'Reports' },
  { id: 'theatre-meals', label: 'Theatre Meals', paths: ['/dashboard/theatre-meals'], defaultRoles: ['THEATRE_CAFETERIA_MANAGER'], category: 'Reports' },
  { id: 'staff-effectiveness', label: 'Staff Effectiveness', paths: ['/dashboard/reports/staff-effectiveness'], defaultRoles: ADMIN_VIEWERS, category: 'Reports' },
  { id: 'reports', label: 'Reports & Analytics', paths: ['/dashboard/reports'], defaultRoles: ADMIN_VIEWERS, category: 'Reports' },
  { id: 'presentation', label: 'Presentation', paths: ['/dashboard/presentation'], defaultRoles: ADMIN_VIEWERS, category: 'Reports' },
  { id: 'training', label: 'Staff Training', paths: ['/training'], defaultRoles: ['*'], category: 'Reports' },
  { id: 'settings', label: 'Settings', paths: ['/dashboard/settings'], defaultRoles: ['*'], category: 'Reports' },

  // Admin-only modules (cannot be granted; gated separately)
  { id: 'users', label: 'User Management', paths: ['/dashboard/users'], defaultRoles: [], category: 'Admin' },
  { id: 'surgical-catalog', label: 'Surgical Catalog', paths: ['/dashboard/admin/surgical-catalog'], defaultRoles: ['CONSUMABLE_PACK_PROVIDER', 'PHARMACIST'], category: 'Admin' },
  { id: 'disciplinary-queries', label: 'Disciplinary Queries', paths: ['/dashboard/disciplinary-queries'], defaultRoles: [], category: 'Admin' },
  { id: 'anonymous-tips-review', label: 'Review Anonymous Tips', paths: ['/dashboard/anonymous-tips/view'], defaultRoles: [], category: 'Admin' },
  { id: 'security-reports-review', label: 'Review Security Reports', paths: ['/dashboard/security-reports/view'], defaultRoles: [], category: 'Admin' },
  { id: 'theatre-audit', label: 'Theatre Audit', paths: ['/dashboard/theatre-audit'], defaultRoles: [...ADMIN_VIEWERS], category: 'Admin' },
];

// Modules that may be granted by admins via the access editor.
// Admin-only modules are excluded — those follow role membership only.
export const GRANTABLE_MODULES = MODULES.filter(m => m.category !== 'Admin');

export function isFullAccessRole(role: string | undefined | null): boolean {
  return !!role && (FULL_ACCESS_ROLES as readonly string[]).includes(role);
}

/**
 * Returns the set of module IDs visible to the user.
 * - Full-access roles get every module.
 * - Otherwise: union of (modules whose defaultRoles contain the user's role
 *   OR is '*') and (per-user grants).
 */
export function resolveAllowedModuleIds(
  role: string | undefined | null,
  extraModules: string[] = []
): Set<string> {
  if (isFullAccessRole(role)) {
    return new Set(MODULES.map(m => m.id));
  }
  const ids = new Set<string>();
  for (const m of MODULES) {
    if (m.defaultRoles.includes('*') || (role && m.defaultRoles.includes(role))) {
      ids.add(m.id);
    }
  }
  for (const id of extraModules) ids.add(id);
  return ids;
}

/**
 * True if the given path is reachable for this role + grants.
 * Unmapped paths default to allowed (we only restrict paths a module claims).
 */
export function canAccessPath(
  role: string | undefined | null,
  extraModules: string[],
  path: string
): boolean {
  if (isFullAccessRole(role)) return true;
  // Find the most specific module claiming this path.
  let claimed: AppModule | undefined;
  for (const m of MODULES) {
    for (const p of m.paths) {
      if (path === p || path.startsWith(p + '/')) {
        if (!claimed || m.paths.find(pp => pp.length > (claimed!.paths[0]?.length ?? 0))) {
          claimed = m;
        }
      }
    }
  }
  if (!claimed) return true; // path not mapped to any module
  if (claimed.defaultRoles.includes('*')) return true;
  if (role && claimed.defaultRoles.includes(role)) return true;
  return extraModules.includes(claimed.id);
}
