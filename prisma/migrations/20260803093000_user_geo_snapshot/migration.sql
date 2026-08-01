-- The geo snapshot on the availability record.
--
-- Additive and all nullable: sharing a location is a choice, and refusing must
-- never stop somebody publishing that they are available.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "currentLatitude" DOUBLE PRECISION,
ADD COLUMN     "currentLongitude" DOUBLE PRECISION,
ADD COLUMN     "locationAccuracyM" DOUBLE PRECISION,
ADD COLUMN     "locationCapturedAt" TIMESTAMP(3),
ADD COLUMN     "locationSource" "StaffLocationSource";

