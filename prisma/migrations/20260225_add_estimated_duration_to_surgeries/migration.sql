-- Migration: Add estimatedDuration column to surgeries table
-- This column was defined in the Prisma schema but missing from the database

ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "estimatedDuration" INTEGER NOT NULL DEFAULT 60;
