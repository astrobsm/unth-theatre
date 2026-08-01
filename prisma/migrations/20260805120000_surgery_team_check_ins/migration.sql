-- Multidisciplinary team check-in for scheduled cases.
--
-- Note the columns that are NOT here: latitude and longitude. The check-in
-- sends a position, the server compares it against the hospital site, and the
-- coordinates are discarded. What is kept is a verdict and a distance rounded
-- to 10 m — a circle, not a point.
--
-- Additive only. Nothing existing is altered.

CREATE TYPE "TeamCheckInStatus" AS ENUM ('PRESENT', 'EN_ROUTE', 'DELAYED', 'UNAVAILABLE', 'REPLACED');

CREATE TYPE "CheckInFixVerdict" AS ENUM ('ON_SITE', 'OFF_SITE', 'IMPRECISE', 'NO_FIX');

CREATE TABLE "surgery_team_check_ins" (
    "id" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT,
    "roleOnCase" TEXT NOT NULL,
    "status" "TeamCheckInStatus" NOT NULL,
    "reason" TEXT,
    "replacementName" TEXT,
    "fixVerdict" "CheckInFixVerdict" NOT NULL DEFAULT 'NO_FIX',
    "distanceM" INTEGER,
    "deviceLabel" TEXT,
    "theatre" TEXT,
    "etaMinutes" INTEGER,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "surgery_team_check_ins_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "surgery_team_check_ins_surgeryId_status_idx" ON "surgery_team_check_ins"("surgeryId", "status");

CREATE INDEX "surgery_team_check_ins_checkedInAt_idx" ON "surgery_team_check_ins"("checkedInAt");

-- One current answer per person per case. Changing your mind updates it.
CREATE UNIQUE INDEX "surgery_team_check_ins_surgeryId_userId_key" ON "surgery_team_check_ins"("surgeryId", "userId");

-- surgeries.id is TEXT (verified against the live database, not assumed).
ALTER TABLE "surgery_team_check_ins" ADD CONSTRAINT "surgery_team_check_ins_surgeryId_fkey"
    FOREIGN KEY ("surgeryId") REFERENCES "surgeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
