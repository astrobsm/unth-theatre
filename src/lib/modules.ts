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

import { effectiveRoles } from './roleGroups';

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
import { AUDIT_COMMITTEE_ROLES } from './emergencyEscalation';

const CLINICAL_CORE = [
  'CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC',
  'HEAD_OF_ANAESTHESIA', 'HEAD_OF_SURGERY', 'HEAD_OF_OBSTETRICS_GYNAECOLOGY', 'HEAD_OF_PHARMACY',
  'SURGEON', 'CONSULTANT_SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST',
  'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE',
  'ANAESTHETIC_TECHNICIAN',
];

const ADMIN_VIEWERS = ['CHIEF_MEDICAL_DIRECTOR', 'CMAC', 'DC_MAC'];

// NOTE: Roles in FULL_ACCESS_ROLES are intentionally omitted from
// `defaultRoles` arrays — they bypass the check entirely.
export const MODULES: AppModule[] = [
  // Overview
  { id: 'dashboard', label: 'Dashboard (Home)', paths: ['/dashboard'], defaultRoles: ['*'], category: 'Overview' },
  // Every staff group has a duty sheet, so everyone may reach this — the
  // point is that people find their own without being granted anything.
  { id: 'duty-flyers', label: 'Duty Flyers', paths: ['/dashboard/duty-flyers'], defaultRoles: ['*'], category: 'Overview' },
  // Per-role desks. Each aggregates screens that already exist; the gating
  // below MIRRORS lib/dashboards/desks, which is what the API enforces. The
  // finance desk additionally admits imprest finance duty holders — a grant
  // the sidebar cannot see, so finance staff without one of these roles reach
  // it by link rather than by menu.
  { id: 'desk-consultant', label: 'My Practice (desk)', paths: ['/dashboard/my-practice'], defaultRoles: [...ADMIN_VIEWERS, 'CONSULTANT_SURGEON', 'SURGEON', 'CONSULTANT_ANAESTHETIST', 'ANAESTHETIST'], category: 'Overview' },
  { id: 'desk-inventory', label: 'Inventory Desk', paths: ['/dashboard/inventory-desk'], defaultRoles: ['THEATRE_STORE_KEEPER', 'PROCUREMENT_OFFICER', 'PHARMACIST', 'CSSD_SUPERVISOR', 'CONSUMABLE_PACK_PROVIDER'], category: 'Overview' },
  { id: 'desk-vendor', label: 'Vendor Accounts', paths: ['/dashboard/vendor-desk'], defaultRoles: [...ADMIN_VIEWERS, 'PROCUREMENT_OFFICER'], category: 'Overview' },
  { id: 'desk-finance', label: 'Finance Desk', paths: ['/dashboard/finance-desk'], defaultRoles: [...ADMIN_VIEWERS, 'PROCUREMENT_OFFICER'], category: 'Overview' },
  { id: 'emergency-booking', label: '🚨 Emergency Booking', paths: ['/dashboard/emergency-booking'], defaultRoles: [...CLINICAL_CORE, 'HOUSE_OFFICER', 'PORTER', 'BLOODBANK_STAFF', 'LABORATORY_STAFF', 'PHARMACIST'], category: 'Overview' },
  // The Theatre Audit Committee sees the emergencies that never started. The
  // list is AUDIT_COMMITTEE_ROLES in lib/emergencyEscalation — every discipline
  // that can hold a case up, because the cause is usually theirs to fix.
  // Seeing is not sending: the invitations route keeps that with the admins.
  { id: 'delayed-emergencies', label: 'Delayed Emergencies', paths: ['/dashboard/emergency-escalations'], defaultRoles: [...AUDIT_COMMITTEE_ROLES], category: 'Overview' },

  // Patient Registration & Scheduling
  // BOOKING_OFFICER gets these two and only these two. The clerical role exists
  // to register a patient and enter a booking; giving it the run of the
  // dashboard would make it a general account by another name, and the point of
  // a narrow role is that it can be handed out freely.
  { id: 'patients', label: 'Patients', paths: ['/dashboard/patients'], defaultRoles: [...CLINICAL_CORE, 'HOUSE_OFFICER', 'BOOKING_OFFICER'], category: 'Patient' },
  { id: 'surgeries', label: 'Surgeries', paths: ['/dashboard/surgeries'], defaultRoles: [...CLINICAL_CORE, 'HOUSE_OFFICER', 'BOOKING_OFFICER'], category: 'Patient' },
  { id: 'cancellations', label: 'Cancellations', paths: ['/dashboard/cancellations'], defaultRoles: CLINICAL_CORE, category: 'Patient' },

  // Pre-operative
  { id: 'pre-operative-visit', label: 'Pre-Op Visit', paths: ['/dashboard/pre-operative-visit'], defaultRoles: ['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'SURGEON', 'CONSULTANT_SURGEON', 'HOUSE_OFFICER', 'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE'], category: 'Pre-Op' },
  { id: 'patient-payment-guide', label: 'Patient Payment Guide', paths: ['/dashboard/patient-payment-guide'], defaultRoles: ['SURGEON', 'CONSULTANT_SURGEON', 'CONSULTANT_ANAESTHETIST', 'ANAESTHETIST', 'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', ...ADMIN_VIEWERS], category: 'Pre-Op' },
  { id: 'anaesthetist-board', label: 'Anaesthetist Review Board', paths: ['/dashboard/anaesthetist-board'], defaultRoles: ['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'], category: 'Pre-Op' },
  { id: 'preop-reviews', label: 'Pre-op Reviews', paths: ['/dashboard/preop-reviews'], defaultRoles: ['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'SURGEON', 'CONSULTANT_SURGEON'], category: 'Pre-Op' },
  { id: 'prescription-approvals', label: 'Rx Approvals', paths: ['/dashboard/prescription-approvals'], defaultRoles: ['CONSULTANT_ANAESTHETIST', 'PHARMACIST'], category: 'Pre-Op' },
  { id: 'prescriptions', label: 'Pharmacy', paths: ['/dashboard/prescriptions'], defaultRoles: ['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'PHARMACIST'], category: 'Pre-Op' },
  { id: 'blood-bank', label: 'Blood Bank', paths: ['/dashboard/blood-bank'], defaultRoles: ['BLOODBANK_STAFF', 'SURGEON', 'CONSULTANT_SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'HOUSE_OFFICER'], category: 'Pre-Op' },
  { id: 'anesthesia-setup', label: 'Anesthesia Setup', paths: ['/dashboard/anesthesia-setup'], defaultRoles: ['ANAESTHETIC_TECHNICIAN', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'], category: 'Pre-Op' },

  // Day-of-surgery logistics
  { id: 'roster', label: 'Duty Roster', paths: ['/dashboard/roster'], defaultRoles: [...CLINICAL_CORE, 'THEATRE_CAFETERIA_MANAGER'], category: 'Logistics' },
  { id: 'theatres', label: 'Theatre Allocation', paths: ['/dashboard/theatres'], defaultRoles: CLINICAL_CORE, category: 'Logistics' },
  { id: 'theatre-setup', label: 'Theatre Setup', paths: ['/dashboard/theatre-setup'], defaultRoles: ['SCRUB_NURSE', 'ANAESTHETIC_TECHNICIAN', 'THEATRE_STORE_KEEPER'], category: 'Logistics' },
  { id: 'theatre-readiness', label: 'Theatre Readiness', paths: ['/dashboard/theatre-readiness'], defaultRoles: ['*'], category: 'Logistics' },
  // Theatre operations. Wide by default: recording a delay is the good
  // outcome, so anybody in the room must be able to do it.
  { id: 'theatre-ops', label: 'Theatre Operations', paths: ['/dashboard/theatre-ops'], defaultRoles: [...CLINICAL_CORE, 'HOUSE_OFFICER', 'THEATRE_STORE_KEEPER', 'CSSD_STAFF', 'CSSD_SUPERVISOR', 'PHARMACIST', 'BIOMEDICAL_ENGINEER', 'PORTER', 'CLEANER', 'BLOODBANK_STAFF', 'LABORATORY_STAFF', 'POWER_PLANT_OPERATOR', 'WORKS_SUPERVISOR', 'OXYGEN_UNIT_SUPERVISOR'], category: 'Logistics' },
  // The theatre-ops board is for everyone who works a list; the two screens
  // below read across theatres and are narrowed to consultants + management.
  // Longest-prefix matching means these override the parent module above.
  { id: 'theatre-ops-performance', label: 'Theatre Performance', paths: ['/dashboard/theatre-ops/performance'], defaultRoles: [...ADMIN_VIEWERS, 'CONSULTANT_SURGEON', 'CONSULTANT_ANAESTHETIST'], category: 'Logistics' },
  // QA review decides whether a flagged case was avoidable. Governance only.
  { id: 'theatre-ops-review', label: 'Theatre QA Review', paths: ['/dashboard/theatre-ops/review'], defaultRoles: [...ADMIN_VIEWERS], category: 'Logistics' },
  { id: 'call-for-patient', label: 'Call for Patient', paths: ['/dashboard/call-for-patient'], defaultRoles: ['PORTER', 'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE'], category: 'Logistics' },
  { id: 'scrub-management', label: 'Scrub Management', paths: ['/dashboard/scrub-management'], defaultRoles: ['SCRUB_CARE_PROVIDER', 'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', 'SURGEON', 'CONSULTANT_SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'LAUNDRY_STAFF', 'LAUNDRY_SUPERVISOR'], category: 'Logistics' },

  // Intra-operative
  // CLEANER belongs here: /api/cleaning/start REQUIRES role CLEANER, and its
  // only UI is on this page. Without the module the one feature built purely
  // for cleaners was unreachable by cleaners — which is why between-case
  // cleaning times were never being recorded.
  { id: 'theatre-reception', label: 'Theatre Reception', paths: ['/dashboard/theatre-reception'], defaultRoles: ['SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', 'SURGEON', 'CONSULTANT_SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'CLEANER'], category: 'Intra-Op' },
  { id: 'holding-area', label: 'Holding Area', paths: ['/dashboard/holding-area'], defaultRoles: ['SCRUB_NURSE', 'PORTER', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'SURGEON', 'CONSULTANT_SURGEON'], category: 'Intra-Op' },
  { id: 'ward-entries', label: 'Ward Escort Log', paths: ['/dashboard/holding-area/ward-entries'], defaultRoles: ['SCRUB_NURSE', 'RECOVERY_ROOM_NURSE'], category: 'Intra-Op' },
  { id: 'checklists', label: 'WHO Checklists', paths: ['/dashboard/checklists'], defaultRoles: ['SCRUB_NURSE', 'SURGEON', 'CONSULTANT_SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'], category: 'Intra-Op' },
  { id: 'equipment-checkout', label: 'Equipment Checkout', paths: ['/dashboard/equipment-checkout'], defaultRoles: ['THEATRE_STORE_KEEPER', 'SCRUB_NURSE', 'ANAESTHETIC_TECHNICIAN'], category: 'Intra-Op' },
  { id: 'medication-tracking', label: 'Med Tracking', paths: ['/dashboard/medication-tracking'], defaultRoles: ['ANAESTHETIST', 'CONSULTANT_ANAESTHETIST', 'PHARMACIST'], category: 'Intra-Op' },
  { id: 'consumable-pack-provider', label: 'Consumable Packs', paths: ['/dashboard/consumable-pack-provider'], defaultRoles: ['CONSUMABLE_PACK_PROVIDER', 'THEATRE_STORE_KEEPER'], category: 'Intra-Op' },
  // Theatre Supply Unit. Wide by default on purpose: a surgeon who cannot see
  // the shelf books blind, which is the problem the module exists to solve.
  { id: 'theatre-supply', label: 'Theatre Supply Unit', paths: ['/dashboard/theatre-supply'], defaultRoles: [...CLINICAL_CORE, 'THEATRE_STORE_KEEPER', 'PROCUREMENT_OFFICER', 'PHARMACIST', 'CSSD_STAFF', 'CSSD_SUPERVISOR', 'CONSUMABLE_PACK_PROVIDER', 'HOUSE_OFFICER'], category: 'Logistics' },
  // Billing. Narrower than the supply unit: seeing what a patient owes is a
  // cash-desk and management matter, not a clinical one.
  { id: 'theatre-billing', label: 'Theatre Billing', paths: ['/dashboard/theatre-billing'], defaultRoles: ['THEATRE_STORE_KEEPER', 'PROCUREMENT_OFFICER', 'PHARMACIST', ...ADMIN_VIEWERS], category: 'Logistics' },

  // Handover
  { id: 'nurse-handover', label: 'Nurse Handover', paths: ['/dashboard/nurse-handover'], defaultRoles: ['SCRUB_NURSE', 'RECOVERY_ROOM_NURSE'], category: 'Handover' },

  // Post-operative
  { id: 'pacu', label: 'PACU (Recovery)', paths: ['/dashboard/pacu'], defaultRoles: ['RECOVERY_ROOM_NURSE', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'], category: 'Post-Op' },
  { id: 'transfers', label: 'Patient Transfers', paths: ['/dashboard/transfers'], defaultRoles: ['PORTER', 'RECOVERY_ROOM_NURSE'], category: 'Post-Op' },

  // Lab
  { id: 'emergency-lab-workup', label: 'Emergency Lab Workup', paths: ['/dashboard/emergency-lab-workup'], defaultRoles: ['LABORATORY_STAFF', 'EMERGENCY_LAB_SCIENTIST', 'SURGEON', 'CONSULTANT_SURGEON', 'ANAESTHETIST'], category: 'Lab' },

  // Facility & support services
  { id: 'plumbing-water-supply', label: 'Plumbing & Water', paths: ['/dashboard/plumbing-water-supply'], defaultRoles: ['PLUMBER', 'PLUMBING_SUPERVISOR', 'WATER_SUPPLY_SUPERVISOR', 'WORKS_SUPERVISOR'], category: 'Facility' },
  { id: 'power-house', label: 'Power House', paths: ['/dashboard/power-house'], defaultRoles: ['POWER_PLANT_OPERATOR', 'WORKS_SUPERVISOR'], category: 'Facility' },
  { id: 'cssd', label: 'CSSD', paths: ['/dashboard/cssd'], defaultRoles: ['CSSD_STAFF', 'CSSD_SUPERVISOR'], category: 'Facility' },
  { id: 'laundry', label: 'Laundry', paths: ['/dashboard/laundry', '/dashboard/laundry-supervisor'], defaultRoles: ['LAUNDRY_STAFF', 'LAUNDRY_SUPERVISOR', 'SCRUB_CARE_PROVIDER'], category: 'Facility' },
  { id: 'oxygen-control', label: 'Oxygen Control', paths: ['/dashboard/oxygen-control', '/dashboard/oxygen-supervisor'], defaultRoles: ['OXYGEN_UNIT_SUPERVISOR'], category: 'Facility' },
  { id: 'works-supervisor', label: 'Works Supervisor', paths: ['/dashboard/works-supervisor'], defaultRoles: ['WORKS_SUPERVISOR', 'PLUMBER', 'POWER_PLANT_OPERATOR'], category: 'Facility' },

  // Alerts & safety
  { id: 'alerts', label: 'Alerts', paths: ['/dashboard/alerts'], defaultRoles: ['*'], category: 'Alerts' },
  { id: 'radio', label: 'Theatre Radio', paths: ['/dashboard/radio'], defaultRoles: ['*'], category: 'Alerts' },
  { id: 'walkie-talkies', label: 'Walkie-Talkie Radios', paths: ['/dashboard/walkie-talkies'], defaultRoles: ['*'], category: 'Alerts' },
  // ANAESTHETIC_TECHNICIAN reports here as well as reads: they are the people
  // who find faulty anaesthetic equipment, and previously had no way to say so.
  { id: 'fault-alerts', label: 'Fault Alerts', paths: ['/dashboard/fault-alerts'], defaultRoles: ['BIOMEDICAL_ENGINEER', 'WORKS_SUPERVISOR', 'PLUMBER', 'ANAESTHETIC_TECHNICIAN'], category: 'Alerts' },
  { id: 'emergency-alerts', label: 'Emergency Alerts', paths: ['/dashboard/emergency-alerts'], defaultRoles: [...CLINICAL_CORE], category: 'Alerts' },
  { id: 'mortality', label: 'Mortality Registry', paths: ['/dashboard/mortality'], defaultRoles: [...ADMIN_VIEWERS, 'SURGEON', 'CONSULTANT_SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'], category: 'Alerts' },
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
  { id: 'research', label: 'Research & Analytics', paths: ['/dashboard/research'], defaultRoles: [...ADMIN_VIEWERS, 'SURGEON', 'CONSULTANT_SURGEON', 'ANAESTHETIST', 'CONSULTANT_ANAESTHETIST'], category: 'Reports' },
  { id: 'presentation', label: 'Presentation', paths: ['/dashboard/presentation'], defaultRoles: ADMIN_VIEWERS, category: 'Reports' },
  { id: 'training', label: 'Staff Training', paths: ['/training'], defaultRoles: ['*'], category: 'Reports' },
  { id: 'settings', label: 'Settings', paths: ['/dashboard/settings'], defaultRoles: ['*'], category: 'Reports' },
  // Listed BEFORE nothing in particular, but gated separately from Settings:
  // 'settings' is open to everyone, and what the hospital charges patients is
  // not an ordinary clinical setting. The API enforces the same roles, so the
  // menu entry is convenience rather than the boundary.
  { id: 'price-master', label: 'Price Master', paths: ['/dashboard/settings/price-master'], defaultRoles: [], category: 'Admin' },

  // Imprest Management and Retirement
  // ---------------------------------
  // `defaultRoles: []` on purpose: imprest access follows an assigned imprest
  // DUTY (ImprestRoleAssignment), never a clinical role. The API enforces this
  // independently — see lib/imprest/access.ts — so the sidebar entry appearing
  // for an admin never implies the route will serve them.
  { id: 'imprest', label: 'Imprest Register', paths: ['/dashboard/imprest'], defaultRoles: [], category: 'Imprest' },
  { id: 'imprest-expenditure', label: 'Expenditure', paths: ['/dashboard/imprest/expenditure'], defaultRoles: [], category: 'Imprest' },
  { id: 'imprest-retirement', label: 'Retirement', paths: ['/dashboard/imprest/retirement'], defaultRoles: [], category: 'Imprest' },
  { id: 'imprest-duties', label: 'Imprest Duties', paths: ['/dashboard/imprest/duties'], defaultRoles: [], category: 'Imprest' },

  // Admin-only modules (cannot be granted; gated separately)
  { id: 'users', label: 'User Management', paths: ['/dashboard/users'], defaultRoles: [], category: 'Admin' },
  { id: 'surgical-catalog', label: 'Surgical Catalog', paths: ['/dashboard/admin/surgical-catalog'], defaultRoles: ['CONSUMABLE_PACK_PROVIDER', 'PHARMACIST'], category: 'Admin' },
  { id: 'surgical-packs', label: 'Surgical Packs', paths: ['/dashboard/admin/surgical-packs'], defaultRoles: ['CONSUMABLE_PACK_PROVIDER', 'PHARMACIST'], category: 'Admin' },
  { id: 'disciplinary-queries', label: 'Disciplinary Queries', paths: ['/dashboard/disciplinary-queries'], defaultRoles: [], category: 'Admin' },
  { id: 'anonymous-tips-review', label: 'Review Anonymous Tips', paths: ['/dashboard/anonymous-tips/view'], defaultRoles: [], category: 'Admin' },
  { id: 'security-reports-review', label: 'Review Security Reports', paths: ['/dashboard/security-reports/view'], defaultRoles: [], category: 'Admin' },
  { id: 'theatre-audit', label: 'Theatre Audit', paths: ['/dashboard/theatre-audit'], defaultRoles: [...ADMIN_VIEWERS], category: 'Admin' },
];

/**
 * Catalogue paths that are access-control PREFIXES with no page of their own.
 *
 * `/dashboard/cssd` gates `/dashboard/cssd/inventory` but is not itself
 * navigable; `/dashboard/imprest/expenditure` is a grant key, the real form
 * being at `/dashboard/imprest/<id>/expenditure/new`.
 *
 * This list exists because the offline warm-up prefetched every path in the
 * catalogue as though it were a page, so each prefix produced a 404 in the
 * console on every load. `scripts/offline-tests/test-module-paths.js` checks
 * this list against the filesystem in both directions, so it cannot drift as
 * pages are added or removed.
 */
export const PREFIX_ONLY_PATHS: string[] = [
  '/dashboard/power-house',
  '/dashboard/cssd',
  '/dashboard/laundry-supervisor',
  '/dashboard/works-supervisor',
  '/dashboard/imprest/expenditure',
];

/** Catalogue paths that really are pages — what the offline warm-up should fetch. */
export const NAVIGABLE_MODULE_PATHS: string[] = Array.from(
  new Set(MODULES.flatMap((m) => m.paths))
).filter((p) => !PREFIX_ONLY_PATHS.includes(p));

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
  // A senior role also gets everything its junior role gets, so a consultant
  // surgeon never sees fewer modules than a resident surgeon.
  const roles = effectiveRoles(role);
  const ids = new Set<string>();
  for (const m of MODULES) {
    if (m.defaultRoles.includes('*') || roles.some((r) => m.defaultRoles.includes(r))) {
      ids.add(m.id);
    }
  }
  for (const id of extraModules) ids.add(id);
  return ids;
}

/**
 * True if the user may use the given module — role default OR admin grant.
 * Use this in API routes instead of hard-coding role lists, so that access
 * granted in /dashboard/admin/access actually takes effect server-side.
 */
export function hasModuleAccess(
  role: string | undefined | null,
  extraModules: string[] | undefined | null,
  moduleId: ModuleId
): boolean {
  return resolveAllowedModuleIds(role, extraModules ?? []).has(moduleId);
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
  if (effectiveRoles(role).some((r) => claimed!.defaultRoles.includes(r))) return true;
  return extraModules.includes(claimed.id);
}
