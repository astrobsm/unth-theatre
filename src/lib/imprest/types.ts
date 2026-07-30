/**
 * Domain entity shapes shared by the API, the offline store and the UI.
 *
 * These describe records **as transported over the wire** — dates are ISO 8601
 * strings and money is kobo (see `money.ts`). Prisma models mirror these but
 * carry native `Date`/`BigInt`; the API serialiser bridges the two.
 */

import type {
  ApprovalDecision,
  AttachmentKind,
  AuditAction,
  AuditEntity,
  ConflictResolution,
  DocumentType,
  ExpenditureStatus,
  ImprestStatus,
  NotificationSeverity,
  NotificationType,
  PaymentMethod,
  RetirementStatus,
  SignatureKind,
  SyncOperation,
  SyncState,
  UserRole,
  WorkflowStage,
} from './enums';
import type { Kobo } from './money';

/** ISO 8601 timestamp, e.g. `2026-07-30T09:15:00.000Z`. */
export type IsoDateTime = string;
/** ISO calendar date, e.g. `2026-07-30`. */
export type IsoDate = string;
export type Uuid = string;

/**
 * Every synchronisable record carries this envelope. `version` drives optimistic
 * concurrency: the server rejects a write whose `version` is stale, which is how
 * two offline devices editing the same expenditure produce a conflict rather
 * than a silent overwrite.
 */
export interface SyncEnvelope {
  id: Uuid;
  version: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  createdById: Uuid | null;
  updatedById: Uuid | null;
  /** Soft delete only — nothing is ever physically removed. */
  deletedAt: IsoDateTime | null;
  deletedById: Uuid | null;
  deletionReason: string | null;
}

// ---------------------------------------------------------------------------
// Organisation and reference data
// ---------------------------------------------------------------------------

export interface Department extends SyncEnvelope {
  code: string;
  name: string;
  office: string | null;
  isActive: boolean;
}

export interface BudgetHead extends SyncEnvelope {
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface VoteCode extends SyncEnvelope {
  code: string;
  name: string;
  budgetHeadId: Uuid | null;
  isActive: boolean;
}

export interface CostCentre extends SyncEnvelope {
  code: string;
  name: string;
  isActive: boolean;
}

export interface ExpenseCategory extends SyncEnvelope {
  name: string;
  parentId: Uuid | null;
  /** Optional default budget head, pre-filled on the expenditure form. */
  defaultBudgetHeadId: Uuid | null;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface FinancialYear extends SyncEnvelope {
  /** Label as written on vouchers, e.g. `2026` or `2026/2027`. */
  label: string;
  startDate: IsoDate;
  endDate: IsoDate;
  isCurrent: boolean;
  isClosed: boolean;
}

export interface Vendor extends SyncEnvelope {
  name: string;
  phone: string | null;
  address: string | null;
  /** Nigerian Taxpayer Identification Number. */
  tin: string | null;
  bankName: string | null;
  accountNumber: string | null;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Users, sessions and signatures
// ---------------------------------------------------------------------------

export interface User extends SyncEnvelope {
  staffNumber: string;
  fullName: string;
  email: string;
  phone: string | null;
  /** Printed under the signature line, e.g. `Chief Accountant`. */
  designation: string;
  role: UserRole;
  departmentId: Uuid | null;
  isActive: boolean;
  twoFactorEnabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: IsoDateTime | null;
  /** Stored signature reused when signing documents; PNG data URL reference. */
  signatureAttachmentId: Uuid | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds until `accessToken` expires. */
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface AuthenticatedUser {
  id: Uuid;
  staffNumber: string;
  fullName: string;
  email: string;
  designation: string;
  role: UserRole;
  departmentId: Uuid | null;
  permissions: string[];
  twoFactorEnabled: boolean;
  mustChangePassword: boolean;
}

export interface LoginResult {
  /** When true the caller must complete `/auth/2fa/verify` before receiving tokens. */
  twoFactorRequired: boolean;
  challengeToken?: string;
  user?: AuthenticatedUser;
  tokens?: AuthTokens;
}

export interface Signature {
  id: Uuid;
  kind: SignatureKind;
  /** PNG data URL captured from mouse, touch or stylus input. */
  imageData: string;
  signedByName: string;
  signedByDesignation: string;
  signedById: Uuid | null;
  signedAt: IsoDateTime;
  /** SHA-256 over the signed payload, binding the mark to the document state. */
  contentHash: string;
}

// ---------------------------------------------------------------------------
// Imprest
// ---------------------------------------------------------------------------

export interface Imprest extends SyncEnvelope {
  imprestNumber: string;
  voucherNumber: string | null;
  approvalNumber: string | null;

  financialYearId: Uuid;
  departmentId: Uuid;
  office: string | null;

  dateApproved: IsoDate;
  dateReceived: IsoDate | null;

  amountApproved: Kobo;
  amountReceived: Kobo;

  receivingOfficerId: Uuid;
  purpose: string;
  fundingSource: string | null;

  budgetHeadId: Uuid | null;
  voteCodeId: Uuid | null;
  costCentreId: Uuid | null;

  expectedRetirementDate: IsoDate;
  status: ImprestStatus;

  /** Denormalised rollups maintained transactionally alongside expenditure. */
  totalExpenditure: Kobo;
  totalRetired: Kobo;
  balance: Kobo;

  remarks: string | null;
}

/** An imprest joined with its computed position — what list and detail screens render. */
export interface ImprestWithTotals extends Imprest {
  department?: Pick<Department, 'id' | 'code' | 'name'>;
  financialYear?: Pick<FinancialYear, 'id' | 'label'>;
  receivingOfficer?: Pick<User, 'id' | 'fullName' | 'designation' | 'staffNumber'>;
  budgetHead?: Pick<BudgetHead, 'id' | 'code' | 'name'> | null;
  expenditureCount: number;
  percentageUtilised: number;
  isOverdue: boolean;
  daysToRetirement: number;
}

// ---------------------------------------------------------------------------
// Expenditure
// ---------------------------------------------------------------------------

export interface Expenditure extends SyncEnvelope {
  expenseNumber: string;
  imprestId: Uuid;

  date: IsoDate;

  vendorId: Uuid | null;
  /** Denormalised so a historic line survives a vendor record being renamed. */
  vendorName: string;
  vendorPhone: string | null;
  vendorAddress: string | null;
  vendorTin: string | null;

  description: string;
  purpose: string | null;
  categoryId: Uuid;
  subcategoryId: Uuid | null;

  quantity: number;
  unitOfMeasure: string | null;
  unitCost: Kobo;
  totalCost: Kobo;

  paymentMethod: PaymentMethod;
  voucherNumber: string | null;
  receiptNumber: string | null;
  invoiceNumber: string | null;
  receiptDate: IsoDate | null;

  amountPaid: Kobo;
  vat: Kobo;
  withholdingTax: Kobo;
  netAmount: Kobo;

  budgetHeadId: Uuid | null;
  voteCodeId: Uuid | null;

  remarks: string | null;
  officerResponsibleId: Uuid;
  witnessName: string | null;
  witnessDesignation: string | null;

  gpsLatitude: number | null;
  gpsLongitude: number | null;
  gpsAccuracy: number | null;

  status: ExpenditureStatus;
  retirementId: Uuid | null;
  queryReason: string | null;

  /** Maintained by the ledger service; the balance after this line was posted. */
  runningBalance: Kobo;
}

export interface ExpenditureWithRelations extends Expenditure {
  category?: Pick<ExpenseCategory, 'id' | 'name'>;
  subcategory?: Pick<ExpenseCategory, 'id' | 'name'> | null;
  budgetHead?: Pick<BudgetHead, 'id' | 'code' | 'name'> | null;
  officerResponsible?: Pick<User, 'id' | 'fullName' | 'designation'>;
  attachments: Attachment[];
  signatures: Signature[];
  hasReceipt: boolean;
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export interface Attachment extends SyncEnvelope {
  kind: AttachmentKind;
  fileName: string;
  mimeType: string;
  byteSize: number;
  /** SHA-256 of the stored bytes — detects tampering and de-duplicates uploads. */
  checksum: string;
  storageKey: string;
  /** Populated on demand; short-lived signed URL. */
  url?: string;
  thumbnailStorageKey: string | null;

  expenditureId: Uuid | null;
  imprestId: Uuid | null;
  retirementId: Uuid | null;
  userId: Uuid | null;

  width: number | null;
  height: number | null;
  /** Degrees of clockwise rotation the operator applied in the previewer. */
  rotation: number;
  capturedAt: IsoDateTime | null;
  /** Reserved for the OCR pipeline; populated when text extraction runs. */
  ocrText: string | null;
  ocrProcessedAt: IsoDateTime | null;
  caption: string | null;
}

// ---------------------------------------------------------------------------
// Retirement and approvals
// ---------------------------------------------------------------------------

export interface Retirement extends SyncEnvelope {
  retirementNumber: string;
  imprestId: Uuid;

  amountReceived: Kobo;
  totalExpenditure: Kobo;
  balanceReturned: Kobo;

  receiptCount: number;
  vendorCount: number;
  expenditureCount: number;

  retirementDate: IsoDate;
  status: RetirementStatus;
  currentStage: WorkflowStage;

  preparedById: Uuid;
  preparedAt: IsoDateTime;
  checkedById: Uuid | null;
  checkedAt: IsoDateTime | null;
  approvedById: Uuid | null;
  approvedAt: IsoDateTime | null;

  certificationText: string;
  remarks: string | null;

  /** Stable identifier printed on the PDF and encoded in its QR code. */
  documentId: string | null;
  submittedAt: IsoDateTime | null;
  closedAt: IsoDateTime | null;
}

export interface RetirementScheduleRow {
  serialNumber: number;
  date: IsoDate;
  voucherNumber: string;
  receiptNumber: string;
  vendor: string;
  particulars: string;
  budgetHead: string;
  amount: Kobo;
  runningTotal: Kobo;
  remarks: string;
}

export interface RetirementSummary {
  amountReceived: Kobo;
  totalExpenditure: Kobo;
  balanceReturned: Kobo;
  receiptCount: number;
  vendorCount: number;
  expenditureCount: number;
  retirementDate: IsoDate;
  preparedBy: SignatoryBlock | null;
  checkedBy: SignatoryBlock | null;
  approvedBy: SignatoryBlock | null;
}

export interface SignatoryBlock {
  name: string;
  designation: string;
  date: IsoDateTime | null;
  signatureImage: string | null;
}

export interface RetirementPacket {
  retirement: Retirement;
  imprest: Imprest;
  summary: RetirementSummary;
  schedule: RetirementScheduleRow[];
  receiptIndex: ReceiptIndexEntry[];
  approvals: Approval[];
}

export interface ReceiptIndexEntry {
  serialNumber: number;
  expenseNumber: string;
  receiptNumber: string | null;
  vendor: string;
  date: IsoDate;
  amount: Kobo;
  attachmentIds: Uuid[];
  attachmentCount: number;
}

export interface Approval extends SyncEnvelope {
  retirementId: Uuid;
  stage: WorkflowStage;
  sequence: number;
  decision: ApprovalDecision | null;

  actorId: Uuid | null;
  actorName: string | null;
  actorDesignation: string | null;
  actedAt: IsoDateTime | null;
  comments: string | null;
  signatureId: Uuid | null;

  /** Set when the stage is waiting on someone. */
  isCurrent: boolean;
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export interface AuditLog {
  id: Uuid;
  action: AuditAction;
  entity: AuditEntity;
  entityId: Uuid | null;
  entityLabel: string | null;

  actorId: Uuid | null;
  actorName: string | null;
  actorRole: UserRole | null;

  /** Field-level before/after. `null` on CREATE and on read-only actions. */
  changes: AuditFieldChange[] | null;

  occurredAt: IsoDateTime;
  ipAddress: string | null;
  userAgent: string | null;
  deviceLabel: string | null;
  latitude: number | null;
  longitude: number | null;

  /** Set when the event was captured offline and replayed on reconnection. */
  recordedOffline: boolean;
  requestId: string | null;
  notes: string | null;
}

export interface AuditFieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface Notification {
  id: Uuid;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body: string;
  recipientId: Uuid;
  entity: AuditEntity | null;
  entityId: Uuid | null;
  actionUrl: string | null;
  readAt: IsoDateTime | null;
  createdAt: IsoDateTime;
}

// ---------------------------------------------------------------------------
// Dashboard and reporting
// ---------------------------------------------------------------------------

export interface DashboardSnapshot {
  activeImprest: ImprestWithTotals | null;
  totalReceived: Kobo;
  totalSpent: Kobo;
  totalRetired: Kobo;
  outstandingBalance: Kobo;
  pendingRetirementCount: number;
  pendingApprovalCount: number;
  monthlySpending: MonthlySpendPoint[];
  categoryBreakdown: CategorySlice[];
  vendorAnalysis: VendorSpend[];
  largestExpenses: ExpenditureWithRelations[];
  recentTransactions: ExpenditureWithRelations[];
  receiptUploadStatus: ReceiptCoverage;
  generatedAt: IsoDateTime;
}

export interface MonthlySpendPoint {
  /** `YYYY-MM`. */
  month: string;
  label: string;
  amount: Kobo;
  transactionCount: number;
}

export interface CategorySlice {
  categoryId: Uuid;
  categoryName: string;
  amount: Kobo;
  percentage: number;
  transactionCount: number;
}

export interface VendorSpend {
  vendorId: Uuid | null;
  vendorName: string;
  amount: Kobo;
  transactionCount: number;
  lastTransactionDate: IsoDate;
}

export interface ReceiptCoverage {
  totalExpenditures: number;
  withReceipt: number;
  withoutReceipt: number;
  coveragePercentage: number;
  pendingUploadCount: number;
}

export interface ReportRequest {
  type: ReportType;
  from?: IsoDate;
  to?: IsoDate;
  financialYearId?: Uuid;
  departmentId?: Uuid;
  officerId?: Uuid;
  categoryId?: Uuid;
  vendorId?: Uuid;
  budgetHeadId?: Uuid;
  imprestId?: Uuid;
  status?: ImprestStatus;
  format?: ExportFormat;
}

export const ReportType = {
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  YEARLY: 'YEARLY',
  CUSTOM_RANGE: 'CUSTOM_RANGE',
  VENDOR: 'VENDOR',
  CATEGORY: 'CATEGORY',
  BUDGET: 'BUDGET',
  DEPARTMENT: 'DEPARTMENT',
  OFFICER: 'OFFICER',
  OUTSTANDING_IMPREST: 'OUTSTANDING_IMPREST',
  CLOSED_IMPREST: 'CLOSED_IMPREST',
  PENDING_RETIREMENT: 'PENDING_RETIREMENT',
  LATE_RETIREMENT: 'LATE_RETIREMENT',
} as const;
export type ReportType = (typeof ReportType)[keyof typeof ReportType];

export const ExportFormat = {
  PDF: 'PDF',
  EXCEL: 'EXCEL',
  CSV: 'CSV',
  JSON: 'JSON',
} as const;
export type ExportFormat = (typeof ExportFormat)[keyof typeof ExportFormat];

export interface ReportResult<TRow = Record<string, unknown>> {
  type: ReportType;
  title: string;
  subtitle: string | null;
  generatedAt: IsoDateTime;
  generatedBy: string;
  columns: ReportColumn[];
  rows: TRow[];
  totals: Record<string, Kobo | number> | null;
  meta: Record<string, unknown>;
}

export interface ReportColumn {
  key: string;
  label: string;
  type: 'text' | 'money' | 'number' | 'date' | 'percent';
  align?: 'left' | 'right' | 'center';
  width?: number;
}

// ---------------------------------------------------------------------------
// Search, filters, pagination
// ---------------------------------------------------------------------------

export interface SearchQuery {
  q?: string;
  vendor?: string;
  receiptNumber?: string;
  voucherNumber?: string;
  imprestNumber?: string;
  officerId?: Uuid;
  categoryId?: Uuid;
  budgetHeadId?: Uuid;
  departmentId?: Uuid;
  financialYearId?: Uuid;
  month?: string;
  status?: string;
  from?: IsoDate;
  to?: IsoDate;
  minAmount?: Kobo;
  maxAmount?: Kobo;
  hasReceipt?: boolean;
  includeDeleted?: boolean;
}

export interface PageRequest {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

// ---------------------------------------------------------------------------
// API envelope
// ---------------------------------------------------------------------------

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

// ---------------------------------------------------------------------------
// Offline synchronisation
// ---------------------------------------------------------------------------

export interface SyncMutation {
  /** Client-generated UUID; the server uses it as an idempotency key. */
  id: Uuid;
  entity: AuditEntity;
  entityId: Uuid;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  /** Version the client believed it was editing; `0` for creates. */
  baseVersion: number;
  createdAt: IsoDateTime;
  attempts: number;
  lastAttemptAt: IsoDateTime | null;
  lastError: string | null;
  state: SyncState;
  /** Captured at the moment the operator acted, not at replay time. */
  deviceLabel: string | null;
}

export interface SyncPushRequest {
  deviceId: string;
  deviceLabel: string;
  mutations: SyncMutation[];
}

export interface SyncPushResult {
  mutationId: Uuid;
  state: SyncState;
  entityId: Uuid;
  version: number | null;
  error: { code: string; message: string } | null;
  /** Present when `state === 'CONFLICT'` — the authoritative server record. */
  serverRecord: Record<string, unknown> | null;
}

export interface SyncPushResponse {
  results: SyncPushResult[];
  serverTime: IsoDateTime;
}

export interface SyncPullRequest {
  /** Server timestamp of the last successful pull; omit for a full bootstrap. */
  since?: IsoDateTime;
  entities?: AuditEntity[];
  limit?: number;
}

export interface SyncPullResponse {
  changes: SyncChangeSet;
  serverTime: IsoDateTime;
  hasMore: boolean;
  nextCursor: IsoDateTime | null;
}

export interface SyncChangeSet {
  users?: User[];
  departments?: Department[];
  budgetHeads?: BudgetHead[];
  voteCodes?: VoteCode[];
  costCentres?: CostCentre[];
  categories?: ExpenseCategory[];
  financialYears?: FinancialYear[];
  vendors?: Vendor[];
  imprests?: Imprest[];
  expenditures?: Expenditure[];
  attachments?: Attachment[];
  retirements?: Retirement[];
  approvals?: Approval[];
  notifications?: Notification[];
}

export interface SyncStatus {
  isOnline: boolean;
  lastPullAt: IsoDateTime | null;
  lastPushAt: IsoDateTime | null;
  pendingMutations: number;
  failedMutations: number;
  conflicts: number;
  pendingUploads: number;
  isSyncing: boolean;
}

export interface ConflictRecord {
  id: Uuid;
  mutationId: Uuid;
  entity: AuditEntity;
  entityId: Uuid;
  clientPayload: Record<string, unknown>;
  serverRecord: Record<string, unknown>;
  detectedAt: IsoDateTime;
  resolution: ConflictResolution | null;
  resolvedAt: IsoDateTime | null;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface OrganisationSettings {
  institutionName: string;
  officeName: string;
  unitName: string;
  address: string;
  logoAttachmentId: Uuid | null;
  logoDataUrl: string | null;
  currentFinancialYearId: Uuid | null;
  defaultRetirementDays: number;
  /** Blocks posting an expenditure that would exceed the imprest. */
  enforceOverspendBlock: boolean;
  /** Percentage of utilisation at which a BUDGET_EXHAUSTED alert fires. */
  budgetWarningThreshold: number;
  requireReceiptAbove: Kobo;
  vatRate: number;
  withholdingTaxRate: number;
  sessionIdleTimeoutMinutes: number;
  certificationText: string;
  approvalChain: WorkflowStage[];
}

export interface DocumentMeta {
  documentId: string;
  documentType: DocumentType;
  title: string;
  entityId: Uuid | null;
  issuedAt: IsoDateTime;
  issuedBy: string;
  /** SHA-256 of the rendered PDF, recorded so the QR page can prove integrity. */
  checksum: string;
  verifyUrl: string;
  pageCount: number;
  watermark: string | null;
}
