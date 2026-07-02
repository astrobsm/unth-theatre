-- Migration: Add unit supervising consultant to surgeries table
-- Chosen from the surgeon list on the booking form; shown beside theatre/unit.

ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "supervisingConsultantId" TEXT;
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "supervisingConsultantName" TEXT;
