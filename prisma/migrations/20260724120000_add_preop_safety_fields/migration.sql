-- Compulsory pre-operative safety labs & risk assessments captured at booking.
-- Additive & idempotent (IF NOT EXISTS) so it is safe on both fresh and existing
-- databases and can be re-applied by the db-bootstrap baseline without error.
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "recentHb" DOUBLE PRECISION;
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "hbSampleAt" TIMESTAMP(3);
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "potassium" DOUBLE PRECISION;
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "sodium" DOUBLE PRECISION;
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "creatinine" DOUBLE PRECISION;
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "hbsAgStatus" TEXT;
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "hcvStatus" TEXT;
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "hivStatus" TEXT;
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "bloodPressureSystolic" INTEGER;
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "bloodPressureDiastolic" INTEGER;
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "bleedingRiskLevel" TEXT;
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "nutritionalStatusAtBooking" TEXT;
ALTER TABLE "surgeries" ADD COLUMN IF NOT EXISTS "pressureSoreRiskAtBooking" TEXT;
