/**
 * Role-based access control.
 *
 * Permissions are `resource:action` strings. The matrix below is the single
 * authority — the API enforces it in middleware and the UI reads the same
 * matrix to hide controls the operator cannot use. The UI check is a courtesy;
 * the API check is the security boundary.
 */

import { ALL_ROLES, UserRole, WorkflowStage } from './enums';

export const Permission = {
  // Imprest
  IMPREST_VIEW: 'imprest:view',
  IMPREST_CREATE: 'imprest:create',
  IMPREST_UPDATE: 'imprest:update',
  IMPREST_DELETE: 'imprest:delete',
  IMPREST_ACTIVATE: 'imprest:activate',
  IMPREST_CLOSE: 'imprest:close',
  IMPREST_CANCEL: 'imprest:cancel',

  // Expenditure
  EXPENDITURE_VIEW: 'expenditure:view',
  EXPENDITURE_CREATE: 'expenditure:create',
  EXPENDITURE_UPDATE: 'expenditure:update',
  EXPENDITURE_DELETE: 'expenditure:delete',
  EXPENDITURE_QUERY: 'expenditure:query',
  EXPENDITURE_VOID: 'expenditure:void',

  // Attachments
  ATTACHMENT_VIEW: 'attachment:view',
  ATTACHMENT_UPLOAD: 'attachment:upload',
  ATTACHMENT_DELETE: 'attachment:delete',

  // Retirement
  RETIREMENT_VIEW: 'retirement:view',
  RETIREMENT_CREATE: 'retirement:create',
  RETIREMENT_UPDATE: 'retirement:update',
  RETIREMENT_SUBMIT: 'retirement:submit',
  RETIREMENT_CLOSE: 'retirement:close',
  /**
   * Unlocking an approved retirement so its figures can be corrected. Held by
   * the Administrator alone: it is the one act that can alter a certified
   * record, and it is always recorded with a reason.
   */
  RETIREMENT_REOPEN: 'retirement:reopen',

  // Approvals — one permission per chain stage
  APPROVE_ACCOUNT_OFFICER: 'approval:account-officer',
  APPROVE_CHAIRMAN: 'approval:chairman',
  APPROVE_FINANCE: 'approval:finance',
  APPROVE_INTERNAL_AUDIT: 'approval:internal-audit',
  APPROVE_CHIEF_ACCOUNTANT: 'approval:chief-accountant',
  APPROVE_MEDICAL_DIRECTOR: 'approval:medical-director',

  // Reference data
  REFERENCE_VIEW: 'reference:view',
  REFERENCE_MANAGE: 'reference:manage',

  // Vendors
  VENDOR_VIEW: 'vendor:view',
  VENDOR_MANAGE: 'vendor:manage',

  // Reports and documents
  REPORT_VIEW: 'report:view',
  REPORT_EXPORT: 'report:export',
  DOCUMENT_GENERATE: 'document:generate',

  // Audit
  AUDIT_VIEW: 'audit:view',
  AUDIT_EXPORT: 'audit:export',

  // Administration
  USER_VIEW: 'user:view',
  USER_MANAGE: 'user:manage',
  SETTINGS_VIEW: 'settings:view',
  SETTINGS_MANAGE: 'settings:manage',
  BACKUP_RUN: 'backup:run',

  // Synchronisation
  SYNC_PUSH: 'sync:push',
  SYNC_PULL: 'sync:pull',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

const P = Permission;

/** Everything a read-only observer may do. Other roles extend this set. */
const READ_ONLY: Permission[] = [
  P.IMPREST_VIEW,
  P.EXPENDITURE_VIEW,
  P.ATTACHMENT_VIEW,
  P.RETIREMENT_VIEW,
  P.REFERENCE_VIEW,
  P.VENDOR_VIEW,
  P.REPORT_VIEW,
  P.SYNC_PULL,
];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  /**
   * The Administrator maintains the system but is deliberately excluded from
   * the approval chain — a system account must not be able to certify a
   * retirement it could also have edited.
   */
  [UserRole.ADMINISTRATOR]: [
    ...READ_ONLY,
    P.IMPREST_CREATE,
    P.IMPREST_UPDATE,
    P.IMPREST_DELETE,
    P.IMPREST_ACTIVATE,
    P.IMPREST_CANCEL,
    P.EXPENDITURE_CREATE,
    P.EXPENDITURE_UPDATE,
    P.EXPENDITURE_DELETE,
    P.EXPENDITURE_VOID,
    P.ATTACHMENT_UPLOAD,
    P.ATTACHMENT_DELETE,
    P.RETIREMENT_CREATE,
    P.RETIREMENT_UPDATE,
    P.RETIREMENT_REOPEN,
    P.REFERENCE_MANAGE,
    P.VENDOR_MANAGE,
    P.REPORT_EXPORT,
    P.DOCUMENT_GENERATE,
    P.AUDIT_VIEW,
    P.AUDIT_EXPORT,
    P.USER_VIEW,
    P.USER_MANAGE,
    P.SETTINGS_VIEW,
    P.SETTINGS_MANAGE,
    P.BACKUP_RUN,
    P.SYNC_PUSH,
  ],

  [UserRole.CHAIRMAN]: [
    ...READ_ONLY,
    P.IMPREST_CREATE,
    P.IMPREST_UPDATE,
    P.IMPREST_ACTIVATE,
    P.IMPREST_CLOSE,
    P.IMPREST_CANCEL,
    P.EXPENDITURE_QUERY,
    P.RETIREMENT_UPDATE,
    P.APPROVE_CHAIRMAN,
    P.VENDOR_MANAGE,
    P.REPORT_EXPORT,
    P.DOCUMENT_GENERATE,
    P.AUDIT_VIEW,
    P.USER_VIEW,
    P.SETTINGS_VIEW,
    P.SYNC_PUSH,
  ],

  [UserRole.ACCOUNT_OFFICER]: [
    ...READ_ONLY,
    P.IMPREST_CREATE,
    P.IMPREST_UPDATE,
    P.EXPENDITURE_CREATE,
    P.EXPENDITURE_UPDATE,
    P.EXPENDITURE_QUERY,
    P.EXPENDITURE_VOID,
    P.ATTACHMENT_UPLOAD,
    P.RETIREMENT_CREATE,
    P.RETIREMENT_UPDATE,
    P.RETIREMENT_SUBMIT,
    P.APPROVE_ACCOUNT_OFFICER,
    P.VENDOR_MANAGE,
    P.REPORT_EXPORT,
    P.DOCUMENT_GENERATE,
    P.SYNC_PUSH,
  ],

  /** The Cashier posts day-to-day spending and uploads receipts. No approvals. */
  [UserRole.CASHIER]: [
    ...READ_ONLY,
    P.EXPENDITURE_CREATE,
    P.EXPENDITURE_UPDATE,
    P.ATTACHMENT_UPLOAD,
    P.RETIREMENT_CREATE,
    P.VENDOR_MANAGE,
    P.DOCUMENT_GENERATE,
    P.SYNC_PUSH,
  ],

  [UserRole.INTERNAL_AUDITOR]: [
    ...READ_ONLY,
    P.EXPENDITURE_QUERY,
    P.APPROVE_INTERNAL_AUDIT,
    P.REPORT_EXPORT,
    P.DOCUMENT_GENERATE,
    P.AUDIT_VIEW,
    P.AUDIT_EXPORT,
    P.SYNC_PUSH,
  ],

  [UserRole.FINANCE]: [
    ...READ_ONLY,
    P.EXPENDITURE_QUERY,
    P.APPROVE_FINANCE,
    P.RETIREMENT_CLOSE,
    P.IMPREST_CLOSE,
    P.REPORT_EXPORT,
    P.DOCUMENT_GENERATE,
    P.AUDIT_VIEW,
    P.SYNC_PUSH,
  ],

  /** Verifies the figures after Internal Audit; cannot post or edit spending. */
  [UserRole.CHIEF_ACCOUNTANT]: [
    ...READ_ONLY,
    P.EXPENDITURE_QUERY,
    P.APPROVE_CHIEF_ACCOUNTANT,
    P.RETIREMENT_CLOSE,
    P.IMPREST_CLOSE,
    P.REPORT_EXPORT,
    P.DOCUMENT_GENERATE,
    P.AUDIT_VIEW,
    P.SYNC_PUSH,
  ],

  /** Final approval. Deliberately holds no create or edit rights at all. */
  [UserRole.MEDICAL_DIRECTOR]: [
    ...READ_ONLY,
    P.APPROVE_MEDICAL_DIRECTOR,
    P.RETIREMENT_CLOSE,
    P.REPORT_EXPORT,
    P.DOCUMENT_GENERATE,
    P.AUDIT_VIEW,
  ],

  [UserRole.HOSPITAL_MANAGEMENT]: [
    ...READ_ONLY,
    P.REPORT_EXPORT,
    P.DOCUMENT_GENERATE,
    P.AUDIT_VIEW,
  ],

  [UserRole.VIEW_ONLY_AUDITOR]: [...READ_ONLY, P.AUDIT_VIEW, P.REPORT_EXPORT],
};

/** Permissions granted to a role, de-duplicated. */
export function permissionsForRole(role: UserRole): Permission[] {
  // Array.from rather than spreading the Set: this app's tsconfig sets no
  // explicit `target`, so spreading an iterable needs downlevelIteration.
  // Behaviour is identical.
  return Array.from(new Set(ROLE_PERMISSIONS[role] ?? []));
}

export function hasPermission(
  roleOrPermissions: UserRole | readonly string[],
  permission: Permission,
): boolean {
  const granted = Array.isArray(roleOrPermissions)
    ? roleOrPermissions
    : permissionsForRole(roleOrPermissions as UserRole);
  return granted.includes(permission);
}

export function hasAnyPermission(
  roleOrPermissions: UserRole | readonly string[],
  permissions: readonly Permission[],
): boolean {
  return permissions.some((p) => hasPermission(roleOrPermissions, p));
}

export function hasAllPermissions(
  roleOrPermissions: UserRole | readonly string[],
  permissions: readonly Permission[],
): boolean {
  return permissions.every((p) => hasPermission(roleOrPermissions, p));
}

/**
 * The permission that authorises acting on a given approval stage.
 * `null` for stages that are not operator decisions (PREPARED, APPROVED…).
 */
export const STAGE_PERMISSION: Record<WorkflowStage, Permission | null> = {
  [WorkflowStage.PREPARED]: null,
  [WorkflowStage.SUBMITTED]: null,
  // The statutory chain: Accounts, then Internal Audit, then the Chief
  // Accountant, then the Medical Director.
  [WorkflowStage.ACCOUNTS_REVIEW]: P.APPROVE_ACCOUNT_OFFICER,
  [WorkflowStage.INTERNAL_AUDIT]: P.APPROVE_INTERNAL_AUDIT,
  [WorkflowStage.CHIEF_ACCOUNTANT_REVIEW]: P.APPROVE_CHIEF_ACCOUNTANT,
  [WorkflowStage.MEDICAL_DIRECTOR_REVIEW]: P.APPROVE_MEDICAL_DIRECTOR,
  [WorkflowStage.APPROVED]: null,
  [WorkflowStage.COMPLETED]: P.RETIREMENT_CLOSE,
  [WorkflowStage.RETURNED]: null,
  [WorkflowStage.REJECTED]: null,
  // Superseded stages, retained so historical rows resolve.
  [WorkflowStage.ACCOUNT_OFFICER_REVIEW]: P.APPROVE_ACCOUNT_OFFICER,
  [WorkflowStage.CHAIRMAN_REVIEW]: P.APPROVE_CHAIRMAN,
  [WorkflowStage.FINANCE_REVIEW]: P.APPROVE_FINANCE,
  [WorkflowStage.CLOSED]: P.RETIREMENT_CLOSE,
};

/** Roles able to act on a stage — used to address `APPROVAL_NEEDED` alerts. */
export function rolesForStage(stage: WorkflowStage): UserRole[] {
  const permission = STAGE_PERMISSION[stage];
  if (!permission) return [];
  return ALL_ROLES.filter((role) => hasPermission(role, permission));
}

export function canActOnStage(role: UserRole, stage: WorkflowStage): boolean {
  const permission = STAGE_PERMISSION[stage];
  return permission !== null && hasPermission(role, permission);
}
