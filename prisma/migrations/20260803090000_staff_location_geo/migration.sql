-- Staff location: a coordinate on the availability snapshot, and a ping history.
--
-- The board could say WHO was available and WHEN they said so, but not WHERE,
-- so it could not answer the question an emergency asks: who is nearest.
--
-- A position is recorded only when a staff member publishes their own status.
-- There is no background tracking. Additive only; nothing is dropped.

-- CreateEnum
CREATE TYPE "StaffLocationSource" AS ENUM ('GPS', 'NETWORK', 'MANUAL');

-- CreateTable
CREATE TABLE "staff_location_pings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "locationLabel" TEXT,
    "note" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracyM" DOUBLE PRECISION,
    "source" "StaffLocationSource" NOT NULL DEFAULT 'MANUAL',
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_location_pings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_location_pings_userId_capturedAt_idx" ON "staff_location_pings"("userId", "capturedAt");

-- CreateIndex
CREATE INDEX "staff_location_pings_capturedAt_idx" ON "staff_location_pings"("capturedAt");

-- AddForeignKey
ALTER TABLE "staff_location_pings" ADD CONSTRAINT "staff_location_pings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

