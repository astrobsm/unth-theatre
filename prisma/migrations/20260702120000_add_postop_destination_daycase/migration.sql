-- Migration: Add post-operative destination + day-case flag to surgeries table
-- Captured on the surgery booking form to plan patient disposition after surgery.

ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "postOpDestination" TEXT;
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "isDayCase" BOOLEAN NOT NULL DEFAULT false;
