/**
 * Canonical enumerations for the Imprest Management and Retirement System.
 *
 * These values are the contract between the PostgreSQL schema (Prisma enums),
 * the REST API and the offline IndexedDB store. Changing a member here is a
 * breaking change and requires a Prisma migration plus an IndexedDB version
 * bump — never rename a member in place, add a new one and deprecate the old.
 */

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/**
 * Roles mirror the actual offices involved in imprest accountability within a
 * Federal Teaching Hospital. `VIEW_ONLY_AUDITOR` is deliberately distinct from
 * `INTERNAL_AUDITOR`: the latter certifies retirements, the former may only
 * read the permanent record.
 */
export const UserRole = {
  ADMINISTRATOR: 'ADMINISTRATOR',
  CHIEF_ACCOUNTANT: 'CHIEF_ACCOUNTANT',
  MEDICAL_DIRECTOR: 'MEDICAL_DIRECTOR',
  CHAIRMAN: 'CHAIRMAN',
  ACCOUNT_OFFICER: 'ACCOUNT_OFFICER',
  CASHIER: 'CASHIER',
  INTERNAL_AUDITOR: 'INTERNAL_AUDITOR',
  HOSPITAL_MANAGEMENT: 'HOSPITAL_MANAGEMENT',
  FINANCE: 'FINANCE',
  VIEW_ONLY_AUDITOR: 'VIEW_ONLY_AUDITOR',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const ALL_ROLES = Object.values(UserRole) as UserRole[];

/** Human-readable designations printed on vouchers, schedules and PDFs. */
export const ROLE_LABELS: Record<UserRole, string> = {
  ADMINISTRATOR: 'System Administrator',
  CHIEF_ACCOUNTANT: 'Chief Accountant',
  MEDICAL_DIRECTOR: 'Chief Medical Director',
  CHAIRMAN: 'Chairman, Theatre Commercialized Unit',
  ACCOUNT_OFFICER: 'Account Officer',
  CASHIER: 'Cashier',
  INTERNAL_AUDITOR: 'Internal Auditor',
  HOSPITAL_MANAGEMENT: 'Hospital Management',
  FINANCE: 'Finance Department',
  VIEW_ONLY_AUDITOR: 'Auditor (View Only)',
};

// ---------------------------------------------------------------------------
// Imprest lifecycle
// ---------------------------------------------------------------------------

/** The quarterly standing-imprest cycle. */
export const Quarter = { Q1: 'Q1', Q2: 'Q2', Q3: 'Q3', Q4: 'Q4' } as const;
export type Quarter = (typeof Quarter)[keyof typeof Quarter];
export const ALL_QUARTERS = Object.values(Quarter) as Quarter[];

/** The standing imprest released each quarter, in kobo (₦500,000.00). */
export const STANDING_IMPREST_KOBO = 50_000_000;

export const ImprestStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  PARTIALLY_RETIRED: 'PARTIALLY_RETIRED',
  FULLY_RETIRED: 'FULLY_RETIRED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
} as const;
export type ImprestStatus = (typeof ImprestStatus)[keyof typeof ImprestStatus];

export const IMPREST_STATUS_LABELS: Record<ImprestStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  PARTIALLY_RETIRED: 'Partially Retired',
  FULLY_RETIRED: 'Fully Retired',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

/** Statuses that still permit new expenditure to be posted against the imprest. */
export const SPENDABLE_IMPREST_STATUSES: ImprestStatus[] = [
  ImprestStatus.ACTIVE,
  ImprestStatus.PARTIALLY_RETIRED,
];

/** Statuses that represent a finished imprest — the record becomes read-only. */
export const TERMINAL_IMPREST_STATUSES: ImprestStatus[] = [
  ImprestStatus.CLOSED,
  ImprestStatus.CANCELLED,
];

// ---------------------------------------------------------------------------
// Expenditure
// ---------------------------------------------------------------------------

export const PaymentMethod = {
  CASH: 'CASH',
  TRANSFER: 'TRANSFER',
  POS: 'POS',
  CHEQUE: 'CHEQUE',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  TRANSFER: 'Bank Transfer',
  POS: 'POS',
  CHEQUE: 'Cheque',
};

export const ExpenditureStatus = {
  DRAFT: 'DRAFT',
  POSTED: 'POSTED',
  QUERIED: 'QUERIED',
  RETIRED: 'RETIRED',
  VOIDED: 'VOIDED',
} as const;
export type ExpenditureStatus = (typeof ExpenditureStatus)[keyof typeof ExpenditureStatus];

/**
 * Expenditure states that consume imprest funds. A `QUERIED` line is still
 * counted — the money left the imprest even while the query is unresolved —
 * but a `VOIDED` line is not.
 */
export const FUND_CONSUMING_EXPENDITURE_STATUSES: ExpenditureStatus[] = [
  ExpenditureStatus.POSTED,
  ExpenditureStatus.QUERIED,
  ExpenditureStatus.RETIRED,
];

/** Seeded expense categories. Administrators may add more at runtime. */
export const DEFAULT_EXPENSE_CATEGORIES = [
  'Stationery',
  'Office Supplies',
  'Maintenance',
  'Fuel',
  'Transportation',
  'Cleaning Materials',
  'Electrical Materials',
  'Repairs',
  'Medical Consumables',
  'Equipment',
  'Communication',
  'Utilities',
  'Training',
  'Printing',
  'Miscellaneous',
] as const;

// ---------------------------------------------------------------------------
// Retirement and the approval workflow
// ---------------------------------------------------------------------------

/**
 * The retirement approval chain. Order is significant — `WORKFLOW_SEQUENCE`
 * below derives the state machine from this list, so inserting a stage here
 * inserts it into the chain everywhere.
 */
export const WorkflowStage = {
  PREPARED: 'PREPARED',
  SUBMITTED: 'SUBMITTED',
  ACCOUNTS_REVIEW: 'ACCOUNTS_REVIEW',
  INTERNAL_AUDIT: 'INTERNAL_AUDIT',
  CHIEF_ACCOUNTANT_REVIEW: 'CHIEF_ACCOUNTANT_REVIEW',
  MEDICAL_DIRECTOR_REVIEW: 'MEDICAL_DIRECTOR_REVIEW',
  APPROVED: 'APPROVED',
  COMPLETED: 'COMPLETED',
  RETURNED: 'RETURNED',
  REJECTED: 'REJECTED',
  // Superseded by the statutory chain; kept so historical rows stay readable.
  ACCOUNT_OFFICER_REVIEW: 'ACCOUNT_OFFICER_REVIEW',
  CHAIRMAN_REVIEW: 'CHAIRMAN_REVIEW',
  FINANCE_REVIEW: 'FINANCE_REVIEW',
  CLOSED: 'CLOSED',
} as const;
export type WorkflowStage = (typeof WorkflowStage)[keyof typeof WorkflowStage];

export const WORKFLOW_STAGE_LABELS: Record<WorkflowStage, string> = {
  PREPARED: 'Prepared',
  SUBMITTED: 'Submitted',
  ACCOUNTS_REVIEW: 'Accounts Department',
  CHIEF_ACCOUNTANT_REVIEW: 'Chief Accountant',
  MEDICAL_DIRECTOR_REVIEW: 'Chief Medical Director',
  COMPLETED: 'Completed',
  RETURNED: 'Returned',
  ACCOUNT_OFFICER_REVIEW: 'Account Officer Review',
  CHAIRMAN_REVIEW: 'Chairman Review',
  FINANCE_REVIEW: 'Finance Review',
  INTERNAL_AUDIT: 'Internal Audit',
  APPROVED: 'Approved',
  CLOSED: 'Closed',
  REJECTED: 'Rejected',
};

export const ApprovalDecision = {
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  QUERY: 'QUERY',
} as const;
export type ApprovalDecision = (typeof ApprovalDecision)[keyof typeof ApprovalDecision];

export const RetirementStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  RETURNED: 'RETURNED',
  QUERIED: 'QUERIED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  COMPLETED: 'COMPLETED',
  IN_REVIEW: 'IN_REVIEW',
  CLOSED: 'CLOSED',
} as const;
export type RetirementStatus = (typeof RetirementStatus)[keyof typeof RetirementStatus];

// ---------------------------------------------------------------------------
// Documents and attachments
// ---------------------------------------------------------------------------

export const AttachmentKind = {
  RECEIPT: 'RECEIPT',
  INVOICE: 'INVOICE',
  PAYMENT_VOUCHER: 'PAYMENT_VOUCHER',
  DELIVERY_NOTE: 'DELIVERY_NOTE',
  WAYBILL: 'WAYBILL',
  QUOTATION: 'QUOTATION',
  APPROVAL_LETTER: 'APPROVAL_LETTER',
  BANK_SLIP: 'BANK_SLIP',
  OTHER: 'OTHER',
} as const;
export type AttachmentKind = (typeof AttachmentKind)[keyof typeof AttachmentKind];

export const SignatureKind = {
  PREPARER: 'PREPARER',
  OFFICER: 'OFFICER',
  WITNESS: 'WITNESS',
  APPROVER: 'APPROVER',
  CERTIFIER: 'CERTIFIER',
} as const;
export type SignatureKind = (typeof SignatureKind)[keyof typeof SignatureKind];

export const DocumentType = {
  IMPREST_REGISTER: 'IMPREST_REGISTER',
  CASH_BOOK: 'CASH_BOOK',
  EXPENSE_REGISTER: 'EXPENSE_REGISTER',
  RETIREMENT_FORM: 'RETIREMENT_FORM',
  APPROVAL_SHEET: 'APPROVAL_SHEET',
  RECEIPT_REGISTER: 'RECEIPT_REGISTER',
  SUMMARY_REPORT: 'SUMMARY_REPORT',
  VENDOR_REGISTER: 'VENDOR_REGISTER',
  AUDIT_REPORT: 'AUDIT_REPORT',
  PAYMENT_VOUCHER: 'PAYMENT_VOUCHER',
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  IMPREST_REGISTER: 'Imprest Register',
  CASH_BOOK: 'Cash Book',
  EXPENSE_REGISTER: 'Expense Register',
  RETIREMENT_FORM: 'Imprest Retirement',
  APPROVAL_SHEET: 'Approval Sheet',
  RECEIPT_REGISTER: 'Receipt Register',
  SUMMARY_REPORT: 'Summary Report',
  VENDOR_REGISTER: 'Vendor Register',
  AUDIT_REPORT: 'Audit Report',
  PAYMENT_VOUCHER: 'Payment Voucher',
};

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export const AuditAction = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  SOFT_DELETE: 'SOFT_DELETE',
  RESTORE: 'RESTORE',
  SUBMIT: 'SUBMIT',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  QUERY: 'QUERY',
  CLOSE: 'CLOSE',
  CANCEL: 'CANCEL',
  LOGIN: 'LOGIN',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  TWO_FACTOR_ENABLED: 'TWO_FACTOR_ENABLED',
  TWO_FACTOR_DISABLED: 'TWO_FACTOR_DISABLED',
  EXPORT: 'EXPORT',
  PRINT: 'PRINT',
  UPLOAD: 'UPLOAD',
  SYNC: 'SYNC',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export const AuditEntity = {
  USER: 'USER',
  IMPREST: 'IMPREST',
  EXPENDITURE: 'EXPENDITURE',
  ATTACHMENT: 'ATTACHMENT',
  RETIREMENT: 'RETIREMENT',
  APPROVAL: 'APPROVAL',
  VENDOR: 'VENDOR',
  CATEGORY: 'CATEGORY',
  BUDGET_HEAD: 'BUDGET_HEAD',
  DEPARTMENT: 'DEPARTMENT',
  SETTING: 'SETTING',
  SESSION: 'SESSION',
  DOCUMENT: 'DOCUMENT',
} as const;
export type AuditEntity = (typeof AuditEntity)[keyof typeof AuditEntity];

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const NotificationType = {
  PENDING_RETIREMENT: 'PENDING_RETIREMENT',
  LATE_RETIREMENT: 'LATE_RETIREMENT',
  APPROVAL_NEEDED: 'APPROVAL_NEEDED',
  RECEIPT_MISSING: 'RECEIPT_MISSING',
  BUDGET_EXHAUSTED: 'BUDGET_EXHAUSTED',
  RETIREMENT_COMPLETED: 'RETIREMENT_COMPLETED',
  EXPENDITURE_QUERIED: 'EXPENDITURE_QUERIED',
  IMPREST_RECEIVED: 'IMPREST_RECEIVED',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const NotificationSeverity = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
} as const;
export type NotificationSeverity =
  (typeof NotificationSeverity)[keyof typeof NotificationSeverity];

export const NOTIFICATION_SEVERITY: Record<NotificationType, NotificationSeverity> = {
  PENDING_RETIREMENT: NotificationSeverity.INFO,
  LATE_RETIREMENT: NotificationSeverity.CRITICAL,
  APPROVAL_NEEDED: NotificationSeverity.WARNING,
  RECEIPT_MISSING: NotificationSeverity.WARNING,
  BUDGET_EXHAUSTED: NotificationSeverity.CRITICAL,
  RETIREMENT_COMPLETED: NotificationSeverity.INFO,
  EXPENDITURE_QUERIED: NotificationSeverity.WARNING,
  IMPREST_RECEIVED: NotificationSeverity.INFO,
};

// ---------------------------------------------------------------------------
// Offline synchronisation
// ---------------------------------------------------------------------------

export const SyncState = {
  /** Created or edited locally, not yet sent to the server. */
  PENDING: 'PENDING',
  /** Currently in flight. */
  IN_FLIGHT: 'IN_FLIGHT',
  /** Confirmed by the server. */
  SYNCED: 'SYNCED',
  /** Server rejected the mutation; needs operator attention. */
  FAILED: 'FAILED',
  /** Server holds a newer version; requires a merge decision. */
  CONFLICT: 'CONFLICT',
} as const;
export type SyncState = (typeof SyncState)[keyof typeof SyncState];

export const SyncOperation = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  UPLOAD: 'UPLOAD',
  APPROVE: 'APPROVE',
} as const;
export type SyncOperation = (typeof SyncOperation)[keyof typeof SyncOperation];

/** Server wins by default; the operator may override to `CLIENT` on review. */
export const ConflictResolution = {
  SERVER: 'SERVER',
  CLIENT: 'CLIENT',
  MANUAL: 'MANUAL',
} as const;
export type ConflictResolution =
  (typeof ConflictResolution)[keyof typeof ConflictResolution];
