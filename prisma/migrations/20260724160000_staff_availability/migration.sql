-- Live staff-availability snapshot on the user (P3 workforce board). Additive & idempotent.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "availabilityStatus" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "availabilityNote" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "currentLocation" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "availabilityUpdatedAt" TIMESTAMP(3);
