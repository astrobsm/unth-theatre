// Shared definitions for the public staff onboarding flow.
// Keep in sync with prisma UserRole enum and bulk-upload route.

export interface RoleDef {
  value: string;     // matches Prisma UserRole enum
  label: string;     // human label shown in dropdown
  prefix: string;    // staff-code prefix (3 chars)
}

// Order = order shown in the form dropdown
export const ONBOARDING_ROLES: RoleDef[] = [
  // Clinical
  { value: 'SURGEON',                  label: 'Surgeon',                          prefix: 'SRG' },
  { value: 'HOUSE_OFFICER',            label: 'House Officer',                    prefix: 'HOU' },
  { value: 'ANAESTHETIST',             label: 'Anaesthetist',                     prefix: 'ANS' },
  { value: 'CONSULTANT_ANAESTHETIST',  label: 'Consultant Anaesthetist',          prefix: 'CAN' },
  { value: 'SCRUB_NURSE',              label: 'Scrub Nurse',                      prefix: 'SCN' },
  { value: 'RECOVERY_ROOM_NURSE',      label: 'PACU/Recovery Room Nurse',         prefix: 'RRN' },
  { value: 'ANAESTHETIC_TECHNICIAN',   label: 'Anaesthetic Technician',           prefix: 'ANT' },
  { value: 'PHARMACIST',               label: 'Pharmacist',                       prefix: 'PHM' },
  { value: 'EMERGENCY_LAB_SCIENTIST',  label: 'Emergency Lab Scientist',          prefix: 'ELS' },
  { value: 'LABORATORY_STAFF',         label: 'Laboratory Staff',                 prefix: 'LAB' },
  { value: 'BLOODBANK_STAFF',          label: 'Blood Bank Staff',                 prefix: 'BBS' },

  // Support / Stores
  { value: 'THEATRE_STORE_KEEPER',     label: 'Theatre Store Keeper',             prefix: 'TSK' },
  { value: 'BIOMEDICAL_ENGINEER',      label: 'Biomedical Engineer',              prefix: 'BME' },
  { value: 'PROCUREMENT_OFFICER',      label: 'Procurement Officer',              prefix: 'PRO' },
  { value: 'PORTER',                   label: 'Porter',                           prefix: 'PRT' },
  { value: 'CLEANER',                  label: 'Cleaner',                          prefix: 'CLN' },

  // Heads of Department / Supervisors
  { value: 'OXYGEN_UNIT_SUPERVISOR',   label: 'Oxygen Tech HOD',                  prefix: 'OXH' },
  { value: 'CSSD_SUPERVISOR',          label: 'CSSD HOD',                         prefix: 'CSH' },
  { value: 'LAUNDRY_SUPERVISOR',       label: 'Laundry HOD',                      prefix: 'LDH' },
  { value: 'PLUMBING_SUPERVISOR',      label: 'Plumbing HOD',                     prefix: 'PLH' },
  { value: 'WATER_SUPPLY_SUPERVISOR',  label: 'Water Supply HOD',                 prefix: 'WSH' },
  { value: 'WORKS_SUPERVISOR',         label: 'Works Supervisor',                 prefix: 'WKS' },

  // Operational staff
  { value: 'CSSD_STAFF',               label: 'CSSD Staff',                       prefix: 'CSS' },
  { value: 'LAUNDRY_STAFF',            label: 'Laundry Staff',                    prefix: 'LDS' },
  { value: 'PLUMBER',                  label: 'Plumber',                          prefix: 'PLM' },
  { value: 'POWER_PLANT_OPERATOR',     label: 'Power Plant Operator',             prefix: 'PPO' },
  { value: 'THEATRE_CAFETERIA_MANAGER',label: 'Theatre Cafeteria Manager',        prefix: 'TCM' },

  // Management
  { value: 'THEATRE_MANAGER',          label: 'Theatre Manager',                  prefix: 'TMG' },
  { value: 'THEATRE_CHAIRMAN',         label: 'Theatre Chairman',                 prefix: 'TCH' },
  { value: 'SYSTEM_ADMINISTRATOR',     label: 'System Administrator',             prefix: 'SYS' },
  { value: 'ADMIN',                    label: 'Admin',                            prefix: 'ADM' },
];

export const ROLE_VALUES = ONBOARDING_ROLES.map(r => r.value);

export function prefixForRole(role: string): string | null {
  return ONBOARDING_ROLES.find(r => r.value === role)?.prefix ?? null;
}
