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
  | 'NURSE_ANAESTHETIST'
  | 'SCRUB_NURSE'
  | 'CIRCULATING_NURSE'
  | 'HOLDING_AREA_NURSE'
  | 'RECOVERY_ROOM_NURSE'
  | 'THEATRE_STORE_KEEPER'
  | 'PORTER'
  | 'ANAESTHETIC_TECHNICIAN'
  | 'BIOMEDICAL_ENGINEER'
  | 'CLEANER'
  | 'THEATRE_COORDINATOR';

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
    create: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE', 'CIRCULATING_NURSE'],
    read: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE', 'CIRCULATING_NURSE', 'NURSE_ANAESTHETIST'],
    update: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE', 'CIRCULATING_NURSE'],
    delete: ['ADMIN', 'THEATRE_MANAGER'],
  },

  // Anesthesia Monitoring
  anesthesiaMonitoring: {
    create: ['ADMIN', 'THEATRE_MANAGER', 'ANAESTHETIST', 'NURSE_ANAESTHETIST'],
    read: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'SURGEON', 'ANAESTHETIST', 'NURSE_ANAESTHETIST'],
    update: ['ADMIN', 'THEATRE_MANAGER', 'ANAESTHETIST', 'NURSE_ANAESTHETIST'],
    delete: ['ADMIN', 'THEATRE_MANAGER'],
  },

  // Surgical Count
  surgicalCount: {
    create: ['ADMIN', 'THEATRE_MANAGER', 'SCRUB_NURSE', 'CIRCULATING_NURSE'],
    read: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'SCRUB_NURSE', 'CIRCULATING_NURSE'],
    update: ['ADMIN', 'THEATRE_MANAGER', 'SCRUB_NURSE', 'CIRCULATING_NURSE'],
    delete: ['ADMIN', 'THEATRE_MANAGER'],
  },

  // Surgical Timing
  surgicalTiming: {
    create: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE', 'CIRCULATING_NURSE', 'THEATRE_COORDINATOR'],
    read: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE', 'CIRCULATING_NURSE', 'THEATRE_COORDINATOR'],
    update: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE', 'CIRCULATING_NURSE', 'THEATRE_COORDINATOR'],
    delete: ['ADMIN', 'THEATRE_MANAGER'],
  },

  // Consumables Tracking
  consumables: {
    create: ['ADMIN', 'THEATRE_MANAGER', 'SCRUB_NURSE', 'CIRCULATING_NURSE', 'THEATRE_STORE_KEEPER'],
    read: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'SCRUB_NURSE', 'CIRCULATING_NURSE', 'THEATRE_STORE_KEEPER'],
    update: ['ADMIN', 'THEATRE_MANAGER', 'SCRUB_NURSE', 'CIRCULATING_NURSE', 'THEATRE_STORE_KEEPER'],
    delete: ['ADMIN', 'THEATRE_MANAGER'],
  },

  // Bill of Materials (BOM)
  bom: {
    create: ['ADMIN', 'THEATRE_MANAGER'],
    read: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'],
    update: ['ADMIN', 'THEATRE_MANAGER'],
    delete: ['ADMIN', 'THEATRE_MANAGER'],
  },

  // Surgery Scheduling
  surgeryScheduling: {
    create: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'THEATRE_COORDINATOR'],
    read: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE', 'CIRCULATING_NURSE', 'THEATRE_COORDINATOR', 'NURSE_ANAESTHETIST'],
    update: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'THEATRE_COORDINATOR'],
    delete: ['ADMIN', 'THEATRE_MANAGER'],
  },

  // Holding Area Assessment
  holdingArea: {
    create: ['ADMIN', 'THEATRE_MANAGER', 'HOLDING_AREA_NURSE', 'CIRCULATING_NURSE'],
    read: ['ADMIN', 'THEATRE_MANAGER', 'HOLDING_AREA_NURSE', 'CIRCULATING_NURSE', 'SURGEON', 'ANAESTHETIST'],
    update: ['ADMIN', 'THEATRE_MANAGER', 'HOLDING_AREA_NURSE', 'CIRCULATING_NURSE'],
    delete: ['ADMIN', 'THEATRE_MANAGER'],
  },

  // PACU/Recovery
  pacu: {
    create: ['ADMIN', 'THEATRE_MANAGER', 'RECOVERY_ROOM_NURSE', 'NURSE_ANAESTHETIST'],
    read: ['ADMIN', 'THEATRE_MANAGER', 'RECOVERY_ROOM_NURSE', 'NURSE_ANAESTHETIST', 'ANAESTHETIST', 'SURGEON'],
    update: ['ADMIN', 'THEATRE_MANAGER', 'RECOVERY_ROOM_NURSE', 'NURSE_ANAESTHETIST'],
    delete: ['ADMIN', 'THEATRE_MANAGER'],
  },

  // Inventory Management
  inventory: {
    create: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_STORE_KEEPER'],
    read: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'THEATRE_STORE_KEEPER', 'SCRUB_NURSE', 'CIRCULATING_NURSE'],
    update: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_STORE_KEEPER'],
    delete: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_STORE_KEEPER'],
  },

  // Patient Transfers
  transfers: {
    create: ['ADMIN', 'THEATRE_MANAGER', 'PORTER', 'CIRCULATING_NURSE', 'HOLDING_AREA_NURSE', 'RECOVERY_ROOM_NURSE'],
    read: ['ADMIN', 'THEATRE_MANAGER', 'PORTER', 'CIRCULATING_NURSE', 'HOLDING_AREA_NURSE', 'RECOVERY_ROOM_NURSE', 'SURGEON', 'ANAESTHETIST'],
    update: ['ADMIN', 'THEATRE_MANAGER', 'PORTER', 'CIRCULATING_NURSE'],
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
    NURSE_ANAESTHETIST: 'Nurse Anaesthetist',
    SCRUB_NURSE: 'Scrub Nurse',
    CIRCULATING_NURSE: 'Circulating Nurse',
    HOLDING_AREA_NURSE: 'Holding Area Nurse',
    RECOVERY_ROOM_NURSE: 'Recovery Room Nurse',
    THEATRE_STORE_KEEPER: 'Theatre Store Keeper',
    PORTER: 'Porter',
    ANAESTHETIC_TECHNICIAN: 'Anaesthetic Technician',
    BIOMEDICAL_ENGINEER: 'Biomedical Engineer',
    CLEANER: 'Cleaner',
    THEATRE_COORDINATOR: 'Theatre Coordinator',
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
    NURSE_ANAESTHETIST: '/dashboard/surgeries',
    SCRUB_NURSE: '/dashboard/surgeries',
    CIRCULATING_NURSE: '/dashboard/surgeries',
    HOLDING_AREA_NURSE: '/dashboard/holding-area',
    RECOVERY_ROOM_NURSE: '/dashboard/pacu',
    THEATRE_STORE_KEEPER: '/dashboard/inventory',
    PORTER: '/dashboard/transfers',
    ANAESTHETIC_TECHNICIAN: '/dashboard/surgeries',
    BIOMEDICAL_ENGINEER: '/dashboard',
    CLEANER: '/dashboard',
    THEATRE_COORDINATOR: '/dashboard/surgeries',
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
    surgeries: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'ANAESTHETIST', 'NURSE_ANAESTHETIST', 'SCRUB_NURSE', 'CIRCULATING_NURSE', 'THEATRE_COORDINATOR', 'ANAESTHETIC_TECHNICIAN'],
    patients: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'ANAESTHETIST', 'NURSE_ANAESTHETIST', 'HOLDING_AREA_NURSE', 'RECOVERY_ROOM_NURSE'],
    inventory: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_STORE_KEEPER', 'SCRUB_NURSE', 'CIRCULATING_NURSE'],
    'holding-area': ['ADMIN', 'THEATRE_MANAGER', 'HOLDING_AREA_NURSE', 'CIRCULATING_NURSE'],
    pacu: ['ADMIN', 'THEATRE_MANAGER', 'RECOVERY_ROOM_NURSE', 'NURSE_ANAESTHETIST', 'ANAESTHETIST'],
    transfers: ['ADMIN', 'THEATRE_MANAGER', 'PORTER', 'CIRCULATING_NURSE', 'HOLDING_AREA_NURSE', 'RECOVERY_ROOM_NURSE'],
    theatres: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_COORDINATOR', 'SURGEON', 'ANAESTHETIST'],
    checklists: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE', 'CIRCULATING_NURSE'],
    reports: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN'],
    users: ['ADMIN', 'SYSTEM_ADMINISTRATOR', 'THEATRE_MANAGER'],
    alerts: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'ANAESTHETIST', 'SCRUB_NURSE', 'CIRCULATING_NURSE', 'HOLDING_AREA_NURSE', 'RECOVERY_ROOM_NURSE'],
    cancellations: ['ADMIN', 'THEATRE_MANAGER', 'SURGEON', 'THEATRE_COORDINATOR'],
    mortality: ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_CHAIRMAN', 'SURGEON', 'ANAESTHETIST'],
    'theatre-setup': ['ADMIN', 'THEATRE_MANAGER', 'THEATRE_STORE_KEEPER'],
  };

  return allItems.filter(item => {
    const allowedRoles = navPermissions[item] || [];
    return allowedRoles.includes(role);
  });
}
