-- ============================================================================
-- Surgery estimate & costing
-- ----------------------------------------------------------------------------
-- Additive only. Two tables, three enums, three new ChargeKind values.
--
-- Hand-filtered from `prisma migrate diff`, which also wanted to DROP the
-- sync_version / sync_origin / sync_hlc columns: those are added by the sync
-- capture triggers and are deliberately absent from the Prisma schema, so
-- Prisma reads them as drift. Applying the generated file unedited would have
-- removed them and broken replication.
--
-- No new price master. Prices come from `tariffs`, which is already
-- effective-dated and stores kobo; bundles come from `surgical_packs`.
-- ============================================================================

-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'ISSUED', 'REVISED', 'EXPIRED', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "EstimateSection" AS ENUM ('PREOP_INVESTIGATION', 'SURGICAL_MATERIAL', 'ANAESTHESIA_MATERIAL', 'SURGICAL_FEE', 'ANAESTHESIA_FEE', 'THEATRE', 'ADMISSION', 'POSTOP_MEDICATION', 'POSTOP_MONITORING', 'OTHER_POSTOP');

-- CreateEnum
CREATE TYPE "EstimateAdmissionType" AS ENUM ('DAY_CASE', 'INPATIENT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChargeKind" ADD VALUE 'ADMISSION';

ALTER TYPE "ChargeKind" ADD VALUE 'NURSING';

ALTER TYPE "ChargeKind" ADD VALUE 'POSTOP_SERVICE';

-- CreateTable
CREATE TABLE "surgery_estimates" (
    "id" TEXT NOT NULL,
    "estimateNumber" TEXT NOT NULL,
    "surgeryId" TEXT,
    "patientId" TEXT NOT NULL,
    "status" "EstimateStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "revisionReason" TEXT,
    "patientName" TEXT NOT NULL,
    "folderNumber" TEXT,
    "procedureName" TEXT NOT NULL,
    "diagnosis" TEXT,
    "subspecialty" TEXT,
    "unit" TEXT,
    "surgeonName" TEXT,
    "anaesthesiaType" TEXT,
    "surgeryType" TEXT,
    "plannedDate" TIMESTAMP(3),
    "admissionType" "EstimateAdmissionType" NOT NULL DEFAULT 'INPATIENT',
    "expectedStayDays" INTEGER NOT NULL DEFAULT 0,
    "subtotalKobo" INTEGER NOT NULL DEFAULT 0,
    "depositKobo" INTEGER NOT NULL DEFAULT 0,
    "totalKobo" INTEGER NOT NULL DEFAULT 0,
    "validUntil" TIMESTAMP(3),
    "preparedById" TEXT,
    "preparedByName" TEXT,
    "approvedById" TEXT,
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "sharedToPhone" TEXT,
    "sharedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "surgery_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "surgery_estimate_lines" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "section" "EstimateSection" NOT NULL,
    "kind" "ChargeKind" NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'each',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceKobo" INTEGER NOT NULL,
    "totalKobo" INTEGER NOT NULL,
    "tariffId" TEXT,
    "inventoryItemId" TEXT,
    "surgicalPackId" TEXT,
    "investigationId" TEXT,
    "medicationName" TEXT,
    "priceEffectiveFrom" TIMESTAMP(3),
    "frequencyPerDay" INTEGER,
    "durationDays" INTEGER,
    "priceOverridden" BOOLEAN NOT NULL DEFAULT false,
    "originalUnitPriceKobo" INTEGER,
    "overrideReason" TEXT,
    "overriddenById" TEXT,
    "overriddenByName" TEXT,
    "overriddenAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "surgery_estimate_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "surgery_estimates_estimateNumber_key" ON "surgery_estimates"("estimateNumber");

-- CreateIndex
CREATE INDEX "surgery_estimates_patientId_createdAt_idx" ON "surgery_estimates"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "surgery_estimates_surgeryId_idx" ON "surgery_estimates"("surgeryId");

-- CreateIndex
CREATE INDEX "surgery_estimates_status_createdAt_idx" ON "surgery_estimates"("status", "createdAt");

-- CreateIndex
CREATE INDEX "surgery_estimate_lines_estimateId_section_sortOrder_idx" ON "surgery_estimate_lines"("estimateId", "section", "sortOrder");

-- CreateIndex
CREATE INDEX "surgery_estimate_lines_kind_idx" ON "surgery_estimate_lines"("kind");

-- AddForeignKey
ALTER TABLE "surgery_estimate_lines" ADD CONSTRAINT "surgery_estimate_lines_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "surgery_estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
