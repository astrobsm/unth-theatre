-- Forced invite of a patient who was NOT cleared at the pre-operative visit.
ALTER TABLE "patient_call_ups" ADD COLUMN IF NOT EXISTS "forcedUncleared" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "patient_call_ups" ADD COLUMN IF NOT EXISTS "forcedUnclearedReason" TEXT;
ALTER TABLE "patient_call_ups" ADD COLUMN IF NOT EXISTS "forcedUnclearedById" TEXT;
ALTER TABLE "patient_call_ups" ADD COLUMN IF NOT EXISTS "forcedUnclearedByName" TEXT;
