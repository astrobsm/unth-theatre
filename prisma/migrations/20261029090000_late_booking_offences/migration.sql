-- Guarded throughout, like every migration on this project: a failed
-- migration blocks `migrate deploy` and therefore blocks every later
-- release, and Postgres has no IF NOT EXISTS for ADD CONSTRAINT.

-- CreateTable
CREATE TABLE IF NOT EXISTS "late_booking_offences" (
    "id" TEXT NOT NULL,
    "surgeryId" TEXT NOT NULL,
    "personId" TEXT,
    "personName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "subspecialty" TEXT NOT NULL,
    "offenceNumber" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "hoursLate" DOUBLE PRECISION,
    "consultantId" TEXT,
    "consultantName" TEXT,
    "disciplinaryQueryId" TEXT,
    "whatsappQueued" BOOLEAN NOT NULL DEFAULT false,
    "whatsappSkipped" TEXT,
    "recordedById" TEXT,
    "recordedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sync_version" INTEGER NOT NULL DEFAULT 0,
    "sync_origin" TEXT,
    "sync_hlc" TEXT,

    CONSTRAINT "late_booking_offences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One row per case. The ladder counts rows, so a duplicate would push a
-- person a rung further up for one offence — and the rung after the second
-- is a formal query.
CREATE UNIQUE INDEX IF NOT EXISTS "late_booking_offences_surgeryId_key"
  ON "late_booking_offences"("surgeryId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "late_booking_offences_personId_idx"
  ON "late_booking_offences"("personId");
CREATE INDEX IF NOT EXISTS "late_booking_offences_unit_idx"
  ON "late_booking_offences"("unit");
CREATE INDEX IF NOT EXISTS "late_booking_offences_createdAt_idx"
  ON "late_booking_offences"("createdAt");

-- Replicate: a case is chased from whichever node the theatre manager is
-- using, and "how many has this person had" must be the same answer on both.
SELECT sync_enable_table('late_booking_offences');
