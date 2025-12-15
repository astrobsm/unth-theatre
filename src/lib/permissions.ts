/**
 * Role-based permissions for theatre management system
 */

export type UserRole = 
  | 'ADMIN'
  | 'SYSTEM_ADMINISTRATOR'
  | 'THEATRE_MANAGER'
  | 'THEATRE_CHAIRMAN'
  | 'SURGEON'
  | 'ANAESTHETIST'
  | 'SCRUB_NURSE'
  | 'RECOVERY_ROOM_NURSE'
  | 'THEATRE_STORE_KEEPER'
  | 'PORTER'
  | 'ANAESTHETIC_TECHNICIAN'
  | 'BIOMEDICAL_ENGINEER'
  | 'CLEANER'
  | 'PROCUREMENT_OFFICER';

export interface Permission {
  create: UserRole[];
  read: UserRole[];
  update: UserRole[];
  delete: UserRole[];
}

/**
 * Permission matrix for different modules
 */
export const permissions = {
  // WHO Checklist
  whoChecklist: {
    create: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE'],
    read: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE'],
    update: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE'],
    delete: ['ADMIN', 'THEATRE_MANAGER'],
  },

  // Anesthesia Monitoring
  anesthesiaMonitoring: {
    create: ['ADMIN', 'THEATRE_MANAGER', 'ANAESTHETIST'],
    read: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'SURGEON', 'ANAESTHETIST'],
    update: ['ADMIN', 'THEATRE_MANAGER', 'ANAESTHETIST'],
    delete: ['ADMIN', 'THEATRE_MANAGER'],
  },

  // Surgical Count
  surgicalCount: {
    create: ['ADMIN', 'THEATRE_MANAGER', 'SCRUB_NURSE'],
    read: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'SCRUB_NURSE'],
    update: ['ADMIN', 'THEATRE_MANAGER', 'SCRUB_NURSE'],
    delete: ['ADMIN', 'THEATRE_MANAGER'],
  },

  // Surgical Timing
  surgicalTiming: {
    create: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE'],
    read: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE'],
    update: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE'],
    delete: ['ADMIN', 'THEATRE_MANAGER'],
  },

  // Consumables Tracking
  consumables: {
    create: ['ADMIN', 'THEATRE_MANAGER', 'SCRUB_NURSE', 'THEATRE_STORE_KEEPER'],
    read: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'SCRUB_NURSE', 'THEATRE_STORE_KEEPER', 'PROCUREMENT_OFFICER'],
    update: ['ADMIN', 'THEATRE_MANAGER', 'SCRUB_NURSE', 'THEATRE_STORE_KEEPER'],
    delete: ['ADMIN', 'THEATRE_MANAGER'],
  },

  // Bill of Materials (BOM)
  bom: {
    create: ['ADMIN', 'THEATRE_MANAGER'],
    read: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'PROCUREMENT_OFFICER'],
    update: ['ADMIN', 'THEATRE_MANAGER'],
    delete: ['ADMIN', 'THEATRE_MANAGER'],
  },

  // Surgery Scheduling
  surgeryScheduling: {
    create: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON'],
    read: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE'],
    update: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON'],
    delete: ['ADMIN', 'THEATRE_MANAGER'],
  },

  // Holding Area Assessment
  holdingArea: {
    create: ['ADMIN', 'THEATRE_MANAGER', 'SCRUB_NURSE'],
    read: ['ADMIN', 'THEATRE_MANAGER', 'SCRUB_NURSE', 'SURGEON', 'ANAESTHETIST'],
    update: ['ADMIN', 'THEATRE_MANAGER', 'SCRUB_NURSE'],
    delete: ['ADMIN', 'THEATRE_MANAGER'],
  },

  // PACU/Recovery
  pacu: {
    create: ['ADMIN', 'THEATRE_MANAGER', 'RECOVERY_ROOM_NURSE'],
    read: ['ADMIN', 'THEATRE_MANAGER', 'RECOVERY_ROOM_NURSE', 'ANAESTHETIST', 'SURGEON'],
    update: ['ADMIN', 'THEATRE_MANAGER', 'RECOVERY_ROOM_NURSE'],
    delete: ['ADMIN', 'THEATRE_MANAGER'],
  },

  // Inventory Management
  inventory: {
    create: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_STORE_KEEPER'],
    read: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'THEATRE_STORE_KEEPER', 'SCRUB_NURSE', 'PROCUREMENT_OFFICER'],
    update: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_STORE_KEEPER'],
    delete: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_STORE_KEEPER'],
  },

  // Patient Transfers
  transfers: {
    create: ['ADMIN', 'THEATRE_MANAGER', 'PORTER', 'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE'],
    read: ['ADMIN', 'THEATRE_MANAGER', 'PORTER', 'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE', 'SURGEON', 'ANAESTHETIST'],
    update: ['ADMIN', 'THEATRE_MANAGER', 'PORTER', 'SCRUB_NURSE'],
    delete: ['ADMIN', 'THEATRE_MANAGER'],
  },

  // User Management
  userManagement: {
    create: ['ADMIN', 'SYSTEM_ADMINISTRATOR'],
    read: ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER'],
    update: ['ADMIN', 'SYSTEM_ADMINISTRATOR'],
    delete: ['ADMIN', 'SYSTEM_ADMINISTRATOR'],
  },

  // Mortality Audit
  mortality: {
    create: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'ANAESTHETIST'],
    read: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'SURGEON', 'ANAESTHETIST'],
    update: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'ANAESTHETIST'],
    delete: ['ADMIN', 'THEATRE_MANAGER'],
  },

  // Reports & Analytics
  reports: {
    create: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'],
    read: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'],
    update: ['ADMIN', 'THEATRE_MANAGER'],
    delete: ['ADMIN', 'THEATRE_MANAGER'],
  },
} as const;

/**
 * Check if a user has permission to perform an action on a module
 */
export function hasPermission(
  userRole: UserRole | undefined | null,
  module: keyof typeof permissions,
  action: 'create' | 'read' | 'update' | 'delete'
): boolean {
  if (!userRole) return false;
  
  const modulePermissions = permissions[module];
  if (!modulePermissions) return false;
  
  return (modulePermissions[action] as readonly UserRole[]).includes(userRole);
}

/**
 * Get user-friendly role name
 */
export function getRoleName(role: UserRole): string {
  const roleNames: Record<UserRole, string> = {
    ADMIN: 'Administrator',
    SYSTEM_ADMINISTRATOR: 'System Administrator',
    THEATRE_MANAGER: 'Theatre Manager',
    THEATRE_CHAIRMAN: 'Theatre Chairman',
    SURGEON: 'Surgeon',
    ANAESTHETIST: 'Anaesthetist',
    SCRUB_NURSE: 'Scrub Nurse',
    RECOVERY_ROOM_NURSE: 'Recovery Room Nurse',
    THEATRE_STORE_KEEPER: 'Theatre Store Keeper',
    PORTER: 'Porter',
    ANAESTHETIC_TECHNICIAN: 'Anaesthetic Technician',
    BIOMEDICAL_ENGINEER: 'Biomedical Engineer',
    CLEANER: 'Cleaner',
    PROCUREMENT_OFFICER: 'Procurement Officer',
  };
  
  return roleNames[role] || role;
}

/**
 * Get role-specific dashboard URL
 */
export function getRoleDashboard(role: UserRole): string {
  const roleDashboards: Record<UserRole, string> = {
    ADMIN: '/dashboard',
    SYSTEM_ADMINISTRATOR: '/dashboard',
    THEATRE_MANAGER: '/dashboard',
    THEATRE_CHAIRMAN: '/dashboard',
    SURGEON: '/dashboard/surgeries',
    ANAESTHETIST: '/dashboard/surgeries',
    SCRUB_NURSE: '/dashboard/surgeries',
    RECOVERY_ROOM_NURSE: '/dashboard/pacu',
    THEATRE_STORE_KEEPER: '/dashboard/inventory',
    PORTER: '/dashboard/transfers',
    ANAESTHETIC_TECHNICIAN: '/dashboard/surgeries',
    BIOMEDICAL_ENGINEER: '/dashboard',
    CLEANER: '/dashboard',
    PROCUREMENT_OFFICER: '/dashboard/inventory',
  };
  
  return roleDashboards[role] || '/dashboard';
}

/**
 * Get visible navigation items for a role
 */
export function getVisibleNavItems(role: UserRole): string[] {
  const allItems = [
    'dashboard',
    'surgeries',
    'patients',
    'inventory',
    'holding-area',
    'pacu',
    'transfers',
    'theatres',
    'checklists',
    'reports',
    'users',
    'alerts',
    'cancellations',
    'mortality',
    'theatre-setup',
  ];

  // Define which roles can see which nav items
  const navPermissions: Record<string, UserRole[]> = {
    dashboard: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'SYSTEM_ADMINISTRATOR'],
    surgeries: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE', 'ANAESTHETIC_TECHNICIAN'],
    patients: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'ANAESTHETIST', 'RECOVERY_ROOM_NURSE'],
    inventory: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_STORE_KEEPER', 'SCRUB_NURSE', 'PROCUREMENT_OFFICER'],
    'holding-area': ['ADMIN', 'THEATRE_MANAGER', 'SCRUB_NURSE'],
    pacu: ['ADMIN', 'THEATRE_MANAGER', 'RECOVERY_ROOM_NURSE', 'ANAESTHETIST'],
    transfers: ['ADMIN', 'THEATRE_MANAGER', 'PORTER', 'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE'],
    theatres: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'ANAESTHETIST'],
    checklists: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE'],
    reports: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'],
    users: ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER'],
    alerts: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE', 'RECOVERY_ROOM_NURSE'],
    cancellations: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON'],
    mortality: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'SURGEON', 'ANAESTHETIST'],
    'theatre-setup': ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_STORE_KEEPER'],
  };

  return allItems.filter(item => {
    const allowedRoles = navPermissions[item] || [];
    return allowedRoles.includes(role);
  });
}
