-- Migration: Add surgical complexity scoring columns to surgeries table
-- Supports the Surgical Complexity Score captured at the end of the post-operative note.

ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "complexityScore" INTEGER;
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "complexityClass" TEXT;
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "complexityData" TEXT;
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "complexityAssessedAt" TIMESTAMP(3);
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "complexityAssessedBy" TEXT;
