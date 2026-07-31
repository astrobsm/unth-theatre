-- Reconfigure the imprest module for the Nigerian Civil Service quarterly
-- standing imprest and its statutory retirement.
--
-- ADDITIVE ONLY. Existing columns and enum values are preserved; superseded
-- workflow stages and statuses are kept so any historical row stays readable.

-- CreateEnum
CREATE TYPE "Quarter" AS ENUM ('Q1', 'Q2', 'Q3', 'Q4');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WorkflowStage" ADD VALUE 'ACCOUNTS_REVIEW';
ALTER TYPE "WorkflowStage" ADD VALUE 'CHIEF_ACCOUNTANT_REVIEW';
ALTER TYPE "WorkflowStage" ADD VALUE 'MEDICAL_DIRECTOR_REVIEW';
ALTER TYPE "WorkflowStage" ADD VALUE 'COMPLETED';
ALTER TYPE "WorkflowStage" ADD VALUE 'RETURNED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RetirementStatus" ADD VALUE 'SUBMITTED';
ALTER TYPE "RetirementStatus" ADD VALUE 'UNDER_REVIEW';
ALTER TYPE "RetirementStatus" ADD VALUE 'RETURNED';
ALTER TYPE "RetirementStatus" ADD VALUE 'COMPLETED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AttachmentKind" ADD VALUE 'PAYMENT_VOUCHER';
ALTER TYPE "AttachmentKind" ADD VALUE 'DELIVERY_NOTE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ImprestRole" ADD VALUE 'CHIEF_ACCOUNTANT';
ALTER TYPE "ImprestRole" ADD VALUE 'MEDICAL_DIRECTOR';

-- AlterTable
ALTER TABLE "imprest_imprests" ADD COLUMN     "approvalDate" DATE,
ADD COLUMN     "eligibleForNextQuarter" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quarter" "Quarter",
ADD COLUMN     "retirementDate" DATE,
ADD COLUMN     "treasuryVoucherNumber" TEXT;

-- AlterTable
ALTER TABLE "imprest_expenditures" ADD COLUMN     "bankReference" TEXT,
ADD COLUMN     "chequeNumber" TEXT,
ADD COLUMN     "paymentVoucherNumber" TEXT;

-- AlterTable
ALTER TABLE "imprest_retirements" ADD COLUMN     "refundDue" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "imprest_audit_logs" ADD COLUMN     "reason" TEXT;

