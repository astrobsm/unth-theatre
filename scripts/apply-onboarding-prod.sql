-- Idempotent apply of pending onboarding migrations on a non-baselined production DB.

-- ---- 20260502120000_add_onboarding_submissions ----
CREATE TABLE IF NOT EXISTS "onboarding_submissions" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "department" TEXT,
    "staffCode" TEXT,
    "staffId" TEXT,
    "title" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "importedAt" TIMESTAMP(3),
    "importedBy" TEXT,
    "importError" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "onboarding_submissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "onboarding_submissions_status_idx"
    ON "onboarding_submissions"("status");
CREATE INDEX IF NOT EXISTS "onboarding_submissions_createdAt_idx"
    ON "onboarding_submissions"("createdAt");

-- ---- 20260502130000_extend_onboarding_roles ----
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PLUMBING_SUPERVISOR';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'WATER_SUPPLY_SUPERVISOR';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'EMERGENCY_LAB_SCIENTIST';

ALTER TABLE "onboarding_submissions"
  ADD COLUMN IF NOT EXISTS "isContractStaff" BOOLEAN NOT NULL DEFAULT false;
