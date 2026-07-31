-- ===========================================================================
-- Imprest Management and Retirement System — merged into the theatre database
-- ===========================================================================
-- Brings the standalone imprest monorepo (own Express API + own Postgres) into
-- this application as a set of modules sharing one database and one login.
--
-- ADDITIVE ONLY. 22 new tables and 16 new types; no existing table, column or
-- type is altered or dropped. Every new table is prefixed `imprest_` so it can
-- never be confused with the theatre's own 144 tables.
--
-- Identity: the imprest system's `users` and `sessions` tables are deliberately
-- NOT created. Imprest records reference the theatre `users` table directly (12
-- foreign keys), so staff have one account and one sign-in. The imprest DUTY
-- that drives the approval chain (cashier, account officer, chairman…) lives in
-- `imprest_role_assignments`, separate from the clinical role in `users.role` —
-- the cashier may well be a nurse.
--
-- Money is BIGINT kobo throughout; nothing is hard-deleted (deletedAt columns);
-- every synchronisable row carries `version` for optimistic concurrency.
-- ===========================================================================
-- CreateEnum
CREATE TYPE "ImprestStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PARTIALLY_RETIRED', 'FULLY_RETIRED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExpenditureStatus" AS ENUM ('DRAFT', 'POSTED', 'QUERIED', 'RETIRED', 'VOIDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'POS', 'CHEQUE');

-- CreateEnum
CREATE TYPE "WorkflowStage" AS ENUM ('PREPARED', 'SUBMITTED', 'ACCOUNT_OFFICER_REVIEW', 'CHAIRMAN_REVIEW', 'FINANCE_REVIEW', 'INTERNAL_AUDIT', 'APPROVED', 'CLOSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVE', 'REJECT', 'QUERY');

-- CreateEnum
CREATE TYPE "RetirementStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'QUERIED', 'APPROVED', 'CLOSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('RECEIPT', 'INVOICE', 'WAYBILL', 'QUOTATION', 'APPROVAL_LETTER', 'BANK_SLIP', 'OTHER');

-- CreateEnum
CREATE TYPE "SignatureKind" AS ENUM ('PREPARER', 'OFFICER', 'WITNESS', 'APPROVER', 'CERTIFIER');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('IMPREST_REGISTER', 'CASH_BOOK', 'EXPENSE_REGISTER', 'RETIREMENT_FORM', 'APPROVAL_SHEET', 'RECEIPT_REGISTER', 'SUMMARY_REPORT', 'VENDOR_REGISTER', 'AUDIT_REPORT', 'PAYMENT_VOUCHER');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'SOFT_DELETE', 'RESTORE', 'SUBMIT', 'APPROVE', 'REJECT', 'QUERY', 'CLOSE', 'CANCEL', 'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGE', 'TWO_FACTOR_ENABLED', 'TWO_FACTOR_DISABLED', 'EXPORT', 'PRINT', 'UPLOAD', 'SYNC', 'PERMISSION_DENIED');

-- CreateEnum
CREATE TYPE "AuditEntity" AS ENUM ('USER', 'IMPREST', 'EXPENDITURE', 'ATTACHMENT', 'RETIREMENT', 'APPROVAL', 'VENDOR', 'CATEGORY', 'BUDGET_HEAD', 'DEPARTMENT', 'SETTING', 'SESSION', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "ImprestNotificationType" AS ENUM ('PENDING_RETIREMENT', 'LATE_RETIREMENT', 'APPROVAL_NEEDED', 'RECEIPT_MISSING', 'BUDGET_EXHAUSTED', 'RETIREMENT_COMPLETED', 'EXPENDITURE_QUERIED', 'IMPREST_RECEIVED');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "SyncMutationState" AS ENUM ('PENDING', 'APPLIED', 'REJECTED', 'CONFLICT');

-- CreateEnum
CREATE TYPE "ConflictResolution" AS ENUM ('SERVER', 'CLIENT', 'MANUAL');

-- CreateEnum
CREATE TYPE "ImprestRole" AS ENUM ('ADMINISTRATOR', 'CHAIRMAN', 'ACCOUNT_OFFICER', 'CASHIER', 'INTERNAL_AUDITOR', 'HOSPITAL_MANAGEMENT', 'FINANCE', 'VIEW_ONLY_AUDITOR');

-- CreateTable
CREATE TABLE "imprest_departments" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "office" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,

    CONSTRAINT "imprest_departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imprest_budget_heads" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,

    CONSTRAINT "imprest_budget_heads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imprest_vote_codes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "budgetHeadId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,

    CONSTRAINT "imprest_vote_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imprest_cost_centres" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,

    CONSTRAINT "imprest_cost_centres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imprest_expense_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "parentId" UUID,
    "defaultBudgetHeadId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,

    CONSTRAINT "imprest_expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imprest_financial_years" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,

    CONSTRAINT "imprest_financial_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imprest_vendors" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "tin" TEXT,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,

    CONSTRAINT "imprest_vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imprest_signatures" (
    "id" UUID NOT NULL,
    "kind" "SignatureKind" NOT NULL,
    "imageData" TEXT NOT NULL,
    "signedByName" TEXT NOT NULL,
    "signedByDesignation" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedById" TEXT,
    "contentHash" TEXT NOT NULL,
    "expenditureId" UUID,
    "retirementId" UUID,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imprest_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imprest_imprests" (
    "id" UUID NOT NULL,
    "imprestNumber" TEXT NOT NULL,
    "voucherNumber" TEXT,
    "approvalNumber" TEXT,
    "financialYearId" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "office" TEXT,
    "dateApproved" DATE NOT NULL,
    "dateReceived" DATE,
    "amountApproved" BIGINT NOT NULL,
    "amountReceived" BIGINT NOT NULL DEFAULT 0,
    "receivingOfficerId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "fundingSource" TEXT,
    "budgetHeadId" UUID,
    "voteCodeId" UUID,
    "costCentreId" UUID,
    "expectedRetirementDate" DATE NOT NULL,
    "status" "ImprestStatus" NOT NULL DEFAULT 'DRAFT',
    "totalExpenditure" BIGINT NOT NULL DEFAULT 0,
    "totalRetired" BIGINT NOT NULL DEFAULT 0,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "closingRemarks" TEXT,
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,

    CONSTRAINT "imprest_imprests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imprest_expenditures" (
    "id" UUID NOT NULL,
    "expenseNumber" TEXT NOT NULL,
    "imprestId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "vendorId" UUID,
    "vendorName" TEXT NOT NULL,
    "vendorPhone" TEXT,
    "vendorAddress" TEXT,
    "vendorTin" TEXT,
    "description" TEXT NOT NULL,
    "purpose" TEXT,
    "categoryId" UUID NOT NULL,
    "subcategoryId" UUID,
    "quantityMilli" BIGINT NOT NULL DEFAULT 1000,
    "unitOfMeasure" TEXT,
    "unitCost" BIGINT NOT NULL,
    "totalCost" BIGINT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "voucherNumber" TEXT,
    "receiptNumber" TEXT,
    "invoiceNumber" TEXT,
    "receiptDate" DATE,
    "amountPaid" BIGINT NOT NULL,
    "vat" BIGINT NOT NULL DEFAULT 0,
    "withholdingTax" BIGINT NOT NULL DEFAULT 0,
    "netAmount" BIGINT NOT NULL,
    "budgetHeadId" UUID,
    "voteCodeId" UUID,
    "remarks" TEXT,
    "officerResponsibleId" TEXT NOT NULL,
    "witnessName" TEXT,
    "witnessDesignation" TEXT,
    "gpsLatitude" DOUBLE PRECISION,
    "gpsLongitude" DOUBLE PRECISION,
    "gpsAccuracy" DOUBLE PRECISION,
    "status" "ExpenditureStatus" NOT NULL DEFAULT 'POSTED',
    "queryReason" TEXT,
    "retirementId" UUID,
    "runningBalance" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,

    CONSTRAINT "imprest_expenditures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imprest_attachments" (
    "id" UUID NOT NULL,
    "kind" "AttachmentKind" NOT NULL DEFAULT 'RECEIPT',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "thumbnailStorageKey" TEXT,
    "expenditureId" UUID,
    "imprestId" UUID,
    "retirementId" UUID,
    "userId" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "capturedAt" TIMESTAMP(3),
    "ocrText" TEXT,
    "ocrProcessedAt" TIMESTAMP(3),
    "caption" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,

    CONSTRAINT "imprest_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imprest_retirements" (
    "id" UUID NOT NULL,
    "retirementNumber" TEXT NOT NULL,
    "imprestId" UUID NOT NULL,
    "amountReceived" BIGINT NOT NULL,
    "totalExpenditure" BIGINT NOT NULL,
    "balanceReturned" BIGINT NOT NULL,
    "receiptCount" INTEGER NOT NULL DEFAULT 0,
    "vendorCount" INTEGER NOT NULL DEFAULT 0,
    "expenditureCount" INTEGER NOT NULL DEFAULT 0,
    "returnReceiptNumber" TEXT,
    "retirementDate" DATE NOT NULL,
    "status" "RetirementStatus" NOT NULL DEFAULT 'DRAFT',
    "currentStage" "WorkflowStage" NOT NULL DEFAULT 'PREPARED',
    "preparedById" TEXT NOT NULL,
    "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedById" TEXT,
    "checkedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "certificationText" TEXT NOT NULL,
    "remarks" TEXT,
    "documentId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,

    CONSTRAINT "imprest_retirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imprest_approvals" (
    "id" UUID NOT NULL,
    "retirementId" UUID NOT NULL,
    "stage" "WorkflowStage" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "decision" "ApprovalDecision",
    "actorId" TEXT,
    "actorName" TEXT,
    "actorDesignation" TEXT,
    "actedAt" TIMESTAMP(3),
    "comments" TEXT,
    "signatureId" UUID,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,

    CONSTRAINT "imprest_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imprest_approval_signatories" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "stage" "WorkflowStage" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imprest_approval_signatories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imprest_generated_documents" (
    "id" UUID NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "entityId" UUID,
    "retirementId" UUID,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "pageCount" INTEGER NOT NULL DEFAULT 1,
    "watermark" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT,
    "issuedByName" TEXT,
    "verificationCount" INTEGER NOT NULL DEFAULT 0,
    "lastVerifiedAt" TIMESTAMP(3),

    CONSTRAINT "imprest_generated_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imprest_audit_logs" (
    "id" UUID NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entity" "AuditEntity" NOT NULL,
    "entityId" UUID,
    "entityLabel" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "actorRole" "ImprestRole",
    "changes" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "deviceLabel" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "recordedOffline" BOOLEAN NOT NULL DEFAULT false,
    "requestId" TEXT,
    "notes" TEXT,

    CONSTRAINT "imprest_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imprest_notifications" (
    "id" UUID NOT NULL,
    "type" "ImprestNotificationType" NOT NULL,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "entity" "AuditEntity",
    "entityId" UUID,
    "actionUrl" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dedupeKey" TEXT,

    CONSTRAINT "imprest_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imprest_sync_mutation_log" (
    "id" UUID NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "userId" TEXT NOT NULL,
    "entity" "AuditEntity" NOT NULL,
    "entityId" UUID NOT NULL,
    "operation" TEXT NOT NULL,
    "baseVersion" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "state" "SyncMutationState" NOT NULL DEFAULT 'PENDING',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "appliedVersion" INTEGER,
    "clientCreatedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "imprest_sync_mutation_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imprest_sync_conflicts" (
    "id" UUID NOT NULL,
    "mutationId" UUID NOT NULL,
    "entity" "AuditEntity" NOT NULL,
    "entityId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "clientPayload" JSONB NOT NULL,
    "serverRecord" JSONB NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolution" "ConflictResolution",
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "notes" TEXT,

    CONSTRAINT "imprest_sync_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imprest_document_sequences" (
    "id" UUID NOT NULL,
    "series" TEXT NOT NULL,
    "financialYearId" UUID NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imprest_document_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imprest_organisation_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "institutionName" TEXT NOT NULL DEFAULT 'UNIVERSITY OF NIGERIA TEACHING HOSPITAL',
    "officeName" TEXT NOT NULL DEFAULT 'OFFICE OF THE CHAIRMAN',
    "unitName" TEXT NOT NULL DEFAULT 'THEATRE COMMERCIALIZED UNIT',
    "address" TEXT NOT NULL DEFAULT 'Ituku-Ozalla, Enugu State, Nigeria',
    "logoAttachmentId" UUID,
    "currentFinancialYearId" UUID,
    "defaultRetirementDays" INTEGER NOT NULL DEFAULT 30,
    "enforceOverspendBlock" BOOLEAN NOT NULL DEFAULT true,
    "budgetWarningThreshold" DOUBLE PRECISION NOT NULL DEFAULT 90,
    "requireReceiptAbove" BIGINT NOT NULL DEFAULT 0,
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 7.5,
    "withholdingTaxRate" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "sessionIdleTimeoutMinutes" INTEGER NOT NULL DEFAULT 20,
    "certificationText" TEXT NOT NULL DEFAULT 'I certify that the above expenditure was incurred solely for the purpose stated, that the goods and services were received, and that the supporting receipts attached are genuine.',
    "approvalChain" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "imprest_organisation_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imprest_role_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ImprestRole" NOT NULL,
    "designation" TEXT,
    "departmentId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,

    CONSTRAINT "imprest_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "imprest_departments_code_key" ON "imprest_departments"("code");

-- CreateIndex
CREATE INDEX "imprest_departments_deletedAt_idx" ON "imprest_departments"("deletedAt");

-- CreateIndex
CREATE INDEX "imprest_departments_updatedAt_idx" ON "imprest_departments"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "imprest_budget_heads_code_key" ON "imprest_budget_heads"("code");

-- CreateIndex
CREATE INDEX "imprest_budget_heads_deletedAt_idx" ON "imprest_budget_heads"("deletedAt");

-- CreateIndex
CREATE INDEX "imprest_budget_heads_updatedAt_idx" ON "imprest_budget_heads"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "imprest_vote_codes_code_key" ON "imprest_vote_codes"("code");

-- CreateIndex
CREATE INDEX "imprest_vote_codes_budgetHeadId_idx" ON "imprest_vote_codes"("budgetHeadId");

-- CreateIndex
CREATE INDEX "imprest_vote_codes_deletedAt_idx" ON "imprest_vote_codes"("deletedAt");

-- CreateIndex
CREATE INDEX "imprest_vote_codes_updatedAt_idx" ON "imprest_vote_codes"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "imprest_cost_centres_code_key" ON "imprest_cost_centres"("code");

-- CreateIndex
CREATE INDEX "imprest_cost_centres_deletedAt_idx" ON "imprest_cost_centres"("deletedAt");

-- CreateIndex
CREATE INDEX "imprest_cost_centres_updatedAt_idx" ON "imprest_cost_centres"("updatedAt");

-- CreateIndex
CREATE INDEX "imprest_expense_categories_parentId_idx" ON "imprest_expense_categories"("parentId");

-- CreateIndex
CREATE INDEX "imprest_expense_categories_deletedAt_idx" ON "imprest_expense_categories"("deletedAt");

-- CreateIndex
CREATE INDEX "imprest_expense_categories_updatedAt_idx" ON "imprest_expense_categories"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "imprest_expense_categories_name_parentId_key" ON "imprest_expense_categories"("name", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "imprest_financial_years_label_key" ON "imprest_financial_years"("label");

-- CreateIndex
CREATE INDEX "imprest_financial_years_isCurrent_idx" ON "imprest_financial_years"("isCurrent");

-- CreateIndex
CREATE INDEX "imprest_financial_years_updatedAt_idx" ON "imprest_financial_years"("updatedAt");

-- CreateIndex
CREATE INDEX "imprest_vendors_name_idx" ON "imprest_vendors"("name");

-- CreateIndex
CREATE INDEX "imprest_vendors_deletedAt_idx" ON "imprest_vendors"("deletedAt");

-- CreateIndex
CREATE INDEX "imprest_vendors_updatedAt_idx" ON "imprest_vendors"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "imprest_vendors_name_phone_key" ON "imprest_vendors"("name", "phone");

-- CreateIndex
CREATE INDEX "imprest_signatures_expenditureId_idx" ON "imprest_signatures"("expenditureId");

-- CreateIndex
CREATE INDEX "imprest_signatures_retirementId_idx" ON "imprest_signatures"("retirementId");

-- CreateIndex
CREATE INDEX "imprest_signatures_signedById_idx" ON "imprest_signatures"("signedById");

-- CreateIndex
CREATE UNIQUE INDEX "imprest_imprests_imprestNumber_key" ON "imprest_imprests"("imprestNumber");

-- CreateIndex
CREATE INDEX "imprest_imprests_status_idx" ON "imprest_imprests"("status");

-- CreateIndex
CREATE INDEX "imprest_imprests_financialYearId_idx" ON "imprest_imprests"("financialYearId");

-- CreateIndex
CREATE INDEX "imprest_imprests_departmentId_idx" ON "imprest_imprests"("departmentId");

-- CreateIndex
CREATE INDEX "imprest_imprests_receivingOfficerId_idx" ON "imprest_imprests"("receivingOfficerId");

-- CreateIndex
CREATE INDEX "imprest_imprests_expectedRetirementDate_idx" ON "imprest_imprests"("expectedRetirementDate");

-- CreateIndex
CREATE INDEX "imprest_imprests_deletedAt_idx" ON "imprest_imprests"("deletedAt");

-- CreateIndex
CREATE INDEX "imprest_imprests_updatedAt_idx" ON "imprest_imprests"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "imprest_expenditures_expenseNumber_key" ON "imprest_expenditures"("expenseNumber");

-- CreateIndex
CREATE INDEX "imprest_expenditures_imprestId_date_idx" ON "imprest_expenditures"("imprestId", "date");

-- CreateIndex
CREATE INDEX "imprest_expenditures_status_idx" ON "imprest_expenditures"("status");

-- CreateIndex
CREATE INDEX "imprest_expenditures_vendorId_idx" ON "imprest_expenditures"("vendorId");

-- CreateIndex
CREATE INDEX "imprest_expenditures_categoryId_idx" ON "imprest_expenditures"("categoryId");

-- CreateIndex
CREATE INDEX "imprest_expenditures_budgetHeadId_idx" ON "imprest_expenditures"("budgetHeadId");

-- CreateIndex
CREATE INDEX "imprest_expenditures_officerResponsibleId_idx" ON "imprest_expenditures"("officerResponsibleId");

-- CreateIndex
CREATE INDEX "imprest_expenditures_retirementId_idx" ON "imprest_expenditures"("retirementId");

-- CreateIndex
CREATE INDEX "imprest_expenditures_receiptNumber_idx" ON "imprest_expenditures"("receiptNumber");

-- CreateIndex
CREATE INDEX "imprest_expenditures_voucherNumber_idx" ON "imprest_expenditures"("voucherNumber");

-- CreateIndex
CREATE INDEX "imprest_expenditures_date_idx" ON "imprest_expenditures"("date");

-- CreateIndex
CREATE INDEX "imprest_expenditures_deletedAt_idx" ON "imprest_expenditures"("deletedAt");

-- CreateIndex
CREATE INDEX "imprest_expenditures_updatedAt_idx" ON "imprest_expenditures"("updatedAt");

-- CreateIndex
CREATE INDEX "imprest_attachments_expenditureId_idx" ON "imprest_attachments"("expenditureId");

-- CreateIndex
CREATE INDEX "imprest_attachments_imprestId_idx" ON "imprest_attachments"("imprestId");

-- CreateIndex
CREATE INDEX "imprest_attachments_retirementId_idx" ON "imprest_attachments"("retirementId");

-- CreateIndex
CREATE INDEX "imprest_attachments_checksum_idx" ON "imprest_attachments"("checksum");

-- CreateIndex
CREATE INDEX "imprest_attachments_deletedAt_idx" ON "imprest_attachments"("deletedAt");

-- CreateIndex
CREATE INDEX "imprest_attachments_updatedAt_idx" ON "imprest_attachments"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "imprest_retirements_retirementNumber_key" ON "imprest_retirements"("retirementNumber");

-- CreateIndex
CREATE UNIQUE INDEX "imprest_retirements_documentId_key" ON "imprest_retirements"("documentId");

-- CreateIndex
CREATE INDEX "imprest_retirements_imprestId_idx" ON "imprest_retirements"("imprestId");

-- CreateIndex
CREATE INDEX "imprest_retirements_status_idx" ON "imprest_retirements"("status");

-- CreateIndex
CREATE INDEX "imprest_retirements_currentStage_idx" ON "imprest_retirements"("currentStage");

-- CreateIndex
CREATE INDEX "imprest_retirements_preparedById_idx" ON "imprest_retirements"("preparedById");

-- CreateIndex
CREATE INDEX "imprest_retirements_deletedAt_idx" ON "imprest_retirements"("deletedAt");

-- CreateIndex
CREATE INDEX "imprest_retirements_updatedAt_idx" ON "imprest_retirements"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "imprest_approvals_signatureId_key" ON "imprest_approvals"("signatureId");

-- CreateIndex
CREATE INDEX "imprest_approvals_retirementId_idx" ON "imprest_approvals"("retirementId");

-- CreateIndex
CREATE INDEX "imprest_approvals_stage_isCurrent_idx" ON "imprest_approvals"("stage", "isCurrent");

-- CreateIndex
CREATE INDEX "imprest_approvals_actorId_idx" ON "imprest_approvals"("actorId");

-- CreateIndex
CREATE INDEX "imprest_approvals_updatedAt_idx" ON "imprest_approvals"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "imprest_approvals_retirementId_stage_sequence_key" ON "imprest_approvals"("retirementId", "stage", "sequence");

-- CreateIndex
CREATE INDEX "imprest_approval_signatories_stage_idx" ON "imprest_approval_signatories"("stage");

-- CreateIndex
CREATE UNIQUE INDEX "imprest_approval_signatories_userId_stage_key" ON "imprest_approval_signatories"("userId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "imprest_generated_documents_documentId_key" ON "imprest_generated_documents"("documentId");

-- CreateIndex
CREATE INDEX "imprest_generated_documents_documentType_idx" ON "imprest_generated_documents"("documentType");

-- CreateIndex
CREATE INDEX "imprest_generated_documents_retirementId_idx" ON "imprest_generated_documents"("retirementId");

-- CreateIndex
CREATE INDEX "imprest_generated_documents_issuedAt_idx" ON "imprest_generated_documents"("issuedAt");

-- CreateIndex
CREATE INDEX "imprest_audit_logs_entity_entityId_idx" ON "imprest_audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "imprest_audit_logs_actorId_idx" ON "imprest_audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "imprest_audit_logs_occurredAt_idx" ON "imprest_audit_logs"("occurredAt");

-- CreateIndex
CREATE INDEX "imprest_audit_logs_action_idx" ON "imprest_audit_logs"("action");

-- CreateIndex
CREATE INDEX "imprest_notifications_recipientId_readAt_idx" ON "imprest_notifications"("recipientId", "readAt");

-- CreateIndex
CREATE INDEX "imprest_notifications_createdAt_idx" ON "imprest_notifications"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "imprest_notifications_dedupeKey_key" ON "imprest_notifications"("dedupeKey");

-- CreateIndex
CREATE INDEX "imprest_sync_mutation_log_deviceId_idx" ON "imprest_sync_mutation_log"("deviceId");

-- CreateIndex
CREATE INDEX "imprest_sync_mutation_log_userId_idx" ON "imprest_sync_mutation_log"("userId");

-- CreateIndex
CREATE INDEX "imprest_sync_mutation_log_entity_entityId_idx" ON "imprest_sync_mutation_log"("entity", "entityId");

-- CreateIndex
CREATE INDEX "imprest_sync_mutation_log_state_idx" ON "imprest_sync_mutation_log"("state");

-- CreateIndex
CREATE INDEX "imprest_sync_conflicts_entity_entityId_idx" ON "imprest_sync_conflicts"("entity", "entityId");

-- CreateIndex
CREATE INDEX "imprest_sync_conflicts_userId_idx" ON "imprest_sync_conflicts"("userId");

-- CreateIndex
CREATE INDEX "imprest_sync_conflicts_resolvedAt_idx" ON "imprest_sync_conflicts"("resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "imprest_document_sequences_series_financialYearId_key" ON "imprest_document_sequences"("series", "financialYearId");

-- CreateIndex
CREATE INDEX "imprest_role_assignments_userId_idx" ON "imprest_role_assignments"("userId");

-- CreateIndex
CREATE INDEX "imprest_role_assignments_role_idx" ON "imprest_role_assignments"("role");

-- CreateIndex
CREATE UNIQUE INDEX "imprest_role_assignments_userId_role_departmentId_key" ON "imprest_role_assignments"("userId", "role", "departmentId");

-- AddForeignKey
ALTER TABLE "imprest_vote_codes" ADD CONSTRAINT "imprest_vote_codes_budgetHeadId_fkey" FOREIGN KEY ("budgetHeadId") REFERENCES "imprest_budget_heads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_expense_categories" ADD CONSTRAINT "imprest_expense_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "imprest_expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_expense_categories" ADD CONSTRAINT "imprest_expense_categories_defaultBudgetHeadId_fkey" FOREIGN KEY ("defaultBudgetHeadId") REFERENCES "imprest_budget_heads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_signatures" ADD CONSTRAINT "imprest_signatures_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_signatures" ADD CONSTRAINT "imprest_signatures_expenditureId_fkey" FOREIGN KEY ("expenditureId") REFERENCES "imprest_expenditures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_signatures" ADD CONSTRAINT "imprest_signatures_retirementId_fkey" FOREIGN KEY ("retirementId") REFERENCES "imprest_retirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_imprests" ADD CONSTRAINT "imprest_imprests_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "imprest_financial_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_imprests" ADD CONSTRAINT "imprest_imprests_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "imprest_departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_imprests" ADD CONSTRAINT "imprest_imprests_receivingOfficerId_fkey" FOREIGN KEY ("receivingOfficerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_imprests" ADD CONSTRAINT "imprest_imprests_budgetHeadId_fkey" FOREIGN KEY ("budgetHeadId") REFERENCES "imprest_budget_heads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_imprests" ADD CONSTRAINT "imprest_imprests_voteCodeId_fkey" FOREIGN KEY ("voteCodeId") REFERENCES "imprest_vote_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_imprests" ADD CONSTRAINT "imprest_imprests_costCentreId_fkey" FOREIGN KEY ("costCentreId") REFERENCES "imprest_cost_centres"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_expenditures" ADD CONSTRAINT "imprest_expenditures_imprestId_fkey" FOREIGN KEY ("imprestId") REFERENCES "imprest_imprests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_expenditures" ADD CONSTRAINT "imprest_expenditures_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "imprest_vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_expenditures" ADD CONSTRAINT "imprest_expenditures_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "imprest_expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_expenditures" ADD CONSTRAINT "imprest_expenditures_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "imprest_expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_expenditures" ADD CONSTRAINT "imprest_expenditures_budgetHeadId_fkey" FOREIGN KEY ("budgetHeadId") REFERENCES "imprest_budget_heads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_expenditures" ADD CONSTRAINT "imprest_expenditures_voteCodeId_fkey" FOREIGN KEY ("voteCodeId") REFERENCES "imprest_vote_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_expenditures" ADD CONSTRAINT "imprest_expenditures_officerResponsibleId_fkey" FOREIGN KEY ("officerResponsibleId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_expenditures" ADD CONSTRAINT "imprest_expenditures_retirementId_fkey" FOREIGN KEY ("retirementId") REFERENCES "imprest_retirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_attachments" ADD CONSTRAINT "imprest_attachments_expenditureId_fkey" FOREIGN KEY ("expenditureId") REFERENCES "imprest_expenditures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_attachments" ADD CONSTRAINT "imprest_attachments_imprestId_fkey" FOREIGN KEY ("imprestId") REFERENCES "imprest_imprests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_attachments" ADD CONSTRAINT "imprest_attachments_retirementId_fkey" FOREIGN KEY ("retirementId") REFERENCES "imprest_retirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_attachments" ADD CONSTRAINT "imprest_attachments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_retirements" ADD CONSTRAINT "imprest_retirements_imprestId_fkey" FOREIGN KEY ("imprestId") REFERENCES "imprest_imprests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_retirements" ADD CONSTRAINT "imprest_retirements_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_retirements" ADD CONSTRAINT "imprest_retirements_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_retirements" ADD CONSTRAINT "imprest_retirements_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_approvals" ADD CONSTRAINT "imprest_approvals_retirementId_fkey" FOREIGN KEY ("retirementId") REFERENCES "imprest_retirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_approvals" ADD CONSTRAINT "imprest_approvals_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_approvals" ADD CONSTRAINT "imprest_approvals_signatureId_fkey" FOREIGN KEY ("signatureId") REFERENCES "imprest_signatures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_approval_signatories" ADD CONSTRAINT "imprest_approval_signatories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_generated_documents" ADD CONSTRAINT "imprest_generated_documents_retirementId_fkey" FOREIGN KEY ("retirementId") REFERENCES "imprest_retirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_audit_logs" ADD CONSTRAINT "imprest_audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_notifications" ADD CONSTRAINT "imprest_notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_document_sequences" ADD CONSTRAINT "imprest_document_sequences_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "imprest_financial_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_role_assignments" ADD CONSTRAINT "imprest_role_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imprest_role_assignments" ADD CONSTRAINT "imprest_role_assignments_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "imprest_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

