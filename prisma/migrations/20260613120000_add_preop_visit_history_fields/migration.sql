-- Add patient clinical history fields to pre-operative visits.
ALTER TABLE "pre_operative_visits" ADD COLUMN IF NOT EXISTS "allergies" TEXT;
ALTER TABLE "pre_operative_visits" ADD COLUMN IF NOT EXISTS "previousSurgeries" TEXT;
ALTER TABLE "pre_operative_visits" ADD COLUMN IF NOT EXISTS "comorbidities" TEXT;
